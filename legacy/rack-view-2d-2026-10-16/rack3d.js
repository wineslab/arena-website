/* ═══════════════════════════════════════════════════════════════════════════
   rack3d.js — 3D USRP racks + lab benches (Rack view).

   Two kinds of Three.js stages, each with its own canvas and orbit controls:
     • #rack3d-stage   — the Arena 1 / Arena 2 USRP racks, in the same slot
                         order as the 2D cards (RACK_ORDER_AR1/AR2 in app.js).
                         Drag to rotate, scroll to zoom, click a USRP to open
                         it in the detail panel. LEDs follow the last test.
     • .bench-canvas   — one per bench in rack3d-data.js. Drag to rotate;
                         tap the bench to list the devices sitting on it.

   Reads app.js globals: RACK_ORDER_AR1/AR2, usrpTestStatus, selectUsrp and
   window._usrpAgg (port usage per IP, set by buildUsrpView). app.js calls
   window.rack3d.refresh() whenever mappings or test status change.

   Units: 1 world unit = 10 cm, so 1U = 0.445.
   ═══════════════════════════════════════════════════════════════════════════ */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { BENCHES, USRP_MODELS, USRP_BOOKING_STATUS } from './rack3d-data.js';

const U = 0.445;
const BG = 0x1c2028;

const stages = [];
const usrpUnits = [];             // {ip, front, canvas, tex, body, led}
let selectedIp = null;
let tipEl = null;


/* ── Generic stage ───────────────────────────────────────────────────────── */

function makeStage(container, { camPos, target, minDist, maxDist }) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(BG);
  scene.fog = new THREE.Fog(BG, 45, 110);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x20242c, 0.5));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(10, 22, 16);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -16, right: 16, top: 16, bottom: -16, near: 1, far: 60 });
  sun.shadow.bias = -0.0005;
  scene.add(sun);

  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(60, 64),
    new THREE.MeshStandardMaterial({ color: 0x262b34, roughness: 0.9 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  const grid = new THREE.GridHelper(80, 80, 0x3a4150, 0x2e343e);
  grid.position.y = 0.01;
  scene.add(grid);

  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 300);
  camera.position.set(...camPos);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(...target);
  controls.enableDamping = true;
  controls.enablePan = false;
  controls.minDistance = minDist;
  controls.maxDistance = maxDist;
  controls.maxPolarAngle = Math.PI * 0.48;   // never look from under the floor
  controls.update();
  const home = { pos: camera.position.clone(), target: controls.target.clone() };

  new ResizeObserver(() => {
    const w = container.clientWidth, h = container.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }).observe(container);

  const stage = { container, renderer, scene, camera, controls, home, tick: null };
  stages.push(stage);
  return stage;
}

function resetStage(stage) {
  stage.camera.position.copy(stage.home.pos);
  stage.controls.target.copy(stage.home.target);
  stage.controls.update();
}

/** Raycast the pointer event against `objects`; returns the first hit object. */
function pick(stage, ev, objects) {
  const r = stage.renderer.domElement.getBoundingClientRect();
  const ndc = new THREE.Vector2(
    ((ev.clientX - r.left) / r.width) * 2 - 1,
    -((ev.clientY - r.top) / r.height) * 2 + 1);
  const ray = new THREE.Raycaster();
  ray.setFromCamera(ndc, stage.camera);
  const hit = ray.intersectObjects(objects, true)[0];
  return hit ? hit.object : null;
}

/** Fire `onTap` only for a click that was not a rotate-drag. */
function onTap(el, fn) {
  let down = null;
  el.addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY }; });
  el.addEventListener('pointerup', e => {
    if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 5) fn(e);
    down = null;
  });
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

function textSprite(text, color = '#e8eaed') {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 96;
  const g = c.getContext('2d');
  g.font = '600 52px "Google Sans", Roboto, Arial, sans-serif';
  g.fillStyle = color;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 256, 50);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: canvasTexture(c), depthWrite: false }));
  s.scale.set(5.3, 1, 1);
  return s;
}


/* ── USRP racks ──────────────────────────────────────────────────────────── */

const RACK_U = 16;
const RACK_W = 6, RACK_D = 7;
const RACK_BASE = 0.5;
const RACK_H = RACK_BASE + RACK_U * U + 0.3;

