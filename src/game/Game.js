import * as THREE from 'three';
import { Track } from './Track.js';
import { TrackDecorations } from './TrackDecorations.js';
import { CarModelBuilder } from './CarModelBuilder.js';
import { Car } from './Car.js';
import { AICar } from './AICar.js';
import { ParticleSystem } from './ParticleSystem.js';
import { AudioManager } from './AudioManager.js';
import { Minimap } from './Minimap.js';
import { ItemSystem } from './ItemSystem.js';
import { HUD } from '../ui/HUD.js';
import { UIManager } from '../ui/UIManager.js';
import { MultiplayerManager } from '../network/MultiplayerManager.js';
import { CARS } from '../data/carsData.js';
import { SKINS } from '../data/skinsData.js';
import { TRACKS, DIFFICULTIES, getTrackDef } from '../data/tracksData.js';

export class Game {
  constructor() {
    this.container = document.getElementById('canvas-container');
    this.state = 'MENU'; // 'MENU', 'STAGE_SELECT', 'GARAGE', 'LOBBY', 'RACING', 'VICTORY'
    this.gameMode = 'gp'; // 'gp', 'timeattack', 'multiplayer'

    // Active track & settings
    this.currentTrackId = 'beach';
    this.currentDifficulty = 'normal';
    this.currentLaps = 3;

    // Clock & Timing
    this.clock = new THREE.Clock();
    this.raceStartTime = 0;
    this.isRacing = false;
    this.countdownActive = false;

    // Three.js Core
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.ambientLight = null;
    this.dirLight = null;

    // Camera settings
    this.cameraMode = 0; // 0: Chase Cam, 1: Close Cam, 2: Hood Cam
    this.cameraOffset = new THREE.Vector3(0, 3.8, -7.5);
    this.cameraLookOffset = new THREE.Vector3(0, 1.2, 4);

    // Systems
    this.track = null;
    this.decorations = null;
    this.carBuilder = new CarModelBuilder();
    this.particles = null;
    this.audio = new AudioManager();
    this.hud = new HUD();
    this.minimap = null;
    this.items = null;

    // Racers
    this.playerCar = null;
    this.aiCars = [];
    this.remotePlayers = new Map(); // peerId -> { car, lastPacket }

    // Garage Preview
    this.garageCarMesh = null;
    this.garageAngle = 0;

    // Multiplayer
    this.multiplayer = new MultiplayerManager(
      (lobbyState) => this.onMultiplayerStateChanged(lobbyState),
      (chatMsg) => this.onChatMessage(chatMsg)
    );
    this.multiplayer.onStartRaceCallback = (packet) => this.onMultiplayerStartRace(packet);
    this.multiplayer.onRacerTransform = (data) => this.onRemoteRacerTransform(data);

    // UI
    this.ui = new UIManager(this);

    // Inputs
    this.keys = {};
    this.initInputs();

    // Init Three Scene & Start loop
    this.initThree();
    this.animate();
  }

  initThree() {
    this.scene = new THREE.Scene();

    this.camera = new THREE.PerspectiveCamera(
      65,
      window.innerWidth / window.innerHeight,
      0.1,
      1200
    );

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;

    this.container.appendChild(this.renderer.domElement);

    // Dynamic Lights
    this.ambientLight = new THREE.AmbientLight(0xffe2c4, 0.75);
    this.scene.add(this.ambientLight);

    this.dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
    this.dirLight.position.set(120, 220, 100);
    this.dirLight.castShadow = true;
    this.dirLight.shadow.mapSize.width = 2048;
    this.dirLight.shadow.mapSize.height = 2048;
    this.dirLight.shadow.camera.near = 10;
    this.dirLight.shadow.camera.far = 600;
    this.dirLight.shadow.camera.left = -300;
    this.dirLight.shadow.camera.right = 300;
    this.dirLight.shadow.camera.top = 300;
    this.dirLight.shadow.camera.bottom = -300;
    this.scene.add(this.dirLight);

    // Particles System
    this.particles = new ParticleSystem(this.scene);

    // Load Default Starting Track
    this.loadTrack(this.currentTrackId);

    // Default player car setup for initial menu backdrop
    this.setupPlayerCar(CARS[0], 'Gemini_Generated_Image_4g9dic4g9dic4g9d.jpg', '#ff2255');
    this.positionCarAtStart(this.playerCar, 0);

    window.addEventListener('resize', () => this.onWindowResize());
  }

