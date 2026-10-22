/* ═══════════════════════════════════════════════════════════════════════════
   rack3d.js — The Rack view: a 3D lab room with the USRP racks and benches.

   One full-screen Three.js scene (#lab3d-stage):
     • Arena 1 / Arena 2 USRP racks against the back wall, in the same slot
       order as RACK_ORDER_AR1/AR2 (app.js). LEDs follow the last test;
       clicking a USRP opens it in the detail panel.
     • Radio / compute / test benches around the room (rack3d-data.js), with
       devices grouped by vendor and a coloured tag above each group.
       Clicking a bench flies to it and lists its devices.

   Mouse: left-drag orbits, right-drag (or Shift+left) moves across the floor,
   wheel zooms toward the cursor. The view buttons (#lab-views) fly the
   camera to a preset that fills the screen with that area.

   Reservations (reserve.js): clicking a USRP or a device opens its booking
   calendar; gear that is reserved right now glows green with an "In use"
   tag, and the catalog registered here drives the availability counts.

   Reads app.js globals: RACK_ORDER_AR1/AR2, usrpTestStatus, selectUsrp,
   closeDetailPanel and window._usrpAgg. app.js calls window.rack3d.enter()
   when the Rack view opens and window.rack3d.refresh() when mappings or
   test status change.

   Units: 1 world unit = 10 cm, so 1U = 0.445.
   ═══════════════════════════════════════════════════════════════════════════ */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { BENCHES, GROUPS, USRP_MODELS, USRP_BOOKING_STATUS } from './rack3d-data.js';
import { playIntro } from './intro.js';

const U = 0.445;
const ROOM_W = 64, ROOM_D = 48, ROOM_H = 26;
const HAZE = 0xe6eef5;              // horizon / fog colour

const usrpUnits = [];             // {ip, model, canvas, tex, body, front, led, mesh}
const benches = [];               // {bench, group}
const views = {};                 // name -> () => {pos, target}
const racks = [];                 // {ips, box} per rack, for flying to a USRP
const bookables = {};             // resource key -> {res, parts, anchor, offset, badge}
let selectedKey = null;            // resource key of the radio/device shown in the panel
let selMarker = null;              // its outline + pointer (see select())
let tipEl = null;
let anim = null;


/* ── Helpers ─────────────────────────────────────────────────────────────── */

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

function canvasTexture(canvas) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

const metal = (color, rough = 0.45, metalness = 0.7) =>
  new THREE.MeshStandardMaterial({ color, roughness: rough, metalness });

function box(w, h, d, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = m.receiveShadow = true;
  return m;
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

/** Floating pill label that always faces the camera. `h` is world height. */
function pill(text, { bg = '#202124', fg = '#ffffff', h = 1 } = {}) {
  const c = document.createElement('canvas');
  const g = c.getContext('2d');
  const font = '600 64px "Google Sans", Roboto, Arial, sans-serif';
  g.font = font;
  c.width = Math.ceil(g.measureText(text).width) + 72;
  c.height = 104;
  g.font = font;
  g.fillStyle = 'rgba(0,0,0,.18)';
  roundRect(g, 4, 10, c.width - 8, c.height - 14, 44); g.fill();
  g.fillStyle = bg;
  roundRect(g, 2, 2, c.width - 8, c.height - 14, 44); g.fill();
  g.fillStyle = fg;
  g.textBaseline = 'middle';
  g.fillText(text, 34, c.height / 2 - 4);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: canvasTexture(c), depthWrite: false }));
  s.scale.set(h * c.width / c.height, h, 1);
  s.renderOrder = 10;
  return s;
}

function showTip(ev, html) {
  if (!tipEl) {
    tipEl = document.createElement('div');
    tipEl.className = 'rack3d-tip';
    document.body.appendChild(tipEl);
  }
  if (!html) { tipEl.style.display = 'none'; return; }
  tipEl.innerHTML = html;
  tipEl.style.display = 'block';
  tipEl.style.left = (ev.clientX + 14) + 'px';
  tipEl.style.top  = (ev.clientY + 14) + 'px';
}


/* ── Stage ───────────────────────────────────────────────────────────────── */

const container = document.getElementById('lab3d-stage');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
container.appendChild(renderer.domElement);
const canvas = renderer.domElement;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(HAZE, 180, 520);
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;

scene.add(new THREE.HemisphereLight(0xffffff, 0xd5d9de, 1.0));
const sun = new THREE.DirectionalLight(0xffffff, 1.5);
sun.position.set(22, 46, 30);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -42, right: 42, top: 36, bottom: -36, near: 1, far: 120 });
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.02;
scene.add(sun);

const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 1200);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.screenSpacePanning = false;      // right-drag slides across the floor
controls.zoomToCursor = true;
controls.zoomSpeed = 1.1;
controls.minDistance = 3;
controls.maxDistance = 150;
controls.maxPolarAngle = Math.PI * 0.49;
controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };

/** Screen px of the 3D view hidden behind the open detail panel (final width,
 *  so it is right even while the panel is still sliding in). */
function panelCover() {
  const p = document.getElementById('detail-panel');
  if (!p || !p.classList.contains('open')) return 0;
  return Math.min(p.getBoundingClientRect().width, container.clientWidth * 0.7);
}

// While the panel is open, shift the projection so the scene is centred in
// the visible area instead of half-hidden behind the panel. Eased per frame.
let viewShift = 0;
function updateViewShift() {
  const W = container.clientWidth, H = container.clientHeight;
  if (!W || !H) return;
  const target = panelCover() / 2;
  viewShift += (target - viewShift) * 0.14;
  if (Math.abs(target - viewShift) < 0.3) viewShift = target;
  if (viewShift > 0.3) camera.setViewOffset(W, H, viewShift, 0, W, H);
  else if (camera.view && camera.view.enabled) camera.clearViewOffset();
}

function resize() {
  const w = container.clientWidth, h = container.clientHeight;
  if (!w || !h) return;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(container);

// Any manual input cancels a camera flight in progress.
['pointerdown', 'wheel'].forEach(ev => canvas.addEventListener(ev, () => { anim = null; }, { passive: true }));
canvas.addEventListener('contextmenu', e => e.preventDefault());


/* ── Camera framing + flights ────────────────────────────────────────────── */

/** Camera position looking along -dir at `box` that just fills the screen. */
function fitBox(box, dir, pad = 0.88) {
  const center = box.getCenter(new THREE.Vector3());
  const d = dir.clone().normalize();
  const corners = [];
  for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z])
    corners.push(new THREE.Vector3(x, y, z));
  // Fit into the part of the screen the detail panel doesn't cover.
  const cam = camera.clone();
  cam.clearViewOffset();
  const W = container.clientWidth || 1, H = container.clientHeight || 1;
  cam.aspect = Math.max(0.3, (W - panelCover()) / H);
  cam.updateProjectionMatrix();
  let lo = 1, hi = 500;
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    cam.position.copy(center).addScaledVector(d, mid);
    cam.lookAt(center);
    cam.updateMatrixWorld();
    const fits = corners.every(c => {
      const p = c.clone().project(cam);
      return Math.abs(p.x) <= pad && Math.abs(p.y) <= pad && p.z < 1;
    });
    if (fits) hi = mid; else lo = mid;
  }
  return { pos: center.clone().addScaledVector(d, hi), target: center };
}

