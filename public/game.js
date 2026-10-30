
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js';

/* =========================================================
   THE LOCKED HOME: 30 DAYS
   Основная логика 3D-игры
   ========================================================= */

const $ = (id) => document.getElementById(id);

const canvas = $('gameCanvas');
const menu = $('mainMenu');
const gameScreen = $('gameScreen');

if (!canvas || !menu || !gameScreen) {
  throw new Error('Не найдены основные элементы index.html');
}

const SAVE_KEY = 'locked_home_30_days_v1';
const DAY_LENGTH_SECONDS = 240;
const MAX_DAYS = 30;

const ITEM_DATA = {
  wood: {
    name: 'Дерево',
    icon: '🪵',
    description: 'Материал для крафта и строительства',
    price: 4,
    maxStack: 99
  },
  stone: {
    name: 'Камень',
    icon: '🪨',
    description: 'Материал, добываемый в шахте',
    price: 5,
    maxStack: 99
  },
  scrap: {
    name: 'Металлолом',
    icon: '🔩',
    description: 'Можно продать или использовать для крафта',
    price: 9,
    maxStack: 99
  },
  food: {
    name: 'Консервы',
    icon: '🥫',
    description: 'Восстанавливают сытость',
    price: 14,
    maxStack: 20,
    hunger: 35
  },
  water: {
    name: 'Вода',
    icon: '💧',
    description: 'Восстанавливает жажду',
    price: 10,
    maxStack: 20,
    thirst: 40
  },
  filteredWater: {
    name: 'Чистая вода',
    icon: '🧴',
    description: 'Безопасная вода из фильтра',
    price: 16,
    maxStack: 20,
    thirst: 60
  },
  medkit: {
    name: 'Аптечка',
    icon: '🩹',
    description: 'Восстанавливает здоровье',
    price: 25,
    maxStack: 10,
    health: 45
  },
  axe: {
    name: 'Топор',
    icon: '🪓',
    description: 'Позволяет быстрее рубить деревья',
    price: 45,
    maxStack: 1,
    weapon: true
  },
  pickaxe: {
    name: 'Кирка',
    icon: '⛏️',
    description: 'Позволяет добывать камень в шахте',
    price: 50,
    maxStack: 1
  },
  knife: {
    name: 'Нож',
    icon: '🔪',
    description: 'Оружие ближнего боя',
    price: 30,
    maxStack: 1,
    weapon: true
  },
  pistol: {
    name: 'Пистолет',
    icon: '🔫',
    description: 'Редкое оружие. Найди патроны отдельно',
    price: 180,
    maxStack: 1,
    weapon: true
  },
  ammo: {
    name: 'Патроны',
    icon: '📦',
    description: 'Боеприпасы для найденного оружия',
    price: 12,
    maxStack: 60
  },
  filter: {
    name: 'Фильтр',
    icon: '⚗️',
    description: 'Нужен для очистки речной воды',
    price: 35,
    maxStack: 5
  },
  berries: {
    name: 'Ягоды',
    icon: '🫐',
    description: 'Немного утоляют голод',
    price: 5,
    maxStack: 30,
    hunger: 10
  }
};

const CITIES = [
  { name: 'Тихий посёлок', x: 0, z: 0 },
  { name: 'Старый город', x: 180, z: 0 },
  { name: 'Лесная окраина', x: -180, z: 0 }
];

let scene;
let camera;
let renderer;
let clock;
let player;
let playerBody;
let playerHead;
let sun;
let ambientLight;

let running = false;
let paused = false;
let gameOver = false;
let selectedSlot = 0;
let currentCity = 0;
let day = 1;
let daySeconds = 8 * 60;
let survivalSeconds = 0;
let lastSaveTime = 0;
let lastHungerTick = 0;
let lastThirstTick = 0;
let lastEnergyTick = 0;
let notificationTimer = null;
let interactTarget = null;
let chopProgress = 0;
let mineProgress = 0;
let jumpVelocity = 0;
let verticalVelocity = 0;
let isGrounded = true;
let pointerLocked = false;
let yaw = 0;
let pitch = 0;
let lookTouchId = null;
let lookTouchX = 0;
let lookTouchY = 0;

const keys = Object.create(null);
const joystick = { x: 0, y: 0, active: false };
const movementTouchIds = new Set();

const worldObjects = [];
const interactables = [];
const droppedItems = [];
const remotePlayers = new Map();
const inventory = [];
const craftingRecipes = [
  {
    id: 'filter',
    name: 'Фильтр для воды',
    icon: '⚗️',
    description: '2 металлолома + 2 камня',
    cost: { scrap: 2, stone: 2 },
    result: { id: 'filter', amount: 1 }
  },
  {
    id: 'medkit',
    name: 'Аптечка',
    icon: '🩹',
    description: '3 ягоды + 2 металлолома',
    cost: { berries: 3, scrap: 2 },
    result: { id: 'medkit', amount: 1 }
  },
  {
    id: 'axe',
    name: 'Топор',
    icon: '🪓',
    description: '3 дерева + 2 камня',
    cost: { wood: 3, stone: 2 },
    result: { id: 'axe', amount: 1 }
  },
  {
    id: 'pickaxe',
    name: 'Кирка',
    icon: '⛏️',
    description: '2 дерева + 3 камня',
    cost: { wood: 2, stone: 3 },
    result: { id: 'pickaxe', amount: 1 }
  }
];

const state = {
  health: 100,
  hunger: 100,
  thirst: 100,
  energy: 100,
  money: 50,
  playerName: 'Выживший',
  inventoryCapacity: 8,
  daysSurvived: 0,
  visitedCities: [0],
  waterFiltered: false
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function random(min, max) {
  return min + Math.random() * (max - min);
}

function randomInt(min, max) {
  return Math.floor(random(min, max + 1));
}

function distanceXZ(a, b) {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dz * dz);
}

function itemInfo(id) {
  return ITEM_DATA[id] || {
    name: id,
    icon: '📦',
    description: 'Неизвестный предмет',
    price: 1,
    maxStack: 99
  };
}

/* ---------------- Сохранение ---------------- */

function saveGame(showMessage = true) {
  try {
    const save = {
      day,
      daySeconds,
      currentCity,
      state,
      inventory,
      player: player
        ? {
            x: player.position.x,
            y: player.position.y,
            z: player.position.z
          }
        : null,
      savedAt: Date.now()
    };

    localStorage.setItem(SAVE_KEY, JSON.stringify(save));
    if (showMessage) notify('Игра сохранена');
    return true;
  } catch (error) {
    console.error('Не удалось сохранить игру:', error);
    if (showMessage) notify('Не удалось сохранить игру');
    return false;
  }
}

