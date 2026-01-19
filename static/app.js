import * as THREE from "./vendor/three.module.js";
import { OrbitControls } from "./vendor/OrbitControls.js";

const container = document.getElementById("scene");
const tooltip = document.getElementById("tooltip");
const infoPanel = document.getElementById("info-panel");
const infoName = infoPanel.querySelector(".info-name");
const infoDesc = infoPanel.querySelector(".info-desc");
const loading = document.getElementById("loading");
const scrollButtons = document.querySelectorAll("[data-scroll]");
const videoInput = document.getElementById("video-upload");
const videoElement = document.getElementById("promo-video");
const videoOverlay = document.getElementById("video-overlay");
const videoShell = document.getElementById("video-shell");
const videoTitle = document.getElementById("video-title");
const videoItems = document.querySelectorAll(".video-item");
const chatForm = document.getElementById("chat-form");
const chatInput = document.getElementById("chat-input");
const chatLog = document.getElementById("chat-log");
const chatStatus = document.getElementById("chat-status");
const avatar = document.getElementById("avatar");
const photoInput = document.getElementById("photo-upload");
const photoTheme = document.getElementById("photo-theme");
const photoButton = document.getElementById("photo-generate");
const photoCanvas = document.getElementById("photo-canvas");
const photoPlaceholder = document.getElementById("photo-placeholder");

const presentationState = {
  messages: [],
  photoImage: null,
};
let speakingTimeout = null;

const quality = getQualitySettings();

const scene = new THREE.Scene();
scene.background = new THREE.Color("#f1e6d3");
scene.fog = new THREE.Fog("#e9dcc6", 50, 180);

const camera = new THREE.PerspectiveCamera(
  45,
  container.clientWidth / container.clientHeight,
  0.1,
  260
);
camera.position.set(48, 50, 70);

const renderer = new THREE.WebGLRenderer({
  antialias: quality.antialias,
  powerPreference: quality.powerPreference,
});
renderer.setPixelRatio(quality.pixelRatio);
renderer.setSize(container.clientWidth, container.clientHeight);
renderer.shadowMap.enabled = quality.shadows;
renderer.shadowMap.type = quality.shadowMapType;
renderer.shadowMap.autoUpdate = quality.shadowAutoUpdate;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
container.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.07;
controls.enablePan = true;
controls.minDistance = 28;
controls.maxDistance = 150;
controls.minPolarAngle = Math.PI / 6;
controls.maxPolarAngle = Math.PI / 2.1;

const palette = {
  earth: "#d9c4a1",
  brick: "#b65835",
  wood: "#8a4f3a",
  roof: "#6e3b2f",
  jade: "#3b6f67",
  gold: "#d9a44f",
  river: "#2b6f87",
  stone: "#cbb093",
  stage: "#a65a3b",
};

const world = new THREE.Group();
scene.add(world);

world.add(createLights());
world.add(createGround());
world.add(createStreet());
const river = createRiver();
world.add(river);
world.add(createBridge());
world.add(createBuildings());
world.add(createTrees());

const lanterns = createLanterns();
world.add(lanterns.group);

const markers = [];
const markerMap = new Map();

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let hoveredMarker = null;
let selectedMarker = null;
let focusTarget = null;
let focusPosition = null;
let lastFrameTime = 0;
let isSceneVisible = true;
let isPageVisible = true;
let videoObjectUrl = null;

const fallbackLandmarks = [
  {
    id: "archway",
    name: "古文化街牌坊",
    type: "gate",
    position: { x: 0.0, z: -46.0 },
    height: 6.0,
    color: "#d28c3c",
    description: "津门故里的迎宾标识与入口意象。",
  },
  {
    id: "folk-crafts",
    name: "民俗工艺馆",
    type: "craft",
    position: { x: -18.0, z: -18.0 },
    height: 5.0,
    color: "#b55a3a",
    description: "泥人张、风筝、剪纸等传统手作展示。",
  },
  {
    id: "tianhou",
    name: "天后宫",
    type: "temple",
    position: { x: -18.0, z: 8.0 },
    height: 7.0,
    color: "#c97c3b",
    description: "供奉妈祖的古庙建筑与香火文化。",
  },
  {
    id: "snack",
    name: "津味小吃街",
    type: "market",
    position: { x: 18.0, z: -2.0 },
    height: 4.5,
    color: "#d28c3c",
    description: "耳朵眼炸糕、煎饼果子等津味汇聚。",
  },
  {
    id: "opera",
    name: "曲艺戏台",
    type: "stage",
    position: { x: 16.0, z: 22.0 },
    height: 5.5,
    color: "#a05238",
    description: "相声、评剧等传统曲艺演出区域。",
  },
  {
    id: "gulou",
    name: "鼓楼",
    type: "tower",
    position: { x: 0.0, z: 44.0 },
    height: 9.0,
    color: "#9c4a35",
    description: "北端地标，眺望古街与海河风光。",
  },
];

initPresentation();
init().catch((error) => {
  console.error(error);
  loading.textContent = "场景加载失败。";
});

function createLights() {
  const group = new THREE.Group();
  const hemi = new THREE.HemisphereLight(0xfdf5e6, 0x4c3a2f, 0.9);
  const dir = new THREE.DirectionalLight(0xfff0d0, 1.05);
  dir.position.set(40, 60, 20);
  dir.castShadow = quality.shadows;
  if (quality.shadows) {
    dir.shadow.mapSize.set(quality.shadowMapSize, quality.shadowMapSize);
    dir.shadow.camera.near = 10;
    dir.shadow.camera.far = 180;
    dir.shadow.camera.left = -80;
    dir.shadow.camera.right = 80;
    dir.shadow.camera.top = 80;
    dir.shadow.camera.bottom = -80;
  }

  const warm = new THREE.PointLight(0xffc677, 0.35, 100, 2);
  warm.position.set(-12, 14, -6);

  group.add(hemi, dir, warm);
  return group;
}