const ease = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

function flyTo(view, { dur = 1.1, delay = 0, from = null } = {}) {
  if (from) {
    camera.position.copy(from.pos);
    controls.target.copy(from.target);
  }
  anim = {
    p0: camera.position.clone(), t0: controls.target.clone(),
    p1: view.pos, t1: view.target,
    start: performance.now() / 1000 + delay, dur,
  };
}

function stepAnim(now) {
  if (!anim) return;
  const k = Math.min(1, Math.max(0, (now - anim.start) / anim.dur));
  const e = ease(k);
  camera.position.lerpVectors(anim.p0, anim.p1, e);
  controls.target.lerpVectors(anim.t0, anim.t1, e);
  if (k >= 1) anim = null;
}

function goView(name, opts) {
  if (!views[name]) return;
  flyTo(views[name](), opts);
  if (location.hash.startsWith('#rack'))
    history.replaceState(null, '', name === 'overview' ? '#rack' : '#rack/' + name);
  document.querySelectorAll('#lab-views .seg').forEach(b => b.classList.toggle('active', b.dataset.view === name));
}


/* ── Room ────────────────────────────────────────────────────────────────── */

function tileTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#eceef1'; g.fillRect(0, 0, 256, 256);
  g.fillStyle = '#e4e7eb'; g.fillRect(0, 0, 128, 128); g.fillRect(128, 128, 128, 128);
  g.strokeStyle = '#d3d7dc'; g.lineWidth = 3; g.strokeRect(0, 0, 256, 256);
  g.beginPath(); g.moveTo(128, 0); g.lineTo(128, 256); g.moveTo(0, 128); g.lineTo(256, 128); g.stroke();
  const t = canvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(ROOM_W / 12, ROOM_D / 12);          // 60 cm tiles
  return t;
}

/** Tinted floor zone with an outline and a painted label at its front edge. */
function floorZone(w, d, color, label) {
  const g = new THREE.Group();
  const fill = new THREE.Mesh(new THREE.PlaneGeometry(w, d),
    new THREE.MeshStandardMaterial({ color, transparent: true, opacity: 0.08, depthWrite: false }));
  fill.rotation.x = -Math.PI / 2;
  fill.receiveShadow = true;
  g.add(fill);
  const edge = new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-w / 2, 0, -d / 2), new THREE.Vector3(w / 2, 0, -d / 2),
      new THREE.Vector3(w / 2, 0, d / 2), new THREE.Vector3(-w / 2, 0, d / 2)]),
    new THREE.LineBasicMaterial({ color }));
  edge.position.y = 0.01;
  g.add(edge);

  const c = document.createElement('canvas');
  c.width = 1024; c.height = 128;
  const ctx = c.getContext('2d');
  ctx.font = '700 72px "Google Sans", Roboto, Arial, sans-serif';
  ctx.fillStyle = new THREE.Color(color).getStyle();
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(label.toUpperCase(), 512, 64);
  const text = new THREE.Mesh(new THREE.PlaneGeometry(8, 1),
    new THREE.MeshBasicMaterial({ map: canvasTexture(c), transparent: true, depthWrite: false }));
  text.rotation.x = -Math.PI / 2;
  text.position.set(0, 0.02, d / 2 - 0.9);
  g.add(text);
  return g;
}

function whiteboard() {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, 1024, 512);
  g.fillStyle = '#1a73e8'; g.font = '700 96px "Google Sans", Roboto, Arial, sans-serif';
  g.fillText('INSI Lab', 60, 150);
  g.fillStyle = '#5f6368'; g.font = '500 44px "Google Sans", Roboto, Arial, sans-serif';
  g.fillText('Boston · EXP', 64, 220);
  g.strokeStyle = '#34a853'; g.lineWidth = 6; g.beginPath();
  for (let i = 0; i <= 80; i++) g.lineTo(60 + i * 11, 400 - Math.exp(-((i - 40) ** 2) / 40) * 120 - Math.sin(i) * 6);
  g.stroke();
  const grp = new THREE.Group();
  grp.add(box(14.4, 7.4, 0.2, metal(0xb0b6be, 0.4, 0.8)));
  const face = new THREE.Mesh(new THREE.PlaneGeometry(14, 7),
    new THREE.MeshStandardMaterial({ map: canvasTexture(c), roughness: 0.3 }));
  face.position.z = 0.11;
  grp.add(face);
  return grp;
}

/* Windows per wall: [centre along the wall, width]. Sill/head heights shared.
   Kept clear of the racks, the whiteboard and the bench labels. */
const WIN_Y0 = 10.5, WIN_Y1 = 21;
const WALLS = [
  { w: ROOM_W, x: 0, z: -ROOM_D / 2, ry: 0,            windows: [[-21, 14], [0, 10]] },         // back
  { w: ROOM_W, x: 0, z:  ROOM_D / 2, ry: Math.PI,      windows: [] },   // front (camera side)
  { w: ROOM_D, x: -ROOM_W / 2, z: 0, ry:  Math.PI / 2, windows: [[-14, 10], [0, 10], [14, 10]] }, // left
  { w: ROOM_D, x:  ROOM_W / 2, z: 0, ry: -Math.PI / 2, windows: [[-14, 10], [0, 10], [14, 10]] }, // right
];

/** Wall plane with rectangular window openings, in the wall's local XY. */
function wallGeometry(w, windows) {
  const shape = new THREE.Shape();
  shape.moveTo(-w / 2, 0); shape.lineTo(w / 2, 0); shape.lineTo(w / 2, ROOM_H); shape.lineTo(-w / 2, ROOM_H);
  shape.closePath();
  windows.forEach(([u, ww]) => {
    const h = new THREE.Path();
    h.moveTo(u - ww / 2, WIN_Y0); h.lineTo(u - ww / 2, WIN_Y1); h.lineTo(u + ww / 2, WIN_Y1); h.lineTo(u + ww / 2, WIN_Y0);
    h.closePath();
    shape.holes.push(h);
  });
  return new THREE.ShapeGeometry(shape);
}

/** Frame, mullions, sill and glass for one window opening (wall-local). */
function windowFrame(u, ww, frameMat, glassMat) {
  const g = new THREE.Group();
  const hh = WIN_Y1 - WIN_Y0, cy = (WIN_Y0 + WIN_Y1) / 2, t = 0.35, d = 0.5;
  g.add(box(ww + t, t, d, frameMat, u, WIN_Y1, 0));                 // head
  g.add(box(ww + t, t, d, frameMat, u, WIN_Y0, 0));                 // sill
  g.add(box(t, hh, d, frameMat, u - ww / 2, cy, 0));                // jambs
  g.add(box(t, hh, d, frameMat, u + ww / 2, cy, 0));
  g.add(box(0.18, hh, 0.25, frameMat, u, cy, 0));                   // mullions
  g.add(box(ww, 0.18, 0.25, frameMat, u, WIN_Y0 + hh * 0.62, 0));
  g.add(box(ww + 1.2, 0.2, 1.1, frameMat, u, WIN_Y0 - 0.2, 0.45));  // inner ledge
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(ww, hh), glassMat);
  glass.position.set(u, cy, 0);
  g.add(glass);
  g.traverse(o => { o.castShadow = false; });
  return g;
}