function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;

    const save = JSON.parse(raw);
    if (!save || typeof save !== 'object') return false;

    day = clamp(Number(save.day) || 1, 1, MAX_DAYS);
    daySeconds = Number(save.daySeconds) || 8 * 60;
    currentCity = clamp(Number(save.currentCity) || 0, 0, CITIES.length - 1);

    if (save.state && typeof save.state === 'object') {
      Object.assign(state, save.state);
    }

    inventory.length = 0;
    if (Array.isArray(save.inventory)) {
      for (const item of save.inventory) {
        if (
          item &&
          typeof item.id === 'string' &&
          Number.isFinite(item.amount) &&
          item.amount > 0
        ) {
          inventory.push({
            id: item.id,
            amount: Math.floor(item.amount)
          });
        }
      }
    }

    if (save.player) {
      savedPlayerPosition.x = Number(save.player.x) || 0;
      savedPlayerPosition.y = Number(save.player.y) || 1.7;
      savedPlayerPosition.z = Number(save.player.z) || 0;
      hasSavedPlayerPosition = true;
    }

    return true;
  } catch (error) {
    console.error('Ошибка загрузки сохранения:', error);
    return false;
  }
}

const savedPlayerPosition = { x: 0, y: 1.7, z: 0 };
let hasSavedPlayerPosition = false;

/* ---------------- Предметы ---------------- */

function countItem(id) {
  return inventory
    .filter((item) => item.id === id)
    .reduce((sum, item) => sum + item.amount, 0);
}

function hasItem(id, amount = 1) {
  return countItem(id) >= amount;
}

function addItem(id, amount = 1, showMessage = true) {
  if (!ITEM_DATA[id] || amount <= 0) return false;

  let remaining = Math.floor(amount);
  const info = itemInfo(id);

  const existing = inventory.find((item) => item.id === id);

  if (existing && existing.amount < info.maxStack) {
    const space = info.maxStack - existing.amount;
    const added = Math.min(space, remaining);
    existing.amount += added;
    remaining -= added;
  }

  while (remaining > 0 && inventory.length < state.inventoryCapacity) {
    const stackAmount = Math.min(info.maxStack, remaining);
    inventory.push({ id, amount: stackAmount });
    remaining -= stackAmount;
  }

  if (remaining > 0) {
    notify('Инвентарь заполнен: часть предметов осталась на земле');
    spawnDroppedItem(id, remaining, player.position.x, player.position.z);
  } else if (showMessage) {
    notify(`Получено: ${info.icon} ${info.name} ×${amount}`);
  }

  updateUI();
  return remaining === 0;
}

function removeItem(id, amount = 1) {
  let remaining = amount;

  for (let i = inventory.length - 1; i >= 0 && remaining > 0; i--) {
    const item = inventory[i];
    if (item.id !== id) continue;

    const removed = Math.min(item.amount, remaining);
    item.amount -= removed;
    remaining -= removed;

    if (item.amount <= 0) inventory.splice(i, 1);
  }

  updateUI();
  return remaining === 0;
}

function dropItem(id, amount = 1) {
  if (!hasItem(id, amount)) {
    notify('Нет такого количества предметов');
    return;
  }

  removeItem(id, amount);
  spawnDroppedItem(id, amount, player.position.x, player.position.z);
  notify(`Выброшено: ${itemInfo(id).name} ×${amount}`);
}

function pickupDroppedItem(drop) {
  if (!drop || drop.collected) return;

  const distance = distanceXZ(player.position, drop.mesh.position);
  if (distance > 3.5) {
    notify('Подойди ближе к предмету');
    return;
  }

  const itemId = drop.itemId;
  const amount = drop.amount;

  drop.collected = true;
  scene.remove(drop.mesh);

  const index = droppedItems.indexOf(drop);
  if (index >= 0) droppedItems.splice(index, 1);

  addItem(itemId, amount);
}

function spawnDroppedItem(id, amount, x, z) {
  if (!scene || !ITEM_DATA[id]) return;

  const geometry = new THREE.BoxGeometry(0.45, 0.35, 0.45);
  const material = new THREE.MeshStandardMaterial({
    color: id === 'pistol' || id === 'knife' ? 0xcbd5e1 : 0xd6a75b,
    roughness: 0.8
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x + random(-1.5, 1.5), 0.35, z + random(-1.5, 1.5));
  mesh.castShadow = true;
  scene.add(mesh);

  const drop = { itemId: id, amount, mesh, collected: false };
  droppedItems.push(drop);

  interactables.push({
    type: 'drop',
    object: mesh,
    label: `${itemInfo(id).name} ×${amount}`,
    description: 'Подойти и подобрать предмет',
    action: () => pickupDroppedItem(drop)
  });
}

/* ---------------- 3D-сцена ---------------- */

function initThree() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x8bb5cf);
  scene.fog = new THREE.Fog(0x8bb5cf, 65, 260);

  camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.1,
    800
  );

  renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: 'high-performance'
  });

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  clock = new THREE.Clock();

  ambientLight = new THREE.HemisphereLight(0xddeeff, 0x46513b, 1.8);
  scene.add(ambientLight);

  sun = new THREE.DirectionalLight(0xfff1ce, 2.5);
  sun.position.set(50, 90, 35);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -100;
  sun.shadow.camera.right = 100;
  sun.shadow.camera.top = 100;
  sun.shadow.camera.bottom = -100;
  scene.add(sun);

  createWorld();
  createPlayer();
  createInitialLoot();

  window.addEventListener('resize', onResize);
}

function createMaterial(color, roughness = 0.9) {
  return new THREE.MeshStandardMaterial({ color, roughness });
}

function addBox(name, x, y, z, sx, sy, sz, color, solid = true) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(sx, sy, sz),
    createMaterial(color)
  );

  mesh.name = name;
  mesh.position.set(x, y + sy / 2, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);

  if (solid) {
    worldObjects.push({
      mesh,
      x,
      z,
      halfX: sx / 2,
      halfZ: sz / 2,
      height: sy
    });
  }

  return mesh;
}

function addTree(x, z) {
  const group = new THREE.Group();

  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.25, 0.4, 2.4, 7),
    createMaterial(0x68442b)
  );
  trunk.position.y = 1.2;
  trunk.castShadow = true;
  group.add(trunk);

  const leaves = new THREE.Mesh(
    new THREE.ConeGeometry(random(1.5, 2.2), random(3.2, 4.5), 7),
    createMaterial(Math.random() > 0.5 ? 0x276749 : 0x34734a)
  );
  leaves.position.y = 3.5;
  leaves.castShadow = true;
  group.add(leaves);

  group.position.set(x, 0, z);
  scene.add(group);

  const tree = {
    type: 'tree',
    object: group,
    x,
    z,
    hp: 3,
    maxHp: 3,
    label: 'Дерево',
    description: 'Можно срубить и получить древесину',
    action: () => chopTree(tree)
  };

  interactables.push(tree);
  return tree;
}

function addRock(x, z) {
  const mesh = new THREE.Mesh(
    new THREE.DodecahedronGeometry(random(0.8, 1.25), 0),
    createMaterial(0x737b82)
  );

  mesh.position.set(x, 0.75, z);
  mesh.castShadow = true;
  scene.add(mesh);

  const rock = {
    type: 'rock',
    object: mesh,
    x,
    z,
    hp: 4,
    label: 'Каменная жила',
    description: 'Кирка помогает добывать камень',
    action: () => mineRock(rock)
  };

  interactables.push(rock);
  return rock;
}