function createGround() {
  const geometry = new THREE.PlaneGeometry(
    160,
    160,
    quality.groundSegments,
    quality.groundSegments
  );
  const positions = geometry.attributes.position;
  const colors = [];
  const color = new THREE.Color();

  for (let i = 0; i < positions.count; i += 1) {
    const x = positions.getX(i);
    const y = positions.getY(i);
    const height =
      Math.sin(x * 0.08) * Math.cos(y * 0.07) * 1.2 +
      Math.sin((x + y) * 0.05) * 0.5;
    positions.setZ(i, height);

    const shade = THREE.MathUtils.mapLinear(height, -2, 2, 0.88, 1.05);
    color.setHSL(0.1, 0.28, 0.66 * shade);
    colors.push(color.r, color.g, color.b);
  }

  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.rotateX(-Math.PI / 2);
  geometry.computeVertexNormals();

  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.95,
    metalness: 0.02,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = true;
  mesh.position.y = -1;
  return mesh;
}

function createStreet() {
  const shape = new THREE.Shape();
  const points = [
    new THREE.Vector2(-7, -50),
    new THREE.Vector2(7, -50),
    new THREE.Vector2(9, -28),
    new THREE.Vector2(7.5, -10),
    new THREE.Vector2(6, 5),
    new THREE.Vector2(7, 26),
    new THREE.Vector2(9, 50),
    new THREE.Vector2(-9, 50),
    new THREE.Vector2(-7, 24),
    new THREE.Vector2(-6, -6),
    new THREE.Vector2(-7.5, -26),
  ];

  shape.moveTo(points[0].x, points[0].y);
  points.slice(1).forEach((point) => shape.lineTo(point.x, point.y));
  shape.closePath();

  const geometry = new THREE.ShapeGeometry(shape, quality.streetSegments);
  geometry.rotateX(-Math.PI / 2);

  const pavingTexture = createPavingTexture();
  const material = new THREE.MeshStandardMaterial({
    map: pavingTexture,
    roughness: 0.8,
    metalness: 0.05,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = true;
  mesh.position.y = 0.05;

  const edgeMaterial = new THREE.LineBasicMaterial({
    color: "#6b3b2d",
    transparent: true,
    opacity: 0.5,
  });
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geometry), edgeMaterial);
  edges.position.y = 0.06;

  const group = new THREE.Group();
  group.add(mesh, edges);
  return group;
}