  loadTrack(trackId) {
    const trackDef = getTrackDef(trackId);
    this.currentTrackId = trackDef.id;

    // 1. Dispose old track and decorations
    if (this.decorations) {
      this.decorations.dispose();
      this.decorations = null;
    }
    if (this.track) {
      this.track.dispose();
      this.track = null;
    }

    // 2. Set environment & lighting based on track theme
    const theme = trackDef.theme || {};
    this.scene.background = new THREE.Color(theme.sky ?? 0x0a0c18);
    this.scene.fog = new THREE.FogExp2(theme.fog ?? 0x0a0c18, theme.fogDensity || 0.0035);
    this.renderer.toneMappingExposure = theme.exposure || 1.1;

    if (this.ambientLight) {
      this.ambientLight.color.setHex(theme.ambient ?? 0xb0c4de);
      this.ambientLight.intensity = theme.ambientIntensity || 0.7;
    }
    if (this.dirLight) {
      this.dirLight.color.setHex(theme.sun ?? 0xffffff);
      this.dirLight.intensity = theme.sunIntensity || 1.4;
    }

    // 3. Build new Track and themed Decorations
    this.track = new Track(this.scene, trackDef);
    this.decorations = new TrackDecorations(this.scene, this.track);

    // 4. Update ItemSystem
    if (!this.items) {
      this.items = new ItemSystem(this.scene, this.track, this.particles, this.audio, this.hud);
    } else {
      this.items.resetForTrack(this.track);
    }

    // 5. Update Minimap
    const minimapCanvas = document.getElementById('minimap-canvas');
    if (minimapCanvas) {
      if (!this.minimap) {
        this.minimap = new Minimap(minimapCanvas, this.track);
      } else {
        this.minimap.setTrack(this.track);
      }
    }

    // 6. Update HUD stage label
    this.hud.setStage(trackDef.nameTh);
  }

  setupPlayerCar(carConfig, skinFileName, color) {
    if (this.playerCar && this.playerCar.model) {
      this.scene.remove(this.playerCar.model);
    }

    this.playerCar = new Car(carConfig, skinFileName, color, true);
    this.playerCar.game = this;
    const builtModel = this.carBuilder.createCar(carConfig.id, skinFileName, color, false);
    this.playerCar.setModel(builtModel);
    this.scene.add(this.playerCar.model);

    this.hud.setDriverAvatar(skinFileName, this.ui.playerName);
  }

  positionCarAtStart(car, gridIndex = 0) {
    if (!this.track || !this.track.samplePos) return;

    const pt = this.track.samplePos[0];
    const tangent = this.track.sampleTan[0];
    const normal = this.track.sampleNorm[0];

    // 2-wide staggered grid behind start line on home straight
    const row = Math.floor(gridIndex / 2);
    const col = (gridIndex % 2 === 0) ? -1 : 1;
    const lateralOffset = col * (this.track.roadWidth * 0.22);
    const longitudinalOffset = -12 - (row * 10);

    const pos = pt.clone()
      .addScaledVector(tangent, longitudinalOffset)
      .addScaledVector(normal, lateralOffset);

    car.position.set(pos.x, 0.35, pos.z);
    car.rotationY = Math.atan2(tangent.x, tangent.z);
    car.speed = 0;
    car.velocity.set(0, 0, 0);
    car.lap = 1;
    car.hasPassedHalfway = false;
    car.sampleIndexHint = 0;
    car.totalDistance = 0;
    car.isFinished = false;
    car.spinTimer = 0;
    car.isSpinning = false;
  }

