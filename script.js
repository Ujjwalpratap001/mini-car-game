import * as THREE from "three";

// =============================================
// VELOCITY X - 3D RACING GAME
// Static website: HTML + CSS + Three.js
// =============================================

const $ = (id) => document.getElementById(id);

const ui = {
  loading: $("loading"),
  hud: $("hud"),
  start: $("startScreen"),
  pause: $("pauseScreen"),
  finish: $("finishScreen"),
  countdown: $("countdown"),
  position: $("position"),
  lap: $("lap"),
  timer: $("timer"),
  speed: $("speed"),
  speedFill: $("speedFill"),
  gear: $("gear"),
  finishTitle: $("finishTitle"),
  finishMessage: $("finishMessage"),
  finishTime: $("finishTime")
};

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x91b5d2);
scene.fog = new THREE.Fog(0x91b5d2, 115, 290);

const camera = new THREE.PerspectiveCamera(
  62,
  window.innerWidth / window.innerHeight,
  0.1,
  600
);

const renderer = new THREE.WebGLRenderer({
  antialias: true,
  powerPreference: "high-performance"
});

renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.7));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;

$("game").prepend(renderer.domElement);

// ---------------------------------------------
// GAME SETTINGS
// ---------------------------------------------

const TRACK_X = 54;
const TRACK_Z = 34;
const ROAD_WIDTH = 13;
const TOTAL_LAPS = 3;
const MAX_SPEED = 67; // World units per second

const state = {
  mode: "menu",
  speed: 0,
  lane: 0,
  steer: 0,
  elapsed: 0,
  countdown: 3,
  countdownElapsed: 0,
  finished: false
};

const keys = {};
const racers = [];
let player;
let lastTime = 0;
let worldTime = 0;

// ---------------------------------------------
// LIGHTING
// ---------------------------------------------

scene.add(new THREE.HemisphereLight(0xe1efff, 0x586344, 2.1));

const sun = new THREE.DirectionalLight(0xfff2d9, 3.0);
sun.position.set(-45, 80, -30);
sun.castShadow = true;
sun.shadow.mapSize.set(1536, 1536);
sun.shadow.camera.left = -100;
sun.shadow.camera.right = 100;
sun.shadow.camera.top = 100;
sun.shadow.camera.bottom = -100;
sun.shadow.normalBias = 0.035;
scene.add(sun);

// ---------------------------------------------
// MATERIALS
// ---------------------------------------------

function material(color, roughness = 0.8, metalness = 0) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness,
    metalness
  });
}

const grassMat = material(0x496b47);
const roadMat = material(0x292e37, 0.94);
const curbRed = material(0xe84e50);
const curbWhite = material(0xf1f2e9);
const lineMat = material(0xe4e8ed);
const barrierMat = material(0xd3d8df, 0.7, 0.1);
const darkMat = material(0x151922, 0.7);
const glassMat = new THREE.MeshStandardMaterial({
  color: 0x172e43,
  roughness: 0.22,
  metalness: 0.3
});

// ---------------------------------------------
// WORLD HELPERS
// ---------------------------------------------

function addBox(parent, name, size, position, mat, options = {}) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(...size),
    mat
  );

  mesh.name = name;
  mesh.position.set(...position);
  mesh.castShadow = options.castShadow ?? true;
  mesh.receiveShadow = options.receiveShadow ?? true;

  parent.add(mesh);
  return mesh;
}

function addCylinder(parent, radius, height, position, mat) {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, height, 10),
    mat
  );

  mesh.position.set(...position);
  mesh.castShadow = true;
  parent.add(mesh);
  return mesh;
}

// Elliptical racing circuit.
// theta increases in the direction of travel.

function trackPoint(theta, offset = 0, height = 0) {
  const x = (TRACK_X + offset) * Math.cos(theta);
  const z = (TRACK_Z + offset) * Math.sin(theta);

  return new THREE.Vector3(x, height, z);
}

function trackYaw(theta) {
  return Math.atan2(
    -TRACK_X * Math.sin(theta),
    TRACK_Z * Math.cos(theta)
  );
}

function trackLengthApprox() {
  const a = TRACK_X;
  const b = TRACK_Z;

  return Math.PI * (
    3 * (a + b) -
    Math.sqrt((3 * a + b) * (a + 3 * b))
  );
}

const LAP_LENGTH = trackLengthApprox();