function buildRoom() {
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(ROOM_W, ROOM_D),
    new THREE.MeshStandardMaterial({ map: tileTexture(), roughness: 0.8 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  // Inward-facing walls: from outside they are back-face culled, so the room
  // reads like a dollhouse from any angle.
  const wallMat  = new THREE.MeshStandardMaterial({ color: 0xfafbfc, roughness: 0.95 });
  const trim     = new THREE.MeshStandardMaterial({ color: 0xc9ced4, roughness: 0.6 });
  const frameMat = metal(0xdfe3e8, 0.45, 0.4);
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0xd6ecff, transparent: true, opacity: 0.16, roughness: 0.05, metalness: 0.1,
    side: THREE.DoubleSide, depthWrite: false,
  });
  WALLS.forEach(wd => {
    const inward = new THREE.Vector3(Math.sin(wd.ry), 0, Math.cos(wd.ry));
    const wall = new THREE.Mesh(wallGeometry(wd.w, wd.windows), wallMat);
    wall.position.set(wd.x, 0, wd.z);
    wall.rotation.y = wd.ry;
    wall.receiveShadow = true;
    scene.add(wall);
    const base = new THREE.Mesh(new THREE.PlaneGeometry(wd.w, 0.6), trim);
    base.position.set(wd.x, 0.3, wd.z).addScaledVector(inward, 0.02);
    base.rotation.y = wd.ry;
    scene.add(base);
    const frames = new THREE.Group();
    wd.windows.forEach(([u, ww]) => frames.add(windowFrame(u, ww, frameMat, glassMat)));
    frames.position.set(wd.x, 0, wd.z);
    frames.rotation.y = wd.ry;
    scene.add(frames);
  });

  const wb = whiteboard();
  wb.position.set(21, 12, -ROOM_D / 2 + 0.15);
  scene.add(wb);
}


/* ── Outside: grass, trees, the Charles and a Back Bay skyline ──────────── */

/** Deterministic pseudo-random so the skyline is the same on every load. */
function rng(seed) {
  return () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
}

function skyTexture() {
  const c = document.createElement('canvas');
  c.width = 4; c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#8fbfea');
  grad.addColorStop(0.55, '#cfe3f5');
  grad.addColorStop(1, '#eef3f8');
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 256);
  return canvasTexture(c);
}

function facadeTexture(base, glass, lit) {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = base; g.fillRect(0, 0, 64, 64);
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
    g.fillStyle = (x + y * 3) % 7 === 0 ? lit : glass;
    g.fillRect(x * 16 + 3, y * 16 + 4, 10, 9);
  }
  const t = canvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

const FACADES = [
  ['#d9d4cc', '#9fb3c4', '#f3e6c4'],     // limestone
  ['#c9a78f', '#8ea2b2', '#f0dfba'],     // brick brownstone
  ['#e4e7ea', '#7fa6c9', '#dfe9f2'],     // pale concrete
  ['#b8c9d9', '#6f93b8', '#c9dcee'],     // glass
];

function building(w, h, d, facade, x, z, ry = 0) {
  const tex = facade.clone();
  tex.needsUpdate = true;
  tex.repeat.set(Math.max(1, Math.round(w / 6)), Math.max(1, Math.round(h / 6)));
  const side = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7 });
  const roof = new THREE.MeshStandardMaterial({ color: 0xb5bbc2, roughness: 0.9 });
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [side, side, roof, roof, side, side]);
  m.position.set(x, h / 2, z);
  m.rotation.y = ry;
  return m;
}

function tree(x, z, s, r) {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.35 * s, 0.5 * s, 4 * s, 7),
    new THREE.MeshStandardMaterial({ color: 0x8b6b4a, roughness: 1 }));
  trunk.position.y = 2 * s;
  g.add(trunk);
  const greens = [0x7fb069, 0x6a9f58, 0x93c47d, 0x5c8f4c];
  for (let i = 0; i < 3; i++) {
    const blob = new THREE.Mesh(new THREE.IcosahedronGeometry((2.4 - i * 0.45) * s, 1),
      new THREE.MeshStandardMaterial({ color: greens[Math.floor(r() * greens.length)], roughness: 0.9, flatShading: true }));
    blob.position.set((r() - 0.5) * 1.6 * s, (5 + i * 1.6) * s, (r() - 0.5) * 1.6 * s);
    g.add(blob);
  }
  g.position.set(x, 0, z);
  return g;
}

function buildOutdoors() {
  const r = rng(7);
  const grass = new THREE.Mesh(new THREE.CircleGeometry(900, 64),
    new THREE.MeshStandardMaterial({ color: 0xcfe2bf, roughness: 1 }));
  grass.rotation.x = -Math.PI / 2;
  grass.position.y = -0.06;
  grass.receiveShadow = true;
  scene.add(grass);

  const walk = new THREE.Mesh(new THREE.PlaneGeometry(ROOM_W + 14, ROOM_D + 14),
    new THREE.MeshStandardMaterial({ color: 0xe6e8eb, roughness: 0.95 }));
  walk.rotation.x = -Math.PI / 2;
  walk.position.y = -0.03;
  walk.receiveShadow = true;
  scene.add(walk);

  // The Charles, between the lab and the Back Bay skyline.
  const river = new THREE.Mesh(new THREE.PlaneGeometry(1200, 46),
    new THREE.MeshStandardMaterial({ color: 0x8fbcd9, roughness: 0.15, metalness: 0.2 }));
  river.rotation.x = -Math.PI / 2;
  river.position.set(0, -0.02, -110);
  scene.add(river);

  // Trees: around the building, along the Esplanade, kept out of the
  // front approach so they never block the overview camera.
  const trees = new THREE.Group();
  const front = (x, z) => z > 20 && Math.abs(x) < 60;
  for (let i = 0; i < 70; i++) {
    const a = r() * Math.PI * 2, dist = 44 + r() * 46;
    const x = Math.cos(a) * dist, z = Math.sin(a) * dist;
    if (front(x, z) || z < -84) continue;
    trees.add(tree(x, z, 1.1 + r() * 0.9, r));
  }
  for (let x = -260; x <= 260; x += 14 + r() * 8) trees.add(tree(x, -82 + r() * 4, 1.2 + r() * 0.6, r));
  scene.add(trees);

  // Skyline. Facades are shared textures; buildings are cheap boxes.
  const facades = FACADES.map(f => facadeTexture(...f));
  const city = new THREE.Group();
  for (let i = 0; i < 70; i++) {                               // Back Bay across the river
    const x = -300 + r() * 600, z = -150 - r() * 120;
    const near = Math.abs(x + 40) < 90;                          // taller downtown core
    const h = (near ? 30 : 14) + r() * (near ? 60 : 30);
    city.add(building(10 + r() * 16, h, 10 + r() * 16, facades[Math.floor(r() * 4)], x, z, (r() - 0.5) * 0.3));
  }
  for (const side of [-1, 1]) for (let i = 0; i < 26; i++) {    // lower blocks to either side
    const x = side * (120 + r() * 140), z = -60 + r() * 200;
    city.add(building(12 + r() * 14, 10 + r() * 26, 12 + r() * 14, facades[Math.floor(r() * 3)], x, z, (r() - 0.5) * 0.4));
  }
  // Landmarks: the Prudential and the Hancock.
  city.add(building(20, 150, 20, facades[2], -55, -185));
  const mast = box(1.2, 26, 1.2, metal(0x9aa0a6), -55, 163, -185);
  mast.castShadow = false;
  city.add(mast);
  const hancock = new THREE.Mesh(new THREE.BoxGeometry(12, 170, 34),
    new THREE.MeshStandardMaterial({ color: 0x9ec3e6, roughness: 0.08, metalness: 0.9 }));
  hancock.position.set(-10, 85, -200);
  hancock.rotation.y = 0.5;
  city.add(hancock);
  city.traverse(o => { o.castShadow = false; });
  scene.add(city);
}


