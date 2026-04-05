// ============================================
// ARTEMIS II — Nothing Tracker
// Three.js scene + real-time interpolation + HUD
// ============================================

import { ORION_DATA, MOON_DATA, MISSION_START, MISSION_END, LAUNCH_TIME } from './trajectory_data.js';

// ============================================
// CONSTANTS
// ============================================
const R_EARTH = 6371;
const R_MOON = 1737;
const SCALE = 1 / 1000;    // 1 unit = 1000 km

const MISSION_START_MS = new Date(MISSION_START).getTime();
const MISSION_END_MS = new Date(MISSION_END).getTime();
const LAUNCH_MS = new Date(LAUNCH_TIME).getTime();
const MISSION_DURATION_MS = MISSION_END_MS - MISSION_START_MS;

const orionTimes = ORION_DATA.map(p => new Date(p.t).getTime());
const moonTimes = MOON_DATA.map(p => new Date(p.t).getTime());

// ============================================
// MISSION PHASES & EVENTS
// ============================================
const PHASES = [
  { name: 'Launch & Ascent', start: '2026-04-01T17:47:00Z', end: '2026-04-02T02:00:00Z', color: '#D71921' },
  { name: 'Earth Orbit & Checkout', start: '2026-04-02T02:00:00Z', end: '2026-04-02T23:50:00Z', color: '#D4A843' },
  { name: 'Trans-Lunar Injection', start: '2026-04-02T23:50:00Z', end: '2026-04-03T02:00:00Z', color: '#5B9BF6' },
  { name: 'Trans-Lunar Coast', start: '2026-04-03T02:00:00Z', end: '2026-04-06T00:00:00Z', color: '#E8E8E8' },
  { name: 'Lunar Flyby', start: '2026-04-06T00:00:00Z', end: '2026-04-07T12:00:00Z', color: '#4A9E5C' },
  { name: 'Trans-Earth Coast', start: '2026-04-07T12:00:00Z', end: '2026-04-10T12:00:00Z', color: '#E8E8E8' },
  { name: 'Entry & Splashdown', start: '2026-04-10T12:00:00Z', end: '2026-04-10T23:56:00Z', color: '#D71921' },
];

const EVENTS = PHASES.map(p => ({ name: p.name, time: new Date(p.start).getTime() }));
EVENTS.push({ name: 'Splashdown', time: new Date('2026-04-10T23:56:00Z').getTime() });

// ============================================
// STATE
// ============================================
let simTime = Date.now();
let timeSpeed = 1;
let isPaused = false;
let lastRealTime = performance.now();
let activeCamera = 'overview';
let blinkState = true;
let prevDistEarth = 0;
let prevDistMoon = 0;
let isDraggingTimeline = false;

// ============================================
// THREE.JS SETUP
// ============================================
const container = document.getElementById('scene-container');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
container.appendChild(renderer.domElement);

// Cameras
const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100000);
camera.position.set(0, 250, 500);

const crewCamera = new THREE.PerspectiveCamera(60, 1, 0.01, 100000);

const controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 5;
controls.maxDistance = 3000;
controls.rotateSpeed = 0.5;

// ============================================
// LIGHTING — SUN
// ============================================
const SUN_DIR = new THREE.Vector3(1, 0.1, 0.3).normalize();
const SUN_DISTANCE = 2000;

const sunLight = new THREE.DirectionalLight(0xFFF5E6, 2.5);
sunLight.position.copy(SUN_DIR).multiplyScalar(SUN_DISTANCE);
scene.add(sunLight);

const ambientLight = new THREE.AmbientLight(0x223344, 0.12);
scene.add(ambientLight);

const hemiLight = new THREE.HemisphereLight(0x4477AA, 0x000000, 0.06);
scene.add(hemiLight);

// Sun visual
const sunGroup = new THREE.Group();
const sunCore = new THREE.Mesh(
  new THREE.SphereGeometry(12, 32, 32),
  new THREE.MeshBasicMaterial({ color: 0xFFFAF0 })
);
sunGroup.add(sunCore);

for (let i = 1; i <= 5; i++) {
  const glow = new THREE.Mesh(
    new THREE.SphereGeometry(12 + i * 10, 32, 32),
    new THREE.MeshBasicMaterial({
      color: i <= 2 ? 0xFFF5DD : 0xFFDD88,
      transparent: true,
      opacity: 0.08 / i,
      side: THREE.BackSide
    })
  );
  sunGroup.add(glow);
}
sunGroup.position.copy(SUN_DIR).multiplyScalar(SUN_DISTANCE);
scene.add(sunGroup);

