
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js';
import { Multiplayer } from './multiplayer.js';

const $ = (id) => document.getElementById(id);

const ui = {
  menu: $('menu'),
  roomPicker: $('roomPicker'),
  playButton: $('playButton'),
  nickname: $('nickname'),
  menuStatus: $('menuStatus'),
  hud: $('hud'),
  dayLabel: $('dayLabel'),
  timeLabel: $('timeLabel'),
  roomLabel: $('roomLabel'),
  healthBar: $('healthBar'),
  hungerBar: $('hungerBar'),
  thirstBar: $('thirstBar'),
  staminaBar: $('staminaBar'),
  hint: $('hint'),
  toast: $('toast'),
  inventoryPanel: $('inventoryPanel'),
  shopPanel: $('shopPanel'),
  inventoryList: $('inventoryList'),
  shopList: $('shopList'),
  moneyLabel: $('moneyLabel'),
  chatPanel: $('chatPanel'),
  chatMessages: $('chatMessages'),
  chatForm: $('chatForm'),
  chatInput: $('chatInput'),
  touchControls: $('touchControls'),
  crosshair: $('crosshair'),
  rotateMessage: $('rotateMessage')
};

const state = {
  playing: false,
  roomId: null,
  mode: 'solo',
  day: 1,
  minutes: 360,
  health: 100,
  hunger: 100,
  thirst: 100,
  stamina: 100,
  money: 500,
  basement: false,
  inventory: {
    'Вода': 2,
    'Консервы': 2,
    'Дерево': 0,
    'Камень': 0,
    'Рыба': 0,
    'Травы': 0,
    'Аптечка': 0,
    'Фонарик': 0,
    'Топор': 0,
    'Удочка': 0,
    'Зажигалка': 0,
    'Кровать': 0
  },
  keys: {},
  joyX: 0,
  joyY: 0,
  running: false,
  jumping: false,
  jumpVelocity: 0,
  onGround: true,
  lastTime: 0,
  lastNetworkUpdate: 0,
  lastStatsUpdate: 0,
  toastTimer: null
};

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9bb7c7);
scene.fog = new THREE.Fog(0x9bb7c7, 35, 110);

const camera = new THREE.PerspectiveCamera(
  72,
  window.innerWidth / window.innerHeight,
  0.1,
  300
);

const renderer = new THREE.WebGLRenderer({
  antialias: true,
  powerPreference: 'high-performance'
});

renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
$('game').appendChild(renderer.domElement);

scene.add(new THREE.HemisphereLight(0xd9eaff, 0x46503a, 2));

const sun = new THREE.DirectionalLight(0xffe1ad, 2.2);
sun.position.set(20, 35, 15);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
scene.add(sun);

const mat = (color, roughness = 0.9) =>
  new THREE.MeshStandardMaterial({ color, roughness });

const materials = {
  grass: mat(0x526c42),
  dirt: mat(0x78644b),
  wood: mat(0x70482c),
  darkWood: mat(0x49301f),
  wall: mat(0xc6b79b),
  roof: mat(0x4b3733),
  glass: new THREE.MeshStandardMaterial({
    color: 0x82b8d0,
    roughness: 0.3,
    metalness: 0.1
  }),
  stone: mat(0x777c7d),
  leaf: mat(0x365d39),
  trader: mat(0xd4a34b),
  player: mat(0x477fc4)
};

function box(parent, x, y, z, sx, sy, sz, material, options = {}) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(sx, sy, sz),
    material
  );

  mesh.position.set(x, y, z);
  mesh.castShadow = options.castShadow !== false;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function cylinder(parent, x, y, z, rt, rb, h, material, sides = 8) {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(rt, rb, h, sides),
    material
  );

  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(220, 220),
  materials.grass
);

ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const pathMesh = new THREE.Mesh(
  new THREE.PlaneGeometry(8, 90),
  materials.dirt
);

pathMesh.rotation.x = -Math.PI / 2;
pathMesh.position.set(0, 0.015, -20);
scene.add(pathMesh);

const house = new THREE.Group();
house.position.set(0, 0, -12);
scene.add(house);