function createRiver() {
  const left = [
    new THREE.Vector2(18, -60),
    new THREE.Vector2(20, -32),
    new THREE.Vector2(24, 0),
    new THREE.Vector2(22, 28),
    new THREE.Vector2(18, 60),
  ];
  const right = [
    new THREE.Vector2(36, 60),
    new THREE.Vector2(40, 30),
    new THREE.Vector2(41, 0),
    new THREE.Vector2(38, -30),
    new THREE.Vector2(32, -60),
  ];

  const shape = new THREE.Shape();
  shape.moveTo(left[0].x, left[0].y);
  left.slice(1).forEach((point) => shape.lineTo(point.x, point.y));
  right
    .slice()
    .reverse()
    .forEach((point) => shape.lineTo(point.x, point.y));
  shape.closePath();

  const geometry = new THREE.ShapeGeometry(shape, quality.riverSegments);
  geometry.rotateX(-Math.PI / 2);

  const waterTexture = createWaterTexture();
  const material = new THREE.MeshPhysicalMaterial({
    color: palette.river,
    roughness: 0.2,
    metalness: 0.1,
    clearcoat: 0.8,
    transparent: true,
    opacity: 0.9,
    map: waterTexture,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = true;
  mesh.position.y = -0.25;
  mesh.userData.isWater = true;
  return mesh;
}

function createBridge() {
  const group = new THREE.Group();
  const deckGeometry = new THREE.BoxGeometry(14, 1, 8);
  const deckMaterial = new THREE.MeshStandardMaterial({
    color: palette.stone,
    roughness: 0.85,
  });
  const deck = new THREE.Mesh(deckGeometry, deckMaterial);
  deck.position.set(28, 1.2, -6);
  deck.castShadow = true;
  deck.receiveShadow = true;

  const pillarGeometry = new THREE.BoxGeometry(2, 4, 6);
  const pillarMaterial = new THREE.MeshStandardMaterial({
    color: palette.wood,
    roughness: 0.7,
  });
  const leftPillar = new THREE.Mesh(pillarGeometry, pillarMaterial);
  leftPillar.position.set(23.5, 1, -6);
  const rightPillar = new THREE.Mesh(pillarGeometry, pillarMaterial);
  rightPillar.position.set(32.5, 1, -6);

  [leftPillar, rightPillar].forEach((pillar) => {
    pillar.castShadow = true;
    pillar.receiveShadow = true;
  });

  group.add(deck, leftPillar, rightPillar);
  return group;
}

function createBuildings() {
  const group = new THREE.Group();
  const colors = ["#caa676", "#b26c4b", "#8c5138", "#d6b58b"];
  const roofMaterial = new THREE.MeshStandardMaterial({
    color: palette.roof,
    roughness: 0.65,
  });

  let index = 0;
  for (let z = -42; z <= 42; z += 12) {
    addCluster(-18, z, -1);
    addCluster(18, z, 1);
    index += 1;
  }

  function addCluster(baseX, z, side) {
    const seed = Math.abs(z) * 0.12 + side * 1.7;
    const width = 6 + seededRandom(seed) * 3;
    const depth = 8 + seededRandom(seed + 1.4) * 4;
    const height = 4 + seededRandom(seed + 2.7) * 5;
    const colorIndex = Math.floor(seededRandom(seed + 4.2) * colors.length);

    const main = createBuilding(
      baseX + side * (width * 0.25),
      z,
      width,
      depth,
      height,
      colors[colorIndex]
    );
    group.add(main);

    const annex = createBuilding(
      baseX + side * (width * 0.7),
      z + 4,
      width * 0.6,
      depth * 0.6,
      height * 0.7,
      colors[(colorIndex + 1) % colors.length]
    );
    group.add(annex);

    const roof = createRoof(width * 0.9, depth * 0.8, 1.4, roofMaterial);
    roof.position.set(baseX + side * (width * 0.25), height + 0.7, z);
    group.add(roof);
  }

  return group;
}

function createBuilding(x, z, width, depth, height, color) {
  const geometry = new THREE.BoxGeometry(width, height, depth);
  const material = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.75,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, height / 2, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function createRoof(width, depth, height, material) {
  const geometry = new THREE.CylinderGeometry(0.6, 1, height, 4, 1);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.scale.set(width / 2, 1, depth / 2);
  mesh.rotation.y = Math.PI / 4;
  mesh.castShadow = true;
  return mesh;
}

function createTrees() {
  const group = new THREE.Group();
  const trunkMaterial = new THREE.MeshStandardMaterial({
    color: "#6a4a35",
    roughness: 0.8,
  });
  const crownMaterial = new THREE.MeshStandardMaterial({
    color: "#3e6b4e",
    roughness: 0.7,
  });

  for (let z = -55; z <= 55; z += quality.treeStep) {
    addTree(-36, z);
    addTree(42, z);
  }

  function addTree(x, z) {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.5, 3, 8), trunkMaterial);
    trunk.position.set(x, 1.5, z);
    const crown = new THREE.Mesh(new THREE.ConeGeometry(2.4, 5, 10), crownMaterial);
    crown.position.set(x, 5.5, z);
    [trunk, crown].forEach((mesh) => {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    });
    group.add(trunk, crown);
  }

  return group;
}

function createLanterns() {
  const group = new THREE.Group();
  const bulbs = [];
  const geometry = new THREE.SphereGeometry(0.4, 16, 16);
  const material = new THREE.MeshStandardMaterial({
    color: palette.gold,
    emissive: new THREE.Color(palette.gold),
    emissiveIntensity: 0.6,
    roughness: 0.4,
  });

  for (let z = -40; z <= 40; z += quality.lanternStep) {
    [-8, 8].forEach((x) => {
      const bulb = new THREE.Mesh(geometry, material.clone());
      bulb.position.set(x, 2.8, z);
      bulb.castShadow = true;
      let light = null;
      if (quality.lanternLights) {
        light = new THREE.PointLight(0xffd27a, 0.35, 18, 2);
        light.position.set(x, 2.8, z);
        group.add(bulb, light);
      } else {
        group.add(bulb);
      }
      bulbs.push({ mesh: bulb, light, seed: x + z });
    });
  }

  return { group, bulbs };
}

async function init() {
  await loadLandmarks();

  renderer.domElement.style.touchAction = "none";
  renderer.domElement.addEventListener("pointermove", onPointerMove);
  renderer.domElement.addEventListener("pointerleave", onPointerLeave);
  renderer.domElement.addEventListener("click", onClick);
  window.addEventListener("resize", onResize);
  setupVisibilityTracking();
  setupVideoPlayer();

  loading.classList.add("hidden");
  if (quality.shadows && !quality.shadowAutoUpdate) {
    renderer.shadowMap.needsUpdate = true;
  }
  animate();
}

async function loadLandmarks() {
  let landmarks = fallbackLandmarks;
  try {
    const response = await fetch("/api/landmarks");
    if (response.ok) {
      const data = await response.json();
      if (data && Array.isArray(data.landmarks)) {
        landmarks = data.landmarks;
      }
    }
  } catch (error) {
    console.warn("Using fallback landmarks.", error);
  }

  landmarks.forEach((landmark) => {
    const structure = createLandmarkStructure(landmark);
    if (structure) {
      world.add(structure);
    }
    const marker = createMarker(landmark);
    markers.push(marker);
    markerMap.set(landmark.id, marker);
    world.add(marker);
  });
}

function createLandmarkStructure(landmark) {
  const group = new THREE.Group();
  const baseMaterial = new THREE.MeshStandardMaterial({
    color: palette.stone,
    roughness: 0.85,
  });
  const roofMaterial = new THREE.MeshStandardMaterial({
    color: palette.roof,
    roughness: 0.65,
  });
  const accentMaterial = new THREE.MeshStandardMaterial({
    color: palette.gold,
    roughness: 0.4,
  });

  switch (landmark.type) {
    case "gate":
      group.add(createGate(baseMaterial, roofMaterial));
      break;
    case "temple":
      group.add(createTemple(baseMaterial, roofMaterial));
      break;
    case "tower":
      group.add(createTower(baseMaterial, roofMaterial));
      break;
    case "stage":
      group.add(createStage(baseMaterial, roofMaterial, accentMaterial));
      break;
    case "market":
      group.add(createMarket(baseMaterial, roofMaterial));
      break;
    case "craft":
      group.add(createCraftHall(baseMaterial, roofMaterial));
      break;
    default:
      return null;
  }

  group.position.set(landmark.position.x, 0, landmark.position.z);
  group.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });
  return group;
}