function addLootCrate(x, z) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(1, 0.9, 1),
    createMaterial(0x8b5e34)
  );

  mesh.position.set(x, 0.45, z);
  mesh.castShadow = true;
  scene.add(mesh);

  const crate = {
    type: 'crate',
    object: mesh,
    x,
    z,
    opened: false,
    label: 'Старый ящик',
    description: 'Внутри могут быть полезные вещи',
    action: () => openCrate(crate)
  };

  interactables.push(crate);
}

function createWorld() {
  scene.clear();

  worldObjects.length = 0;
  interactables.length = 0;
  droppedItems.length = 0;

  ambientLight = new THREE.HemisphereLight(0xddeeff, 0x46513b, 1.8);
  scene.add(ambientLight);

  sun = new THREE.DirectionalLight(0xfff1ce, 2.5);
  sun.position.set(50, 90, 35);
  sun.castShadow = true;
  scene.add(sun);

  scene.background = new THREE.Color(0x8bb5cf);
  scene.fog = new THREE.Fog(0x8bb5cf, 65, 260);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(600, 600),
    createMaterial(0x527c45)
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // Дороги
  addBox('Дорога', 0, 0.02, 0, 9, 0.05, 230, 0x494b4b, false);
  addBox('Дорога', 0, 0.03, 0, 230, 0.05, 9, 0x494b4b, false);

  // Дом игрока
  addBox('Стена дома', 0, 0, -9, 12, 4, 0.5, 0xc7b9a3);
  addBox('Стена дома', -6, 0, -3, 0.5, 4, 12, 0xb9a88e);
  addBox('Стена дома', 6, 0, -3, 0.5, 4, 12, 0xb9a88e);
  addBox('Задняя стена', 0, 0, 3, 12, 4, 0xc7b9a3);

  // Крыша
  const roof = new THREE.Mesh(
    new THREE.ConeGeometry(9, 4, 4),
    createMaterial(0x573b35)
  );
  roof.rotation.y = Math.PI / 4;
  roof.scale.set(1, 1, 0.75);
  roof.position.set(0, 5.3, -3);
  roof.castShadow = true;
  scene.add(roof);

  // Дверь
  addBox('Дверь', 0, 0, 3.3, 1.8, 2.7, 0.2, 0x67452f, false);

  // Мебель
  addBox('Стол', -3.5, 0, -3.5, 2.3, 1.1, 1.1, 0x765139, false);
  addBox('Кровать', 3.2, 0, -5.3, 2.3, 0.5, 3.3, 0x64748b, false);

  // Забор
  for (let x = -14; x <= 14; x += 2) {
    if (Math.abs(x) < 3) continue;
    addBox('Забор', x, 0, 8, 0.25, 1.2, 0.25, 0x8b6843);
  }

  // Река на окраине
  const river = new THREE.Mesh(
    new THREE.PlaneGeometry(25, 280),
    new THREE.MeshStandardMaterial({
      color: 0x167fc1,
      roughness: 0.25,
      metalness: 0.1,
      transparent: true,
      opacity: 0.88
    })
  );
  river.rotation.x = -Math.PI / 2;
  river.position.set(48, 0.06, 35);
  scene.add(river);

  // Зона шахты
  addBox('Скала шахты', -35, 0, -28, 15, 7, 9, 0x525a61);
  addBox('Вход шахты', -35, 0, -23.3, 5, 4.8, 0.5, 0x17191c, false);

  const mineSign = addBox(
    'Табличка шахты',
    -35,
    4.5,
    -22.7,
    5,
    0.7,
    0.25,
    0x7c4a22,
    false
  );

  interactables.push({
    type: 'mineEntrance',
    object: mineSign,
    label: 'Шахта',
    description: 'Добывай камень и металлолом',
    action: () => notify('Шахта: ищи каменные жилы рядом со скалой')
  });

  // Деревья вокруг посёлка
  for (let i = 0; i < 70; i++) {
    let x = random(-95, 95);
    let z = random(-95, 95);

    if (Math.abs(x) < 16 && Math.abs(z) < 16) continue;
    if (Math.abs(x - 48) < 14) continue;

    addTree(x, z);
  }

  // Каменные жилы
  for (let i = 0; i < 18; i++) {
    addRock(random(-55, 55), random(-55, 55));
  }

  // Заброшенные ящики
  for (let i = 0; i < 12; i++) {
    addLootCrate(random(-75, 75), random(-75, 75));
  }

  // Препятствия вне дома
  for (let i = 0; i < 25; i++) {
    const x = random(-80, 80);
    const z = random(-80, 80);

    if (Math.abs(x) < 15 && Math.abs(z) < 15) continue;
    if (Math.abs(x - 48) < 15) continue;

    if (Math.random() > 0.5) {
      addBox(
        'Каменное препятствие',
        x,
        0,
        z,
        random(1, 3),
        random(0.7, 2),
        random(1, 3),
        0x737b82
      );
    }
  }

  addWaterFilterStation();
  addShopStand();
  addCityTravelPoint();
}

function addWaterFilterStation() {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(1.5, 1.5, 1.5),
    createMaterial(0x64748b)
  );

  mesh.position.set(14, 0.75, 5);
  mesh.castShadow = true;
  scene.add(mesh);

  interactables.push({
    type: 'filterStation',
    object: mesh,
    label: 'Фильтр для воды',
    description: 'Нужен фильтр и бутылка воды',
    action: filterWater
  });
}

function addShopStand() {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(2.5, 1.3, 1.4),
    createMaterial(0x9a6b38)
  );

  mesh.position.set(-14, 0.65, 4);
  mesh.castShadow = true;
  scene.add(mesh);

  interactables.push({
    type: 'shop',
    object: mesh,
    label: 'Торговая палатка',
    description: 'Покупай припасы и продавай добычу',
    action: () => openPanel('shopPanel')
  });
}

function addCityTravelPoint() {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(1.1, 1.1, 0.25, 16),
    createMaterial(0xeab308)
  );

  mesh.position.set(0, 0.15, 18);
  mesh.castShadow = true;
  scene.add(mesh);

  interactables.push({
    type: 'travel',
    object: mesh,
    label: 'Автобусная остановка',
    description: 'Можно отправиться в другой город',
    action: () => openPanel('cityPanel')
  });
}

function createPlayer() {
  player = new THREE.Object3D();
  player.position.set(0, 1.7, 12);

  if (hasSavedPlayerPosition) {
    player.position.set(
      savedPlayerPosition.x,
      savedPlayerPosition.y,
      savedPlayerPosition.z
    );
  }

  playerBody = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.35, 0.85, 4, 8),
    createMaterial(0x2563eb)
  );
  playerBody.position.y = -0.55;
  playerBody.castShadow = true;
  player.add(playerBody);

  playerHead = new THREE.Mesh(
    new THREE.SphereGeometry(0.23, 12, 10),
    createMaterial(0xf0c8a0)
  );
  playerHead.position.y = 0.15;
  playerHead.castShadow = true;
  player.add(playerHead);

  player.add(camera);
  camera.position.set(0, 0.25, 0);

  scene.add(player);
}