// ---------------------------------------------
// GROUND
// ---------------------------------------------

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(500, 500),
  grassMat
);

ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.16;
ground.receiveShadow = true;
scene.add(ground);

// Grass variation patches

for (let i = 0; i < 90; i++) {
  const x = (Math.random() - 0.5) * 230;
  const z = (Math.random() - 0.5) * 170;

  const insideTrack =
    (x * x) / (TRACK_X * TRACK_X) +
    (z * z) / (TRACK_Z * TRACK_Z);

  if (insideTrack > 1.8) {
    const patch = new THREE.Mesh(
      new THREE.CircleGeometry(1.5 + Math.random() * 4, 8),
      material(i % 2 ? 0x53764a : 0x405e3c)
    );

    patch.rotation.x = -Math.PI / 2;
    patch.position.set(x, -0.145, z);
    scene.add(patch);
  }
}

// ---------------------------------------------
// BUILD A SMOOTH ELLIPTICAL ROAD
// ---------------------------------------------

function createTrackRibbon(innerOffset, outerOffset, mat, y) {
  const vertices = [];
  const indices = [];
  const segments = 600;

  for (let i = 0; i <= segments; i++) {
    const theta = (i / segments) * Math.PI * 2;

    const inner = trackPoint(theta, innerOffset, y);
    const outer = trackPoint(theta, outerOffset, y);

    vertices.push(inner.x, inner.y, inner.z);
    vertices.push(outer.x, outer.y, outer.z);

    if (i < segments) {
      const a = i * 2;
      const b = a + 1;
      const c = a + 2;
      const d = a + 3;

      indices.push(a, c, b, b, c, d);
    }
  }

  const geometry = new THREE.BufferGeometry();

  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(vertices, 3)
  );

  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  const mesh = new THREE.Mesh(geometry, mat);
  mesh.receiveShadow = true;
  scene.add(mesh);

  return mesh;
}

// Main road and decorative curbs

createTrackRibbon(-ROAD_WIDTH / 2, ROAD_WIDTH / 2, roadMat, 0);

createTrackRibbon(
  -ROAD_WIDTH / 2 - 1.0,
  -ROAD_WIDTH / 2,
  curbRed,
  0.025
);

createTrackRibbon(
  ROAD_WIDTH / 2,
  ROAD_WIDTH / 2 + 1.0,
  curbWhite,
  0.025
);

// Broken white center line

const dashMat = material(0xd8dce0, 0.7);

for (let i = 0; i < 180; i++) {
  if (i % 2 !== 0) continue;

  const theta = (i / 180) * Math.PI * 2;
  const p = trackPoint(theta, 0, 0.055);

  const dash = new THREE.Mesh(
    new THREE.BoxGeometry(0.3, 0.025, 1.6),
    dashMat
  );

  dash.position.copy(p);
  dash.rotation.y = trackYaw(theta);
  scene.add(dash);
}

// ---------------------------------------------
// TRACK BARRIERS
// ---------------------------------------------

for (const side of [-1, 1]) {
  const offset = side * (ROAD_WIDTH / 2 + 2.2);

  for (let i = 0; i < 240; i++) {
    const theta = (i / 240) * Math.PI * 2;
    const p = trackPoint(theta, offset, 0.65);

    const barrier = new THREE.Mesh(
      new THREE.BoxGeometry(2.3, 1.1, 0.65),
      i % 5 === 0 ? curbRed : barrierMat
    );

    barrier.position.copy(p);
    barrier.rotation.y = trackYaw(theta);
    barrier.castShadow = true;
    barrier.receiveShadow = true;
    scene.add(barrier);
  }
}

// ---------------------------------------------
// START / FINISH LINE
// ---------------------------------------------

const startTheta = 0;

for (let i = 0; i < 18; i++) {
  const p = trackPoint(startTheta, -ROAD_WIDTH / 2 + i * ROAD_WIDTH / 18, 0.07);

  const tile = new THREE.Mesh(
    new THREE.BoxGeometry(ROAD_WIDTH / 18 + 0.02, 0.025, 1.3),
    (i + Math.floor(i / 2)) % 2 === 0
      ? curbWhite
      : darkMat
  );

  tile.position.copy(p);
  tile.rotation.y = trackYaw(startTheta);
  scene.add(tile);
}

// ---------------------------------------------
// TREES AND TRACKSIDE SCENERY
// ---------------------------------------------

const trunkMat = material(0x59422d);
const leaves = [
  material(0x234c36),
  material(0x315c3d),
  material(0x3c6945)
];

