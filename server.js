
'use strict';

const express = require('express');
const http = require('http');
const path = require('path');
const crypto = require('crypto');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: '*' },
  pingInterval: 25000,
  pingTimeout: 20000
});

const PORT = process.env.PORT || 3000;
const MAX_NAME = 20;
const MAX_CHAT = 180;
const MAX_PLAYERS = 2;
const TIME_OPTIONS = [0.25, 0.5, 1, 2, 5, 10, 30, 60];

const rooms = new Map();
const players = new Map();

app.use(express.static(path.join(__dirname, 'public')));

function clean(value, maxLength = MAX_CHAT) {
  if (typeof value !== 'string') return '';
  return value
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .slice(0, maxLength);
}

function makeCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code;

  do {
    code = Array.from(
      { length: 5 },
      () => alphabet[crypto.randomInt(alphabet.length)]
    ).join('');
  } while (rooms.has(code));

  return code;
}

function publicPlayer(player) {
  return {
    id: player.id,
    name: player.name,
    nickname: player.name,
    x: player.x,
    y: player.y,
    z: player.z,
    rotation: player.rotation,
    health: player.health,
    ready: player.ready
  };
}

function roomState(room) {
  return {
    roomId: room.code,
    code: room.code,
    mode: room.mode,
    ownerId: room.ownerId,
    maxPlayers: room.maxPlayers,
    timeScale: room.timeScale,
    started: room.started,
    players: [...room.players]
      .map(id => players.get(id))
      .filter(Boolean)
      .map(publicPlayer)
  };
}

function getRooms() {
  return Object.fromEntries(
    [...rooms.entries()].map(([code, room]) => [
      code,
      {
        id: code,
        roomId: code,
        code,
        name: 'Комната ' + code,
        mode: room.mode,
        players: room.players.size,
        count: room.players.size,
        maxPlayers: room.maxPlayers,
        capacity: room.maxPlayers,
        full: room.players.size >= room.maxPlayers,
        started: room.started
      }
    ])
  );
}

function sendRoom(room) {
  io.to(room.code).emit('room:state', roomState(room));
  io.emit('lobby:rooms', getRooms());
}

function sendRoomError(socket, message) {
  socket.emit('room:error', { message });
}

function createLoot() {
  const types = [
    'wood', 'stone', 'scrap', 'food', 'water',
    'berries', 'medkit', 'knife', 'pistol', 'ammo', 'filter'
  ];

  const items = [];

  for (let i = 0; i < 22; i++) {
    const x = Math.round((Math.random() * 140 - 70) * 10) / 10;
    const z = Math.round((Math.random() * 140 - 70) * 10) / 10;

    if (Math.abs(x) < 12 && Math.abs(z) < 12) continue;

    const itemId = types[crypto.randomInt(types.length)];

    items.push({
      id: 'loot-' + i,
      itemId,
      amount: itemId === 'ammo'
        ? crypto.randomInt(4, 13)
        : 1,
      x,
      z
    });
  }

  return items;
}

function startRoom(room, socket) {
  if (!room || room.started) return;

  if (room.mode === 'coop' && room.players.size !== 2) {
    if (socket) {
      sendRoomError(socket, 'Для старта нужны два игрока в комнате.');
    }
    return;
  }

  if (
    room.mode === 'coop' &&
    [...room.players].some(id => !players.get(id)?.ready)
  ) {
    io.to(room.code).emit('game:waiting', {
      message: 'Оба игрока должны нажать «Готов».'
    });
    return;
  }

  room.started = true;
  room.startedAt = Date.now();

  io.to(room.code).emit('game:start', {
    roomId: room.code,
    mode: room.mode,
    startedAt: room.startedAt,
    timeScale: room.timeScale,
    loot: room.loot
  });

  sendRoom(room);
}

