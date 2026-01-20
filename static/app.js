import * as THREE from "./vendor/three.module.js";
import { OrbitControls } from "./vendor/OrbitControls.js";

const container = document.getElementById("scene");
const tooltip = document.getElementById("tooltip");
const infoPanel = document.getElementById("info-panel");
const infoName = infoPanel ? infoPanel.querySelector(".info-name") : null;
const infoDesc = infoPanel ? infoPanel.querySelector(".info-desc") : null;
const loading = document.getElementById("loading");
const scrollButtons = document.querySelectorAll("[data-scroll]");
const videoInput = document.getElementById("video-upload");
const videoElement = document.getElementById("promo-video");
const videoOverlay = document.getElementById("video-overlay");
const videoShell = document.getElementById("video-shell");
const videoTitle = document.getElementById("video-title");
const videoItems = document.querySelectorAll(".video-item");
const videoFilters = document.querySelectorAll(".video-filter");
const videoList = document.querySelector(".video-list");
const chatForm = document.getElementById("chat-form");
const chatInput = document.getElementById("chat-input");
const chatLog = document.getElementById("chat-log");
const chatStatus = document.getElementById("chat-status");
const avatar = document.getElementById("avatar");
const chatImageInput = document.getElementById("chat-image");
const chatImagePreview = document.getElementById("chat-image-preview");
const chatImagePlaceholder = document.getElementById("chat-image-placeholder");
const chatImageThumb = document.getElementById("chat-image-thumb");
const chatImageName = document.getElementById("chat-image-name");
const chatImageClear = document.getElementById("chat-image-clear");
const photoInput = document.getElementById("photo-upload");
const photoTheme = document.getElementById("photo-theme");
const photoButton = document.getElementById("photo-generate");
const photoCanvas = document.getElementById("photo-canvas");
const photoPlaceholder = document.getElementById("photo-placeholder");
const photoVideoElement = document.getElementById("photo-video");
const photoVideoTitle = document.getElementById("photo-video-title");
const photoVideoItems = document.querySelectorAll(".photo-video-item");

const presentationState = {
  messages: [],
  photoImage: null,
  pendingImage: null,
};
let speakingTimeout = null;

installGlobalErrorHandler();

const liteMode = (() => {
  if (typeof URLSearchParams === "undefined") {
    return true;
  }
  const params = new URLSearchParams(window.location.search);
  if (!params.has("lite")) {
    return true;
  }
  const value = params.get("lite");
  return value !== "0" && value !== "false";
})();

const quality = getQualitySettings();
if (liteMode) {
  quality.level = "lite";
  quality.antialias = false;
  quality.pixelRatio = Math.min(window.devicePixelRatio || 1, 1);
  quality.shadows = false;
  quality.shadowMapType = THREE.BasicShadowMap;
  quality.shadowMapSize = 256;
  quality.shadowAutoUpdate = false;
  quality.groundSegments = 20;
  quality.streetSegments = 2;
  quality.riverSegments = 4;
  quality.treeStep = 40;
  quality.lanternStep = 40;
  quality.lanternLights = false;
  quality.animateLanterns = false;
  quality.animateWater = false;
  quality.maxFps = 30;
  quality.pauseWhenHidden = true;
  quality.powerPreference = "low-power";
}

if (!container) {
  showLoadingError("未找到 3D 场景容器，请刷新重试。");
  throw new Error("Scene container not found.");
}

const mapOnly = container.getAttribute("data-map-only") === "true";

let scene = null;
let camera = null;
let renderer = null;
let controls = null;
let world = null;
let river = null;
let lanterns = { group: null, bulbs: [] };
let threeReady = false;

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

if (!mapOnly) {
  try {
    scene = new THREE.Scene();
    scene.background = new THREE.Color("#f1e6d3");
    scene.fog = new THREE.Fog("#e9dcc6", 50, 180);

    const initialWidth = Math.max(container.clientWidth, 1);
    const initialHeight = Math.max(container.clientHeight, 1);

    camera = new THREE.PerspectiveCamera(
      45,
      initialWidth / initialHeight,
      0.1,
      260
    );
    camera.position.set(48, 50, 70);

    renderer = new THREE.WebGLRenderer({
      antialias: quality.antialias,
      powerPreference: quality.powerPreference,
      alpha: false,
      stencil: false,
      precision: liteMode ? "lowp" : "highp",
    });
    renderer.setPixelRatio(quality.pixelRatio);
    renderer.setSize(initialWidth, initialHeight);
    renderer.shadowMap.enabled = quality.shadows;
    renderer.shadowMap.type = quality.shadowMapType;
    renderer.shadowMap.autoUpdate = quality.shadowAutoUpdate;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    container.appendChild(renderer.domElement);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.07;
    controls.enablePan = true;
    controls.minDistance = 28;
    controls.maxDistance = 150;
    controls.minPolarAngle = Math.PI / 6;
    controls.maxPolarAngle = Math.PI / 2.1;

    world = new THREE.Group();
    scene.add(world);

    world.add(createLights());
    world.add(createGround());
    world.add(createStreet());
    world.add(createBuildings());

    if (!liteMode) {
      river = createRiver();
      world.add(river);
      world.add(createBridge());
      world.add(createTrees());
      lanterns = createLanterns();
      world.add(lanterns.group);
    }

    threeReady = true;
  } catch (error) {
    console.error("3D init failed:", error);
    renderFallbackMap("3D 无法加载，已切换为平面示意。");
  }
}

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
let hasRendered = false;
let sceneResizeObserver = null;
let pendingResizeFrame = null;

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