/* ── USRP racks ──────────────────────────────────────────────────────────── */

const RACK_U = 16;
const RACK_W = 6, RACK_D = 7;
const RACK_BASE = 0.5;
const RACK_H = RACK_BASE + RACK_U * U + 0.3;

function buildRack(label, ips) {
  const g = new THREE.Group();
  const frame = metal(0x2b2f36);
  const panel = metal(0x3a3f47, 0.6, 0.5);
  const rail  = metal(0xaab1ba, 0.35, 0.9);

  g.add(box(RACK_W, RACK_BASE, RACK_D, frame, 0, RACK_BASE / 2, 0));
  g.add(box(RACK_W, 0.3, RACK_D, frame, 0, RACK_H - 0.15, 0));
  for (const sx of [-1, 1]) for (const sz of [-1, 1])
    g.add(box(0.25, RACK_H, 0.25, frame, sx * (RACK_W / 2 - 0.125), RACK_H / 2, sz * (RACK_D / 2 - 0.125)));
  for (const sx of [-1, 1])
    g.add(box(0.06, RACK_H - 0.8, RACK_D - 0.5, panel, sx * (RACK_W / 2 - 0.05), RACK_H / 2, 0));
  g.add(box(RACK_W - 0.5, RACK_H - 0.8, 0.06, panel, 0, RACK_H / 2, -RACK_D / 2 + 0.05));
  for (const sx of [-1, 1])
    g.add(box(0.3, RACK_U * U, 0.12, rail, sx * 2.55, RACK_BASE + RACK_U * U / 2, RACK_D / 2 - 0.35));

  const glow = new THREE.Mesh(new THREE.BoxGeometry(RACK_W - 0.6, 0.06, 0.06),
    new THREE.MeshStandardMaterial({ color: 0x8ab4f8, emissive: 0x4c8df6, emissiveIntensity: 1.6 }));
  glow.position.set(0, RACK_H - 0.32, RACK_D / 2 - 0.1);
  g.add(glow);

  const lbl = pill(label, { h: 1.1 });
  lbl.position.set(0, RACK_H + 1.1, 0);
  g.add(lbl);

  // Two half-width USRPs per 2U shelf, filled from the top down.
  const shelf = metal(0x5f6670, 0.5, 0.8);
  const topY = RACK_BASE + RACK_U * U;
  ips.forEach((ip, i) => {
    const row = Math.floor(i / 2), col = i % 2;
    const y = topY - (row + 1) * 2 * U;
    if (col === 0) g.add(box(4.9, 0.05, 5.6, shelf, 0, y + 0.02, 0.4));
    g.add(buildUsrp(ip, col === 0 ? -1.22 : 1.22, y + 0.05 + 0.42, 0.6));
  });
  return g;
}

function buildUsrp(ip, x, y, z) {
  const W = 2.32, H = 0.84, D = 5;
  const model = USRP_MODELS[ip] || '';
  const body  = metal(model === 'X410' ? 0xb4bac2 : 0x30353d, 0.4, 0.85);
  const cnv   = document.createElement('canvas');
  cnv.width = 512; cnv.height = 186;
  const tex   = canvasTexture(cnv);
  const front = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5, metalness: 0.3 });
  const mesh  = new THREE.Mesh(new THREE.BoxGeometry(W, H, D), [body, body, body, body, front, body]);
  mesh.position.set(x, y, z);
  mesh.castShadow = mesh.receiveShadow = true;
  mesh.userData.ip = ip;

  const led = new THREE.Mesh(new THREE.SphereGeometry(0.06, 16, 12),
    new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0x5f6368, emissiveIntensity: 1 }));
  led.position.set(W / 2 - 0.16, H / 2 - 0.16, D / 2 + 0.01);
  led.userData.ip = ip;
  mesh.add(led);

  const unit = { ip, model, canvas: cnv, tex, body, front, led, mesh };
  usrpUnits.push(unit);
  bookables[usrpKey(ip)] = { key: usrpKey(ip), unit, parts: [body, front], anchor: mesh,
    size: { w: W, h: H, d: D, cy: 0 },
    offset: new THREE.Vector3(0, H / 2 + 0.3, D / 2), badgeH: 0.32 };
  return mesh;
}

function drawUsrpFront(c, { ip, model, ports, booking }) {
  const g = c.getContext('2d'), W = c.width, H = c.height;
  const silver = model === 'X410';
  const grad = g.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, silver ? '#dde1e6' : '#3d434c');
  grad.addColorStop(1, silver ? '#a9afb8' : '#22262c');
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);
  g.strokeStyle = silver ? '#7f868f' : '#101318';
  g.lineWidth = 6;
  g.strokeRect(3, 3, W - 6, H - 6);

  const ink = silver ? '#1f2329' : '#eceff1';
  const sub = silver ? '#4d545c' : '#9aa0a6';
  g.fillStyle = sub;
  g.font = '600 17px Roboto, Arial, sans-serif';
  g.fillText('ETTUS RESEARCH', 22, 34);
  g.fillStyle = ink;
  g.font = '700 44px "Google Sans", Roboto, Arial, sans-serif';
  g.fillText('USRP ' + (model || '—'), 22, 84);
  g.font = '500 28px "Roboto Mono", monospace';
  g.fillText(ip, 22, 126);
  g.font = '500 19px "Roboto Mono", monospace';
  g.fillStyle = ports ? (silver ? '#137333' : '#5bd47f') : sub;
  g.fillText(ports ? ports + ' ports mapped' : 'not mapped', 22, 164);
  if (booking === 'unavailable') {
    g.fillStyle = '#f9ab00';
    g.fillText('UNAVAILABLE', 220, 164);
  }
  for (let i = 0; i < 4; i++) {                       // SMA connectors
    const cx = W - 140 + (i % 2) * 58, cy = 66 + Math.floor(i / 2) * 58;
    g.beginPath(); g.arc(cx, cy, 17, 0, Math.PI * 2);
    g.fillStyle = '#c9a54a'; g.fill();
    g.beginPath(); g.arc(cx, cy, 7, 0, Math.PI * 2);
    g.fillStyle = '#3b2f14'; g.fill();
  }
}

const TEST_LED = {
  success: 0x34a853, tbd: 0x34a853, failure: 0xea4335, error: 0xf9ab00,
  running: 0x4c8df6, queued: 0x9aa0a6, cancelled: 0x9aa0a6,
};

function testFor(ip) {
  return (typeof usrpTestStatus !== 'undefined' && usrpTestStatus) ? usrpTestStatus[ip] : null;
}

