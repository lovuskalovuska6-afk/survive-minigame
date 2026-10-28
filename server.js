'use strict';

const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: '*' },
  pingInterval: 25000,
  pingTimeout: 20000
});

const PORT = process.env.PORT || 3000;
const MAX_PLAYERS_PER_ROOM = 2;
const MAX_NICKNAME_LENGTH = 20;
const MAX_CHAT_LENGTH = 250;

app.use(express.static(path.join(__dirname, 'public')));

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    game: 'THE LOCKED HOME: 14 DAYS',
    online: io.engine.clientsCount
  });
});

app.get('/api/status', (req, res) => {
  const rooms = {};

  for (const [roomId, room] of Object.entries(gameRooms)) {
    rooms[roomId] = {
      name: room.name,
      mode: room.mode,
      players: Object.keys(room.players).length,
      maxPlayers: room.maxPlayers
    };
  }

  res.json({
    online: io.engine.clientsCount,
    rooms
  });
});

const ROOM_CONFIG = {
  solo1: {
    name: 'Одиночная #1',
    mode: 'solo',
    maxPlayers: 1
  },
  solo2: {
    name: 'Одиночная #2',
    mode: 'solo',
    maxPlayers: 1
  },
  coop1: {
    name: 'Кооператив #1',
    mode: 'coop',
    maxPlayers: 2
  },
  coop2: {
    name: 'Кооператив #2',
    mode: 'coop',
    maxPlayers: 2
  }
};

const gameRooms = {};

for (const [id, config] of Object.entries(ROOM_CONFIG)) {
  gameRooms[id] = {
    ...config,
    players: {},
    startedAt: null
  };
}

const connectedPlayers = new Map();

function cleanText(value, maxLength = MAX_CHAT_LENGTH) {
  if (typeof value !== 'string') {
    return '';
  }

  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim()
    .slice(0, maxLength);
}

function getPublicPlayer(player) {
  return {
    id: player.id,
    nickname: player.nickname,
    x: player.x,
    y: player.y,
    z: player.z,
    rotation: player.rotation,
    animation: player.animation,
    health: player.health,
    roomId: player.roomId
  };
}

function getRoomPlayers(room) {
  return Object.values(room.players).map(getPublicPlayer);
}

function sendRoomState(roomId) {
  const room = gameRooms[roomId];

  if (!room) return;

  io.to(roomId).emit('room:state', {
    roomId,
    name: room.name,
    mode: room.mode,
    maxPlayers: room.maxPlayers,
    players: getRoomPlayers(room),
    started: room.startedAt !== null
  });

  io.emit('lobby:rooms', getLobbyState());
}

function getLobbyState() {
  const result = {};

  for (const [roomId, room] of Object.entries(gameRooms)) {
    result[roomId] = {
      id: roomId,
      name: room.name,
      mode: room.mode,
      players: Object.keys(room.players).length,
      maxPlayers: room.maxPlayers,
      full: Object.keys(room.players).length >= room.maxPlayers
    };
  }

  return result;
}

function leaveCurrentRoom(socket) {
  const player = connectedPlayers.get(socket.id);

  if (!player || !player.roomId) {
    return;
  }

  const oldRoomId = player.roomId;
  const oldRoom = gameRooms[oldRoomId];

  if (oldRoom) {
    delete oldRoom.players[socket.id];

    if (Object.keys(oldRoom.players).length === 0) {
      oldRoom.startedAt = null;
    }
  }

  socket.leave(oldRoomId);
  player.roomId = null;

  socket.emit('room:left', {
    roomId: oldRoomId
  });

  io.to(oldRoomId).emit('chat:system', {
    text: `${player.nickname} покинул комнату.`,
    time: Date.now()
  });

  sendRoomState(oldRoomId);
}

