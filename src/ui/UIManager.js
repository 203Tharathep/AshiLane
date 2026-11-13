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
    this.viewGridIntro = document.getElementById('view-grid-intro');
    this.gridIntroStageTitle = document.getElementById('grid-intro-stage-title');
    this.gridBroadcastCard = document.getElementById('grid-broadcast-card');
    this.gbPhoto = document.getElementById('gb-photo');
    this.gbPos = document.getElementById('gb-pos');
    this.gbName = document.getElementById('gb-name');
    this.gbCarName = document.getElementById('gb-car-name');
    this.gbCarTag = document.getElementById('gb-car-tag');
    this.gbBadge = document.getElementById('gb-badge');
    this.gbColorDot = document.getElementById('gb-color-dot');
    this.btnSkipGridIntro = document.getElementById('btn-skip-grid-intro');
    this.onGridIntroSkip = null;
    this.currentGridRacers = [];
    this.activeGridRacerIndex = -1;
    this.victoryTimeouts = [];
    this.isVictoryAnimating = false;

    // Selected Player Customization
    const savedCarIdx = parseInt(localStorage.getItem('ashilane_car_index') || '0', 10);
    this.currentCarIndex = (!isNaN(savedCarIdx) && savedCarIdx >= 0 && savedCarIdx < CARS.length) ? savedCarIdx : 0;
    this.currentSkinId = localStorage.getItem('ashilane_skin') || 'green_dress';
    const initSkin = SKINS.find(s => s.id === this.currentSkinId);
    this.currentColor = localStorage.getItem('ashilane_color') || initSkin?.color || '#0d5c3a';
    this.playerName = localStorage.getItem('ashilane_name') || 'นักซิ่งอาชิ';

    // Addons Customization with LocalStorage Persistence
    const savedAddons = (() => {
      try {
        return JSON.parse(localStorage.getItem('ashilane_addons') || '{}');
      } catch (e) {
        return {};
      }
    })();

    this.currentAddons = {
      spoiler: savedAddons.spoiler || 'stock',
      rim: savedAddons.rim || 'stock',
      exhaust: savedAddons.exhaust || 'stock',
      roof_hood: savedAddons.roof_hood || 'none',
      underglow: savedAddons.underglow || 'body_match'
    };

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
      this.syncGarageAddonPills();
      const car = CARS[this.currentCarIndex];
      const nameEl = document.getElementById('garage-car-name');
      if (nameEl) nameEl.textContent = car.nameTh;
      const tagEl = document.getElementById('garage-car-tag');
      if (tagEl) tagEl.textContent = car.tag;
      const descEl = document.getElementById('garage-car-desc');
      if (descEl) descEl.textContent = car.desc;
      this.updateGarageStats();

      const colorInput = document.getElementById('garage-color-input');
      if (colorInput) colorInput.value = this.currentColor;
      const colorHex = document.getElementById('garage-color-hex');
      if (colorHex) colorHex.textContent = this.currentColor.toUpperCase();

      this.game.enterGaragePreview(
        CARS[this.currentCarIndex].id,
        this.getSelectedSkinFile(),
        this.currentColor,
        this.currentAddons
      );
    });

    document.getElementById('btn-open-create-room')?.addEventListener('click', () => {
      this.showCreateRoomPrompt();
    });

    document.getElementById('btn-open-join-room')?.addEventListener('click', () => {
      this.showJoinRoomPrompt();
    });

    // Global UI Click Audio & Auto-Unlock on any interactive element
    document.addEventListener('pointerdown', (e) => {
      const targetBtn = e.target.closest('button, .btn, .stage-card, .garage-skin-item, .garage-tab-btn, .addon-pill, .diff-pill, .laps-pill, .nav-arrow, .tt-btn');
      if (targetBtn) {
        this.game?.audio?.unlockMobileAudio?.();
        this.game?.audio?.playClick?.();
      }
    }, { passive: true });

    // Stage Select controls
    document.getElementById('btn-stage-back')?.addEventListener('click', () => {
      this.showView('menu');
    });

    document.getElementById('btn-start-selected-race')?.addEventListener('click', () => {
      this.triggerRaceStartTransition(() => {
        this.game.startSinglePlayer(
          this.targetGameMode,
          this.selectedTrackId,
          this.selectedDifficulty,
          this.selectedLaps
        );
      });
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

    // --- Garage Console Tab Switching ---
    document.querySelectorAll('.garage-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const tabKey = btn.dataset.tab;
        document.querySelectorAll('.garage-tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.garage-tab-content').forEach(c => c.classList.remove('active'));

        btn.classList.add('active');
        document.getElementById(`tab-${tabKey}`)?.classList.add('active');
      });
    });

    // --- Garage Addon Customization Pills ---
    document.querySelectorAll('.addon-pills-row').forEach(row => {
      const category = row.dataset.category;
      row.querySelectorAll('.addon-pill').forEach(pill => {
        pill.addEventListener('click', () => {
          const val = pill.dataset.value;
          this.currentAddons[category] = val;
          try {
            localStorage.setItem('ashilane_addons', JSON.stringify(this.currentAddons));
          } catch (e) { }

          row.querySelectorAll('.addon-pill').forEach(p => p.classList.remove('active'));
          pill.classList.add('active');

          this.game.updateGarageAddons(this.currentAddons);
        });
      });
    });

    // --- Garage Car Model Switcher ---
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

    // --- Color Pickers in Garage ---
    const colorInput = document.getElementById('garage-color-input');
    const colorHex = document.getElementById('garage-color-hex');
    if (colorInput) {
      colorInput.value = this.currentColor;
      colorInput.addEventListener('input', (e) => {
        this.currentColor = e.target.value;
        try { localStorage.setItem('ashilane_color', this.currentColor); } catch (err) { }
        if (colorHex) colorHex.textContent = this.currentColor.toUpperCase();
        this.game.updateGarageColor(this.currentColor);
      });
    }

    // Color Swatches
    document.querySelectorAll('.color-swatch').forEach(swatch => {
      swatch.addEventListener('click', (e) => {
        const color = e.target.dataset.color;
        if (color) {
          this.currentColor = color;
          try { localStorage.setItem('ashilane_color', this.currentColor); } catch (err) { }
          if (colorInput) colorInput.value = color;
          if (colorHex) colorHex.textContent = color.toUpperCase();
          this.game.updateGarageColor(color);
        }
      });
    });

    // --- 360° Turntable Interactive Toolbar Buttons ---
    const quickViews = [
      { id: 'btn-tt-view-front', angle: Math.PI, pitch: 0.22, dist: 5.4 },
      { id: 'btn-tt-view-side', angle: Math.PI / 2, pitch: 0.18, dist: 5.8 },
      { id: 'btn-tt-view-rear', angle: 0, pitch: 0.22, dist: 5.4 },
      { id: 'btn-tt-view-iso', angle: 0.65, pitch: 0.3, dist: 6.0 },
      { id: 'btn-tt-view-top', angle: 0.65, pitch: 1.15, dist: 6.8 }
    ];

    quickViews.forEach(qv => {
      document.getElementById(qv.id)?.addEventListener('click', () => {
        document.querySelectorAll('.tt-quick-views .tt-btn').forEach(b => b.classList.remove('active'));
        document.getElementById(qv.id)?.classList.add('active');
        this.game.setGarageCameraAngle(qv.angle, qv.pitch, qv.dist);
      });
    });

    document.getElementById('btn-tt-left')?.addEventListener('click', () => {
      this.game.rotateGarageBy(-Math.PI / 6);
    });

    document.getElementById('btn-tt-right')?.addEventListener('click', () => {
      this.game.rotateGarageBy(Math.PI / 6);
    });

    document.getElementById('btn-tt-autospin')?.addEventListener('click', () => {
      const btn = document.getElementById('btn-tt-autospin');
      const active = this.game.toggleGarageAutoSpin();
      btn?.classList.toggle('active', active);
    });

    document.getElementById('btn-tt-zoom-in')?.addEventListener('click', () => {
      this.game.zoomGarageBy(-0.8);
    });

    document.getElementById('btn-tt-zoom-out')?.addEventListener('click', () => {
      this.game.zoomGarageBy(0.8);
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
    const copyTextWithFallback = (text, successMsg) => {
      if (!text) return;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(() => {
          this.showToast(successMsg, 'success');
        }).catch(() => {
          this.showToast(successMsg, 'success');
        });
      } else {
        this.showToast(successMsg, 'success');
      }
    };

    document.getElementById('btn-copy-code')?.addEventListener('click', () => {
      const code = document.getElementById('lobby-room-code')?.textContent?.trim();
      copyTextWithFallback(code, `📋 คัดลอกรหัสห้องแล้ว: ${code}`);
    });

    document.getElementById('btn-copy-link')?.addEventListener('click', () => {
      const code = document.getElementById('lobby-room-code')?.textContent?.trim();
      if (code) {
        const url = `${window.location.origin}${window.location.pathname}?room=${code}`;
        copyTextWithFallback(url, `🔗 คัดลอกลิงก์ชวนเพื่อนเข้าห้อง ${code} แล้ว!`);
      }
    });

    const syncHostLobbySettings = () => {
      if (!this.game.multiplayer.isHost) return;
      const laps = parseInt(document.getElementById('lobby-laps-select')?.value || '3', 10);
      const aiVal = document.getElementById('lobby-ai-select')?.value || 'auto';
      const aiCount = (aiVal === 'auto') ? 'auto' : parseInt(aiVal, 10);
      const trackId = document.getElementById('lobby-stage-select')?.value || 'buriram';
      this.game.multiplayer.updateSettings({ laps, aiCount, trackId });
    };

    document.getElementById('lobby-stage-select')?.addEventListener('change', syncHostLobbySettings);
    document.getElementById('lobby-laps-select')?.addEventListener('change', syncHostLobbySettings);
    document.getElementById('lobby-ai-select')?.addEventListener('change', syncHostLobbySettings);

    document.getElementById('btn-start-race')?.addEventListener('click', () => {
      const laps = parseInt(document.getElementById('lobby-laps-select')?.value || '3', 10);
      const aiVal = document.getElementById('lobby-ai-select')?.value || 'auto';
      const aiCount = (aiVal === 'auto') ? 'auto' : parseInt(aiVal, 10);
      const trackId = document.getElementById('lobby-stage-select')?.value || 'buriram';
      this.triggerRaceStartTransition(() => {
        this.game.multiplayer.startRace({ laps, aiCount, trackId });
      });
    });

    document.getElementById('btn-ready')?.addEventListener('click', () => {
      const btn = document.getElementById('btn-ready');
      const isReady = btn.dataset.ready !== 'true';
      btn.dataset.ready = isReady ? 'true' : 'false';
      btn.textContent = isReady ? '✅ พร้อมแล้ว!' : '⏳ กดพร้อม';
      btn.classList.toggle('ready', isReady);
      this.game.multiplayer.updateLocalPlayer({ isReady });
    });

    const handleLeaveLobby = () => {
      this.game.multiplayer.disconnect();
      this.showView('menu');
    };
    document.getElementById('btn-leave-lobby')?.addEventListener('click', handleLeaveLobby);

    // Join Room Modal controls
    const joinModal = document.getElementById('modal-join-room');
    const joinInput = document.getElementById('join-room-code-input');
    const confirmJoinBtn = document.getElementById('btn-confirm-join-room');
    const cancelJoinBtn = document.getElementById('btn-cancel-join-room');

    cancelJoinBtn?.addEventListener('click', () => {
      joinModal?.classList.add('hidden');
      this.game.multiplayer.clearPendingAction?.();
    });

    joinModal?.addEventListener('click', (e) => {
      if (e.target === joinModal) {
        joinModal.classList.add('hidden');
      }
    });

    confirmJoinBtn?.addEventListener('click', () => {
      this.submitJoinRoom(joinInput?.value || '');
    });

    joinInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.submitJoinRoom(joinInput.value);
      } else if (e.key === 'Escape') {
        joinModal?.classList.add('hidden');
      }
    });

    // Victory Screen buttons
    document.getElementById('btn-victory-restart')?.addEventListener('click', () => {
      this.showView('hud');
      this.game.restartRace();
    });

    document.getElementById('btn-victory-stage')?.addEventListener('click', () => {
      this.openStageSelect(this.game.gameMode || 'gp');
    });

    document.getElementById('btn-victory-menu')?.addEventListener('click', () => {
      this.showView('menu');
      this.game.exitToMainMenu();
    });

    // Starting Grid Intro Skip buttons
    this.btnSkipGridIntro?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.skipGridIntro();
    });

    this.viewGridIntro?.addEventListener('click', () => {
      this.skipGridIntro();
    });
    this.viewGridIntro?.addEventListener('touchstart', (e) => {
      e?.preventDefault?.();
      this.skipGridIntro();
    }, { passive: false });

    // Victory Screen click to skip animation
    this.viewVictory?.addEventListener('click', (e) => {
      if (e.target.closest('#victory-actions-panel')) return;
      if (this.isVictoryAnimating && typeof this.instantRevealAllVictory === 'function') {
        this.instantRevealAllVictory();
      }
    });

    // Keyboard shortcuts for Victory / Leaderboard screen
    window.addEventListener('keydown', (e) => {
      if (this.currentView === 'victory') {
        if (e.code === 'Space' || e.code === 'Enter') {
          e.preventDefault();
          if (this.isVictoryAnimating && typeof this.instantRevealAllVictory === 'function') {
            this.instantRevealAllVictory();
          } else {
            this.showView('hud');
            this.game.restartRace();
          }
        } else if (e.code === 'Escape') {
          e.preventDefault();
          this.showView('menu');
          this.game.exitToMainMenu();
        }
      }
    });
  }

  triggerRaceStartTransition(onCutPoint) {
    const curtain = document.getElementById('cinematic-transition-curtain');
    if (!curtain) {
      if (onCutPoint) onCutPoint();
      return;
    }

    try {
      this.game?.audio?.playClick?.();
    } catch (e) { }

    // Animate active modal card out smoothly
    const activeCard = document.querySelector('#view-stage-select .stage-select-card, #view-lobby .lobby-card');
    if (activeCard) {
      activeCard.style.transition = 'transform 0.18s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.18s cubic-bezier(0.4, 0, 0.2, 1)';
      activeCard.style.transform = 'scale(0.96) translateY(8px)';
      activeCard.style.opacity = '0';
    }

    // Flash curtain to black
    curtain.classList.remove('hidden');
    void curtain.offsetHeight;
    curtain.classList.add('active');

    setTimeout(() => {
      if (activeCard) {
        activeCard.style.transform = '';
        activeCard.style.opacity = '';
        activeCard.style.transition = '';
      }
      if (onCutPoint) onCutPoint();

      setTimeout(() => {
        curtain.classList.remove('active');
        setTimeout(() => {
          curtain.classList.add('hidden');
        }, 250);
      }, 50);
    }, 180);
  }

  showView(viewName) {
    this.currentView = viewName;
    if (viewName !== 'grid_intro') {
      this.hideGridIntro();
    }
    if (viewName !== 'victory') {
      this.isVictoryAnimating = false;
      if (this.victoryTimeouts) {
        this.victoryTimeouts.forEach(t => clearTimeout(t));
        this.victoryTimeouts = [];
      }
    }
    [this.viewMenu, this.viewStageSelect, this.viewGarage, this.viewLobby, this.viewVictory].forEach(v => {
      if (v) v.classList.add('hidden');
    });

    if (viewName === 'menu') this.viewMenu?.classList.remove('hidden');
    else if (viewName === 'stage_select') this.viewStageSelect?.classList.remove('hidden');
    else if (viewName === 'garage') this.viewGarage?.classList.remove('hidden');
    else if (viewName === 'lobby') this.viewLobby?.classList.remove('hidden');
    else if (viewName === 'victory') this.viewVictory?.classList.remove('hidden');
    else if (viewName === 'grid_intro') this.viewGridIntro?.classList.remove('hidden');

    if (viewName === 'hud') {
      this.game.hud.show();
    } else {
      this.game.hud.hide();
    }
  }

  showGridIntro(racers, stageName, onFinish) {
    this.showView('grid_intro');
    this.onGridIntroSkip = onFinish;
    this.currentGridRacers = racers || [];
    this.activeGridRacerIndex = -1;
    this.game.hud.hide();

    if (this.gridIntroStageTitle) {
      this.gridIntroStageTitle.textContent = stageName || 'STARTING LINE';
    }

    // Show initial racer (the last car at the back of the grid, e.g. P7)
    const initialIndex = this.currentGridRacers.length > 0 ? this.currentGridRacers.length - 1 : 0;
    this.updateGridBroadcast(initialIndex);

    this.viewGridIntro?.classList.remove('hidden');
  }

  updateGridBroadcast(racerIndex) {
    if (!this.currentGridRacers || racerIndex === this.activeGridRacerIndex) return;
    if (racerIndex < 0 || racerIndex >= this.currentGridRacers.length) return;

    this.activeGridRacerIndex = racerIndex;
    const r = this.currentGridRacers[racerIndex];
    const pos = racerIndex + 1;

    // Update broadcast card values
    if (this.gbPos) {
      this.gbPos.textContent = pos;
      this.gbPos.className = `grid-broadcast-pos-badge ${pos === 1 ? 'p1' : pos === 2 ? 'p2' : pos === 3 ? 'p3' : ''}`;
    }

    if (this.gbPhoto) {
      const skinFile = r.skinFileName || 'Gemini_Generated_Image_4g9dic4g9dic4g9d.jpg';
      this.gbPhoto.src = `/assets/ashi/${skinFile}`;
    }

    if (this.gbName) {
      this.gbName.innerHTML = `${r.name} ${r.isPlayer ? '<span class="gb-you-badge">YOU (คุณ)</span>' : ''}`;
    }

    if (this.gbCarName) {
      this.gbCarName.textContent = r.carName || 'รถซิ่งอาชิ';
    }

    if (this.gbCarTag) {
      this.gbCarTag.textContent = r.carTag || 'RACER';
    }

    if (this.gbColorDot) {
      this.gbColorDot.style.backgroundColor = r.color || '#00f3ff';
    }

    if (this.gbBadge) {
      this.gbBadge.textContent = r.isPlayer ? '👑 POLE POSITION' : '🏎️ RIVAL RACER';
      this.gbBadge.className = `gb-role-pill ${r.isPlayer ? 'pole' : ''}`;
    }

    if (this.gridBroadcastCard) {
      this.gridBroadcastCard.classList.toggle('is-player', !!r.isPlayer);
      this.gridBroadcastCard.style.borderColor = r.isPlayer ? '#ffd700' : (r.color || 'rgba(0, 243, 255, 0.5)');
      this.gridBroadcastCard.style.boxShadow = r.isPlayer
        ? '0 14px 45px rgba(0, 0, 0, 0.85), 0 0 32px rgba(255, 215, 0, 0.5)'
        : `0 14px 40px rgba(0, 0, 0, 0.8), 0 0 24px ${r.color ? r.color + '55' : 'rgba(0, 243, 255, 0.3)'}`;

      // Re-trigger slide animation on switch
      this.gridBroadcastCard.style.animation = 'none';
      void this.gridBroadcastCard.offsetHeight;
      this.gridBroadcastCard.style.animation = 'gbSlideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1)';
    }
  }

  skipGridIntro() {
    if (this.onGridIntroSkip) {
      const cb = this.onGridIntroSkip;
      this.onGridIntroSkip = null;
      this.hideGridIntro();
      cb();
    }
  }

  hideGridIntro() {
    this.viewGridIntro?.classList.add('hidden');
    this.onGridIntroSkip = null;
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
        try { localStorage.setItem('ashilane_skin', this.currentSkinId); } catch (err) { }
        document.querySelectorAll('.skin-card').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');

        if (skin.color) {
          this.currentColor = skin.color;
          try { localStorage.setItem('ashilane_color', this.currentColor); } catch (err) { }
          const colorInput = document.getElementById('garage-color-input');
          if (colorInput) colorInput.value = this.currentColor;
          const colorHex = document.getElementById('garage-color-hex');
          if (colorHex) colorHex.textContent = this.currentColor.toUpperCase();
        }

        this.game.updateGarageSkin(this.getSelectedSkinFile());
      });

      container.appendChild(card);
    });
  }

  syncGarageAddonPills() {
    document.querySelectorAll('.addon-pills-row').forEach(row => {
      const category = row.dataset.category;
      const curVal = this.currentAddons[category];
      row.querySelectorAll('.addon-pill').forEach(pill => {
        pill.classList.toggle('active', pill.dataset.value === curVal);
      });
    });
  }

  onGarageCarChanged() {
    try { localStorage.setItem('ashilane_car_index', this.currentCarIndex); } catch (err) { }
    const car = CARS[this.currentCarIndex];
    document.getElementById('garage-car-name').textContent = car.nameTh;
    document.getElementById('garage-car-tag').textContent = car.tag;
    document.getElementById('garage-car-desc').textContent = car.desc;

    this.updateGarageStats();
    this.game.enterGaragePreview(car.id, this.getSelectedSkinFile(), this.currentColor, this.currentAddons);
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
      color: this.currentColor,
      addons: { ...this.currentAddons }
    };
  }

  showCreateRoomPrompt() {
    if (this._creatingRoom) return;
    this._creatingRoom = true;
    const createBtn = document.getElementById('btn-open-create-room');
    const origHtml = createBtn ? createBtn.innerHTML : '';
    if (createBtn) {
      createBtn.disabled = true;
      createBtn.textContent = '⏳ กำลังสร้างห้อง...';
    }
    this.showToast('⏳ กำลังเชื่อมต่อเซิร์ฟเวอร์และสร้างห้อง...', 'info', 6000);

    const initialSettings = {
      trackId: document.getElementById('lobby-stage-select')?.value || 'buriram',
      laps: parseInt(document.getElementById('lobby-laps-select')?.value || '3', 10),
      aiCount: document.getElementById('lobby-ai-select')?.value || 'auto'
    };

    const restoreBtn = () => {
      this._creatingRoom = false;
      if (createBtn) {
        createBtn.disabled = false;
        createBtn.innerHTML = origHtml;
      }
    };

    const playerConfig = this.getPlayerConfig();
    this.game.multiplayer.createRoom(
      playerConfig,
      (roomCode) => {
        restoreBtn();
        this.setupLobbyView(roomCode, true, this.game.multiplayer.roomSettings);
        this.showToast(`✅ สร้างห้อง ${roomCode} สำเร็จ! ส่งรหัสให้เพื่อนเลย`, 'success', 3200);
      },
      (err) => {
        restoreBtn();
        this.showToast(`❌ สร้างห้องไม่สำเร็จ: ${err.message}`, 'error', 4500);
      },
      initialSettings
    );
  }

  openJoinRoomModal(prefillCode = '') {
    const modal = document.getElementById('modal-join-room');
    const input = document.getElementById('join-room-code-input');
    const errEl = document.getElementById('join-room-error');
    const confirmBtn = document.getElementById('btn-confirm-join-room');

    if (errEl) {
      errEl.textContent = '';
      errEl.classList.add('hidden');
    }
    if (confirmBtn) {
      confirmBtn.disabled = false;
      confirmBtn.textContent = '🚀 เข้าร่วมห้อง';
    }
    if (input) {
      input.value = String(prefillCode || '').toUpperCase().trim().replace(/^ASHI[-_\s]?/, '');
    }
    modal?.classList.remove('hidden');
    setTimeout(() => input?.focus(), 60);
  }

  showJoinRoomPrompt() {
    this.openJoinRoomModal('');
  }

  submitJoinRoom(rawCode) {
    const code = String(rawCode || '').toUpperCase().trim();
    const errEl = document.getElementById('join-room-error');
    const confirmBtn = document.getElementById('btn-confirm-join-room');
    const modal = document.getElementById('modal-join-room');

    if (!code) {
      if (errEl) {
        errEl.textContent = 'กรุณากรอกรหัสห้องก่อนเข้าร่วม';
        errEl.classList.remove('hidden');
      }
      return;
    }

    if (errEl) errEl.classList.add('hidden');
    if (confirmBtn) {
      confirmBtn.disabled = true;
      confirmBtn.textContent = '⏳ กำลังเข้าร่วม...';
    }

    const playerConfig = this.getPlayerConfig();
    this.game.multiplayer.joinRoom(
      code,
      playerConfig,
      (joinedCode) => {
        if (confirmBtn) {
          confirmBtn.disabled = false;
          confirmBtn.textContent = '🚀 เข้าร่วมห้อง';
        }
        modal?.classList.add('hidden');
        this.setupLobbyView(joinedCode, false, this.game.multiplayer.roomSettings);
        this.showToast(`✅ เข้าห้อง ${joinedCode} สำเร็จ!`, 'success', 2800);
      },
      (err) => {
        if (confirmBtn) {
          confirmBtn.disabled = false;
          confirmBtn.textContent = '🚀 เข้าร่วมห้อง';
        }
        if (errEl) {
          errEl.textContent = err.message || 'ไม่สามารถเข้าร่วมห้องได้';
          errEl.classList.remove('hidden');
        } else {
          this.showToast(`❌ ${err.message}`, 'error', 4000);
        }
      }
    );
  }

  setupLobbyView(roomCode, isHost, settings = null) {
    this.showView('lobby');
    const codeEl = document.getElementById('lobby-room-code');
    if (codeEl) codeEl.textContent = roomCode;

    const readyBtn = document.getElementById('btn-ready');
    if (readyBtn) {
      readyBtn.dataset.ready = 'false';
      readyBtn.textContent = '⏳ กดพร้อม';
      readyBtn.classList.remove('ready');
    }

    this.syncLobbyHostState(isHost, settings);
  }

  syncLobbyHostState(isHost, settings = null) {
    const hostControls = document.getElementById('lobby-host-controls');
    const guestSettings = document.getElementById('lobby-guest-settings');
    const startBtn = document.getElementById('btn-start-race');
    const readyBtn = document.getElementById('btn-ready');

    if (isHost) {
      hostControls?.classList.remove('hidden');
      guestSettings?.classList.add('hidden');
      startBtn?.classList.remove('hidden');
      readyBtn?.classList.add('hidden');
    } else {
      hostControls?.classList.add('hidden');
      guestSettings?.classList.remove('hidden');
      startBtn?.classList.add('hidden');
      readyBtn?.classList.remove('hidden');
    }

    if (settings) {
      this.updateLobbySettingsDisplay(settings);
    }
  }

  updateLobbySettingsDisplay(settings) {
    if (!settings) return;
    const stageSelect = document.getElementById('lobby-stage-select');
    const lapsSelect = document.getElementById('lobby-laps-select');
    const aiSelect = document.getElementById('lobby-ai-select');

    if (stageSelect && settings.trackId) stageSelect.value = settings.trackId;
    if (lapsSelect && settings.laps) lapsSelect.value = String(settings.laps);
    if (aiSelect && settings.aiCount !== undefined) aiSelect.value = String(settings.aiCount);

    const track = TRACKS.find(t => t.id === settings.trackId);
    const stageText = track ? `${track.icon || '🏁'} ${track.nameTh}` : (settings.trackId || 'บุรีรัมย์');
    const lapsText = `${settings.laps || 3} รอบ`;
    const aiText = settings.aiCount === 'auto'
      ? 'เติมอัตโนมัติ (ครบ 8 คัน)'
      : (Number(settings.aiCount) === 0 ? 'ไม่เติมบอท (เฉพาะเพื่อน)' : `+ ${settings.aiCount} คัน`);

    const gStage = document.getElementById('guest-setting-stage');
    const gLaps = document.getElementById('guest-setting-laps');
    const gAi = document.getElementById('guest-setting-ai');
    if (gStage) gStage.textContent = stageText;
    if (gLaps) gLaps.textContent = lapsText;
    if (gAi) gAi.textContent = aiText;
  }

  updateNetworkStatus(status = {}) {
    const el = document.getElementById('lobby-net-status');
    if (!el) return;
    el.classList.remove('warn', 'error');

    const transportLabel = status.transport === 'peer' ? 'PeerJS' : 'WS';
    if (status.state === 'connecting' || status.state === 'reconnecting') {
      el.classList.add('warn');
      el.textContent = `🟡 ${status.message || 'กำลังเชื่อมต่อ...'}`;
    } else if (status.state === 'error' || status.state === 'disconnected') {
      el.classList.add('error');
      el.textContent = `🔴 ${status.message || 'หลุดการเชื่อมต่อ'}`;
    } else if (status.state === 'connected') {
      const pingText = status.latencyMs ? ` • ${status.latencyMs} ms` : '';
      el.textContent = `🟢 ออนไลน์ (${transportLabel}${pingText})`;
    }
  }

  showToast(message, type = 'info', duration = 2600) {
    const toast = document.getElementById('ui-toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.remove('hidden', 'error', 'success');
    if (type === 'error') toast.classList.add('error');
    else if (type === 'success') toast.classList.add('success');

    if (this._toastTimer) clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => {
      toast.classList.add('hidden');
    }, duration);
  }

  updateLobbyPlayers(players, localPlayerId) {
    const container = document.getElementById('lobby-players-grid');
    if (!container) return;
    container.innerHTML = '';

    const countEl = document.getElementById('lobby-player-count');
    if (countEl) {
      countEl.textContent = `(${players.length}/8 คน)`;
    }

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

  triggerConfetti() {
    try {
      if (typeof confetti === 'function') {
        // Center burst
        confetti({ particleCount: 160, spread: 90, origin: { y: 0.52 } });
        // Left cannon
        setTimeout(() => confetti({ particleCount: 90, angle: 60, spread: 65, origin: { x: 0.12, y: 0.65 } }), 320);
        // Right cannon
        setTimeout(() => confetti({ particleCount: 90, angle: 120, spread: 65, origin: { x: 0.88, y: 0.65 } }), 640);
        // Champion gold sparkle shower
        setTimeout(() => confetti({
          particleCount: 140,
          spread: 120,
          origin: { y: 0.35 },
          colors: ['#ffd700', '#ffaa00', '#ffffff', '#00f0ff']
        }), 960);
      }
    } catch (e) { }
  }

  showVictoryScreen(results) {
    this.showView('victory');

    // Clear any previous victory animations
    if (this.victoryTimeouts) {
      this.victoryTimeouts.forEach(t => clearTimeout(t));
    }
    this.victoryTimeouts = [];
    this.isVictoryAnimating = true;

    // 1. Determine player result & headlines
    const playerResult = results.find(r => r.isPlayer);
    const playerRank = playerResult ? playerResult.rank : (results.findIndex(r => r.isPlayer) + 1);
    const headlineEl = document.getElementById('podium-headline');
    const subheadlineEl = document.getElementById('podium-subheadline');
    const actionsPanel = document.getElementById('victory-actions-panel');
    const skipHint = document.getElementById('victory-skip-hint');

    // Initial suspense headline during reveal
    if (headlineEl) headlineEl.innerHTML = '🏁 กำลังประมวลผลอันดับการแข่งขัน...';
    if (subheadlineEl) subheadlineEl.textContent = 'ประกาศผลอย่างเป็นทางการ ค่อยๆ สรุปจากอันดับท้ายสู่แชมเปี้ยน!';
    if (actionsPanel) {
      actionsPanel.classList.add('actions-hidden');
      actionsPanel.classList.remove('actions-revealed');
    }
    if (skipHint) {
      skipHint.classList.remove('hidden');
    }

    const updateFinalHeadline = () => {
      if (!headlineEl || !subheadlineEl) return;
      if (playerRank === 1) {
        headlineEl.innerHTML = '👑 ยินดีด้วย! คุณคว้าแชมป์อันดับ 1! 🏆';
        subheadlineEl.textContent = 'สุดยอดฝีมือไร้เทียมทาน คว้าถ้วยรางวัลชนะเลิศอันดับ 1 ครองบัลลังก์ทองคำ!';
      } else if (playerRank === 2) {
        headlineEl.innerHTML = '🥈 ยอดเยี่ยมมาก! คุณจบอันดับ 2!';
        subheadlineEl.textContent = 'ขับเคี่ยวสุดมันส์ คว้าตำแหน่งรองชนะเลิศอันดับ 1 แห่งเกียรติยศ!';
      } else if (playerRank === 3) {
        headlineEl.innerHTML = '🥉 เยี่ยมมาก! คุณจบอันดับ 3!';
        subheadlineEl.textContent = 'ฝ่าฟันอุปสรรคจนเข้าเส้นชัยติดท็อป 3 อันดับแรก!';
      } else {
        const winner = results[0];
        headlineEl.innerHTML = `🏁 การแข่งขันสิ้นสุด! ${winner?.name || 'แชมเปี้ยน'} คว้าอันดับ 1`;
        subheadlineEl.textContent = `คุณจบการแข่งขันในอันดับที่ ${playerRank} — ซ้อมมือแล้วกลับมาท้าชิงแชมป์ใหม่!`;
      }
    };

    // 2. Populate All Racers Table with hidden rows
    const tableBody = document.getElementById('victory-rankings-body');
    const rowElements = [];
    if (tableBody) {
      tableBody.innerHTML = '';
      results.forEach((r, idx) => {
        const row = document.createElement('tr');
        row.className = `leaderboard-row row-hidden ${r.isPlayer ? 'player-row' : ''}`;
        const rankSuffix = ['1st 🏆', '2nd 🥈', '3rd 🥉'][idx] || `${idx + 1}th`;

        const statusHtml = r.isFinished
          ? `<span class="res-status-badge finished">FINISHED</span>`
          : `<span class="res-status-badge timeout">TIME OUT</span>`;

        let timeGapHtml = '';
        if (r.isFinished) {
          const timeStr = this.game.hud.formatTime(r.totalTime);
          const gapStr = (idx === 0) ? '<span class="gap-pill leader">LEADER</span>' : `<span class="gap-pill">${r.gapText || ''}</span>`;
          timeGapHtml = `<div class="time-cell"><span class="time-main">${timeStr}</span> ${gapStr}</div>`;
        } else {
          timeGapHtml = `<div class="time-cell"><span class="dist-main">${r.gapText || ('ขาดอีก ' + Math.round(r.distanceRemaining) + ' ม.')}</span></div>`;
        }

        const bestLapStr = r.bestLap ? this.game.hud.formatTime(r.bestLap) : '-';

        row.innerHTML = `
          <td class="rank-col">
            <span class="rank-badge-item rank-${idx + 1}">${rankSuffix}</span>
          </td>
          <td class="name-col">
            <div class="racer-profile-cell">
              <img src="/assets/ashi/${r.skinFileName || 'Gemini_Generated_Image_4g9dic4g9dic4g9d.jpg'}" onerror="this.src='/assets/ashi/Gemini_Generated_Image_4g9dic4g9dic4g9d.jpg'" class="mini-avatar" />
              <div class="racer-meta-wrap">
                <span class="racer-name-text">${r.name}</span>
                ${r.isPlayer ? '<span class="podium-you-pill mini">YOU</span>' : ''}
              </div>
            </div>
          </td>
          <td class="car-col">
            <span class="car-name-text">${r.carName}</span>
          </td>
          <td class="status-col">${statusHtml}</td>
          <td class="time-col">${timeGapHtml}</td>
          <td class="best-col">${bestLapStr}</td>
        `;
        tableBody.appendChild(row);
        rowElements.push(row);
      });
    }

    // 3. Instant Reveal All Handler (Skip Animation)
    this.instantRevealAllVictory = () => {
      if (!this.isVictoryAnimating) return;
      if (this.victoryTimeouts) {
        this.victoryTimeouts.forEach(t => clearTimeout(t));
        this.victoryTimeouts = [];
      }
      this.isVictoryAnimating = false;

      rowElements.forEach((row, idx) => {
        row.classList.remove('row-hidden');
        row.classList.add('row-revealed');
        if (idx === 0) {
          row.classList.add('winner-revealed');
        }
      });

      updateFinalHeadline();
      if (skipHint) skipHint.classList.add('hidden');
      if (actionsPanel) {
        actionsPanel.classList.remove('actions-hidden');
        actionsPanel.classList.add('actions-revealed');
      }

      this.triggerConfetti();
    };

    // 4. Sequential Staggered Reveal Animation: from bottom rank to top (1st place)
    const total = results.length;
    let currentDelay = 220; // brief initial delay

    for (let i = total - 1; i >= 0; i--) {
      const rankIndex = i;
      const racer = results[rankIndex];
      const row = rowElements[rankIndex];
      const isFirst = (rankIndex === 0);
      const isTop3 = (rankIndex <= 2);

      const timeout = setTimeout(() => {
        if (!this.isVictoryAnimating) return;

        row.classList.remove('row-hidden');
        row.classList.add('row-revealed');

        if (isFirst) {
          row.classList.add('winner-revealed');
          updateFinalHeadline();
          if (this.game.audio?.playVictoryChime) {
            this.game.audio.playVictoryChime();
          }
          this.triggerConfetti();
        } else {
          const stepFromBottom = (total - 1) - rankIndex;
          if (this.game.audio?.playLeaderboardRankPop) {
            this.game.audio.playLeaderboardRankPop(stepFromBottom, total, racer.isPlayer);
          }
        }
      }, currentDelay);

      this.victoryTimeouts.push(timeout);

      if (isFirst) {
        currentDelay += 550;
      } else if (rankIndex === 1) {
        // Dramatic suspense pause before revealing 1st place!
        currentDelay += 600;
      } else if (isTop3) {
        currentDelay += 380;
      } else {
        currentDelay += 260;
      }
    }

    // Final step: reveal action buttons and hide skip hint
    const finalTimeout = setTimeout(() => {
      if (!this.isVictoryAnimating) return;
      this.isVictoryAnimating = false;
      if (skipHint) skipHint.classList.add('hidden');
      if (actionsPanel) {
        actionsPanel.classList.remove('actions-hidden');
        actionsPanel.classList.add('actions-revealed');
      }
    }, currentDelay);
    this.victoryTimeouts.push(finalTimeout);
  }
}
