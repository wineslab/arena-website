/* ============================================================
   app.js — Arena Antenna Mapper
   All UI logic: antenna grid, floor plan, USRP rack view,
   right-panel form, save/load to /api/mappings.
   ============================================================ */

/* ── Floor plan coordinates ───────────────────────────────────────────────────
   Each entry maps an antenna ID to its (left%, top%) position
   over the floor plan image. Used to place clickable dots.           */
const ANTENNA_COORDS = [
  // Arena 2
  {id:'AR2_A1', label:'A1', left:33.9, top:29.3},
  {id:'AR2_B1', label:'B1', left:35,   top:32.2},
  {id:'AR2_A2', label:'A2', left:36.6, top:27.5},
  {id:'AR2_B2', label:'B2', left:37.5, top:30.9},
  {id:'AR2_A3', label:'A3', left:39.1, top:26.3},
  {id:'AR2_B3', label:'B3', left:40.3, top:29.2},
  {id:'AR2_A4', label:'A4', left:41.7, top:24.8},
  {id:'AR2_B4', label:'B4', left:42.9, top:27.8},
  {id:'AR2_A5', label:'A5', left:44.1, top:23.4},
  {id:'AR2_B5', label:'B5', left:45.5, top:26.6},
  {id:'AR2_A6', label:'A6', left:46.9, top:21.5},
  {id:'AR2_B6', label:'B6', left:48.2, top:25.4},
  {id:'AR2_C2', label:'C2', left:38.8, top:35.4},
  {id:'AR2_D2', label:'D2', left:39.5, top:37.7},
  {id:'AR2_C3', label:'C3', left:41.3, top:33.8},
  {id:'AR2_D3', label:'D3', left:42.2, top:35.9},
  {id:'AR2_C4', label:'C4', left:44.0, top:32.2},
  {id:'AR2_D4', label:'D4', left:44.6, top:34.6},
  {id:'AR2_C5', label:'C5', left:46.1, top:30.8},
  {id:'AR2_D5', label:'D5', left:46.6, top:33.4},
  {id:'AR2_E1', label:'E1', left:38.4, top:44.2},
  {id:'AR2_F1', label:'F1', left:39.5, top:48.2},
  {id:'AR2_E2', label:'E2', left:40.9, top:42.9},
  {id:'AR2_F2', label:'F2', left:42.1, top:46.4},
  {id:'AR2_E3', label:'E3', left:43.6, top:41.4},
  {id:'AR2_F3', label:'F3', left:44.6, top:44.8},
  {id:'AR2_E4', label:'E4', left:46.0, top:40.0},
  {id:'AR2_F4', label:'F4', left:47.3, top:43.0},
  {id:'AR2_E5', label:'E5', left:48.6, top:38.4},
  {id:'AR2_F5', label:'F5', left:49.7, top:41.7},
  {id:'AR2_E6', label:'E6', left:50.8, top:37.0},
  {id:'AR2_F6', label:'F6', left:51.8, top:40.4},
  // Arena 1
  {id:'AR1_F5', label:'F5', left:62.2, top:40.8},
  {id:'AR1_F4', label:'F4', left:62.8, top:44.6},
  {id:'AR1_F3', label:'F3', left:63.0, top:48.9},
  {id:'AR1_F2', label:'F2', left:63.7, top:54.2},
  {id:'AR1_F1', label:'F1', left:64.1, top:57.7},
  {id:'AR1_E5', label:'E5', left:64.7, top:40.2},
  {id:'AR1_E4', label:'E4', left:65.3, top:44.1},
  {id:'AR1_E3', label:'E3', left:65.7, top:47.8},
  {id:'AR1_E2', label:'E2', left:66.2, top:52.8},
  {id:'AR1_E1', label:'E1', left:66.6, top:57.2},
  {id:'AR1_D5', label:'D5', left:68.2, top:37.8},
  {id:'AR1_D4', label:'D4', left:68.8, top:42.9},
  {id:'AR1_D3', label:'D3', left:69.1, top:46.9},
  {id:'AR1_D2', label:'D2', left:69.7, top:51.8},
  {id:'AR1_D1', label:'D1', left:70.0, top:55.8},
  {id:'AR1_C5', label:'C5', left:70.8, top:37.1},
  {id:'AR1_C4', label:'C4', left:71.5, top:42.3},
  {id:'AR1_C3', label:'C3', left:72.1, top:46.6},
  {id:'AR1_C2', label:'C2', left:72.6, top:51.1},
  {id:'AR1_C1', label:'C1', left:73.1, top:54.9},
  {id:'AR1_B8', label:'B8', left:72.7, top:25.0},
  {id:'AR1_B7', label:'B7', left:73.2, top:29.0},
  {id:'AR1_B6', label:'B6', left:73.7, top:33.7},
  {id:'AR1_B5', label:'B5', left:73.8, top:37.0},
  {id:'AR1_B4', label:'B4', left:74.3, top:40.7},
  {id:'AR1_B3', label:'B3', left:74.7, top:45.1},
  {id:'AR1_B2', label:'B2', left:75.3, top:50.0},
  {id:'AR1_B1', label:'B1', left:75.5, top:54.2},
  {id:'AR1_A8', label:'A8', left:75.3, top:24.2},
  {id:'AR1_A7', label:'A7', left:75.7, top:28.0},
  {id:'AR1_A6', label:'A6', left:76.1, top:31.9},
  {id:'AR1_A5', label:'A5', left:76.5, top:35.8},
  {id:'AR1_A4', label:'A4', left:77.1, top:39.8},
  {id:'AR1_A3', label:'A3', left:77.6, top:45.2},
  {id:'AR1_A2', label:'A2', left:78.0, top:49.4},
  {id:'AR1_A1', label:'A1', left:78.6, top:53.5},
];

