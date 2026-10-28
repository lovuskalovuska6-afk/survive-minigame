
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js';
import { Multiplayer } from './multiplayer.js';

'use strict';

// ======================================================
// THE LOCKED HOME: 14 DAYS
// Основной игровой клиент
// ======================================================

const $ = (id) => document.getElementById(id);

const multiplayer = new Multiplayer();

const state = {
  screen: 'menu',
  roomId: null,
  playing: false,
  paused: false,
  cutscene: false,
  cutsceneStep: 0,
  cutsceneElapsed: 0,

  day: 1,
  minutes: 8 * 60,
  clockAccumulator: 0,

  sensitivity: 0.5,
  graphics: 'medium',
  sound: true,

  joystickX: 0,
  joystickY: 0,
  lookPointerId: null,
  lookLastX: 0,
  lookLastY: 0,

  yaw: 0,
  pitch: 0,
  verticalVelocity: 0,
  grounded: true,

  playerSpeed: 4.5,
  jumpPower: 5.2,

  lastNetworkUpdate: 0,
  lastChatMessage: 0,
  countdown: null,

  remotePlayers: new Map(),
  keys: new Set(),

  started: false,
  notifiedRoomError: false
};

let scene;
let camera;
let renderer;
let clock;
let player;
let playerBody;
let playerHead;
let worldGroup;
let remoteGroup;
let worldReady = false;
let lastFrameTime = 0;
let notificationTimeout = null;
let lastPositionSent = 0;
let animationFrame = 0;
let chatWasOpenBeforePause = false;

const ROOM_NAMES = {
  solo1: 'Одиночная комната 1',
  solo2: 'Одиночная комната 2',
  coop1: 'Кооперативная комната 1',
  coop2: 'Кооперативная комната 2'
};

const REMOTE_COLORS = [
  0x68a5ff,
  0xff9c6b,
  0x8fe1b5,
  0xd9a2ff,
  0xffd56a
];

// ======================================================
// UI
// ======================================================

function showScreen(name) {
  document.querySelectorAll('.screen').forEach((screen) => {
    screen.classList.remove('active');
  });

  const target = $(
    name === 'menu' ? 'mainMenu' :
    name === 'lobby' ? 'lobbyScreen' :
    name === 'waiting' ? 'waitingScreen' :
    name === 'settings' ? 'settingsScreen' :
    'gameScreen'
  );

  if (target) target.classList.add('active');

  state.screen = name;

  document.body.classList.toggle(
    'playing',
    name === 'game' || name === 'waiting'
  );

  if (name === 'game') {
    resizeRenderer();
    requestAnimationFrame(resizeRenderer);
  }
}

function notify(message, duration = 2600) {
  const element = $('notification');
  if (!element) return;

  element.textContent = String(message);
  element.classList.add('visible');

  if (notificationTimeout) {
    clearTimeout(notificationTimeout);
  }

  notificationTimeout = setTimeout(() => {
    element.classList.remove('visible');
  }, duration);
}

function setConnectionStatus(text, connected = false) {
  const element = $('connectionStatus');
  if (!element) return;

  element.textContent = text;
  element.style.color = connected ? '#4ade80' : '#fbbf24';
}

function updateSensitivity(value) {
  const numericValue = Number(value);
  state.sensitivity = Math.max(0.1, Math.min(1, numericValue / 100));

  const label = $('sensitivityValue');
  if (label) label.textContent = `${Math.round(state.sensitivity * 100)}%`;
}