function createInitialLoot() {
  // Небольшой стартовый набор
  if (inventory.length === 0) {
    addItem('food', 2, false);
    addItem('water', 2, false);
    addItem('berries', 3, false);
  }

  // Случайная добыча появляется в мире
  const possibleLoot = [
    'wood',
    'stone',
    'scrap',
    'food',
    'water',
    'berries',
    'medkit',
    'knife',
    'pistol',
    'ammo',
    'filter'
  ];

  for (let i = 0; i < 22; i++) {
    const id = possibleLoot[randomInt(0, possibleLoot.length - 1)];
    const x = random(-70, 70);
    const z = random(-70, 70);

    if (Math.abs(x) < 12 && Math.abs(z) < 12) continue;
    spawnDroppedItem(id, id === 'ammo' ? randomInt(4, 12) : 1, x, z);
  }
}

/* ---------------- Взаимодействия ---------------- */

function nearestInteractable() {
  let nearest = null;
  let bestDistance = 4.2;

  for (const target of interactables) {
    if (!target || !target.object || !target.object.parent) continue;

    const position = target.object.getWorldPosition(new THREE.Vector3());
    const d = distanceXZ(player.position, position);

    if (d < bestDistance) {
      bestDistance = d;
      nearest = target;
    }
  }

  for (const drop of droppedItems) {
    if (drop.collected || !drop.mesh.parent) continue;

    const d = distanceXZ(player.position, drop.mesh.position);
    if (d < bestDistance) {
      bestDistance = d;
      nearest = {
        type: 'drop',
        object: drop.mesh,
        label: `${itemInfo(drop.itemId).name} ×${drop.amount}`,
        description: 'Подобрать предмет',
        action: () => pickupDroppedItem(drop)
      };
    }
  }

  return nearest;
}

function updateTargetUI() {
  interactTarget = nearestInteractable();

  const panel = $('targetPanel');
  if (!panel) return;

  if (!interactTarget) {
    panel.classList.add('hidden');
    return;
  }

  panel.classList.remove('hidden');

  if ($('targetName')) $('targetName').textContent = interactTarget.label;
  if ($('targetDescription')) {
    $('targetDescription').textContent = interactTarget.description || '';
  }
}

function interact() {
  if (!running || paused || gameOver) return;

  const target = interactTarget || nearestInteractable();

  if (!target) {
    notify('Рядом нет предметов для взаимодействия');
    return;
  }

  const position = target.object.getWorldPosition(new THREE.Vector3());
  if (distanceXZ(player.position, position) > 4.5) {
    notify('Подойди ближе');
    return;
  }

  target.action();
}

function chopTree(tree) {
  if (!tree.object.parent) return;

  const hasAxe = hasItem('axe');
  if (!hasAxe && state.energy < 3) {
    notify('Слишком мало энергии');
    return;
  }

  chopProgress += hasAxe ? 2 : 1;
  state.energy = Math.max(0, state.energy - (hasAxe ? 1 : 3));

  if (chopProgress < tree.maxHp) {
    notify(`Рубка дерева: ${chopProgress}/${tree.maxHp}`);
    updateUI();
    return;
  }

  chopProgress = 0;
  scene.remove(tree.object);

  const index = interactables.indexOf(tree);
  if (index >= 0) interactables.splice(index, 1);

  const amount = randomInt(3, 6);
  addItem('wood', amount);
  notify(`Дерево срублено! Получено дерева: ${amount}`);
  updateUI();
}

function mineRock(rock) {
  if (!rock.object.parent) return;

  if (!hasItem('pickaxe')) {
    notify('Нужна кирка. Её можно сделать в меню крафта');
    return;
  }

  mineProgress += 1;

  if (mineProgress < rock.hp) {
    notify(`Добыча камня: ${mineProgress}/${rock.hp}`);
    return;
  }

  mineProgress = 0;
  scene.remove(rock.object);

  const index = interactables.indexOf(rock);
  if (index >= 0) interactables.splice(index, 1);

  addItem('stone', randomInt(2, 5));

  if (Math.random() < 0.35) {
    addItem('scrap', 1);
  }

  notify('Жила добыта');
}

function openCrate(crate) {
  if (crate.opened) {
    notify('Ящик уже пуст');
    return;
  }

  crate.opened = true;

  const possible = [
    'wood',
    'stone',
    'scrap',
    'food',
    'water',
    'berries',
    'medkit',
    'knife',
    'pistol',
    'ammo',
    'filter'
  ];

  const id = possible[randomInt(0, possible.length - 1)];
  const amount = id === 'ammo' ? randomInt(5, 15) : randomInt(1, 2);

  addItem(id, amount);

  crate.object.material = createMaterial(0x3f3025);
  crate.label = 'Пустой ящик';
  crate.description = 'Здесь уже ничего нет';

  notify(`В ящике найдено: ${itemInfo(id).name}`);
}

/* ---------------- Река и очистка воды ---------------- */

function filterWater() {
  if (!hasItem('water')) {
    notify('Сначала нужна бутылка речной воды');
    return;
  }

  if (!hasItem('filter')) {
    notify('Нужен фильтр. Его можно купить или изготовить');
    return;
  }

  removeItem('water', 1);
  addItem('filteredWater', 1, false);

  notify('Вода очищена и готова к употреблению');
}

/* ---------------- Инвентарь и предметы ---------------- */

function useSelectedItem() {
  const item = inventory[selectedSlot];
  if (!item) {
    notify('Этот слот пуст');
    return;
  }

  const info = itemInfo(item.id);

  if (info.hunger) {
    state.hunger = clamp(state.hunger + info.hunger, 0, 100);
    removeItem(item.id, 1);
    notify(`${info.name}: голод уменьшился`);
  } else if (info.thirst) {
    state.thirst = clamp(state.thirst + info.thirst, 0, 100);
    removeItem(item.id, 1);
    notify(`${info.name}: жажда уменьшилась`);
  } else if (info.health) {
    state.health = clamp(state.health + info.health, 0, 100);
    removeItem(item.id, 1);
    notify('Здоровье восстановлено');
  } else {
    notify('Этот предмет нельзя использовать напрямую');
  }

  updateUI();
}

function dropSelectedItem() {
  const item = inventory[selectedSlot];

  if (!item) {
    notify('Этот слот пуст');
    return;
  }

  dropItem(item.id, 1);
}

function selectSlot(index) {
  selectedSlot = clamp(index, 0, 7);
  updateHotbar();
}

function updateHotbar() {
  const slots = document.querySelectorAll('.inventory-slot');

  slots.forEach((slot, index) => {
    slot.classList.toggle('selected', index === selectedSlot);

    const item = inventory[index];
    const icon = slot.querySelector('.slot-icon');
    const name = slot.querySelector('.slot-name');
    const count = slot.querySelector('.slot-count');

    if (icon) icon.textContent = item ? itemInfo(item.id).icon : '';
    if (name) name.textContent = item ? itemInfo(item.id).name : '';
    if (count) count.textContent = item && item.amount > 1 ? item.amount : '';
  });
}