function leaveRoom(socket) {
  const player = players.get(socket.id);

  if (!player || !player.roomId) return;

  const code = player.roomId;
  const room = rooms.get(code);

  if (room) {
    room.players.delete(socket.id);

    if (room.players.size === 0) {
      rooms.delete(code);
    } else {
      if (room.ownerId === socket.id) {
        room.ownerId = [...room.players][0];
      }

      if (!room.started) {
        for (const id of room.players) {
          const remaining = players.get(id);
          if (remaining) remaining.ready = false;
        }
      }

      sendRoom(room);

      io.to(code).emit('chat:system', {
        text: player.name + ' покинул комнату.'
      });
    }
  }

  socket.leave(code);

  player.roomId = null;
  player.ready = false;

  socket.emit('room:left', { roomId: code });
  io.emit('lobby:rooms', getRooms());
}

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    game: 'THE LOCKED HOME: 30 DAYS',
    online: io.engine.clientsCount
  });
});

app.get('/api/status', (req, res) => {
  res.json({
    online: io.engine.clientsCount,
    rooms: getRooms()
  });
});

io.on('connection', socket => {
  const player = {
    id: socket.id,
    name: 'Игрок' + crypto.randomInt(100, 1000),
    roomId: null,
    x: 0,
    y: 1.7,
    z: 12,
    rotation: 0,
    health: 100,
    ready: false
  };

  players.set(socket.id, player);

  socket.emit('server:ready', {
    id: socket.id,
    nickname: player.name,
    rooms: getRooms(),
    online: io.engine.clientsCount
  });

  socket.emit('lobby:rooms', getRooms());
  io.emit('online:count', io.engine.clientsCount);

  socket.on('player:join', data => {
    const name = clean(data?.name || data?.nickname, MAX_NAME);

    if (name) player.name = name;

    socket.emit('profile:updated', {
      nickname: player.name
    });

    if (player.roomId && rooms.has(player.roomId)) {
      sendRoom(rooms.get(player.roomId));
    }
  });

  socket.on('profile:set', data => {
    const name = clean(data?.nickname, MAX_NAME);

    if (!name) {
      socket.emit('profile:error', {
        message: 'Введи имя игрока.'
      });
      return;
    }

    player.name = name;

    socket.emit('profile:updated', {
      nickname: player.name
    });

    if (player.roomId && rooms.has(player.roomId)) {
      sendRoom(rooms.get(player.roomId));
    }
  });

  socket.on('room:create', data => {
    leaveRoom(socket);

    const mode = data?.mode === 'solo' ? 'solo' : 'coop';
    const requestedScale = Number(data?.timeScale);

    const timeScale = TIME_OPTIONS.includes(requestedScale)
      ? requestedScale
      : 1;

    const code = makeCode();

    const room = {
      code,
      mode,
      ownerId: socket.id,
      maxPlayers: mode === 'solo' ? 1 : MAX_PLAYERS,
      timeScale,
      players: new Set([socket.id]),
      started: false,
      startedAt: null,
      loot: createLoot(),
      collected: new Set()
    };

    rooms.set(code, room);

    player.roomId = code;
    player.ready = false;
    player.x = 0;
    player.y = 1.7;
    player.z = 12;

    socket.join(code);

    socket.emit('room:created', {
      roomId: code,
      code,
      mode,
      timeScale
    });

    socket.emit('room:joined', roomState(room));

    sendRoom(room);

    if (mode === 'solo') {
      startRoom(room, socket);
    } else {
      socket.emit('game:waiting', {
        message: 'Комната создана. Отправь код другу и дождись его подключения.'
      });
    }
  });

  socket.on('room:join', data => {
    const code = clean(
      data?.roomId || data?.code,
      10
    ).toUpperCase();

    const room = rooms.get(code);

    if (!room) {
      sendRoomError(socket, 'Комната не найдена. Проверь код.');
      return;
    }

    if (room.started) {
      sendRoomError(socket, 'Игра в этой комнате уже началась.');
      return;
    }

    if (room.players.size >= room.maxPlayers) {
      sendRoomError(socket, 'Комната уже заполнена.');
      return;
    }

    leaveRoom(socket);

    room.players.add(socket.id);

    player.roomId = code;
    player.ready = false;
    player.x = 0;
    player.y = 1.7;
    player.z = 14;

    socket.join(code);

    socket.emit('room:joined', roomState(room));

    socket.to(code).emit('player:joined', publicPlayer(player));

    io.to(code).emit('chat:system', {
      text: player.name + ' присоединился к комнате.'
    });

    io.to(code).emit('game:waiting', {
      message: 'Оба игрока должны нажать «Готов», чтобы начать.'
    });

    sendRoom(room);
  });

  socket.on('room:ready', data => {
    const room = player.roomId && rooms.get(player.roomId);

    if (!room || room.started) return;

    player.ready = Boolean(data?.ready);

    sendRoom(room);

    if (
      room.mode === 'coop' &&
      room.players.size === 2 &&
      [...room.players].every(id => players.get(id)?.ready)
    ) {
      startRoom(room, socket);
    }
  });

  socket.on('room:timeScale', data => {
    const room = player.roomId && rooms.get(player.roomId);

    if (!room || room.started || room.ownerId !== socket.id) return;

    const scale = Number(data?.timeScale);

    if (!TIME_OPTIONS.includes(scale)) return;

    room.timeScale = scale;
    sendRoom(room);
  });

  socket.on('room:leave', () => {
    leaveRoom(socket);
  });

  socket.on('player:move', data => {
    if (!player.roomId) return;

    const room = rooms.get(player.roomId);
    if (!room) return;

    const numberOr = (value, fallback) =>
      Number.isFinite(Number(value))
        ? Number(value)
        : fallback;

    player.x = Math.max(
      -500,
      Math.min(500, numberOr(data?.x, player.x))
    );

    player.y = Math.max(
      -10,
      Math.min(100, numberOr(data?.y, player.y))
    );

    player.z = Math.max(
      -500,
      Math.min(500, numberOr(data?.z, player.z))
    );

    player.rotation = numberOr(
      data?.rotation,
      player.rotation
    );

    socket.to(room.code).volatile.emit(
      'player:moved',
      publicPlayer(player)
    );
  });

  socket.on('player:stats', data => {
    if (!player.roomId) return;

    player.health = Math.max(
      0,
      Math.min(100, Number(data?.health) || 0)
    );

    socket.to(player.roomId).emit('player:stats:updated', {
      id: player.id,
      health: player.health
    });
  });

  // Сервер подтверждает подбор, чтобы один предмет не достался дважды.
  socket.on('loot:collect', data => {
    const room = player.roomId && rooms.get(player.roomId);

    if (!room || !room.started) return;

    const id = clean(data?.id, 40);
    const loot = room.loot.find(item => item.id === id);

    if (!loot || room.collected.has(id)) {
      socket.emit('loot:rejected', { id });
      return;
    }

    const dx = player.x - loot.x;
    const dz = player.z - loot.z;

    if (Math.hypot(dx, dz) > 5.5) {
      socket.emit('loot:rejected', { id });
      return;
    }

    room.collected.add(id);

    io.to(room.code).emit('loot:collected', {
      id,
      playerId: player.id,
      name: player.name,
      itemId: loot.itemId,
      amount: loot.amount
    });
  });

  function handleChat(data = {}) {
    const message = clean(
      data.message || data.text,
      MAX_CHAT
    );

    if (!message) return;

    const payload = {
      id: socket.id + '-' + Date.now(),
      idPlayer: socket.id,
      name: player.name,
      nickname: player.name,
      message,
      text: message,
      time: Date.now(),
      roomId: player.roomId
    };

    if (player.roomId) {
      io.to(player.roomId).emit('chat:message', payload);
    } else {
      io.emit('chat:lobby', payload);
    }
  }

  socket.on('chat:message', handleChat);
  socket.on('chat:send', handleChat);

  socket.on('game:event', data => {
    if (!player.roomId) return;

    const allowed = [
      'item:used',
      'furniture:placed',
      'day:changed'
    ];

    if (!allowed.includes(data?.type)) return;

    io.to(player.roomId).emit('game:event', {
      type: data.type,
      playerId: player.id,
      nickname: player.name,
      payload: data.payload || data.data || {},
      time: Date.now()
    });
  });

  socket.on('disconnect', () => {
    leaveRoom(socket);
    players.delete(socket.id);

    io.emit('online:count', io.engine.clientsCount);
    io.emit('lobby:rooms', getRooms());
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(
    'THE LOCKED HOME: 30 DAYS running on port ' + PORT
  );
});