function createGate(baseMaterial, roofMaterial) {
  const group = new THREE.Group();
  const pillarGeometry = new THREE.BoxGeometry(1.4, 6, 1.4);
  const beamGeometry = new THREE.BoxGeometry(8, 1.4, 2.2);
  const roof = createRoof(9, 3, 1.4, roofMaterial);

  const left = new THREE.Mesh(pillarGeometry, baseMaterial);
  left.position.set(-3.2, 3, 0);
  const right = new THREE.Mesh(pillarGeometry, baseMaterial);
  right.position.set(3.2, 3, 0);
  const beam = new THREE.Mesh(beamGeometry, baseMaterial);
  beam.position.set(0, 6.2, 0);
  roof.position.set(0, 7.4, 0);

  group.add(left, right, beam, roof);
  return group;
}

function createTemple(baseMaterial, roofMaterial) {
  const group = new THREE.Group();
  const base = new THREE.Mesh(new THREE.BoxGeometry(10, 2, 8), baseMaterial);
  base.position.set(0, 1, 0);
  const hall = new THREE.Mesh(new THREE.BoxGeometry(8, 4, 6), baseMaterial);
  hall.position.set(0, 4, 0);
  const roof = createRoof(9, 7, 2.2, roofMaterial);
  roof.position.set(0, 6.8, 0);
  group.add(base, hall, roof);
  return group;
}

function createTower(baseMaterial, roofMaterial) {
  const group = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(4.5, 5.5, 6, 24), baseMaterial);
  base.position.set(0, 3, 0);
  const mid = new THREE.Mesh(new THREE.CylinderGeometry(3.5, 4.2, 4, 20), baseMaterial);
  mid.position.set(0, 7, 0);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(4.6, 3.5, 24), roofMaterial);
  roof.position.set(0, 10.5, 0);
  group.add(base, mid, roof);
  return group;
}

function createStage(baseMaterial, roofMaterial, accentMaterial) {
  const group = new THREE.Group();
  const platform = new THREE.Mesh(new THREE.BoxGeometry(8, 1, 6), baseMaterial);
  platform.position.set(0, 0.5, 0);
  const canopy = new THREE.Mesh(new THREE.BoxGeometry(7, 2.4, 2.5), baseMaterial);
  canopy.position.set(0, 3, -1.5);
  const roof = createRoof(7.5, 4, 1.6, roofMaterial);
  roof.position.set(0, 4.4, -1.5);
  const spotlight = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.6, 1, 8), accentMaterial);
  spotlight.position.set(0, 2.4, 1.8);
  group.add(platform, canopy, roof, spotlight);
  return group;
}

function createMarket(baseMaterial, roofMaterial) {
  const group = new THREE.Group();
  const base = new THREE.Mesh(new THREE.BoxGeometry(9, 2, 5), baseMaterial);
  base.position.set(0, 1, 0);
  const hall = new THREE.Mesh(new THREE.BoxGeometry(8, 3, 4), baseMaterial);
  hall.position.set(0, 3.5, 0);
  const roof = createRoof(9, 5, 1.6, roofMaterial);
  roof.position.set(0, 5.4, 0);
  group.add(base, hall, roof);
  return group;
}

function createCraftHall(baseMaterial, roofMaterial) {
  const group = new THREE.Group();
  const base = new THREE.Mesh(new THREE.BoxGeometry(7, 2, 6), baseMaterial);
  base.position.set(0, 1, 0);
  const hall = new THREE.Mesh(new THREE.BoxGeometry(6, 3, 5), baseMaterial);
  hall.position.set(0, 3.5, 0);
  const roof = createRoof(7.2, 6, 1.6, roofMaterial);
  roof.position.set(0, 5.2, 0);
  group.add(base, hall, roof);
  return group;
}

function createMarker(landmark) {
  const group = new THREE.Group();
  const color = new THREE.Color(landmark.color || palette.gold);
  const baseMaterial = new THREE.MeshStandardMaterial({
    color: "#3f2b1f",
    roughness: 0.6,
  });
  const poleMaterial = new THREE.MeshStandardMaterial({
    color: "#6e3b2f",
    roughness: 0.5,
  });
  const beaconMaterial = new THREE.MeshStandardMaterial({
    color,
    emissive: color.clone().multiplyScalar(0.5),
    emissiveIntensity: 0.7,
    roughness: 0.35,
  });

  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1.1, 0.4, 16), baseMaterial);
  base.position.set(0, 0.2, 0);
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12, 0.12, landmark.height || 5, 8),
    poleMaterial
  );
  pole.position.set(0, (landmark.height || 5) / 2 + 0.3, 0);
  const beacon = new THREE.Mesh(new THREE.ConeGeometry(0.6, 1.6, 16), beaconMaterial);
  beacon.position.set(0, (landmark.height || 5) + 1.2, 0);

  group.add(base, pole, beacon);
  group.position.set(landmark.position.x, 0.1, landmark.position.z);
  group.userData = {
    landmarkId: landmark.id,
    name: landmark.name,
    description: landmark.description,
    type: landmark.type,
    materials: [beaconMaterial, baseMaterial],
  };

  group.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });

  return group;
}