function createTree(x, z, scale = 1) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.scale.setScalar(scale);

  addCylinder(group, 0.25, 2.2, [0, 1.1, 0], trunkMat);

  for (let i = 0; i < 3; i++) {
    const crown = new THREE.Mesh(
      new THREE.ConeGeometry(1.5 - i * 0.22, 2.6, 7),
      leaves[i]
    );

    crown.position.y = 2.1 + i * 0.9;
    crown.castShadow = true;
    group.add(crown);
  }

  scene.add(group);
}

for (let i = 0; i < 100; i++) {
  const theta = Math.random() * Math.PI * 2;
  const offset = 16 + Math.random() * 37;

  const p = trackPoint(theta, offset);

  createTree(
    p.x + (Math.random() - 0.5) * 9,
    p.z + (Math.random() - 0.5) * 9,
    0.65 + Math.random() * 0.7
  );
}

// ---------------------------------------------
// GRANDSTANDS
// ---------------------------------------------

function createGrandstand(theta) {
  const p = trackPoint(theta, 20);
  const group = new THREE.Group();

  group.position.set(p.x, 0, p.z);
  group.rotation.y = trackYaw(theta);

  addBox(group, "stand-base", [24, 2.5, 5], [0, 1.25, 0],
    material(0x485363));

  for (let row = 0; row < 4; row++) {
    addBox(
      group,
      "stand-row",
      [24, 0.4, 1.15],
      [0, 2.6 + row * 0.65, -1.4 + row * 0.65],
      material(row % 2 ? 0x3b4658 : 0x586476)
    );
  }

  for (let i = 0; i < 12; i++) {
    addBox(
      group,
      "seat",
      [0.55, 0.3, 0.55],
      [-10.5 + i * 1.9, 3.1, -0.8],
      material(i % 2 ? 0x497fc4 : 0xc94b53)
    );
  }

  scene.add(group);
}

createGrandstand(1.9);
createGrandstand(4.4);

// ---------------------------------------------
// CREATE A SPORTS CAR
// ---------------------------------------------

function createCar(color, accentColor, isPlayer = false) {
  const root = new THREE.Group();
  const body = new THREE.Group();

  root.add(body);

  const paint = new THREE.MeshStandardMaterial({
    color,
    metalness: 0.72,
    roughness: 0.24
  });

  const accent = material(accentColor, 0.3, 0.5);

  // Low, wide sports-car body

  addBox(body, "lower-body", [2.25, 0.55, 4.3], [0, 0.65, 0], paint);

  addBox(body, "front-nose", [1.95, 0.35, 1.15], [0, 0.55, 1.9], paint);

  addBox(body, "hood", [1.75, 0.12, 1.6], [0, 0.95, 1.05], paint);

  // Roof and windshield

  addBox(body, "roof", [1.55, 0.6, 1.65], [0, 1.35, -0.25], paint);

  addBox(body, "windshield", [1.45, 0.42, 0.12], [0, 1.42, 0.62], glassMat);

  addBox(body, "rear-window", [1.4, 0.36, 0.12], [0, 1.4, -1.1], glassMat);

  // Accent stripe

  addBox(body, "racing-stripe", [0.15, 0.025, 2.7], [0, 1.025, 0.4], accent);

  // Front lights

  const headlightMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0xaadfff,
    emissiveIntensity: 1.7
  });

  addBox(body, "headlight-left", [0.48, 0.1, 0.1], [-0.68, 0.73, 2.13], headlightMat);
  addBox(body, "headlight-right", [0.48, 0.1, 0.1], [0.68, 0.73, 2.13], headlightMat);

  // Rear lights

  const rearLightMat = new THREE.MeshStandardMaterial({
    color: 0xff263e,
    emissive: 0xff001b,
    emissiveIntensity: 1.4
  });

  addBox(body, "rear-left", [0.48, 0.12, 0.08], [-0.7, 0.75, -2.16], rearLightMat);
  addBox(body, "rear-right", [0.48, 0.12, 0.08], [0.7, 0.75, -2.16], rearLightMat);

  // Wheels

  const wheels = [];
  const wheelMat = material(0x11141b, 0.9);
  const rimMat = material(0xb6c2d1, 0.28, 0.8);

  for (const x of [-1.08, 1.08]) {
    for (const z of [-1.35, 1.35]) {
      const wheel = new THREE.Group();
      wheel.position.set(x, 0.43, z);

      const tire = new THREE.Mesh(
        new THREE.CylinderGeometry(0.42, 0.42, 0.27, 20),
        wheelMat
      );

      tire.rotation.z = Math.PI / 2;
      wheel.add(tire);

      const rim = new THREE.Mesh(
        new THREE.CylinderGeometry(0.23, 0.23, 0.29, 12),
        rimMat
      );

      rim.rotation.z = Math.PI / 2;
      wheel.add(rim);

      body.add(wheel);
      wheels.push(wheel);
    }
  }

  // Rear spoiler

  addBox(body, "spoiler", [2.0, 0.12, 0.3], [0, 1.55, -1.9], accent);

  // Player headlights cast extra light

  if (isPlayer) {
    for (const side of [-0.65, 0.65]) {
      const light = new THREE.SpotLight(0xc8e5ff, 30, 28, 0.35, 0.65, 1.3);
      light.position.set(side, 0.85, 2.0);
      light.target.position.set(side, 0, 12);

      body.add(light);
      body.add(light.target);
    }
  }

  scene.add(root);

  return {
    root,
    body,
    wheels,
    isPlayer,
    color,
    theta: 0,
    lane: 0,
    speed: 0,
    progress: 0,
    finished: false
  };
}