try {
  initPresentation();
} catch (error) {
  console.warn("Presentation init failed:", error);
}
if (threeReady) {
  init().catch((error) => {
    console.error(error);
    showLoadingError("场景加载失败，请刷新或更换浏览器。");
  });
} else {
  hideLoading();
}

function createLights() {
  const group = new THREE.Group();
  if (liteMode) {
    const hemi = new THREE.HemisphereLight(0xfdf5e6, 0x4c3a2f, 0.9);
    const dir = new THREE.DirectionalLight(0xfff0d0, 0.6);
    dir.position.set(40, 60, 20);
    group.add(hemi, dir);
    return group;
  }
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
  if (liteMode) {
    const geometry = new THREE.PlaneGeometry(160, 160, 1, 1);
    geometry.rotateX(-Math.PI / 2);
    const material = new THREE.MeshStandardMaterial({
      color: palette.earth,
      roughness: 0.95,
      metalness: 0.02,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.receiveShadow = true;
    mesh.position.y = -1;
    return mesh;
  }
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

  let material = null;
  if (liteMode) {
    material = new THREE.MeshStandardMaterial({
      color: "#d2b894",
      roughness: 0.9,
      metalness: 0.02,
    });
  } else {
    const pavingTexture = createPavingTexture();
    material = new THREE.MeshStandardMaterial({
      map: pavingTexture,
      roughness: 0.8,
      metalness: 0.05,
    });
  }
  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = true;
  mesh.position.y = 0.05;

  const group = new THREE.Group();
  group.add(mesh);
  if (!liteMode) {
    const edgeMaterial = new THREE.LineBasicMaterial({
      color: "#6b3b2d",
      transparent: true,
      opacity: 0.5,
    });
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(geometry),
      edgeMaterial
    );
    edges.position.y = 0.06;
    group.add(edges);
  }
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

  const maxZ = liteMode ? 30 : 42;
  const step = liteMode ? 24 : 12;
  for (let z = -maxZ; z <= maxZ; z += step) {
    addCluster(-18, z, -1);
    addCluster(18, z, 1);
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

    if (liteMode) {
      return;
    }

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
  if (liteMode) {
    return group;
  }
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
  const landmarksPromise = loadLandmarks().catch((error) => {
    console.warn("Failed to load landmarks.", error);
  });

  renderer.domElement.style.touchAction = "none";
  renderer.domElement.addEventListener("pointermove", onPointerMove);
  renderer.domElement.addEventListener("pointerleave", onPointerLeave);
  renderer.domElement.addEventListener("click", onClick);
  window.addEventListener("resize", onResize);
  safeInvoke(setupSceneResizer, "scene resize");
  window.addEventListener("pageshow", () => {
    onResize();
    renderOnce();
  });
  safeInvoke(setupVisibilityTracking, "visibility tracking");
  safeInvoke(setupPhotoGenerator, "photo generator");

  onResize();
  requestAnimationFrame(onResize);

  hideLoading();
  renderOnce();
  if (quality.shadows && !quality.shadowAutoUpdate) {
    renderer.shadowMap.needsUpdate = true;
  }
  animate();

  await landmarksPromise;
  if (quality.shadows && !quality.shadowAutoUpdate) {
    renderer.shadowMap.needsUpdate = true;
  }
}

async function loadLandmarks() {
  let landmarks = fallbackLandmarks;
  let timeoutId = null;
  let controller = null;
  try {
    if (typeof AbortController !== "undefined") {
      controller = new AbortController();
      timeoutId = window.setTimeout(() => controller.abort(), 2200);
    }
    const response = await fetch(
      "/api/landmarks",
      controller ? { signal: controller.signal } : undefined
    );
    if (response.ok) {
      const data = await response.json();
      if (data && Array.isArray(data.landmarks)) {
        landmarks = data.landmarks;
      }
    }
  } catch (error) {
    console.warn("Using fallback landmarks.", error);
  } finally {
    if (timeoutId) {
      window.clearTimeout(timeoutId);
    }
  }

  landmarks.forEach((landmark) => {
    if (!liteMode) {
      const structure = createLandmarkStructure(landmark);
      if (structure) {
        world.add(structure);
      }
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

  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(0.8, 1.1, 0.4, liteMode ? 8 : 16),
    baseMaterial
  );
  base.position.set(0, 0.2, 0);
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12, 0.12, landmark.height || 5, liteMode ? 6 : 8),
    poleMaterial
  );
  pole.position.set(0, (landmark.height || 5) / 2 + 0.3, 0);
  const beacon = new THREE.Mesh(
    new THREE.ConeGeometry(0.6, 1.6, liteMode ? 8 : 16),
    beaconMaterial
  );
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
  if (!infoName || !infoDesc) {
    return;
  }
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
  if (!camera || !renderer) {
    return;
  }
  const rect = container.getBoundingClientRect();
  let width = Math.round(rect.width);
  let height = Math.round(rect.height);
  if (!width || !height) {
    const parent = container.parentElement;
    if (parent) {
      const parentRect = parent.getBoundingClientRect();
      width = Math.round(parentRect.width);
      height = Math.round(parentRect.height);
    }
  }
  if (!width || !height) {
    return;
  }
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(quality.pixelRatio);
  renderer.setSize(width, height);
  if (
    !hasRendered ||
    (quality.pauseWhenHidden && (!isSceneVisible || !isPageVisible))
  ) {
    renderOnce();
  }
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
    if (!hasRendered) {
      renderer.render(scene, camera);
      hasRendered = true;
    }
    return;
  }

  controls.update();
  updateWater();
  updateLanterns();
  updateFocus();

  renderer.render(scene, camera);
  hasRendered = true;
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
  for (let i = 0; i < lanterns.bulbs.length; i += 1) {
    const bulb = lanterns.bulbs[i];
    const flicker = 0.2 + Math.sin(time + bulb.seed) * 0.15;
    bulb.mesh.material.emissiveIntensity = 0.6 + flicker;
    if (bulb.light) {
      bulb.light.intensity = 0.35 + flicker;
    }
  }
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

function setupSceneResizer() {
  const target = container.parentElement || container;

  const scheduleResize = () => {
    if (pendingResizeFrame) {
      cancelAnimationFrame(pendingResizeFrame);
    }
    pendingResizeFrame = requestAnimationFrame(() => {
      pendingResizeFrame = null;
      onResize();
    });
  };

  scheduleResize();
  window.addEventListener("load", scheduleResize);

  if ("ResizeObserver" in window) {
    sceneResizeObserver = new ResizeObserver(scheduleResize);
    sceneResizeObserver.observe(target);
    return;
  }

  let attempts = 0;
  const intervalId = window.setInterval(() => {
    attempts += 1;
    scheduleResize();
    if (attempts >= 8) {
      window.clearInterval(intervalId);
    }
  }, 240);
}

function getFullscreenElement() {
  return (
    document.fullscreenElement ||
    document.webkitFullscreenElement ||
    document.mozFullScreenElement ||
    document.msFullscreenElement
  );
}

function requestFullscreen(element) {
  if (!element) {
    return;
  }
  const request =
    element.requestFullscreen ||
    element.webkitRequestFullscreen ||
    element.mozRequestFullScreen ||
    element.msRequestFullscreen;
  if (request) {
    request.call(element);
  }
}

function exitFullscreen() {
  const exit =
    document.exitFullscreen ||
    document.webkitExitFullscreen ||
    document.mozCancelFullScreen ||
    document.msExitFullscreen;
  if (exit) {
    exit.call(document);
  }
}

function setupVideoFullscreen(video, shell) {
  if (!video) {
    return;
  }

  const toggle = () => {
    const current = getFullscreenElement();
    if (current && current === video) {
      exitFullscreen();
    } else {
      requestFullscreen(video);
    }
  };

  video.addEventListener("click", toggle);
  if (shell) {
    shell.addEventListener("dblclick", toggle);
  }
}

function setupVideoPlayer() {
  const video = document.getElementById("promo-video");
  const overlay = document.getElementById("video-overlay");
  const upload = document.getElementById("video-upload");
  const shell = document.getElementById("video-shell");

  if (!video) {
    return;
  }

  setupVideoFullscreen(video, shell);

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

function setupPhotoGenerator() {
  const upload = document.getElementById("photo-upload");
  const themeSelect = document.getElementById("photo-theme");
  const button = document.getElementById("photo-generate");
  const canvas = document.getElementById("photo-canvas");
  const placeholder = document.getElementById("photo-placeholder");

  if (!button || !canvas) {
    return;
  }

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return;
  }

  let selectedFile = null;
  let previewUrl = null;

  const setStatus = (text) => {
    if (!placeholder) {
      return;
    }
    placeholder.textContent = text;
    placeholder.style.opacity = "1";
    placeholder.style.pointerEvents = "auto";
  };

  const clearStatus = () => {
    if (!placeholder) {
      return;
    }
    placeholder.style.opacity = "0";
    placeholder.style.pointerEvents = "none";
  };

  const drawImageToCanvas = (image) => {
    const { width, height } = canvas;
    ctx.clearRect(0, 0, width, height);
    const scale = Math.min(width / image.width, height / image.height);
    const drawWidth = image.width * scale;
    const drawHeight = image.height * scale;
    const offsetX = (width - drawWidth) / 2;
    const offsetY = (height - drawHeight) / 2;
    ctx.drawImage(image, offsetX, offsetY, drawWidth, drawHeight);
  };

  const renderFromUrl = (url) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      drawImageToCanvas(image);
      clearStatus();
    };
    image.onerror = () => {
      setStatus("生成失败，请重试或更换图片");
    };
    image.src = url;
  };

  if (upload) {
    upload.addEventListener("change", () => {
      const file = upload.files && upload.files[0];
      if (!file) {
        return;
      }
      selectedFile = file;
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
      previewUrl = URL.createObjectURL(file);
      renderFromUrl(previewUrl);
    });
  }

  button.addEventListener("click", async () => {
    const formData = new FormData();
    if (selectedFile) {
      formData.append("photo", selectedFile);
    }
    formData.append("theme", themeSelect ? themeSelect.value : "classic");

    button.disabled = true;
    setStatus("通义生成中，请稍候...");

    try {
      const response = await fetch("/api/photo/generate", {
        method: "POST",
        body: formData,
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const message = errorData.detail || "生成失败，请稍后再试";
        setStatus(message);
        return;
      }
      const data = await response.json();
      if (data.image_url) {
        renderFromUrl(`${data.image_url}?t=${Date.now()}`);
      } else {
        setStatus("未获取到生成结果");
      }
    } catch (error) {
      console.error(error);
      setStatus("生成失败，请检查网络或模型配置");
    } finally {
      button.disabled = false;
    }
  });
}

function getQualitySettings() {
  let params = null;
  if (typeof URLSearchParams !== "undefined") {
    params = new URLSearchParams(window.location.search);
  }
  const forced = params ? params.get("quality") : null;
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

function safeInvoke(fn, label) {
  if (typeof fn !== "function") {
    return;
  }
  try {
    fn();
  } catch (error) {
    console.warn("Init failed:", label, error);
  }
}

function showLoadingError(message) {
  if (!loading) {
    return;
  }
  if (loading.classList) {
    loading.classList.remove("hidden");
  } else {
    loading.className = loading.className.replace(/\bhidden\b/g, "").trim();
  }
  loading.innerHTML = `<div class=\"spinner\"></div><div>${message}</div>`;
}

function installGlobalErrorHandler() {
  window.addEventListener("error", (event) => {
    const message = event && event.message ? event.message : "未知错误";
    showLoadingError(`场景加载失败：${message}`);
  });
  window.addEventListener("unhandledrejection", (event) => {
    const reason = event && event.reason ? event.reason : null;
    const message = reason && reason.message ? reason.message : "未知错误";
    showLoadingError(`场景加载失败：${message}`);
  });
}

function hideLoading() {
  if (!loading) {
    return;
  }
  if (loading.classList) {
    loading.classList.add("hidden");
    if (typeof window !== "undefined") {
      window.__appReady = true;
    }
    return;
  }
  if (loading.className.indexOf("hidden") === -1) {
    loading.className += " hidden";
  }
  if (typeof window !== "undefined") {
    window.__appReady = true;
  }
}

function renderOnce() {
  if (!renderer || !scene || !camera) {
    return;
  }
  renderer.render(scene, camera);
  hasRendered = true;
}

function renderFallbackMap(message) {
  if (!container) {
    return;
  }
  container.innerHTML = "";
  const wrapper = document.createElement("div");
  wrapper.className = "scene-fallback";

  const header = document.createElement("div");
  header.className = "fallback-header";
  header.innerHTML = `<strong>街区平面示意</strong><span>${
    message || "已启用超简模式"
  }</span>`;

  const map = document.createElement("div");
  map.className = "fallback-map";
  map.innerHTML = `
    <span class="fallback-dot gate" style="left:50%; top:18%;">牌坊</span>
    <span class="fallback-dot craft" style="left:32%; top:38%;">民俗馆</span>
    <span class="fallback-dot temple" style="left:30%; top:52%;">天后宫</span>
    <span class="fallback-dot market" style="left:66%; top:50%;">津味街</span>
    <span class="fallback-dot stage" style="left:64%; top:66%;">曲艺台</span>
    <span class="fallback-dot tower" style="left:52%; top:82%;">鼓楼</span>
  `;

  wrapper.appendChild(header);
  wrapper.appendChild(map);
  container.appendChild(wrapper);
  hideLoading();
}

function initPresentation() {
  setupPanelTabs();
  setupVideoList();
  setupVideoFilters();
  setupVideoUpload();
  setupScenarioVideoLists();
  setupChat();
  setupPhotoComposer();
  setupPhotoVideoList();
}

function setupPanelTabs() {
  const tabs = document.querySelectorAll(".nav-item[data-panel]");
  const pages = document.querySelectorAll(".panel-page");
  const dashboard = document.querySelector(".dashboard");
  if (!tabs.length || !pages.length) {
    return;
  }

  const setActive = (panel) => {
    for (let i = 0; i < tabs.length; i += 1) {
      const tab = tabs[i];
      const isActive = tab.getAttribute("data-panel") === panel;
      if (isActive) {
        tab.classList.add("is-active");
      } else {
        tab.classList.remove("is-active");
      }
    }
    for (let i = 0; i < pages.length; i += 1) {
      const page = pages[i];
      const isActive = page.getAttribute("data-panel") === panel;
      if (isActive) {
        page.classList.add("is-active");
      } else {
        page.classList.remove("is-active");
      }
    }

    const isStreet = panel === "street";
    if (dashboard) {
      if (isStreet) {
        dashboard.classList.add("is-map");
        dashboard.classList.remove("is-panel");
      } else {
        dashboard.classList.add("is-panel");
        dashboard.classList.remove("is-map");
      }
    }
    isSceneVisible = isStreet;
    if (typeof onResize === "function" && isStreet) {
      requestAnimationFrame(() => onResize());
    }
  };

  for (let i = 0; i < tabs.length; i += 1) {
    const tab = tabs[i];
    tab.addEventListener("click", () => {
      const panel = tab.getAttribute("data-panel");
      if (panel) {
        setActive(panel);
      }
    });
  }

  const defaultTab = document.querySelector(".nav-item.is-active") || tabs[0];
  if (defaultTab) {
    const panel = defaultTab.getAttribute("data-panel");
    if (panel) {
      setActive(panel);
    }
  }
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

  for (let i = 0; i < videoItems.length; i += 1) {
    const item = videoItems[i];
    item.addEventListener("click", () => {
      const src = item.getAttribute("data-video-src");
      const title = item.getAttribute("data-title") || item.textContent.trim();
      setActiveVideoItem(item);
      setVideoSource(src, title, true);
    });
  }

  const defaultItem =
    document.querySelector(".video-item.is-active") || videoItems[0];
  if (defaultItem) {
    const src = defaultItem.getAttribute("data-video-src");
    const title = defaultItem.getAttribute("data-title") || defaultItem.textContent.trim();
    setActiveVideoItem(defaultItem);
    setVideoSource(src, title, false);
  }
}

function setupVideoFilters() {
  if (!videoFilters || videoFilters.length === 0 || !videoItems || !videoList) {
    return;
  }

  const applyFilter = (filter) => {
    videoList.dataset.filter = filter;
    let firstVisible = null;
    for (let i = 0; i < videoItems.length; i += 1) {
      const item = videoItems[i];
      const type = item.getAttribute("data-video-type") || "";
      const match = type === filter;
      item.setAttribute("aria-hidden", match ? "false" : "true");
      if (match && !firstVisible) {
        firstVisible = item;
      }
    }

    const activeItem = document.querySelector(".video-item.is-active");
    if (firstVisible && (!activeItem || activeItem.getAttribute("aria-hidden") === "true")) {
      const src = firstVisible.getAttribute("data-video-src");
      const title =
        firstVisible.getAttribute("data-title") || firstVisible.textContent.trim();
      setActiveVideoItem(firstVisible);
      setVideoSource(src, title, false);
    }
  };

  for (let i = 0; i < videoFilters.length; i += 1) {
    const filterButton = videoFilters[i];
    filterButton.addEventListener("click", () => {
      const filter = filterButton.getAttribute("data-filter");
      if (!filter) {
        return;
      }
      for (let j = 0; j < videoFilters.length; j += 1) {
        if (videoFilters[j] === filterButton) {
          videoFilters[j].classList.add("is-active");
        } else {
          videoFilters[j].classList.remove("is-active");
        }
      }
      applyFilter(filter);
    });
  }

  const defaultFilter =
    document.querySelector(".video-filter.is-active") || videoFilters[0];
  if (defaultFilter) {
    const filter = defaultFilter.getAttribute("data-filter");
    if (filter) {
      applyFilter(filter);
    }
  }
}

function setupVideoUpload() {
  if (!videoElement || !videoOverlay || !videoShell) {
    return;
  }

  setupVideoFullscreen(videoElement, videoShell);

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

function setupScenarioVideoLists() {
  const cards = document.querySelectorAll(".scenario-card");
  if (!cards || cards.length === 0) {
    return;
  }

  for (let i = 0; i < cards.length; i += 1) {
    const card = cards[i];
    const videoId = card.getAttribute("data-video-target");
    const titleId = card.getAttribute("data-title-target");
    const video = videoId ? document.getElementById(videoId) : null;
    const title = titleId ? document.getElementById(titleId) : null;
    if (!video) {
      continue;
    }

    const isEmbed = video.tagName === "IFRAME";
    const items = card.querySelectorAll(".scenario-item");

    const setActiveItem = (activeItem) => {
      if (!items || items.length === 0) {
        return;
      }
      for (let j = 0; j < items.length; j += 1) {
        const item = items[j];
        if (item === activeItem) {
          item.classList.add("is-active");
        } else {
          item.classList.remove("is-active");
        }
      }
    };

    const setSource = (src, label, shouldPlay) => {
      if (!src) {
        return;
      }
      if (title && label) {
        title.textContent = label;
      }
      if (isEmbed) {
        video.src = src;
        return;
      }
      video.src = src;
      video.load();
      if (shouldPlay) {
        const playPromise = video.play();
        if (playPromise && typeof playPromise.catch === "function") {
          playPromise.catch(() => {});
        }
      }
    };

    if (items && items.length) {
      for (let j = 0; j < items.length; j += 1) {
        const item = items[j];
        item.addEventListener("click", () => {
          const src = item.getAttribute("data-video-src");
          const label = item.getAttribute("data-title") || item.textContent.trim();
          setActiveItem(item);
          setSource(src, label, true);
        });
      }

      const defaultItem =
        card.querySelector(".scenario-item.is-active") || items[0];
      if (defaultItem) {
        const src = defaultItem.getAttribute("data-video-src");
        const label =
          defaultItem.getAttribute("data-title") || defaultItem.textContent.trim();
        setActiveItem(defaultItem);
        setSource(src, label, false);
      }
    } else {
      const defaultSrc = video.getAttribute("data-default-src");
      if (defaultSrc) {
        const fallbackTitle = title ? title.textContent : "";
        setSource(defaultSrc, fallbackTitle, false);
      }
    }
  }
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
    const playPromise = videoElement.play();
    if (playPromise && typeof playPromise.catch === "function") {
      playPromise.catch(() => {});
    }
  }
}

function setActiveVideoItem(activeItem) {
  if (!videoItems || videoItems.length === 0) {
    return;
  }
  for (let i = 0; i < videoItems.length; i += 1) {
    const item = videoItems[i];
    if (item === activeItem) {
      item.classList.add("is-active");
    } else {
      item.classList.remove("is-active");
    }
  }
}

function getChatImageMaxSizeMb() {
  if (!chatImageInput) {
    return 3;
  }
  const raw = chatImageInput.getAttribute("data-max-size");
  const value = raw ? parseFloat(raw) : 3;
  if (!value) {
    return 3;
  }
  return value;
}

function setChatImagePreviewEmpty(text) {
  if (!chatImagePreview) {
    return;
  }
  chatImagePreview.classList.add("is-empty");
  if (chatImagePlaceholder) {
    chatImagePlaceholder.textContent = text || "未选择图片";
  }
  if (chatImageThumb) {
    chatImageThumb.removeAttribute("src");
  }
  if (chatImageName) {
    chatImageName.textContent = "";
  }
}

function setChatImagePreviewImage(dataUrl, name) {
  if (!chatImagePreview) {
    return;
  }
  chatImagePreview.classList.remove("is-empty");
  if (chatImagePlaceholder) {
    chatImagePlaceholder.textContent = "";
  }
  if (chatImageThumb) {
    chatImageThumb.src = dataUrl;
  }
  if (chatImageName) {
    chatImageName.textContent = name || "已选择图片";
  }
}

function clearChatImage() {
  presentationState.pendingImage = null;
  if (chatImageInput) {
    chatImageInput.value = "";
  }
  setChatImagePreviewEmpty("未选择图片");
}

function loadChatImage(file, maxSizeMb) {
  if (!file) {
    clearChatImage();
    return;
  }
  if (!file.type || file.type.indexOf("image/") !== 0) {
    setChatImagePreviewEmpty("仅支持图片格式");
    return;
  }
  const limit = maxSizeMb * 1024 * 1024;
  if (file.size > limit) {
    setChatImagePreviewEmpty(`图片过大，请小于 ${maxSizeMb}MB`);
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    const result = reader.result;
    if (typeof result !== "string") {
      setChatImagePreviewEmpty("图片读取失败");
      return;
    }
    presentationState.pendingImage = {
      dataUrl: result,
      name: file.name || "上传图片",
    };
    setChatImagePreviewImage(result, file.name);
  };
  reader.onerror = () => {
    setChatImagePreviewEmpty("图片读取失败");
  };
  reader.readAsDataURL(file);
}

function setupChat() {
  if (!chatForm || !chatLog || !chatInput || !chatStatus) {
    return;
  }

  const maxImageSizeMb = getChatImageMaxSizeMb();
  if (chatImageInput) {
    chatImageInput.addEventListener("change", () => {
      const file = chatImageInput.files && chatImageInput.files[0];
      loadChatImage(file, maxImageSizeMb);
    });
  }
  if (chatImageClear) {
    chatImageClear.addEventListener("click", () => {
      clearChatImage();
    });
  }
  setChatImagePreviewEmpty("未选择图片");

  const greeting = "你好，我是古文化街数字人导览员。想了解哪些打卡点？";
  appendChatMessage("assistant", greeting);
  presentationState.messages.push({ role: "assistant", content: greeting });

  chatForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const text = chatInput.value.trim();
    const pendingImage =
      presentationState.pendingImage && presentationState.pendingImage.dataUrl
        ? presentationState.pendingImage.dataUrl
        : null;
    if (!text && !pendingImage) {
      return;
    }
    appendChatMessage("user", text, pendingImage);
    presentationState.messages.push({
      role: "user",
      content: text,
      image: pendingImage,
    });
    chatInput.value = "";
    clearChatImage();
    chatInput.focus();
    setChatStatus("busy");
    chatInput.disabled = true;
    if (chatImageInput) {
      chatImageInput.disabled = true;
    }
    if (chatImageClear) {
      chatImageClear.disabled = true;
    }

    const thinking = appendChatMessage("assistant", "正在思考...");
    try {
      let replyText = "";
      let hasStreamed = false;
      const streamed = await requestChatReplyStream((delta, fullText) => {
        if (!hasStreamed) {
          hasStreamed = true;
          setChatStatus("speaking");
        }
        replyText = fullText;
        thinking.textContent = fullText;
      });
      if (!hasStreamed) {
        replyText = streamed;
        if (replyText) {
          setChatStatus("speaking");
          thinking.textContent = replyText;
        }
      }
      if (!replyText) {
        replyText = "暂时无法生成回答。";
        thinking.textContent = replyText;
      }
      presentationState.messages.push({ role: "assistant", content: replyText });
      setChatStatus("online");
    } catch (error) {
      console.warn("Streaming chat failed, fallback to non-stream.", error);
      try {
        const reply = await requestChatReply();
        const replyText = reply || "暂时无法生成回答。";
        presentationState.messages.push({ role: "assistant", content: replyText });
        setChatStatus("speaking");
        await typeAssistantReply(thinking, replyText);
        setChatStatus("online");
      } catch (fallbackError) {
        console.warn("Fallback chat failed.", fallbackError);
        thinking.textContent = "当前无法连接模型，请稍后再试。";
        setChatStatus("offline");
      }
    } finally {
      chatInput.disabled = false;
      if (chatImageInput) {
        chatImageInput.disabled = false;
      }
      if (chatImageClear) {
        chatImageClear.disabled = false;
      }
      chatInput.focus();
      scrollChatToBottom();
    }
  });
}