/** Quick lookup: antenna_id → coordinate entry */
const COORD_MAP = {};
ANTENNA_COORDS.forEach(a => COORD_MAP[a.id] = a);


/* ── Grid layouts ─────────────────────────────────────────────────────────────
   Defines the row/column structure rendered in the Rack view table.
   Arena 1 — 4 columns, rows A–F (A and B span two table rows each).
   Arena 2 — 6 columns, rows A/B/E/F, with C/D side columns.           */

const LAYOUT_AR1 = [
  {row:'A', cols:['AR1_A1','AR1_A2','AR1_A3','AR1_A4']},
  {row:'A', cols:['AR1_A5','AR1_A6','AR1_A7','AR1_A8']},
  {row:'B', cols:['AR1_B1','AR1_B2','AR1_B3','AR1_B4']},
  {row:'B', cols:['AR1_B5','AR1_B6','AR1_B7','AR1_B8']},
  {row:'C', cols:['AR1_C1','AR1_C2','AR1_C3','AR1_C4']},
  {row:'D', cols:['AR1_D1','AR1_D2','AR1_D3','AR1_D4']},
  {row:'E', cols:['AR1_E1','AR1_E2','AR1_E3','AR1_E4']},
  {row:'F', cols:['AR1_F1','AR1_F2','AR1_F3','AR1_F4']},
];

const LAYOUT_AR2 = [
  {row:'A', cols:['AR2_A1','AR2_A2','AR2_A3','AR2_A4','AR2_A5','AR2_A6'], C:'AR2_C2', D:'AR2_D2'},
  {row:'B', cols:['AR2_B1','AR2_B2','AR2_B3','AR2_B4','AR2_B5','AR2_B6'], C:'AR2_C3', D:'AR2_D3'},
  {row:'E', cols:['AR2_E1','AR2_E2','AR2_E3','AR2_E4','AR2_E5','AR2_E6'], C:'AR2_C4', D:'AR2_D4'},
  {row:'F', cols:['AR2_F1','AR2_F2','AR2_F3','AR2_F4','AR2_F5','AR2_F6'], C:'AR2_C5', D:'AR2_D5'},
];


/* ── USRP hardware config ─────────────────────────────────────────────────────
   Port options per USRP model, shown in the right-panel dropdowns.    */

const USRP_PORTS = {
  'X410':['A:0','A:1','A:2','A:3','B:0','B:1','B:2','B:3'],
  'X310':['A:0','A:1','B:0','B:1'],
  'N310':['RF0:0','RF0:1','RF1:0','RF1:1','RF0_TX','RF0_RX','RF1_TX','RF1_RX'],
  'N320':['RF:0','RF:1','RF0_TX','RF0_RX','RF1_TX','RF1_RX','TX/RX','RX2'],
  'B210':['A:0','A:1','B:0','B:1','TX/RX','RX2'],
  'B200':['A:0','TX/RX','RX2'],
  'N210':['RF:0','RF:1','TX/RX','RX2'],
  'default':['TX_A','RX_A','RX_B','TX_B','RF0:0','RF0:1','RF1:0','RF1:1','TX/RX','RX2'],
};
const USRP_MODELS = ['X410','X310','N310','N320','B210','B200','N210'];