function setGlow(parts, color, intensity) {
  parts.forEach(m => { m.emissive.setHex(color); m.emissiveIntensity = intensity; });
}


/* ── Reservations ────────────────────────────────────────────────────────── */

const usrpKey = ip => 'usrp:' + ip;
const devKey  = d => 'dev:' + d.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const activeFor = key => (window.reserve && window.reserve.active || {})[key];

function usrpResource(u) {
  const ports = window._usrpAgg?.[u.ip]?.ports.length || 0;
  return {
    key: usrpKey(u.ip), kind: 'radio',
    name: `USRP ${u.model || ''} ${u.ip}`.replace(/\s+/g, ' '),
    sub: ports ? `${ports} antenna ports mapped` : 'No antenna ports mapped',
    details: () => { if (typeof selectUsrp === 'function') selectUsrp(u.ip, window._usrpAgg?.[u.ip]); },
  };
}

function deviceResource(d) {
  return {
    key: devKey(d), kind: d.kind === 'ru' ? 'radio' : 'device', name: d.name,
    sub: [GROUPS[d.group]?.label, d.model, d.info].filter(Boolean).join(' · '),
  };
}

function openReservation(res) {
  select(res.key);
  if (window.reserve) window.reserve.open(res);
}

/** Open a USRP's calendar and bring its rack into view beside the panel. */
function openUsrp(u) {
  hideBenchList();
  openReservation(usrpResource(u));
  const rack = racks.find(r => r.ips.includes(u.ip));
  if (rack) flyTo(fitBox(rack.box, new THREE.Vector3(0.12, 0.3, 1), 0.85), { dur: 0.9 });
}

/** Resting glow: blue for the selection, green while reserved, else none. */
function restGlow(key, parts) {
  if (key === selectedKey) setGlow(parts, 0x1a73e8, 0.5);
  else if (activeFor(key)) setGlow(parts, 0x34a853, 0.45);
  else setGlow(parts, 0, 0);
}

/** Mark one radio/device as selected: blue glow, a pulsing glass outline and,
 *  on benches, a bouncing pointer above it. select(null) clears. */
function select(key) {
  const prev = selectedKey && bookables[selectedKey];
  selectedKey = key && bookables[key] ? key : null;
  if (selMarker) { selMarker.parent?.remove(selMarker); selMarker = null; }
  if (prev) restGlow(prev.key, prev.parts);
  const b = selectedKey && bookables[selectedKey];
  if (!b) return;
  restGlow(selectedKey, b.parts);

  const { w, h, d, cy } = b.size, pad = 0.14;
  const geo = new THREE.BoxGeometry(w + pad, h + pad, d + pad);
  const g = new THREE.Group();
  const shell = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
    color: 0x1a73e8, transparent: true, opacity: 0.18, depthWrite: false }));
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo),
    new THREE.LineBasicMaterial({ color: 0x1a73e8, transparent: true }));
  g.add(shell, edges);
  g.position.y = cy;
  g.userData = { shell, edges };
  if (b.device) {
    const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.6, 20),
      new THREE.MeshStandardMaterial({ color: 0x1a73e8, emissive: 0x1a73e8, emissiveIntensity: 0.6 }));
    arrow.rotation.x = Math.PI;                      // point down at the device
    arrow.userData.baseY = h / 2 + 1.5;
    arrow.position.y = arrow.userData.baseY;
    g.add(arrow);
    g.userData.arrow = arrow;
  }
  shell.raycast = edges.raycast = () => {};          // never steal clicks
  b.anchor.add(g);
  selMarker = g;
}

function animateSelection(t) {
  if (!selMarker) return;
  const k = 0.5 + 0.5 * Math.sin(t * 4);
  selMarker.userData.shell.material.opacity = 0.1 + 0.16 * k;
  selMarker.userData.edges.material.opacity = 0.55 + 0.45 * k;
  const a = selMarker.userData.arrow;
  if (a) {
    a.position.y = a.userData.baseY + 0.25 * Math.sin(t * 3);
    a.rotation.y = t * 1.5;
  }
}

// Closing the detail panel clears the selection.
const detailPanel = document.getElementById('detail-panel');
if (detailPanel) new MutationObserver(() => {
  if (!detailPanel.classList.contains('open') && selectedKey) select(null);
}).observe(detailPanel, { attributes: true, attributeFilter: ['class'] });

function applyReservations() {
  Object.entries(bookables).forEach(([key, b]) => {
    restGlow(key, b.parts);
    const cur = activeFor(key);
    if (b.badge) { b.anchor.remove(b.badge); b.badge = null; }
    if (cur) {
      b.badge = pill(`In use · ${cur.username}`, { bg: '#137333', h: b.badgeH });
      b.badge.position.copy(b.offset);
      b.anchor.add(b.badge);
    }
  });
  if (listEl && !listEl.hidden && listEl.dataset.bench) {
    const bench = BENCHES.find(x => x.id === listEl.dataset.bench);
    if (bench) showBenchList(bench, bookables[selectedKey]?.device);
  }
}
window.addEventListener('reservations-changed', applyReservations);

function refreshRack() {
  const agg = window._usrpAgg || {};
  usrpUnits.forEach(u => {
    const a = agg[u.ip];
    drawUsrpFront(u.canvas, {
      ip: u.ip, model: u.model || (a && a.model) || '',
      ports: a ? a.ports.length : 0, booking: USRP_BOOKING_STATUS[u.ip],
    });
    u.tex.needsUpdate = true;
    const t = testFor(u.ip);
    u.led.material.emissive.setHex(t ? (TEST_LED[t.status] ?? 0x9aa0a6) : 0x3c4043);
    restGlow(usrpKey(u.ip), [u.body, u.front]);
  });
}


/* ── Benches ─────────────────────────────────────────────────────────────── */

const BENCH_TOP_Y = 7.4;
const DEVICE_SPEC = {
  //          w     h     d    body      front      ink        stackable
  ru:         [1.4, 2.2, 0.9, 0xdfe3e8, '#eceff1', '#202124', false],
  gh:         [4.4, 0.9, 4.0, 0x1f2329, '#2a2f37', '#e8eaed', true ],
  host:       [4.4, 0.45,4.0, 0x2a2f37, '#353b44', '#e8eaed', true ],
  devkit:     [1.6, 0.6, 1.6, 0x3c4450, '#47515f', '#e8eaed', false],
  instrument: [4.2, 1.8, 4.0, 0xc9ced4, '#d5d9de', '#202124', false],
  rfbox:      [3.0, 2.0, 2.4, 0xaab1ba, '#b9c0c8', '#202124', false],
  sim:        [4.4, 0.9, 3.6, 0x262b33, '#30363f', '#e8eaed', true ],
};
const STATUS_LED = { available: 0x34a853, unavailable: 0xf9ab00, hidden: 0x5f6368 };