  startSinglePlayer(mode = 'gp', trackId = 'beach', difficulty = 'normal', laps = 3) {
    this.gameMode = mode;
    this.currentDifficulty = difficulty;
    this.currentLaps = laps;
    this.state = 'RACING';
    this.audio.init();

    // 1. Load selected stage
    if (!this.track || this.track.def.id !== trackId) {
      this.loadTrack(trackId);
    }

    // 2. Setup Player Car
    const playerConfig = this.ui.getPlayerConfig();
    const carConfig = CARS.find(c => c.id === playerConfig.carId) || CARS[0];
    this.setupPlayerCar(carConfig, playerConfig.skinFileName, playerConfig.color);
    this.playerCar.totalLaps = laps;

    this.clearOpponents();
    this.positionCarAtStart(this.playerCar, 0);

    // 3. Setup AI Competitors if GP mode
    if (mode === 'gp') {
      const diffMul = DIFFICULTIES[difficulty]?.aiMul || 1.0;

      const aiRivalConfigs = [
        { name: 'ชเร็ค อาชิ (Ogre)', car: 'truck', skin: 'Gemini_Generated_Image_9bccp39bccp39bcc.jpeg', color: '#38b000', lane: -2.8, skill: 0.90 },
        { name: 'บิกินี่แดง อาชิ (Hot)', car: 'gt', skin: 'qwen_edit_20261004_234512.png', color: '#ff0033', lane: 2.8, skill: 0.92 },
        { name: 'นกบอมบ์ อาชิ (Bomb)', car: 'muscle', skin: 'Gemini_Generated_Image_w62h0zw62h0zw62h.jpg', color: '#222222', lane: -3.2, skill: 0.88 },
        { name: 'เสี่ยอาชิ (CEO)', car: 'f1', skin: 'Gemini_Generated_Image_t2e45ct2e45ct2e4.jpeg', color: '#ffd700', lane: 3.2, skill: 0.94 },
        { name: 'หนอนลาวา อาชิ', car: 'kart', skin: 'Gemini_Generated_Image_kwy6itkwy6itkwy6.jpeg', color: '#ff6600', lane: 0.0, skill: 0.86 }
      ];

      aiRivalConfigs.forEach((cfg, idx) => {
        const carDef = CARS.find(c => c.id === cfg.car) || CARS[0];
        const ai = new AICar(carDef, cfg.skin, cfg.color, cfg.name, cfg.lane, cfg.skill);
        ai.game = this;
        ai.totalLaps = laps;
        ai.setDifficulty(diffMul);

        const built = this.carBuilder.createCar(carDef.id, cfg.skin, cfg.color, true);
        ai.setModel(built);
        this.scene.add(ai.model);
        this.positionCarAtStart(ai, idx + 1);
        this.aiCars.push(ai);
      });
    }

    this.ui.showView('hud');
    this.startCountdown();
  }

  startCountdown() {
    this.countdownActive = true;
    this.isRacing = false;
    this.playerCar.speed = 0;
    this.playerCar.inputs.throttle = 0;

    if (this.track && this.track.setStartLights) {
      this.track.setStartLights(0, false);
    }

    this.hud.playCountdown(
      (step) => {
        if (step === 3) {
          this.audio.playCountdown(440, 0.18);
          if (this.track && this.track.setStartLights) this.track.setStartLights(2, false);
        } else if (step === 2) {
          this.audio.playCountdown(440, 0.18);
          if (this.track && this.track.setStartLights) this.track.setStartLights(4, false);
        } else if (step === 1) {
          this.audio.playCountdown(440, 0.18);
          if (this.track && this.track.setStartLights) this.track.setStartLights(5, false);
        } else if (step === 'GO') {
          this.audio.playCountdown(880, 0.45);
          if (this.track && this.track.setStartLights) this.track.setStartLights(5, true);
          setTimeout(() => {
            if (this.track && this.track.setStartLights) this.track.setStartLights(0, false);
          }, 1500);
        }
      },
      () => {
        this.countdownActive = false;
        this.isRacing = true;
        this.raceStartTime = performance.now();
      }
    );
  }

  clearOpponents() {
    this.aiCars.forEach(ai => {
      if (ai.model) this.scene.remove(ai.model);
    });
    this.aiCars = [];

    this.remotePlayers.forEach(p => {
      if (p.car && p.car.model) this.scene.remove(p.car.model);
    });
    this.remotePlayers.clear();
  }

  // --- Multiplayer Lifecycle ---
  onMultiplayerStateChanged(lobbyState) {
    this.ui.updateLobbyPlayers(lobbyState.players, lobbyState.localPlayerId);
  }

