export class AudioManager {
  constructor() {
    this.ctx = null;
    this.isMuted = false;
    this.bgmPlaying = false;
    this.bgmEnabled = true; // Auto-play audio & BGM by default
    this.engineGain = null;
    this.engineOsc = null;
    this.engineSub = null;
    this.screechGain = null;
    this.screechSource = null;
    this.bgmInterval = null;
    this.speechVoices = [];
    this.bgmAudio = null;
    this.bgmAudioPlaying = false;
    this.bgmBaseVolume = 0.34;
    this.voiceBuffers = {};
    this.voiceLoading = false;
    this.activeVoiceSource = null;
    this.activeVoiceAudio = null;
    this.customSpeechTimer = null;
    this.bgmDuckTimer = null;

    // Preload new energetic synthwave racing BGM (cache-busted, zero fallback to old teaser track)
    if (typeof window !== 'undefined' && typeof Audio !== 'undefined') {
      try {
        this.bgmAudio = new Audio('/assets/audio/bgm.wav?v=20261113');
        this.bgmAudio.loop = true;
        this.bgmAudio.volume = this.bgmBaseVolume;
        this.bgmAudio.addEventListener('error', () => {
          this.bgmAudio = null;
          if (this.bgmEnabled && !this.bgmPlaying) {
            this.startSynthBgm();
          }
        });
      } catch (e) {}
    }

    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.onvoiceschanged = () => {
        try {
          this.speechVoices = window.speechSynthesis.getVoices();
        } catch (e) {}
      };
      try {
        this.speechVoices = window.speechSynthesis.getVoices();
      } catch (e) {}
    }
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
      return;
    }
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    try {
      this.ctx = new AudioContext();
      this.setupEngineSynth();
      this.setupScreechSynth();
      this.preloadVoiceClips();
    } catch (e) {
      console.warn('AudioContext init error:', e);
    }
  }

  unlockMobileAudio() {
    this.init();
    if (!this.ctx) return;
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().then(() => {
        if (this.bgmEnabled && !this.bgmPlaying) {
          this.startBgm();
        }
      }).catch(() => {});
    }

    // 1. Mobile unlock: kick a 1-sample silent Web Audio buffer
    try {
      const buffer = this.ctx.createBuffer(1, 1, 22050);
      const source = this.ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(this.ctx.destination);
      source.start(0);
    } catch (e) {}

    // 2. Play a brief inaudible tone to force iOS WebKit WebAudio render pipeline alive
    try {
      const dummyOsc = this.ctx.createOscillator();
      const dummyGain = this.ctx.createGain();
      dummyGain.gain.setValueAtTime(0.0001, this.ctx.currentTime);
      dummyOsc.connect(dummyGain);
      dummyGain.connect(this.ctx.destination);
      dummyOsc.start(this.ctx.currentTime);
      dummyOsc.stop(this.ctx.currentTime + 0.05);
    } catch (e) {}

    // 3. iOS Silent Switch Bypass: Play HTML5 Audio element synchronously inside touch event
    if (this.bgmAudio && !this.isMuted && this.bgmEnabled) {
      this.bgmAudio.play().then(() => {
        this.bgmAudioPlaying = true;
        this.bgmPlaying = true;
      }).catch(() => {
        // Fallback to synth BGM if HTML5 audio fails
        if (this.bgmEnabled && !this.bgmPlaying) {
          this.startBgm();
        }
      });
    }

    // Prime speech synthesis on mobile user interaction
    if (typeof window !== 'undefined' && 'speechSynthesis' in window && !this.speechPrimed) {
      try {
        const u = new SpeechSynthesisUtterance('');
        u.volume = 0;
        window.speechSynthesis.speak(u);
        this.speechPrimed = true;
      } catch (e) {}
    }

    // Auto-start BGM if enabled
    if (this.bgmEnabled && !this.bgmPlaying) {
      this.startBgm();
    }
    this.preloadVoiceClips();
  }

  playClick() {
    if (!this.ensureActive()) return;
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const now = this.ctx.currentTime;
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, now);
      osc.frequency.exponentialRampToValueAtTime(1320, now + 0.04);
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.06);
    } catch (e) {}
  }

  ensureActive() {
    if (this.isMuted) return false;
    if (!this.ctx) {
      this.init();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return !!this.ctx;
  }

  setupEngineSynth() {
    if (!this.ctx) return;

    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.setValueAtTime(0.0, this.ctx.currentTime);
    this.engineGain.connect(this.ctx.destination);

    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.setValueAtTime(60, this.ctx.currentTime);

    this.engineSub = this.ctx.createOscillator();
    this.engineSub.type = 'triangle';
    this.engineSub.frequency.setValueAtTime(30, this.ctx.currentTime);

    this.engineFilter = this.ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.setValueAtTime(800, this.ctx.currentTime);

    this.engineOsc.connect(this.engineFilter);
    this.engineSub.connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain);

    this.engineOsc.start();
    this.engineSub.start();
  }

  setupScreechSynth() {
    if (!this.ctx) return;

    const bufferSize = this.ctx.sampleRate * 2;
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }

    const whiteNoise = this.ctx.createBufferSource();
    whiteNoise.buffer = noiseBuffer;
    whiteNoise.loop = true;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1400, this.ctx.currentTime);
    filter.Q.setValueAtTime(4.0, this.ctx.currentTime);

    this.screechGain = this.ctx.createGain();
    this.screechGain.gain.setValueAtTime(0, this.ctx.currentTime);

    whiteNoise.connect(filter);
    filter.connect(this.screechGain);
    this.screechGain.connect(this.ctx.destination);

    whiteNoise.start();
  }

  stopEngine() {
    if (!this.ctx) return;
    try {
      const now = this.ctx.currentTime;
      if (this.engineGain) {
        this.engineGain.gain.cancelScheduledValues(now);
        this.engineGain.gain.setTargetAtTime(0.0, now, 0.05);
      }
      if (this.screechGain) {
        this.screechGain.gain.cancelScheduledValues(now);
        this.screechGain.gain.setTargetAtTime(0.0, now, 0.05);
      }
    } catch (e) {}
  }

  updateEngine(speedKmh, throttle, isDrifting, isBoost) {
    if (!this.ensureActive()) return;

    const baseFreq = 55;
    const speedPitch = (speedKmh / 280) * 190;
    const throttlePitch = (throttle > 0 ? 30 : 0);
    const boostPitch = (isBoost ? 60 : 0);

    const freq = baseFreq + speedPitch + throttlePitch + boostPitch;

    this.engineOsc.frequency.setTargetAtTime(freq, this.ctx.currentTime, 0.05);
    this.engineSub.frequency.setTargetAtTime(freq * 0.5, this.ctx.currentTime, 0.05);

    const targetVol = Math.min(0.26, 0.06 + (speedKmh / 280) * 0.16 + (throttle > 0 ? 0.05 : 0));
    this.engineGain.gain.setTargetAtTime(targetVol, this.ctx.currentTime, 0.08);

    if (isDrifting && speedKmh > 20) {
      this.screechGain.gain.setTargetAtTime(0.18, this.ctx.currentTime, 0.05);
    } else {
      this.screechGain.gain.setTargetAtTime(0.0, this.ctx.currentTime, 0.05);
    }
  }

  playCountdown(pitch = 440, duration = 0.22, step = null) {
    if (!this.ensureActive()) return;
    const now = this.ctx.currentTime;
    const isGo = step === 'GO' || pitch >= 800;

    try {
      // Aggressive motorsport starting-light power chord synth
      const freqs = isGo ? [pitch, pitch * 1.498, pitch * 0.5] : [pitch, pitch * 0.5];
      freqs.forEach((f, idx) => {
        const osc = this.ctx.createOscillator();
        const filter = this.ctx.createBiquadFilter();
        const gain = this.ctx.createGain();
        osc.type = idx === freqs.length - 1 ? 'triangle' : 'sawtooth';
        osc.frequency.setValueAtTime(f, now);
        if (isGo) {
          osc.frequency.exponentialRampToValueAtTime(f * 1.06, now + duration);
        }

        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(isGo ? 3200 : 1800, now);

        const peakVol = isGo ? (idx === 0 ? 0.24 : 0.16) : (idx === 0 ? 0.20 : 0.15);
        gain.gain.setValueAtTime(0.001, now);
        gain.gain.linearRampToValueAtTime(peakVol, now + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + duration + 0.02);
      });
    } catch (e) {}

    // Fierce countdown voiceover ("สาม!" / "สอง!" / "หนึ่ง!" / "ไปเลย! ซิ่งให้ยับ!")
    if (step === 'GO' || pitch >= 800) {
      this.playVoiceClip('cd_go');
    } else if (step === 3 || step === '3') {
      this.playVoiceClip('cd_3');
    } else if (step === 2 || step === '2') {
      this.playVoiceClip('cd_2');
    } else if (step === 1 || step === '1') {
      this.playVoiceClip('cd_1');
    }
  }

  playCountdownTick(seconds = 5) {
    if (!this.ensureActive()) return;
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      // Pitch rises as time counts down (5 -> 480Hz, 1 -> 880Hz)
      const freq = 480 + (5 - Math.max(1, seconds)) * 100;
      osc.frequency.setValueAtTime(freq, this.ctx.currentTime);

      gain.gain.setValueAtTime(0.24, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.12);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.13);
    } catch (e) {}
  }

  playBoostSound() {
    if (!this.ensureActive()) return;
    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const filter = this.ctx.createBiquadFilter();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(160, now);
      osc.frequency.exponentialRampToValueAtTime(520, now + 0.3);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(1200, now);
      filter.frequency.exponentialRampToValueAtTime(2400, now + 0.3);

      // Softer, pleasant volume: 0.10 instead of 0.35
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.10, now + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.38);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.38);
    } catch (e) {}
  }

  playCollision() {
    this.playCollisionThud();
  }

  playCollisionThud() {
    if (!this.ensureActive()) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';

    osc.frequency.setValueAtTime(140, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(30, this.ctx.currentTime + 0.2);

    gain.gain.setValueAtTime(0.4, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.2);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.2);
  }

  playItemPickup() {
    if (!this.ensureActive()) return;
    const notes = [587.33, 880];
    notes.forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const startTime = this.ctx.currentTime + idx * 0.08;
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, startTime);
      gain.gain.setValueAtTime(0.25, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.15);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(startTime);
      osc.stop(startTime + 0.15);
    });
  }

  playSlip() {
    if (!this.ensureActive()) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(600, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(150, this.ctx.currentTime + 0.35);
    gain.gain.setValueAtTime(0.3, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.35);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.35);
  }

  playMissileShoot() {
    if (!this.ensureActive()) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(300, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(700, this.ctx.currentTime + 0.25);
    gain.gain.setValueAtTime(0.25, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.25);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.25);
  }

  playGridIntroSwoosh() {
    if (!this.ensureActive()) return;
    const now = this.ctx.currentTime;

    try {
      // Sweeping whoosh noise filter
      const bufferSize = Math.floor(this.ctx.sampleRate * 1.8);
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * 0.7;
      }
      const noise = this.ctx.createBufferSource();
      noise.buffer = buffer;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.Q.value = 3.5;
      filter.frequency.setValueAtTime(260, now);
      filter.frequency.exponentialRampToValueAtTime(3400, now + 1.1);
      filter.frequency.exponentialRampToValueAtTime(320, now + 1.8);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.01, now);
      gain.gain.linearRampToValueAtTime(0.3, now + 0.7);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 1.8);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(this.ctx.destination);
      noise.start(now);
      noise.stop(now + 1.8);

      // Low frequency sub-rumble riser
      const sub = this.ctx.createOscillator();
      const subGain = this.ctx.createGain();
      sub.type = 'sawtooth';
      sub.frequency.setValueAtTime(55, now);
      sub.frequency.exponentialRampToValueAtTime(140, now + 1.4);
      subGain.gain.setValueAtTime(0.18, now);
      subGain.gain.exponentialRampToValueAtTime(0.001, now + 1.8);
      sub.connect(subGain);
      subGain.connect(this.ctx.destination);
      sub.start(now);
      sub.stop(now + 1.8);
    } catch (e) {}
  }

  playLeaderboardRankPop(step = 0, total = 7, isPlayer = false) {
    if (!this.ensureActive()) return;
    try {
      const now = this.ctx.currentTime;
      // Rising pitch as we climb closer to 1st place
      const ratio = total > 1 ? Math.min(1, Math.max(0, step / (total - 1))) : 0.5;
      const baseFreq = 360 + ratio * 360; // 360Hz up to 720Hz

      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = isPlayer ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(baseFreq, now);
      osc.frequency.exponentialRampToValueAtTime(baseFreq * 1.25, now + 0.08);

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(isPlayer ? 0.22 : 0.13, now + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, now + (isPlayer ? 0.24 : 0.15));

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + (isPlayer ? 0.24 : 0.15));

      // Extra bright harmonic chirp for the player
      if (isPlayer) {
        const osc2 = this.ctx.createOscillator();
        const gain2 = this.ctx.createGain();
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(baseFreq * 1.8, now + 0.03);
        gain2.gain.setValueAtTime(0.001, now + 0.03);
        gain2.gain.linearRampToValueAtTime(0.12, now + 0.05);
        gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.26);
        osc2.connect(gain2);
        gain2.connect(this.ctx.destination);
        osc2.start(now + 0.03);
        osc2.stop(now + 0.26);
      }
    } catch (e) {}
  }

  playVictoryChime() {
    if (!this.ensureActive()) return;
    const now = this.ctx.currentTime;

    // Debounce: prevent overlapping crowd noises or rapid repeating
    if (this.lastVictoryChimeTime && now - this.lastVictoryChimeTime < 2.5) {
      return;
    }
    this.lastVictoryChimeTime = now;

    // 1. Triumphant Fanfare Arpeggio Chords
    const chords = [
      { time: 0.00, notes: [523.25, 659.25] },          // C5, E5
      { time: 0.16, notes: [587.33, 698.46] },          // D5, F5
      { time: 0.32, notes: [659.25, 783.99] },          // E5, G5
      { time: 0.48, notes: [783.99, 987.77] },          // G5, B5
      { time: 0.68, notes: [1046.50, 1318.51, 1567.98] } // Grand C6 Chord!
    ];

    chords.forEach(c => {
      c.notes.forEach(freq => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const startTime = now + c.time;
        const dur = (c.time >= 0.68) ? 1.6 : 0.35;

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(freq, startTime);

        gain.gain.setValueAtTime(0.001, startTime);
        gain.gain.exponentialRampToValueAtTime(0.18, startTime + 0.04);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + dur);

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(2600, startTime);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(startTime);
        osc.stop(startTime + dur);
      });
    });

    // 2. Crowd Cheer Noise Synth with clean cutoff
    try {
      const bufferSize = Math.floor(this.ctx.sampleRate * 2.2);
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.7));
      }

      const noise = this.ctx.createBufferSource();
      noise.buffer = buffer;

      const bandpass = this.ctx.createBiquadFilter();
      bandpass.type = 'bandpass';
      bandpass.frequency.setValueAtTime(950, now + 0.6);
      bandpass.Q.setValueAtTime(1.4, now + 0.6);

      const cheerGain = this.ctx.createGain();
      cheerGain.gain.setValueAtTime(0.001, now + 0.6);
      cheerGain.gain.exponentialRampToValueAtTime(0.20, now + 0.85);
      cheerGain.gain.exponentialRampToValueAtTime(0.001, now + 2.45);
      cheerGain.gain.setValueAtTime(0.0, now + 2.5);

      noise.connect(bandpass);
      bandpass.connect(cheerGain);
      cheerGain.connect(this.ctx.destination);

      noise.start(now + 0.6);
      noise.stop(now + 2.5);
    } catch (e) {}
  }

  toggleBgm() {
    this.init();
    if (this.bgmPlaying) {
      this.stopBgm();
    } else {
      this.startBgm();
    }
    return this.bgmPlaying;
  }

  startBgm() {
    this.bgmEnabled = true;
    if (this.isMuted) return;

    if (typeof document !== 'undefined') {
      const btn = document.getElementById('btn-toggle-bgm');
      if (btn) btn.textContent = '🎵 เพลง: เปิด (คลิกเพื่อปิด)';
    }

    // Try HTML5 Audio background music first
    if (this.bgmAudio) {
      this.bgmAudio.play().then(() => {
        this.bgmAudioPlaying = true;
        this.bgmPlaying = true;
      }).catch(() => {
        // Fallback to Web Audio synth
        this.startSynthBgm();
      });
      return;
    }

    this.startSynthBgm();
  }

  startSynthBgm() {
    if (!this.ensureActive() || this.bgmPlaying) return;
    this.bgmPlaying = true;

    if (this.bgmInterval) clearInterval(this.bgmInterval);

    // 132 BPM E-minor arcade synthwave groove (bass + arpeggio + tight kick)
    const bassNotes = [82.41, 82.41, 164.81, 164.81, 65.41, 65.41, 130.81, 130.81, 73.42, 73.42, 146.83, 146.83, 61.74, 61.74, 123.47, 146.83];
    const arpNotes = [329.63, 392.00, 493.88, 392.00, 261.63, 329.63, 392.00, 329.63, 293.66, 369.99, 440.00, 369.99, 246.94, 293.66, 369.99, 493.88];
    let step = 0;

    this.bgmInterval = setInterval(() => {
      if (!this.bgmPlaying || this.isMuted || !this.ctx) return;
      const now = this.ctx.currentTime;
      const idx = step % bassNotes.length;

      try {
        // Driving Bass pulse
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const filter = this.ctx.createBiquadFilter();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(bassNotes[idx], now);
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(idx % 4 === 2 ? 1200 : 780, now);
        gain.gain.setValueAtTime(0.09, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.13);

        // Sparkling arcade arpeggio
        const arp = this.ctx.createOscillator();
        const aGain = this.ctx.createGain();
        arp.type = 'triangle';
        arp.frequency.setValueAtTime(arpNotes[idx], now);
        aGain.gain.setValueAtTime(0.045, now);
        aGain.gain.exponentialRampToValueAtTime(0.001, now + 0.10);
        arp.connect(aGain);
        aGain.connect(this.ctx.destination);
        arp.start(now);
        arp.stop(now + 0.11);

        // Kick thump every 2 steps
        if (idx % 2 === 0) {
          const kOsc = this.ctx.createOscillator();
          const kGain = this.ctx.createGain();
          kOsc.type = 'sine';
          kOsc.frequency.setValueAtTime(130, now);
          kOsc.frequency.exponentialRampToValueAtTime(42, now + 0.09);
          kGain.gain.setValueAtTime(0.18, now);
          kGain.gain.exponentialRampToValueAtTime(0.001, now + 0.11);
          kOsc.connect(kGain);
          kGain.connect(this.ctx.destination);
          kOsc.start(now);
          kOsc.stop(now + 0.12);
        }
      } catch (e) {}

      step++;
    }, 114);
  }

  stopBgm() {
    this.bgmEnabled = false;
    this.bgmPlaying = false;
    this.bgmAudioPlaying = false;
    if (this.bgmAudio) {
      try { this.bgmAudio.pause(); } catch (e) {}
    }
    if (this.bgmInterval) {
      clearInterval(this.bgmInterval);
      this.bgmInterval = null;
    }
    if (typeof document !== 'undefined') {
      const btn = document.getElementById('btn-toggle-bgm');
      if (btn) btn.textContent = '🎵 เพลง: ปิด (คลิกเพื่อเปิด)';
    }
  }

  toggleMute() {
    this.isMuted = !this.isMuted;
    if (this.bgmAudio) {
      this.bgmAudio.muted = this.isMuted;
    }
    if (this.isMuted) {
      this.stopEngine();
      this.stopBgm();
      this.stopSpeech();
    } else {
      this.unlockMobileAudio();
      if (this.bgmEnabled) this.startBgm();
    }
    if (this.engineGain && this.ctx) {
      this.engineGain.gain.setValueAtTime(this.isMuted ? 0 : 0.1, this.ctx.currentTime);
    }
    return this.isMuted;
  }

  preloadVoiceClips() {
    if (this.voiceLoading || !this.ctx || typeof fetch === 'undefined') return;
    this.voiceLoading = true;
    const keys = [
      'rival_classic', 'rival_shrek', 'rival_ceo', 'rival_rally',
      'rival_bikini', 'rival_valkyrie', 'player_pole', 'pole_prefix',
      'cd_3', 'cd_2', 'cd_1', 'cd_go', 'final_lap', 'victory'
    ];
    keys.forEach(key => {
      fetch(`/assets/audio/voice/${key}.wav?v=20261113`)
        .then(res => res.ok ? res.arrayBuffer() : null)
        .then(buf => {
          if (!buf || !this.ctx) return null;
          return this.ctx.decodeAudioData(buf);
        })
        .then(decoded => {
          if (decoded) this.voiceBuffers[key] = decoded;
        })
        .catch(() => {});
    });
  }

  duckBgm(durMs = 1800) {
    if (!this.bgmAudio) return;
    if (this.bgmDuckTimer) clearTimeout(this.bgmDuckTimer);
    this.bgmAudio.volume = 0.16;
    this.bgmDuckTimer = setTimeout(() => {
      if (this.bgmAudio) this.bgmAudio.volume = this.bgmBaseVolume;
      this.bgmDuckTimer = null;
    }, durMs);
  }

  stopActiveVoiceClip() {
    if (this.customSpeechTimer) {
      clearTimeout(this.customSpeechTimer);
      this.customSpeechTimer = null;
    }
    if (this.activeVoiceSource) {
      try { this.activeVoiceSource.stop(); } catch (e) {}
      this.activeVoiceSource = null;
    }
    if (this.activeVoiceAudio) {
      try {
        this.activeVoiceAudio.pause();
        this.activeVoiceAudio.currentTime = 0;
      } catch (e) {}
      this.activeVoiceAudio = null;
    }
  }

  playVoiceClip(key) {
    if (this.isMuted || !key) return false;
    this.stopActiveVoiceClip();

    const buffer = this.voiceBuffers[key];
    if (buffer && this.ensureActive()) {
      try {
        const now = this.ctx.currentTime;
        const src = this.ctx.createBufferSource();
        src.buffer = buffer;

        const chestFilter = this.ctx.createBiquadFilter();
        chestFilter.type = 'lowshelf';
        chestFilter.frequency.setValueAtTime(200, now);
        chestFilter.gain.setValueAtTime(3.5, now);

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(1.08, now);

        src.connect(chestFilter);
        chestFilter.connect(gain);
        gain.connect(this.ctx.destination);
        src.start(now);
        this.activeVoiceSource = src;
        src.onended = () => {
          if (this.activeVoiceSource === src) this.activeVoiceSource = null;
        };
        this.duckBgm(Math.max(900, Math.round(buffer.duration * 1000)));
        return true;
      } catch (e) {}
    }

    // Fallback: direct HTML5 Audio stream (also decodes cleanly on mobile Safari)
    if (typeof Audio !== 'undefined') {
      try {
        const audio = new Audio(`/assets/audio/voice/${key}.wav?v=20261113`);
        audio.volume = 0.96;
        this.activeVoiceAudio = audio;
        audio.play().catch(() => {});
        this.duckBgm(2100);
        return true;
      } catch (e) {}
    }
    return false;
  }

  speakFierceTTS(text) {
    if (typeof window === 'undefined' || !('speechSynthesis' in window) || this.isMuted) return;
    try {
      window.speechSynthesis.cancel();
      const allVoices = (this.speechVoices && this.speechVoices.length > 0)
        ? this.speechVoices
        : window.speechSynthesis.getVoices();

      // Priority 1: Fierce deep Thai male voices (Pattara, Niwat, Sarawut, etc.)
      const isThai = (v) => {
        const lang = (v.lang || '').toLowerCase();
        const vname = (v.name || '').toLowerCase();
        return lang.startsWith('th') || vname.includes('thai') || vname.includes('ไทย');
      };
      const isFemaleHint = (vname) => vname.includes('premwadee') || vname.includes('achara') || vname.includes('female') || vname.includes('หญิง');
      const isMaleHint = (vname) => vname.includes('pattara') || vname.includes('niwat') || vname.includes('sarawut') || vname.includes('kittipong') || vname.includes('male') || vname.includes('ชาย');

      const thaiMaleVoice = allVoices.find(v => isThai(v) && isMaleHint(v.name.toLowerCase()));
      const thaiNeutralVoice = allVoices.find(v => isThai(v) && !isFemaleHint(v.name.toLowerCase()));
      const thaiVoice = thaiMaleVoice || thaiNeutralVoice || allVoices.find(isThai);

      const utterance = new SpeechSynthesisUtterance(text);
      if (thaiVoice) {
        utterance.voice = thaiVoice;
        utterance.lang = 'th-TH';
      } else {
        const enMaleVoice = allVoices.find(v => {
          const vname = (v.name || '').toLowerCase();
          return v.lang.startsWith('en') && (vname.includes('david') || vname.includes('mark') || vname.includes('guy') || vname.includes('male'));
        }) || allVoices.find(v => v.lang.startsWith('en'));
        if (enMaleVoice) utterance.voice = enMaleVoice;
        utterance.lang = 'en-US';
      }

      // Low baritone authority + snappy fierce racing broadcast cadence (avoid falsy 0.0 quirk)
      utterance.pitch = 0.12;
      utterance.rate = 1.15;
      utterance.volume = 1.0;

      this.duckBgm(2400);
      window.speechSynthesis.speak(utterance);
    } catch (e) {
      console.warn('Speech synthesis notice:', e);
    }
  }

  announceRacer(name, isPlayer = false, pos = 1) {
    if (this.isMuted) return;
    this.stopSpeech();

    const rawName = name || '';
    let cleanName = rawName
      .replace(/\s*\([^)]*\)/g, '')
      .replace(/#\d+/g, '')
      .replace(/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]/gu, '')
      .trim();

    // 1. Check built-in rivals first -> play fierce DSP-processed studio voice clip
    if (!isPlayer) {
      const rivalClipMap = [
        ['วัลคิรี', 'rival_valkyrie'],
        ['บิกินี่', 'rival_bikini'],
        ['แรลลี่', 'rival_rally'],
        ['อสูร', 'rival_rally'],
        ['เสี่ย', 'rival_ceo'],
        ['ชเร็ค', 'rival_shrek'],
        ['คลาสสิก', 'rival_classic']
      ];
      const matched = rivalClipMap.find(([kw]) => cleanName.includes(kw));
      if (matched && this.playVoiceClip(matched[1])) {
        return;
      }
    }

    // 2. Player at pole with default name -> fierce studio full intro
    if (isPlayer && (!cleanName || cleanName === 'นักซิ่งอาชิ')) {
      if (this.playVoiceClip('player_pole')) return;
    }

    // 3. Custom player / multiplayer racers -> fierce studio prefix + aggressive live speech
    if (!cleanName && isPlayer) {
      cleanName = 'นักซิ่งอาชิ';
    }
    const thaiNumberWords = {
      1: 'หนึ่ง', 2: 'สอง', 3: 'สาม', 4: 'สี่',
      5: 'ห้า', 6: 'หก', 7: 'เจ็ด', 8: 'แปด'
    };
    const numWord = thaiNumberWords[pos] || `${pos}`;

    if (isPlayer || pos === 1) {
      if (cleanName && this.playVoiceClip('pole_prefix')) {
        this.customSpeechTimer = setTimeout(() => {
          this.speakFierceTTS(`${cleanName}! เหยียบให้มิด!`);
        }, 1450);
        return;
      }
      this.speakFierceTTS(`อันดับที่หนึ่ง! โพลโพซิชัน! ${cleanName}! เหยียบให้มิด!`);
      return;
    }

    const fiercePrefixes = [
      'ปีศาจทางโค้ง!',
      'สายซิ่งจอมโหด!',
      'พร้อมบวกทุกโค้ง!',
      'คู่ปรับตัวอันตราย!'
    ];
    const hype = fiercePrefixes[pos % fiercePrefixes.length];
    this.speakFierceTTS(`${hype} อันดับที่${numWord}! ${cleanName}!`);
  }

  playFinalLapAnnounce() {
    this.playVoiceClip('final_lap');
  }

  playVictoryAnnounce() {
    setTimeout(() => {
      this.playVoiceClip('victory');
    }, 520);
  }

  playAnnouncerImpact(isPlayer = false) {
    if (!this.ensureActive()) return;
    const now = this.ctx.currentTime;

    try {
      // 1. Deep Sub-Bass Drop (88Hz -> 20Hz chest slam)
      const subOsc = this.ctx.createOscillator();
      const subGain = this.ctx.createGain();
      subOsc.type = 'sine';
      subOsc.frequency.setValueAtTime(isPlayer ? 105 : 85, now);
      subOsc.frequency.exponentialRampToValueAtTime(20, now + 0.52);

      subGain.gain.setValueAtTime(0.001, now);
      subGain.gain.linearRampToValueAtTime(isPlayer ? 0.58 : 0.48, now + 0.018);
      subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.58);

      subOsc.connect(subGain);
      subGain.connect(this.ctx.destination);
      subOsc.start(now);
      subOsc.stop(now + 0.60);

      // 2. Cinema Sawtooth Braam Impact (gritty low-brass bite)
      const braamOsc = this.ctx.createOscillator();
      const braamFilter = this.ctx.createBiquadFilter();
      const braamGain = this.ctx.createGain();
      braamOsc.type = 'sawtooth';
      braamOsc.frequency.setValueAtTime(isPlayer ? 65 : 55, now);
      braamOsc.frequency.exponentialRampToValueAtTime(34, now + 0.45);

      braamFilter.type = 'lowpass';
      braamFilter.Q.setValueAtTime(3.2, now);
      braamFilter.frequency.setValueAtTime(950, now);
      braamFilter.frequency.exponentialRampToValueAtTime(160, now + 0.45);

      braamGain.gain.setValueAtTime(0.001, now);
      braamGain.gain.linearRampToValueAtTime(isPlayer ? 0.28 : 0.22, now + 0.02);
      braamGain.gain.exponentialRampToValueAtTime(0.001, now + 0.48);

      braamOsc.connect(braamFilter);
      braamFilter.connect(braamGain);
      braamGain.connect(this.ctx.destination);
      braamOsc.start(now);
      braamOsc.stop(now + 0.50);

      // 3. Sharp Metallic Broadcast Whip Transition Noise
      const nLen = Math.floor(this.ctx.sampleRate * 0.22);
      const nBuf = this.ctx.createBuffer(1, nLen, this.ctx.sampleRate);
      const nData = nBuf.getChannelData(0);
      for (let i = 0; i < nLen; i++) nData[i] = Math.random() * 2 - 1;
      const noise = this.ctx.createBufferSource();
      noise.buffer = nBuf;
      const nBp = this.ctx.createBiquadFilter();
      nBp.type = 'bandpass';
      nBp.Q.setValueAtTime(2.5, now);
      nBp.frequency.setValueAtTime(420, now);
      nBp.frequency.exponentialRampToValueAtTime(3200, now + 0.20);
      const nGain = this.ctx.createGain();
      nGain.gain.setValueAtTime(0.001, now);
      nGain.gain.linearRampToValueAtTime(0.16, now + 0.04);
      nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
      noise.connect(nBp);
      nBp.connect(nGain);
      nGain.connect(this.ctx.destination);
      noise.start(now);
      noise.stop(now + 0.23);
    } catch (e) {}
  }

  stopSpeech() {
    this.stopActiveVoiceClip();
    if (this.bgmAudio && !this.isMuted) {
      if (this.bgmDuckTimer) clearTimeout(this.bgmDuckTimer);
      this.bgmAudio.volume = this.bgmBaseVolume;
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch (e) {}
    }
  }
}