/* ── Helpers ──────────────────────────────────────────────────────────────── */

/** Strip the "AR1_" / "AR2_" prefix for compact display (e.g. "AR2_A1" → "A1"). */
function lbl(id){ return id.replace(/^AR[12]_/, ''); }

/** Flat list of every antenna ID across both arenas, in layout order. */
const ALL_IDS = [];
function collectIds(layout){
  layout.forEach(r => {
    r.cols.forEach(c => Array.isArray(c) ? ALL_IDS.push(...c) : ALL_IDS.push(c));
    if(r.C) ALL_IDS.push(r.C);
    if(r.D) ALL_IDS.push(r.D);
  });
}
collectIds(LAYOUT_AR1);
collectIds(LAYOUT_AR2);


/* ── Application state ───────────────────────────────────────────────────── */
let mappings = {};   // { antenna_id: { p1_serial, p1_model, p1_port, … } }
let selected = null; // currently selected antenna_id


/* ── Tab switching ───────────────────────────────────────────────────────── */

/** Switch between "floor" (Map view) and "antenna" (Rack view) tabs. */
function switchTab(tab){
  document.getElementById('view-antenna').style.display = tab==='antenna' ? '' : 'none';
  document.getElementById('view-floor').style.display   = tab==='floor'   ? '' : 'none';
  document.getElementById('tab-ant').className   = tab==='antenna' ? 'btn btn-primary' : 'btn btn-ghost';
  document.getElementById('tab-floor').className = tab==='floor'   ? 'btn btn-primary' : 'btn btn-ghost';
  if(tab==='antenna') buildUsrpView();
  if(tab==='floor')   buildFloorView();
}


/* ── Antenna grid (Rack view) ────────────────────────────────────────────── */

/** Rebuild both arena grids and refresh the stats counters. */
function buildTable(){
  buildOneGrid('ant-table-ar1', LAYOUT_AR1);
  buildOneGrid('ant-table-ar2', LAYOUT_AR2);
  updateStats();
}

/** Build a single arena's antenna table from a layout definition. */
function buildOneGrid(tableId, layout){
  const tbl = document.getElementById(tableId);
  tbl.innerHTML = '';

  const maxCols = Math.max(...layout.map(r => r.cols.length));
  const hasCD   = layout.some(r => r.C || r.D);

  // Header row
  const hr = tbl.createTHead().insertRow();
  const th = (txt, cls) => {
    const e = document.createElement('th');
    e.textContent = txt;
    if(cls) e.className = cls;
    hr.appendChild(e);
  };
  th('');
  for(let c = 1; c <= maxCols; c++) th(c);
  if(hasCD){ th('', 'spacer-col'); th('C'); th('D'); }

  // Data rows
  tbl.createTBody();
  layout.forEach(rowDef => {
    const tr = tbl.tBodies[0].insertRow();
    const rl = tr.insertCell();
    rl.className   = 'row-label';
    rl.textContent = rowDef.row;

    rowDef.cols.forEach(colDef => {
      const td = tr.insertCell();
      td.style.verticalAlign = 'middle';
      if(Array.isArray(colDef)){
        const wrap = document.createElement('div');
        wrap.className = 'cell-pair';
        colDef.forEach(id => wrap.appendChild(makeCell(id)));
        td.appendChild(wrap);
      } else {
        td.appendChild(makeCell(colDef));
      }
    });

    if(hasCD){
      tr.insertCell().className = 'spacer-col';
      [rowDef.C, rowDef.D].forEach(id => {
        const td = tr.insertCell();
        td.style.verticalAlign = 'middle';
        if(id) td.appendChild(makeCell(id));
      });
    }
  });
}

/** Create a single antenna cell element. */
function makeCell(id){
  const m   = mappings[id];
  const div = document.createElement('div');
  div.className = 'cell' + (m ? ' mapped' : '') + (selected===id ? ' active' : '');
  const txCls = m ? 'tx' : 'u';
  const rxCls = m ? 'rx' : 'u';
  div.innerHTML = `
    <span class="cell-id">${lbl(id)}</span>
    <div class="dots">
      <span class="dot ${txCls}"></span>
      <span class="dot ${rxCls}"></span>
    </div>
    ${m ? `<span class="cell-tag">${m.p1_serial||''}</span>` : ''}`;
  div.onclick = () => selectCell(id);
  return div;
}