  onMultiplayerStartRace(packet) {
    this.gameMode = 'multiplayer';
    this.state = 'RACING';
    this.audio.init();

    const settings = packet.settings || {};
    const trackId = settings.trackId || 'beach';
    const laps = settings.laps || 3;
    const aiCount = settings.aiCount || 0;

    if (!this.track || this.track.def.id !== trackId) {
      this.loadTrack(trackId);
    }

    const playerConfig = this.ui.getPlayerConfig();
    const carConfig = CARS.find(c => c.id === playerConfig.carId) || CARS[0];
    this.setupPlayerCar(carConfig, playerConfig.skinFileName, playerConfig.color);
    this.playerCar.totalLaps = laps;

    this.clearOpponents();

    const playersList = Array.from(this.multiplayer.players.values());
    const myIndex = playersList.findIndex(p => p.id === this.multiplayer.localPlayerId);
    this.positionCarAtStart(this.playerCar, myIndex >= 0 ? myIndex : 0);

    // Remote Players
    playersList.forEach((p, idx) => {
      if (p.id !== this.multiplayer.localPlayerId) {
        const remoteCarDef = CARS.find(c => c.id === p.carId) || CARS[0];
        const remoteSkin = p.skinFileName || 'Gemini_Generated_Image_4g9dic4g9dic4g9d.jpg';
        const remoteCar = new Car(remoteCarDef, remoteSkin, p.color, false);
        remoteCar.game = this;
        remoteCar.totalLaps = laps;
        const built = this.carBuilder.createCar(remoteCarDef.id, remoteSkin, p.color, true);
        remoteCar.setModel(built);
        this.scene.add(remoteCar.model);
        this.positionCarAtStart(remoteCar, idx);

        this.remotePlayers.set(p.id, {
          car: remoteCar,
          name: p.name,
          skinFileName: remoteSkin,
          targetPos: remoteCar.position.clone(),
          targetRotY: remoteCar.rotationY
        });
      }
    });

    // Fill with AI if requested by host
    if (aiCount > 0) {
      const startGridIdx = playersList.length;
      for (let i = 0; i < aiCount; i++) {
        const aiCarDef = CARS[i % CARS.length];
        const aiSkin = SKINS[i % SKINS.length].file;
        const ai = new AICar(aiCarDef, aiSkin, '#ff5500', `บอทอาชิ #${i + 1}`, (i % 2 === 0 ? -2.5 : 2.5), 0.88);
        ai.game = this;
        ai.totalLaps = laps;
        const built = this.carBuilder.createCar(aiCarDef.id, aiSkin, '#ff5500', true);
        ai.setModel(built);
        this.scene.add(ai.model);
        this.positionCarAtStart(ai, startGridIdx + i);
        this.aiCars.push(ai);
      }
    }

    this.ui.showView('hud');
    this.startCountdown();
  }

  onRemoteRacerTransform(data) {
    const remote = this.remotePlayers.get(data.peerId);
    if (!remote || !remote.car) return;

    remote.targetPos.set(data.x, data.y, data.z);
    remote.targetRotY = data.rotY;
    remote.car.speed = data.speed;
    remote.car.isDrifting = data.isDrifting;
    remote.car.boostTimer = data.boostTimer;
    remote.car.lap = data.lap;
    remote.car.totalDistance = data.totalDistance;
    remote.car.isFinished = data.isFinished;
  }

  onChatMessage(packet) {
    this.hud.showNotification(`${packet.senderName}: ${packet.message}`);
    this.hud.showReaction(packet.message, 3000);
  }

  sendEmote(text) {
    if (this.state === 'RACING') {
      this.hud.showReaction(text, 2500);
      if (this.gameMode === 'multiplayer') {
        this.multiplayer.sendChat(text);
      }
    }
  }

  // --- Garage Preview ---
  enterGaragePreview(carId, skinFileName, color) {
    this.state = 'GARAGE';
    if (this.garageCarMesh) {
      this.scene.remove(this.garageCarMesh.root);
    }

    this.garageCarMesh = this.carBuilder.createCar(carId, skinFileName, color, false);
    this.garageCarMesh.root.position.set(0, 0.9, 0);
    this.scene.add(this.garageCarMesh.root);

    this.camera.position.set(0, 2.4, 6.5);
    this.camera.lookAt(0, 0.8, 0);
  }

