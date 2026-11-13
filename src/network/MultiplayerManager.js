import { Peer } from 'peerjs';

export class MultiplayerManager {
  constructor(onStateChange, onChatMessage) {
    this.onStateChange = onStateChange;
    this.onChatMessage = onChatMessage;
    this.ws = null;
    this.peer = null;
    this.isHost = false;
    this.roomCode = null;
    this.maxPlayers = 8;
    this.connections = new Map(); // PeerJS fallback
    this.hostConn = null;          // PeerJS fallback
    this.players = new Map();     // peerId -> playerInfo
    this.localPlayerId = null;
    this.useWebSocket = true;
    this.roomSettings = { trackId: 'buriram', laps: 3, aiCount: 'auto' };
    this.connectionState = 'idle';
    this.latencyMs = null;

    this._txSeq = 0;
    this._pingTimer = null;
    this._manualClose = false;
    this._pendingAction = null;

    this.localPlayerInfo = {
      name: 'นักซิ่งอาชิ',
      carId: 'gt',
      skinFileName: 'Gemini_Generated_Image_4g9dic4g9dic4g9d.jpg',
      color: '#00f0ff',
      addons: {},
      isReady: false
    };

    this.onStartRaceCallback = null;
    this.onStartCountdown = null;
    this.onRacerTransform = null;
    this.onStatusChange = null;
    this.onLatencyUpdate = null;
    this.onSettingsChange = null;
    this.onConnectionLost = null;
  }

  normalizeRoomCode(raw) {
    return String(raw || '')
      .toUpperCase()
      .trim()
      .replace(/^ASHI[-_\s]?/, '')
      .replace(/[^A-Z0-9-]/g, '');
  }

  setConnectionState(state, message = '') {
    this.connectionState = state;
    if (this.onStatusChange) {
      this.onStatusChange({
        state,
        message,
        latencyMs: this.latencyMs,
        transport: this.useWebSocket ? 'ws' : 'peer'
      });
    }
  }

  warmUpServer() {
    try {
      const loc = window.location;
      const baseUrl = loc.host.includes('github.io')
        ? 'https://ashilongrace.onrender.com'
        : `${loc.protocol}//${loc.host}`;
      fetch(`${baseUrl}/health`, { method: 'GET', cache: 'no-store' }).catch(() => {});
    } catch (e) {}
  }

  clearPendingAction() {
    if (this._pendingAction) {
      if (this._pendingAction.timer) clearTimeout(this._pendingAction.timer);
      this._pendingAction = null;
    }
  }