/* ── USRP rack view ──────────────────────────────────────────────────────── */

// Known rack order for each arena (IPs of the USRPs in slot order)
const RACK_ORDER_AR1 = [
  '192.168.40.xx','192.168.40.xx',
  '192.168.40.xx','192.168.40.xx',
];
const RACK_ORDER_AR2 = [
  '192.168.40.58','192.168.40.62',
  '192.168.40.34','192.168.40.38',
  '192.168.40.50','192.168.40.54',
  '192.168.40.42','192.168.40.46',
  '192.168.40.18','192.168.40.20',
];

/** Build the USRP card grids for both arenas from current mappings. */
function buildUsrpView(){
  // Aggregate port usage per USRP IP
  const usrps = {};
  Object.entries(mappings).forEach(([antId, m]) => {
    if(m.p1_serial){
      if(!usrps[m.p1_serial]) usrps[m.p1_serial] = {model:m.p1_model, ports:[]};
      usrps[m.p1_serial].ports.push({ant:antId, port:m.p1_port, type:'TX/Rx1'});
    }
    if(m.p2_serial){
      if(!usrps[m.p2_serial]) usrps[m.p2_serial] = {model:m.p2_model, ports:[]};
      usrps[m.p2_serial].ports.push({ant:antId, port:m.p2_port, type:'Rx2'});
    }
  });
  buildOneUsrpGrid('usrp-grid-ar1', RACK_ORDER_AR1, usrps);
  buildOneUsrpGrid('usrp-grid-ar2', RACK_ORDER_AR2, usrps);
}

function buildOneUsrpGrid(gridId, rackOrder, usrps){
  const grid       = document.getElementById(gridId);
  const tableAbove = grid.parentElement.querySelector('.ant-table');
  const tableWidth = tableAbove ? tableAbove.offsetWidth : 0;
  grid.style.cssText = `display:grid;grid-template-columns:1fr 1fr;gap:8px;${tableWidth?'max-width:'+tableWidth+'px;':''}`;
  grid.innerHTML = '';
  rackOrder.forEach(ip => {
    const u           = usrps[ip];
    const hasMappings = u && u.ports.length > 0;
    const card        = document.createElement('div');
    card.style.cssText = `border:1px solid ${hasMappings?'var(--green)':'var(--border)'};border-radius:var(--radius);padding:10px;background:${hasMappings?'#d1fae5':'var(--bg3)'};cursor:pointer;`;
    card.innerHTML = `
      <div style="font-family:var(--mono);font-size:11px;font-weight:500;color:var(--text);margin-bottom:3px;">${ip}</div>
      <div style="font-family:var(--mono);font-size:9px;color:var(--blue-text);margin-bottom:4px;">${u?u.model:'—'}</div>
      <div style="font-family:var(--mono);font-size:9px;color:${hasMappings?'var(--green-text)':'var(--text3)'};">${hasMappings?u.ports.length+' ports':'not mapped'}</div>`;
    card.onclick = () => selectUsrp(ip, u);
    grid.appendChild(card);
  });
}

/** Show a USRP's port assignments in the right panel. */
function selectUsrp(ip, u){
  if(!u){
    document.getElementById('right-content').innerHTML =
      `<div class="empty-panel">${ip}<br>not mapped yet</div>`;
    return;
  }
  const rows = u.ports.map(p => `
    <div style="border:1px solid var(--border);border-radius:var(--radius);padding:10px;margin-bottom:8px;background:var(--bg3);">
      <div style="display:flex;justify-content:space-between;margin-bottom:6px;">
        <span style="font-family:var(--mono);font-size:13px;font-weight:500;color:var(--text)">${lbl(p.ant)}</span>
        <span style="font-family:var(--mono);font-size:10px;color:${p.type==='TX/Rx1'?'var(--blue-text)':'var(--green-text)'};">${p.type}</span>
      </div>
      <div style="font-family:var(--mono);font-size:10px;color:var(--text2);">port: ${p.port||'—'}</div>
    </div>`).join('');
  document.getElementById('right-content').innerHTML =
    `<div class="panel-title"><span>usrp</span><span class="ant-name">${ip}</span></div>${rows}`;
}


/* ── Floor plan view (pan / zoom) ────────────────────────────────────────── */