// ============================================
// STARFIELD
// ============================================
function createStarfield() {
  const group = new THREE.Group();

  // 15k main stars
  const N = 15000;
  const pos = new Float32Array(N * 3);
  const col = new Float32Array(N * 3);

  for (let i = 0; i < N; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const r = 4000 + Math.random() * 2000;
    pos[i*3]   = r * Math.sin(phi) * Math.cos(theta);
    pos[i*3+1] = r * Math.sin(phi) * Math.sin(theta);
    pos[i*3+2] = r * Math.cos(phi);

    const t = Math.random();
    if (t < 0.6) { col[i*3]=0.95; col[i*3+1]=0.95; col[i*3+2]=1.0; }
    else if (t < 0.85) { col[i*3]=0.75; col[i*3+1]=0.85; col[i*3+2]=1.0; }
    else { col[i*3]=1.0; col[i*3+1]=0.88; col[i*3+2]=0.75; }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  group.add(new THREE.Points(geo, new THREE.PointsMaterial({
    size: 1.2, vertexColors: true, transparent: true, opacity: 0.85, sizeAttenuation: true
  })));

  // 6k milky way band
  const M = 6000;
  const mPos = new Float32Array(M * 3);
  const mCol = new Float32Array(M * 3);
  for (let i = 0; i < M; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.PI / 2 + (Math.random() - 0.5) * 0.5;
    const r = 4500 + Math.random() * 1500;
    mPos[i*3]   = r * Math.sin(phi) * Math.cos(theta);
    mPos[i*3+1] = r * Math.sin(phi) * Math.sin(theta);
    mPos[i*3+2] = r * Math.cos(phi);
    const c = 0.6 + Math.random() * 0.3;
    mCol[i*3] = c; mCol[i*3+1] = c*0.95; mCol[i*3+2] = c*1.05;
  }
  const mGeo = new THREE.BufferGeometry();
  mGeo.setAttribute('position', new THREE.BufferAttribute(mPos, 3));
  mGeo.setAttribute('color', new THREE.BufferAttribute(mCol, 3));
  group.add(new THREE.Points(mGeo, new THREE.PointsMaterial({
    size: 0.6, vertexColors: true, transparent: true, opacity: 0.4, sizeAttenuation: true
  })));

  return group;
}
scene.add(createStarfield());

// ============================================
// DOT-GRID SPHERE GENERATOR
// Creates a sphere made of points arranged in
// a lat/lon grid pattern — Nothing dot-matrix
// ============================================
function createDotSphere(radius, latSteps, lonSteps, baseColor, emissiveColor, opts = {}) {
  const group = new THREE.Group();
  const positions = [];
  const colors = [];
  const normals = [];

  const bR = ((baseColor >> 16) & 0xFF) / 255;
  const bG = ((baseColor >> 8) & 0xFF) / 255;
  const bB = (baseColor & 0xFF) / 255;

  // Generate points on sphere surface in grid pattern
  for (let lat = 0; lat <= latSteps; lat++) {
    const phi = (lat / latSteps) * Math.PI;
    const sinPhi = Math.sin(phi);
    const cosPhi = Math.cos(phi);

    // More longitude points near equator, fewer at poles (natural density)
    const lonCount = Math.max(6, Math.round(lonSteps * sinPhi));

    for (let lon = 0; lon < lonCount; lon++) {
      const theta = (lon / lonCount) * Math.PI * 2;

      const x = radius * sinPhi * Math.cos(theta);
      const y = radius * cosPhi;
      const z = radius * sinPhi * Math.sin(theta);

      positions.push(x, y, z);
      normals.push(sinPhi * Math.cos(theta), cosPhi, sinPhi * Math.sin(theta));
      colors.push(bR, bG, bB);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));

  // Main dot layer — responds to light
  const dotMat = new THREE.PointsMaterial({
    size: opts.dotSize || 1.0,
    vertexColors: true,
    transparent: true,
    opacity: opts.opacity || 0.9,
    sizeAttenuation: true,
  });

  const points = new THREE.Points(geo, dotMat);
  group.add(points);

  // Store for animation (sun illumination)
  group.userData = { geo, colors: new Float32Array(colors), normals, baseColor: [bR, bG, bB] };

  // Ultra-subtle wireframe underneath
  if (opts.wireSegments) {
    const wireMat = new THREE.LineBasicMaterial({
      color: baseColor, transparent: true, opacity: 0.04
    });

    // A few meridians
    for (let i = 0; i < opts.wireSegments; i++) {
      const angle = (i / opts.wireSegments) * Math.PI * 2;
      const pts = [];
      for (let j = 0; j <= 64; j++) {
        const p = (j / 64) * Math.PI;
        pts.push(new THREE.Vector3(
          radius * Math.sin(p) * Math.cos(angle),
          radius * Math.cos(p),
          radius * Math.sin(p) * Math.sin(angle)
        ));
      }
      group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), wireMat));
    }

    // A few parallels
    for (let i = 1; i < opts.wireSegments / 2; i++) {
      const p = (i / (opts.wireSegments / 2)) * Math.PI;
      const r = radius * Math.sin(p);
      const y = radius * Math.cos(p);
      const pts = [];
      for (let j = 0; j <= 64; j++) {
        const t = (j / 64) * Math.PI * 2;
        pts.push(new THREE.Vector3(r * Math.cos(t), y, r * Math.sin(t)));
      }
      group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), wireMat));
    }
  }

  return group;
}