io.on('connection', (socket) => {
  const player = {
    id: socket.id,
    nickname: `Игрок${Math.floor(100 + Math.random() * 900)}`,
    roomId: null,

    x: 0,
    y: 0,
    z: 0,
    rotation: 0,
    animation: 'idle',

    health: 100
  };

  connectedPlayers.set(socket.id, player);

  socket.emit('server:ready', {
    id: socket.id,
    nickname: player.nickname,
    rooms: getLobbyState(),
    online: io.engine.clientsCount
  });

  io.emit('online:count', io.engine.clientsCount);

  socket.on('profile:set', (data = {}) => {
    const nickname = cleanText(data.nickname, MAX_NICKNAME_LENGTH);

    if (!nickname) {
      socket.emit('profile:error', {
        message: 'Введи имя игрока.'
      });
      return;
    }

    player.nickname = nickname;

    socket.emit('profile:updated', {
      nickname: player.nickname
    });

    if (player.roomId) {
      sendRoomState(player.roomId);

      io.to(player.roomId).emit('chat:system', {
        text: `Теперь игрок называется ${player.nickname}.`,
        time: Date.now()
      });
    }
  });

  socket.on('room:join', (data = {}) => {
    const roomId = cleanText(data.roomId, 20);
    const room = gameRooms[roomId];

    if (!room) {
      socket.emit('room:error', {
        message: 'Такой комнаты не существует.'
      });
      return;
    }

    if (player.roomId === roomId) {
      socket.emit('room:joined', {
        roomId,
        name: room.name,
        mode: room.mode,
        players: getRoomPlayers(room)
      });
      return;
    }

    if (player.roomId) {
      leaveCurrentRoom(socket);
    }

    const currentCount = Object.keys(room.players).length;

    if (currentCount >= room.maxPlayers) {
      socket.emit('room:error', {
        message: 'Комната заполнена. Выбери другую.'
      });
      return;
    }

    player.roomId = roomId;
    player.x = 0;
    player.y = 0;
    player.z = 0;
    player.rotation = 0;
    player.animation = 'idle';

    room.players[socket.id] = player;

    socket.join(roomId);

    socket.emit('room:joined', {
      roomId,
      name: room.name,
      mode: room.mode,
      players: getRoomPlayers(room)
    });

    socket.to(roomId).emit('chat:system', {
      text: `${player.nickname} присоединился к комнате.`,
      time: Date.now()
    });

    if (
      room.mode === 'coop' &&
      Object.keys(room.players).length >= 2
    ) {
      room.startedAt = Date.now();

      io.to(roomId).emit('game:start', {
        roomId,
        mode: room.mode,
        message: 'Выживайте вместе 14 дней!'
      });
    }

    sendRoomState(roomId);
  });

  socket.on('room:leave', () => {
    leaveCurrentRoom(socket);
  });

  socket.on('player:move', (data = {}) => {
    if (!player.roomId) return;

    const room = gameRooms[player.roomId];

    if (!room) return;

    const numberOr = (value, fallback = 0) => {
      const n = Number(value);
      return Number.isFinite(n) ? n : fallback;
    };

    player.x = Math.max(-500, Math.min(500, numberOr(data.x, player.x)));
    player.y = Math.max(-10, Math.min(100, numberOr(data.y, player.y)));
    player.z = Math.max(-500, Math.min(500, numberOr(data.z, player.z)));
    player.rotation = numberOr(data.rotation, player.rotation);

    const allowedAnimations = ['idle', 'walk', 'run', 'jump'];

    player.animation = allowedAnimations.includes(data.animation)
      ? data.animation
      : 'idle';

    socket.to(player.roomId).volatile.emit('player:moved', {
      id: player.id,
      nickname: player.nickname,
      x: player.x,
      y: player.y,
      z: player.z,
      rotation: player.rotation,
      animation: player.animation
    });
  });

  socket.on('player:stats', (data = {}) => {
    if (!player.roomId) return;

    if (Number.isFinite(Number(data.health))) {
      player.health = Math.max(
        0,
        Math.min(100, Number(data.health))
      );
    }

    socket.to(player.roomId).emit('player:stats:updated', {
      id: player.id,
      health: player.health
    });
  });

  socket.on('chat:send', (data = {}) => {
    const text = cleanText(data.text);

    if (!text) return;

    const message = {
      id: `${socket.id}-${Date.now()}`,
      nickname: player.nickname,
      text,
      time: Date.now(),
      roomId: player.roomId
    };

    if (player.roomId) {
      io.to(player.roomId).emit('chat:message', message);
    } else {
      io.emit('chat:lobby', message);
    }
  });

  socket.on('game:event', (data = {}) => {
    if (!player.roomId) return;

    const allowedTypes = [
      'item:collected',
      'item:used',
      'furniture:placed',
      'day:changed',
      'player:ready'
    ];

    if (!allowedTypes.includes(data.type)) return;

    io.to(player.roomId).emit('game:event', {
      type: data.type,
      playerId: socket.id,
      nickname: player.nickname,
      payload: data.payload || {},
      time: Date.now()
    });
  });

  socket.on('disconnect', () => {
    leaveCurrentRoom(socket);

    connectedPlayers.delete(socket.id);

    io.emit('online:count', io.engine.clientsCount);
    io.emit('lobby:rooms', getLobbyState());
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`THE LOCKED HOME is running on port ${PORT}`);
});