function buildRack(label, ips) {
  const g = new THREE.Group();
  const frame = metal(0x2b2f36);
  const panel = metal(0x1f232a, 0.6, 0.5);
  const rail  = metal(0xaab1ba, 0.35, 0.9);

  g.add(box(RACK_W, RACK_BASE, RACK_D, frame, 0, RACK_BASE / 2, 0));               // plinth
  g.add(box(RACK_W, 0.3, RACK_D, frame, 0, RACK_H - 0.15, 0));                     // roof
  for (const sx of [-1, 1]) for (const sz of [-1, 1])                             // posts
    g.add(box(0.25, RACK_H, 0.25, frame, sx * (RACK_W / 2 - 0.125), RACK_H / 2, sz * (RACK_D / 2 - 0.125)));
  for (const sx of [-1, 1])                                                       // side panels
    g.add(box(0.06, RACK_H - 0.8, RACK_D - 0.5, panel, sx * (RACK_W / 2 - 0.05), RACK_H / 2, 0));
  g.add(box(RACK_W - 0.5, RACK_H - 0.8, 0.06, panel, 0, RACK_H / 2, -RACK_D / 2 + 0.05)); // back
  for (const sx of [-1, 1])                                                       // front rails
    g.add(box(0.3, RACK_U * U, 0.12, rail, sx * 2.55, RACK_BASE + RACK_U * U / 2, RACK_D / 2 - 0.35));

  // Glowing accent strip along the roof edge
  const glow = new THREE.Mesh(new THREE.BoxGeometry(RACK_W - 0.6, 0.06, 0.06),
    new THREE.MeshStandardMaterial({ color: 0x8ab4f8, emissive: 0x8ab4f8, emissiveIntensity: 1.4 }));
  glow.position.set(0, RACK_H - 0.32, RACK_D / 2 - 0.1);
  g.add(glow);

  const lbl = textSprite(label);
  lbl.position.set(0, RACK_H + 0.9, 0);
  g.add(lbl);

  // USRPs: two half-width units per 2U shelf, filled from the top down.
  const shelf = metal(0x5f6670, 0.5, 0.8);
  const topY = RACK_BASE + RACK_U * U;
  ips.forEach((ip, i) => {
    const row = Math.floor(i / 2), col = i % 2;
    const y = topY - (row + 1) * 2 * U;
    if (col === 0) g.add(box(4.9, 0.05, 5.6, shelf, 0, y + 0.02, 0.4));
    g.add(buildUsrp(ip, (col === 0 ? -1.22 : 1.22), y + 0.05 + 0.42, 0.6));
  });
  return g;
}

function buildUsrp(ip, x, y, z) {
  const W = 2.32, H = 0.84, D = 5;
  const model = USRP_MODELS[ip] || '';
  const body  = metal(model === 'X410' ? 0xb4bac2 : 0x30353d, 0.4, 0.85);
  const canvas = document.createElement('canvas');
  canvas.width = 512; canvas.height = 186;
  const tex   = canvasTexture(canvas);
  const front = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5, metalness: 0.3 });
  const mesh  = new THREE.Mesh(new THREE.BoxGeometry(W, H, D), [body, body, body, body, front, body]);
  mesh.position.set(x, y, z);
  mesh.castShadow = mesh.receiveShadow = true;
  mesh.userData.ip = ip;

  const ledMat = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0x5f6368, emissiveIntensity: 1 });
  const led = new THREE.Mesh(new THREE.SphereGeometry(0.06, 16, 12), ledMat);
  led.position.set(W / 2 - 0.16, H / 2 - 0.16, D / 2 + 0.01);
  led.userData.ip = ip;
  mesh.add(led);

  usrpUnits.push({ ip, model, canvas, tex, body, front, led, mesh });
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
  // SMA connectors
  for (let i = 0; i < 4; i++) {
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
    setGlow(u, u.ip === selectedIp ? 0x1a73e8 : 0x000000, 0.35);
  });
}

function setGlow(u, color, intensity) {
  for (const m of [u.body, u.front]) {
    m.emissive.setHex(color);
    m.emissiveIntensity = intensity;
  }
}