// ---------------------------------------------
// THREE RACERS
// ---------------------------------------------

player = createCar(0x1479ed, 0x78f5ff, true);
player.theta = 0;
player.lane = -2.1;

const rivalOne = createCar(0xf2384e, 0xffc2ca);
rivalOne.theta = -0.095;
rivalOne.lane = 2.0;
rivalOne.speed = 37;

const rivalTwo = createCar(0xffc342, 0xffffff);
rivalTwo.theta = -0.18;
rivalTwo.lane = -2.0;
rivalTwo.speed = 39;

racers.push(player, rivalOne, rivalTwo);

// ---------------------------------------------
// CAR POSITION AND ORIENTATION
// ---------------------------------------------

function updateCarTransform(car) {
  const p = trackPoint(car.theta, car.lane, 0.08);

  car.root.position.copy(p);
  car.root.rotation.y = trackYaw(car.theta);

  // Small body movement adds a little arcade-racing feel.

  car.body.position.y = Math.sin(worldTime * 12 + car.theta * 5) * 0.025;

  for (const wheel of car.wheels) {
    wheel.rotation.x -= car.speed * 0.025;
  }
}

// ---------------------------------------------
// INPUT
// ---------------------------------------------

window.addEventListener("keydown", (event) => {
  const key = event.key.toLowerCase();

  if (
    ["arrowup", "arrowdown", "arrowleft", "arrowright", " "]
      .includes(key)
  ) {
    event.preventDefault();
  }

  keys[key] = true;

  if (key === "escape") {
    if (state.mode === "racing") pauseGame();
    else if (state.mode === "paused") resumeGame();
  }

  if (key === "r" && state.mode === "racing") resetPlayer();
});

window.addEventListener("keyup", (event) => {
  keys[event.key.toLowerCase()] = false;
});

window.addEventListener("blur", () => {
  for (const key in keys) keys[key] = false;
});

// Touch controls

function holdButton(id, key) {
  const button = $(id);

  const press = (event) => {
    event.preventDefault();
    keys[key] = true;
  };

  const release = (event) => {
    event.preventDefault();
    keys[key] = false;
  };

  button.addEventListener("pointerdown", press);
  button.addEventListener("pointerup", release);
  button.addEventListener("pointerleave", release);
  button.addEventListener("pointercancel", release);
}

holdButton("leftBtn", "a");
holdButton("rightBtn", "d");
holdButton("accelerateBtn", "w");
holdButton("brakeBtn", " ");

function resetPlayer() {
  player.theta = 0;
  player.lane = -2.1;
  player.speed = 0;
  state.speed = 0;
  state.steer = 0;
}

// ---------------------------------------------
// CAMERA
// ---------------------------------------------

const cameraTarget = new THREE.Vector3();
const cameraPosition = new THREE.Vector3();

function updateCamera(delta) {
  const p = player.root.position;
  const yaw = player.root.rotation.y;

  // Car front points along local +Z.

  const behindX = -Math.sin(yaw);
  const behindZ = -Math.cos(yaw);

  cameraPosition.set(
    p.x + behindX * 12,
    7.2,
    p.z + behindZ * 12
  );

  camera.position.lerp(
    cameraPosition,
    1 - Math.exp(-3.5 * delta)
  );

  cameraTarget.set(p.x, 1.2, p.z);
  camera.lookAt(cameraTarget);
}

