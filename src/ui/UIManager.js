import confetti from 'canvas-confetti';
import { CARS } from '../data/carsData.js';
import { SKINS } from '../data/skinsData.js';
import { TRACKS, DIFFICULTIES } from '../data/tracksData.js';

export class UIManager {
  constructor(game) {
    this.game = game;

    // View Elements
    this.viewMenu = document.getElementById('view-menu');
    this.viewStageSelect = document.getElementById('view-stage-select');
    this.viewGarage = document.getElementById('view-garage');
    this.viewLobby = document.getElementById('view-lobby');
    this.viewVictory = document.getElementById('view-victory');

    // Selected Player Customization
    this.currentCarIndex = 0;
    this.currentSkinId = 'green_dress';
    this.currentColor = '#ff2255';
    this.playerName = localStorage.getItem('ashilane_name') || 'นักซิ่งอาชิ';

    // Stage Selection State
    this.selectedTrackId = 'beach';
    this.selectedDifficulty = 'normal';
    this.selectedLaps = 3;
    this.targetGameMode = 'gp';

    this.initEventListeners();
    this.populateGarageSkins();
    this.updateGarageStats();
    this.populateStageCards();
  }

  initEventListeners() {
    // Menu buttons
    document.getElementById('btn-play-single')?.addEventListener('click', () => {
      this.openStageSelect('gp');
    });

    document.getElementById('btn-play-timeattack')?.addEventListener('click', () => {
      this.openStageSelect('timeattack');
    });

    document.getElementById('btn-open-garage')?.addEventListener('click', () => {
      this.showView('garage');
      this.game.enterGaragePreview(
        CARS[this.currentCarIndex].id,
        this.getSelectedSkinFile(),
        this.currentColor
      );
    });

    document.getElementById('btn-open-create-room')?.addEventListener('click', () => {
      this.showCreateRoomPrompt();
    });

    document.getElementById('btn-open-join-room')?.addEventListener('click', () => {
      this.showJoinRoomPrompt();
    });

    document.getElementById('btn-toggle-bgm')?.addEventListener('click', () => {
      const isPlaying = this.game.audio.toggleBgm();
      const btn = document.getElementById('btn-toggle-bgm');
      if (btn) btn.textContent = isPlaying ? '🎵 เพลง: เปิด' : '🔇 เพลง: ปิด';
    });

    // Stage Select controls
    document.getElementById('btn-stage-back')?.addEventListener('click', () => {
      this.showView('menu');
    });

    document.getElementById('btn-start-selected-race')?.addEventListener('click', () => {
      this.game.startSinglePlayer(
        this.targetGameMode,
        this.selectedTrackId,
        this.selectedDifficulty,
        this.selectedLaps
      );
    });

    // Difficulty buttons in Stage Select
    document.querySelectorAll('.diff-pill').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const diff = btn.dataset.diff;
        if (diff) {
          this.selectedDifficulty = diff;
          document.querySelectorAll('.diff-pill').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
        }
      });
    });

    // Laps buttons in Stage Select
    document.querySelectorAll('.laps-pill').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const laps = parseInt(btn.dataset.laps || '3');
        this.selectedLaps = laps;
        document.querySelectorAll('.laps-pill').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });

    // Garage Controls
    document.getElementById('garage-car-prev')?.addEventListener('click', () => {
      this.currentCarIndex = (this.currentCarIndex - 1 + CARS.length) % CARS.length;
      this.onGarageCarChanged();
    });

    document.getElementById('garage-car-next')?.addEventListener('click', () => {
      this.currentCarIndex = (this.currentCarIndex + 1) % CARS.length;
      this.onGarageCarChanged();
    });

    document.getElementById('btn-garage-back')?.addEventListener('click', () => {
      this.showView('menu');
      this.game.exitGaragePreview();
    });

    // Color pickers in garage
    const colorInput = document.getElementById('garage-color-input');
    if (colorInput) {
      colorInput.value = this.currentColor;
      colorInput.addEventListener('input', (e) => {
        this.currentColor = e.target.value;
        this.game.updateGarageColor(this.currentColor);
      });
    }

    // Color swatches
    document.querySelectorAll('.color-swatch').forEach(swatch => {
      swatch.addEventListener('click', (e) => {
        const color = e.target.dataset.color;
        if (color) {
          this.currentColor = color;
          if (colorInput) colorInput.value = color;
          this.game.updateGarageColor(color);
        }
      });
    });

    // Player name input
    const nameInput = document.getElementById('player-name-input');
    if (nameInput) {
      nameInput.value = this.playerName;
      nameInput.addEventListener('input', (e) => {
        this.playerName = e.target.value.trim() || 'นักซิ่งอาชิ';
        localStorage.setItem('ashilane_name', this.playerName);
      });
    }

    // Lobby buttons
    document.getElementById('btn-copy-code')?.addEventListener('click', () => {
      const code = document.getElementById('lobby-room-code')?.textContent;
      if (code) {
        navigator.clipboard.writeText(code);
        alert(`คัดลอกรหัสห้องแล้ว: ${code}`);
      }
    });

    document.getElementById('btn-copy-link')?.addEventListener('click', () => {
      const code = document.getElementById('lobby-room-code')?.textContent;
      if (code) {
        const url = `${window.location.origin}${window.location.pathname}?room=${code}`;
        navigator.clipboard.writeText(url);
        alert(`คัดลอกลิงก์ชวนเพื่อนแล้ว!\n${url}`);
      }
    });

    document.getElementById('btn-start-race')?.addEventListener('click', () => {
      const laps = parseInt(document.getElementById('lobby-laps-select')?.value || '3');
      const aiCount = parseInt(document.getElementById('lobby-ai-select')?.value || '2');
      const trackId = document.getElementById('lobby-stage-select')?.value || 'beach';
      this.game.multiplayer.startRace({ laps, aiCount, trackId });
    });

    document.getElementById('btn-ready')?.addEventListener('click', () => {
      const btn = document.getElementById('btn-ready');
      const isReady = btn.dataset.ready !== 'true';
      btn.dataset.ready = isReady ? 'true' : 'false';
      btn.textContent = isReady ? '✅ พร้อมแล้ว!' : '⏳ กดพร้อม';
      btn.classList.toggle('ready', isReady);
      this.game.multiplayer.updateLocalPlayer({ isReady });
    });

    document.getElementById('btn-leave-lobby')?.addEventListener('click', () => {
      this.game.multiplayer.disconnect();
      this.showView('menu');
    });

    // In-game Emote Soundboard buttons
    document.querySelectorAll('.emote-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const emoteText = btn.textContent;
        this.game.sendEmote(emoteText);
      });
    });

    // Victory Screen buttons
    document.getElementById('btn-victory-restart')?.addEventListener('click', () => {
      this.showView('hud');
      this.game.restartRace();
    });

    document.getElementById('btn-victory-menu')?.addEventListener('click', () => {
      this.showView('menu');
      this.game.exitToMainMenu();
    });
  }

  showView(viewName) {
    [this.viewMenu, this.viewStageSelect, this.viewGarage, this.viewLobby, this.viewVictory].forEach(v => {
      if (v) v.classList.add('hidden');
    });

    if (viewName === 'menu') this.viewMenu?.classList.remove('hidden');
    else if (viewName === 'stage_select') this.viewStageSelect?.classList.remove('hidden');
    else if (viewName === 'garage') this.viewGarage?.classList.remove('hidden');
    else if (viewName === 'lobby') this.viewLobby?.classList.remove('hidden');
    else if (viewName === 'victory') this.viewVictory?.classList.remove('hidden');

    if (viewName === 'hud') {
      this.game.hud.show();
    } else {
      this.game.hud.hide();
    }
  }

  openStageSelect(mode = 'gp') {
    this.targetGameMode = mode;
    const titleEl = document.getElementById('stage-select-title');
    if (titleEl) {
      titleEl.textContent = mode === 'gp' ? '🏆 เลือกด่านแข่งขัน (AI Grand Prix)' : '⏱️ เลือกด่านจับเวลา (Time Attack)';
    }

    const diffBox = document.getElementById('stage-difficulty-row');
    if (diffBox) {
      diffBox.style.display = mode === 'gp' ? 'flex' : 'none';
    }

    this.showView('stage_select');
  }

  populateStageCards() {
    const container = document.getElementById('stages-grid');
    if (!container) return;
    container.innerHTML = '';

    const stageIcons = {
      beach: '🏖️',
      buriram: '🌃',
      snow: '❄️',
      volcano: '🌋'
    };

    const stageBadges = {
      beach: 'มือใหม่ & สปีด',
      buriram: 'แสงสีนีออน',
      snow: 'ดริฟต์หิมะ',
      volcano: 'ความเร็วสูงสุด'
    };

    TRACKS.forEach(t => {
      const card = document.createElement('div');
      const isSelected = t.id === this.selectedTrackId;
      card.className = `stage-card ${isSelected ? 'selected' : ''} stage-${t.id}`;
      card.dataset.id = t.id;

      const stars = '★'.repeat(t.difficulty) + '☆'.repeat(4 - t.difficulty);

      card.innerHTML = `
        <div class="stage-card-header">
          <span class="stage-num">${t.stageLabel}</span>
          <span class="stage-stars">${stars}</span>
        </div>
        <div class="stage-card-visual">
          <span class="stage-icon">${stageIcons[t.id] || '🏎️'}</span>
          <div class="stage-tag">${stageBadges[t.id] || 'GRAND PRIX'}</div>
        </div>
        <div class="stage-card-body">
          <h3 class="stage-name">${t.nameTh}</h3>
          <div class="stage-name-en">${t.name}</div>
          <p class="stage-desc">${t.desc}</p>
        </div>
      `;

      card.addEventListener('click', () => {
        this.selectedTrackId = t.id;
        document.querySelectorAll('.stage-card').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
      });

      container.appendChild(card);
    });
  }

  populateGarageSkins() {
    const container = document.getElementById('garage-skins-list');
    if (!container) return;
    container.innerHTML = '';

    SKINS.forEach(skin => {
      const card = document.createElement('div');
      card.className = `skin-card ${skin.id === this.currentSkinId ? 'selected' : ''} ${skin.rarity}`;
      card.innerHTML = `
        <div class="skin-thumb-wrap">
          <img src="/assets/ashi/${skin.file}" alt="${skin.nameTh}" loading="lazy" />
          <span class="skin-tag">${skin.tag}</span>
        </div>
        <div class="skin-info">
          <div class="skin-name">${skin.nameTh}</div>
          <div class="skin-desc">${skin.desc}</div>
        </div>
      `;

      card.addEventListener('click', () => {
        this.currentSkinId = skin.id;
        document.querySelectorAll('.skin-card').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');

        this.game.updateGarageSkin(this.getSelectedSkinFile());
      });

      container.appendChild(card);
    });
  }

  onGarageCarChanged() {
    const car = CARS[this.currentCarIndex];
    document.getElementById('garage-car-name').textContent = car.nameTh;
    document.getElementById('garage-car-tag').textContent = car.tag;
    document.getElementById('garage-car-desc').textContent = car.desc;

    this.updateGarageStats();
    this.game.enterGaragePreview(car.id, this.getSelectedSkinFile(), this.currentColor);
  }

  updateGarageStats() {
    const car = CARS[this.currentCarIndex];
    const stats = car.stats;

    document.getElementById('stat-speed-bar').style.width = `${stats.speed}%`;
    document.getElementById('stat-accel-bar').style.width = `${stats.accel}%`;
    document.getElementById('stat-drift-bar').style.width = `${stats.drift}%`;
    document.getElementById('stat-handling-bar').style.width = `${stats.handling}%`;
    document.getElementById('stat-boost-bar').style.width = `${stats.boost}%`;
  }

  getSelectedCar() {
    return CARS[this.currentCarIndex];
  }

  getSelectedSkinFile() {
    const skin = SKINS.find(s => s.id === this.currentSkinId);
    return skin ? skin.file : 'Gemini_Generated_Image_4g9dic4g9dic4g9d.jpg';
  }

  getPlayerConfig() {
    return {
      name: this.playerName,
      carId: CARS[this.currentCarIndex].id,
      skinFileName: this.getSelectedSkinFile(),
      color: this.currentColor
    };
  }

  showCreateRoomPrompt() {
    const playerConfig = this.getPlayerConfig();
    this.game.multiplayer.createRoom(
      playerConfig,
      (roomCode) => {
        this.setupLobbyView(roomCode, true);
      },
      (err) => {
        alert('เกิดข้อผิดพลาดในการสร้างห้อง: ' + err.message);
      }
    );
  }

  showJoinRoomPrompt() {
    const code = prompt('กรุณากรอกรหัสห้อง (Room Code เช่น ASHI-1234):');
    if (!code) return;

    const playerConfig = this.getPlayerConfig();
    this.game.multiplayer.joinRoom(
      code,
      playerConfig,
      (joinedCode) => {
        this.setupLobbyView(joinedCode, false);
      },
      (err) => {
        alert('ไม่สามารถเชื่อมต่อห้องนี้ได้ ตรวจสอบรหัสห้องอีกครั้ง: ' + err.message);
      }
    );
  }

  setupLobbyView(roomCode, isHost) {
    this.showView('lobby');
    document.getElementById('lobby-room-code').textContent = roomCode;

    const hostControls = document.getElementById('lobby-host-controls');
    const startBtn = document.getElementById('btn-start-race');
    const readyBtn = document.getElementById('btn-ready');

    if (isHost) {
      if (hostControls) hostControls.classList.remove('hidden');
      if (startBtn) startBtn.classList.remove('hidden');
      if (readyBtn) readyBtn.classList.add('hidden');
    } else {
      if (hostControls) hostControls.classList.add('hidden');
      if (startBtn) startBtn.classList.add('hidden');
      if (readyBtn) readyBtn.classList.remove('hidden');
    }
  }

  updateLobbyPlayers(players, localPlayerId) {
    const container = document.getElementById('lobby-players-grid');
    if (!container) return;
    container.innerHTML = '';

    players.forEach(p => {
      const card = document.createElement('div');
      const isSelf = p.id === localPlayerId;
      card.className = `lobby-player-card ${isSelf ? 'self' : ''}`;

      const carInfo = CARS.find(c => c.id === p.carId) || CARS[0];
      const skinFile = p.skinFileName || 'Gemini_Generated_Image_4g9dic4g9dic4g9d.jpg';

      card.innerHTML = `
        <div class="player-avatar">
          <img src="/assets/ashi/${skinFile}" alt="${p.name}" />
        </div>
        <div class="player-details">
          <div class="p-name">${p.name} ${p.isHost ? '👑 (Host)' : ''} ${isSelf ? '(คุณ)' : ''}</div>
          <div class="p-car">${carInfo.nameTh}</div>
          <div class="p-status ${p.isReady ? 'ready' : 'waiting'}">
            ${p.isReady ? '✅ พร้อมแล้ว' : '⏳ รอพร้อม'}
          </div>
        </div>
      `;
      container.appendChild(card);
    });
  }

  showVictoryScreen(results) {
    this.showView('victory');

    // Confetti blast!
    try {
      confetti({
        particleCount: 160,
        spread: 85,
        origin: { y: 0.6 }
      });
    } catch (e) {}

    const tableBody = document.getElementById('victory-rankings-body');
    if (tableBody) {
      tableBody.innerHTML = '';
      results.forEach((r, idx) => {
        const row = document.createElement('tr');
        row.className = r.isPlayer ? 'player-row' : '';
        const rankSuffix = ['1st 🏆', '2nd 🥈', '3rd 🥉'][idx] || `${idx + 1}th`;

        row.innerHTML = `
          <td class="rank-col">${rankSuffix}</td>
          <td class="name-col">
            <img src="/assets/ashi/${r.skinFileName}" class="mini-avatar" />
            <span>${r.name}</span>
          </td>
          <td class="car-col">${r.carName}</td>
          <td class="time-col">${r.totalTime ? this.game.hud.formatTime(r.totalTime) : 'DNF'}</td>
          <td class="best-col">${r.bestLap ? this.game.hud.formatTime(r.bestLap) : '-'}</td>
        `;
        tableBody.appendChild(row);
      });
    }
  }
}