// Update dot illumination based on sun direction (in local space)
function updateDotIllumination(dotGroup, sunDirLocal, darkFactor, brightFactor) {
  const ud = dotGroup.userData;
  if (!ud || !ud.geo) return;

  const posArr = ud.geo.attributes.position.array;
  const colAttr = ud.geo.attributes.color;
  const colArr = colAttr.array;
  const [bR, bG, bB] = ud.baseColor;
  const count = posArr.length / 3;

  const sx = sunDirLocal.x, sy = sunDirLocal.y, sz = sunDirLocal.z;

  for (let i = 0; i < count; i++) {
    const nx = ud.normals[i * 3];
    const ny = ud.normals[i * 3 + 1];
    const nz = ud.normals[i * 3 + 2];

    // Dot product with sun direction
    let dot = nx * sx + ny * sy + nz * sz;
    // Map from [-1,1] to [darkFactor, brightFactor]
    const illum = darkFactor + (brightFactor - darkFactor) * Math.max(0, dot);

    colArr[i * 3]     = bR * illum;
    colArr[i * 3 + 1] = bG * illum;
    colArr[i * 3 + 2] = bB * illum;
  }

  colAttr.needsUpdate = true;
}

// ============================================
// EARTH — Dot-grid sphere
// ============================================
const earthRadius = R_EARTH * SCALE;
const earthGroup = new THREE.Group();

const earthDots = createDotSphere(earthRadius, 60, 80, 0x4499FF, 0x112244, {
  dotSize: 1.1,
  opacity: 0.92,
  wireSegments: 12,
});
earthGroup.add(earthDots);

// Atmosphere layers
const atmosInner = new THREE.Mesh(
  new THREE.SphereGeometry(earthRadius * 1.02, 64, 64),
  new THREE.MeshBasicMaterial({ color: 0x4499FF, transparent: true, opacity: 0.05, side: THREE.FrontSide })
);
earthGroup.add(atmosInner);

const atmosOuter = new THREE.Mesh(
  new THREE.SphereGeometry(earthRadius * 1.08, 64, 64),
  new THREE.MeshBasicMaterial({ color: 0x3388DD, transparent: true, opacity: 0.03, side: THREE.BackSide })
);
earthGroup.add(atmosOuter);

const atmosRim = new THREE.Mesh(
  new THREE.SphereGeometry(earthRadius * 1.12, 64, 64),
  new THREE.MeshBasicMaterial({ color: 0x66BBFF, transparent: true, opacity: 0.018, side: THREE.BackSide })
);
earthGroup.add(atmosRim);

earthGroup.rotation.z = 23.4 * Math.PI / 180;
scene.add(earthGroup);

// ============================================
// MOON — Dot-grid sphere (gray)
// ============================================
const moonRadius = R_MOON * SCALE;
const moonGroup = new THREE.Group();

const moonDots = createDotSphere(moonRadius, 40, 50, 0xAAAAAA, 0x333333, {
  dotSize: 0.8,
  opacity: 0.88,
  wireSegments: 8,
});
moonGroup.add(moonDots);

// Subtle glow
const moonGlow = new THREE.Mesh(
  new THREE.SphereGeometry(moonRadius * 1.05, 32, 32),
  new THREE.MeshBasicMaterial({ color: 0x999988, transparent: true, opacity: 0.02, side: THREE.BackSide })
);
moonGroup.add(moonGlow);

scene.add(moonGroup);

// ============================================
// MOON ORBIT LINE
// ============================================
// Moon orbit as dotted yellow line (every 3rd point)
const moonOrbitDotPos = [];
for (let i = 0; i < MOON_DATA.length; i += 3) {
  const p = MOON_DATA[i];
  moonOrbitDotPos.push(p.x * SCALE, p.z * SCALE, -p.y * SCALE);
}
const moonOrbitGeo = new THREE.BufferGeometry();
moonOrbitGeo.setAttribute('position', new THREE.Float32BufferAttribute(moonOrbitDotPos, 3));
scene.add(new THREE.Points(moonOrbitGeo, new THREE.PointsMaterial({
  color: 0xD4A843, size: 0.5, transparent: true, opacity: 0.35, sizeAttenuation: true,
})));