function createPavingTexture() {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#d6c2a2";
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = "rgba(112, 86, 64, 0.35)";
  ctx.lineWidth = 2;

  const tile = 32;
  for (let x = 0; x <= size; x += tile) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, size);
    ctx.stroke();
  }
  for (let y = 0; y <= size; y += tile) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(size, y);
    ctx.stroke();
  }

  ctx.strokeStyle = "rgba(112, 86, 64, 0.25)";
  for (let i = 0; i < size; i += tile * 2) {
    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(size, i + tile * 0.6);
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(6, 18);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createWaterTexture() {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");

  const gradient = ctx.createLinearGradient(0, 0, size, size);
  gradient.addColorStop(0, "#2b6f87");
  gradient.addColorStop(1, "#1f4f62");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  ctx.strokeStyle = "rgba(255, 255, 255, 0.12)";
  ctx.lineWidth = 2;
  for (let i = 0; i < 12; i += 1) {
    ctx.beginPath();
    ctx.arc(
      size * 0.2 + i * 12,
      size * 0.4 + i * 6,
      40 + i * 2,
      0,
      Math.PI * 2
    );
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2, 4);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function onPointerMove(event) {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(pointer, camera);
  const intersections = raycaster.intersectObjects(markers, true);
  if (intersections.length > 0) {
    const marker = getMarkerRoot(intersections[0].object);
    if (marker) {
      if (hoveredMarker !== marker) {
        setMarkerHighlight(hoveredMarker, false);
        hoveredMarker = marker;
        setMarkerHighlight(marker, true);
      }
      tooltip.classList.add("visible");
      tooltip.setAttribute("aria-hidden", "false");
      tooltip.textContent = `${marker.userData.name} — ${marker.userData.description}`;
      tooltip.style.left = `${event.clientX}px`;
      tooltip.style.top = `${event.clientY}px`;
      return;
    }
  }

  clearHover();
}

function onPointerLeave() {
  clearHover();
}

function onClick() {
  if (!hoveredMarker) {
    return;
  }
  if (selectedMarker && selectedMarker !== hoveredMarker) {
    setMarkerHighlight(selectedMarker, false);
  }
  selectedMarker = hoveredMarker;
  updateInfoPanel(selectedMarker);
  focusOnMarker(selectedMarker);
}

function clearHover() {
  tooltip.classList.remove("visible");
  tooltip.setAttribute("aria-hidden", "true");
  if (hoveredMarker && hoveredMarker !== selectedMarker) {
    setMarkerHighlight(hoveredMarker, false);
  }
  hoveredMarker = null;
}

function getMarkerRoot(object) {
  let current = object;
  while (current && !current.userData.landmarkId) {
    current = current.parent;
  }
  return current || null;
}

function setMarkerHighlight(marker, active) {
  if (!marker) {
    return;
  }
  const scale = active ? 1.12 : 1;
  marker.scale.set(scale, scale, scale);
  const emissiveBoost = active ? 1.2 : 0.7;
  marker.userData.materials.forEach((material) => {
    if (material.emissive) {
      material.emissiveIntensity = emissiveBoost;
    }
  });
}

function updateInfoPanel(marker) {
  if (!marker) {
    infoName.textContent = "悬停或点击地标";
    infoDesc.textContent = "查看对应位置的文化与服务说明。";
    return;
  }
  infoName.textContent = marker.userData.name;
  infoDesc.textContent = marker.userData.description;
}

function focusOnMarker(marker) {
  const target = marker.position.clone();
  const offset = new THREE.Vector3(16, 14, 16);
  focusTarget = target;
  focusPosition = target.clone().add(offset);
}

function onResize() {
  const { clientWidth, clientHeight } = container;
  camera.aspect = clientWidth / clientHeight;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(quality.pixelRatio);
  renderer.setSize(clientWidth, clientHeight);
}

function animate() {
  requestAnimationFrame(animate);
  const now = performance.now();
  if (quality.maxFps) {
    const minDelta = 1000 / quality.maxFps;
    if (now - lastFrameTime < minDelta) {
      return;
    }
    lastFrameTime = now;
  }
  if (quality.pauseWhenHidden && (!isSceneVisible || !isPageVisible)) {
    return;
  }

  controls.update();
  updateWater();
  updateLanterns();
  updateFocus();

  renderer.render(scene, camera);
}

function updateWater() {
  if (!quality.animateWater) {
    return;
  }
  if (!river || !river.material.map) {
    return;
  }
  const time = performance.now() * 0.00004;
  river.material.map.offset.set(time % 1, (time * 1.3) % 1);
}

function updateLanterns() {
  if (!quality.animateLanterns) {
    return;
  }
  const time = performance.now() * 0.002;
  lanterns.bulbs.forEach((bulb, index) => {
    const flicker = 0.2 + Math.sin(time + bulb.seed) * 0.15;
    bulb.mesh.material.emissiveIntensity = 0.6 + flicker;
    if (bulb.light) {
      bulb.light.intensity = 0.35 + flicker;
    }
  });
}

function updateFocus() {
  if (!focusTarget || !focusPosition) {
    return;
  }
  camera.position.lerp(focusPosition, 0.08);
  controls.target.lerp(focusTarget, 0.08);
  if (camera.position.distanceTo(focusPosition) < 0.4) {
    focusTarget = null;
    focusPosition = null;
  }
}

function seededRandom(seed) {
  const value = Math.sin(seed) * 10000;
  return value - Math.floor(value);
}

function setupVisibilityTracking() {
  isPageVisible = !document.hidden;
  document.addEventListener("visibilitychange", () => {
    isPageVisible = !document.hidden;
  });

  if (!("IntersectionObserver" in window)) {
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        isSceneVisible = entry.isIntersecting && entry.intersectionRatio > 0.05;
      });
    },
    { threshold: [0, 0.05, 0.2] }
  );

  observer.observe(container);
}

