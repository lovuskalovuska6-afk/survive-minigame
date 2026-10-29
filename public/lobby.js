
import { Multiplayer } from './multiplayer.js';

const $ = (id) => document.getElementById(id);
const mp = new Multiplayer();

let connected = false;
let ready = false;
let allowGameStart = false;
let lastRoomState = null;

const menu = $('mainMenu');
const lobby = $('lobbyScreen');
const startButton = $('startGameButton');

function status(message) {
  const el = $('lobbyStatus');
  if (el) el.textContent = message;
}

function showLobby() {
  menu?.classList.add('hidden');
  lobby?.classList.remove('hidden');

  const mainName = $('playerName')?.value.trim();
  const lobbyName = $('lobbyPlayerName');

  if (lobbyName && !lobbyName.value) {
    lobbyName.value = mainName || mp.playerName;
  }

  mp.connect();
  status(connected ? 'Подключено к серверу.' : 'Подключаемся к серверу…');
}

function hideLobby() {
  lobby?.classList.add('hidden');
  menu?.classList.remove('hidden');
}

function getName() {
  const name = (
    $('lobbyPlayerName')?.value ||
    $('playerName')?.value ||
    'Выживший'
  ).trim().slice(0, 20);

  if (!name) {
    status('Сначала введи имя игрока.');
    return null;
  }

  mp.setPlayerName(name);

  if ($('playerName')) $('playerName').value = name;
  if ($('lobbyPlayerName')) $('lobbyPlayerName').value = name;

  return name;
}

function showRoom(data) {
  if (!data) return;

  lastRoomState = data;

  $('roomSection')?.classList.remove('hidden');

  const code = $('roomCode');
  if (code) code.textContent = data.code || data.roomId || '-----';

  const list = $('lobbyPlayerList');
  if (list) {
    list.replaceChildren();

    const players = Array.isArray(data.players) ? data.players : [];

    if (!players.length) {
      list.textContent = 'Ожидание игроков…';
    } else {
      for (const player of players) {
        const row = document.createElement('div');
        row.className = 'lobby-player';

        const name = document.createElement('span');
        name.textContent = player.name || player.nickname || 'Игрок';

        const state = document.createElement('span');
        state.textContent = player.ready ? 'Готов' : 'Ожидает';

        row.append(name, state);
        list.appendChild(row);
      }
    }

    const count = players.length;
    const max = Number(data.maxPlayers) || 2;

    const start = $('lobbyStartButton');
    if (start) {
      start.disabled = data.mode === 'coop' && count < 2;
      start.textContent = ready ? 'ОТМЕНИТЬ ГОТОВНОСТЬ' : 'Я ГОТОВ';
    }

    const scale = $('timeScaleSelect');
    if (scale && data.timeScale != null) {
      scale.value = String(data.timeScale);
      scale.disabled = !mp.isOwner || data.started;
    }

    status(
      data.started
        ? 'Игра уже началась.'
        : `Игроков в комнате: ${count}/${max}.`
    );
  }
}

function startGameFromServer(data) {
  ready = false;

  status('Комната готова. Запускаем выживание…');

  const scale = Number(data?.timeScale) || 1;

  // Сервер задаёт скорость минуты в секундах.
  // В текущем game.js время пока работает по старым настройкам.
  document.dispatchEvent(new CustomEvent('lockedhome:game-start', {
    detail: {
      roomId: data?.roomId,
      mode: data?.mode,
      timeScale: scale
    }
  }));

  // Используем существующую кнопку старта игры,
  // чтобы сохранить текущую игровую логику.
  if (startButton) {
    allowGameStart = true;
    startButton.click();
  }

  lobby?.classList.add('hidden');
}

function createRoom(mode) {
  if (!getName()) return;

  if (!connected) {
    status('Ещё подключаемся к серверу. Попробуй через пару секунд.');
    mp.connect();
    return;
  }

  ready = false;

  mp.createRoom({
    mode,
    timeScale: Number($('timeScaleSelect')?.value) || 1
  });

  $('roomSection')?.classList.remove('hidden');
  status(mode === 'solo'
    ? 'Создаём одиночную игру…'
    : 'Создаём комнату для двух игроков…');
}