// ============================================
// ORION — Red dot with glow
// ============================================
const orionGroup = new THREE.Group();

const orionDot = new THREE.Mesh(
  new THREE.SphereGeometry(0.8, 16, 16),
  new THREE.MeshBasicMaterial({ color: 0xD71921 })
);
orionGroup.add(orionDot);

for (let i = 1; i <= 4; i++) {
  orionGroup.add(new THREE.Mesh(
    new THREE.SphereGeometry(0.8 + i * 1.0, 16, 16),
    new THREE.MeshBasicMaterial({ color: 0xD71921, transparent: true, opacity: 0.12 / i, side: THREE.BackSide })
  ));
}

const orionLight = new THREE.PointLight(0xD71921, 0.5, 30);
orionGroup.add(orionLight);
scene.add(orionGroup);

// ============================================
// TRAJECTORY LINES
// ============================================
const trajPoints = ORION_DATA.map(p => new THREE.Vector3(p.x * SCALE, p.z * SCALE, -p.y * SCALE));

// Full path — yellow line (future/remaining trajectory)
const trajFuturePositions = new Float32Array(trajPoints.length * 3);
trajPoints.forEach((p, i) => { trajFuturePositions[i*3]=p.x; trajFuturePositions[i*3+1]=p.y; trajFuturePositions[i*3+2]=p.z; });
const trajFutureGeo = new THREE.BufferGeometry();
trajFutureGeo.setAttribute('position', new THREE.BufferAttribute(trajFuturePositions, 3));
const trajFutureLine = new THREE.Line(trajFutureGeo, new THREE.LineBasicMaterial({ color: 0xFFD000, transparent: true, opacity: 0.45 }));
scene.add(trajFutureLine);

// Completed portion — red
const trajCompPositions = new Float32Array(trajPoints.length * 3);
trajPoints.forEach((p, i) => { trajCompPositions[i*3]=p.x; trajCompPositions[i*3+1]=p.y; trajCompPositions[i*3+2]=p.z; });
const trajCompGeo = new THREE.BufferGeometry();
trajCompGeo.setAttribute('position', new THREE.BufferAttribute(trajCompPositions, 3));
trajCompGeo.setDrawRange(0, 0);
const trajCompLine = new THREE.Line(trajCompGeo, new THREE.LineBasicMaterial({ color: 0xD71921, transparent: true, opacity: 0.45 }));
scene.add(trajCompLine);

// Trail
const TRAIL_MAX = 80;
const trailPositions = new Float32Array(TRAIL_MAX * 3);
const trailGeo = new THREE.BufferGeometry();
trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPositions, 3));
trailGeo.setDrawRange(0, 0);
scene.add(new THREE.Line(trailGeo, new THREE.LineBasicMaterial({ color: 0xD71921, transparent: true, opacity: 0.6 })));

let trailIndex = 0, trailCount = 0, lastTrailTime = 0;

// Earth-Moon connection
const emLinePos = new Float32Array(6);
const emLineGeo = new THREE.BufferGeometry();
emLineGeo.setAttribute('position', new THREE.BufferAttribute(emLinePos, 3));
scene.add(new THREE.Line(emLineGeo, new THREE.LineBasicMaterial({ color: 0x333333, transparent: true, opacity: 0.12 })));

// ============================================
// INTERPOLATION
// ============================================
function lerp(a, b, t) { return a + (b - a) * t; }

function interpolateData(data, times, timeMs) {
  if (timeMs <= times[0]) return { ...data[0] };
  if (timeMs >= times[times.length - 1]) return { ...data[data.length - 1] };

  let lo = 0, hi = times.length - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (times[mid] <= timeMs) lo = mid; else hi = mid;
  }

  const t = (timeMs - times[lo]) / (times[hi] - times[lo]);
  const a = data[lo], b = data[hi];
  return {
    x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), z: lerp(a.z, b.z, t),
    vx: lerp(a.vx, b.vx, t), vy: lerp(a.vy, b.vy, t), vz: lerp(a.vz, b.vz, t),
  };
}

function toScene(p) {
  return new THREE.Vector3(p.x * SCALE, p.z * SCALE, -p.y * SCALE);
}

// ============================================
// HUD ELEMENTS
// ============================================
const metDays = document.getElementById('met-days');
const metHours = document.getElementById('met-hours');
const metMins = document.getElementById('met-mins');
const metSecs = document.getElementById('met-secs');
const phaseDisplay = document.getElementById('phase-display');
const separators = document.querySelectorAll('.met-separator');
const angularDisplay = document.getElementById('angular-display');
const angularValue = document.getElementById('angular-value');
const cockpitOverlay = document.getElementById('cockpit-overlay');
const cpAlt = document.getElementById('cp-alt');
const cpVel = document.getElementById('cp-vel');
const cpDistEarth = document.getElementById('cp-dist-earth');
const cpDistMoon = document.getElementById('cp-dist-moon');
const cpMet = document.getElementById('cp-met');
const cpPhase = document.getElementById('cp-phase');
const cpTarget = document.getElementById('cp-target');