// ---------------------------------------------
// RACE PROGRESS
// ---------------------------------------------

function getProgress(car) {
  let theta = car.theta % (Math.PI * 2);

  if (theta < 0) theta += Math.PI * 2;

  return theta / (Math.PI * 2);
}

function getRaceDistance(car) {
  return car.theta * LAP_LENGTH / (Math.PI * 2);
}

function updateRacePosition() {
  const sorted = [...racers].sort((a, b) => {
    const distanceA = a.finished ? Infinity : getRaceDistance(a);
    const distanceB = b.finished ? Infinity : getRaceDistance(b);

    if (a.finished && b.finished) return a.finishTime - b.finishTime;
    if (a.finished) return -1;
    if (b.finished) return 1;

    return distanceB - distanceA;
  });

  const rank = sorted.indexOf(player) + 1;
  ui.position.textContent = String(rank).padStart(2, "0");

  const lapsCompleted = Math.floor(player.theta / (Math.PI * 2));
  ui.lap.textContent = String(Math.min(lapsCompleted + 1, TOTAL_LAPS))
    .padStart(2, "0");
}

// ---------------------------------------------
// AI RACERS
// ---------------------------------------------

function updateAI(car, delta, difficulty) {
  if (car.finished) return;

  const targetSpeed = difficulty;

  car.speed += (targetSpeed - car.speed) * Math.min(delta * 0.8, 1);

  car.theta += (car.speed / LAP_LENGTH) * Math.PI * 2 * delta;

  // Slight natural lane movement

  car.lane += (
    Math.sin(worldTime * 0.45 + car.theta * 3) * 0.2 - car.lane * 0.02
  ) * delta;

  car.lane = THREE.MathUtils.clamp(car.lane, -3.7, 3.7);

  if (car.theta >= TOTAL_LAPS * Math.PI * 2) {
    car.theta = TOTAL_LAPS * Math.PI * 2;
    car.finished = true;
    car.finishTime = state.elapsed;
  }

  updateCarTransform(car);
}

// ---------------------------------------------
// PLAYER PHYSICS
// ---------------------------------------------

function updatePlayer(delta) {
  if (player.finished) return;

  const accelerating = keys.w || keys.arrowup;
  const braking = keys.s || keys.arrowdown || keys[" "];
  const left = keys.a || keys.arrowleft;
  const right = keys.d || keys.arrowright;

  if (accelerating) {
    state.speed += 25 * delta;
  } else {
    state.speed -= 5.5 * delta;
  }

  if (braking) {
    state.speed -= 38 * delta;
  }

  state.speed = THREE.MathUtils.clamp(state.speed, 0, MAX_SPEED);

  const steeringInput = (right ? 1 : 0) - (left ? 1 : 0);

  state.steer += (
    steeringInput - state.steer
  ) * Math.min(delta * 5, 1);

  const speedFactor = 0.35 + state.speed / MAX_SPEED;

  player.lane += state.steer * speedFactor * 9 * delta;

  player.lane = THREE.MathUtils.clamp(player.lane, -5.5, 5.5);

  // Reduce speed outside the comfortable racing line.

  if (Math.abs(player.lane) > ROAD_WIDTH * 0.34) {
    state.speed = Math.max(0, state.speed - 16 * delta);
  }

  player.speed = state.speed;

  const angularSpeed = state.speed / LAP_LENGTH * Math.PI * 2;

  player.theta += angularSpeed * delta;

  if (player.theta >= TOTAL_LAPS * Math.PI * 2) {
    player.theta = TOTAL_LAPS * Math.PI * 2;
    player.finished = true;
    player.finishTime = state.elapsed;
    finishRace();
  }

  updateCarTransform(player);
}

// ---------------------------------------------
// HUD
// ---------------------------------------------

function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;

  return (
    String(mins).padStart(2, "0") +
    ":" +
    secs.toFixed(1).padStart(4, "0")
  );
}

function updateHUD() {
  ui.speed.textContent = String(
    Math.round((state.speed / MAX_SPEED) * 240)
  ).padStart(3, "0");

  ui.speedFill.style.width =
    `${(state.speed / MAX_SPEED) * 100}%`;

  ui.gear.textContent =
    state.speed < 1 ? "N" : String(Math.min(6, Math.floor(state.speed / 12) + 1));

  ui.timer.textContent = formatTime(state.elapsed);

  updateRacePosition();
}

