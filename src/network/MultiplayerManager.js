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

    this.localPlayerInfo = {
      name: 'นักซิ่งอาชิ',
      carId: 'gt',
      skinFileName: 'Gemini_Generated_Image_4g9dic4g9dic4g9d.jpg',
      color: '#00f0ff',
      addons: {},
      isReady: false
    };

    this.onStartRaceCallback = null;
    this.onRacerTransform = null;
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

  createRoom(playerInfo, onRoomCreated, onError) {
    this.isHost = true;
    this.roomCode = this.generateRoomCode();
    this.localPlayerInfo = { ...this.localPlayerInfo, ...playerInfo, isReady: true, isHost: true };
    this.localPlayerId = `p_${Math.random().toString(36).substring(2, 9)}`;

    // 1. Try WebSocket Server first (best performance, 100% mobile/NAT compatible)
    this.connectWebSocket((ws) => {
      ws.send(JSON.stringify({
        type: 'CREATE_ROOM',
        roomCode: this.roomCode,
        player: {
          id: this.localPlayerId,
          ...this.localPlayerInfo
        }
      }));
      if (onRoomCreated) onRoomCreated(this.roomCode);
    }, (err) => {
      console.warn('WebSocket createRoom failed, falling back to PeerJS:', err);
      this.createRoomPeerJS(onRoomCreated, onError);
    });
  }

  joinRoom(roomCode, playerInfo, onJoined, onError) {
    this.isHost = false;
    this.roomCode = roomCode.toUpperCase().trim();
    this.localPlayerInfo = { ...this.localPlayerInfo, ...playerInfo, isReady: false, isHost: false };
    this.localPlayerId = `p_${Math.random().toString(36).substring(2, 9)}`;

    // 1. Try WebSocket Server first
    this.connectWebSocket((ws) => {
      ws.send(JSON.stringify({
        type: 'JOIN_ROOM',
        roomCode: this.roomCode,
        player: {
          id: this.localPlayerId,
          ...this.localPlayerInfo
        }
      }));
      if (onJoined) onJoined(this.roomCode);
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

      const timeout = setTimeout(() => {
        if (!isConnected) {
          try { ws.close(); } catch (e) {}
          if (onError) onError(new Error('WebSocket connection timeout'));
        }
      }, 4000);

      ws.onopen = () => {
        isConnected = true;
        clearTimeout(timeout);
        this.ws = ws;
        this.useWebSocket = true;
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
        this.ws = null;
      };

      ws.onerror = (err) => {
        if (!isConnected) {
          clearTimeout(timeout);
          if (onError) onError(err);
        }
      };
    } catch (e) {
      if (onError) onError(e);
    }
  }

  handleServerMessage(data) {
    if (data.type === 'ROOM_CREATED') {
      this.roomCode = data.roomCode;
      this.localPlayerId = data.playerId;
      this.isHost = true;
    } else if (data.type === 'WELCOME') {
      this.roomCode = data.roomCode;
      this.isHost = data.isHost;
      if (data.localPlayerId) this.localPlayerId = data.localPlayerId;
      this.maxPlayers = data.maxPlayers || 8;
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
    } else if (data.type === 'HOST_CHANGED') {
      if (data.newHostId === this.localPlayerId) {
        this.isHost = true;
        const self = this.players.get(this.localPlayerId);
        if (self) self.isHost = true;
      }
      this.notifyState();
    } else if (data.type === 'START_RACE') {
      if (this.onStartRaceCallback) {
        this.onStartRaceCallback(data);
      }
    } else if (data.type === 'CAR_TRANSFORM') {
      if (this.onRacerTransform) {
        this.onRacerTransform(data);
      }
    } else if (data.type === 'CHAT') {
      if (this.onChatMessage) this.onChatMessage(data);
    } else if (data.type === 'ERROR') {
      alert(data.message || 'เกิดข้อผิดพลาดในการเชื่อมต่อ');
      this.disconnect();
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
        alert('หลุดการเชื่อมต่อจากเจ้าของห้อง (Host disconnected)');
      });

      conn.on('error', (err) => {
        if (onError) onError(err);
      });
    }, onError);
  }

  initPeer(peerId, onSuccess, onError) {
    try {
      this.peer = peerId ? new Peer(peerId) : new Peer();
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

  startRace(settings = {}) {
    if (!this.isHost) return;
    const packet = {
      type: 'START_RACE',
      startTime: Date.now() + 3000,
      settings
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

  sendTransform(transformData) {
    const packet = {
      type: 'CAR_TRANSFORM',
      peerId: this.localPlayerId,
      ...transformData
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
        players: Array.from(this.players.values())
      });
    }
  }

  disconnect() {
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
  }
}