function setupVideoPlayer() {
  const video = document.getElementById("promo-video");
  const overlay = document.getElementById("video-overlay");
  const upload = document.getElementById("video-upload");
  const shell = document.getElementById("video-shell");

  if (!video) {
    return;
  }

  const setOverlayVisible = (visible) => {
    if (!overlay) {
      return;
    }
    overlay.style.opacity = visible ? "1" : "0";
    overlay.style.pointerEvents = visible ? "auto" : "none";
  };

  const setVideoSource = (src) => {
    if (!src) {
      return;
    }
    video.src = src;
    video.load();
    setOverlayVisible(false);
  };

  const handleFile = (file) => {
    if (!file) {
      return;
    }
    if (videoObjectUrl) {
      URL.revokeObjectURL(videoObjectUrl);
    }
    videoObjectUrl = URL.createObjectURL(file);
    setVideoSource(videoObjectUrl);
  };

  if (upload) {
    upload.addEventListener("change", () => {
      const file = upload.files && upload.files[0];
      handleFile(file);
    });
  }

  if (overlay && upload) {
    overlay.addEventListener("click", () => {
      upload.click();
    });
  }

  if (shell) {
    shell.addEventListener("dragover", (event) => {
      event.preventDefault();
      shell.classList.add("dragging");
    });
    shell.addEventListener("dragleave", () => {
      shell.classList.remove("dragging");
    });
    shell.addEventListener("drop", (event) => {
      event.preventDefault();
      shell.classList.remove("dragging");
      const file = event.dataTransfer && event.dataTransfer.files[0];
      handleFile(file);
    });
  }

  const defaultSrc = video.dataset.defaultSrc;
  if (defaultSrc) {
    fetch(defaultSrc, { method: "HEAD" })
      .then((response) => {
        if (response.ok) {
          setVideoSource(defaultSrc);
        } else {
          setOverlayVisible(true);
        }
      })
      .catch(() => {
        setOverlayVisible(true);
      });
  } else {
    setOverlayVisible(true);
  }
}

function getQualitySettings() {
  const params = new URLSearchParams(window.location.search);
  const forced = params.get("quality");
  const prefersReducedMotion =
    window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const memory = navigator.deviceMemory || 8;
  const cores = navigator.hardwareConcurrency || 8;
  const dpr = window.devicePixelRatio || 1;

  let level = "high";
  if (forced === "low" || forced === "medium" || forced === "high") {
    level = forced;
  } else if (prefersReducedMotion || memory <= 4 || cores <= 4) {
    level = "low";
  } else if (memory <= 6 || cores <= 6) {
    level = "medium";
  }

  const presets = {
    low: {
      antialias: false,
      pixelRatio: Math.min(dpr, 1),
      shadows: false,
      shadowMapType: THREE.BasicShadowMap,
      shadowMapSize: 512,
      shadowAutoUpdate: false,
      groundSegments: 40,
      streetSegments: 6,
      riverSegments: 10,
      treeStep: 22,
      lanternStep: 20,
      lanternLights: false,
      animateLanterns: false,
      animateWater: false,
      maxFps: 45,
      pauseWhenHidden: true,
      powerPreference: "low-power",
    },
    medium: {
      antialias: true,
      pixelRatio: Math.min(dpr, 1.5),
      shadows: true,
      shadowMapType: THREE.PCFShadowMap,
      shadowMapSize: 1024,
      shadowAutoUpdate: false,
      groundSegments: 60,
      streetSegments: 8,
      riverSegments: 16,
      treeStep: 18,
      lanternStep: 14,
      lanternLights: true,
      animateLanterns: true,
      animateWater: true,
      maxFps: null,
      pauseWhenHidden: true,
      powerPreference: "high-performance",
    },
    high: {
      antialias: true,
      pixelRatio: Math.min(dpr, 2),
      shadows: true,
      shadowMapType: THREE.PCFSoftShadowMap,
      shadowMapSize: 2048,
      shadowAutoUpdate: false,
      groundSegments: 80,
      streetSegments: 12,
      riverSegments: 24,
      treeStep: 15,
      lanternStep: 10,
      lanternLights: true,
      animateLanterns: true,
      animateWater: true,
      maxFps: null,
      pauseWhenHidden: true,
      powerPreference: "high-performance",
    },
  };

  return { level, ...presets[level] };
}

function initPresentation() {
  setupScrollButtons();
  setupSlideObserver();
  setupVideoList();
  setupVideoUpload();
  setupChat();
  setupPhotoComposer();
}

function setupScrollButtons() {
  if (!scrollButtons || scrollButtons.length === 0) {
    return;
  }
  scrollButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const target = button.getAttribute("data-scroll");
      if (!target) {
        return;
      }
      const el = document.querySelector(target);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
  });
}

function setupSlideObserver() {
  const slides = document.querySelectorAll(".slide");
  if (!slides.length || !window.IntersectionObserver) {
    slides.forEach((slide) => slide.classList.add("is-visible"));
    return;
  }
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
        }
      });
    },
    { threshold: 0.18 }
  );
  slides.forEach((slide) => observer.observe(slide));
}

function setupVideoList() {
  if (!videoElement) {
    return;
  }

  if (!videoItems || videoItems.length === 0) {
    const defaultSrc = videoElement.dataset.defaultSrc;
    if (defaultSrc) {
      setVideoSource(defaultSrc, videoTitle ? videoTitle.textContent : "", false);
    }
    return;
  }

  videoItems.forEach((item) => {
    item.addEventListener("click", () => {
      const src = item.getAttribute("data-video-src");
      const title = item.getAttribute("data-title") || item.textContent.trim();
      setActiveVideoItem(item);
      setVideoSource(src, title, true);
    });
  });

  const defaultItem =
    document.querySelector(".video-item.is-active") || videoItems[0];
  if (defaultItem) {
    const src = defaultItem.getAttribute("data-video-src");
    const title = defaultItem.getAttribute("data-title") || defaultItem.textContent.trim();
    setActiveVideoItem(defaultItem);
    setVideoSource(src, title, false);
  }
}