// Body labels
const labelEarth = document.getElementById('label-earth');
const labelMoon = document.getElementById('label-moon');
const labelOrion = document.getElementById('label-orion');
const labelSun = document.getElementById('label-sun');
const labelEarthDetail = document.getElementById('label-earth-detail');
const labelMoonDetail = document.getElementById('label-moon-detail');
const labelOrionDetail = document.getElementById('label-orion-detail');
const tDistEarth = document.getElementById('t-dist-earth');
const tDistMoon = document.getElementById('t-dist-moon');
const tVelocity = document.getElementById('t-velocity');
const tAltitude = document.getElementById('t-altitude');
const tAngDiam = document.getElementById('t-ang-diam');
const nextEventName = document.getElementById('next-event-name');
const nextEventCountdown = document.getElementById('next-event-countdown');
const timelineProgress = document.getElementById('timeline-progress');
const timelineDot = document.getElementById('timeline-dot');
const utcClock = document.getElementById('utc-clock');
const countdownOverlay = document.getElementById('countdown-overlay');
const countdownValue = document.getElementById('countdown-value');

// ============================================
// FORMAT HELPERS
// ============================================
function pad2(n) { return String(Math.floor(n)).padStart(2, '0'); }

function formatDistance(km) {
  if (km >= 1e6) return (km / 1e6).toFixed(2) + '<span class="unit"> M KM</span>';
  if (km >= 1e3) return Math.round(km).toLocaleString('en-US') + '<span class="unit"> KM</span>';
  return km.toFixed(1) + '<span class="unit"> KM</span>';
}

function formatDistanceShort(km) {
  if (km >= 1e6) return (km / 1e6).toFixed(2) + ' M KM';
  if (km >= 1e3) return Math.round(km).toLocaleString('en-US') + ' KM';
  return km.toFixed(1) + ' KM';
}

function formatCountdown(ms) {
  const neg = ms < 0;
  ms = Math.abs(ms);
  const s = Math.floor(ms / 1000) % 60;
  const m = Math.floor(ms / 60000) % 60;
  const h = Math.floor(ms / 3600000) % 24;
  const d = Math.floor(ms / 86400000);
  const prefix = neg ? 'T-' : 'T+';
  return d > 0 ? `${prefix}${d}D ${pad2(h)}:${pad2(m)}:${pad2(s)}` : `${prefix}${pad2(h)}:${pad2(m)}:${pad2(s)}`;
}

function trendArrow(curr, prev) {
  const diff = curr - prev;
  if (Math.abs(diff) < 10) return '<span class="trend stable"> —</span>';
  return diff > 0 ? '<span class="trend up"> &#9650;</span>' : '<span class="trend down"> &#9660;</span>';
}

// ============================================
// PHASE HELPERS
// ============================================
function getCurrentPhase(t) {
  for (let i = PHASES.length - 1; i >= 0; i--)
    if (t >= new Date(PHASES[i].start).getTime()) return PHASES[i];
  return { name: 'Pre-Launch', color: '#666666' };
}

function getNextEvent(t) {
  for (const ev of EVENTS) if (ev.time > t) return ev;
  return EVENTS[EVENTS.length - 1];
}

// ============================================
// BUILD PHASES LIST
// ============================================
function buildPhasesList() {
  const list = document.getElementById('phases-list');
  PHASES.forEach(phase => {
    const row = document.createElement('div');
    row.className = 'telem-row';

    const left = document.createElement('span');
    left.className = 'telem-label';
    left.style.cssText = 'display:flex;align-items:center;gap:6px';

    const dot = document.createElement('span');
    dot.style.cssText = `width:6px;height:6px;border-radius:50%;background:${phase.color};flex-shrink:0;opacity:0.5;transition:all 200ms`;
    dot.id = `phase-dot-${phase.name.replace(/\s+/g, '-').toLowerCase()}`;
    left.appendChild(dot);
    left.appendChild(document.createTextNode(phase.name));

    const right = document.createElement('span');
    right.className = 'telem-value';
    right.style.cssText = 'font-size:11px;color:var(--text-disabled)';
    right.textContent = `APR ${new Date(phase.start).getUTCDate()}`;

    row.appendChild(left);
    row.appendChild(right);
    list.appendChild(row);
  });
}

