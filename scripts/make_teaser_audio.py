import numpy as np
import wave
import subprocess
import os

sr = 44100
duration = 10.0
total_samples = int(sr * duration)
t = np.linspace(0, duration, total_samples, endpoint=False)

left = np.zeros(total_samples, dtype=np.float32)
right = np.zeros(total_samples, dtype=np.float32)

# 1. EDM / Phonk Synth Beat (135 BPM)
bpm = 135
beat_dur = 60.0 / bpm  # ~0.444s per beat
num_beats = int(duration / beat_dur)

# 808 Kick Drum on beats
for b in range(num_beats):
    t_start = b * beat_dur
    if t_start >= 8.6: break # fade for final logo
    idx_start = int(t_start * sr)
    k_len = int(0.28 * sr)
    if idx_start + k_len > total_samples:
        k_len = total_samples - idx_start
    kt = np.linspace(0, 0.28, k_len, endpoint=False)
    # Pitch drop 140Hz -> 38Hz
    freq = 38 + 102 * np.exp(-kt * 22)
    phase = 2 * np.pi * np.cumsum(freq) / sr
    env = np.exp(-kt * 10)
    kick = np.sin(phase) * env * 0.45
    # Add slight saturation distortion
    kick = np.tanh(kick * 1.5) * 0.4
    left[idx_start:idx_start+k_len] += kick
    right[idx_start:idx_start+k_len] += kick

# Snare / Clap on off-beats (1, 3, 5, 7...)
for b in range(1, num_beats, 2):
    t_start = b * beat_dur
    if t_start >= 8.5: break
    idx_start = int(t_start * sr)
    s_len = int(0.18 * sr)
    if idx_start + s_len > total_samples:
        s_len = total_samples - idx_start
    noise = np.random.uniform(-1, 1, s_len) * np.exp(-np.linspace(0, 1, s_len) * 14) * 0.22
    tone = np.sin(2 * np.pi * 180 * np.linspace(0, 0.18, s_len)) * np.exp(-np.linspace(0, 1, s_len) * 20) * 0.18
    snare = noise + tone
    left[idx_start:idx_start+s_len] += snare * 0.8
    right[idx_start:idx_start+s_len] += snare * 0.8

# Hi-hat on 16th notes
for h in range(num_beats * 4):
    t_start = h * (beat_dur / 4)
    if t_start >= 8.5: break
    idx_start = int(t_start * sr)
    h_len = int(0.04 * sr)
    if idx_start + h_len > total_samples:
        h_len = total_samples - idx_start
    hat = np.random.uniform(-1, 1, h_len) * np.exp(-np.linspace(0, 1, h_len) * 45) * 0.08
    left[idx_start:idx_start+h_len] += hat * (0.7 if h % 2 == 0 else 0.9)
    right[idx_start:idx_start+h_len] += hat * (0.9 if h % 2 == 0 else 0.7)

# Bassline Arpeggio (driving electro synth)
bass_notes = [55, 55, 65.4, 73.4, 55, 55, 82.4, 73.4, 55, 65.4, 82.4, 98.0]
note_step = beat_dur / 2  # 8th notes
for n in range(int(duration / note_step)):
    t_start = n * note_step
    if t_start >= 8.5: break
    idx_start = int(t_start * sr)
    n_len = int(note_step * 0.88 * sr)
    if idx_start + n_len > total_samples:
        n_len = total_samples - idx_start
    nt = np.linspace(0, note_step * 0.88, n_len, endpoint=False)
    freq = bass_notes[n % len(bass_notes)]
    # Sawtooth waveform approximation
    saw = 0.5 - (nt * freq % 1.0)
    sub = np.sin(2 * np.pi * freq * nt)
    note_sound = (saw * 0.6 + sub * 0.4) * np.exp(-nt * 3.5) * 0.25
    left[idx_start:idx_start+n_len] += note_sound
    right[idx_start:idx_start+n_len] += note_sound

# 2. Engine Acceleration Rev (0.0s - 4.5s)
eng_idx_end = int(4.5 * sr)
eng_t = t[:eng_idx_end]
eng_freq = 55 + (eng_t / 4.5) ** 1.8 * 220
eng_phase = 2 * np.pi * np.cumsum(eng_freq) / sr
eng_saw = (0.5 - (eng_phase / (2 * np.pi) % 1.0)) * 0.18 * np.minimum(1.0, eng_t * 2.0)
left[:eng_idx_end] += eng_saw * 0.85
right[:eng_idx_end] += eng_saw * 0.85

# 3. Tire Screech during Drift (2.2s - 4.5s)
drift_start = int(2.2 * sr)
drift_end = int(4.5 * sr)
drift_len = drift_end - drift_start
dt_arr = np.linspace(0, 1, drift_len)
screech_noise = np.random.uniform(-1, 1, drift_len)
# Bandpass filtering simulation
screech_tone1 = np.sin(2 * np.pi * 1250 * np.linspace(0, 2.3, drift_len)) * screech_noise
screech_tone2 = np.sin(2 * np.pi * 2100 * np.linspace(0, 2.3, drift_len)) * screech_noise
screech_env = np.sin(dt_arr * np.pi) * 0.16
screech = (screech_tone1 * 0.6 + screech_tone2 * 0.4) * screech_env
left[drift_start:drift_end] += screech * 0.9
right[drift_start:drift_end] += screech * 0.7