function setupVideoUpload() {
  if (!videoElement || !videoOverlay || !videoShell) {
    return;
  }

  const showOverlay = (text) => {
    if (text) {
      videoOverlay.textContent = text;
    }
    videoOverlay.classList.remove("hidden");
  };

  const hideOverlay = () => {
    videoOverlay.classList.add("hidden");
  };

  const loadVideoFile = (file) => {
    if (!file) {
      return;
    }
    const url = URL.createObjectURL(file);
    setActiveVideoItem(null);
    setVideoSource(url, "自定义上传视频", true);
    videoElement.onloadeddata = () => {
      hideOverlay();
      URL.revokeObjectURL(url);
    };
  };

  videoElement.addEventListener("loadeddata", hideOverlay);
  videoElement.addEventListener("error", () => {
    showOverlay("未检测到视频文件");
  });

  if (videoInput) {
    videoInput.addEventListener("change", (event) => {
      const file = event.target.files && event.target.files[0];
      loadVideoFile(file);
    });
  }

  videoShell.addEventListener("dragover", (event) => {
    event.preventDefault();
    videoShell.classList.add("dragover");
  });
  videoShell.addEventListener("dragleave", () => {
    videoShell.classList.remove("dragover");
  });
  videoShell.addEventListener("drop", (event) => {
    event.preventDefault();
    videoShell.classList.remove("dragover");
    const file = event.dataTransfer.files && event.dataTransfer.files[0];
    loadVideoFile(file);
  });
}

function setVideoSource(src, title, shouldPlay) {
  if (!videoElement || !src) {
    return;
  }
  if (videoTitle && title) {
    videoTitle.textContent = title;
  }
  videoElement.src = src;
  videoElement.load();
  if (videoOverlay) {
    videoOverlay.classList.add("hidden");
  }
  if (shouldPlay) {
    videoElement.play().catch(() => {});
  }
}

function setActiveVideoItem(activeItem) {
  if (!videoItems || videoItems.length === 0) {
    return;
  }
  videoItems.forEach((item) => {
    item.classList.toggle("is-active", item === activeItem);
  });
}

function setupChat() {
  if (!chatForm || !chatLog || !chatInput || !chatStatus) {
    return;
  }

  const greeting = "你好，我是古文化街数字人导览员。想了解哪些打卡点？";
  appendChatMessage("assistant", greeting);
  presentationState.messages.push({ role: "assistant", content: greeting });

  chatForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const text = chatInput.value.trim();
    if (!text) {
      return;
    }
    appendChatMessage("user", text);
    presentationState.messages.push({ role: "user", content: text });
    chatInput.value = "";
    chatInput.focus();
    setChatStatus("busy");
    chatInput.disabled = true;

    const thinking = appendChatMessage("assistant", "正在思考...");
    try {
      const reply = await requestChatReply();
      thinking.textContent = reply || "暂时无法生成回答。";
      presentationState.messages.push({ role: "assistant", content: reply });
      setChatStatus("online");
      triggerAvatarSpeak();
    } catch (error) {
      thinking.textContent = "当前无法连接模型，请稍后再试。";
      setChatStatus("offline");
    } finally {
      chatInput.disabled = false;
      chatInput.focus();
      scrollChatToBottom();
    }
  });
}

function appendChatMessage(role, text) {
  const message = document.createElement("div");
  message.className = `message ${role}`;
  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.textContent = text;
  message.appendChild(bubble);
  chatLog.appendChild(message);
  scrollChatToBottom();
  return bubble;
}

function scrollChatToBottom() {
  chatLog.scrollTop = chatLog.scrollHeight;
}

function setChatStatus(state) {
  if (!chatStatus) {
    return;
  }
  chatStatus.classList.remove("is-busy", "is-offline");
  setAvatarState(state);
  if (state === "busy") {
    chatStatus.textContent = "思考中";
    chatStatus.classList.add("is-busy");
  } else if (state === "offline") {
    chatStatus.textContent = "离线";
    chatStatus.classList.add("is-offline");
  } else {
    chatStatus.textContent = "在线";
  }
}

function setAvatarState(state) {
  if (!avatar) {
    return;
  }
  avatar.classList.toggle("is-speaking", state === "busy");
  avatar.classList.toggle("is-offline", state === "offline");
}

function triggerAvatarSpeak(duration = 1200) {
  if (!avatar) {
    return;
  }
  avatar.classList.add("is-speaking");
  if (speakingTimeout) {
    window.clearTimeout(speakingTimeout);
  }
  speakingTimeout = window.setTimeout(() => {
    avatar.classList.remove("is-speaking");
  }, duration);
}

async function requestChatReply() {
  const payload = {
    messages: presentationState.messages.slice(-10),
    temperature: 0.7,
    max_tokens: 220,
  };
  const response = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error(`Chat error ${response.status}`);
  }
  const data = await response.json();
  return data.content || "";
}

function setupPhotoComposer() {
  if (!photoCanvas) {
    return;
  }
  const ctx = photoCanvas.getContext("2d");
  if (!ctx) {
    return;
  }

  const loadPhotoFile = (file) => {
    if (!file) {
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      presentationState.photoImage = img;
      renderPhoto(ctx);
    };
    img.src = url;
  };

  if (photoInput) {
    photoInput.addEventListener("change", (event) => {
      const file = event.target.files && event.target.files[0];
      loadPhotoFile(file);
    });
  }

  if (photoTheme) {
    photoTheme.addEventListener("change", () => renderPhoto(ctx));
  }

  if (photoButton) {
    photoButton.addEventListener("click", () => renderPhoto(ctx));
  }

  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => renderPhoto(ctx));
  } else {
    renderPhoto(ctx);
  }
}