function drawDeviceFront(d, spec) {
  const [w, h, , , bg, ink] = spec;
  const accent = GROUPS[d.group]?.color || '#5f6368';
  const c = document.createElement('canvas');
  c.width = Math.round(w * 120);
  c.height = Math.max(54, Math.round(h * 120));
  const g = c.getContext('2d');
  g.fillStyle = bg;
  g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = accent;                                 // vendor colour stripe
  if (d.kind === 'ru') g.fillRect(0, c.height - 22, c.width, 22);
  else g.fillRect(0, 0, 10, c.height);

  if (d.kind === 'instrument') {
    const sx = 20, sy = 18, sw = c.width * 0.55, sh = c.height - 36;
    g.fillStyle = '#0d1b24'; g.fillRect(sx, sy, sw, sh);
    g.strokeStyle = '#f9ab00'; g.lineWidth = 3; g.beginPath();
    for (let i = 0; i <= 60; i++)
      g.lineTo(sx + (i / 60) * sw, sy + sh - 12 - Math.exp(-((i - 30) ** 2) / 12) * sh * 0.6 - Math.random() * 8);
    g.stroke();
  }

  const textX = d.kind === 'instrument' ? c.width * 0.6 + 10 : 20;
  const room = c.width - textX - 10;
  const lines = d.kind === 'ru' ? d.name.split(' ') : [d.name];
  const size = Math.min(c.height * (d.kind === 'ru' ? 0.13 : 0.34), 44,
    room / (Math.max(...lines.map(l => l.length)) * 0.58));
  g.fillStyle = ink;
  g.font = `600 ${size}px "Google Sans", Roboto, Arial, sans-serif`;
  g.textBaseline = 'top';
  let y = d.kind === 'ru' ? c.height * 0.12 : (c.height - size * (h > 0.6 ? 2.2 : 1)) / 2;
  lines.forEach(l => { g.fillText(l, textX, y); y += size * 1.1; });
  if (h > 0.6 && d.model) {
    g.globalAlpha = 0.65;
    g.font = `500 ${size * 0.62}px "Roboto Mono", monospace`;
    g.fillText(d.model, textX, y + size * 0.15);
    g.globalAlpha = 1;
  }
  return canvasTexture(c);
}

function buildDevice(d) {
  const spec = DEVICE_SPEC[d.kind] || DEVICE_SPEC.host;
  const [w, h, dep, bodyColor] = spec;
  const body = metal(bodyColor, 0.45, d.kind === 'ru' ? 0.4 : 0.75);
  const front = new THREE.MeshStandardMaterial({ map: drawDeviceFront(d, spec), roughness: 0.55, metalness: 0.2 });
  const g = new THREE.Group();
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, dep), [body, body, body, body, front, body]);
  mesh.position.y = h / 2;
  mesh.castShadow = mesh.receiveShadow = true;
  g.add(mesh);

  if (d.kind === 'ru') {                                // heat-sink fins
    const fin = metal(0x7d848d, 0.4, 0.85);
    for (let i = 0; i < 7; i++)
      g.add(box(0.06, h * 0.9, 0.35, fin, -w / 2 + 0.15 + i * ((w - 0.3) / 6), h / 2, -dep / 2 - 0.17));
  }
  const led = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 10),
    new THREE.MeshStandardMaterial({ color: 0x111111, emissive: STATUS_LED[d.status] ?? 0x5f6368, emissiveIntensity: 1.3 }));
  led.position.set(w / 2 - 0.15, h - 0.12, dep / 2 + 0.01);
  g.add(led);

  g.traverse(o => { o.userData.device = d; });
  g.userData.size = { w, h, d: dep };
  g.userData.parts = [body, front];
  bookables[devKey(d)] = { key: devKey(d), device: d, parts: [body, front], anchor: g,
    size: { w, h, d: dep, cy: h / 2 },
    offset: new THREE.Vector3(0, h + 0.55, dep / 2), badgeH: 0.45 };
  return g;
}

/** Lay devices out on a bench top. Devices keep their data-file order, which
 *  is grouped by vendor; groups are separated by a wider gap and get a tag.
 *  Stackable gear of the same group piles up two-high. */
function layoutBench(devices, { maxW = 18, gap = 0.45, groupGap = 1.4, rowGap = 1.8 } = {}) {
  const items = [];
  devices.forEach(d => {
    const node = buildDevice(d);
    const last = items[items.length - 1];
    const stackable = (DEVICE_SPEC[d.kind] || [])[6];
    if (stackable && last && last.group === d.group && last.kind === d.kind && last.nodes.length < 2) {
      last.nodes.push(node);
      last.h += node.userData.size.h + 0.04;
    } else {
      const s = node.userData.size;
      items.push({ kind: d.kind, group: d.group, nodes: [node], w: s.w, d: s.d, h: s.h });
    }
  });

  const rows = [];
  items.forEach(it => {
    let row = rows[rows.length - 1];
    const prev = row && row.items[row.items.length - 1];
    const sep = prev ? (prev.group === it.group ? gap : groupGap) : 0;
    if (!row || row.w + sep + it.w > maxW) {
      row = { items: [], w: it.w, d: 0 };
      rows.push(row);
      it.x = 0;
    } else {
      it.x = row.w + sep;
      row.w += sep + it.w;
    }
    row.items.push(it);
    row.d = Math.max(row.d, it.d);
  });

  const depth = rows.reduce((s, r) => s + r.d, 0) + rowGap * (rows.length - 1);
  const width = Math.max(...rows.map(r => r.w));
  const group = new THREE.Group();
  const tags = {};
  const edgeTags = [];
  let z = -depth / 2;
  rows.forEach((r, ri) => {
    // With several rows, the front row's tags hang on the bench edge like
    // shelf labels so they don't cover the row behind.
    r.edgeTag = rows.length > 1 && ri === rows.length - 1;
    const x0 = -r.w / 2;
    const front = z + r.d;
    r.items.forEach(it => {
      const cx = x0 + it.x + it.w / 2, cz = front - it.d / 2;
      let y = 0;
      it.nodes.forEach(n => {
        n.position.set(cx, y, cz);
        y += n.userData.size.h + 0.04;
        group.add(n);
      });
      const t = tags[it.group] || (tags[it.group] = { row: r, minX: Infinity, maxX: -Infinity, top: 0, z: cz, count: 0 });
      t.count += it.nodes.length;
      if (t.row === r) {
        t.minX = Math.min(t.minX, x0 + it.x);
        t.maxX = Math.max(t.maxX, x0 + it.x + it.w);
        t.top = Math.max(t.top, it.h);
      }
    });
    z += r.d + rowGap;
  });

  Object.entries(tags).forEach(([key, t]) => {
    const info = GROUPS[key] || { label: key, color: '#5f6368' };
    const s = pill(`${info.label} · ${t.count}`, { bg: info.color, h: 0.62 });
    s.position.set((t.minX + t.maxX) / 2, t.top + 0.7, t.z);
    if (t.row.edgeTag) { s.position.y = -0.4; edgeTags.push(s); }   // z set by buildBench
    group.add(s);
  });
  return { group, width, depth, edgeTags };
}