// ============================================
// CAMERA PRESETS
// ============================================
function setCameraPreset(name) {
  activeCamera = name;
  document.querySelectorAll('.cam-btn').forEach(b => b.classList.toggle('active', b.dataset.cam === name));

  const isCrew = name === 'crew';
  controls.enabled = !isCrew;
  angularDisplay.classList.toggle('visible', isCrew);
  cockpitOverlay.classList.toggle('visible', isCrew);

  // Hide main HUD in crew POV for immersion
  document.getElementById('hud-top-left').style.display = isCrew ? 'none' : '';
  document.getElementById('hud-top-right').style.display = isCrew ? 'none' : '';
  document.getElementById('timeline').style.display = isCrew ? 'none' : '';

  if (name === 'overview') {
    camera.position.set(0, 250, 500);
    controls.target.set(0, 0, -150);
  } else if (name === 'earth') {
    camera.position.set(20, 15, 25);
    controls.target.set(0, 0, 0);
  } else if (name === 'sun') {
    camera.position.set(-20, 10, -15);
    controls.target.copy(SUN_DIR).multiplyScalar(200);
  }
}

// ============================================
// EVENT LISTENERS
// ============================================
document.querySelectorAll('.cam-btn').forEach(btn => {
  btn.addEventListener('click', () => setCameraPreset(btn.dataset.cam));
});

// Cockpit close button
document.getElementById('cockpit-close').addEventListener('click', () => {
  setCameraPreset('overview');
});

document.querySelectorAll('.time-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const speed = parseInt(btn.dataset.speed);
    if (speed === -1) {
      simTime = Date.now(); timeSpeed = 1; isPaused = false;
    } else if (speed === 0) {
      isPaused = !isPaused;
      btn.textContent = isPaused ? '▶' : '||';
    } else {
      timeSpeed = speed; isPaused = false;
      document.querySelector('.time-btn[data-speed="0"]').textContent = '||';
    }
    document.querySelectorAll('.time-btn:not([data-speed="0"]):not(#btn-reset)').forEach(b => {
      b.classList.toggle('active', parseInt(b.dataset.speed) === timeSpeed && !isPaused);
    });
  });
});

const timelineBar = document.getElementById('timeline-bar');
function scrubTimeline(e) {
  const rect = timelineBar.getBoundingClientRect();
  const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
  simTime = MISSION_START_MS + pct * MISSION_DURATION_MS;
  isPaused = true;
  document.querySelector('.time-btn[data-speed="0"]').textContent = '▶';
  document.querySelectorAll('.time-btn:not([data-speed="0"]):not(#btn-reset)').forEach(b => b.classList.remove('active'));
}

timelineBar.addEventListener('mousedown', e => { isDraggingTimeline = true; scrubTimeline(e); });
window.addEventListener('mousemove', e => { if (isDraggingTimeline) scrubTimeline(e); });
window.addEventListener('mouseup', () => { isDraggingTimeline = false; });

function onResize() {
  const w = container.clientWidth, h = container.clientHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  crewCamera.aspect = w / h;
  crewCamera.updateProjectionMatrix();
}
window.addEventListener('resize', onResize);

setInterval(() => {
  blinkState = !blinkState;
  separators.forEach(s => s.classList.toggle('blink-off', !blinkState));
}, 1000);

// ============================================
// LABEL PROJECTION — 3D to screen
// ============================================
const _projVec = new THREE.Vector3();

function projectLabel(labelEl, worldPos, cam, offsetY) {
  _projVec.copy(worldPos);
  _projVec.y += offsetY || 0;
  _projVec.project(cam);

  // Behind camera check
  if (_projVec.z > 1) {
    labelEl.style.opacity = '0';
    return;
  }

  const w = container.clientWidth;
  const h = container.clientHeight;
  const x = (_projVec.x * 0.5 + 0.5) * w;
  const y = (-_projVec.y * 0.5 + 0.5) * h;

  // Off-screen check
  if (x < -100 || x > w + 100 || y < -100 || y > h + 100) {
    labelEl.style.opacity = '0';
    return;
  }

  // Fade based on distance from center (less cluttered)
  const depth = _projVec.z;
  const opacity = Math.max(0.3, Math.min(1, 1 - depth * 0.5));

  labelEl.style.opacity = String(opacity);
  labelEl.style.transform = `translate(${x}px, ${y}px)`;
  labelEl.style.left = '0';
  labelEl.style.top = '0';
}

// ============================================
// TEMP VECTORS (reused each frame)
// ============================================
const _sunDirLocal = new THREE.Vector3();
const _invMatrix = new THREE.Matrix4();

// ============================================
// ANIMATION LOOP
// ============================================
let frameCount = 0;

