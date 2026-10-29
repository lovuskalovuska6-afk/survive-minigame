
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
    this.isOwner = false;
    this.roomInfo = null;
  }

  createPlayerName() {
    try {
      const saved = localStorage.getItem('lockedHomePlayerName');
      if (saved && saved.trim()) return saved.trim().slice(0, 20);
    } catch (_) {}

    const name = 'Игрок_' + Math.floor(1000 + Math.random() * 9000);

    try {
      localStorage.setItem('lockedHomePlayerName', name);
    } catch (_) {}

    return name;
  }

  on(eventName, callback) {
    if (typeof callback !== 'function') return;

    if (!this.handlers[eventName]) this.handlers[eventName] = [];
    this.handlers[eventName].push(callback);
  }

  emitLocal(eventName, data) {
    const callbacks = this.handlers[eventName];
    if (!callbacks) return;

    for (const callback of callbacks) {
      try {
        callback(data);
      } catch (error) {
        console.error('Ошибка обработчика ' + eventName + ':', error);
      }
    }
  }

  connect() {
    if (this.socket?.connected) return;

    if (typeof io !== 'function') {
      this.emitLocal('connection:error', {
        message: 'Socket.IO не загрузился. Обнови страницу.'
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

    const s = this.socket;

    s.on('connect', () => {
      this.connected = true;
      this.playerId = s.id;
      this.lastError = null;

      this.emitLocal('connection:status', {
        connected: true,
        id: this.playerId
      });

      s.emit('player:join', { name: this.playerName });
    });

    s.on('disconnect', reason => {
      this.connected = false;

      this.emitLocal('connection:status', {
        connected: false,
        reason
      });
    });

    s.on('connect_error', error => {
      this.lastError = error?.message || 'Ошибка соединения';

      this.emitLocal('connection:error', {
        message: this.lastError
      });
    });

    const forward = [
      'server:ready',
      'lobby:rooms',
      'lobby:players',
      'room:created',
      'room:joined',
      'room:state',
      'room:left',
      'room:error',
      'profile:updated',
      'profile:error',
      'game:waiting',
      'game:countdown',
      'game:start',
      'game:event',
      'game:system',
      'player:moved',
      'player:joined',
      'player:left',
      'player:stats:updated',
      'chat:message',
      'chat:lobby',
      'chat:system',
      'chat:error',
      'loot:collected',
      'loot:rejected',
      'online:count'
    ];

    for (const eventName of forward) {
      s.on(eventName, data => {
        if (eventName === 'lobby:rooms') {
          this.rooms = data?.rooms || data || {};
        }

        if (eventName === 'room:joined' || eventName === 'room:state') {
          this.currentRoom = data?.roomId || data?.code || this.currentRoom;
          this.roomInfo = data;
          this.players = data?.players || [];
          this.isOwner = data?.ownerId === this.playerId;
        }

        if (eventName === 'room:left') {
          this.currentRoom = null;
          this.roomInfo = null;
          this.players = [];
          this.isOwner = false;
        }

        this.emitLocal(eventName, data);
      });
    }
  }

  setPlayerName(name) {
    const cleanName = String(name || '').trim().slice(0, 20);
    if (!cleanName) return false;

    this.playerName = cleanName;

    try {
      localStorage.setItem('lockedHomePlayerName', cleanName);
    } catch (_) {}

    if (this.socket?.connected) {
      this.socket.emit('player:join', { name: cleanName });
    }

    return true;
  }

  createRoom(options = {}) {
    if (!this.socket?.connected) {
      this.emitLocal('connection:error', {
        message: 'Нет соединения с сервером. Подожди немного и попробуй ещё раз.'
      });
      return false;
    }

    this.socket.emit('room:create', {
      mode: options.mode === 'solo' ? 'solo' : 'coop',
      timeScale: Number(options.timeScale) || 1
    });

    return true;
  }

  joinRoom(code) {
    if (!this.socket?.connected) {
      this.emitLocal('connection:error', {
        message: 'Нет соединения с сервером.'
      });
      return false;
    }

    const roomCode = String(code || '').trim().toUpperCase();

    if (!roomCode) {
      this.emitLocal('room:error', { message: 'Введи код комнаты.' });
      return false;
    }

    this.socket.emit('room:join', {
      roomId: roomCode,
      code: roomCode,
      name: this.playerName
    });

    return true;
  }

  setReady(ready = true) {
    if (!this.socket?.connected || !this.currentRoom) return false;

    this.socket.emit('room:ready', { ready: Boolean(ready) });
    return true;
  }

  setTimeScale(timeScale) {
    if (!this.socket?.connected || !this.currentRoom) return false;

    this.socket.emit('room:timeScale', {
      timeScale: Number(timeScale)
    });
    return true;
  }

  leaveRoom() {
    if (!this.socket?.connected) {
      this.currentRoom = null;
      this.roomInfo = null;
      this.players = [];
      this.isOwner = false;
      return;
    }

    this.socket.emit('room:leave');
  }

  move(position, rotation) {
    if (!this.socket?.connected || !this.currentRoom) return;

    this.socket.volatile.emit('player:move', {
      x: Number(position?.x) || 0,
      y: Number(position?.y) || 0,
      z: Number(position?.z) || 0,
      rotation: Number(rotation) || 0
    });
  }

  sendChat(message) {
    if (!this.socket?.connected) {
      this.emitLocal('chat:error', {
        message: 'Нет соединения с сервером.'
      });
      return false;
    }

    const cleanMessage = String(message || '').trim().slice(0, 180);
    if (!cleanMessage) return false;

    this.socket.emit('chat:message', { message: cleanMessage });
    return true;
  }

  sendGameEvent(type, data = {}) {
    if (!this.socket?.connected) return;

    this.socket.emit('game:event', { type, data });
  }

  collectLoot(id) {
    if (!this.socket?.connected || !this.currentRoom) return false;

    this.socket.emit('loot:collect', { id: String(id) });
    return true;
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }

    this.connected = false;
    this.currentRoom = null;
    this.roomInfo = null;
    this.players = [];
    this.isOwner = false;
  }
}
