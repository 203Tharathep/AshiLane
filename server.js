import express from 'express';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const PORT = process.env.PORT || 3000;
const MAX_PLAYERS_PER_ROOM = 8;
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateUniqueRoomCode(roomsMap) {
  for (let attempt = 0; attempt < 20; attempt++) {
    let code = '';
    for (let i = 0; i < 4; i++) {
      code += CODE_CHARS.charAt(Math.floor(Math.random() * CODE_CHARS.length));
    }
    if (!roomsMap.has(code)) return code;
  }
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function normalizeRoomCode(raw) {
  return String(raw || '')
    .toUpperCase()
    .trim()
    .replace(/^ASHI[-_\s]?/, '')
    .replace(/[^A-Z0-9-]/g, '');
}

function sanitizePlayer(raw = {}, fallbackId, isHost = false) {
  return {
    id: String(raw.id || fallbackId).slice(0, 32),
    name: String(raw.name || 'นักซิ่งอาชิ').trim().slice(0, 24) || 'นักซิ่งอาชิ',
    carId: String(raw.carId || 'gt').slice(0, 24),
    skinFileName: String(raw.skinFileName || 'Gemini_Generated_Image_4g9dic4g9dic4g9d.jpg').slice(0, 120),
    color: String(raw.color || '#00f0ff').slice(0, 16),
    addons: raw.addons && typeof raw.addons === 'object' ? raw.addons : {},
    isReady: isHost ? true : Boolean(raw.isReady),
    isHost: Boolean(isHost)
  };
}

// Health check endpoint for Render monitoring & client wake-up pings
app.get('/health', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({ status: 'ok', rooms: rooms.size, uptime: process.uptime() });
});

// Case-insensitive static file resolver (solves Linux/Render .MOV vs .mov, .JPG vs .jpg, audio files)
function caseInsensitiveStatic(baseDir) {
  return (req, res, next) => {
    try {
      const decodedPath = decodeURIComponent(req.path);
      const targetPath = path.normalize(path.join(baseDir, decodedPath));
      if (!targetPath.startsWith(path.normalize(baseDir))) {
        return next();
      }
      if (fs.existsSync(targetPath) && fs.statSync(targetPath).isFile()) {
        if (targetPath.includes(`${path.sep}assets${path.sep}`)) {
          res.setHeader('Cache-Control', 'public, max-age=86400');
        }
        return res.sendFile(targetPath);
      }
      const segments = decodedPath.split(/[/\\]/).filter(Boolean);
      let curr = baseDir;
      let matched = true;
      for (const seg of segments) {
        if (!fs.existsSync(curr) || !fs.statSync(curr).isDirectory()) {
          matched = false;
          break;
        }
        const entries = fs.readdirSync(curr);
        const hit = entries.find(e => e.toLowerCase() === seg.toLowerCase());
        if (hit) {
          curr = path.join(curr, hit);
        } else {
          matched = false;
          break;
        }
      }
      if (matched && fs.existsSync(curr) && fs.statSync(curr).isFile()) {
        if (curr.includes(`${path.sep}assets${path.sep}`)) {
          res.setHeader('Cache-Control', 'public, max-age=86400');
        }
        return res.sendFile(curr);
      }
    } catch (e) {}
    next();
  };
}

// Serve static files (with case-insensitive resolution for assets and dist)
app.use('/assets', caseInsensitiveStatic(path.join(__dirname, 'public/assets')));
app.use(caseInsensitiveStatic(path.join(__dirname, 'dist')));
app.use(express.static(path.join(__dirname, 'dist'), { maxAge: '1h' }));
app.use('/assets', express.static(path.join(__dirname, 'public/assets'), { maxAge: '1d' }));

// In-Memory Room Store:
// roomCode -> { code, hostId, maxPlayers, status, settings, createdAt, members: Map<WebSocket, playerInfo> }
const rooms = new Map();

function safeSend(ws, payload) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  try {
    const msg = typeof payload === 'string' ? payload : JSON.stringify(payload);
    ws.send(msg);
  } catch (e) {}
}

function broadcastToRoom(room, data, excludeWs = null) {
  if (!room || !room.members) return;
  const msg = typeof data === 'string' ? data : JSON.stringify(data);
  room.members.forEach((player, clientWs) => {
    if (clientWs !== excludeWs) {
      safeSend(clientWs, msg);
    }
  });
}