function updateClockUI() {
  const dayElement = $('dayValue');
  const timeElement = $('timeValue');

  if (dayElement) dayElement.textContent = String(state.day);

  if (timeElement) {
    const hours = Math.floor(state.minutes / 60) % 24;
    const minutes = Math.floor(state.minutes) % 60;

    timeElement.textContent =
      `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  }
}

function setObjective(text) {
  const element = $('objectiveText');
  if (element) element.textContent = text;
}

function setGameStatus(text) {
  const element = $('gameStatus');
  if (element) element.textContent = text;
}

function setCutsceneText(text) {
  const element = $('cutsceneText');
  if (element) element.textContent = text;
}

function openSettings() {
  state.screenBeforeSettings = state.screen;
  showScreen('settings');
}

function closeSettings() {
  showScreen(state.screenBeforeSettings || 'menu');
}

function setChatOpen(open) {
  const panel = $('chatPanel');
  if (panel) panel.classList.toggle('open', open);
}

function addChatMessage(name, message) {
  const container = $('chatMessages');
  if (!container) return;

  const row = document.createElement('div');
  row.className = 'chat-message';

  const author = document.createElement('strong');
  author.textContent = `${String(name || 'Игрок').slice(0, 20)}: `;

  const text = document.createElement('span');
  text.textContent = String(message || '').slice(0, 180);

  row.append(author, text);
  container.appendChild(row);

  while (container.children.length > 70) {
    container.removeChild(container.firstChild);
  }

  container.scrollTop = container.scrollHeight;
}

function updatePlayerCount(players) {
  const element = $('gamePlayerCount');
  if (element) element.textContent = String(Math.max(1, players || 1));
}

// ======================================================
// THREE.JS: СОЗДАНИЕ 3D-МИРА
// ======================================================

function initWorld() {
  if (worldReady) return;

  const canvas = $('gameCanvas');
  if (!canvas) return;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x91a4b6);
  scene.fog = new THREE.Fog(0x91a4b6, 32, 115);

  camera = new THREE.PerspectiveCamera(
    72,
    Math.max(1, window.innerWidth) / Math.max(1, window.innerHeight),
    0.1,
    250
  );

  renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: state.graphics !== 'low',
    alpha: false,
    powerPreference: 'high-performance'
  });

  renderer.setPixelRatio(
    Math.min(window.devicePixelRatio || 1, state.graphics === 'high' ? 2 : 1.35)
  );

  renderer.shadowMap.enabled = state.graphics !== 'low';
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  if ('outputColorSpace' in renderer) {
    renderer.outputColorSpace = THREE.SRGBColorSpace;
  }

  if ('toneMapping' in renderer) {
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
  }

  clock = new THREE.Clock();

  worldGroup = new THREE.Group();
  remoteGroup = new THREE.Group();

  scene.add(worldGroup);
  scene.add(remoteGroup);

  createLighting();
  createGround();
  createHouse();
  createTrees();
  createPath();
  createPlayer();

  window.addEventListener('resize', resizeRenderer);

  worldReady = true;
  resizeRenderer();
}

function createLighting() {
  const ambient = new THREE.HemisphereLight(
    0xc6d8f0,
    0x34402f,
    2.0
  );
  scene.add(ambient);

  const sun = new THREE.DirectionalLight(0xffe3b0, 2.4);
  sun.position.set(-15, 25, 12);
  sun.castShadow = state.graphics !== 'low';
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -30;
  sun.shadow.camera.right = 30;
  sun.shadow.camera.top = 30;
  sun.shadow.camera.bottom = -30;
  scene.add(sun);

  const moonGlow = new THREE.PointLight(0x91b7ff, 0.4, 40);
  moonGlow.position.set(12, 9, -16);
  scene.add(moonGlow);
}

function createGround() {
  const groundGeometry = new THREE.PlaneGeometry(220, 220, 1, 1);
  const groundMaterial = new THREE.MeshStandardMaterial({
    color: 0x35493a,
    roughness: 1
  });

  const ground = new THREE.Mesh(groundGeometry, groundMaterial);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.06;
  ground.receiveShadow = true;
  worldGroup.add(ground);

  const clearing = new THREE.Mesh(
    new THREE.CircleGeometry(22, 48),
    new THREE.MeshStandardMaterial({
      color: 0x526044,
      roughness: 1
    })
  );

  clearing.rotation.x = -Math.PI / 2;
  clearing.position.y = -0.025;
  worldGroup.add(clearing);
}

function makeBox(width, height, depth, color, x, y, z, parent = worldGroup) {
  const geometry = new THREE.BoxGeometry(width, height, depth);
  const material = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.92
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);

  return mesh;
}

function createHouse() {
  const x = 0;
  const z = -13;

  // Дом
  makeBox(11, 6, 9, 0x78644e, x, 3, z);

  // Крыша
  const roofGeometry = new THREE.ConeGeometry(8.1, 4.4, 4);
  const roofMaterial = new THREE.MeshStandardMaterial({
    color: 0x352d2c,
    roughness: 1
  });

  const roof = new THREE.Mesh(roofGeometry, roofMaterial);
  roof.position.set(x, 7.4, z);
  roof.rotation.y = Math.PI / 4;
  roof.castShadow = true;
  worldGroup.add(roof);

  // Дверь
  makeBox(1.7, 3.2, 0.2, 0x241d19, x, 1.6, z + 4.61);

  // Ручка
  const knob = new THREE.Mesh(
    new THREE.SphereGeometry(0.09, 10, 8),
    new THREE.MeshStandardMaterial({
      color: 0xd3b66d,
      metalness: 0.65,
      roughness: 0.3
    })
  );

  knob.position.set(0.48, 1.6, z + 4.77);
  worldGroup.add(knob);

  // Окна
  for (const wx of [-3.3, 3.3]) {
    const windowMesh = makeBox(
      1.45, 1.35, 0.12,
      0x172c39,
      wx, 3.3, z + 4.62
    );

    windowMesh.material.emissive = new THREE.Color(0x111d25);
  }

  // Крыльцо
  makeBox(3.6, 0.25, 2, 0x594737, 0, 0.12, z + 5.2);

  // Забор
  for (let i = -8; i <= 8; i++) {
    if (Math.abs(i) < 3) continue;

    makeBox(0.18, 1.1, 0.2, 0x594b3b, i * 0.8, 0.55, z + 8.2);
  }

  makeBox(15, 0.15, 0.18, 0x594b3b, 0, 0.75, z + 8.2);
}

function createTrees() {
  const positions = [
    [-15, -5], [-19, -15], [-16, -25], [-9, -30],
    [15, -7], [18, -19], [14, -28], [23, -11],
    [-21, 5], [-25, 14], [-15, 20], [18, 7],
    [25, 15], [23, 25], [-7, 26], [5, 25],
    [-30, 0], [30, -4], [-27, -24], [28, -28]
  ];

  for (const [x, z] of positions) {
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.24, 0.35, 2.8, 7),
      new THREE.MeshStandardMaterial({
        color: 0x59402d,
        roughness: 1
      })
    );

    trunk.position.set(x, 1.4, z);
    trunk.castShadow = true;
    worldGroup.add(trunk);

    const leaves = new THREE.Mesh(
      new THREE.ConeGeometry(1.8, 4.8, 7),
      new THREE.MeshStandardMaterial({
        color: 0x243d2c,
        roughness: 1
      })
    );

    leaves.position.set(x, 4.1, z);
    leaves.castShadow = true;
    worldGroup.add(leaves);

    const upperLeaves = new THREE.Mesh(
      new THREE.ConeGeometry(1.25, 3.5, 7),
      new THREE.MeshStandardMaterial({
        color: 0x304d35,
        roughness: 1
      })
    );

    upperLeaves.position.set(x, 6, z);
    upperLeaves.castShadow = true;
    worldGroup.add(upperLeaves);
  }
}

function createPath() {
  const path = new THREE.Mesh(
    new THREE.PlaneGeometry(4.5, 30),
    new THREE.MeshStandardMaterial({
      color: 0x6c6252,
      roughness: 1
    })
  );

  path.rotation.x = -Math.PI / 2;
  path.position.set(0, 0.005, 4);
  worldGroup.add(path);

  // Камни вдоль дороги
  for (let i = 0; i < 20; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const stone = new THREE.Mesh(
      new THREE.DodecahedronGeometry(0.15 + Math.random() * 0.18, 0),
      new THREE.MeshStandardMaterial({
        color: 0x6d7168,
        roughness: 1
      })
    );

    stone.position.set(
      side * (2.7 + Math.random() * 1.8),
      0.1,
      12 - i * 1.1
    );

    stone.rotation.set(Math.random(), Math.random(), Math.random());
    worldGroup.add(stone);
  }
}

function createPlayer() {
  player = new THREE.Group();
  player.position.set(0, 0, 2);
  scene.add(player);

  const bodyMaterial = new THREE.MeshStandardMaterial({
    color: 0x416d9c,
    roughness: 0.85
  });

  playerBody = new THREE.Mesh(
    new THREE.BoxGeometry(0.65, 1.05, 0.38),
    bodyMaterial
  );

  playerBody.position.y = 1.05;
  playerBody.castShadow = true;
  player.add(playerBody);

  const headMaterial = new THREE.MeshStandardMaterial({
    color: 0xd6b28c,
    roughness: 0.9
  });

  playerHead = new THREE.Mesh(
    new THREE.BoxGeometry(0.46, 0.46, 0.46),
    headMaterial
  );

  playerHead.position.y = 1.85;
  playerHead.castShadow = true;
  player.add(playerHead);

  // Камера от первого лица
  camera.position.set(0, 1.65, 0);
  player.add(camera);
}

function resizeRenderer() {
  if (!renderer || !camera) return;

  const width = Math.max(1, window.innerWidth);
  const height = Math.max(1, window.innerHeight);

  camera.aspect = width / height;
  camera.updateProjectionMatrix();

  renderer.setSize(width, height, false);
}

// ======================================================
// ИГРОКИ И СЕТЕВАЯ СИНХРОНИЗАЦИЯ
// ======================================================

function makeRemotePlayer(id, name, index = 0) {
  const group = new THREE.Group();

  const color = REMOTE_COLORS[
    Math.abs(String(id).split('').reduce((a, c) => a + c.charCodeAt(0), 0)) %
    REMOTE_COLORS.length
  ];

  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.65, 1.05, 0.38),
    new THREE.MeshStandardMaterial({ color, roughness: 0.85 })
  );

  body.position.y = 1.05;
  body.castShadow = true;
  group.add(body);

  const head = new THREE.Mesh(
    new THREE.BoxGeometry(0.46, 0.46, 0.46),
    new THREE.MeshStandardMaterial({
      color: 0xd6b28c,
      roughness: 0.9
    })
  );

  head.position.y = 1.85;
  group.add(head);

  const labelCanvas = document.createElement('canvas');
  labelCanvas.width = 512;
  labelCanvas.height = 128;

  const ctx = labelCanvas.getContext('2d');

  if (ctx) {
    ctx.clearRect(0, 0, 512, 128);
    ctx.font = 'bold 44px Arial';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#101010';
    ctx.lineWidth = 6;
    ctx.strokeText(String(name || 'Игрок').slice(0, 20), 256, 76);
    ctx.fillText(String(name || 'Игрок').slice(0, 20), 256, 76);
  }

  const texture = new THREE.CanvasTexture(labelCanvas);
  const label = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false
    })
  );

  label.position.y = 2.5;
  label.scale.set(2.3, 0.58, 1);
  group.add(label);

  group.position.set((index % 3) * 2 - 2, 0, -2 - Math.floor(index / 3) * 2);
  remoteGroup.add(group);

  return {
    id,
    name,
    group,
    target: group.position.clone(),
    rotation: 0
  };
}

function removeRemotePlayer(id) {
  const remote = state.remotePlayers.get(id);
  if (!remote) return;

  remoteGroup.remove(remote.group);

  remote.group.traverse((object) => {
    if (object.geometry) object.geometry.dispose();

    if (object.material) {
      if (Array.isArray(object.material)) {
        object.material.forEach((material) => material.dispose());
      } else {
        object.material.dispose();
      }
    }
  });

  state.remotePlayers.delete(id);
}

function clearRemotePlayers() {
  for (const id of [...state.remotePlayers.keys()]) {
    removeRemotePlayer(id);
  }
}

function updateRemotePlayer(data) {
  if (!data) return;

  const id = data.id || data.playerId || data.socketId;
  if (!id || id === multiplayer.playerId) return;

  const pos = data.position || data;
  const x = Number(pos.x);
  const y = Number(pos.y);
  const z = Number(pos.z);

  if (![x, y, z].every(Number.isFinite)) return;

  let remote = state.remotePlayers.get(id);

  if (!remote) {
    remote = makeRemotePlayer(
      id,
      data.name || data.username || 'Игрок',
      state.remotePlayers.size
    );

    state.remotePlayers.set(id, remote);
  }

  remote.target.set(x, Math.max(0, y), z);
  remote.rotation = Number(data.rotation) || 0;
}

function syncRoomPlayers(data) {
  const players = Array.isArray(data?.players) ? data.players : [];

  updatePlayerCount(players.length || 1);

  const seen = new Set();

  players.forEach((entry, index) => {
    const id = entry.id || entry.playerId || entry.socketId;
    if (!id || id === multiplayer.playerId) return;

    seen.add(id);

    updateRemotePlayer({
      ...entry,
      id,
      x: entry.x ?? entry.position?.x ?? (index * 2),
      y: entry.y ?? entry.position?.y ?? 0,
      z: entry.z ?? entry.position?.z ?? -2
    });
  });

  for (const id of [...state.remotePlayers.keys()]) {
    if (!seen.has(id)) removeRemotePlayer(id);
  }
}

// ======================================================
// ПОДКЛЮЧЕНИЕ К СЕРВЕРУ
// ======================================================

function connectMultiplayer() {
  setConnectionStatus('Подключение...', false);
  multiplayer.connect();
}

multiplayer.on('connection:status', (data) => {
  if (data?.connected) {
    setConnectionStatus('Онлайн', true);
  } else {
    setConnectionStatus('Переподключение...', false);
  }
});

multiplayer.on('connection:error', (data) => {
  setConnectionStatus('Нет соединения', false);
  notify(data?.message || 'Не удалось подключиться к серверу.');
});

multiplayer.on('server:ready', () => {
  setConnectionStatus('Онлайн', true);
});

multiplayer.on('lobby:rooms', (data) => {
  const rooms = data?.rooms || data || {};

  for (const roomId of Object.keys(ROOM_NAMES)) {
    const room = rooms[roomId];
    if (!room) continue;

    const count = Number(
      room.count ??
      room.playersCount ??
      room.playerCount ??
      (Array.isArray(room.players) ? room.players.length : 0)
    );

    const capacity = Number(room.capacity || room.maxPlayers || (
      roomId.startsWith('coop') ? 2 : 1
    ));

    const element = $(`count-${roomId}`);

    if (element) {
      element.textContent = `${count} / ${capacity}`;
      element.style.color = count >= capacity ? '#f87171' : '#4ade80';
    }

    const button = document.querySelector(`[data-room="${roomId}"]`);

    if (button) {
      button.classList.toggle('room-full', count >= capacity);
      button.setAttribute(
        'aria-label',
        `${ROOM_NAMES[roomId]}, игроков ${count} из ${capacity}`
      );
    }
  }
});

multiplayer.on('room:joined', (data) => {
  state.roomId = data?.roomId || data?.room || state.roomId;

  showScreen('waiting');

  const title = $('waitingTitle');
  if (title) {
    title.textContent = ROOM_NAMES[state.roomId] || 'Ты вошёл в домик';
  }

  const solo = state.roomId?.startsWith('solo');

  const message = $('waitingMessage');
  if (message) {
    message.textContent = solo
      ? 'Игра начнётся через 10 секунд.'
      : 'Ожидаем второго игрока...';
  }

  const countdown = $('countdownNumber');
  if (countdown) countdown.textContent = solo ? '10' : '…';

  notify('Ты вошёл в комнату!');
});

multiplayer.on('room:state', (data) => {
  syncRoomPlayers(data);
});

multiplayer.on('room:left', () => {
  state.roomId = null;
  state.countdown = null;
  clearRemotePlayers();

  if (state.screen === 'waiting') {
    showScreen('lobby');
  }
});

multiplayer.on('room:error', (data) => {
  notify(data?.message || 'Не удалось войти в комнату.');
});

multiplayer.on('game:waiting', (data) => {
  const message = $('waitingMessage');
  const countdown = $('countdownNumber');

  if (message) {
    message.textContent = data?.message || 'Ожидаем второго игрока...';
  }

  if (countdown) countdown.textContent = '…';
});

multiplayer.on('game:countdown', (data) => {
  const seconds = Number(data?.seconds ?? data?.countdown ?? 10);
  state.countdown = seconds;

  const countdown = $('countdownNumber');
  const message = $('waitingMessage');

  if (countdown) countdown.textContent = String(Math.max(0, seconds));

  if (message) {
    message.textContent = 'Игра скоро начнётся!';
  }
});

multiplayer.on('game:start', (data) => {
  state.roomId = data?.roomId || data?.room || state.roomId;
  state.started = true;
  state.playing = true;
  state.paused = false;
  state.day = 1;
  state.minutes = 8 * 60;
  state.clockAccumulator = 0;

  updateClockUI();
  startGame();
});

multiplayer.on('player:moved', (data) => {
  updateRemotePlayer(data);
});

multiplayer.on('player:joined', (data) => {
  if (data) updateRemotePlayer(data);
});

multiplayer.on('player:left', (data) => {
  const id = data?.id || data?.playerId || data?.socketId;
  if (id) removeRemotePlayer(id);

  updatePlayerCount(Math.max(1, state.remotePlayers.size + 1));
});

multiplayer.on('chat:message', (data) => {
  addChatMessage(data?.name || 'Игрок', data?.message || '');
});

multiplayer.on('chat:error', (data) => {
  notify(data?.message || 'Не удалось отправить сообщение.');
});

// ======================================================
// ЛОББИ И ЗАПУСК
// ======================================================

function enterLobby() {
  showScreen('lobby');
  connectMultiplayer();
}

function joinRoom(roomId) {
  if (!multiplayer.connected) {
    notify('Подожди подключения к серверу.');
    connectMultiplayer();
    return;
  }

  if (!ROOM_NAMES[roomId]) {
    notify('Неизвестная комната.');
    return;
  }

  state.roomId = roomId;
  multiplayer.joinRoom(roomId);
}

function leaveRoom() {
  multiplayer.leaveRoom();

  state.roomId = null;
  state.playing = false;
  state.paused = false;
  state.cutscene = false;
  state.started = false;

  clearRemotePlayers();
  closePause();

  showScreen('lobby');
}

function startGame() {
  initWorld();

  state.playing = true;
  state.paused = false;
  state.cutscene = true;
  state.cutsceneStep = 0;
  state.cutsceneElapsed = 0;
  state.yaw = 0;
  state.pitch = 0;
  state.verticalVelocity = 0;
  state.grounded = true;

  if (player) {
    player.position.set(0, 0, 3);
    player.rotation.y = 0;
  }

  if (playerBody) playerBody.visible = true;
  if (playerHead) playerHead.visible = true;

  showScreen('game');
  showCutscene();

  setObjective('Осмотрись вокруг');
  setGameStatus('Родители привезли тебя домой...');
  updateClockUI();
  updatePlayerCount(state.remotePlayers.size + 1);

  if (renderer) {
    renderer.setAnimationLoop(null);
  }

  if (!animationFrame) {
    animationFrame = requestAnimationFrame(gameLoop);
  }
}

// ======================================================
// КАТ-СЦЕНА
// ======================================================

const CUTSCENE_STEPS = [
  {
    duration: 4,
    text: 'Родители привезли тебя домой...',
    carX: -0.5
  },
  {
    duration: 4,
    text: 'Ты пытаешься открыть дверь. Она заперта.',
    carX: 0
  },
  {
    duration: 4,
    text: 'Ты оборачиваешься, чтобы позвать родителей...',
    carX: 0.5
  },
  {
    duration: 3,
    text: 'Машина уже уезжает. Ты остался один.',
    carX: 1
  }
];

function showCutscene() {
  const overlay = $('cutsceneOverlay');
  const title = $('dayTitle');

  if (overlay) overlay.classList.add('active');
  if (title) title.classList.remove('visible');

  const visual = $('cutsceneVisual');
  if (visual) {
    visual.style.filter = 'brightness(0.8)';
  }

  setCutsceneText(CUTSCENE_STEPS[0].text);
}

function advanceCutscene(delta) {
  if (!state.cutscene || state.paused) return;

  state.cutsceneElapsed += delta;

  const current = CUTSCENE_STEPS[state.cutsceneStep];

  if (current) {
    setCutsceneText(current.text);

    const car = document.querySelector('.cutscene-car');

    if (car) {
      const progress = Math.min(1, state.cutsceneElapsed / current.duration);

      if (state.cutsceneStep === 3) {
        car.style.transform = `translateX(${progress * 100}vw)`;
      } else if (state.cutsceneStep === 0) {
        car.style.transform = `translateX(${(1 - progress) * -35}vw)`;
      } else if (state.cutsceneStep === 1) {
        car.style.transform = 'translateX(0)';
      } else {
        car.style.transform = `translateX(${progress * 10}vw)`;
      }
    }

    if (state.cutsceneElapsed >= current.duration) {
      state.cutsceneStep++;
      state.cutsceneElapsed = 0;

      if (state.cutsceneStep >= CUTSCENE_STEPS.length) {
        finishCutscene();
      }
    }
  }
}

function finishCutscene() {
  state.cutscene = false;

  const overlay = $('cutsceneOverlay');
  const title = $('dayTitle');

  if (overlay) overlay.classList.remove('active');
  if (title) title.classList.add('visible');

  state.playing = true;
  setObjective('Осмотри дом и попробуй открыть дверь');
  setGameStatus('ДЕНЬ 1 — Ты остался один.');

  notify('ДЕНЬ 1. История начинается.', 3500);

  if (player) {
    player.position.set(0, 0, 3);
  }
}

function skipCutscene() {
  if (!state.cutscene) return;

  state.cutsceneStep = CUTSCENE_STEPS.length;
  finishCutscene();
}

// ======================================================
// УПРАВЛЕНИЕ: ДЖОЙСТИК, КАМЕРА, КЛАВИАТУРА
// ======================================================

function setupJoystick() {
  const joystick = $('movementJoystick');
  const stick = $('movementStick');

  if (!joystick || !stick) return;

  let pointerId = null;
  let centerX = 0;
  let centerY = 0;
  let maxDistance = 0;

  function moveStick(event) {
    if (pointerId !== event.pointerId) return;

    const dx = event.clientX - centerX;
    const dy = event.clientY - centerY;
    const distance = Math.hypot(dx, dy);
    const scale = distance > maxDistance ? maxDistance / distance : 1;

    const limitedX = dx * scale;
    const limitedY = dy * scale;

    state.joystickX = limitedX / maxDistance;
    state.joystickY = limitedY / maxDistance;

    stick.style.transform = `translate(${limitedX}px, ${limitedY}px)`;
  }

  function stopStick(event) {
    if (pointerId !== event.pointerId) return;

    pointerId = null;
    state.joystickX = 0;
    state.joystickY = 0;
    stick.style.transform = 'translate(0, 0)';
  }

  joystick.addEventListener('pointerdown', (event) => {
    if (!state.playing || state.paused || state.cutscene) return;

    event.preventDefault();

    pointerId = event.pointerId;

    const rect = joystick.getBoundingClientRect();
    centerX = rect.left + rect.width / 2;
    centerY = rect.top + rect.height / 2;
    maxDistance = rect.width * 0.32;

    joystick.setPointerCapture?.(event.pointerId);
    moveStick(event);
  });

  joystick.addEventListener('pointermove', moveStick);
  joystick.addEventListener('pointerup', stopStick);
  joystick.addEventListener('pointercancel', stopStick);
  joystick.addEventListener('lostpointercapture', () => {
    pointerId = null;
    state.joystickX = 0;
    state.joystickY = 0;
    stick.style.transform = 'translate(0, 0)';
  });
}

function setupLookControls() {
  const lookArea = $('lookArea');
  const canvas = $('gameCanvas');

  function beginLook(event) {
    if (!state.playing || state.paused || state.cutscene) return;

    if (event.pointerType === 'mouse' && event.button !== 0) return;

    state.lookPointerId = event.pointerId;
    state.lookLastX = event.clientX;
    state.lookLastY = event.clientY;

    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch (_) {}

    event.preventDefault();
  }

  function moveLook(event) {
    if (state.lookPointerId !== event.pointerId) return;
    if (state.paused || state.cutscene) return;

    const dx = event.clientX - state.lookLastX;
    const dy = event.clientY - state.lookLastY;

    state.lookLastX = event.clientX;
    state.lookLastY = event.clientY;

    state.yaw -= dx * state.sensitivity * 0.005;
    state.pitch -= dy * state.sensitivity * 0.004;

    state.pitch = THREE.MathUtils.clamp(
      state.pitch,
      -Math.PI / 2.5,
      Math.PI / 2.5
    );

    if (player) player.rotation.y = state.yaw;
    camera.rotation.x = state.pitch;

    event.preventDefault();
  }

  function endLook(event) {
    if (state.lookPointerId !== event.pointerId) return;
    state.lookPointerId = null;
  }

  for (const target of [lookArea, canvas]) {
    if (!target) continue;

    target.addEventListener('pointerdown', beginLook);
    target.addEventListener('pointermove', moveLook);
    target.addEventListener('pointerup', endLook);
    target.addEventListener('pointercancel', endLook);
  }
}

function setupKeyboard() {
  window.addEventListener('keydown', (event) => {
    if (
      ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(event.key)
    ) {
      event.preventDefault();
    }

    state.keys.add(event.key.toLowerCase());

    if (event.key === 'Escape') {
      if (state.paused) {
        closePause();
      } else if (state.screen === 'game' && !state.cutscene) {
        openPause();
      }
    }

    if (
      event.code === 'Space' &&
      state.playing &&
      !state.paused &&
      !state.cutscene
    ) {
      jump();
    }

    if (
      event.key.toLowerCase() === 'e' &&
      state.playing &&
      !state.paused &&
      !state.cutscene
    ) {
      interact();
    }
  });

  window.addEventListener('keyup', (event) => {
    state.keys.delete(event.key.toLowerCase());
  });

  window.addEventListener('blur', () => {
    state.keys.clear();
    state.joystickX = 0;
    state.joystickY = 0;
  });
}

function jump() {
  if (!state.playing || state.paused || state.cutscene) return;
  if (!state.grounded) return;

  state.verticalVelocity = state.jumpPower;
  state.grounded = false;
}

function interact() {
  if (!state.playing || state.paused || state.cutscene) return;

  // Дверь находится перед домом, в направлении -Z.
  const doorPosition = new THREE.Vector3(0, 0, -8.3);
  const distance = player.position.distanceTo(doorPosition);

  if (distance < 5.5) {
    setObjective('Дверь заперта. Нужно найти другой способ попасть внутрь.');
    setGameStatus('Дверь не открывается...');
    notify('Дверь заперта. Похоже, ключа у тебя нет.');
    return;
  }

  setObjective('Осмотри дом и попробуй открыть дверь');
  notify('Здесь пока нечего использовать.');
}

function updateMovement(delta) {
  if (!player || !state.playing || state.paused || state.cutscene) return;

  let forward = 0;
  let strafe = 0;

  if (state.keys.has('w') || state.keys.has('arrowup')) forward += 1;
  if (state.keys.has('s') || state.keys.has('arrowdown')) forward -= 1;
  if (state.keys.has('a') || state.keys.has('arrowleft')) strafe -= 1;
  if (state.keys.has('d') || state.keys.has('arrowright')) strafe += 1;

  forward += -state.joystickY;
  strafe += state.joystickX;

  const length = Math.hypot(forward, strafe);

  if (length > 1) {
    forward /= length;
    strafe /= length;
  }

  const direction = new THREE.Vector3(strafe, 0, -forward);

  if (direction.lengthSq() > 0) {
    direction.normalize();
    direction.applyAxisAngle(new THREE.Vector3(0, 1, 0), state.yaw);

    player.position.addScaledVector(
      direction,
      state.playerSpeed * delta
    );
  }

  state.verticalVelocity -= 12 * delta;
  player.position.y += state.verticalVelocity * delta;

  if (player.position.y <= 0) {
    player.position.y = 0;
    state.verticalVelocity = 0;
    state.grounded = true;
  }

  // Не даём игроку уходить бесконечно далеко от карты.
  player.position.x = THREE.MathUtils.clamp(player.position.x, -48, 48);
  player.position.z = THREE.MathUtils.clamp(player.position.z, -55, 45);

  if (camera) {
    camera.rotation.order = 'YXZ';
    camera.rotation.y = 0;
  }
}

function updateRemotePlayers(delta) {
  for (const remote of state.remotePlayers.values()) {
    remote.group.position.lerp(remote.target, Math.min(1, delta * 9));
    remote.group.rotation.y = remote.rotation;
  }
}

// ======================================================
// ВРЕМЯ: 1 РЕАЛЬНАЯ СЕКУНДА = 1 ИГРОВАЯ МИНУТА
// ======================================================

function updateGameClock(delta) {
  if (!state.playing || state.paused || state.cutscene) return;

  state.clockAccumulator += delta;

  while (state.clockAccumulator >= 1) {
    state.clockAccumulator -= 1;
    state.minutes++;

    if (state.minutes >= 24 * 60) {
      state.minutes = 0;
      state.day++;
      setGameStatus(`Начался день ${state.day}.`);
      setObjective(`День ${state.day}: продержись ещё сутки`);
      notify(`ДЕНЬ ${state.day}`, 3000);
    }
  }

  updateClockUI();
}

// ======================================================
// СЕТЕВОЕ ОБНОВЛЕНИЕ
// ======================================================

function updateNetwork(now) {
  if (!state.playing || state.paused || state.cutscene || !player) return;
  if (now - lastPositionSent < 80) return;

  lastPositionSent = now;

  multiplayer.move(
    {
      x: player.position.x,
      y: player.position.y,
      z: player.position.z
    },
    state.yaw
  );
}

// ======================================================
// ПОЛНЫЙ ЭКРАН И ПОВОРОТ ЭКРАНА
// ======================================================

async function requestFullscreen() {
  try {
    const element = document.documentElement;

    if (!document.fullscreenElement && element.requestFullscreen) {
      await element.requestFullscreen();
    }

    if (screen.orientation?.lock) {
      try {
        await screen.orientation.lock('landscape');
      } catch (_) {
        // Некоторые браузеры запрещают блокировку ориентации.
      }
    }
  } catch (error) {
    console.warn('Полноэкранный режим недоступен:', error);
  }

  resizeRenderer();
}

function handleOrientation() {
  const portrait = window.matchMedia('(orientation: portrait)').matches;

  document.body.classList.toggle(
    'portrait-device',
    portrait
  );

  if (state.screen === 'game' && portrait) {
    setGameStatus('Поверни телефон горизонтально');
  }
}

// ======================================================
// ПАУЗА
// ======================================================

function openPause() {
  if (state.screen !== 'game' || state.cutscene) return;

  state.paused = true;

  const overlay = $('gamePauseOverlay');
  if (overlay) overlay.classList.remove('hidden');

  chatWasOpenBeforePause = $('chatPanel')?.classList.contains('open') || false;
}

function closePause() {
  state.paused = false;

  const overlay = $('gamePauseOverlay');
  if (overlay) overlay.classList.add('hidden');
}

function exitGame() {
  state.playing = false;
  state.paused = false;
  state.cutscene = false;
  state.started = false;

  multiplayer.leaveRoom();
  state.roomId = null;

  clearRemotePlayers();
  closePause();
  showScreen('lobby');
}

// ======================================================
// КНОПКИ И СОБЫТИЯ
// ======================================================

function bindEvents() {
  $('playButton')?.addEventListener('click', enterLobby);

  $('settingsButton')?.addEventListener('click', openSettings);
  $('menuSettingsButton')?.addEventListener('click', openSettings);
  $('gameSettingsButton')?.addEventListener('click', openPause);

  $('backToMenuButton')?.addEventListener('click', () => {
    showScreen('menu');
  });

  $('closeSettingsButton')?.addEventListener('click', closeSettings);

  document.querySelectorAll('[data-room]').forEach((button) => {
    button.addEventListener('click', () => {
      joinRoom(button.dataset.room);
    });
  });

  $('leaveRoomButton')?.addEventListener('click', leaveRoom);

  $('sensitivitySlider')?.addEventListener('input', (event) => {
    updateSensitivity(event.target.value);
  });

  $('graphicsQuality')?.addEventListener('change', (event) => {
    state.graphics = event.target.value;

    if (renderer) {
      renderer.setPixelRatio(
        Math.min(
          window.devicePixelRatio || 1,
          state.graphics === 'high' ? 2 : state.graphics === 'medium' ? 1.35 : 1
        )
      );

      renderer.shadowMap.enabled = state.graphics !== 'low';
    }
  });

  $('soundToggle')?.addEventListener('change', (event) => {
    state.sound = event.target.checked;
  });

  $('fullscreenButton')?.addEventListener('click', requestFullscreen);

  $('interactButton')?.addEventListener('click', interact);
  $('jumpButton')?.addEventListener('click', jump);

  $('chatToggleButton')?.addEventListener('click', () => {
    const open = !$('chatPanel')?.classList.contains('open');
    setChatOpen(open);
  });

  $('closeChatButton')?.addEventListener('click', () => {
    setChatOpen(false);
  });

  $('chatForm')?.addEventListener('submit', (event) => {
    event.preventDefault();

    const input = $('chatInput');
    if (!input) return;

    const message = input.value.trim();
    if (!message) return;

    if (multiplayer.sendChat(message)) {
      input.value = '';
    }
  });

  $('skipCutsceneButton')?.addEventListener('click', skipCutscene);

  $('resumeButton')?.addEventListener('click', closePause);

  $('pauseSettingsButton')?.addEventListener('click', () => {
    state.screenBeforeSettings = 'game';
    openSettings();
  });

  $('pauseExitButton')?.addEventListener('click', exitGame);
  $('exitGameButton')?.addEventListener('click', openPause);

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && state.screen === 'game' && !state.cutscene) {
      openPause();
    }
  });

  window.addEventListener('orientationchange', handleOrientation);
  window.addEventListener('resize', handleOrientation);

  setupJoystick();
  setupLookControls();
  setupKeyboard();
}

// ======================================================
// ИГРОВОЙ ЦИКЛ
// ======================================================

function gameLoop(timestamp) {
  animationFrame = requestAnimationFrame(gameLoop);

  const delta = lastFrameTime
    ? Math.min((timestamp - lastFrameTime) / 1000, 0.05)
    : 0;

  lastFrameTime = timestamp;

  if (!worldReady || !renderer || !scene || !camera) return;

  if (state.cutscene) {
    advanceCutscene(delta);
  } else {
    updateMovement(delta);
    updateGameClock(delta);
    updateNetwork(timestamp);
  }

  updateRemotePlayers(delta);

  if (player && camera) {
    // Камера закреплена на персонаже.
    camera.rotation.order = 'YXZ';
    camera.rotation.x = state.pitch;
  }

  renderer.render(scene, camera);
}

// ======================================================
// ЗАПУСК
// ======================================================

function main() {
  bindEvents();
  updateSensitivity($('sensitivitySlider')?.value || 50);
  handleOrientation();
  updateClockUI();

  const savedName = multiplayer.playerName;
  const nameElement = $('playerName');

  if (nameElement) nameElement.textContent = savedName;

  // Загружаем 3D-сцену заранее, чтобы уменьшить задержку при старте.
  initWorld();

  connectMultiplayer();

  setConnectionStatus('Подключение...', false);
}

main();