// Основной дом.
box(house, 0, 2, 0, 12, 4, 9, materials.wall);
box(house, 0, 4.25, 0, 13, 0.35, 10, materials.darkWood);

// Двускатная крыша.
const roofLeft = box(
  house, -3, 5.15, 0, 7, 0.3, 10, materials.roof
);
roofLeft.rotation.z = -0.42;

const roofRight = box(
  house, 3, 5.15, 0, 7, 0.3, 10, materials.roof
);
roofRight.rotation.z = 0.42;

// Фасадные двери и окна.
box(house, 0, 1.2, 4.57, 1.6, 2.4, 0.16, materials.darkWood);
box(house, -3.6, 2.5, 4.62, 1.5, 1.2, 0.12, materials.glass);
box(house, 3.6, 2.5, 4.62, 1.5, 1.2, 0.12, materials.glass);

const door = box(
  house, 0, 1.2, 4.68, 1.45, 2.25, 0.12, materials.wood
);

const doorKnob = cylinder(
  house, 0.48, 1.2, 4.78, 0.07, 0.07, 0.08, materials.trader, 10
);
doorKnob.rotation.x = Math.PI / 2;

// Подвал снаружи: отдельный вход и ступени.
const basementEntrance = new THREE.Group();
basementEntrance.position.set(8, 0, -10);
scene.add(basementEntrance);

box(
  basementEntrance, 0, 0.25, 0, 3.5, 0.5, 4,
  materials.darkWood
);

for (let i = 0; i < 5; i++) {
  box(
    basementEntrance,
    0,
    -0.05 - i * 0.22,
    1.2 + i * 0.6,
    2.7,
    0.18,
    0.65,
    materials.stone
  );
}

box(
  basementEntrance, 0, 0.7, -1.5, 2.8, 1.4, 0.18,
  materials.wood
);

const basementDoor = box(
  basementEntrance, 0, 0.7, -1.38, 2.3, 1.1, 0.12,
  materials.darkWood
);

function makeTree(x, z, scale = 1) {
  const tree = new THREE.Group();
  tree.position.set(x, 0, z);
  tree.scale.setScalar(scale);

  cylinder(
    tree, 0, 1.3, 0, 0.28, 0.4, 2.6, materials.wood
  );

  const leaves = new THREE.Mesh(
    new THREE.ConeGeometry(1.5, 3.2, 7),
    materials.leaf
  );

  leaves.position.y = 3.2;
  leaves.castShadow = true;
  tree.add(leaves);

  const top = new THREE.Mesh(
    new THREE.ConeGeometry(1.1, 2.4, 7),
    mat(0x426d40)
  );

  top.position.y = 4.4;
  top.castShadow = true;
  tree.add(top);

  scene.add(tree);
}

for (let i = 0; i < 55; i++) {
  const angle = Math.random() * Math.PI * 2;
  const radius = 18 + Math.random() * 48;

  makeTree(
    Math.cos(angle) * radius,
    -12 + Math.sin(angle) * radius,
    0.7 + Math.random() * 0.7
  );
}

// Камни для сбора.
const resourceObjects = [];

for (let i = 0; i < 15; i++) {
  const x = (Math.random() - 0.5) * 45;
  const z = -12 + (Math.random() - 0.5) * 55;

  if (Math.abs(x) < 8 && Math.abs(z + 12) < 8) continue;

  const rock = new THREE.Mesh(
    new THREE.DodecahedronGeometry(0.35 + Math.random() * 0.4, 0),
    materials.stone
  );

  rock.position.set(x, 0.35, z);
  rock.castShadow = true;
  rock.userData = { type: 'Камень', collected: false };

  scene.add(rock);
  resourceObjects.push(rock);
}

// Деревянные брёвна.
for (let i = 0; i < 12; i++) {
  const x = (Math.random() - 0.5) * 35;
  const z = -12 + (Math.random() - 0.5) * 40;

  if (Math.abs(x) < 8 && Math.abs(z + 12) < 8) continue;

  const log = cylinder(
    scene, x, 0.22, z, 0.22, 0.22, 1.6, materials.wood, 8
  );

  log.rotation.z = Math.PI / 2;
  log.userData = { type: 'Дерево', collected: false };
  resourceObjects.push(log);
}