  startHeartbeat() {
    this.stopHeartbeat();
    const sendPing = () => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        try {
          this.ws.send(JSON.stringify({ type: 'PING', t: Date.now() }));
        } catch (e) {}
      }
    };
    sendPing();
    this._pingTimer = setInterval(sendPing, 5000);
  }

  stopHeartbeat() {
    if (this._pingTimer) {
      clearInterval(this._pingTimer);
      this._pingTimer = null;
    }
  }

  getWebSocketUrl() {
    if (typeof window === 'undefined') return 'ws://localhost:3000';
    const loc = window.location;
    // If playing on GitHub Pages (static), connect to the production Render server
    if (loc.host.includes('github.io')) {
      return 'wss://ashilongrace.onrender.com';
    }
    const protocol = loc.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = loc.host || 'localhost:3000';
    return `${protocol}//${host}`;
  }

  generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 4; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  createRoom(playerInfo, onRoomCreated, onError, initialSettings = null) {
    this.disconnect(true);
    this._manualClose = false;
    this.isHost = true;
    this.roomCode = this.generateRoomCode();
    this.roomSettings = {
      trackId: initialSettings?.trackId || 'buriram',
      laps: initialSettings?.laps || 3,
      aiCount: initialSettings?.aiCount ?? 'auto'
    };
    this.localPlayerInfo = { ...this.localPlayerInfo, ...playerInfo, isReady: true, isHost: true };
    this.localPlayerId = `p_${Math.random().toString(36).substring(2, 9)}`;
    this.setConnectionState('connecting', 'กำลังสร้างห้องและเชื่อมต่อเซิร์ฟเวอร์...');

    // 1. Try WebSocket Server first (best performance, 100% mobile/NAT compatible)
    this.connectWebSocket((ws) => {
      this._pendingAction = {
        type: 'create',
        onSuccess: onRoomCreated,
        onError,
        timer: setTimeout(() => {
          if (this._pendingAction?.type === 'create') {
            const errCb = this._pendingAction.onError;
            this.clearPendingAction();
            this.setConnectionState('error', 'หมดเวลาการตอบกลับจากเซิร์ฟเวอร์');
            if (errCb) errCb(new Error('หมดเวลาการตอบกลับในการสร้างห้อง กรุณาลองใหม่'));
          }
        }, 8000)
      };

      ws.send(JSON.stringify({
        type: 'CREATE_ROOM',
        roomCode: this.roomCode,
        settings: this.roomSettings,
        player: {
          id: this.localPlayerId,
          ...this.localPlayerInfo
        }
      }));
    }, (err) => {
      console.warn('WebSocket createRoom failed, falling back to PeerJS:', err);
      this.createRoomPeerJS(onRoomCreated, onError);
    });
  }

  joinRoom(roomCode, playerInfo, onJoined, onError) {
    const normalized = this.normalizeRoomCode(roomCode);
    if (!normalized || normalized.length < 3) {
      if (onError) onError(new Error('กรุณากรอกรหัสห้องให้ถูกต้อง (อย่างน้อย 3 ตัวอักษร)'));
      return;
    }

    this.disconnect(true);
    this._manualClose = false;
    this.isHost = false;
    this.roomCode = normalized;
    this.localPlayerInfo = { ...this.localPlayerInfo, ...playerInfo, isReady: false, isHost: false };
    this.localPlayerId = `p_${Math.random().toString(36).substring(2, 9)}`;
    this.setConnectionState('connecting', `กำลังเชื่อมต่อเข้าห้อง ${this.roomCode}...`);

    // 1. Try WebSocket Server first
    this.connectWebSocket((ws) => {
      this._pendingAction = {
        type: 'join',
        onSuccess: onJoined,
        onError,
        timer: setTimeout(() => {
          if (this._pendingAction?.type === 'join') {
            const errCb = this._pendingAction.onError;
            this.clearPendingAction();
            this.setConnectionState('error', 'หมดเวลาการตอบกลับจากห้อง');
            if (errCb) errCb(new Error('ไม่พบการตอบกลับจากห้อง กรุณาลองใหม่อีกครั้ง'));
          }
        }, 8000)
      };

      ws.send(JSON.stringify({
        type: 'JOIN_ROOM',
        roomCode: this.roomCode,
        player: {
          id: this.localPlayerId,
          ...this.localPlayerInfo
        }
      }));
    }, (err) => {
      console.warn('WebSocket joinRoom failed, falling back to PeerJS:', err);
      this.joinRoomPeerJS(this.roomCode, onJoined, onError);
    });
  }

  connectWebSocket(onReady, onError) {
    try {
      const url = this.getWebSocketUrl();
      const ws = new WebSocket(url);
      let isConnected = false;
      let hasErrored = false;

      const timeout = setTimeout(() => {
        if (!isConnected && !hasErrored) {
          hasErrored = true;
          try { ws.close(); } catch (e) {}
          if (onError) onError(new Error('หมดเวลาเชื่อมต่อเซิร์ฟเวอร์ WebSocket'));
        }
      }, 9000);

      ws.onopen = () => {
        isConnected = true;
        clearTimeout(timeout);
        this.ws = ws;
        this.useWebSocket = true;
        this.startHeartbeat();
        if (onReady) onReady(ws);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this.handleServerMessage(data);
        } catch (e) {
          console.error('WS Parse Error:', e);
        }
      };

      ws.onclose = () => {
        const wasOpen = this.ws === ws;
        this.ws = null;
        this.stopHeartbeat();
        if (this._pendingAction && !this._manualClose && wasOpen) {
          const errCb = this._pendingAction.onError;
          this.clearPendingAction();
          this.setConnectionState('disconnected', 'การเชื่อมต่อถูกตัด');
          if (errCb) errCb(new Error('การเชื่อมต่อกับเซิร์ฟเวอร์ถูกตัดขาด'));
          return;
        }
        if (wasOpen && !this._manualClose) {
          this.setConnectionState('disconnected', 'หลุดการเชื่อมต่อจากเซิร์ฟเวอร์');
          if (this.onConnectionLost) {
            this.onConnectionLost('หลุดการเชื่อมต่อจากเซิร์ฟเวอร์');
          }
        }
      };

      ws.onerror = (err) => {
        if (!isConnected && !hasErrored) {
          hasErrored = true;
          clearTimeout(timeout);
          if (onError) onError(err);
        }
      };
    } catch (e) {
      if (onError) onError(e);
    }
  }

  handleServerMessage(data) {
    if (data.type === 'PONG') {
      if (data.t) {
        this.latencyMs = Math.max(1, Date.now() - data.t);
        if (this.onLatencyUpdate) {
          this.onLatencyUpdate(this.latencyMs, 'ws');
        }
      }
      return;
    }

    if (data.type === 'ROOM_CREATED') {
      this.roomCode = data.roomCode;
      this.localPlayerId = data.playerId;
      this.isHost = true;
      if (data.settings) this.roomSettings = { ...this.roomSettings, ...data.settings };
    } else if (data.type === 'WELCOME') {
      this.roomCode = data.roomCode;
      this.isHost = data.isHost;
      if (data.localPlayerId) this.localPlayerId = data.localPlayerId;
      this.maxPlayers = data.maxPlayers || 8;
      if (data.settings) {
        this.roomSettings = { ...this.roomSettings, ...data.settings };
        if (this.onSettingsChange) this.onSettingsChange(this.roomSettings);
      }
      this.players.clear();
      data.players.forEach(p => this.players.set(p.id, p));
      this.setConnectionState('connected', 'เชื่อมต่อห้องสำเร็จ');

      if (this._pendingAction) {
        const successCb = this._pendingAction.onSuccess;
        this.clearPendingAction();
        if (successCb) successCb(this.roomCode);
      }
      this.notifyState();
    } else if (data.type === 'PLAYER_JOINED') {
      this.players.set(data.player.id, data.player);
      this.notifyState();
    } else if (data.type === 'PLAYER_UPDATED') {
      this.players.set(data.peerId, data.player);
      this.notifyState();
    } else if (data.type === 'PLAYER_LEFT') {
      this.players.delete(data.peerId);
      this.notifyState();
    } else if (data.type === 'HOST_CHANGED') {
      this.players.forEach((p, id) => {
        p.isHost = id === data.newHostId;
        if (p.isHost) p.isReady = true;
      });
      this.isHost = data.newHostId === this.localPlayerId;
      this.notifyState();
    } else if (data.type === 'ROOM_SETTINGS') {
      if (data.settings) {
        this.roomSettings = { ...this.roomSettings, ...data.settings };
        if (this.onSettingsChange) this.onSettingsChange(this.roomSettings);
        this.notifyState();
      }
    } else if (data.type === 'START_RACE') {
      if (this.onStartRaceCallback) {
        this.onStartRaceCallback(data);
      }
    } else if (data.type === 'START_COUNTDOWN') {
      if (this.onStartCountdown) {
        this.onStartCountdown(data);
      }
    } else if (data.type === 'CAR_TRANSFORM') {
      if (this.onRacerTransform) {
        this.onRacerTransform(data);
      }
    } else if (data.type === 'CHAT') {
      if (this.onChatMessage) this.onChatMessage(data);
    } else if (data.type === 'ERROR') {
      const msg = data.message || 'เกิดข้อผิดพลาดในการเชื่อมต่อห้อง';
      if (this._pendingAction) {
        const errCb = this._pendingAction.onError;
        this.clearPendingAction();
        this.setConnectionState('error', msg);
        this.disconnect(true);
        if (errCb) errCb(new Error(msg));
      } else {
        this.setConnectionState('error', msg);
        if (this.onConnectionLost) this.onConnectionLost(msg);
        this.disconnect(true);
      }
    }
  }

  // --- PeerJS Fallback Implementation ---
  createRoomPeerJS(onRoomCreated, onError) {
    this.useWebSocket = false;
    const peerId = `ashilane-${this.roomCode.toLowerCase()}`;
    this.initPeer(peerId, () => {
      this.localPlayerId = this.peer.id;
      this.players.set(this.localPlayerId, {
        id: this.localPlayerId,
        ...this.localPlayerInfo,
        isHost: true
      });
      if (onRoomCreated) onRoomCreated(this.roomCode);
      this.notifyState();
    }, onError);

    this.peer.on('connection', (conn) => {
      this.handleIncomingConnection(conn);
    });
  }

  joinRoomPeerJS(roomCode, onJoined, onError) {
    this.useWebSocket = false;
    this.initPeer(null, () => {
      this.localPlayerId = this.peer.id;
      const hostPeerId = `ashilane-${roomCode.toLowerCase()}`;
      const conn = this.peer.connect(hostPeerId, { reliable: true });

      conn.on('open', () => {
        this.hostConn = conn;
        conn.send({
          type: 'JOIN',
          player: {
            id: this.localPlayerId,
            ...this.localPlayerInfo
          }
        });
        if (onJoined) onJoined(roomCode);
      });

      conn.on('data', (data) => {
        this.handleClientReceivedData(data);
      });

      conn.on('close', () => {
        if (!this._manualClose && this.onConnectionLost) {
          this.onConnectionLost('หลุดการเชื่อมต่อจากเจ้าของห้อง (Host disconnected)');
        }
      });

      conn.on('error', (err) => {
        if (onError) onError(err);
      });
    }, onError);
  }

  initPeer(peerId, onSuccess, onError) {
    try {
      const peerConfig = {
        config: {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' }
          ]
        }
      };
      this.peer = peerId ? new Peer(peerId, peerConfig) : new Peer(peerConfig);
      this.peer.on('open', () => {
        if (onSuccess) onSuccess();
      });
      this.peer.on('error', (err) => {
        console.error('PeerJS error:', err);
        if (onError) onError(err);
      });
    } catch (e) {
      if (onError) onError(e);
    }
  }

  handleIncomingConnection(conn) {
    if (this.players.size >= this.maxPlayers) {
      conn.send({ type: 'ERROR', message: `ห้องเต็มแล้ว (สูงสุด ${this.maxPlayers} คน)` });
      setTimeout(() => conn.close(), 500);
      return;
    }

    conn.on('open', () => {
      this.connections.set(conn.peer, conn);
    });

    conn.on('data', (data) => {
      this.handleHostReceivedData(conn.peer, data);
    });

    conn.on('close', () => {
      this.connections.delete(conn.peer);
      this.players.delete(conn.peer);
      this.broadcast({
        type: 'PLAYER_LEFT',
        peerId: conn.peer
      });
      this.notifyState();
    });
  }

  handleHostReceivedData(senderPeerId, data) {
    if (data.type === 'JOIN') {
      const newPlayer = {
        id: senderPeerId,
        ...data.player,
        isHost: false
      };
      this.players.set(senderPeerId, newPlayer);

      const conn = this.connections.get(senderPeerId);
      if (conn) {
        conn.send({
          type: 'WELCOME',
          players: Array.from(this.players.values()),
          isHost: false,
          maxPlayers: this.maxPlayers
        });
      }

      this.broadcast({
        type: 'PLAYER_JOINED',
        player: newPlayer
      }, senderPeerId);

      this.notifyState();
    } else if (data.type === 'UPDATE_PLAYER') {
      const p = this.players.get(senderPeerId);
      if (p) {
        Object.assign(p, data.player);
        this.broadcast({
          type: 'PLAYER_UPDATED',
          peerId: senderPeerId,
          player: p
        });
        this.notifyState();
      }
    } else if (data.type === 'CAR_TRANSFORM') {
      // 1. Relay to all other peer clients
      this.broadcast(data, senderPeerId);
      // 2. CRITICAL FIX: Host MUST also process remote racer transform for its own game!
      if (this.onRacerTransform) {
        this.onRacerTransform(data);
      }
    } else if (data.type === 'CHAT') {
      this.broadcast(data);
      if (this.onChatMessage) this.onChatMessage(data);
    }
  }

  handleClientReceivedData(data) {
    if (data.type === 'WELCOME') {
      this.players.clear();
      data.players.forEach(p => this.players.set(p.id, p));
      this.notifyState();
    } else if (data.type === 'PLAYER_JOINED') {
      this.players.set(data.player.id, data.player);
      this.notifyState();
    } else if (data.type === 'PLAYER_UPDATED') {
      this.players.set(data.peerId, data.player);
      this.notifyState();
    } else if (data.type === 'PLAYER_LEFT') {
      this.players.delete(data.peerId);
      this.notifyState();
    } else if (data.type === 'START_RACE') {
      if (this.onStartRaceCallback) {
        this.onStartRaceCallback(data);
      }
    } else if (data.type === 'START_COUNTDOWN') {
      if (this.onStartCountdown) {
        this.onStartCountdown(data);
      }
    } else if (data.type === 'CAR_TRANSFORM') {
      if (this.onRacerTransform) {
        this.onRacerTransform(data);
      }
    } else if (data.type === 'CHAT') {
      if (this.onChatMessage) this.onChatMessage(data);
    }
  }

  broadcast(data, excludePeerId = null) {
    this.connections.forEach((conn, peerId) => {
      if (peerId !== excludePeerId && conn.open) {
        conn.send(data);
      }
    });
  }

  sendToHost(data) {
    if (this.hostConn && this.hostConn.open) {
      this.hostConn.send(data);
    }
  }

  updateLocalPlayer(info) {
    this.localPlayerInfo = { ...this.localPlayerInfo, ...info };
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'UPDATE_PLAYER',
        player: this.localPlayerInfo
      }));
    } else if (this.isHost) {
      const p = this.players.get(this.localPlayerId);
      if (p) Object.assign(p, this.localPlayerInfo);
      this.broadcast({
        type: 'PLAYER_UPDATED',
        peerId: this.localPlayerId,
        player: this.localPlayerInfo
      });
      this.notifyState();
    } else {
      this.sendToHost({
        type: 'UPDATE_PLAYER',
        player: this.localPlayerInfo
      });
    }
  }

  updateSettings(settings) {
    if (!this.isHost || !settings) return;
    this.roomSettings = { ...this.roomSettings, ...settings };
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'UPDATE_SETTINGS',
        settings: this.roomSettings
      }));
    } else {
      this.broadcast({
        type: 'ROOM_SETTINGS',
        settings: this.roomSettings
      });
    }
    if (this.onSettingsChange) this.onSettingsChange(this.roomSettings);
  }

  startRace(settings = {}) {
    if (!this.isHost) return;
    this.roomSettings = { ...this.roomSettings, ...settings };
    const packet = {
      type: 'START_RACE',
      startTime: Date.now() + 3000,
      settings: this.roomSettings
    };

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(packet));
    } else {
      this.broadcast(packet);
      if (this.onStartRaceCallback) {
        this.onStartRaceCallback(packet);
      }
    }
  }

  sendStartCountdown() {
    const packet = { type: 'START_COUNTDOWN', timestamp: Date.now() };
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(packet));
    } else if (this.isHost) {
      this.broadcast(packet);
    }
  }

  sendTransform(transformData) {
    const packet = {
      type: 'CAR_TRANSFORM',
      peerId: this.localPlayerId,
      seq: ++this._txSeq,
      x: Math.round((transformData.x || 0) * 100) / 100,
      y: Math.round((transformData.y || 0) * 100) / 100,
      z: Math.round((transformData.z || 0) * 100) / 100,
      rotY: Math.round((transformData.rotY || 0) * 1000) / 1000,
      speed: Math.round((transformData.speed || 0) * 10) / 10,
      isDrifting: Boolean(transformData.isDrifting),
      boostTimer: Math.round((transformData.boostTimer || 0) * 100) / 100,
      lap: transformData.lap || 1,
      totalDistance: Math.round((transformData.totalDistance || 0) * 100) / 100,
      isFinished: Boolean(transformData.isFinished)
    };

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(packet));
    } else if (this.isHost) {
      this.broadcast(packet);
    } else {
      this.sendToHost(packet);
    }
  }

  sendChat(message, emote = null) {
    const packet = {
      type: 'CHAT',
      senderId: this.localPlayerId,
      senderName: this.localPlayerInfo.name,
      message,
      emote,
      timestamp: Date.now()
    };

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(packet));
    } else if (this.isHost) {
      this.broadcast(packet);
      if (this.onChatMessage) this.onChatMessage(packet);
    } else {
      this.sendToHost(packet);
    }
  }

  notifyState() {
    if (this.onStateChange) {
      this.onStateChange({
        roomCode: this.roomCode,
        isHost: this.isHost,
        localPlayerId: this.localPlayerId,
        maxPlayers: this.maxPlayers,
        settings: this.roomSettings,
        players: Array.from(this.players.values())
      });
    }
  }

  disconnect(silent = false) {
    this._manualClose = true;
    this.stopHeartbeat();
    this.clearPendingAction();

    if (this.ws) {
      try {
        if (this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({ type: 'LEAVE_ROOM' }));
        }
        this.ws.close();
      } catch (e) {}
      this.ws = null;
    }
    if (this.peer) {
      try { this.peer.destroy(); } catch (e) {}
      this.peer = null;
    }
    this.connections.clear();
    this.players.clear();
    this.hostConn = null;
    this.latencyMs = null;
    if (!silent) {
      this.setConnectionState('idle', '');
    }
  }
}