function appendChatMessage(role, text, imageUrl) {
  const message = document.createElement("div");
  message.className = `message ${role}`;
  const bubble = document.createElement("div");
  bubble.className = "bubble";
  let textNode = null;
  const hasText = text && text.trim().length > 0;
  const needsPlaceholder = role === "assistant" && !hasText;
  if (hasText || needsPlaceholder) {
    textNode = document.createElement("div");
    textNode.className = "bubble-text";
    textNode.textContent = hasText ? text : "";
    bubble.appendChild(textNode);
  } else if (imageUrl) {
    textNode = document.createElement("div");
    textNode.className = "bubble-text";
    textNode.textContent = "已发送图片";
    bubble.appendChild(textNode);
  }
  if (imageUrl) {
    const img = document.createElement("img");
    img.className = "bubble-image";
    img.src = imageUrl;
    img.alt = "上传图片";
    bubble.appendChild(img);
  }
  message.appendChild(bubble);
  chatLog.appendChild(message);
  scrollChatToBottom();
  return textNode || bubble;
}

function scrollChatToBottom() {
  chatLog.scrollTop = chatLog.scrollHeight;
}

function setChatStatus(state) {
  if (!chatStatus) {
    return;
  }
  chatStatus.classList.remove("is-busy", "is-offline", "is-speaking");
  setAvatarState(state);
  if (state === "busy") {
    chatStatus.textContent = "思考中";
    chatStatus.classList.add("is-busy");
  } else if (state === "speaking") {
    chatStatus.textContent = "讲解中";
    chatStatus.classList.add("is-speaking");
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
  if (state === "speaking") {
    avatar.classList.add("is-speaking");
  } else {
    avatar.classList.remove("is-speaking");
  }
  if (state === "offline") {
    avatar.classList.add("is-offline");
  } else {
    avatar.classList.remove("is-offline");
  }
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

function typeAssistantReply(target, text) {
  if (!target) {
    return Promise.resolve();
  }
  const fullText = text || "";
  if (!fullText.trim()) {
    target.textContent = fullText;
    return Promise.resolve();
  }

  target.textContent = "";
  const maxDuration = 3600;
  const minInterval = 14;
  const maxInterval = 38;
  const interval = Math.max(
    minInterval,
    Math.min(maxInterval, Math.floor(maxDuration / Math.max(fullText.length, 18)))
  );

  return new Promise((resolve) => {
    let index = 0;
    const step = () => {
      index += 1;
      target.textContent = fullText.slice(0, index);
      if (index % 8 === 0) {
        scrollChatToBottom();
      }
      if (index < fullText.length) {
        window.setTimeout(step, interval);
      } else {
        scrollChatToBottom();
        resolve();
      }
    };
    step();
  });
}

function buildChatPayloadMessages() {
  const history = presentationState.messages.slice(-10);
  const result = [];
  let imageIncluded = false;
  for (let i = history.length - 1; i >= 0; i -= 1) {
    const message = history[i];
    let image = message.image || null;
    if (image) {
      if (imageIncluded) {
        image = null;
      } else {
        imageIncluded = true;
      }
    }
    result.unshift({
      role: message.role,
      content: message.content || "",
      image: image,
    });
  }
  return result;
}

async function requestChatReply() {
  const payload = {
    messages: buildChatPayloadMessages(),
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

async function requestChatReplyStream(onToken) {
  const payload = {
    messages: buildChatPayloadMessages(),
    temperature: 0.7,
    max_tokens: 220,
  };

  const response = await fetch("/api/chat/stream", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok || !response.body) {
    throw new Error("stream unavailable");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  let fullText = "";

  const handleData = (data) => {
    if (!data) {
      return false;
    }
    if (data === "[DONE]") {
      return true;
    }
    let delta = "";
    try {
      const payloadData = JSON.parse(data);
      if (payloadData && payloadData.error) {
        throw new Error(payloadData.error);
      }
      const choice = payloadData.choices && payloadData.choices[0];
      if (choice && choice.delta && typeof choice.delta.content === "string") {
        delta = choice.delta.content;
      } else if (
        choice &&
        choice.message &&
        typeof choice.message.content === "string"
      ) {
        delta = choice.message.content;
      } else if (typeof payloadData.content === "string") {
        delta = payloadData.content;
      }
    } catch (error) {
      if (data && data !== "[DONE]") {
        delta = data;
      }
    }
    if (delta) {
      fullText += delta;
      if (typeof onToken === "function") {
        onToken(delta, fullText);
      }
    }
    return false;
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i].trim();
      if (!line || !line.startsWith("data:")) {
        continue;
      }
      const data = line.slice(5).trim();
      if (handleData(data)) {
        return fullText;
      }
    }
  }

  const tail = buffer.trim();
  if (tail.startsWith("data:")) {
    const data = tail.slice(5).trim();
    if (handleData(data)) {
      return fullText;
    }
  }

  return fullText;
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

  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => renderPhoto(ctx));
  } else {
    renderPhoto(ctx);
  }
}

function setupPhotoVideoList() {
  if (!photoVideoElement) {
    return;
  }

  if (!photoVideoItems || photoVideoItems.length === 0) {
    const defaultSrc = photoVideoElement.dataset.defaultSrc;
    if (defaultSrc) {
      const fallbackTitle = photoVideoTitle ? photoVideoTitle.textContent : "";
      setPhotoVideoSource(defaultSrc, fallbackTitle, false);
    }
    return;
  }

  for (let i = 0; i < photoVideoItems.length; i += 1) {
    const item = photoVideoItems[i];
    item.addEventListener("click", () => {
      const src = item.getAttribute("data-photo-video-src");
      const title = item.getAttribute("data-title") || item.textContent.trim();
      setActivePhotoVideoItem(item);
      setPhotoVideoSource(src, title, true);
    });
  }

  const defaultItem =
    document.querySelector(".photo-video-item.is-active") || photoVideoItems[0];
  if (defaultItem) {
    const src = defaultItem.getAttribute("data-photo-video-src");
    const title = defaultItem.getAttribute("data-title") || defaultItem.textContent.trim();
    setActivePhotoVideoItem(defaultItem);
    setPhotoVideoSource(src, title, false);
  }
}

function setPhotoVideoSource(src, title, shouldPlay) {
  if (!photoVideoElement || !src) {
    return;
  }
  if (photoVideoTitle && title) {
    photoVideoTitle.textContent = title;
  }
  photoVideoElement.src = src;
  photoVideoElement.load();
  if (shouldPlay) {
    const playPromise = photoVideoElement.play();
    if (playPromise && typeof playPromise.catch === "function") {
      playPromise.catch(() => {});
    }
  }
}

function setActivePhotoVideoItem(activeItem) {
  if (!photoVideoItems || photoVideoItems.length === 0) {
    return;
  }
  for (let i = 0; i < photoVideoItems.length; i += 1) {
    const item = photoVideoItems[i];
    if (item === activeItem) {
      item.classList.add("is-active");
    } else {
      item.classList.remove("is-active");
    }
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