// Торговец.
const trader = new THREE.Group();
trader.position.set(-8, 0, -4);
scene.add(trader);

cylinder(
  trader, 0, 0.95, 0, 0.35, 0.4, 1.2, materials.trader
);

box(trader, 0, 1.75, 0, 0.85, 0.75, 0.6, materials.wood);

box(trader, 0, 2.2, 0, 1.3, 0.15, 0.9, materials.trader);

cylinder(
  trader, 0, 2.65, 0, 0.38, 0.38, 0.45, materials.player
);

// Табличка над торговцем.
const sign = box(
  trader, 0, 3.2, 0, 2.2, 0.55, 0.12, materials.darkWood
);

// Игрок.
const player = new THREE.Group();
scene.add(player);

const playerBody = box(
  player, 0, 1, 0, 0.7, 1.1, 0.45, materials.player
);

const playerHead = new THREE.Mesh(
  new THREE.SphereGeometry(0.3, 12, 10),
  mat(0xe0b18a)
);

playerHead.position.y = 1.8;
playerHead.castShadow = true;
player.add(playerHead);

const playerLegs = [
  box(player, -0.2, 0.35, 0, 0.22, 0.7, 0.25, materials.darkWood),
  box(player, 0.2, 0.35, 0, 0.22, 0.7, 0.25, materials.darkWood)
];

const remotePlayers = new Map();

const multiplayer = new Multiplayer({
  onStatus: (message) => {
    ui.menuStatus.textContent = message;
  },

  onReady: (data) => {
    if (data.nickname) {
      ui.nickname.value = data.nickname;
    }
  },

  onError: (message) => showToast(message),

  onRoomJoined: (data) => {
    state.roomId = data.roomId;
    state.mode = data.mode;
    state.playing = true;

    ui.menu.classList.add('hidden');
    ui.hud.classList.remove('hidden');
    ui.chatPanel.classList.remove('hidden');
    ui.touchControls.classList.remove('hidden');
    ui.crosshair.classList.remove('hidden');

    ui.roomLabel.textContent = data.name;
    ui.hint.textContent =
      'Исследуй территорию. Подойди к дому или торговцу.';

    addSystemMessage(`Ты вошёл в комнату: ${data.name}`);

    if (data.players) {
      data.players.forEach(addOrUpdateRemotePlayer);
    }
  },

  onRoomLeft: () => {
    state.roomId = null;
    state.playing = false;
    clearRemotePlayers();
  },

  onRoomState: (data) => {
    if (data.players) {
      const activeIds = new Set();

      data.players.forEach((p) => {
        if (p.id !== multiplayer.id) {
          activeIds.add(p.id);
          addOrUpdateRemotePlayer(p);
        }
      });

      for (const id of remotePlayers.keys()) {
        if (!activeIds.has(id)) removeRemotePlayer(id);
      }
    }
  },

  onPlayerMoved: (data) => {
    addOrUpdateRemotePlayer(data);
  },

  onPlayerStats: (data) => {
    const remote = remotePlayers.get(data.id);
    if (remote) remote.health = data.health;
  },

  onOnlineCount: (count) => {
    ui.menuStatus.dataset.online = String(count);
  },

  onLobbyRooms: () => {},

  onGameStart: () => {
    showToast('Игрок найден! Выживайте вместе.');
  },

  onGameEvent: (data) => {
    if (data.playerId !== multiplayer.id) {
      if (data.type === 'day:changed') {
        showToast(`${data.nickname}: наступил новый день.`);
      }
    }
  },

  onChatMessage: addChatMessage,

  onChatLobby: addChatMessage,

  onChatSystem: (data) => addSystemMessage(data.text)
});

multiplayer.connect();