wss.on('connection', (ws) => {
  let currentRoomCode = null;
  let currentPlayerData = null;

  // Heartbeat ping/pong
  ws.isAlive = true;
  ws.on('pong', () => {
    ws.isAlive = true;
  });

  const cleanupClient = () => {
    if (currentRoomCode && rooms.has(currentRoomCode)) {
      const room = rooms.get(currentRoomCode);
      const leavingPlayer = room.members.get(ws);
      room.members.delete(ws);

      if (leavingPlayer) {
        broadcastToRoom(room, {
          type: 'PLAYER_LEFT',
          peerId: leavingPlayer.id
        });
      }

      // If room is empty, delete it
      if (room.members.size === 0) {
        rooms.delete(currentRoomCode);
      } else if (leavingPlayer && leavingPlayer.id === room.hostId) {
        // Auto-promote next remaining member to Host
        const nextEntry = room.members.entries().next().value;
        const nextPlayer = nextEntry ? nextEntry[1] : null;
        if (nextPlayer) {
          nextPlayer.isHost = true;
          nextPlayer.isReady = true;
          room.hostId = nextPlayer.id;
          broadcastToRoom(room, {
            type: 'HOST_CHANGED',
            newHostId: nextPlayer.id
          });
        }
      }
    }
    currentRoomCode = null;
    currentPlayerData = null;
  };

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);

      // 0. APPLICATION HEARTBEAT (keeps mobile carrier NATs alive + RTT measurement)
      if (data.type === 'PING') {
        ws.isAlive = true;
        safeSend(ws, { type: 'PONG', t: data.t || Date.now(), serverTime: Date.now() });
        return;
      }

      // 1. CREATE ROOM (Up to 8 players, collision-free code)
      if (data.type === 'CREATE_ROOM') {
        cleanupClient();

        const requested = normalizeRoomCode(data.roomCode);
        const reqCode = (requested && requested.length >= 4 && !rooms.has(requested))
          ? requested
          : generateUniqueRoomCode(rooms);

        const fallbackId = `p_${Math.random().toString(36).substring(2, 9)}`;
        const player = sanitizePlayer(data.player, fallbackId, true);

        const defaultSettings = {
          trackId: 'buriram',
          laps: 3,
          aiCount: 'auto',
          ...(data.settings && typeof data.settings === 'object' ? data.settings : {})
        };

        const room = {
          code: reqCode,
          hostId: player.id,
          maxPlayers: MAX_PLAYERS_PER_ROOM,
          status: 'lobby',
          settings: defaultSettings,
          createdAt: Date.now(),
          members: new Map([[ws, player]])
        };

        rooms.set(reqCode, room);
        currentRoomCode = reqCode;
        currentPlayerData = player;

        safeSend(ws, {
          type: 'ROOM_CREATED',
          roomCode: reqCode,
          playerId: player.id,
          isHost: true,
          settings: room.settings
        });

        safeSend(ws, {
          type: 'WELCOME',
          roomCode: reqCode,
          isHost: true,
          localPlayerId: player.id,
          maxPlayers: MAX_PLAYERS_PER_ROOM,
          settings: room.settings,
          players: [player]
        });
      }

      // 2. JOIN ROOM (Up to 8 players check, normalized code)
      else if (data.type === 'JOIN_ROOM') {
        cleanupClient();

        const reqCode = normalizeRoomCode(data.roomCode);
        const room = rooms.get(reqCode);

        if (!room) {
          safeSend(ws, {
            type: 'ERROR',
            code: 'ROOM_NOT_FOUND',
            message: `ไม่พบห้อง "${reqCode || '-'}" กรุณาตรวจสอบรหัสห้องอีกครั้ง`
          });
          return;
        }

        if (room.status === 'racing') {
          safeSend(ws, {
            type: 'ERROR',
            code: 'RACE_IN_PROGRESS',
            message: `ห้อง ${reqCode} กำลังแข่งขันอยู่ กรุณารอจบเกมก่อน`
          });
          return;
        }

        if (room.members.size >= room.maxPlayers) {
          safeSend(ws, {
            type: 'ERROR',
            code: 'ROOM_FULL',
            message: `ห้อง ${reqCode} เต็มแล้ว (รองรับสูงสุด ${room.maxPlayers} คน)`
          });
          return;
        }

        const fallbackId = `p_${Math.random().toString(36).substring(2, 9)}`;
        const player = sanitizePlayer(data.player, fallbackId, false);

        room.members.set(ws, player);
        currentRoomCode = reqCode;
        currentPlayerData = player;

        // Welcome joining player with all existing members and current host settings
        safeSend(ws, {
          type: 'WELCOME',
          roomCode: reqCode,
          isHost: false,
          localPlayerId: player.id,
          maxPlayers: room.maxPlayers,
          settings: room.settings,
          players: Array.from(room.members.values())
        });

        // Broadcast to all other players in room
        broadcastToRoom(room, {
          type: 'PLAYER_JOINED',
          player
        }, ws);
      }

      // 3. UPDATE PLAYER INFO (Car, Skin, Color, Ready state)
      else if (data.type === 'UPDATE_PLAYER') {
        if (!currentRoomCode || !rooms.has(currentRoomCode)) return;
        const room = rooms.get(currentRoomCode);
        const player = room.members.get(ws);
        if (player && data.player) {
          const isHost = player.id === room.hostId;
          Object.assign(player, sanitizePlayer({ ...player, ...data.player }, player.id, isHost));
          broadcastToRoom(room, {
            type: 'PLAYER_UPDATED',
            peerId: player.id,
            player
          });
        }
      }

      // 3.5 UPDATE LOBBY SETTINGS (Host syncs stage, laps, AI count to all friends)
      else if (data.type === 'UPDATE_SETTINGS') {
        if (!currentRoomCode || !rooms.has(currentRoomCode)) return;
        const room = rooms.get(currentRoomCode);
        const player = room.members.get(ws);
        if (player && player.id === room.hostId && data.settings) {
          room.settings = {
            ...room.settings,
            ...data.settings
          };
          broadcastToRoom(room, {
            type: 'ROOM_SETTINGS',
            settings: room.settings
          });
        }
      }

      // 4. START RACE (Host broadcasts to all)
      else if (data.type === 'START_RACE') {
        if (!currentRoomCode || !rooms.has(currentRoomCode)) return;
        const room = rooms.get(currentRoomCode);
        const player = room.members.get(ws);
        if (player && player.id === room.hostId) {
          room.status = 'racing';
          if (data.settings) {
            room.settings = { ...room.settings, ...data.settings };
          }
          const packet = {
            type: 'START_RACE',
            startTime: Date.now() + 3000,
            settings: room.settings
          };
          // Broadcast to everyone including host
          broadcastToRoom(room, packet);
        }
      }

      // 4.2 RETURN TO LOBBY (Allow rematch in same room)
      else if (data.type === 'RETURN_TO_LOBBY') {
        if (!currentRoomCode || !rooms.has(currentRoomCode)) return;
        const room = rooms.get(currentRoomCode);
        room.status = 'lobby';
        room.members.forEach((m) => {
          m.isReady = m.id === room.hostId;
        });
        broadcastToRoom(room, {
          type: 'ROOM_SETTINGS',
          settings: room.settings
        });
      }

      // 4.5 SYNCHRONIZED COUNTDOWN START
      else if (data.type === 'START_COUNTDOWN') {
        if (!currentRoomCode || !rooms.has(currentRoomCode)) return;
        const room = rooms.get(currentRoomCode);
        broadcastToRoom(room, message, ws);
      }

      // 5. CAR TRANSFORM (High speed ~25Hz relay)
      else if (data.type === 'CAR_TRANSFORM') {
        if (!currentRoomCode || !rooms.has(currentRoomCode)) return;
        const room = rooms.get(currentRoomCode);
        // Direct buffer relay to other peers in room
        broadcastToRoom(room, message, ws);
      }

      // 6. CHAT / REACTIONS
      else if (data.type === 'CHAT') {
        if (!currentRoomCode || !rooms.has(currentRoomCode)) return;
        const room = rooms.get(currentRoomCode);
        broadcastToRoom(room, message, ws);
      }

      // 7. LEAVE ROOM
      else if (data.type === 'LEAVE_ROOM') {
        cleanupClient();
      }

    } catch (e) {
      console.error('WS Error:', e);
    }
  });

  ws.on('close', cleanupClient);
  ws.on('error', cleanupClient);
});

// Periodic ping to keep active connections alive & sweep dead ones (15s for mobile NAT safety)
const heartbeatInterval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (!ws.isAlive) {
      return ws.terminate();
    }
    ws.isAlive = false;
    ws.ping();
  });
  for (const [code, room] of rooms.entries()) {
    if (!room.members || room.members.size === 0) {
      rooms.delete(code);
    }
  }
}, 15000);

wss.on('close', () => {
  clearInterval(heartbeatInterval);
});

// Fallback to index.html for SPA routing
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🏎️ AshiLane server running on http://localhost:${PORT} (Max 8 players per room)`);
});

process.on('SIGTERM', () => {
  console.log('Received SIGTERM, closing server gracefully...');
  server.close(() => {
    process.exit(0);
  });
});