  updateGarageSkin(skinFileName) {
    if (this.state !== 'GARAGE') return;
    const car = this.ui.getSelectedCar();
    this.enterGaragePreview(car.id, skinFileName, this.ui.currentColor);
  }

  updateGarageColor(color) {
    if (this.state !== 'GARAGE') return;
    const car = this.ui.getSelectedCar();
    this.enterGaragePreview(car.id, this.ui.getSelectedSkinFile(), color);
  }

  exitGaragePreview() {
    if (this.garageCarMesh) {
      this.scene.remove(this.garageCarMesh.root);
      this.garageCarMesh = null;
    }
    this.state = 'MENU';
  }

  // --- Main Loop ---
  animate() {
    requestAnimationFrame(() => this.animate());

    const delta = Math.min(this.clock.getDelta(), 0.08);

    if (this.state === 'GARAGE' && this.garageCarMesh) {
      this.garageAngle += delta * 0.6;
      this.garageCarMesh.root.rotation.y = this.garageAngle;
      this.renderer.render(this.scene, this.camera);
      return;
    }

    if (this.state === 'MENU' || this.state === 'STAGE_SELECT' || this.state === 'LOBBY') {
      const time = performance.now() * 0.0003;
      const camX = Math.cos(time) * 45;
      const camZ = Math.sin(time) * 45 + 20;
      this.camera.position.set(camX, 15, camZ);
      this.camera.lookAt(0, 2, 20);
      if (this.decorations) this.decorations.update(delta, this.camera);
      this.renderer.render(this.scene, this.camera);
      return;
    }

    if (this.state === 'RACING') {
      this.updateRace(delta);
    }

    if (this.track) this.track.update(delta);
    if (this.decorations) this.decorations.update(delta, this.camera);
    if (this.particles) this.particles.update(delta, this.camera);

    this.renderer.render(this.scene, this.camera);
  }

  updateRace(delta) {
    // 1. Process Player Controls
    if (this.isRacing) {
      this.updatePlayerInputs();
    } else {
      this.playerCar.inputs.throttle = 0;
      this.playerCar.inputs.steer = 0;
      this.playerCar.inputs.boost = false;
      this.playerCar.inputs.drift = false;
    }

    this.playerCar.update(delta, this.track);

    // Audio update for player engine
    this.audio.updateEngine(
      this.playerCar.getSpeedKmh(),
      this.playerCar.inputs.throttle,
      this.playerCar.isDrifting,
      this.playerCar.boostTimer > 0
    );

    // Nitro sound trigger
    if (this.playerCar.boostTimer > 1.95 && this.playerCar.inputs.boost) {
      this.audio.playBoostSound();
      this.hud.showReaction('🚀 บูสต์ติดจรวด!', 1200);
    }

    // Tire smoke particles on drift
    if (this.playerCar.isDrifting) {
      const smokePosL = this.playerCar.position.clone().add(new THREE.Vector3(-0.6, 0.1, -1.0).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.playerCar.rotationY));
      const smokePosR = this.playerCar.position.clone().add(new THREE.Vector3(0.6, 0.1, -1.0).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.playerCar.rotationY));
      this.particles.emitTireSmoke(smokePosL);
      this.particles.emitTireSmoke(smokePosR);