function addOrUpdateRemotePlayer(data) {
  if (!data || data.id === multiplayer.id) return;

  let remote = remotePlayers.get(data.id);

  if (!remote) {
    const group = new THREE.Group();

    const body = box(
      group, 0, 1, 0, 0.7, 1.1, 0.45, mat(0x62a9a0)
    );

    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.3, 12, 10),
      mat(0xe0b18a)
    );

    head.position.y = 1.8;
    group.add(head);

    const label = document.createElement('div');
    label.className = 'player-label';
    label.textContent = data.nickname || 'Игрок';
    label.style.cssText =
      'position:fixed;left:-10000px;top:-10000px;pointer-events:none;';

    document.body.appendChild(label);
    scene.add(group);

    remote = {
      group,
      body,
      label,
      target: new THREE.Vector3(
        Number(data.x) || 0,
        0,
        Number(data.z) || 0
      ),
      rotation: Number(data.rotation) || 0,
      health: data.health ?? 100
    };

    remotePlayers.set(data.id, remote);
  }

  remote.label.textContent = data.nickname || 'Игрок';

  remote.target.set(
    Number(data.x) || 0,
    Number(data.y) || 0,
    Number(data.z) || 0
  );

  remote.rotation = Number(data.rotation) || 0;
}

function removeRemotePlayer(id) {
  const remote = remotePlayers.get(id);
  if (!remote) return;

  scene.remove(remote.group);
  remote.label.remove();
  remotePlayers.delete(id);
}

function clearRemotePlayers() {
  for (const id of remotePlayers.keys()) {
    removeRemotePlayer(id);
  }
}

function showToast(message) {
  ui.toast.textContent = message;
  ui.toast.classList.remove('hidden');

  clearTimeout(state.toastTimer);

  state.toastTimer = setTimeout(() => {
    ui.toast.classList.add('hidden');
  }, 2600);
}

function addSystemMessage(text) {
  addChatMessage({
    nickname: 'СИСТЕМА',
    text,
    time: Date.now()
  });
}

function addChatMessage(message) {
  const row = document.createElement('div');
  row.className = 'chat-message';

  const name = document.createElement('strong');
  name.textContent = `${message.nickname || 'Игрок'}: `;

  const text = document.createElement('span');
  text.textContent = message.text || '';

  row.append(name, text);
  ui.chatMessages.appendChild(row);

  while (ui.chatMessages.children.length > 60) {
    ui.chatMessages.firstElementChild.remove();
  }

  ui.chatMessages.scrollTop = ui.chatMessages.scrollHeight;
}

function openPanel(id) {
  $(id).classList.remove('hidden');
}

function closePanel(id) {
  $(id).classList.add('hidden');
}

document.querySelectorAll('[data-close]').forEach((button) => {
  button.addEventListener('click', () => {
    closePanel(button.dataset.close);
  });
});

$('playButton').addEventListener('click', () => {
  ui.roomPicker.classList.remove('hidden');
  ui.playButton.classList.add('hidden');

  const nickname = ui.nickname.value.trim().slice(0, 20);

  if (nickname) {
    multiplayer.setNickname(nickname);
  }
});

$('backButton').addEventListener('click', () => {
  ui.roomPicker.classList.add('hidden');
  ui.playButton.classList.remove('hidden');
});

document.querySelectorAll('[data-room]').forEach((button) => {
  button.addEventListener('click', () => {
    const nickname = ui.nickname.value.trim().slice(0, 20);

    if (!nickname) {
      showToast('Сначала введи никнейм.');
      return;
    }

    multiplayer.setNickname(nickname);
    multiplayer.joinRoom(button.dataset.room);
  });
});

$('leaveButton').addEventListener('click', () => {
  multiplayer.leaveRoom();

  state.playing = false;
  ui.hud.classList.add('hidden');
  ui.chatPanel.classList.add('hidden');
  ui.touchControls.classList.add('hidden');
  ui.crosshair.classList.add('hidden');
  ui.menu.classList.remove('hidden');
  ui.roomPicker.classList.add('hidden');
  ui.playButton.classList.remove('hidden');

  closePanel('inventoryPanel');
  closePanel('shopPanel');
});

$('inventoryButton').addEventListener('click', () => {
  renderInventory();
  openPanel('inventoryPanel');
});