let floorScale    = 1, floorPanX = 0, floorPanY = 0;
let floorIsPanning = false, floorStartX, floorStartY, floorStartPanX, floorStartPanY;
let floorLastDist = 0;
let floorInited   = false; // guard so interaction listeners are added only once

/** Apply the current pan/scale transform to #floor-wrap. */
function applyFloorTransform(){
  const wrap = document.getElementById('floor-wrap');
  if(wrap) wrap.style.transform = `translate(${floorPanX}px,${floorPanY}px) scale(${floorScale})`;
}

/** Prevent panning outside the image boundaries. */
function clampFloorPan(){
  if(floorScale <= 1){ floorPanX = 0; floorPanY = 0; return; }
  const vp   = document.getElementById('floor-viewport');
  if(!vp) return;
  const rect = vp.getBoundingClientRect();
  floorPanX  = Math.max(rect.width  * (1 - floorScale), Math.min(0, floorPanX));
  floorPanY  = Math.max(rect.height * (1 - floorScale), Math.min(0, floorPanY));
}

/** Attach mouse / wheel / touch interaction handlers (once). */
function initFloorInteractions(){
  if(floorInited) return;
  floorInited = true;
  const vp = document.getElementById('floor-viewport');

  // Scroll to zoom, centred on the cursor
  vp.addEventListener('wheel', (e) => {
    e.preventDefault();
    const rect     = vp.getBoundingClientRect();
    const mx       = e.clientX - rect.left;
    const my       = e.clientY - rect.top;
    const oldScale = floorScale;
    floorScale     = Math.max(1, Math.min(5, floorScale + (e.deltaY < 0 ? 0.2 : -0.2)));
    floorPanX      = mx - (mx - floorPanX) * (floorScale / oldScale);
    floorPanY      = my - (my - floorPanY) * (floorScale / oldScale);
    clampFloorPan();
    applyFloorTransform();
  }, {passive:false});

  // Mouse drag to pan
  vp.addEventListener('mousedown', (e) => {
    if(e.target.classList.contains('floor-dot')) return; // let dot clicks through
    floorIsPanning = true;
    vp.classList.add('grabbing');
    floorStartX = e.clientX; floorStartY = e.clientY;
    floorStartPanX = floorPanX; floorStartPanY = floorPanY;
    e.preventDefault();
  });
  window.addEventListener('mousemove', (e) => {
    if(!floorIsPanning) return;
    floorPanX = floorStartPanX + (e.clientX - floorStartX);
    floorPanY = floorStartPanY + (e.clientY - floorStartY);
    clampFloorPan();
    applyFloorTransform();
  });
  window.addEventListener('mouseup', () => {
    floorIsPanning = false;
    vp.classList.remove('grabbing');
  });

  // Touch: single finger pan, two finger pinch-to-zoom
  vp.addEventListener('touchstart', (e) => {
    if(e.touches.length === 2){
      floorLastDist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
    } else if(e.touches.length === 1 && floorScale > 1){
      floorIsPanning = true;
      floorStartX = e.touches[0].clientX; floorStartY = e.touches[0].clientY;
      floorStartPanX = floorPanX; floorStartPanY = floorPanY;
    }
  }, {passive:true});

  vp.addEventListener('touchmove', (e) => {
    if(e.touches.length === 2){
      e.preventDefault();
      const dist     = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      const oldScale = floorScale;
      floorScale     = Math.max(1, Math.min(5, floorScale * (dist / floorLastDist)));
      floorLastDist  = dist;
      const rect     = vp.getBoundingClientRect();
      const mx       = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left;
      const my       = (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top;
      floorPanX      = mx - (mx - floorPanX) * (floorScale / oldScale);
      floorPanY      = my - (my - floorPanY) * (floorScale / oldScale);
      clampFloorPan();
      applyFloorTransform();
    } else if(floorIsPanning && e.touches.length === 1){
      floorPanX = floorStartPanX + (e.touches[0].clientX - floorStartX);
      floorPanY = floorStartPanY + (e.touches[0].clientY - floorStartY);
      clampFloorPan();
      applyFloorTransform();
    }
  }, {passive:false});

  vp.addEventListener('touchend', () => { floorIsPanning = false; });

  // Double-click to reset zoom/pan
  vp.addEventListener('dblclick', (e) => {
    if(e.target.classList.contains('floor-dot')) return;
    floorScale = 1; floorPanX = 0; floorPanY = 0;
    applyFloorTransform();
  });
}

/** Rebuild the floor plan: image + all antenna dots + labels. */
function buildFloorView(){
  const wrap = document.getElementById('floor-wrap');
  wrap.innerHTML = '<img id="floor-img" src="/floorplan" draggable="false" style="width:100%;display:block;pointer-events:none;user-select:none;">';

  ANTENNA_COORDS.forEach(a => {
    const isMapped = !!mappings[a.id];
    const isActive = selected === a.id;

    // Clickable dot
    const dot = document.createElement('div');
    dot.className  = 'floor-dot' + (isActive ? ' active' : isMapped ? ' mapped' : ' unmapped');
    dot.id         = 'fdot-' + a.id;
    dot.style.left = a.left + '%';
    dot.style.top  = a.top  + '%';
    dot.title      = a.label + (isMapped ? ' (mapped)' : '');
    dot.onclick    = (e) => { e.stopPropagation(); selectCell(a.id); };
    wrap.appendChild(dot);

    // Text label above the dot
    const label = document.createElement('div');
    label.className  = 'floor-label';
    label.id         = 'flbl-' + a.id;
    label.style.left = a.left + '%';
    label.style.top  = (a.top - 2.0) + '%';
    label.textContent = a.label;
    wrap.appendChild(label);
  });

  // Dev helper: click empty space to log coordinate for new antenna placement
  wrap.addEventListener('click', (e) => {
    if(e.target.classList.contains('floor-dot')) return;
    const img  = document.getElementById('floor-img');
    if(!img) return;
    const rect = img.getBoundingClientRect();
    const x    = ((e.clientX - rect.left) / rect.width  * 100).toFixed(1);
    const y    = ((e.clientY - rect.top)  / rect.height * 100).toFixed(1);
    console.log(`{id:'??', left:${x}, top:${y}},`);
  });

  applyFloorTransform();
  initFloorInteractions();
}

/** Update only the dot colours without rebuilding the full floor plan. */
function refreshFloorDots(){
  ANTENNA_COORDS.forEach(a => {
    const dot = document.getElementById('fdot-' + a.id);
    if(!dot) return;
    const isMapped = !!mappings[a.id];
    const isActive = selected === a.id;
    dot.className = 'floor-dot' + (isActive ? ' active' : isMapped ? ' mapped' : ' unmapped');
    dot.title     = a.label + (isMapped ? ' (mapped)' : '');
  });
}


/* ── Selection & right panel ─────────────────────────────────────────────── */

/** Select an antenna by ID — updates grid, floor dots, and right panel. */
function selectCell(id){
  selected = id;
  buildTable();
  refreshFloorDots();
  renderPanel(id);
}

/** Render the antenna configuration form in the right panel. */
function renderPanel(id){
  const m = mappings[id] || {};
  document.getElementById('right-content').innerHTML = `
    <div class="panel-title">
      <span>antenna</span>
      <span class="ant-name">${lbl(id)}</span>
      ${mappings[id] ? '<span style="color:var(--green);font-size:10px">● mapped</span>' : ''}
    </div>

    <div style="font-family:var(--mono);font-size:10px;color:var(--blue-text);margin-bottom:8px;">— PORT 1: TX/Rx1 —</div>
    <div class="form-row">
      <div class="form-group"><label>USRP IP</label>
        <input id="f-serial1" type="text" placeholder="192.168.40.xx" value="${m.p1_serial||''}">
      </div>
      <div class="form-group"><label>USRP model</label>
        <select id="f-model1" onchange="updatePorts('1')">
          <option value="">-- model --</option>
          ${USRP_MODELS.map(x => `<option ${m.p1_model===x?'selected':''} value="${x}">${x}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Port</label>
        <select id="f-port1">
          <option value="">--</option>
          ${(USRP_PORTS[m.p1_model]||USRP_PORTS.default).map(p => `<option ${m.p1_port===p?'selected':''} value="${p}">${p}</option>`).join('')}
        </select>
      </div>
    </div>

    <div style="font-family:var(--mono);font-size:10px;color:var(--green-text);margin:10px 0 8px;">— PORT 2: Rx2 —</div>
    <div class="form-row">
      <div class="form-group"><label>USRP IP</label>
        <input id="f-serial2" type="text" placeholder="192.168.40.xx" value="${m.p2_serial||''}">
      </div>
      <div class="form-group"><label>USRP model</label>
        <select id="f-model2" onchange="updatePorts('2')">
          <option value="">-- model --</option>
          ${USRP_MODELS.map(x => `<option ${m.p2_model===x?'selected':''} value="${x}">${x}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Port</label>
        <select id="f-port2">
          <option value="">--</option>
          ${(USRP_PORTS[m.p2_model]||USRP_PORTS.default).map(p => `<option ${m.p2_port===p?'selected':''} value="${p}">${p}</option>`).join('')}
        </select>
      </div>
    </div>

    <div class="btn-row">
      <button class="btn btn-primary" onclick="saveMapping('${id}')">Save</button>
      ${mappings[id] ? `<button class="btn btn-danger" onclick="clearMapping('${id}')">Clear</button>` : ''}
    </div>`;
}


/* ── Persistence ─────────────────────────────────────────────────────────── */

/** Load all mappings from the server on startup. */
async function loadFromServer(){
  const res = await fetch('/api/mappings');
  mappings  = await res.json();
  buildTable();
  buildFloorView();
}

/** Push the current mappings state to the server. */
async function saveToServer(){
  setStatus('saving');
  await fetch('/api/mappings', {
    method:  'POST',
    headers: {'Content-Type': 'application/json'},
    body:    JSON.stringify(mappings),
  });
  setStatus('saved');
}

/** Update the auto-save indicator in the header. */
function setStatus(s){
  const el = document.getElementById('save-status');
  if(s === 'saved')  { el.textContent = '● saved';    el.className = 'save-status saved';  }
  if(s === 'saving') { el.textContent = '● saving…';  el.className = 'save-status saving'; }
}

/** Save the form values for a single antenna, then refresh the UI. */
async function saveMapping(id){
  const p1_serial = document.getElementById('f-serial1').value.trim();
  const p1_model  = document.getElementById('f-model1').value;
  const p1_port   = document.getElementById('f-port1').value;
  const p2_serial = document.getElementById('f-serial2').value.trim();
  const p2_model  = document.getElementById('f-model2').value;
  const p2_port   = document.getElementById('f-port2').value;
  if(p1_serial || p1_port || p2_serial || p2_port){
    mappings[id] = {p1_serial, p1_model, p1_port, p2_serial, p2_model, p2_port};
    await saveToServer();
    showToast('Saved ' + lbl(id));
  }
  buildTable();
  refreshFloorDots();
  renderPanel(id);
}

/** Remove a single antenna's mapping, then refresh the UI. */
async function clearMapping(id){
  delete mappings[id];
  await saveToServer();
  buildTable();
  refreshFloorDots();
  renderPanel(id);
  showToast('Cleared ' + lbl(id));
}


/* ── Stats counters ──────────────────────────────────────────────────────── */

/** Update the "X/Y USRPs active" counters in the Rack view header. */
function updateStats(){
  const ar1Ids = ALL_IDS.filter(id => id.startsWith('AR1_'));
  const ar2Ids = ALL_IDS.filter(id => id.startsWith('AR2_'));

  // Count active USRP IPs per arena
  const usedIPs = new Set();
  Object.values(mappings).forEach(m => {
    if(m.p1_serial) usedIPs.add(m.p1_serial);
    if(m.p2_serial) usedIPs.add(m.p2_serial);
  });

  document.getElementById('s-ar1-usrp').textContent =
    RACK_ORDER_AR1.filter(ip => usedIPs.has(ip)).length + '/' + RACK_ORDER_AR1.length;
  document.getElementById('s-ar2-usrp').textContent =
    RACK_ORDER_AR2.filter(ip => usedIPs.has(ip)).length + '/' + RACK_ORDER_AR2.length;
}


/* ── UI utilities ────────────────────────────────────────────────────────── */

/** Show a brief toast notification at the bottom-right of the screen. */
function showToast(msg){
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2000);
}

/** Repopulate a port dropdown when the USRP model changes. */
function updatePorts(num){
  const model   = document.getElementById(`f-model${num}`).value;
  const portSel = document.getElementById(`f-port${num}`);
  const ports   = USRP_PORTS[model] || USRP_PORTS.default;
  portSel.innerHTML = `<option value="">--</option>` +
    ports.map(p => `<option value="${p}">${p}</option>`).join('');
}


/* ── Bootstrap ───────────────────────────────────────────────────────────── */
loadFromServer();