function initRack() {
  const el = document.getElementById('rack3d-stage');
  if (!el) return;
  const stage = makeStage(el, { camPos: [6, 7.5, 22], target: [0, 4, 0], minDist: 8, maxDist: 45 });
  const fill = new THREE.PointLight(0xcfe0ff, 40, 30);   // light the cabinet interiors
  fill.position.set(0, 6, 9);
  stage.scene.add(fill);
  const ar1 = buildRack('ARENA 1', RACK_ORDER_AR1);
  const ar2 = buildRack('ARENA 2', RACK_ORDER_AR2);
  ar1.position.x = -5;
  ar2.position.x =  5;
  stage.scene.add(ar1, ar2);

  const pickables = usrpUnits.map(u => u.mesh);
  let hovered = null;
  stage.renderer.domElement.addEventListener('pointermove', e => {
    const obj = pick(stage, e, pickables);
    const ip = obj && obj.userData.ip;
    const u = ip ? usrpUnits.find(x => x.ip === ip) : null;
    if (hovered && hovered !== u) setGlow(hovered, hovered.ip === selectedIp ? 0x1a73e8 : 0, 0.35);
    hovered = u;
    stage.renderer.domElement.style.cursor = u ? 'pointer' : 'grab';
    if (!u) return showTip(e, null);
    if (u.ip !== selectedIp) setGlow(u, 0x8ab4f8, 0.18);
    const t = testFor(u.ip);
    const ports = (window._usrpAgg?.[u.ip]?.ports.length) || 0;
    showTip(e, `<b>${esc(u.ip)}</b><br>USRP ${esc(u.model || '—')} · ${ports ? ports + ' ports' : 'not mapped'}`
      + `<br>${t ? 'last test: ' + esc(t.status) : 'untested'}`);
  });
  stage.renderer.domElement.addEventListener('pointerleave', e => showTip(e, null));
  onTap(stage.renderer.domElement, e => {
    const obj = pick(stage, e, pickables);
    if (!obj) return;
    selectedIp = obj.userData.ip;
    refreshRack();
    if (typeof selectUsrp === 'function') selectUsrp(selectedIp, window._usrpAgg?.[selectedIp]);
  });

  stage.tick = (t) => {
    usrpUnits.forEach(u => {
      const s = testFor(u.ip)?.status;
      u.led.material.emissiveIntensity = (s === 'running' || s === 'queued')
        ? 0.4 + 1.2 * (0.5 + 0.5 * Math.sin(t * 6)) : 1.2;
    });
  };
  document.getElementById('rack3d-reset')?.addEventListener('click', () => resetStage(stage));
  refreshRack();
}


/* ── Benches ─────────────────────────────────────────────────────────────── */

const BENCH_TOP_Y = 7.4;
const DEVICE_SPEC = {
  //          w     h     d    body      front      ink        accent     stackable
  ru:         [1.4, 2.2, 0.9, 0xdfe3e8, '#eceff1', '#202124', '#1a73e8', false],
  gh:         [4.4, 0.9, 4.0, 0x1f2329, '#2a2f37', '#e8eaed', '#76b900', true ],
  host:       [4.4, 0.45,4.0, 0x2a2f37, '#353b44', '#e8eaed', '#4c8df6', true ],
  devkit:     [1.6, 0.6, 1.6, 0x3c4450, '#47515f', '#e8eaed', '#f97316', false],
  instrument: [4.2, 1.8, 4.0, 0xc9ced4, '#d5d9de', '#202124', '#f9ab00', false],
  rfbox:      [3.0, 2.0, 2.4, 0xaab1ba, '#b9c0c8', '#202124', '#5f6368', false],
  sim:        [4.4, 0.9, 3.6, 0x262b33, '#30363f', '#e8eaed', '#a78bfa', true ],
};
const STATUS_LED = { available: 0x34a853, unavailable: 0xf9ab00, hidden: 0x5f6368 };