function renderPhoto(ctx) {
  const { width, height } = ctx.canvas;
  ctx.clearRect(0, 0, width, height);
  drawStageBackground(ctx, width, height);

  const frame = {
    x: width * 0.22,
    y: height * 0.15,
    w: width * 0.56,
    h: height * 0.72,
  };

  if (presentationState.photoImage) {
    drawImageCover(ctx, presentationState.photoImage, frame);
  } else {
    drawSilhouette(ctx, frame);
  }

  drawVest(ctx, frame);

  if (photoPlaceholder) {
    photoPlaceholder.style.opacity = presentationState.photoImage ? "0" : "1";
  }
}

function drawStageBackground(ctx, width, height) {
  const themeKey = photoTheme ? photoTheme.value : "classic";
  const themes = {
    classic: {
      top: "#3b0f0f",
      mid: "#6b1b1b",
      bottom: "#9a3b2a",
      light: "#f3c97a",
      floor: "#3a1a18",
    },
    warm: {
      top: "#3a2318",
      mid: "#74402a",
      bottom: "#b56b35",
      light: "#ffd49a",
      floor: "#2d1a14",
    },
    night: {
      top: "#141926",
      mid: "#28304a",
      bottom: "#3d355b",
      light: "#7fc6ff",
      floor: "#0f1018",
    },
  };
  const theme = themes[themeKey] || themes.classic;

  const bg = ctx.createLinearGradient(0, 0, 0, height);
  bg.addColorStop(0, theme.top);
  bg.addColorStop(0.5, theme.mid);
  bg.addColorStop(1, theme.bottom);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = "rgba(0, 0, 0, 0.15)";
  ctx.fillRect(0, height * 0.62, width, height * 0.38);

  const floor = ctx.createLinearGradient(0, height * 0.62, 0, height);
  floor.addColorStop(0, theme.floor);
  floor.addColorStop(1, "#0b0b0b");
  ctx.fillStyle = floor;
  ctx.fillRect(0, height * 0.62, width, height * 0.38);

  ctx.save();
  ctx.fillStyle = "rgba(255, 255, 255, 0.08)";
  ctx.beginPath();
  ctx.ellipse(width * 0.5, height * 0.2, width * 0.32, height * 0.18, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.fillStyle = theme.light;
  ctx.globalAlpha = 0.35;
  ctx.beginPath();
  ctx.moveTo(width * 0.2, 0);
  ctx.lineTo(width * 0.35, height * 0.7);
  ctx.lineTo(width * 0.05, height * 0.7);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(width * 0.8, 0);
  ctx.lineTo(width * 0.95, height * 0.7);
  ctx.lineTo(width * 0.65, height * 0.7);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 1;

  ctx.fillStyle = "#caa05d";
  ctx.fillRect(width * 0.28, height * 0.06, width * 0.44, height * 0.08);
  ctx.fillStyle = "#f4e3b2";
  ctx.font = 'bold 32px \"ZCOOL XiaoWei\", serif';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("德云社", width * 0.5, height * 0.1);
}

function drawImageCover(ctx, image, frame) {
  const { x, y, w, h } = frame;
  const scale = Math.max(w / image.width, h / image.height);
  const sw = w / scale;
  const sh = h / scale;
  const sx = (image.width - sw) / 2;
  const sy = (image.height - sh) / 2;

  ctx.save();
  roundedRect(ctx, x, y, w, h, 24);
  ctx.clip();
  ctx.drawImage(image, sx, sy, sw, sh, x, y, w, h);
  ctx.restore();
}

function drawSilhouette(ctx, frame) {
  const { x, y, w, h } = frame;
  ctx.save();
  roundedRect(ctx, x, y, w, h, 24);
  ctx.clip();
  const gradient = ctx.createLinearGradient(x, y, x, y + h);
  gradient.addColorStop(0, "rgba(255, 255, 255, 0.25)");
  gradient.addColorStop(1, "rgba(255, 255, 255, 0.05)");
  ctx.fillStyle = gradient;
  ctx.fillRect(x, y, w, h);

  ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
  ctx.beginPath();
  ctx.arc(x + w * 0.5, y + h * 0.3, w * 0.18, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(x + w * 0.5, y + h * 0.68, w * 0.32, h * 0.28, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
  ctx.font = '16px \"Noto Sans SC\", sans-serif';
  ctx.textAlign = "center";
  ctx.fillText("上传照片生成旅拍", x + w * 0.5, y + h * 0.52);
}

function drawVest(ctx, frame) {
  const { x, y, w, h } = frame;
  ctx.save();
  ctx.fillStyle = "rgba(40, 24, 18, 0.78)";
  ctx.fillRect(x + w * 0.12, y + h * 0.48, w * 0.32, h * 0.46);
  ctx.fillRect(x + w * 0.56, y + h * 0.48, w * 0.32, h * 0.46);

  ctx.strokeStyle = "rgba(255, 230, 190, 0.5)";
  ctx.lineWidth = 2;
  ctx.strokeRect(x + w * 0.12, y + h * 0.48, w * 0.76, h * 0.46);

  ctx.fillStyle = "rgba(255, 210, 150, 0.9)";
  ctx.font = 'bold 18px \"ZCOOL XiaoWei\", serif';
  ctx.textAlign = "center";
  ctx.fillText("相声马甲", x + w * 0.5, y + h * 0.92);
  ctx.restore();
}

function roundedRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}