function animate(now) {
  requestAnimationFrame(animate);
  frameCount++;

  const dt = now - lastRealTime;
  lastRealTime = now;
  if (!isPaused) simTime += dt * timeSpeed;

  const currentMs = simTime;
  const inMission = currentMs >= MISSION_START_MS && currentMs <= MISSION_END_MS;

  // Pre-mission countdown
  if (currentMs < MISSION_START_MS) {
    countdownOverlay.classList.add('visible');
    countdownValue.textContent = formatCountdown(MISSION_START_MS - currentMs);
  } else {
    countdownOverlay.classList.remove('visible');
  }

  // Interpolate positions
  const orionPos = interpolateData(ORION_DATA, orionTimes, currentMs);
  const moonPos = interpolateData(MOON_DATA, moonTimes, currentMs);

  const orionScene = toScene(orionPos);
  const moonScene = toScene(moonPos);

  orionGroup.position.copy(orionScene);
  moonGroup.position.copy(moonScene);

  // Earth rotation
  const daysSinceLaunch = (currentMs - LAUNCH_MS) / 86400000;
  earthGroup.rotation.y = daysSinceLaunch * Math.PI * 2 * (1 + 1/365.25);

  // Orion pulse
  orionLight.intensity = 0.3 + 0.2 * Math.sin(now * 0.003);

  // Earth-Moon line
  emLinePos[0]=0; emLinePos[1]=0; emLinePos[2]=0;
  emLinePos[3]=moonScene.x; emLinePos[4]=moonScene.y; emLinePos[5]=moonScene.z;
  emLineGeo.attributes.position.needsUpdate = true;

  // Trajectory completed (red) and remaining (yellow) portions
  if (inMission) {
    const idx = orionTimes.findIndex(t => t > currentMs);
    const splitIdx = idx >= 0 ? idx : trajPoints.length;
    trajCompGeo.setDrawRange(0, splitIdx);
    trajFutureGeo.setDrawRange(splitIdx, trajPoints.length - splitIdx);
  }

  // Trail
  if (inMission && currentMs - lastTrailTime > 180000) {
    const idx = (trailIndex % TRAIL_MAX) * 3;
    trailPositions[idx]=orionScene.x; trailPositions[idx+1]=orionScene.y; trailPositions[idx+2]=orionScene.z;
    trailIndex++; trailCount = Math.min(trailCount + 1, TRAIL_MAX);
    trailGeo.attributes.position.needsUpdate = true;
    trailGeo.setDrawRange(0, trailCount);
    lastTrailTime = currentMs;
  }

  // --- DOT ILLUMINATION (every 3 frames for perf) ---
  if (frameCount % 3 === 0) {
    // Earth: transform sun direction into earth's local space
    _invMatrix.copy(earthGroup.matrixWorld).invert();
    _sunDirLocal.copy(SUN_DIR).applyMatrix4(_invMatrix).normalize();
    updateDotIllumination(earthDots, _sunDirLocal, 0.08, 1.3);

    // Moon: transform sun direction into moon's local space
    _invMatrix.copy(moonGroup.matrixWorld).invert();
    _sunDirLocal.copy(SUN_DIR).applyMatrix4(_invMatrix).normalize();
    updateDotIllumination(moonDots, _sunDirLocal, 0.06, 1.2);
  }

  // Distances
  const distEarth = Math.sqrt(orionPos.x**2 + orionPos.y**2 + orionPos.z**2);
  const distMoon = Math.sqrt((orionPos.x-moonPos.x)**2 + (orionPos.y-moonPos.y)**2 + (orionPos.z-moonPos.z)**2);
  const velocity = Math.sqrt(orionPos.vx**2 + orionPos.vy**2 + orionPos.vz**2);
  const altitude = distEarth - R_EARTH;
  const angDiam = 2 * Math.atan(R_EARTH / distEarth) * (180 / Math.PI);

  // --- HUD updates (throttled ~10fps) ---
  if (frameCount % 6 === 0) {
    if (currentMs >= LAUNCH_MS) {
      const met = currentMs - LAUNCH_MS;
      metDays.textContent = pad2(Math.floor(met / 86400000));
      metHours.textContent = pad2(Math.floor((met % 86400000) / 3600000));
      metMins.textContent = pad2(Math.floor((met % 3600000) / 60000));
      metSecs.textContent = pad2(Math.floor((met % 60000) / 1000));
    }

    const phase = getCurrentPhase(currentMs);
    phaseDisplay.textContent = phase.name.toUpperCase();
    phaseDisplay.style.color = phase.color;

    PHASES.forEach(p => {
      const dot = document.getElementById(`phase-dot-${p.name.replace(/\s+/g, '-').toLowerCase()}`);
      if (dot) {
        const on = p.name === phase.name;
        dot.style.opacity = on ? '1' : '0.3';
        dot.style.boxShadow = on ? `0 0 8px ${p.color}` : 'none';
      }
    });

    tDistEarth.innerHTML = formatDistance(distEarth) + trendArrow(distEarth, prevDistEarth);
    tDistMoon.innerHTML = formatDistance(distMoon) + trendArrow(distMoon, prevDistMoon);
    tVelocity.innerHTML = velocity.toFixed(3) + '<span class="unit"> KM/S</span>';
    tAltitude.innerHTML = formatDistance(altitude);
    tAngDiam.innerHTML = angDiam.toFixed(2) + '<span class="unit"> DEG</span>';

    prevDistEarth = distEarth;
    prevDistMoon = distMoon;

    const nextEv = getNextEvent(currentMs);
    nextEventName.textContent = nextEv.name;
    nextEventCountdown.textContent = formatCountdown(-(nextEv.time - currentMs));

    angularValue.textContent = angDiam.toFixed(1) + '°';

    // Cockpit HUD
    if (activeCamera === 'crew') {
      cpAlt.textContent = formatDistanceShort(altitude);
      cpVel.textContent = velocity.toFixed(3) + ' KM/S';
      cpDistEarth.textContent = formatDistanceShort(distEarth);
      cpDistMoon.textContent = formatDistanceShort(distMoon);

      if (currentMs >= LAUNCH_MS) {
        const met = currentMs - LAUNCH_MS;
        const d = Math.floor(met / 86400000);
        const hh = pad2(Math.floor((met % 86400000) / 3600000));
        const mm = pad2(Math.floor((met % 3600000) / 60000));
        const ss = pad2(Math.floor((met % 60000) / 1000));
        cpMet.textContent = `T+${pad2(d)}:${hh}:${mm}:${ss}`;
      }

      const ph = getCurrentPhase(currentMs);
      cpPhase.textContent = ph.name.toUpperCase();
      cpTarget.textContent = distEarth < distMoon ? 'EARTH — CENTER' : 'MOON — APPROACH';
    }

    const pct = Math.max(0, Math.min(1, (currentMs - MISSION_START_MS) / MISSION_DURATION_MS));
    timelineProgress.style.width = (pct * 100) + '%';
    timelineDot.style.left = (pct * 100) + '%';

    utcClock.textContent = new Date(currentMs).toISOString().replace('T', ' ').substring(0, 19) + ' UTC';
  }

  // --- Project body labels ---
  const activeCam = activeCamera === 'crew' ? crewCamera : camera;
  if (activeCamera !== 'crew') {
    projectLabel(labelEarth, new THREE.Vector3(0, 0, 0), activeCam, earthRadius + 3);
    projectLabel(labelMoon, moonScene, activeCam, moonRadius + 2);
    projectLabel(labelOrion, orionScene, activeCam, 3);
    projectLabel(labelSun, sunGroup.position, activeCam, 30);

    // Update detail text
    labelOrionDetail.textContent = velocity.toFixed(2) + ' KM/S';
    labelMoonDetail.textContent = formatDistanceShort(distMoon) + ' FROM ORION';
    labelEarthDetail.textContent = formatDistanceShort(distEarth) + ' FROM ORION';
  } else {
    // Hide labels in crew POV
    labelEarth.style.opacity = '0';
    labelMoon.style.opacity = '0';
    labelOrion.style.opacity = '0';
    labelSun.style.opacity = '0';
  }

  // --- Hide Orion + trajectory elements in crew POV ---
  const inCrew = activeCamera === 'crew';
  orionGroup.visible = !inCrew;
  trajFutureLine.visible = !inCrew;
  trajCompLine.visible = !inCrew;

  // --- Camera ---
  if (activeCamera === 'follow') {
    camera.position.copy(orionScene).add(new THREE.Vector3(15, 10, 15));
    controls.target.copy(orionScene);
  } else if (activeCamera === 'moon') {
    camera.position.copy(moonScene).add(new THREE.Vector3(10, 8, 10));
    controls.target.copy(moonScene);
  } else if (activeCamera === 'crew') {
    crewCamera.position.copy(orionScene);
    crewCamera.lookAt(0, 0, 0);
  } else if (activeCamera === 'sun') {
    // Slowly orbit the sun view
    controls.target.copy(SUN_DIR).multiplyScalar(200);
  }

  controls.update();

  renderer.render(scene, activeCamera === 'crew' ? crewCamera : camera);
}

// ============================================
// INIT
// ============================================
function init() {
  onResize();
  buildPhasesList();

  const loading = document.getElementById('loading-overlay');
  setTimeout(() => {
    loading.classList.add('fade-out');
    setTimeout(() => loading.remove(), 600);
  }, 800);

  lastRealTime = performance.now();
  animate(lastRealTime);
}

init();