// ---------------------------------------------
// GAME FLOW
// ---------------------------------------------

function startGame() {
  if (state.mode === "countdown" || state.mode === "racing") return;

  resetRace();
  ui.start.classList.add("hidden");
  ui.pause.classList.add("hidden");
  ui.finish.classList.add("hidden");
  ui.hud.classList.remove("hidden");

  state.mode = "countdown";
  state.countdown = 3;
  state.countdownElapsed = 0;

  showCountdown();
}

function resetRace() {
  state.speed = 0;
  state.steer = 0;
  state.lane = 0;
  state.elapsed = 0;
  state.finished = false;

  player.theta = 0;
  player.lane = -2.1;
  player.speed = 0;
  player.finished = false;

  rivalOne.theta = -0.095;
  rivalOne.lane = 2;
  rivalOne.speed = 37;
  rivalOne.finished = false;

  rivalTwo.theta = -0.18;
  rivalTwo.lane = -2;
  rivalTwo.speed = 39;
  rivalTwo.finished = false;

  for (const car of racers) {
    car.finishTime = Infinity;
  }

  for (const key in keys) keys[key] = false;

  updateCarTransform(player);
  updateCarTransform(rivalOne);
  updateCarTransform(rivalTwo);
  updateHUD();
}

function showCountdown() {
  ui.countdown.classList.remove("hidden");
  ui.countdown.textContent = state.countdown;
  ui.countdown.style.animation = "none";
  void ui.countdown.offsetWidth;
  ui.countdown.style.animation = "";
}

function pauseGame() {
  if (state.mode !== "racing") return;

  state.mode = "paused";
  ui.pause.classList.remove("hidden");

  for (const key in keys) keys[key] = false;
}

function resumeGame() {
  if (state.mode !== "paused") return;

  ui.pause.classList.add("hidden");
  state.mode = "racing";
}

function finishRace() {
  state.mode = "finished";
  state.finished = true;

  const place = Number(ui.position.textContent);

  ui.finishTitle.innerHTML =
    place === 1 ? "YOU <span>WIN.</span>" : "RACE <span>COMPLETE.</span>";

  ui.finishMessage.textContent =
    place === 1
      ? "Perfect drive. You own the apex."
      : `You finished in position ${place} out of 3. Time to race again.`;

  ui.finishTime.textContent = formatTime(state.elapsed);
  ui.finish.classList.remove("hidden");
}

$("startBtn").addEventListener("click", startGame);
$("resumeBtn").addEventListener("click", resumeGame);
$("pauseBtn").addEventListener("click", pauseGame);
$("restartBtn").addEventListener("click", startGame);
$("playAgainBtn").addEventListener("click", startGame);

// ---------------------------------------------
// MAIN UPDATE LOOP
// ---------------------------------------------

function animate(timestamp) {
  requestAnimationFrame(animate);

  const delta = Math.min(
    lastTime ? (timestamp - lastTime) / 1000 : 0,
    0.04
  );

  lastTime = timestamp;
  worldTime += delta;

  if (state.mode === "countdown") {
    state.countdownElapsed += delta;

    const nextNumber = 3 - Math.floor(state.countdownElapsed);

    if (nextNumber !== state.countdown && nextNumber > 0) {
      state.countdown = nextNumber;
      showCountdown();
    }

    if (state.countdownElapsed >= 3) {
      ui.countdown.textContent = "GO!";
      state.mode = "racing";
    }
  } else if (state.mode === "racing") {
    state.elapsed += delta;

    updatePlayer(delta);
    updateAI(rivalOne, delta, 39.5);
    updateAI(rivalTwo, delta, 41);

    updateHUD();
  }

  // Keep the camera following the player even on menus.

  updateCamera(delta);

  renderer.render(scene, camera);
}

// ---------------------------------------------
// RESPONSIVE RENDERING
// ---------------------------------------------

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();

  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.7));
});

// ---------------------------------------------
// INITIALIZE
// ---------------------------------------------

updateCarTransform(player);
updateCarTransform(rivalOne);
updateCarTransform(rivalTwo);

camera.position.set(0, 45, 75);
camera.lookAt(0, 0, 0);

updateHUD();

requestAnimationFrame(animate);

setTimeout(() => {
  ui.loading.classList.add("hidden");
  ui.hud.classList.remove("hidden");
}, 1100);