      // Mini-turbo sparks
      if (this.playerCar.driftLevel > 0) {
        this.particles.emitDriftSparks(smokePosL, this.playerCar.driftLevel);
        this.particles.emitDriftSparks(smokePosR, this.playerCar.driftLevel);
      }
    }

    // Exhaust Nitro Flames
    if (this.playerCar.boostTimer > 0 && this.playerCar.exhaustPipes) {
      this.particles.emitExhaustFlame(this.playerCar.exhaustPipes, true);
    }

    // 2. Update AI Cars
    const allRacerCars = [
      this.playerCar,
      ...this.aiCars,
      ...Array.from(this.remotePlayers.values()).map(r => r.car)
    ];

    this.aiCars.forEach(ai => {
      ai.updateAI(delta, this.track, this.playerCar, allRacerCars);
      if (ai.isDrifting) {
        this.particles.emitTireSmoke(ai.position);
      }
    });

    // 3. Update Remote Multiplayer Cars (Interpolation)
    this.remotePlayers.forEach(remote => {
      remote.car.position.lerp(remote.targetPos, delta * 15);
      remote.car.rotationY = THREE.MathUtils.lerp(remote.car.rotationY, remote.targetRotY, delta * 15);
      remote.car.updateVisuals(delta);
    });

    // 4. Update Item System (Boxes, Bananas, Missiles)
    if (this.items) {
      const opponents = [
        ...this.aiCars,
        ...Array.from(this.remotePlayers.values()).map(r => r.car)
      ];
      this.items.update(delta, this.playerCar, opponents);
    }

    // 5. Send Multiplayer Network Packet at ~25Hz
    if (this.gameMode === 'multiplayer' && this.isRacing) {
      const now = performance.now();
      if (!this.lastNetPacket || now - this.lastNetPacket > 40) {
        this.lastNetPacket = now;
        this.multiplayer.sendTransform({
          x: this.playerCar.position.x,
          y: this.playerCar.position.y,
          z: this.playerCar.position.z,
          rotY: this.playerCar.rotationY,
          speed: this.playerCar.speed,
          isDrifting: this.playerCar.isDrifting,
          boostTimer: this.playerCar.boostTimer,
          lap: this.playerCar.lap,
          totalDistance: this.playerCar.totalDistance,
          isFinished: this.playerCar.isFinished
        });
      }
    }

    // 6. Compute Real-time Rankings
    const allRacers = [
      { name: this.ui.playerName, car: this.playerCar, isPlayer: true, carName: this.playerCar.config.nameTh, skinFileName: this.playerCar.skinFileName },
      ...this.aiCars.map(ai => ({ name: ai.name, car: ai, isPlayer: false, carName: ai.config.nameTh, skinFileName: ai.skinFileName })),
      ...Array.from(this.remotePlayers.values()).map(r => ({ name: r.name, car: r.car, isPlayer: false, carName: r.car.config.nameTh, skinFileName: r.skinFileName }))
    ];

    allRacers.sort((a, b) => b.car.totalDistance - a.car.totalDistance);
    const playerRank = allRacers.findIndex(r => r.isPlayer) + 1;

    // 7. Update HUD & Minimap
    this.hud.update(this.playerCar, playerRank, allRacers.length);
    if (this.minimap) {
      this.minimap.render(this.playerCar, allRacers.filter(r => !r.isPlayer).map(r => r.car));
    }

    // 8. Check Victory / Finish Condition
    if (this.playerCar.isFinished && this.state !== 'VICTORY') {
      this.state = 'VICTORY';
      this.audio.playVictoryChime();

      const totalTime = (performance.now() - this.raceStartTime) / 1000;
      const results = allRacers.map(r => ({
        name: r.name,
        carName: r.carName,
        skinFileName: r.skinFileName,
        isPlayer: r.isPlayer,
        totalTime: r.isPlayer ? totalTime : totalTime + (Math.random() * 4 - 2),
        bestLap: r.car.bestLapTime || totalTime / 3
      }));

      setTimeout(() => {
        this.ui.showVictoryScreen(results);
      }, 1500);
    }

    // 9. Dynamic Camera Follow
    this.updateCamera(delta);
  }

  updateCamera(delta) {
    if (!this.playerCar) return;

    const carPos = this.playerCar.position;
    const carRotY = this.playerCar.rotationY;

    let offset = this.cameraOffset;
    let lookTargetOffset = this.cameraLookOffset;

    if (this.cameraMode === 1) {
      offset = new THREE.Vector3(0, 2.5, -5.0);
      lookTargetOffset = new THREE.Vector3(0, 1.0, 3.5);
    } else if (this.cameraMode === 2) {
      offset = new THREE.Vector3(0, 1.2, 0.4);
      lookTargetOffset = new THREE.Vector3(0, 1.1, 12);
    }

    const speedRatio = Math.min(1.5, Math.abs(this.playerCar.speed) / 35);
    const targetFov = (this.playerCar.boostTimer > 0) ? 82 : 65 + (speedRatio * 10);
    this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, targetFov, delta * 6);
    this.camera.updateProjectionMatrix();

    const rotatedOffset = offset.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), carRotY);
    const targetCamPos = carPos.clone().add(rotatedOffset);

    this.camera.position.lerp(targetCamPos, delta * 12);

    const rotatedLookTarget = lookTargetOffset.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), carRotY);
    const lookAtPos = carPos.clone().add(rotatedLookTarget);
    this.camera.lookAt(lookAtPos);
  }

  initInputs() {
    window.addEventListener('keydown', (e) => {
      this.keys[e.code] = true;

      // Switch camera view
      if (e.code === 'KeyC') {
        this.cameraMode = (this.cameraMode + 1) % 3;
        const modes = ['กล้อง: ตามหลังมุมกว้าง', 'กล้อง: ระยะประชิด', 'กล้อง: หน้ารถ'];
        this.hud.showReaction(modes[this.cameraMode], 1200);
      }

      // Use Item with Q or F
      if ((e.code === 'KeyQ' || e.code === 'KeyF') && this.state === 'RACING') {
        if (this.items) {
          this.items.useItem(this.playerCar);
        }
      }

      // Respawn shortcut
      if (e.code === 'KeyR' && this.state === 'RACING') {
        this.playerCar.respawn(this.track);
        this.hud.showReaction('🔄 รีเซ็ตรถกลับแทร็ก!', 1200);
      }
    });

    window.addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
    });

    // Mobile / Touch controls
    const bindTouch = (id, keyName) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('touchstart', (e) => { e.preventDefault(); this.keys[keyName] = true; });
      el.addEventListener('touchend', (e) => { e.preventDefault(); this.keys[keyName] = false; });
      el.addEventListener('mousedown', () => { this.keys[keyName] = true; });
      el.addEventListener('mouseup', () => { this.keys[keyName] = false; });
    };

    bindTouch('btn-touch-gas', 'KeyW');
    bindTouch('btn-touch-brake', 'KeyS');
    bindTouch('btn-touch-left', 'KeyA');
    bindTouch('btn-touch-right', 'KeyD');
    bindTouch('btn-touch-drift', 'Space');
    bindTouch('btn-touch-boost', 'ShiftLeft');
    bindTouch('btn-touch-item', 'KeyQ');
  }

  updatePlayerInputs() {
    let throttle = 0;
    let steer = 0;

    // Keyboard
    if (this.keys['KeyW'] || this.keys['ArrowUp']) throttle += 1;
    if (this.keys['KeyS'] || this.keys['ArrowDown']) throttle -= 1;
    if (this.keys['KeyA'] || this.keys['ArrowLeft']) steer += 1;
    if (this.keys['KeyD'] || this.keys['ArrowRight']) steer -= 1;

    // Gamepad API support
    const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
    if (gamepads && gamepads[0]) {
      const gp = gamepads[0];
      if (Math.abs(gp.axes[0]) > 0.15) steer -= gp.axes[0];
      if (gp.buttons[7] && gp.buttons[7].value > 0.1) throttle += gp.buttons[7].value;
      if (gp.buttons[6] && gp.buttons[6].value > 0.1) throttle -= gp.buttons[6].value;
      if (gp.buttons[0] && gp.buttons[0].pressed) this.keys['ShiftLeft'] = true;
      if (gp.buttons[2] && gp.buttons[2].pressed) this.keys['Space'] = true;
      if (gp.buttons[1] && gp.buttons[1].pressed) {
        if (this.items) this.items.useItem(this.playerCar);
      }
    }

    this.playerCar.inputs.throttle = throttle;
    this.playerCar.inputs.steer = steer;
    this.playerCar.inputs.drift = !!this.keys['Space'];
    this.playerCar.inputs.boost = !!(this.keys['ShiftLeft'] || this.keys['ShiftRight'] || this.keys['KeyE']);
  }

  restartRace() {
    this.startSinglePlayer(this.gameMode, this.currentTrackId, this.currentDifficulty, this.currentLaps);
  }

  exitToMainMenu() {
    this.clearOpponents();
    this.state = 'MENU';
    this.audio.updateEngine(0, 0, false, false);
    this.positionCarAtStart(this.playerCar, 0);
  }

  onWindowResize() {
    if (!this.camera || !this.renderer) return;
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }
}