function drawDeviceFront(d, spec) {
  const [w, h, , , bg, ink, accent] = spec;
  const c = document.createElement('canvas');
  c.width = Math.round(w * 120);
  c.height = Math.max(54, Math.round(h * 120));
  const g = c.getContext('2d');
  g.fillStyle = bg;
  g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = accent;
  g.fillRect(0, 0, 8, c.height);

  if (d.kind === 'instrument') {
    // Analyzer screen with a spectrum trace
    const sx = 20, sy = 18, sw = c.width * 0.55, sh = c.height - 36;
    g.fillStyle = '#0d1b24'; g.fillRect(sx, sy, sw, sh);
    g.strokeStyle = '#f9ab00'; g.lineWidth = 3; g.beginPath();
    for (let i = 0; i <= 60; i++) {
      const x = sx + (i / 60) * sw;
      const peak = Math.exp(-((i - 30) ** 2) / 12) * sh * 0.6;
      g.lineTo(x, sy + sh - 12 - peak - Math.random() * 8);
    }
    g.stroke();
  }

  const textX = d.kind === 'instrument' ? c.width * 0.6 + 10 : 18;
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

  if (d.kind === 'ru') {                                   // heat-sink fins
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
  return g;
}

/** Arrange devices on the bench: stackable gear piles up 2-high, everything is
 *  packed into rows no wider than `maxW`, rows run front to back. */
function layoutBench(devices, maxW = 15, gap = 0.5) {
  const items = [];
  devices.forEach(d => {
    const node = buildDevice(d);
    const last = items[items.length - 1];
    const stackable = (DEVICE_SPEC[d.kind] || [])[7];
    if (stackable && last && last.kind === d.kind && last.nodes.length < 2) {
      last.nodes.push(node);
    } else {
      items.push({ kind: d.kind, nodes: [node], w: node.userData.size.w, d: node.userData.size.d });
    }
  });
  const rows = [];
  items.forEach(it => {
    const row = rows[rows.length - 1];
    if (row && row.w + gap + it.w <= maxW) { row.items.push(it); row.w += gap + it.w; row.d = Math.max(row.d, it.d); }
    else rows.push({ items: [it], w: it.w, d: it.d });
  });
  const depth = rows.reduce((s, r) => s + r.d, 0) + gap * (rows.length - 1);
  const width = Math.max(...rows.map(r => r.w));
  const group = new THREE.Group();
  let z = -depth / 2;
  rows.forEach(r => {
    let x = -r.w / 2;
    r.items.forEach(it => {
      let y = 0;
      it.nodes.forEach(n => {
        n.position.set(x + it.w / 2, y, z + r.d - it.d / 2);   // flush to row front
        y += n.userData.size.h + 0.04;
        group.add(n);
      });
      x += it.w + gap;
    });
    z += r.d + gap;
  });
  return { group, width, depth };
}

function buildBench(bench) {
  const g = new THREE.Group();
  const { group, width, depth } = layoutBench(bench.devices);
  const W = Math.max(10, width + 2), D = Math.max(7, depth + 2);
  const steel = metal(0x9aa1aa, 0.35, 0.85);
  const frame = metal(0xc4c9cf, 0.5, 0.4);
  const mat   = new THREE.MeshStandardMaterial({ color: 0x3d5566, roughness: 0.85 });   // ESD mat

  g.add(box(W, 0.35, D, frame, 0, BENCH_TOP_Y - 0.2, 0));
  g.add(box(W - 0.4, 0.04, D - 0.4, mat, 0, BENCH_TOP_Y, 0));
  for (const sx of [-1, 1]) for (const sz of [-1, 1])
    g.add(box(0.35, BENCH_TOP_Y - 0.35, 0.35, steel, sx * (W / 2 - 0.4), (BENCH_TOP_Y - 0.35) / 2, sz * (D / 2 - 0.4)));
  g.add(box(W - 0.8, 0.12, D - 0.8, steel, 0, 1.4, 0));                               // lower shelf
  const pickables = [...g.children];
  group.position.y = BENCH_TOP_Y + 0.02;
  g.add(group);
  return { group: g, devices: group, pickables: [...pickables, group], W, D };
}

function benchListHtml(bench, highlight) {
  const label = { available: 'available', unavailable: 'unavailable', hidden: 'hidden in booking' };
  return `
    <div class="bench-list-head">
      <span>${esc(bench.name)} · ${bench.devices.length} devices</span>
      <button class="icon-btn bench-list-close" title="Close"><span class="material-icons">close</span></button>
    </div>
    <ul>${bench.devices.map(d => `
      <li class="${d === highlight ? 'hl' : ''}">
        <span class="bench-dot st-${d.status}" title="${label[d.status] || ''}"></span>
        <span class="bench-dev">${esc(d.name)}</span>
        <span class="bench-meta">${esc([d.model, d.info].filter(Boolean).join(' · '))}</span>
      </li>`).join('')}
    </ul>`;
}

function initBench(bench, row) {
  const card = document.createElement('div');
  card.className = 'bench-card';
  card.innerHTML = `
    <div class="bench-head">
      <div>
        <div class="bench-name">${esc(bench.name)}</div>
        <div class="bench-sub">${bench.devices.length} devices · ${esc(bench.subtitle)}</div>
      </div>
      <button class="icon-btn bench-reset" title="Reset view"><span class="material-icons">restart_alt</span></button>
    </div>
    <div class="bench-canvas"></div>
    <div class="bench-list" hidden></div>
    <div class="bench-hint">Drag to rotate · tap the bench to list devices</div>`;
  row.appendChild(card);

  const el = card.querySelector('.bench-canvas');
  const list = card.querySelector('.bench-list');
  const built = buildBench(bench);
  const dist = Math.max(built.W, built.D) * 1.05 + 4;
  const stage = makeStage(el, {
    camPos: [dist * 0.4, BENCH_TOP_Y + dist * 0.45, dist * 0.8],
    target: [0, BENCH_TOP_Y, 0], minDist: 6, maxDist: dist * 2,
  });
  stage.scene.add(built.group);
  card.querySelector('.bench-reset').onclick = () => resetStage(stage);

  let hovered = null;
  const glow = (node, on) => node?.userData.parts?.forEach(m => {
    m.emissive.setHex(on ? 0x8ab4f8 : 0); m.emissiveIntensity = on ? 0.22 : 0;
  });
  const deviceNode = obj => { while (obj && !obj.userData.size) obj = obj.parent; return obj; };

  stage.renderer.domElement.addEventListener('pointermove', e => {
    const obj = pick(stage, e, built.pickables);
    const node = obj && obj.userData.device ? deviceNode(obj) : null;
    if (hovered !== node) { glow(hovered, false); glow(node, true); hovered = node; }
    stage.renderer.domElement.style.cursor = obj ? 'pointer' : 'grab';
    const d = node?.userData.device;
    showTip(e, d ? `<b>${esc(d.name)}</b>${d.model ? '<br>' + esc(d.model) : ''}${d.info ? '<br>' + esc(d.info) : ''}` : null);
  });
  stage.renderer.domElement.addEventListener('pointerleave', e => { glow(hovered, false); hovered = null; showTip(e, null); });

  const closeList = () => { list.hidden = true; };
  onTap(stage.renderer.domElement, e => {
    const obj = pick(stage, e, built.pickables);
    if (!obj) return closeList();
    list.innerHTML = benchListHtml(bench, obj.userData.device);
    list.hidden = false;
    list.querySelector('.bench-list-close').onclick = closeList;
    list.querySelector('li.hl')?.scrollIntoView({ block: 'nearest' });
  });
}


/* ── Render loop + public API ────────────────────────────────────────────── */

function loop(ms) {
  const t = ms / 1000;
  for (const s of stages) {
    if (!s.container.getClientRects().length) continue;     // view hidden
    s.controls.update();
    if (s.tick) s.tick(t);
    s.renderer.render(s.scene, s.camera);
  }
  requestAnimationFrame(loop);
}

let refreshQueued = false;
window.rack3d = {
  /** Redraw USRP faces + LEDs from window._usrpAgg / usrpTestStatus. Batched per frame. */
  refresh() {
    if (refreshQueued) return;
    refreshQueued = true;
    requestAnimationFrame(() => { refreshQueued = false; refreshRack(); });
  },
};

initRack();
requestAnimationFrame(loop);
// Bench labels are painted once, so wait for the web fonts first.
(document.fonts ? document.fonts.ready : Promise.resolve()).then(() => {
  window.rack3d.refresh();
  const benchRow = document.getElementById('bench-row');
  if (benchRow) BENCHES.forEach(b => initBench(b, benchRow));
});