$('shopButton').addEventListener('click', () => {
  renderShop();
  openPanel('shopPanel');
});

ui.chatForm.addEventListener('submit', (event) => {
  event.preventDefault();

  const text = ui.chatInput.value.trim();

  if (!text) return;

  multiplayer.sendChat(text);
  ui.chatInput.value = '';
});

const shopItems = [
  { name: 'Удочка', price: 1200 },
  { name: 'Костёр', price: 900 },
  { name: 'Зажигалка', price: 350 },
  { name: 'Топор', price: 1500 },
  { name: 'Фонарик', price: 700 },
  { name: 'Аптечка', price: 800 },
  { name: 'Кровать', price: 1000 },
  { name: 'Консервы', price: 250 },
  { name: 'Вода', price: 150 },
  { name: 'Дерево', price: 500 },
  { name: 'Камень', price: 100 }
];

function renderInventory() {
  ui.inventoryList.replaceChildren();

  for (const [name, count] of Object.entries(state.inventory)) {
    const row = document.createElement('div');
    row.className = 'item-row';

    const label = document.createElement('span');
    label.textContent = `${name}: ${count}`;

    row.appendChild(label);
    ui.inventoryList.appendChild(row);
  }
}

function renderShop() {
  ui.shopList.replaceChildren();
  ui.moneyLabel.textContent = `${state.money} ₽`;

  for (const item of shopItems) {
    const row = document.createElement('div');
    row.className = 'item-row';

    const label = document.createElement('span');
    label.textContent = `${item.name} — ${item.price} ₽`;

    const button = document.createElement('button');
    button.textContent = 'Купить';

    button.addEventListener('click', () => {
      if (state.money < item.price) {
        showToast('Не хватает денег!');
        return;
      }

      state.money -= item.price;
      state.inventory[item.name] =
        (state.inventory[item.name] || 0) + 1;

      renderShop();
      showToast(`Куплено: ${item.name}`);
      multiplayer.sendGameEvent('item:collected', {
        item: item.name
      });
    });

    row.append(label, button);
    ui.shopList.appendChild(row);
  }
}

$('eatButton').addEventListener('click', () => {
  if ((state.inventory['Консервы'] || 0) <= 0) {
    showToast('Нет еды!');
    return;
  }

  state.inventory['Консервы']--;
  state.hunger = Math.min(100, state.hunger + 35);

  updateStats();
  renderInventory();
  showToast('Ты поел.');
});

$('drinkButton').addEventListener('click', () => {
  if ((state.inventory['Вода'] || 0) <= 0) {
    showToast('Нет воды!');
    return;
  }

  state.inventory['Вода']--;
  state.thirst = Math.min(100, state.thirst + 35);

  updateStats();
  renderInventory();
  showToast('Ты попил воды.');
});

function updateStats() {
  ui.healthBar.style.width = `${state.health}%`;
  ui.hungerBar.style.width = `${state.hunger}%`;
  ui.thirstBar.style.width = `${state.thirst}%`;
  ui.staminaBar.style.width = `${state.stamina}%`;
}