function renderInventory() {
  const container = $('inventoryItems');
  if (!container) return;

  container.innerHTML = '';

  if (inventory.length === 0) {
    container.textContent = 'Инвентарь пуст';
    return;
  }

  inventory.forEach((item, index) => {
    const info = itemInfo(item.id);
    const row = document.createElement('div');
    row.className = 'item-row';

    row.innerHTML = `
      <div class="item-icon">${info.icon}</div>
      <div class="item-info">
        <div class="item-name">${escapeHTML(info.name)}</div>
        <div class="item-description">${escapeHTML(info.description)}</div>
      </div>
      <div class="item-amount">×${item.amount}</div>
      <button type="button" data-select-inventory="${index}">Выбрать</button>
    `;

    container.appendChild(row);
  });

  container.querySelectorAll('[data-select-inventory]').forEach((button) => {
    button.addEventListener('click', () => {
      selectSlot(Number(button.dataset.selectInventory));
      closePanel('inventoryPanel');
    });
  });
}

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[char]);
}

/* ---------------- Крафт ---------------- */

function canCraft(recipe) {
  return Object.entries(recipe.cost).every(([id, amount]) => hasItem(id, amount));
}

function craft(recipe) {
  if (!canCraft(recipe)) {
    notify('Не хватает материалов');
    return;
  }

  for (const [id, amount] of Object.entries(recipe.cost)) {
    removeItem(id, amount);
  }

  addItem(recipe.result.id, recipe.result.amount);
  notify(`Создано: ${recipe.name}`);
  renderCrafting();
}

function renderCrafting() {
  const container = $('craftingItems');
  if (!container) return;

  container.innerHTML = '';

  craftingRecipes.forEach((recipe) => {
    const row = document.createElement('div');
    row.className = 'item-row';

    const ingredients = Object.entries(recipe.cost)
      .map(([id, amount]) => `${itemInfo(id).name} ×${amount}`)
      .join(', ');

    row.innerHTML = `
      <div class="item-icon">${recipe.icon}</div>
      <div class="item-info">
        <div class="item-name">${escapeHTML(recipe.name)}</div>
        <div class="item-description">${escapeHTML(ingredients)}</div>
      </div>
      <button type="button" data-craft="${recipe.id}"
        ${canCraft(recipe) ? '' : 'disabled'}>Создать</button>
    `;

    container.appendChild(row);
  });

  container.querySelectorAll('[data-craft]').forEach((button) => {
    button.addEventListener('click', () => {
      const recipe = craftingRecipes.find((r) => r.id === button.dataset.craft);
      if (recipe) craft(recipe);
    });
  });
}

/* ---------------- Магазин ---------------- */

const shopStock = [
  { id: 'food', price: 14 },
  { id: 'water', price: 10 },
  { id: 'filteredWater', price: 16 },
  { id: 'medkit', price: 25 },
  { id: 'axe', price: 45 },
  { id: 'pickaxe', price: 50 },
  { id: 'knife', price: 30 },
  { id: 'pistol', price: 180 },
  { id: 'ammo', price: 12 },
  { id: 'filter', price: 35 }
];

function buyItem(id, price) {
  if (state.money < price) {
    notify('Недостаточно денег');
    return;
  }

  if (inventory.length >= state.inventoryCapacity && !inventory.some((item) => item.id === id)) {
    notify('Инвентарь заполнен');
    return;
  }

  state.money -= price;
  addItem(id, 1, false);
  notify(`Куплено: ${itemInfo(id).name}`);
  renderShop();
  updateUI();
}

function sellItem(id) {
  if (!hasItem(id)) {
    notify('Нет предмета для продажи');
    return;
  }

  const info = itemInfo(id);
  const amount = Math.max(1, Math.floor(info.price * 0.65));

  removeItem(id, 1);
  state.money += amount;

  notify(`Продано: ${info.name} за ${amount} монет`);
  renderShop();
  updateUI();
}

function renderShop() {
  const shop = $('shopItems');
  const sell = $('sellItems');
  const money = $('shopMoney');

  if (money) money.textContent = `Деньги: ${state.money} монет`;
  if (shop) shop.innerHTML = '';
  if (sell) sell.innerHTML = '';

  shopStock.forEach(({ id, price }) => {
    const info = itemInfo(id);
    const row = document.createElement('div');
    row.className = 'item-row';

    row.innerHTML = `
      <div class="item-icon">${info.icon}</div>
      <div class="item-info">
        <div class="item-name">${escapeHTML(info.name)}</div>
        <div class="item-description">Цена: ${price} монет</div>
      </div>
      <button type="button" data-buy="${id}" data-price="${price}"
        ${state.money < price ? 'disabled' : ''}>Купить</button>
    `;

    shop?.appendChild(row);
  });

  for (const item of inventory) {
    const info = itemInfo(item.id);
    const row = document.createElement('div');
    row.className = 'item-row';

    const price = Math.max(1, Math.floor(info.price * 0.65));

    row.innerHTML = `
      <div class="item-icon">${info.icon}</div>
      <div class="item-info">
        <div class="item-name">${escapeHTML(info.name)} ×${item.amount}</div>
        <div class="item-description">Продажа: ${price} монет за штуку</div>
      </div>
      <button type="button" data-sell="${item.id}">Продать</button>
    `;

    sell?.appendChild(row);
  }

  shop?.querySelectorAll('[data-buy]').forEach((button) => {
    button.addEventListener('click', () => {
      buyItem(button.dataset.buy, Number(button.dataset.price));
    });
  });

  sell?.querySelectorAll('[data-sell]').forEach((button) => {
    button.addEventListener('click', () => sellItem(button.dataset.sell));
  });
}

/* ---------------- Переезд в другой город ---------------- */

function renderCities() {
  const container = $('cityPanel');
  if (!container) return;

  let list = container.querySelector('#cityList');

  if (!list) {
    list = document.createElement('div');
    list.id = 'cityList';

    const button = $('travelButton');
    if (button) button.insertAdjacentElement('beforebegin', list);
    else container.appendChild(list);
  }

  list.innerHTML = '';

  CITIES.forEach((city, index) => {
    const row = document.createElement('div');
    row.className = 'item-row';

    row.innerHTML = `
      <div class="item-icon">🏙️</div>
      <div class="item-info">
        <div class="item-name">${escapeHTML(city.name)}</div>
        <div class="item-description">${
          index === currentCity ? 'Вы здесь' : 'Стоимость переезда: 25 монет'
        }</div>
      </div>
      <button type="button" data-city="${index}"
        ${index === currentCity || state.money < 25 ? 'disabled' : ''}>
        ${index === currentCity ? 'Здесь' : 'Переехать'}
      </button>
    `;

    list.appendChild(row);
  });

  list.querySelectorAll('[data-city]').forEach((button) => {
    button.addEventListener('click', () => {
      const index = Number(button.dataset.city);
      travelToCity(index);
    });
  });
}