# 4. Turbo & Nitro Ignition Blast (4.6s - 7.5s)
nitro_start = int(4.6 * sr)
nitro_end = int(7.5 * sr)
nitro_len = nitro_end - nitro_start
nitro_t = np.linspace(0, 2.9, nitro_len)
# Whoosh riser
whoosh_freq = 180 + (nitro_t / 2.9) ** 2 * 680
whoosh_phase = 2 * np.pi * np.cumsum(whoosh_freq) / sr
nitro_whoosh = np.sin(whoosh_phase) * np.minimum(1.0, nitro_t * 5) * np.exp(-nitro_t * 0.5) * 0.20
# Jet flame rumble noise
flame_rumble = np.random.uniform(-1, 1, nitro_len) * np.sin(2 * np.pi * 85 * nitro_t) * 0.18
nitro_sound = nitro_whoosh + flame_rumble
left[nitro_start:nitro_end] += nitro_sound
right[nitro_start:nitro_end] += nitro_sound

# 5. Victory Fanfare Chords at Finish Line (7.5s - 9.0s)
fanfare_chords = [
    (7.50, 0.20, [523.25, 659.25]),          # C5, E5
    (7.70, 0.20, [587.33, 698.46]),          # D5, F5
    (7.90, 0.20, [659.25, 783.99]),          # E5, G5
    (8.15, 0.85, [1046.50, 1318.51, 1567.98]) # Grand C6
]
for start_sec, dur, freqs in fanfare_chords:
    i_s = int(start_sec * sr)
    i_l = int(dur * sr)
    if i_s + i_l > total_samples: i_l = total_samples - i_s
    ct = np.linspace(0, dur, i_l)
    chord_sig = np.zeros(i_l, dtype=np.float32)
    for f in freqs:
        chord_sig += np.sin(2 * np.pi * f * ct) * np.exp(-ct * (3.5 if dur < 0.3 else 1.8))
    chord_sig = chord_sig * (0.22 / len(freqs))
    left[i_s:i_s+i_l] += chord_sig
    right[i_s:i_s+i_l] += chord_sig

# Crowd cheer noise at finish line (7.7s - 10.0s)
crowd_start = int(7.7 * sr)
crowd_len = total_samples - crowd_start
crowd_noise = np.random.uniform(-1, 1, crowd_len)
crowd_env = np.linspace(0, 1, crowd_len) * np.exp(-np.linspace(0, 1, crowd_len) * 1.5) * 0.16
left[crowd_start:] += crowd_noise * crowd_env * 0.8
right[crowd_start:] += crowd_noise * crowd_env * 0.8

# 6. Deep Cinematic Sub-Bass Impact on Title Drop (8.6s - 10.0s)
sub_start = int(8.6 * sr)
sub_len = total_samples - sub_start
sub_t = np.linspace(0, duration - 8.6, sub_len)
sub_freq = 75 * np.exp(-sub_t * 2.2) + 24
sub_phase = 2 * np.pi * np.cumsum(sub_freq) / sr
sub_drop = np.sin(sub_phase) * np.exp(-sub_t * 1.8) * 0.55
# Saturate impact
sub_drop = np.tanh(sub_drop * 1.6) * 0.5
left[sub_start:] += sub_drop
right[sub_start:] += sub_drop

# 7. Mix in Ashi's Meme Voice ("แย่แล้วตื่นเร็วทุกคน!") at 0.4s
voice_path = 'video/ashi_voice.wav'
if os.path.exists(voice_path):
    try:
        with wave.open(voice_path, 'rb') as vw:
            v_n = vw.getnframes()
            v_sr = vw.getframerate()
            v_ch = vw.getnchannels()
            v_bytes = vw.readframes(v_n)
            v_data = np.frombuffer(v_bytes, dtype=np.int16).astype(np.float32) / 32768.0
            if v_ch == 2:
                v_left = v_data[0::2]
                v_right = v_data[1::2]
            else:
                v_left = v_data
                v_right = v_data

            # Resample if needed
            if v_sr != sr:
                from scipy.signal import resample
                new_len = int(len(v_left) * sr / v_sr)
                v_left = resample(v_left, new_len)
                v_right = resample(v_right, new_len)

            v_start = int(0.4 * sr)
            mix_len = min(len(v_left), total_samples - v_start)
            # Boost voice clarity
            v_vol = 0.55
            left[v_start:v_start+mix_len] += v_left[:mix_len] * v_vol
            right[v_start:v_start+mix_len] += v_right[:mix_len] * v_vol
    except Exception as e:
        print('Voice mix notice:', e)

# Master Limiter & Normalization
peak = max(np.max(np.abs(left)), np.max(np.abs(right)), 0.001)
left = np.tanh(left / peak * 0.95)
right = np.tanh(right / peak * 0.95)

# Convert to 16-bit PCM stereo
left_pcm = (left * 32767).astype(np.int16)
right_pcm = (right * 32767).astype(np.int16)
stereo_pcm = np.empty((total_samples * 2,), dtype=np.int16)
stereo_pcm[0::2] = left_pcm
stereo_pcm[1::2] = right_pcm

out_wav = 'video/teaser_soundtrack.wav'
with wave.open(out_wav, 'wb') as ow:
    ow.setnchannels(2)
    ow.setsampwidth(2)
    ow.setframerate(sr)
    ow.writeframes(stereo_pcm.tobytes())

print(f"Generated soundtrack: {out_wav} ({os.path.getsize(out_wav)} bytes)")

