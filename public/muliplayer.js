
export class Multiplayer {
  constructor(callbacks = {}) {
    this.callbacks = callbacks;
    this.socket = null;
    this.id = null;
    this.nickname = 'Выживший';
    this.roomId = null;
    this.connected = false;
    this.lastMoveSent = 0;
  }

  connect() {
    if (this.socket) return;

    if (typeof window.io !== 'function') {
      this.callbacks.onStatus?.(
        'Socket.IO не загрузился. Проверь подключение к серверу.'
      );
      return;
    }

    this.socket = window.io({
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000
    });

    this.socket.on('connect', () => {
      this.connected = true;
      this.id = this.socket.id;
      this.callbacks.onStatus?.('Соединение с сервером установлено.');
    });

    this.socket.on('disconnect', () => {
      this.connected = false;
      this.callbacks.onStatus?.('Соединение потеряно. Переподключение…');
    });

    this.socket.on('connect_error', () => {
      this.callbacks.onStatus?.(
        'Не удалось подключиться. Проверь сервер Render.'
      );
    });

    this.socket.on('server:ready', (data) => {
      this.id = data.id;
      this.nickname = data.nickname || this.nickname;
      this.callbacks.onReady?.(data);
    });

    this.socket.on('profile:updated', (data) => {
      this.nickname = data.nickname;
      this.callbacks.onProfileUpdated?.(data);
    });

    this.socket.on('profile:error', (data) => {
      this.callbacks.onError?.(data.message);
    });

    this.socket.on('online:count', (count) => {
      this.callbacks.onOnlineCount?.(count);
    });

    this.socket.on('lobby:rooms', (rooms) => {
      this.callbacks.onLobbyRooms?.(rooms);
    });

    this.socket.on('room:joined', (data) => {
      this.roomId = data.roomId;
      this.callbacks.onRoomJoined?.(data);
    });

    this.socket.on('room:left', () => {
      this.roomId = null;
      this.callbacks.onRoomLeft?.();
    });

    this.socket.on('room:error', (data) => {
      this.callbacks.onError?.(data.message);
    });

    this.socket.on('room:state', (data) => {
      this.callbacks.onRoomState?.(data);
    });

    this.socket.on('player:moved', (data) => {
      this.callbacks.onPlayerMoved?.(data);
    });

    this.socket.on('player:stats:updated', (data) => {
      this.callbacks.onPlayerStats?.(data);
    });

    this.socket.on('game:start', (data) => {
      this.callbacks.onGameStart?.(data);
    });

    this.socket.on('game:event', (data) => {
      this.callbacks.onGameEvent?.(data);
    });

    this.socket.on('chat:message', (data) => {
      this.callbacks.onChatMessage?.(data);
    });

    this.socket.on('chat:lobby', (data) => {
      this.callbacks.onChatLobby?.(data);
    });

    this.socket.on('chat:system', (data) => {
      this.callbacks.onChatSystem?.(data);
    });
  }

  setNickname(nickname) {
    if (!this.socket?.connected) {
      this.callbacks.onError?.('Сервер ещё не подключён.');
      return;
    }

    this.socket.emit('profile:set', { nickname });
  }

  joinRoom(roomId) {
    if (!this.socket?.connected) {
      this.callbacks.onError?.('Подожди подключения к серверу.');
      return;
    }

    this.socket.emit('room:join', { roomId });
  }

  leaveRoom() {
    if (this.socket?.connected && this.roomId) {
      this.socket.emit('room:leave');
    }
  }

  sendMove(position, rotation, animation) {
    if (!this.socket?.connected || !this.roomId) return;

    const now = performance.now();

    if (now - this.lastMoveSent < 50) return;

    this.lastMoveSent = now;

    this.socket.volatile.emit('player:move', {
      x: position.x,
      y: position.y,
      z: position.z,
      rotation,
      animation
    });
  }

  sendStats(health) {
    if (!this.socket?.connected || !this.roomId) return;

    this.socket.emit('player:stats', { health });
  }

  sendChat(text) {
    if (!this.socket?.connected) {
      this.callbacks.onError?.('Нет соединения с сервером.');
      return;
    }

    this.socket.emit('chat:send', { text });
  }

  sendGameEvent(type, payload = {}) {
    if (!this.socket?.connected || !this.roomId) return;

    this.socket.emit('game:event', { type, payload });
  }

  disconnect() {
    this.socket?.disconnect();
    this.socket = null;
    this.connected = false;
    this.roomId = null;
  }
}
