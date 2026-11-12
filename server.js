import express from 'express';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const PORT = process.env.PORT || 3000;
const MAX_PLAYERS_PER_ROOM = 8;

// Health check endpoint for Render monitoring
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', uptime: process.uptime() });
});

// Serve static files from dist or current dir
app.use(express.static(path.join(__dirname, 'dist')));
app.use('/assets', express.static(path.join(__dirname, 'public/assets')));

// In-Memory Room Store:
// roomCode -> { code, hostId, members: Map<WebSocket, playerInfo> }
const rooms = new Map();

function broadcastToRoom(room, data, excludeWs = null) {
  if (!room || !room.members) return;
  const msg = typeof data === 'string' ? data : JSON.stringify(data);
  room.members.forEach((player, clientWs) => {
    if (clientWs !== excludeWs && clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(msg);
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

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);

      // 1. CREATE ROOM (Up to 8 players)
      if (data.type === 'CREATE_ROOM') {
        const reqCode = (data.roomCode || Math.random().toString(36).substring(2, 6)).toUpperCase().trim();
        const player = {
          id: data.player?.id || `p_${Math.random().toString(36).substring(2, 9)}`,
          name: data.player?.name || 'นักซิ่งอาชิ',
          carId: data.player?.carId || 'gt',
          skinFileName: data.player?.skinFileName || 'Gemini_Generated_Image_4g9dic4g9dic4g9d.jpg',
          color: data.player?.color || '#00f0ff',
          addons: data.player?.addons || {},
          isReady: true,
          isHost: true
        };

        const room = {
          code: reqCode,
          hostId: player.id,
          maxPlayers: MAX_PLAYERS_PER_ROOM,
          members: new Map([[ws, player]])
        };

        rooms.set(reqCode, room);
        currentRoomCode = reqCode;
        currentPlayerData = player;

        ws.send(JSON.stringify({
          type: 'ROOM_CREATED',
          roomCode: reqCode,
          playerId: player.id,
          isHost: true
        }));

        ws.send(JSON.stringify({
          type: 'WELCOME',
          roomCode: reqCode,
          isHost: true,
          localPlayerId: player.id,
          maxPlayers: MAX_PLAYERS_PER_ROOM,
          players: [player]
        }));
      }

      // 2. JOIN ROOM (Up to 8 players check)
      else if (data.type === 'JOIN_ROOM') {
        const reqCode = (data.roomCode || '').toUpperCase().trim();
        const room = rooms.get(reqCode);

        if (!room) {
          ws.send(JSON.stringify({
            type: 'ERROR',
            code: 'ROOM_NOT_FOUND',
            message: `ไม่พบห้อง ${reqCode} ตรวจสอบรหัสห้องอีกครั้ง`
          }));
          return;
        }

        if (room.members.size >= room.maxPlayers) {
          ws.send(JSON.stringify({
            type: 'ERROR',
            code: 'ROOM_FULL',
            message: `ห้อง ${reqCode} เต็มแล้ว (รองรับสูงสุด ${room.maxPlayers} คน)`
          }));
          return;
        }

        const player = {
          id: data.player?.id || `p_${Math.random().toString(36).substring(2, 9)}`,
          name: data.player?.name || 'นักซิ่งอาชิ',
          carId: data.player?.carId || 'gt',
          skinFileName: data.player?.skinFileName || 'Gemini_Generated_Image_4g9dic4g9dic4g9d.jpg',
          color: data.player?.color || '#ff0055',
          addons: data.player?.addons || {},
          isReady: false,
          isHost: false
        };

        room.members.set(ws, player);
        currentRoomCode = reqCode;
        currentPlayerData = player;

        // Welcome joining player with all existing members in room
        ws.send(JSON.stringify({
          type: 'WELCOME',
          roomCode: reqCode,
          isHost: false,
          localPlayerId: player.id,
          maxPlayers: room.maxPlayers,
          players: Array.from(room.members.values())
        }));

        // Broadcast to all other players in room
        broadcastToRoom(room, {
          type: 'PLAYER_JOINED',
          player
        }, ws);
      }

      // 3. UPDATE PLAYER INFO
      else if (data.type === 'UPDATE_PLAYER') {
        if (!currentRoomCode || !rooms.has(currentRoomCode)) return;
        const room = rooms.get(currentRoomCode);
        const player = room.members.get(ws);
        if (player) {
          Object.assign(player, data.player);
          broadcastToRoom(room, {
            type: 'PLAYER_UPDATED',
            peerId: player.id,
            player
          }, ws);
        }
      }

      // 4. START RACE (Host broadcasts to all)
      else if (data.type === 'START_RACE') {
        if (!currentRoomCode || !rooms.has(currentRoomCode)) return;
        const room = rooms.get(currentRoomCode);
        const player = room.members.get(ws);
        if (player && player.id === room.hostId) {
          const packet = {
            type: 'START_RACE',
            startTime: Date.now() + 3000,
            settings: data.settings || {}
          };
          // Broadcast to everyone including host
          broadcastToRoom(room, packet);
        }
      }

      // 4.5 SYNCHRONIZED COUNTDOWN START
      else if (data.type === 'START_COUNTDOWN') {
        if (!currentRoomCode || !rooms.has(currentRoomCode)) return;
        const room = rooms.get(currentRoomCode);
        broadcastToRoom(room, message, ws);
      }

      // 5. CAR TRANSFORM (High speed ~25-30Hz relay)
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
        const [nextWs, nextPlayer] = room.members.entries().next().value;
        if (nextPlayer) {
          nextPlayer.isHost = true;
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

  ws.on('close', cleanupClient);
  ws.on('error', cleanupClient);
});

// Periodic ping to keep active connections alive & sweep dead ones
const heartbeatInterval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (!ws.isAlive) {
      return ws.terminate();
    }
    ws.isAlive = false;
    ws.ping();
  });
}, 25000);

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