function formatTime(minutes) {
  const h = Math.floor(minutes / 60) % 24;
  const m = Math.floor(minutes % 60);

  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function updateClock(delta) {
  state.minutes += delta * 60;

  if (state.minutes >= 1440) {
    state.minutes = 0;
    state.day++;

    if (state.day > 14) {
      state.day = 14;
      showToast('14 дней пройдено! Ты выжил!');
    } else {
      showToast(`Наступил день ${state.day}!`);
      multiplayer.sendGameEvent('day:changed', {
        day: state.day
      });
    }
  }

  ui.dayLabel.textContent = `День ${state.day} / 14`;
  ui.timeLabel.textContent = formatTime(state.minutes);

  const hour = Math.floor(state.minutes / 60);

  if (hour >= 20 || hour < 6) {
    scene.background.set(0x101b31);
    scene.fog.color.set(0x101b31);
    sun.intensity = 0.25;
  } else {
    scene.background.set(0x9bb7c7);
    scene.fog.color.set(0x9bb7c7);
    sun.intensity = 2.2;
  }
}

function updateSurvival(delta) {
  state.hunger = Math.max(0, state.hunger - delta * 0.12);
  state.thirst = Math.max(0, state.thirst - delta * 0.2);

  if (state.hunger <= 0 || state.thirst <= 0) {
    state.health = Math.max(0, state.health - delta * 2);
  }

  if (state.health <= 0) {
    showToast('Ты потерял сознание. Начни заново.');
    state.health = 50;
    state.hunger = 50;
    state.thirst = 50;
    player.position.set(0, 0, 3);
  }

  if (state.running && (Math.abs(state.joyX) > 0.1 ||
      Math.abs(state.joyY) > 0.1 ||
      state.keys.KeyW || state.keys.KeyA ||
      state.keys.KeyS || state.keys.KeyD)) {
    state.stamina = Math.max(0, state.stamina - delta * 22);
  } else {
    state.stamina = Math.min(100, state.stamina + delta * 13);
  }

  if (state.stamina <= 0) state.running = false;

  updateStats();
}

function nearestTarget() {
  const targets = [
    { object: trader, type: 'trader', distance: 0 },
    { object: house, type: 'house', distance: 0 },
    { object: basementEntrance, type: 'basement', distance: 0 },
    ...resourceObjects
      .filter((o) => !o.userData.collected)
      .map((o) => ({ object: o, type: 'resource', distance: 0 }))
  ];

  let nearest = null;
  let bestDistance = 3.5;

  for (const target of targets) {
    const distance = player.position.distanceTo(
      target.object.position
    );

    if (distance < bestDistance) {
      bestDistance = distance;
      nearest = target;
    }
  }

  return nearest;
}

function interact() {
  const target = nearestTarget();

  if (!target) {
    showToast('Здесь нечего делать.');
    return;
  }

  if (target.type === 'trader') {
    renderShop();
    openPanel('shopPanel');
    return;
  }

  if (target.type === 'basement') {
    state.basement = !state.basement;

    if (state.basement) {
      player.position.set(8, 0, -8);
      basementDoor.rotation.y = -0.8;
      showToast('Ты вошёл в подвал.');
    } else {
      player.position.set(8, 0, -5);
      basementDoor.rotation.y = 0;
      showToast('Ты вышел из подвала.');
    }

    return;
  }

  if (target.type === 'house') {
    showToast('Дом заперт. Найди способ попасть внутрь.');
    return;
  }

  if (target.type === 'resource') {
    const obj = target.object;

    if (obj.userData.collected) return;

    obj.userData.collected = true;
    state.inventory[obj.userData.type] =
      (state.inventory[obj.userData.type] || 0) + 1;

    scene.remove(obj);

    showToast(`Собрано: ${obj.userData.type}`);
    multiplayer.sendGameEvent('item:collected', {
      item: obj.userData.type
    });

    return;
  }
}

$('interactButton').addEventListener('click', interact);

$('jumpButton').addEventListener('pointerdown', (event) => {
  event.preventDefault();

  if (state.onGround && state.playing) {
    state.jumpVelocity = 6.5;
    state.onGround = false;
    state.jumping = true;
  }
});

$('runButton').addEventListener('pointerdown', () => {
  state.running = true;
});

$('runButton').addEventListener('pointerup', () => {
  state.running = false;
});

$('runButton').addEventListener('pointercancel', () => {
  state.running = false;
});

$('rotateContinue').addEventListener('click', () => {
  ui.rotateMessage.classList.add('hidden');
});

// Клавиатура для компьютера.
window.addEventListener('keydown', (event) => {
  state.keys[event.code] = true;

  if (event.code === 'Space' && state.onGround) {
    state.jumpVelocity = 6.5;
    state.onGround = false;
  }

  if (event.code === 'KeyE' && !event.repeat) interact();

  if (event.code === 'KeyI' && !event.repeat) {
    renderInventory();
    openPanel('inventoryPanel');
  }

  if (event.code === 'KeyB' && !event.repeat) {
    renderShop();
    openPanel('shopPanel');
  }
});

window.addEventListener('keyup', (event) => {
  state.keys[event.code] = false;
});

// Сенсорный джойстик.
const joystickArea = $('joystickArea');
const joystickKnob = $('joystickKnob');

let joystickPointer = null;

function resetJoystick() {
  state.joyX = 0;
  state.joyY = 0;
  joystickPointer = null;
  joystickKnob.style.transform = 'translate(0px, 0px)';
}

joystickArea.addEventListener('pointerdown', (event) => {
  event.preventDefault();
  joystickPointer = event.pointerId;
  joystickArea.setPointerCapture(event.pointerId);
  moveJoystick(event);
});

joystickArea.addEventListener('pointermove', (event) => {
  if (event.pointerId !== joystickPointer) return;
  moveJoystick(event);
});

joystickArea.addEventListener('pointerup', resetJoystick);
joystickArea.addEventListener('pointercancel', resetJoystick);

function moveJoystick(event) {
  const rect = joystickArea.getBoundingClientRect();

  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;

  let dx = event.clientX - cx;
  let dy = event.clientY - cy;

  const max = rect.width * 0.32;
  const length = Math.hypot(dx, dy);

  if (length > max) {
    dx = dx / length * max;
    dy = dy / length * max;
  }

  state.joyX = dx / max;
  state.joyY = dy / max;

  joystickKnob.style.transform = `translate(${dx}px, ${dy}px)`;
}

// Перетаскивание пальцем по правой стороне экрана для поворота камеры.
let lookPointer = null;
let lastLookX = 0;
let lastLookY = 0;
let cameraYaw = 0;
let cameraPitch = 0.25;

renderer.domElement.addEventListener('pointerdown', (event) => {
  if (event.pointerType === 'mouse') {
    if (event.button === 0) {
      lookPointer = event.pointerId;
      lastLookX = event.clientX;
      lastLookY = event.clientY;
    }
    return;
  }

  if (event.clientX > window.innerWidth * 0.35) {
    lookPointer = event.pointerId;
    lastLookX = event.clientX;
    lastLookY = event.clientY;
  }
});

renderer.domElement.addEventListener('pointermove', (event) => {
  if (event.pointerId !== lookPointer) return;

  const dx = event.clientX - lastLookX;
  const dy = event.clientY - lastLookY;

  lastLookX = event.clientX;
  lastLookY = event.clientY;

  cameraYaw -= dx * 0.006;
  cameraPitch = THREE.MathUtils.clamp(
    cameraPitch + dy * 0.004,
    -0.15,
    0.8
  );
});

window.addEventListener('pointerup', (event) => {
  if (event.pointerId === lookPointer) lookPointer = null;
});

window.addEventListener('pointercancel', (event) => {
  if (event.pointerId === lookPointer) lookPointer = null;
});

let cameraForward = new THREE.Vector3();
let cameraRight = new THREE.Vector3();

function updateMovement(delta) {
  if (!state.playing) return;

  const forward =
    (state.keys.KeyW || state.keys.ArrowUp ? 1 : 0) -
    (state.keys.KeyS || state.keys.ArrowDown ? 1 : 0) -
    state.joyY;

  const right =
    (state.keys.KeyD || state.keys.ArrowRight ? 1 : 0) -
    (state.keys.KeyA || state.keys.ArrowLeft ? 1 : 0) +
    state.joyX;

  cameraForward.set(-Math.sin(cameraYaw), 0, -Math.cos(cameraYaw));
  cameraRight.set(Math.cos(cameraYaw), 0, -Math.sin(cameraYaw));

  const direction = new THREE.Vector3();

  direction.addScaledVector(cameraForward, forward);
  direction.addScaledVector(cameraRight, right);

  if (direction.lengthSq() > 0.01) {
    direction.normalize();

    const speed =
      state.running && state.stamina > 0 ? 7.5 : 4.5;

    player.position.addScaledVector(direction, speed * delta);

    player.rotation.y = Math.atan2(direction.x, direction.z);
  }

  // Простая физика прыжка.
  if (!state.onGround) {
    state.jumpVelocity -= 15 * delta;
    player.position.y += state.jumpVelocity * delta;

    if (player.position.y <= 0) {
      player.position.y = 0;
      state.jumpVelocity = 0;
      state.onGround = true;
      state.jumping = false;
    }
  }

  // Ограничение территории.
  player.position.x = THREE.MathUtils.clamp(
    player.position.x, -85, 85
  );

  player.position.z = THREE.MathUtils.clamp(
    player.position.z, -90, 80
  );

  const moving = direction.lengthSq() > 0.01;

  playerLegs[0].rotation.x = moving
    ? Math.sin(performance.now() * 0.012) * 0.5
    : 0;

  playerLegs[1].rotation.x = moving
    ? -Math.sin(performance.now() * 0.012) * 0.5
    : 0;

  const now = performance.now();

  if (now - state.lastNetworkUpdate > 50) {
    state.lastNetworkUpdate = now;

    multiplayer.sendMove(
      player.position,
      player.rotation.y,
      !state.onGround ? 'jump' : moving
        ? (state.running ? 'run' : 'walk')
        : 'idle'
    );
  }
}

const cameraTarget = new THREE.Vector3();

function updateCamera(delta) {
  const distance = 5.5;
  const horizontal = Math.cos(cameraPitch) * distance;

  const desiredPosition = new THREE.Vector3(
    player.position.x + Math.sin(cameraYaw) * horizontal,
    player.position.y + 2 + Math.sin(cameraPitch) * distance,
    player.position.z + Math.cos(cameraYaw) * horizontal
  );

  camera.position.lerp(
    desiredPosition,
    1 - Math.exp(-7 * delta)
  );

  cameraTarget.set(
    player.position.x,
    player.position.y + 1.2,
    player.position.z
  );

  camera.lookAt(cameraTarget);

  // Перемещаем подписи игроков к их экранным позициям.
  for (const remote of remotePlayers.values()) {
    remote.group.position.lerp(remote.target, 1 - Math.exp(-10 * delta));
    remote.group.rotation.y = remote.rotation;

    const projected = remote.group.position.clone();
    projected.y += 2.5;
    projected.project(camera);

    if (projected.z < 1) {
      remote.label.style.left =
        `${(projected.x * 0.5 + 0.5) * window.innerWidth}px`;

      remote.label.style.top =
        `${(-projected.y * 0.5 + 0.5) * window.innerHeight}px`;

      remote.label.style.transform = 'translate(-50%, -50%)';
      remote.label.style.color = 'white';
      remote.label.style.textShadow = '0 1px 4px black';
    } else {
      remote.label.style.left = '-10000px';
    }
  }
}

function updateHint() {
  if (!state.playing) return;

  const target = nearestTarget();

  if (!target) {
    ui.hint.textContent =
      'WASD / джойстик — движение • E / ✋ — взаимодействие';
    return;
  }

  if (target.type === 'trader') {
    ui.hint.textContent = 'Торговец — нажми E или ✋, чтобы открыть магазин';
  } else if (target.type === 'basement') {
    ui.hint.textContent = 'Вход в подвал — нажми E или ✋';
  } else if (target.type === 'house') {
    ui.hint.textContent = 'Дом заперт — нажми E или ✋';
  } else if (target.type === 'resource') {
    ui.hint.textContent = `Собрать ${target.object.userData.type} — E или ✋`;
  }
}

function animate(timestamp) {
  requestAnimationFrame(animate);

  const delta = state.lastTime
    ? Math.min((timestamp - state.lastTime) / 1000, 0.05)
    : 0;

  state.lastTime = timestamp;

  if (state.playing) {
    updateMovement(delta);
    updateClock(delta);
    updateSurvival(delta);
    updateHint();

    if (timestamp - state.lastStatsUpdate > 2000) {
      state.lastStatsUpdate = timestamp;
      multiplayer.sendStats(state.health);
    }
  }

  updateCamera(delta);
  renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

window.addEventListener('contextmenu', (event) => {
  event.preventDefault();
});

updateStats();
animate(0);
