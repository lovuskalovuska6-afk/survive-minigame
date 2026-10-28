
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
const MAX_NICKNAME_LENGTH = 20;
const MAX_CHAT_LENGTH = 180;
const COOP_COUNTDOWN_SECONDS = 3;

app.use(express.static(path.join(__dirname, 'public')));

const ROOM_CONFIG = {
  solo1: { name: 'Одиночная #1', mode: 'solo', maxPlayers: 1 },
  solo2: { name: 'Одиночная #2', mode: 'solo', maxPlayers: 1 },
  coop1: { name: 'Кооператив #1', mode: 'coop', maxPlayers: 2 },
  coop2: { name: 'Кооператив #2', mode: 'coop', maxPlayers: 2 }
};

const gameRooms = {};

for (const [id, config] of Object.entries(ROOM_CONFIG)) {
  gameRooms[id] = {
    ...config,
    players: {},
    startedAt: null,
    countdownTimer: null,
    countdownValue: null
  };
}

const connectedPlayers = new Map();

function cleanText(value, maxLength = MAX_CHAT_LENGTH) {
  if (typeof value !== 'string') return '';

  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim()
    .slice(0, maxLength);
}

function getPublicPlayer(player) {
  return {
    id: player.id,
    name: player.nickname,
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

function getLobbyState() {
  const result = {};

  for (const [roomId, room] of Object.entries(gameRooms)) {
    const count = Object.keys(room.players).length;

    result[roomId] = {
      id: roomId,
      name: room.name,
      mode: room.mode,
      players: count,
      count,
      maxPlayers: room.maxPlayers,
      capacity: room.maxPlayers,
      full: count >= room.maxPlayers
    };
  }

  return result;
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
    started: room.startedAt !== null,
    countdown: room.countdownValue
  });

  io.emit('lobby:rooms', getLobbyState());
}

function cancelCountdown(room) {
  if (room.countdownTimer) {
    clearInterval(room.countdownTimer);
    room.countdownTimer = null;
  }

  room.countdownValue = null;
}

function startRoom(roomId) {
  const room = gameRooms[roomId];
  if (!room || room.startedAt !== null) return;

  const count = Object.keys(room.players).length;

  if (room.mode === 'coop' && count < 2) {
    return;
  }

  if (room.mode === 'solo' && count < 1) {
    return;
  }

  cancelCountdown(room);
  room.startedAt = Date.now();

  io.to(roomId).emit('game:start', {
    roomId,
    mode: room.mode,
    startedAt: room.startedAt,
    message: 'Выживайте вместе 14 дней!'
  });

  sendRoomState(roomId);

  console.log(`[GAME] ${roomId}: старт, игроков ${count}`);
}

function beginCoopCountdown(roomId) {
  const room = gameRooms[roomId];
  if (!room || room.mode !== 'coop') return;
  if (room.startedAt !== null || room.countdownTimer) return;

  if (Object.keys(room.players).length < 2) {
    io.to(roomId).emit('game:waiting', {
      roomId,
      message: 'Ожидаем второго игрока...'
    });
    return;
  }

  room.countdownValue = COOP_COUNTDOWN_SECONDS;

  io.to(roomId).emit('game:countdown', {
    roomId,
    seconds: room.countdownValue,
    message: 'Приготовьтесь! Игра скоро начнётся.'
  });

  sendRoomState(roomId);

  room.countdownTimer = setInterval(() => {
    const currentCount = Object.keys(room.players).length;

    if (currentCount < 2) {
      cancelCountdown(room);

      io.to(roomId).emit('game:waiting', {
        roomId,
        message: 'Игрок вышел. Ожидаем второго игрока...'
      });

      sendRoomState(roomId);
      return;
    }

    room.countdownValue -= 1;

    if (room.countdownValue <= 0) {
      cancelCountdown(room);
      startRoom(roomId);
      return;
    }

    io.to(roomId).emit('game:countdown', {
      roomId,
      seconds: room.countdownValue,
      message: 'Приготовьтесь! Игра скоро начнётся.'
    });

    sendRoomState(roomId);
  }, 1000);
}