function travelToCity(index) {
  if (index === currentCity || !CITIES[index]) return;

  if (state.money < 25) {
    notify('Нужно 25 монет на дорогу');
    return;
  }

  state.money -= 25;
  currentCity = index;

  // Перемещаем игрока в новую область мира.
  const city = CITIES[index];
  player.position.set(city.x, 1.7, city.z + 12);

  if (!state.visitedCities.includes(index)) {
    state.visitedCities.push(index);
  }

  closePanel('cityPanel');
  notify(`Вы прибыли: ${city.name}`);
  updateUI();
  saveGame(false);
}

/* ---------------- Панели ---------------- */

function openPanel(id) {
  const panel = $(id);
  if (!panel) return;

  document.querySelectorAll('.game-panel').forEach((element) => {
    element.classList.add('hidden');
  });

  panel.classList.remove('hidden');

  if (id === 'inventoryPanel') renderInventory();
  if (id === 'craftingPanel') renderCrafting();
  if (id === 'shopPanel') renderShop();
  if (id === 'cityPanel') renderCities();

  paused = true;
}

function closePanel(id) {
  const panel = $(id);
  if (panel) panel.classList.add('hidden');

  const anyOpen = [...document.querySelectorAll('.game-panel')]
    .some((element) => !element.classList.contains('hidden'));

  if (!anyOpen && !$('pausePanel')?.classList.contains('hidden')) {
    paused = true;
  } else if (!anyOpen) {
    paused = false;
  }
}

function closeAllPanels() {
  document.querySelectorAll('.game-panel').forEach((panel) => {
    panel.classList.add('hidden');
  });

  paused = false;
}

function setPaused(value) {
  paused = value;

  const panel = $('pausePanel');
  if (panel) panel.classList.toggle('hidden', !value);

  if (value && document.pointerLockElement) {
    document.exitPointerLock();
  }
}

/* ---------------- Выживание ---------------- */

function updateSurvival(delta) {
  survivalSeconds += delta;

  if (survivalSeconds - lastHungerTick >= 8) {
    lastHungerTick = survivalSeconds;
    state.hunger = Math.max(0, state.hunger - 1.2);
  }

  if (survivalSeconds - lastThirstTick >= 6) {
    lastThirstTick = survivalSeconds;
    state.thirst = Math.max(0, state.thirst - 1.5);
  }

  if (survivalSeconds - lastEnergyTick >= 3) {
    lastEnergyTick = survivalSeconds;

    if (joystick.x === 0 && joystick.y === 0) {
      state.energy = Math.min(100, state.energy + 1.2);
    }
  }

  if (state.hunger <= 0 || state.thirst <= 0) {
    state.health = Math.max(0, state.health - delta * 1.2);
  }

  if (state.health <= 0) {
    endGame('Вы не пережили 30 дней', 'Здоровье закончилось. Попробуйте снова.');
  }
}

