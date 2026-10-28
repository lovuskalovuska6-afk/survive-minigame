
'use strict';

export class Multiplayer {
  constructor() {
    this.socket = null;
    this.connected = false;
    this.currentRoom = null;
    this.playerId = null;
    this.playerName = this.createPlayerName();

    this.handlers = {};
    this.rooms = {};
    this.players = [];
    this.lastError = null;
  }

  createPlayerName() {
    const saved = localStorage.getItem('lockedHomePlayerName');

    if (saved && saved.trim()) {
      return saved.trim().slice(0, 20);
    }

    const name = 'Игрок_' + Math.floor(1000 + Math.random() * 9000);

    try {
      localStorage.setItem('lockedHomePlayerName', name);
    } catch (_) {}

    return name;
  }

  on(eventName, callback) {
    if (typeof callback !== 'function') return;

    if (!this.handlers[eventName]) {
      this.handlers[eventName] = [];
    }

    this.handlers[eventName].push(callback);
  }

  emitLocal(eventName, data) {
    const callbacks = this.handlers[eventName];

    if (!callbacks) return;

    for (const callback of callbacks) {
      try {
        callback(data);
      } catch (error) {
        console.error(`Ошибка обработчика ${eventName}:`, error);
      }
    }
  }

  connect() {
    if (this.socket && this.socket.connected) {
      return;
    }

    if (typeof io !== 'function') {
      this.emitLocal('connection:error', {
        message: 'Socket.IO не загрузился. Проверь подключение к серверу.'
      });
      return;
    }

    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }

    this.socket = io({
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 15000
    });

    this.socket.on('connect', () => {
      this.connected = true;
      this.playerId = this.socket.id;
      this.lastError = null;

      this.emitLocal('connection:status', {
        connected: true,
        id: this.playerId
      });

      this.socket.emit('player:join', {
        name: this.playerName
      });
    });

    this.socket.on('disconnect', (reason) => {
      this.connected = false;

      this.emitLocal('connection:status', {
        connected: false,
        reason
      });
    });

    this.socket.on('connect_error', (error) => {
      this.lastError = error?.message || 'Ошибка соединения';

      this.emitLocal('connection:error', {
        message: this.lastError
      });
    });

    this.socket.on('server:ready', (data) => {
      this.emitLocal('server:ready', data);
    });

    this.socket.on('lobby:rooms', (data) => {
      this.rooms = data?.rooms || data || {};

      this.emitLocal('lobby:rooms', data);
    });

    this.socket.on('lobby:players', (data) => {
      this.emitLocal('lobby:players', data);
    });

    this.socket.on('room:joined', (data) => {
      this.currentRoom = data?.roomId || data?.room || this.currentRoom;

      this.emitLocal('room:joined', data);
    });

    this.socket.on('room:state', (data) => {
      if (data?.roomId || data?.room) {
        this.currentRoom = data.roomId || data.room;
      }

      this.players = data?.players || [];

      this.emitLocal('room:state', data);
    });

    this.socket.on('room:left', (data) => {
      this.currentRoom = null;
      this.players = [];

      this.emitLocal('room:left', data);
    });

    this.socket.on('room:error', (data) => {
      this.emitLocal('room:error', data);
    });

    this.socket.on('game:waiting', (data) => {
      this.emitLocal('game:waiting', data);
    });

    this.socket.on('game:countdown', (data) => {
      this.emitLocal('game:countdown', data);
    });

    this.socket.on('game:start', (data) => {
      this.emitLocal('game:start', data);
    });

    this.socket.on('player:moved', (data) => {
      this.emitLocal('player:moved', data);
    });

    this.socket.on('player:joined', (data) => {
      this.emitLocal('player:joined', data);
    });

    this.socket.on('player:left', (data) => {
      this.emitLocal('player:left', data);
    });

    this.socket.on('chat:message', (data) => {
      this.emitLocal('chat:message', data);
    });

    this.socket.on('chat:error', (data) => {
      this.emitLocal('chat:error', data);
    });

    this.socket.on('game:event', (data) => {
      this.emitLocal('game:event', data);
    });
  }

  joinRoom(roomId) {
    if (!this.socket || !this.socket.connected) {
      this.emitLocal('connection:error', {
        message: 'Нет соединения с сервером. Подожди и попробуй ещё раз.'
      });
      return false;
    }

    if (!roomId) {
      this.emitLocal('room:error', {
        message: 'Не выбрана комната.'
      });
      return false;
    }

    this.socket.emit('room:join', {
      roomId,
      name: this.playerName
    });

    return true;
  }

  leaveRoom() {
    if (!this.socket || !this.socket.connected) {
      this.currentRoom = null;
      return;
    }

    this.socket.emit('room:leave');
    this.currentRoom = null;
    this.players = [];
  }

  move(position, rotation) {
    if (!this.socket || !this.socket.connected || !this.currentRoom) {
      return;
    }

    this.socket.emit('player:move', {
      x: Number(position?.x) || 0,
      y: Number(position?.y) || 0,
      z: Number(position?.z) || 0,
      rotation: Number(rotation) || 0
    });
  }

  sendChat(message) {
    if (!this.socket || !this.socket.connected) {
      this.emitLocal('chat:error', {
        message: 'Нет соединения с сервером.'
      });
      return false;
    }

    const cleanMessage = String(message || '').trim().slice(0, 180);

    if (!cleanMessage) return false;

    this.socket.emit('chat:message', {
      message: cleanMessage
    });

    return true;
  }

  sendGameEvent(type, data = {}) {
    if (!this.socket || !this.socket.connected) return;

    this.socket.emit('game:event', {
      type,
      data
    });
  }

  setPlayerName(name) {
    const cleanName = String(name || '').trim().slice(0, 20);

    if (!cleanName) return false;

    this.playerName = cleanName;

    try {
      localStorage.setItem('lockedHomePlayerName', cleanName);
    } catch (_) {}

    if (this.socket?.connected) {
      this.socket.emit('player:join', {
        name: cleanName
      });
    }

    return true;
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }

    this.connected = false;
    this.currentRoom = null;
    this.players = [];
  }
}