function leaveCurrentRoom(socket) {
  const player = connectedPlayers.get(socket.id);
  if (!player || !player.roomId) return;

  const oldRoomId = player.roomId;
  const room = gameRooms[oldRoomId];

  if (room) {
    delete room.players[socket.id];

    if (room.mode === 'coop' && room.countdownTimer) {
      cancelCountdown(room);

      io.to(oldRoomId).emit('game:waiting', {
        roomId: oldRoomId,
        message: 'Игрок вышел. Ожидаем второго игрока...'
      });
    }

    if (Object.keys(room.players).length === 0) {
      cancelCountdown(room);
      room.startedAt = null;
    } else if (room.mode === 'coop' && room.startedAt === null) {
      io.to(oldRoomId).emit('game:waiting', {
        roomId: oldRoomId,
        message: 'Ожидаем второго игрока...'
      });
    }
  }

  socket.leave(oldRoomId);
  player.roomId = null;

  socket.emit('room:left', { roomId: oldRoomId });

  io.to(oldRoomId).emit('player:left', {
    id: socket.id,
    name: player.nickname
  });

  io.to(oldRoomId).emit('chat:system', {
    text: `${player.nickname} покинул комнату.`,
    time: Date.now()
  });

  sendRoomState(oldRoomId);
}

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    game: 'THE LOCKED HOME: 14 DAYS',
    online: io.engine.clientsCount
  });
});

app.get('/api/status', (req, res) => {
  res.json({
    online: io.engine.clientsCount,
    rooms: getLobbyState()
  });
});

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

  socket.emit('lobby:rooms', getLobbyState());
  io.emit('online:count', io.engine.clientsCount);

  socket.on('player:join', (data = {}) => {
    const nickname = cleanText(
      data.name || data.nickname,
      MAX_NICKNAME_LENGTH
    );

    if (nickname) {
      player.nickname = nickname;
    }

    socket.emit('profile:updated', {
      nickname: player.nickname
    });

    if (player.roomId) sendRoomState(player.roomId);
  });

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

    if (player.roomId) sendRoomState(player.roomId);
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

    if (room.startedAt !== null) {
      socket.emit('room:error', {
        message: 'Игра в этой комнате уже началась.'
      });
      return;
    }

    if (player.roomId) {
      leaveCurrentRoom(socket);
    }

    if (Object.keys(room.players).length >= room.maxPlayers) {
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

    socket.to(roomId).emit('player:joined', getPublicPlayer(player));

    socket.to(roomId).emit('chat:system', {
      text: `${player.nickname} присоединился к комнате.`,
      time: Date.now()
    });

    const count = Object.keys(room.players).length;

    if (room.mode === 'solo') {
      // ОДИН ИГРОК: СТАРТУЕМ СРАЗУ, БЕЗ 10-СЕКУНДНОГО ОЖИДАНИЯ.
      startRoom(roomId);
    } else if (count < 2) {
      // ПЕРВЫЙ ИГРОК: ЖДЁМ НАПАРНИКА.
      socket.emit('game:waiting', {
        roomId,
        message: 'Ожидаем второго игрока...'
      });
    } else {
      // ВТОРОЙ ИГРОК: ОБЩИЙ ОТСЧЁТ 3 СЕКУНДЫ.
      beginCoopCountdown(roomId);
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
      const number = Number(value);
      return Number.isFinite(number) ? number : fallback;
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
      name: player.nickname,
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
      player.health = Math.max(0, Math.min(100, Number(data.health)));
    }

    socket.to(player.roomId).emit('player:stats:updated', {
      id: player.id,
      health: player.health
    });
  });

  function handleChat(data = {}) {
    const messageText = cleanText(
      data.message || data.text,
      MAX_CHAT_LENGTH
    );

    if (!messageText) return;

    const message = {
      id: `${socket.id}-${Date.now()}`,
      idPlayer: socket.id,
      name: player.nickname,
      nickname: player.nickname,
      message: messageText,
      text: messageText,
      time: Date.now(),
      roomId: player.roomId
    };

    if (player.roomId) {
      io.to(player.roomId).emit('chat:message', message);
    } else {
      io.emit('chat:lobby', message);
    }
  }

  // Поддерживаем оба варианта названия события чата.
  socket.on('chat:message', handleChat);
  socket.on('chat:send', handleChat);

  socket.on('game:event', (data = {}) => {
    if (!player.roomId) return;

    const type = data.type;
    const allowedTypes = [
      'item:collected',
      'item:used',
      'furniture:placed',
      'day:changed',
      'player:ready'
    ];

    if (!allowedTypes.includes(type)) return;

    io.to(player.roomId).emit('game:event', {
      type,
      playerId: socket.id,
      nickname: player.nickname,
      payload: data.payload || data.data || {},
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