function joinRoom() {
  if (!getName()) return;

  const code = $('joinRoomCode')?.value.trim().toUpperCase();

  if (!code) {
    status('Введи код комнаты друга.');
    return;
  }

  if (!connected) {
    status('Нет соединения с сервером. Подожди и попробуй снова.');
    mp.connect();
    return;
  }

  ready = false;
  mp.joinRoom(code);
  status('Подключаемся к комнате…');
}

$('menuPlayersButton')?.addEventListener('click', showLobby);
$('lobbyBackButton')?.addEventListener('click', hideLobby);

$('singlePlayerButton')?.addEventListener('click', () => {
  createRoom('solo');
});

$('createRoomButton')?.addEventListener('click', () => {
  createRoom('coop');
});

$('joinRoomButton')?.addEventListener('click', joinRoom);

$('copyRoomCodeButton')?.addEventListener('click', async () => {
  const code = $('roomCode')?.textContent?.trim();

  if (!code || code === '------') {
    status('Сначала создай комнату.');
    return;
  }

  try {
    await navigator.clipboard.writeText(code);
    status('Код комнаты скопирован: ' + code);
  } catch (_) {
    status('Код комнаты: ' + code + '. Скопируй его вручную.');
  }
});

$('lobbyStartButton')?.addEventListener('click', () => {
  if (!mp.currentRoom) {
    status('Сначала создай комнату или присоединись к другу.');
    return;
  }

  const room = lastRoomState || mp.roomInfo;

  if (room?.mode === 'solo') {
    status('Запускаем одиночное выживание…');
    return;
  }

  ready = !ready;
  mp.setReady(ready);

  status(ready
    ? 'Ты готов. Ждём второго игрока.'
    : 'Ты отменил готовность.');
});

$('timeScaleSelect')?.addEventListener('change', () => {
  if (!mp.currentRoom || !mp.isOwner) return;
  mp.setTimeScale(Number($('timeScaleSelect').value));
});

// Перехватываем обычный старт: новая игра теперь начинается через лобби.
// Когда сервер подтвердит game:start, программный клик будет разрешён.
document.addEventListener('click', (event) => {
  if (event.target !== startButton) return;
  if (allowGameStart) {
    allowGameStart = false;
    return;
  }

  event.preventDefault();
  event.stopImmediatePropagation();
  showLobby();
}, true);

mp.on('connection:status', (data) => {
  connected = Boolean(data?.connected);

  const el = $('connectionStatus');
  if (el) el.textContent = connected ? 'Онлайн' : 'Нет связи';

  if (connected) {
    status('Подключено к серверу.');
  } else {
    status('Соединение потеряно. Пытаемся подключиться…');
  }
});

mp.on('connection:error', (data) => {
  status(data?.message || 'Не удалось подключиться к серверу.');
});

mp.on('room:created', (data) => {
  $('roomSection')?.classList.remove('hidden');

  if ($('roomCode')) {
    $('roomCode').textContent = data?.code || data?.roomId || '-----';
  }

  status('Комната создана. Отправь код другу.');
});

mp.on('room:joined', showRoom);
mp.on('room:state', showRoom);

mp.on('room:left', () => {
  ready = false;
  lastRoomState = null;

  $('roomCode').textContent = '------';
  $('lobbyPlayerList').textContent = 'Ты вышел из комнаты.';
  status('Ты вышел из комнаты.');
});

mp.on('room:error', (data) => {
  status(data?.message || 'Не удалось войти в комнату.');
});

mp.on('game:waiting', (data) => {
  if (data?.message) status(data.message);
});

mp.on('game:start', startGameFromServer);

mp.on('chat:system', (data) => {
  if (data?.text) status(data.text);
});

mp.on('online:count', (count) => {
  const el = $('playerCount');
  if (el && Number.isFinite(Number(count))) {
    el.textContent = String(count);
  }
});

mp.connect();