function buildBench(bench) {
  const g = new THREE.Group();
  const { group, width, depth, edgeTags } = layoutBench(bench.devices);
  const W = Math.max(10, width + 2), D = Math.max(7, depth + 2);
  edgeTags.forEach(t => { t.position.z = D / 2 + 0.15; });
  const steel = metal(0x9aa1aa, 0.35, 0.85);
  const frame = metal(0xe8eaed, 0.5, 0.2);
  const mat   = new THREE.MeshStandardMaterial({ color: 0x7f9db3, roughness: 0.85 });    // ESD mat

  g.add(box(W, 0.35, D, frame, 0, BENCH_TOP_Y - 0.2, 0));
  g.add(box(W - 0.4, 0.04, D - 0.4, mat, 0, BENCH_TOP_Y, 0));
  for (const sx of [-1, 1]) for (const sz of [-1, 1])
    g.add(box(0.35, BENCH_TOP_Y - 0.35, 0.35, steel, sx * (W / 2 - 0.4), (BENCH_TOP_Y - 0.35) / 2, sz * (D / 2 - 0.4)));
  g.add(box(W - 0.8, 0.12, D - 0.8, steel, 0, 1.4, 0));
  const frameParts = [...g.children];
  group.position.y = BENCH_TOP_Y + 0.02;
  g.add(group);

  const lbl = pill(bench.name, { h: 1.1 });
  lbl.position.set(0, BENCH_TOP_Y + 5.2, -D / 2 + 0.5);
  g.add(lbl);

  frameParts.forEach(o => { o.userData.bench = bench; });
  group.traverse(o => { o.userData.bench = bench; });
  return { group: g, W, D };
}

/** Bench placement around the room: [x, z, rotationY]. Fronts face the room. */
function benchPlacement(id, D) {
  switch (id) {
    case 'radio':   return [-ROOM_W / 2 + D / 2 + 1.5, -2,  Math.PI / 2];
    case 'compute': return [ ROOM_W / 2 - D / 2 - 1.5, -2, -Math.PI / 2];
    default:        return [0, 11, 0];
  }
}

function addBench(bench) {
  const built = buildBench(bench);
  const [x, z, ry] = benchPlacement(bench.id, built.D);
  built.group.position.set(x, 0, z);
  built.group.rotation.y = ry;
  scene.add(built.group);

  const zone = floorZone(built.W + 3, built.D + 5, GROUPS[bench.devices[0]?.group]?.color || '#5f6368', bench.name);
  zone.position.set(x, 0.02, z);
  zone.rotation.y = ry;
  scene.add(zone);

  built.group.updateMatrixWorld(true);
  const bbox = new THREE.Box3().setFromObject(built.group);
  const dir = new THREE.Vector3(Math.sin(ry), 0.75, Math.cos(ry));
  views[bench.id] = () => fitBox(bbox, dir, 0.9);
  benches.push({ bench, group: built.group });
}


/* ── Device list panel ───────────────────────────────────────────────────── */

const listEl = document.getElementById('lab-list');

function showBenchList(bench, highlight) {
  if (!listEl) return;
  const order = [];
  bench.devices.forEach(d => { if (!order.includes(d.group)) order.push(d.group); });
  const label = { available: 'available', unavailable: 'unavailable', hidden: 'hidden in booking' };
  listEl.innerHTML = `
    <div class="lab-list-head">
      <div>
        <div class="lab-list-title">${esc(bench.name)}</div>
        <div class="lab-list-sub">${bench.devices.length} devices · ${esc(bench.subtitle)}</div>
      </div>
      <button class="icon-btn" id="lab-list-close" title="Close"><span class="material-icons">close</span></button>
    </div>
    <div class="lab-list-body">
      ${order.map(key => {
        const info = GROUPS[key] || { label: key, color: '#5f6368' };
        const devs = bench.devices.filter(d => d.group === key);
        return `
          <div class="lab-group">
            <span class="lab-tag" style="background:${info.color}">${esc(info.label)} · ${devs.length}</span>
            <ul>${devs.map(d => `
              <li class="${d === highlight ? 'hl' : ''}" data-dev="${esc(d.name)}" title="Open the reservation calendar">
                <span class="bench-dot st-${d.status}" title="${label[d.status] || ''}"></span>
                <span class="bench-dev">${esc(d.name)}</span>
                ${activeFor(devKey(d))
                  ? `<span class="bench-inuse">In use · ${esc(activeFor(devKey(d)).username)}</span>`
                  : `<span class="bench-meta">${esc([d.model, d.info].filter(Boolean).join(' · '))}</span>`}
              </li>`).join('')}
            </ul>
          </div>`;
      }).join('')}
    </div>`;
  listEl.hidden = false;
  listEl.dataset.bench = bench.id;
  document.getElementById('lab-list-close').onclick = hideBenchList;
  listEl.querySelectorAll('li[data-dev]').forEach(li => li.onclick = () => {
    const d = bench.devices.find(x => x.name === li.dataset.dev);
    listEl.querySelectorAll('li.hl').forEach(n => n.classList.remove('hl'));
    li.classList.add('hl');
    openReservation(deviceResource(d));
  });
  listEl.querySelector('li.hl')?.scrollIntoView({ block: 'nearest' });
}

function hideBenchList() { if (listEl) listEl.hidden = true; }


/* ── Picking ─────────────────────────────────────────────────────────────── */

const raycaster = new THREE.Raycaster();
let pickables = [];
let hovered = null;                   // {key, parts, usrp?|device?|bench?}

function pickAt(ev) {
  const r = canvas.getBoundingClientRect();
  raycaster.setFromCamera(new THREE.Vector2(
    ((ev.clientX - r.left) / r.width) * 2 - 1,
    -((ev.clientY - r.top) / r.height) * 2 + 1), camera);
  const hit = raycaster.intersectObjects(pickables, true).find(h => !h.object.isSprite && !h.object.isLine);
  return hit ? hit.object : null;
}

function hoverTarget(obj) {
  if (!obj) return null;
  if (obj.userData.ip) {
    const u = usrpUnits.find(x => x.ip === obj.userData.ip);
    return { key: usrpKey(u.ip), parts: [u.body, u.front], usrp: u };
  }
  if (obj.userData.device) {
    let n = obj;
    while (n && !n.userData.parts) n = n.parent;
    return n ? { key: devKey(obj.userData.device), parts: n.userData.parts, device: obj.userData.device } : null;
  }
  if (obj.userData.bench) return { key: 'bench:' + obj.userData.bench.id, parts: [], bench: obj.userData.bench };
  return null;
}

canvas.addEventListener('pointermove', e => {
  if (e.buttons) { showTip(e, null); return; }          // dragging
  const t = hoverTarget(pickAt(e));
  if (hovered && hovered.key !== t?.key) restGlow(hovered.key, hovered.parts);
  hovered = t;
  canvas.style.cursor = t ? 'pointer' : 'grab';
  if (!t) return showTip(e, null);
  if (t.key !== selectedKey && !activeFor(t.key)) setGlow(t.parts, 0x8ab4f8, 0.2);
  const cur = activeFor(t.key);
  const inUse = cur ? `<br><span class="tip-tag" style="background:#137333">In use · ${esc(cur.username)} until ${
    esc(new Date(cur.ends_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))}</span>` : '';
  const hint = '<br><span class="tip-hint">Click to reserve</span>';
  if (t.usrp) {
    const st = testFor(t.usrp.ip);
    const ports = (window._usrpAgg?.[t.usrp.ip]?.ports.length) || 0;
    showTip(e, `<b>${esc(t.usrp.ip)}</b><br>USRP ${esc(t.usrp.model || '—')} · ${ports ? ports + ' ports' : 'not mapped'}`
      + `<br>${st ? 'last test: ' + esc(st.status) : 'untested'}` + inUse + hint);
  } else if (t.device) {
    const d = t.device, tag = GROUPS[d.group];
    showTip(e, `<b>${esc(d.name)}</b>${tag ? ` <span class="tip-tag" style="background:${tag.color}">${esc(tag.label)}</span>` : ''}`
      + `${d.model ? '<br>' + esc(d.model) : ''}${d.info ? '<br>' + esc(d.info) : ''}` + inUse + hint);
  } else {
    showTip(e, `<b>${esc(t.bench.name)}</b><br>${t.bench.devices.length} devices · click to list`);
  }
});
canvas.addEventListener('pointerleave', e => {
  showTip(e, null);
  if (hovered) { restGlow(hovered.key, hovered.parts); hovered = null; }
});