function updateDayNight(delta) {
  daySeconds += delta * (DAY_LENGTH_SECONDS / 24);

  if (daySeconds >= 24 * 60) {
    daySeconds = 0;
    day += 1;
    state.daysSurvived = Math.max(state.daysSurvived, day - 1);

    if (day > MAX_DAYS) {
      endGame('Выживание завершено!', 'Вы продержались 30 дней.');
      return;
    }

    notify(`Наступил день ${day} из ${MAX_DAYS}`);
    saveGame(false);
  }

  const hours = Math.floor(daySeconds / 60);
  const minutes = Math.floor(daySeconds % 60);

  const timeElement = $('gameTime');
  const dayElement = $('dayNumber');

  if (timeElement) {
    timeElement.textContent =
      `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  }

  if (dayElement) {
    dayElement.textContent = `День ${day}/${MAX_DAYS}`;
  }

  const night = hours < 6 || hours >= 20;
  scene.background.set(night ? 0x101a32 : 0x8bb5cf);
  scene.fog.color.set(night ? 0x101a32 : 0x8bb5cf);

  ambientLight.intensity = night ? 0.55 : 1.8;
  sun.intensity = night ? 0.2 : 2.5;
}

/* ---------------- Движение и столкновения ---------------- */

function collidesAt(x, z) {
  const radius = 0.42;

  for (const object of worldObjects) {
    const insideX = Math.abs(x - object.x) < object.halfX + radius;
    const insideZ = Math.abs(z - object.z) < object.halfZ + radius;

    if (insideX && insideZ) return true;
  }

  // Не позволяем свободно ходить по глубокой части реки.
  if (x > 35 && x < 61 && z > -110 && z < 170) {
    return true;
  }

  return false;
}

function updateMovement(delta) {
  if (!player || paused || gameOver) return;

  let forward = 0;
  let side = 0;

  if (keys.KeyW || keys.ArrowUp) forward += 1;
  if (keys.KeyS || keys.ArrowDown) forward -= 1;
  if (keys.KeyA || keys.ArrowLeft) side -= 1;
  if (keys.KeyD || keys.ArrowRight) side += 1;

  forward += -joystick.y;
  side += joystick.x;

  const length = Math.hypot(forward, side);
  if (length > 1) {
    forward /= length;
    side /= length;
  }

  const moving = Math.abs(forward) + Math.abs(side) > 0.05;
  const speed = (keys.ShiftLeft ? 7 : 4.3) * (state.energy < 10 ? 0.7 : 1);

  if (moving) {
    const sin = Math.sin(yaw);
    const cos = Math.cos(yaw);

    const dx = (side * cos - forward * sin) * speed * delta;
    const dz = (-forward * cos - side * sin) * speed * delta;

    const nextX = player.position.x + dx;
    const nextZ = player.position.z + dz;

    if (!collidesAt(nextX, player.position.z)) {
      player.position.x = nextX;
    }

    if (!collidesAt(player.position.x, nextZ)) {
      player.position.z = nextZ;
    }

    if (keys.ShiftLeft && state.energy > 0) {
      state.energy = Math.max(0, state.energy - delta * 5);
    }
  }

  if (keys.Space && isGrounded) {
    verticalVelocity = 6.5;
    isGrounded = false;
    keys.Space = false;
  }

  if (!isGrounded) {
    verticalVelocity -= 17 * delta;
    player.position.y += verticalVelocity * delta;

    if (player.position.y <= 1.7) {
      player.position.y = 1.7;
      verticalVelocity = 0;
      isGrounded = true;
    }
  }

  camera.rotation.order = 'YXZ';
  camera.rotation.y = 0;
  camera.rotation.x = pitch;
  player.rotation.y = yaw;

  // Не даём игроку проваливаться ниже земли.
  player.position.y = Math.max(0.6, player.position.y);
}

/* ---------------- Управление камерой ---------------- */

function setupControls() {
  window.addEventListener('keydown', (event) => {
    keys[event.code] = true;

    if (event.code.startsWith('Digit')) {
      const number = Number(event.code.slice(5));
      if (number >= 1 && number <= 8) selectSlot(number - 1);
    }

    if (event.code === 'KeyE') interact();
    if (event.code === 'KeyF') useSelectedItem();
    if (event.code === 'KeyQ') dropSelectedItem();

    if (event.code === 'Escape') {
      if (paused) {
        closeAllPanels();
        setPaused(false);
      } else {
        setPaused(true);
      }
    }
  });

  window.addEventListener('keyup', (event) => {
    keys[event.code] = false;
  });

  canvas.addEventListener('click', () => {
    if (!paused && running && !isTouchDevice()) {
      canvas.requestPointerLock?.();
    }
  });

  document.addEventListener('pointerlockchange', () => {
    pointerLocked = document.pointerLockElement === canvas;
  });

  document.addEventListener('mousemove', (event) => {
    if (!pointerLocked || paused) return;

    yaw -= event.movementX * 0.002;
    pitch -= event.movementY * 0.002;
    pitch = clamp(pitch, -1.45, 1.45);
  });

  setupJoystick();
  setupTouchLook();
}

function isTouchDevice() {
  return (
    window.matchMedia('(pointer: coarse)').matches ||
    'ontouchstart' in window
  );
}

function setupJoystick() {
  const pad = $('movementJoystick');
  if (!pad) return;

  let activeId = null;

  const update = (event) => {
    const rect = pad.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const maxRadius = rect.width * 0.34;

    const dx = event.clientX - centerX;
    const dy = event.clientY - centerY;
    const length = Math.hypot(dx, dy);
    const factor = length > maxRadius ? maxRadius / length : 1;

    joystick.x = clamp((dx * factor) / maxRadius, -1, 1);
    joystick.y = clamp((dy * factor) / maxRadius, -1, 1);
    joystick.active = true;

    const knob = pad.querySelector('.joystick-knob');
    if (knob) {
      knob.style.left = `calc(50% + ${joystick.x * maxRadius}px)`;
      knob.style.top = `calc(50% + ${joystick.y * maxRadius}px)`;
    }
  };

  pad.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    activeId = event.pointerId;
    pad.setPointerCapture?.(activeId);
    update(event);
  });

  pad.addEventListener('pointermove', (event) => {
    if (event.pointerId !== activeId) return;
    event.preventDefault();
    update(event);
  });

  const release = (event) => {
    if (event.pointerId !== activeId) return;
    activeId = null;
    joystick.x = 0;
    joystick.y = 0;
    joystick.active = false;

    const knob = pad.querySelector('.joystick-knob');
    if (knob) {
      knob.style.left = '50%';
      knob.style.top = '50%';
    }
  };

  pad.addEventListener('pointerup', release);
  pad.addEventListener('pointercancel', release);
}

function setupTouchLook() {
  const screen = $('gameScreen');
  if (!screen) return;

  screen.addEventListener('touchstart', (event) => {
    if (!isTouchDevice() || paused) return;

    for (const touch of event.changedTouches) {
      const target = touch.target;

      if (
        target.closest('button') ||
        target.closest('input') ||
        target.closest('#movementJoystick') ||
        target.closest('#hotbar') ||
        target.closest('#chatPanel') ||
        target.closest('.game-panel')
      ) {
        continue;
      }

      if (touch.clientX > window.innerWidth * 0.42 && lookTouchId === null) {
        lookTouchId = touch.identifier;
        lookTouchX = touch.clientX;
        lookTouchY = touch.clientY;
      }
    }
  }, { passive: true });

  screen.addEventListener('touchmove', (event) => {
    if (lookTouchId === null || paused) return;

    for (const touch of event.changedTouches) {
      if (touch.identifier !== lookTouchId) continue;

      const dx = touch.clientX - lookTouchX;
      const dy = touch.clientY - lookTouchY;

      yaw -= dx * 0.006;
      pitch = clamp(pitch - dy * 0.005, -1.35, 1.35);

      lookTouchX = touch.clientX;
      lookTouchY = touch.clientY;
    }
  }, { passive: true });

  const endLook = (event) => {
    for (const touch of event.changedTouches) {
      if (touch.identifier === lookTouchId) {
        lookTouchId = null;
      }
    }
  };

  screen.addEventListener('touchend', endLook, { passive: true });
  screen.addEventListener('touchcancel', endLook, { passive: true });
}

/* ---------------- UI ---------------- */

function updateUI() {
  const bars = [
    ['healthBar', 'healthValue', state.health],
    ['hungerBar', 'hungerValue', state.hunger],
    ['thirstBar', 'thirstValue', state.thirst],
    ['energyBar', 'energyValue', state.energy]
  ];

  for (const [barId, valueId, value] of bars) {
    const bar = $(barId);
    const valueElement = $(valueId);

    if (bar) bar.style.width = `${clamp(value, 0, 100)}%`;
    if (valueElement) valueElement.textContent = Math.round(value);
  }

  if ($('moneyValue')) {
    $('moneyValue').textContent = `💰 ${Math.floor(state.money)}`;
  }

  if ($('locationName')) {
    $('locationName').textContent = CITIES[currentCity].name;
  }

  updateHotbar();
}

function notify(message) {
  const element = $('notification');
  if (!element) return;

  element.textContent = message;
  element.classList.remove('hidden');

  if (notificationTimer) clearTimeout(notificationTimer);

  notificationTimer = setTimeout(() => {
    element.classList.add('hidden');
  }, 2600);
}

function endGame(title, description) {
  if (gameOver) return;

  gameOver = true;
  running = false;
  paused = true;

  if ($('gameOverTitle')) $('gameOverTitle').textContent = title;
  if ($('gameOverDescription')) {
    $('gameOverDescription').textContent = description;
  }

  $('gameOverScreen')?.classList.remove('hidden');
  saveGame(false);
}

/* ---------------- Чат и мультиплеер ---------------- */

let socket = null;

function setupChat() {
  const form = $('chatForm');
  const input = $('chatInput');
  const messages = $('chatMessages');

  if (!form || !input || !messages) return;

  if (typeof window.io === 'function') {
    let handlersAttached = false;

    const connectToMultiplayer = () => {
      const mp = window.lockedHomeMultiplayer;

      if (!mp || !mp.socket) {
        setTimeout(connectToMultiplayer, 300);
        return;
      }

      socket = mp.socket;

      if (handlersAttached) return;
      handlersAttached = true;

      socket.on('connect', () => {
        addChatMessage('Система', 'Подключение к серверу установлено');
      });

      socket.on('disconnect', () => {
        addChatMessage('Система', 'Соединение с сервером потеряно');
      });

      socket.on('chat:message', (data) => {
        if (!data) return;

        if (typeof data === 'string') {
          addChatMessage('Игрок', data);
        } else {
          addChatMessage(
            data.name || data.playerName || 'Игрок',
            data.message || data.text || ''
          );
        }
      });

      if (socket.connected) {
        addChatMessage('Система', 'Подключение к серверу установлено');
      }
    };

    connectToMultiplayer();
  } else {
    addChatMessage('Система', 'Чат работает локально без подключения к серверу');
}

  form.addEventListener('submit', (event) => {
    event.preventDefault();

    const message = input.value.trim().slice(0, 180);
    if (!message) return;

    if (socket?.connected) {
      socket.emit('chat:send', {
        name: state.playerName,
        message
      });
    } else {
      addChatMessage(state.playerName, message);
    }

    input.value = '';
  });
}

function addChatMessage(name, message) {
  const container = $('chatMessages');
  if (!container) return;

  const row = document.createElement('div');
  row.className = 'chat-message';

  const author = document.createElement('span');
  author.className = 'chat-name';
  author.textContent = `${name}: `;

  const text = document.createElement('span');
  text.textContent = message;

  row.append(author, text);
  container.appendChild(row);

  while (container.children.length > 50) {
    container.firstElementChild.remove();
  }

  container.scrollTop = container.scrollHeight;
}

function sendPlayerPosition() {
const mp = window.lockedHomeMultiplayer;
const activeSocket = mp?.socket || socket;

if (!activeSocket?.connected || !player) return;

activeSocket.emit('player:move', {
x: player.position.x,
y: player.position.y,
z: player.position.z,
rotation: yaw,
name: state.playerName
});
}

/* ---------------- Игровой цикл ---------------- */

let networkTimer = 0;

function animate() {
  requestAnimationFrame(animate);

  if (!renderer || !scene || !camera) return;

  const delta = Math.min(clock.getDelta(), 0.05);

  if (running && !paused && !gameOver) {
    updateMovement(delta);
    updateSurvival(delta);
    updateDayNight(delta);
    updateTargetUI();

    for (const drop of droppedItems) {
      if (drop.mesh?.parent) {
        drop.mesh.rotation.y += delta * 0.4;
      }
    }

    networkTimer += delta;
    if (networkTimer >= 0.1) {
      networkTimer = 0;
      sendPlayerPosition();
    }

    if (Date.now() - lastSaveTime > 30000) {
      lastSaveTime = Date.now();
      saveGame(false);
    }
  }

  renderer.render(scene, camera);
}

function onResize() {
  if (!camera || !renderer) return;

  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
}
function updateOrientationScreen() {
  const orientationScreen = document.getElementById('orientationScreen');
  if (!orientationScreen) return;

  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  const isPortrait = window.innerHeight > window.innerWidth;

  orientationScreen.classList.toggle('hidden', !(isMobile && isPortrait));
}

function setupOrientation() {
  const button = document.getElementById('orientationContinueButton');

  if (button) {
    button.addEventListener('click', () => {
      if (screen.orientation && screen.orientation.lock) {
        screen.orientation.lock('landscape').catch(() => {});
      }

      updateOrientationScreen();
    });
  }

  window.addEventListener('resize', updateOrientationScreen);
  window.addEventListener('orientationchange', updateOrientationScreen);

  updateOrientationScreen();
     }
/* ---------------- Кнопки ---------------- */

function setupButtons() {
  $('startGameButton')?.addEventListener('click', startNewGame);
  $('continueGameButton')?.addEventListener('click', continueGame);

  $('pauseButton')?.addEventListener('click', () => setPaused(true));
  $('resumeButton')?.addEventListener('click', () => setPaused(false));
  $('pauseSaveButton')?.addEventListener('click', () => saveGame(true));

  $('saveGameButton')?.addEventListener('click', () => saveGame(true));

  $('returnMenuButton')?.addEventListener('click', () => {
    saveGame(false);
    setPaused(false);
    gameScreen.classList.add('hidden');
    menu.classList.remove('hidden');
    running = false;
  });

  $('openInventoryButton')?.addEventListener('click', () => {
    openPanel('inventoryPanel');
  });

  $('openCraftingButton')?.addEventListener('click', () => {
    openPanel('craftingPanel');
  });

  $('openShopButton')?.addEventListener('click', () => {
    openPanel('shopPanel');
  });

  $('openCityButton')?.addEventListener('click', () => {
    openPanel('cityPanel');
  });

  $('interactButton')?.addEventListener('click', interact);
  $('useItemButton')?.addEventListener('click', useSelectedItem);
  $('dropItemButton')?.addEventListener('click', dropSelectedItem);

  $('mobileInteractButton')?.addEventListener('click', interact);
  $('mobileJumpButton')?.addEventListener('click', () => {
    if (isGrounded) {
      verticalVelocity = 6.5;
      isGrounded = false;
    }
  });
  $('mobileDropButton')?.addEventListener('click', dropSelectedItem);

  $('restartButton')?.addEventListener('click', () => {
    localStorage.removeItem(SAVE_KEY);
    window.location.reload();
  });

  document.querySelectorAll('[data-close-panel]').forEach((button) => {
    button.addEventListener('click', () => {
      const panel = button.closest('.game-panel');
      if (panel) closePanel(panel.id);
    });
  });

  document.querySelectorAll('.inventory-slot').forEach((slot, index) => {
    slot.addEventListener('click', () => selectSlot(index));
  });

  document.addEventListener('keydown', (event) => {
    if (event.code === 'KeyE' && !paused) interact();
  });
}

/* ---------------- Запуск ---------------- */

function startNewGame() {
  state.health = 100;
  state.hunger = 100;
  state.thirst = 100;
  state.energy = 100;
  state.money = 50;
  state.daysSurvived = 0;
  state.visitedCities = [0];

  day = 1;
  daySeconds = 8 * 60;
  currentCity = 0;
  survivalSeconds = 0;

  inventory.length = 0;
  addItem('food', 2, false);
  addItem('water', 2, false);
  addItem('berries', 3, false);

  if (player) player.position.set(0, 1.7, 12);

  gameOver = false;
  paused = false;
  running = true;

  $('gameOverScreen')?.classList.add('hidden');
  menu.classList.add('hidden');
  gameScreen.classList.remove('hidden');

  updateUI();
  notify('Выживи 30 дней. Собирай ресурсы и береги припасы!');
}

function continueGame() {
  loadGame();

  if (player && hasSavedPlayerPosition) {
    player.position.set(
      savedPlayerPosition.x,
      savedPlayerPosition.y,
      savedPlayerPosition.z
    );
  }

  gameOver = false;
  paused = false;
  running = true;

  $('gameOverScreen')?.classList.add('hidden');
  menu.classList.add('hidden');
  gameScreen.classList.remove('hidden');

  updateUI();
  notify(`Продолжаем выживание: день ${day}`);
}

function boot() {
  const saved = loadGame();

  const nameInput = $('playerName');
  if (nameInput) {
    nameInput.value = state.playerName;

    nameInput.addEventListener('change', () => {
      const name = nameInput.value.trim().slice(0, 20);
      state.playerName = name || 'Выживший';
    });
  }

  initThree();
  setupControls();
  setupButtons();
  setupChat();
   setupOrientation();
   
  if ($('continueGameButton')) {
    $('continueGameButton').disabled = !saved;
  }

  updateUI();
  animate();
}

boot();