// A left click that wasn't a drag selects.
let downAt = null;
canvas.addEventListener('pointerdown', e => { downAt = { x: e.clientX, y: e.clientY, b: e.button }; });
canvas.addEventListener('pointerup', e => {
  const tap = downAt && downAt.b === 0 && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) < 5;
  downAt = null;
  if (!tap) return;
  const t = hoverTarget(pickAt(e));
  if (t?.usrp) {
    openUsrp(t.usrp);
  } else if (t?.device) {
    const bench = BENCHES.find(b => b.devices.includes(t.device));
    showBenchList(bench, t.device);
    openReservation(deviceResource(t.device));     // opens the panel first,
    goView(bench.id);                              // so the framing allows for it
  } else if (t?.bench) {
    if (typeof closeDetailPanel === 'function') closeDetailPanel();
    select(null);
    showBenchList(t.bench);
    goView(t.bench.id);
  } else {
    hideBenchList();
  }
});


/* ── Build scene ─────────────────────────────────────────────────────────── */

function build() {
  scene.background = skyTexture();
  buildOutdoors();
  buildRoom();

  const rackZ = -ROOM_D / 2 + RACK_D / 2 + 1;
  const ar1 = buildRack('Arena 1', RACK_ORDER_AR1);
  const ar2 = buildRack('Arena 2', RACK_ORDER_AR2);
  ar1.position.set(-5.5, 0, rackZ);
  ar2.position.set( 5.5, 0, rackZ);
  scene.add(ar1, ar2);
  const rz = floorZone(26, RACK_D + 6, '#1a73e8', 'USRP racks');
  rz.position.set(0, 0.02, rackZ + 1.5);
  scene.add(rz);
  scene.updateMatrixWorld(true);
  const rackBox = new THREE.Box3().setFromObject(ar1).union(new THREE.Box3().setFromObject(ar2));
  racks.push({ ips: RACK_ORDER_AR1, box: new THREE.Box3().setFromObject(ar1) },
             { ips: RACK_ORDER_AR2, box: new THREE.Box3().setFromObject(ar2) });
  views.racks = () => fitBox(rackBox, new THREE.Vector3(0.2, 0.45, 1), 0.9);

  BENCHES.forEach(addBench);

  const roomBox = new THREE.Box3(new THREE.Vector3(-ROOM_W / 2, 0, -ROOM_D / 2), new THREE.Vector3(ROOM_W / 2, 10, ROOM_D / 2));
  views.overview = () => fitBox(roomBox, new THREE.Vector3(0, 1.05, 1), 0.96);

  pickables = [ar1, ar2, ...benches.map(b => b.group)];

  const bar = document.getElementById('lab-views');
  if (bar) {
    const names = [['overview', 'Overview'], ['racks', 'USRP racks'], ...BENCHES.map(b => [b.id, b.name])];
    bar.innerHTML = names.map(([k, l]) => `<button class="seg" data-view="${k}">${esc(l)}</button>`).join('');
    bar.querySelectorAll('.seg').forEach(b => b.onclick = () => {
      const bench = BENCHES.find(x => x.id === b.dataset.view);
      if (bench) showBenchList(bench); else hideBenchList();
      goView(b.dataset.view);
    });
  }
  refreshRack();
  if (window.reserve) {
    window.reserve.setCatalog([
      ...usrpUnits.map(usrpResource),
      ...BENCHES.flatMap(b => b.devices.map(deviceResource)),
    ].map(({ key, name, kind }) => ({ key, name, kind })));
  }
  applyReservations();
}


/* ── Intro + render loop ─────────────────────────────────────────────────── */

function enter() {
  resize();
  // Land on the view named in the URL (#rack/radio etc.), else the overview.
  const want = (location.hash.match(/^#rack\/(\w+)/) || [])[1];
  const dest = views[want] ? want : 'overview';
  const bench = BENCHES.find(b => b.id === dest);
  if (bench) showBenchList(bench); else hideBenchList();
  const ov = views.overview();
  const intro = document.getElementById('lab-intro');
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || !intro) {
    goView(dest, { from: views[dest](), dur: 0.01 });
    return;
  }
  const far = {
    pos: ov.target.clone().add(new THREE.Vector3(0, 7, ov.pos.distanceTo(ov.target) * 2.6)),
    target: ov.target.clone().setY(5),
  };
  // Warm up before anything moves: compile every shader and upload every
  // texture now, so the fly-in never stalls on its first frames.
  camera.position.copy(far.pos);
  controls.target.copy(far.target);
  controls.update();
  renderer.compile(scene, camera);
  renderer.render(scene, camera);
  // INSI title zooms away while the camera glides in from outside.
  playIntro(intro);
  goView(dest, { from: far, dur: 2.8, delay: 0.8 });
}

function loop(ms) {
  requestAnimationFrame(loop);
  if (!container.getClientRects().length) return;        // view hidden
  const t = ms / 1000;
  stepAnim(performance.now() / 1000);
  controls.update();
  updateViewShift();
  animateSelection(t);
  usrpUnits.forEach(u => {
    const s = testFor(u.ip)?.status;
    u.led.material.emissiveIntensity = (s === 'running' || s === 'queued')
      ? 0.4 + 1.2 * (0.5 + 0.5 * Math.sin(t * 6)) : 1.2;
  });
  renderer.render(scene, camera);
}

let refreshQueued = false;
let ready = false;
let pendingEnter = false;
let lastEnter = -Infinity;
window.rack3d = {
  /** Play the fly-in and land on the overview. Called by switchTab('antenna'). */
  enter() {
    if (!ready) { pendingEnter = true; return; }
    // On page load both the visibility check below and switchTab() ask to
    // enter; play the intro only once.
    if (performance.now() - lastEnter < 1500) return;
    lastEnter = performance.now();
    enter();
  },
  /** Open the reservation calendar for a USRP (used by the USRP detail panel). */
  reserveUsrp(ip) {
    const u = usrpUnits.find(x => x.ip === ip);
    if (u) openUsrp(u);
  },
  /** Redraw USRP faces + LEDs from window._usrpAgg / usrpTestStatus. Batched per frame. */
  refresh() {
    if (refreshQueued || !ready) return;
    refreshQueued = true;
    requestAnimationFrame(() => { refreshQueued = false; refreshRack(); });
  },
};

// Labels are painted once onto canvases, so wait for the web fonts first.
(document.fonts ? document.fonts.ready : Promise.resolve()).then(() => {
  build();
  ready = true;
  requestAnimationFrame(loop);
  if (pendingEnter || container.getClientRects().length) window.rack3d.enter();
});
