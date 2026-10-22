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
  {id:'AR1_F5', label:'F5', left:60.2, top:39.8},
  {id:'AR1_F4', label:'F4', left:60.8, top:43.6},
  {id:'AR1_F3', label:'F3', left:61.0, top:47.9},
  {id:'AR1_F2', label:'F2', left:61.7, top:53.2},
  {id:'AR1_F1', label:'F1', left:62.1, top:56.7},
  {id:'AR1_E5', label:'E5', left:62.7, top:39.2},
  {id:'AR1_E4', label:'E4', left:63.3, top:43.1},
  {id:'AR1_E3', label:'E3', left:63.7, top:46.8},
  {id:'AR1_E2', label:'E2', left:64.2, top:51.8},
  {id:'AR1_E1', label:'E1', left:64.6, top:56.2},
  {id:'AR1_D5', label:'D5', left:66.2, top:37.8},
  {id:'AR1_D4', label:'D4', left:66.8, top:42.9},
  {id:'AR1_D3', label:'D3', left:67.1, top:46.9},
  {id:'AR1_D2', label:'D2', left:67.7, top:51.8},
  {id:'AR1_D1', label:'D1', left:68.0, top:55.8},
  {id:'AR1_C5', label:'C5', left:68.8, top:37.1},
  {id:'AR1_C4', label:'C4', left:69.5, top:42.3},
  {id:'AR1_C3', label:'C3', left:70.1, top:46.6},
  {id:'AR1_C2', label:'C2', left:70.6, top:51.1},
  {id:'AR1_C1', label:'C1', left:71.1, top:54.9},
  {id:'AR1_B8', label:'B8', left:70.7, top:25.0},
  {id:'AR1_B7', label:'B7', left:71.2, top:29.0},
  {id:'AR1_B6', label:'B6', left:71.7, top:33.7},
  {id:'AR1_B5', label:'B5', left:71.8, top:37.0},
  {id:'AR1_B4', label:'B4', left:72.3, top:40.7},
  {id:'AR1_B3', label:'B3', left:72.7, top:45.1},
  {id:'AR1_B2', label:'B2', left:73.3, top:50.0},
  {id:'AR1_B1', label:'B1', left:73.5, top:54.2},
  {id:'AR1_A8', label:'A8', left:73.3, top:24.2},
  {id:'AR1_A7', label:'A7', left:73.7, top:28.0},
  {id:'AR1_A6', label:'A6', left:74.1, top:31.9},
  {id:'AR1_A5', label:'A5', left:74.5, top:35.8},
  {id:'AR1_A4', label:'A4', left:75.1, top:39.8},
  {id:'AR1_A3', label:'A3', left:75.6, top:45.2},
  {id:'AR1_A2', label:'A2', left:76.0, top:49.4},
  {id:'AR1_A1', label:'A1', left:76.6, top:53.5},
];
/** Quick lookup: antenna_id → coordinate entry */
const COORD_MAP = {};
ANTENNA_COORDS.forEach(a => COORD_MAP[a.id] = a);

/** Snapshot of the *default* (hard-coded) positions, used to revert an
 *  antenna back to its original spot from the "Reset to default" menu item. */
const DEFAULT_COORDS = {};
ANTENNA_COORDS.forEach(a => DEFAULT_COORDS[a.id] = { left: a.left, top: a.top });


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
let currentFloor = 6; // 6 or 7 — which floor plan is shown


/* ── Global undo stack (Ctrl/Cmd + Z) ─────────────────────────────────────
   Any mutation that wants to be undoable pushes `{label, undo}` onto
   window.UndoStack. The keyboard handler at the bottom pops the latest
   entry and awaits its undo(). Each subsystem (devices.js, phone.js,
   antenna ops here) is responsible for snapshotting state *before* the
   mutation so the undo() can restore it. */
window.UndoStack = (function(){
  const stack = [];
  const MAX   = 100;
  return {
    push(action){
      if(!action || typeof action.undo !== 'function') return;
      stack.push(action);
      if(stack.length > MAX) stack.shift();
    },
    async pop(){
      const a = stack.pop();
      if(!a) return null;
      try { await a.undo(); return a; }
      catch(e){ console.warn('undo failed', e); return null; }
    },
    size(){ return stack.length; },
    clear(){ stack.length = 0; },
  };
}());

document.addEventListener('keydown', async (e) => {
  if(!(e.ctrlKey || e.metaKey)) return;
  if(e.key !== 'z' && e.key !== 'Z') return;
  if(e.shiftKey || e.altKey) return;   // don't hijack redo combos
  const t = e.target;
  if(t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
  if(window.UndoStack.size() === 0) return;
  e.preventDefault();
  const a = await window.UndoStack.pop();
  if(typeof showToast === 'function' && a){
    showToast('Undid' + (a.label ? ': ' + a.label : ''));
  }
});

/** Floor an antenna belongs to (defaults to 6 if not tagged on the coord entry). */
function antennaFloor(a){ return a.floor || 6; }


/* ── Tab switching ───────────────────────────────────────────────────────── */

/** Switch between "floor" (Map view) and "antenna" (Rack view) tabs. */
function switchTab(tab){
  document.getElementById('view-antenna').style.display = tab==='antenna' ? '' : 'none';
  document.getElementById('view-floor').style.display   = tab==='floor'   ? '' : 'none';
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
  '192.168.40.30','192.168.40.28',
  '192.168.40.26','192.168.40.24',
];
const RACK_ORDER_AR2 = [
  '192.168.40.58','192.168.40.62',
  '192.168.40.34','192.168.40.38',
  '192.168.40.50','192.168.40.54',
  '192.168.40.42','192.168.40.46',
  '192.168.40.18','192.168.40.20',
];

/** Build the USRP card grids for both arenas from current mappings. */
async function buildUsrpView(){
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
  // Pull last-test summary per IP so cards can show status + relative time
  await refreshTestStatus();
  buildOneUsrpGrid('usrp-grid-ar1', RACK_ORDER_AR1, usrps);
  buildOneUsrpGrid('usrp-grid-ar2', RACK_ORDER_AR2, usrps);
  window._usrpAgg = usrps;                        // read by rack3d.js
  if(window.rack3d) window.rack3d.refresh();
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
    card.id = 'usrp-card-' + cssId(ip);
    card.style.cssText = `border:1px solid ${hasMappings?'var(--green)':'var(--border)'};border-radius:var(--radius);padding:10px;background:${hasMappings?'#d1fae5':'var(--bg3)'};cursor:pointer;`;
    card.innerHTML = renderUsrpCardBody(ip, u, hasMappings);
    card.onclick = (e) => {
      // Clicks on the Test button are handled separately
      if(e.target.closest('.usrp-test-btn')) return;
      selectUsrp(ip, u);
    };
    grid.appendChild(card);
    // Wire the Test button
    const btn = card.querySelector('.usrp-test-btn');
    if(btn) btn.onclick = (e) => { e.stopPropagation(); startUsrpTest(ip); };
  });
  // Pick a run-all back up if one is still going (e.g. after a page reload).
  pollQueue();
}

/** Compose the inner HTML for one USRP card. */
function renderUsrpCardBody(ip, u, hasMappings){
  const test     = usrpTestStatus[ip];
  const isRunning = test && test.status === 'running';
  return `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
      <div style="font-family:var(--mono);font-size:13px;font-weight:600;color:var(--text);">${ip}</div>
      ${testStatusPill(test)}
    </div>
    <div style="font-family:var(--mono);font-size:11px;color:var(--blue-text);margin-bottom:6px;">${u?u.model:'—'}</div>
    <div style="display:flex;justify-content:space-between;align-items:center;">
      <div style="font-family:var(--mono);font-size:11px;color:${hasMappings?'var(--green-text)':'var(--text3)'};">${hasMappings?u.ports.length+' ports':'not mapped'}</div>
      <button class="btn btn-primary usrp-test-btn" style="padding:5px 12px;font-size:12px;" ${isRunning?'disabled':''}>
        ${isRunning?'Testing…':'Test'}
      </button>
    </div>`;
}

/** Show a USRP's port assignments in the right panel. */
function selectUsrp(ip, u){
  openDetailPanel();
  if(!u){
    const test = usrpTestStatus[ip];
    const lastBlock = test ? `
    <div style="margin-top:14px;padding-top:10px;border-top:1px dashed var(--border);">
      <div style="font-family:var(--mono);font-size:10px;color:var(--text2);margin-bottom:6px;">last test</div>
      <div style="display:flex;justify-content:space-between;align-items:center;">
        ${testStatusPill(test)}
        <button class="btn btn-ghost" style="font-size:10px;padding:4px 8px;" onclick="openUsrpTestResult(${test.id})">View result</button>
      </div>
    </div>` : '';
    document.getElementById('right-content').innerHTML =
      `<div class="empty-panel">${ip}<br>not mapped yet</div>${lastBlock}`;
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
  const test = usrpTestStatus[ip];
  const lastBlock = test ? `
    <div style="margin-top:14px;padding-top:10px;border-top:1px dashed var(--border);">
      <div style="font-family:var(--mono);font-size:10px;color:var(--text2);margin-bottom:6px;">last test</div>
      <div style="display:flex;justify-content:space-between;align-items:center;">
        ${testStatusPill(test)}
        <button class="btn btn-ghost" style="font-size:10px;padding:4px 8px;" onclick="openUsrpTestResult(${test.id})">View result</button>
      </div>
    </div>` : '';
  document.getElementById('right-content').innerHTML =
    `<div class="panel-title"><span>usrp</span><span class="ant-name">${ip}</span></div>${rows}${lastBlock}`;
}


/* ── USRP test runner (frontend) ─────────────────────────────────────────── */

/** Latest test summary per USRP IP — populated from /api/test/usrp/history. */
let usrpTestStatus = {};

/** Active polling timers, keyed by job_id. */
const _testPollers = {};

/** The currently running job, or null. Used to stop it on page unload. */
let _activeJob = null;        // {id, ip}

/** Make an IP safe for use as a CSS id suffix (replace dots). */
function cssId(s){ return String(s).replace(/[^a-zA-Z0-9_-]/g, '_'); }

/** Compact "5m ago" / "2h ago" formatter for an ISO timestamp. */
function relTime(iso){
  if(!iso) return '';
  const t = new Date(iso).getTime();
  if(Number.isNaN(t)) return '';
  const s = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if(s < 60) return s + 's ago';
  if(s < 3600) return Math.floor(s/60) + 'm ago';
  if(s < 86400) return Math.floor(s/3600) + 'h ago';
  return Math.floor(s/86400) + 'd ago';
}

/** Coloured status pill for a test summary. */
function testStatusPill(test){
  if(!test){
    return `<span style="font-family:var(--mono);font-size:11px;color:var(--text3);">untested</span>`;
  }
  const map = {
    success:  {label: '✓ pass',     color: 'var(--green-text)',  bg: '#d1fae5'},
    failure:  {label: '✗ fail',     color: '#b91c1c',            bg: '#fee2e2'},
    error:    {label: '! error',    color: '#92400e',            bg: '#fef3c7'},
    running:  {label: '… running',  color: 'var(--blue-text)',   bg: '#dbeafe'},
    cancelled:{label: '⊘ stopped',  color: 'var(--text2)',       bg: 'var(--bg3)'},
    tbd:      {label: '✓ measured', color: 'var(--green-text)',  bg: '#d1fae5'},
    queued:   {label: '• queued',   color: 'var(--text2)',       bg: 'var(--bg3)'},
  };
  const m = map[test.status] || {label: test.status, color: 'var(--text2)', bg: 'var(--bg3)'};
  // A queued job hasn't started, so showing its age makes it look like it is
  // running. Only jobs that have actually run get a timestamp.
  const when = test.status === 'queued'
    ? '' : relTime(test.finished_at || test.started_at);
  return `<span style="font-family:var(--mono);font-size:11px;color:${m.color};background:${m.bg};padding:3px 8px;border-radius:8px;white-space:nowrap;">${m.label}${when?' · '+when:''}</span>`;
}

/** Pull the latest-test-per-IP map from the server. */
async function refreshTestStatus(){
  try {
    const res = await fetch('/api/test/usrp/history');
    if(!res.ok) return;
    usrpTestStatus = await res.json();
  } catch(err){
    console.warn('test history fetch failed', err);
  }
}

/** Update one card in-place to reflect the current usrpTestStatus[ip]. */
function refreshUsrpCard(ip){
  const card = document.getElementById('usrp-card-' + cssId(ip));
  if(!card) return;
  // Recompute u from current mappings (may not be needed often)
  let u = null;
  Object.values(mappings).forEach(m => {
    if(m.p1_serial === ip){
      if(!u) u = {model: m.p1_model, ports: []};
      u.ports.push({type: 'TX/Rx1'});
    }
    if(m.p2_serial === ip){
      if(!u) u = {model: m.p2_model, ports: []};
      u.ports.push({type: 'Rx2'});
    }
  });
  card.innerHTML = renderUsrpCardBody(ip, u, !!(u && u.ports.length));
  if(window.rack3d) window.rack3d.refresh();
  const btn = card.querySelector('.usrp-test-btn');
  if(btn) btn.onclick = (e) => { e.stopPropagation(); startUsrpTest(ip); };
}

/** True if any USRP test is currently running. */
function anyTestRunning(){
  return Object.keys(_testPollers).length > 0 ||
         Object.values(usrpTestStatus).some(t => t && t.status === 'running');
}

/** Resolve once the detail panel's slide-in transition has finished, so the
 *  live-stream view is actually visible before we kick off the (slow) test. */
function panelVisible(){
  return new Promise(resolve => {
    const p = document.getElementById('detail-panel');
    if(!p){ resolve(); return; }
    let done = false;
    const finish = () => {
      if(done) return;
      done = true;
      p.removeEventListener('transitionend', finish);
      resolve();
    };
    p.addEventListener('transitionend', finish);
    setTimeout(finish, 350);   // fallback if transitionend never fires
  });
}

/** Open the live-stream panel, wait for it to be visible, then start the test.
 *  Only one test runs at a time. */
async function startUsrpTest(ip){
  if(anyTestRunning()){
    showToast('A test is already running — wait for it to finish');
    return;
  }

  // Show the side panel with a "starting" live-stream view BEFORE the slow
  // backend call, so the user immediately sees where output will appear.
  openDetailPanel();
  renderTestPanel({
    id: null, usrp_ip: ip, status: 'running',
    started_at: new Date().toISOString(), log: 'Starting test…\n', plots: [],
  });

  await panelVisible();
  _launchUsrpTest(ip);
}

/** POST /api/test/usrp and start polling. */
async function _launchUsrpTest(ip){
  let res, data;
  try {
    res = await fetch('/api/test/usrp', {
      method:  'POST',
      headers: {'Content-Type': 'application/json'},
      body:    JSON.stringify({ip}),
    });
    data = await res.json();
  } catch(err){
    showToast('Failed to start test');
    renderTestPanel({id: null, usrp_ip: ip, status: 'error',
                     error: 'Could not reach the server', log: '', plots: []});
    return;
  }
  if(!res.ok){
    showToast(data.error || 'Failed to start test');
    renderTestPanel({id: null, usrp_ip: ip, status: 'error',
                     error: data.error || 'Failed to start test', log: '', plots: []});
    return;
  }
  // Optimistic local status so the card flips to "running" immediately
  usrpTestStatus[ip] = {
    id: data.job_id, usrp_ip: ip, status: 'running',
    started_at: new Date().toISOString(), finished_at: null,
  };
  _activeJob = {id: data.job_id, ip};
  refreshUsrpCard(ip);
  pollTest(data.job_id, ip);
}

/** Stop a running test (Stop button). */
async function cancelUsrpTest(jobId, ip){
  try {
    await fetch('/api/test/usrp/' + jobId + '/cancel', {method: 'POST'});
  } catch(err){
    showToast('Could not reach server to stop test');
    return;
  }
  showToast('Stopping test…');
  // The poller will pick up the terminal 'cancelled' status on its next tick.
}

// Stop a running test when the page is refreshed or closed, so it doesn't keep
// hanging on the server. sendBeacon fires reliably during unload.
window.addEventListener('pagehide', () => {
  if(_activeJob && navigator.sendBeacon){
    navigator.sendBeacon('/api/test/usrp/' + _activeJob.id + '/cancel');
  }
});

/** Poll /api/test/usrp/<id> until terminal status, updating the panel each tick. */
function pollTest(jobId, ip){
  if(_testPollers[jobId]) return;
  const tick = async () => {
    try {
      const res = await fetch('/api/test/usrp/' + jobId);
      if(!res.ok) throw new Error('status ' + res.status);
      const job = await res.json();
      renderTestPanel(job);
      // Mirror running/done state into the card
      usrpTestStatus[ip] = {
        id: job.id, usrp_ip: ip, status: job.status,
        started_at: job.started_at, finished_at: job.finished_at,
      };
      refreshUsrpCard(ip);
      if(job.status !== 'running'){
        clearInterval(_testPollers[jobId]);
        delete _testPollers[jobId];
        if(_activeJob && _activeJob.id === jobId) _activeJob = null;
      }
    } catch(err){
      console.warn('poll error', err);
    }
  };
  tick();
  _testPollers[jobId] = setInterval(tick, 1500);
}

/* ── Run all (serial queue) ──────────────────────────────────────────────── */

/** Every USRP shown in the rack, in slot order. */
function allRackIps(){
  return [...RACK_ORDER_AR1, ...RACK_ORDER_AR2];
}

/** 400 -> "6m 40s", 45 -> "45s". */
function fmtDuration(secs){
  const s = Math.max(0, Math.round(secs));
  if(s < 60) return s + 's';
  const m = Math.floor(s / 60);
  return s % 60 ? `${m}m ${s % 60}s` : `${m}m`;
}

/** Queue a test for every USRP in the rack. They run one at a time — the test
 *  scripts share one working directory, so they cannot run in parallel. */
async function runAllUsrpTests(){
  if(_queueActive){ cancelAllUsrpTests(); return; }
  if(anyTestRunning()){
    showToast('A test is already running — wait for it to finish');
    return;
  }
  const ips = allRackIps();

  // Ask the server what a single test currently averages, so the confirm shows
  // a real estimate rather than a guess.
  let per = 40;
  try {
    const q = await fetch('/api/test/usrp/queue');
    if(q.ok) per = (await q.json()).seconds_per_test || per;
  } catch(err){ /* fall back to the default estimate */ }

  if(!confirm(`Test all ${ips.length} USRPs?\n\n`
            + `They run one at a time (about ${fmtDuration(per)} each), `
            + `so this takes roughly ${fmtDuration(per * ips.length)}.`)) return;

  let res, data;
  try {
    res = await fetch('/api/test/usrp/run-all', {
      method:  'POST',
      headers: {'Content-Type': 'application/json'},
      body:    JSON.stringify({ips}),
    });
    data = await res.json();
  } catch(err){
    showToast('Failed to start run-all');
    return;
  }
  if(!res.ok){
    showToast(data.error || 'Failed to start run-all');
    return;
  }
  showToast(`Queued ${data.queued.length} tests — about ${fmtDuration(data.estimate_seconds)}`);
  await refreshTestStatus();
  allRackIps().forEach(refreshUsrpCard);
  pollQueue();
}

/** Drop the rest of the queue and stop the test in flight. */
async function cancelAllUsrpTests(){
  if(!confirm('Stop the run and drop everything still queued?')) return;
  try {
    await fetch('/api/test/usrp/queue/cancel', {method: 'POST'});
    showToast('Stopping run-all…');
  } catch(err){
    showToast('Could not reach server to stop the run');
  }
}

let _queueActive = false;
let _queuePoller = null;

/** Repaint the header button + countdown for the current queue state. */
function renderQueueHeader(q){
  const btn   = document.getElementById('run-all-btn');
  const label = document.getElementById('run-all-status');
  if(!btn || !label) return;
  if(q && q.active){
    const total = allRackIps().length;
    btn.textContent = 'Stop all';
    btn.classList.remove('btn-primary');
    btn.classList.add('btn-danger');
    label.textContent = `${total - q.remaining}/${total} done`
                      + (q.current ? ` · testing ${q.current}` : '')
                      + ` · ~${fmtDuration(q.estimate_seconds)} left`;
  } else {
    btn.textContent = 'Run all';
    btn.classList.remove('btn-danger');
    btn.classList.add('btn-primary');
    label.textContent = '';
  }
}

/** Poll the queue until it drains, refreshing every card as it goes. */
function pollQueue(){
  if(_queuePoller) return;
  const tick = async () => {
    let q = null;
    try {
      const res = await fetch('/api/test/usrp/queue');
      if(res.ok) q = await res.json();
    } catch(err){
      console.warn('queue poll failed', err);
      return;
    }
    _queueActive = !!(q && q.active);
    renderQueueHeader(q);
    // Statuses live in the DB, so one history fetch repaints every box.
    await refreshTestStatus();
    allRackIps().forEach(refreshUsrpCard);
    if(!_queueActive){
      clearInterval(_queuePoller);
      _queuePoller = null;
    }
  };
  tick();
  _queuePoller = setInterval(tick, 2000);
}

/** Open a finished test's result without re-running. */
async function openUsrpTestResult(jobId){
  const res = await fetch('/api/test/usrp/' + jobId);
  if(!res.ok){ showToast('Result not found'); return; }
  renderTestPanel(await res.json());
}

/** Colorize the live log: highlight the ▶ / ✓ / ✗ markers and pass/fail lines. */
function formatLog(text){
  return escapeHtml(text || '').split('\n').map(line => {
    if(/^\s*✓/.test(line) || /Passed|SUCCESS/i.test(line))
      return `<span style="color:#34d399;">${line}</span>`;
    if(/^\s*✗/.test(line) || /unreachable|not responding|\[error\]|FAILURE|timed out|stopped by user/i.test(line))
      return `<span style="color:#f87171;">${line}</span>`;
    if(/^▶/.test(line))
      return `<span style="color:#7dd3fc;font-weight:600;">${line}</span>`;
    return line;
  }).join('\n');
}

/** Render the full test result panel on the right. */
function renderTestPanel(job){
  const r = job.result || {};
  const plots = (job.plots || []).map(name =>
    `<img src="/api/test/usrp/${job.id}/plot/${encodeURIComponent(name)}"
          style="width:100%;border:1px solid var(--border);border-radius:var(--radius);margin-top:10px;display:block;"
          alt="${name}">`
  ).join('');
  const probe = r.USRP_device ? `
    <div style="font-family:var(--mono);font-size:12px;color:var(--text2);margin-bottom:10px;">
      ${r.USRP_device || ''} · serial ${r.mb_serial_uhd || '—'} · fpga ${r.fpga_version || '—'}
    </div>` : '';
  const running = job.status === 'running';
  const logLines = (job.log||'').split('\n').length;
  document.getElementById('right-content').innerHTML = `
    <div class="panel-title">
      <span>usrp test</span>
      <span class="ant-name">${job.usrp_ip}</span>
    </div>
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;gap:10px;">
      <span style="transform:scale(1.25);transform-origin:left center;">${testStatusPill(job)}</span>
      <div style="display:flex;gap:10px;align-items:center;">
        ${running && job.id != null
          ? `<button class="btn btn-ghost" style="font-size:13px;padding:6px 14px;color:#b91c1c;border-color:#fecaca;font-weight:600;"
                onclick="cancelUsrpTest(${job.id}, '${job.usrp_ip}')">■ Stop</button>`
          : ''}
        <span style="font-family:var(--mono);font-size:12px;color:var(--text3);">${job.id != null ? 'job #'+job.id : ''}</span>
      </div>
    </div>
    ${probe}
    ${job.error ? (job.status === 'tbd'
        ? `<div style="font-family:var(--font);font-size:13px;line-height:1.5;color:var(--green-text);background:#d1fae5;border:1px solid #a7f3d0;padding:10px 12px;border-radius:var(--radius);margin-bottom:12px;"><b>✓ ${escapeHtml(job.error)}</b></div>`
        : `<div style="font-family:var(--font);font-size:13px;line-height:1.5;color:#b91c1c;background:#fee2e2;border:1px solid #fecaca;padding:10px 12px;border-radius:var(--radius);margin-bottom:12px;"><b>⚠ ${escapeHtml(job.error)}</b></div>`) : ''}
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
      <span style="font-family:var(--font);font-size:13px;font-weight:600;color:var(--text);display:flex;align-items:center;gap:6px;">
        ${running ? '<span class="log-live-dot"></span>live log' : 'log'}
      </span>
      <span style="font-family:var(--mono);font-size:11px;color:var(--text3);">${logLines} lines</span>
    </div>
    <pre id="test-log" style="font-family:var(--mono);font-size:13px;background:#0f172a;color:#e2e8f0;padding:14px;border-radius:var(--radius);min-height:48vh;max-height:70vh;overflow:auto;white-space:pre-wrap;word-break:break-word;margin:0 0 10px;line-height:1.55;box-shadow:inset 0 0 0 1px rgba(148,163,184,.15);">${formatLog(job.log) || '<span style="color:#64748b;">(waiting for output…)</span>'}</pre>
    ${plots}`;
  // Auto-scroll the log to the bottom
  const logEl = document.getElementById('test-log');
  if(logEl) logEl.scrollTop = logEl.scrollHeight;
}

function fmt(v){
  if(v === null || v === undefined || v === '') return '—';
  if(typeof v === 'number') return Number.isInteger(v) ? v : v.toFixed(2);
  return v;
}

function escapeHtml(s){
  return String(s == null ? '' : s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
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

/** Prevent panning outside the image boundaries.
 *  Clamps independently on each axis — the floor-wrap's width matches the
 *  viewport (width:100%), but its height is determined by the image's natural
 *  aspect ratio, so vertical panning is needed even at scale 1 when the image
 *  is taller than the viewport. */
function clampFloorPan(){
  const vp   = document.getElementById('floor-viewport');
  const wrap = document.getElementById('floor-wrap');
  if(!vp || !wrap) return;
  const wrapW = wrap.offsetWidth  * floorScale;
  const wrapH = wrap.offsetHeight * floorScale;
  const vpW   = vp.clientWidth;
  const vpH   = vp.clientHeight;
  // If content is wider/taller than the viewport, allow panning so that
  // content edges stay flush with viewport edges; otherwise pin to 0.
  floorPanX = wrapW > vpW
    ? Math.max(vpW - wrapW, Math.min(0, floorPanX))
    : 0;
  floorPanY = wrapH > vpH
    ? Math.max(vpH - wrapH, Math.min(0, floorPanY))
    : 0;
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
  wrap.innerHTML = `<img id="floor-img" src="/floorplan/${currentFloor}" draggable="false" style="width:100%;display:block;pointer-events:none;user-select:none;">`;

  ANTENNA_COORDS.filter(a => antennaFloor(a) === currentFloor).forEach(a => {
    const isMapped = !!mappings[a.id];
    const isActive = selected === a.id;

    // Clickable dot
    const dot = document.createElement('div');
    dot.className  = 'floor-dot'
      + (isActive ? ' active' : isMapped ? ' mapped' : ' unmapped')
      + (antEditingId === a.id ? ' editing' : '');
    dot.id         = 'fdot-' + a.id;
    dot.style.left = a.left + '%';
    dot.style.top  = a.top  + '%';
    dot.title      = a.label + (isMapped ? ' (mapped)' : '')
      + ' — right-click for menu (use "Edit position" to move)';
    // Click selects, EXCEPT while this antenna is in edit mode (so a drag
    // doesn't accidentally re-select it after mouseup fires the click).
    dot.onclick    = (e) => {
      e.stopPropagation();
      if (antEditingId === a.id) return;
      selectCell(a.id);
    };
    dot.addEventListener('mousedown',   e => onAntMDown(e, a.id));
    dot.addEventListener('touchstart',  e => onAntTStart(e, a.id), { passive: false });
    dot.addEventListener('contextmenu', e => onAntRightClick(e, a.id));
    wrap.appendChild(dot);

    // Text label above the dot — same mapped/unmapped class as the dot so the
    // USRP filter can hide them together.
    const label = document.createElement('div');
    label.className  = 'floor-label' + (isMapped ? ' mapped' : ' unmapped');
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
  applyLayerVisibility();
  applyLayerFilters();
  refreshLayerCounts();
}

/* ── Antenna ("USRP") edit-position mode ─────────────────────────────────── */
/**
 *  Antennas are normally fixed in place by ANTENNA_COORDS. To move one, the
 *  user right-clicks a dot and picks "Edit position" — that puts just *that*
 *  antenna into edit mode (visually outlined). While in edit mode the dot is
 *  draggable; on drop, the new (left, top) is persisted via the
 *  /api/antenna_positions endpoint and reflected immediately in /db. "Reset
 *  to default position" deletes the override and snaps the dot back.
 */
let antEditingId = null;        // dot id currently in edit mode (one at a time)
let antDragId    = null;        // dot id currently being dragged
let antPreDrag   = null;        // position before current drag started — for undo
let antMenuEl    = null;        // active antenna context menu element

function enterAntEdit(id){
  if(antEditingId === id) return;
  exitAntEdit();
  antEditingId = id;
  const dot = document.getElementById('fdot-' + id);
  if(dot) dot.classList.add('editing');
  showAntGrid();
  showAntEditPanel(id);
}
function exitAntEdit(){
  if(antEditingId === null) return;
  const dot = document.getElementById('fdot-' + antEditingId);
  if(dot) dot.classList.remove('editing');
  antEditingId = null;
  hideAntGrid();
  hideAntEditPanel();
  hideAlignGuide();
}

/* Grid overlay — % rulers + axis labels so the user can see exactly which
   direction "up/down/left/right" maps to in the floor-plan's % coordinate
   space. Injected inside #floor-wrap so it scales/pans with the image. */
function showAntGrid(){
  const wrap = document.getElementById('floor-wrap');
  if(!wrap || document.getElementById('ant-grid-overlay')) return;
  const grid = document.createElement('div');
  grid.id = 'ant-grid-overlay';
  grid.className = 'ant-grid-overlay';
  for(let i = 0; i <= 100; i += 10){
    // Edge labels (0% and 100%) get a different anchor so they don't get
    // clipped by #floor-viewport's overflow:hidden.
    const edgeLeft  = (i === 0)   ? 'translateX(0)'    : (i === 100) ? 'translateX(-100%)' : 'translateX(-50%)';
    const edgeTop   = (i === 0)   ? 'translateY(0)'    : (i === 100) ? 'translateY(-100%)' : 'translateY(-50%)';
    const xl = document.createElement('div');
    xl.className = 'ant-grid-label ant-grid-label-x';
    xl.style.left = i + '%';
    xl.style.transform = edgeLeft;
    xl.textContent = i + '%';
    grid.appendChild(xl);
    const yl = document.createElement('div');
    yl.className = 'ant-grid-label ant-grid-label-y';
    yl.style.top  = i + '%';
    yl.style.transform = edgeTop;
    yl.textContent = i + '%';
    grid.appendChild(yl);
  }
  // Origin marker so it's obvious where (0%, 0%) is
  const origin = document.createElement('div');
  origin.className = 'ant-grid-origin';
  origin.textContent = '(0, 0)';
  grid.appendChild(origin);
  wrap.appendChild(grid);
}
function hideAntGrid(){
  const g = document.getElementById('ant-grid-overlay');
  if(g) g.remove();
}

/* Floating "XY readout" panel — shows what's being edited, its live (x,y),
   and the cursor's current % position. Pinned to the viewport (fixed),
   not the transformed wrap, so it stays put when the user pans/zooms. */
function showAntEditPanel(id){
  const vp = document.getElementById('floor-viewport');
  if(!vp || document.getElementById('ant-edit-panel')) return;
  const a = COORD_MAP[id];
  if(!a) return;
  const panel = document.createElement('div');
  panel.id = 'ant-edit-panel';
  panel.className = 'ant-edit-panel';
  panel.innerHTML = `
    <div class="ant-edit-title">edit · <b>${a.label}</b> <span class="ant-edit-sub">${id}</span></div>
    <div class="ant-edit-row"><span class="ant-edit-k">x</span><span class="ant-edit-v" id="ant-edit-x">${a.left.toFixed(1)}%</span></div>
    <div class="ant-edit-row"><span class="ant-edit-k">y</span><span class="ant-edit-v" id="ant-edit-y">${a.top.toFixed(1)}%</span></div>
    <div class="ant-edit-row"><span class="ant-edit-k">cursor</span><span class="ant-edit-v" id="ant-edit-cursor">—</span></div>
  `;
  vp.appendChild(panel);
  vp.addEventListener('mousemove', _antTrackCursor);
}
function hideAntEditPanel(){
  const p = document.getElementById('ant-edit-panel');
  if(p) p.remove();
  const vp = document.getElementById('floor-viewport');
  if(vp) vp.removeEventListener('mousemove', _antTrackCursor);
}
function _antTrackCursor(e){
  const cur = document.getElementById('ant-edit-cursor');
  if(!cur) return;
  const p = _antClientToPercent(e.clientX, e.clientY);
  cur.textContent = p ? `x: ${p.left.toFixed(1)}% · y: ${p.top.toFixed(1)}%` : '—';
}
function _antUpdatePanelPos(id, left, top){
  if(antEditingId !== id) return;
  const xEl = document.getElementById('ant-edit-x');
  const yEl = document.getElementById('ant-edit-y');
  if(xEl) xEl.textContent = left.toFixed(1) + '%';
  if(yEl) yEl.textContent = top.toFixed(1)  + '%';
}


/* ── Alignment guides (snap to any-angle line of other USRPs) ───────────── */
/* While dragging an antenna in edit mode, look at every pair of *other*
   antennas on the same floor. Each pair defines an infinite line; we count
   how many additional antennas already sit on that line (the "support") and
   measure how close the drag point is to the line. The strongest match
   within tolerance wins — the dragged antenna snaps onto the line and a
   green dashed reference is drawn. Hold Alt while dragging to disable
   snapping for fine positioning. */
let antAlignSnap = null;

function findSnapLine(excludeId, dragLeft, dragTop){
  const img = document.getElementById('floor-img');
  if(!img) return null;
  const r = img.getBoundingClientRect();
  const W = r.width, H = r.height;
  if(W <= 0 || H <= 0) return null;

  // Pre-compute candidate antennas in pixel space (same floor, not the dragged one)
  const items = [];
  for(const a of ANTENNA_COORDS){
    if(antennaFloor(a) !== currentFloor) continue;
    if(a.id === excludeId) continue;
    items.push({ a, x: a.left * W / 100, y: a.top * H / 100 });
  }
  if(items.length < 2) return null;

  const dragX = dragLeft * W / 100;
  const dragY = dragTop  * H / 100;

  const LINE_TOL    = 7;    // px — counts as "on the line"
  const SNAP_TOL    = 12;   // px — drag-to-line snap distance
  const MIN_PAIR_PX = 25;   // px — pairs closer than this are degenerate
  const MIN_SUPPORT = 1;    // need at least 3 other antennas total on the line

  let best = null;
  const n = items.length;
  for(let i = 0; i < n; i++){
    const A = items[i];
    for(let j = i + 1; j < n; j++){
      const B  = items[j];
      const dx = B.x - A.x, dy = B.y - A.y;
      const len2 = dx*dx + dy*dy;
      const len  = Math.sqrt(len2);
      if(len < MIN_PAIR_PX) continue;
      // Perp distance from drag to line through A, B
      const cross = (dragX - A.x) * dy - (dragY - A.y) * dx;
      const perpDist = Math.abs(cross) / len;
      if(perpDist > SNAP_TOL) continue;
      // Count supporting antennas (besides A, B) within LINE_TOL of the line
      let support = 0;
      for(let k = 0; k < n; k++){
        if(k === i || k === j) continue;
        const C  = items[k];
        const c2 = (C.x - A.x) * dy - (C.y - A.y) * dx;
        if(Math.abs(c2) / len < LINE_TOL) support++;
      }
      if(support < MIN_SUPPORT) continue;
      const total = 2 + support;                  // others already on the line
      const score = total * 1000 - perpDist;      // more support wins; tie → nearer
      if(!best || score > best.score){
        // Project drag onto the line
        const t  = ((dragX - A.x) * dx + (dragY - A.y) * dy) / len2;
        const sx = A.x + t * dx;
        const sy = A.y + t * dy;
        best = {
          score, perpDist, totalOthers: total,
          left: (sx / W) * 100,
          top:  (sy / H) * 100,
          ax: A.a.left, ay: A.a.top,
          bx: B.a.left, by: B.a.top,
        };
      }
    }
  }
  return best;
}

function _ensureAlignSvg(){
  let svg = document.getElementById('ant-align-svg');
  if(svg) return svg;
  const wrap = document.getElementById('floor-wrap');
  if(!wrap) return null;
  svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.id = 'ant-align-svg';
  svg.setAttribute('viewBox', '0 0 100 100');
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:6;overflow:visible;';
  wrap.appendChild(svg);
  return svg;
}

function showAlignGuide(snap){
  const svg = _ensureAlignSvg();
  if(!svg) return;
  // Extend the line through (ax,ay)-(bx,by) far past the viewport edges
  const dx = snap.bx - snap.ax, dy = snap.by - snap.ay;
  let x1, y1, x2, y2;
  if(Math.abs(dx) < 1e-9){
    x1 = x2 = snap.ax; y1 = -20; y2 = 120;
  } else {
    const slope = dy / dx;
    x1 = -20; y1 = snap.ay + slope * (x1 - snap.ax);
    x2 = 120; y2 = snap.ay + slope * (x2 - snap.ax);
  }
  svg.innerHTML =
    `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"
           stroke="#10b981" stroke-width="1" stroke-dasharray="2 1.4"
           vector-effect="non-scaling-stroke" opacity="0.9"/>` +
    `<circle cx="${snap.left}" cy="${snap.top}" r="1.6"
             fill="none" stroke="#10b981" stroke-width="0.8"
             vector-effect="non-scaling-stroke"/>`;
  const snapEl = document.getElementById('ant-edit-snap');
  if(snapEl) snapEl.textContent = `line of ${snap.totalOthers + 1} · ⌥alt to disable`;
}
function hideAlignGuide(){
  const svg = document.getElementById('ant-align-svg');
  if(svg) svg.innerHTML = '';
  const snapEl = document.getElementById('ant-edit-snap');
  if(snapEl) snapEl.textContent = '—';
  antAlignSnap = null;
}

/** Update COORD_MAP + DOM in lockstep so re-renders pick up the new position. */
function _antApplyPos(id, left, top){
  const a = COORD_MAP[id];
  if(!a) return;
  a.left = left; a.top = top;
  const dot = document.getElementById('fdot-' + id);
  const lbl = document.getElementById('flbl-' + id);
  if(dot){ dot.style.left = left + '%';        dot.style.top = top + '%'; }
  if(lbl){ lbl.style.left = left + '%';        lbl.style.top = (top - 2.0) + '%'; }
  _antUpdatePanelPos(id, left, top);
}

/** Convert a viewport coordinate to (left%, top%) over the floor image. */
function _antClientToPercent(cx, cy){
  const img = document.getElementById('floor-img');
  if(!img) return null;
  const r = img.getBoundingClientRect();
  return {
    left: Math.max(0, Math.min(100, ((cx - r.left) / r.width)  * 100)),
    top:  Math.max(0, Math.min(100, ((cy - r.top)  / r.height) * 100)),
  };
}

/* Mouse drag */
function onAntMDown(e, id){
  if(e.button !== 0) return;       // ignore right/middle
  if(antEditingId !== id) return;  // drag only allowed in edit mode
  e.preventDefault();
  e.stopPropagation();
  antDragId  = id;
  const a    = COORD_MAP[id];
  antPreDrag = a ? { left: a.left, top: a.top } : null;
  window.addEventListener('mousemove', onAntMMove);
  window.addEventListener('mouseup',   onAntMUp);
}
function onAntMMove(e){
  if(antDragId === null) return;
  const p = _antClientToPercent(e.clientX, e.clientY);
  if(!p) return;
  let final = p;
  if(!e.altKey){                                 // Alt held = no snap (fine mode)
    const snap = findSnapLine(antDragId, p.left, p.top);
    if(snap){
      antAlignSnap = snap;
      showAlignGuide(snap);
      final = { left: snap.left, top: snap.top };
    } else {
      hideAlignGuide();
    }
  } else {
    hideAlignGuide();
  }
  _antApplyPos(antDragId, final.left, final.top);
}
async function onAntMUp(){
  if(antDragId === null) return;
  const id  = antDragId;
  const pre = antPreDrag;
  antDragId = null; antPreDrag = null;
  window.removeEventListener('mousemove', onAntMMove);
  window.removeEventListener('mouseup',   onAntMUp);
  const a = COORD_MAP[id];
  if(a) await _antSavePos(id, a.left, a.top);
  if(window.UndoStack && a && pre && (pre.left !== a.left || pre.top !== a.top)){
    window.UndoStack.push({
      label: 'move ' + (a.label || id),
      undo: async () => {
        _antApplyPos(id, pre.left, pre.top);
        await _antSavePos(id, pre.left, pre.top);
      },
    });
  }
  exitAntEdit();
}

/* Touch drag */
function onAntTStart(e, id){
  if(e.touches.length !== 1) return;
  if(antEditingId !== id) return;
  e.stopPropagation();
  antDragId  = id;
  const a    = COORD_MAP[id];
  antPreDrag = a ? { left: a.left, top: a.top } : null;
  window.addEventListener('touchmove', onAntTMove, { passive: false });
  window.addEventListener('touchend',  onAntTEnd);
}
function onAntTMove(e){
  if(antDragId === null) return;
  e.preventDefault();
  const p = _antClientToPercent(e.touches[0].clientX, e.touches[0].clientY);
  if(!p) return;
  let final = p;
  const snap = findSnapLine(antDragId, p.left, p.top);   // touch: no Alt, always snap
  if(snap){
    antAlignSnap = snap;
    showAlignGuide(snap);
    final = { left: snap.left, top: snap.top };
  } else {
    hideAlignGuide();
  }
  _antApplyPos(antDragId, final.left, final.top);
}
async function onAntTEnd(){
  if(antDragId === null) return;
  const id  = antDragId;
  const pre = antPreDrag;
  antDragId = null; antPreDrag = null;
  window.removeEventListener('touchmove', onAntTMove);
  window.removeEventListener('touchend',  onAntTEnd);
  const a = COORD_MAP[id];
  if(a) await _antSavePos(id, a.left, a.top);
  if(window.UndoStack && a && pre && (pre.left !== a.left || pre.top !== a.top)){
    window.UndoStack.push({
      label: 'move ' + (a.label || id),
      undo: async () => {
        _antApplyPos(id, pre.left, pre.top);
        await _antSavePos(id, pre.left, pre.top);
      },
    });
  }
  exitAntEdit();
}

/* Persistence */
async function _antSavePos(id, left, top){
  try {
    await fetch('/api/antenna_positions/' + encodeURIComponent(id), {
      method:  'PUT',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ left, top }),
    });
  } catch(err){ console.warn('antenna position save failed', err); }
}

/** Reset to the default (hard-coded) position, deleting the DB override. */
async function resetAntPosition(id){
  const def = DEFAULT_COORDS[id];
  const cur = COORD_MAP[id] ? { left: COORD_MAP[id].left, top: COORD_MAP[id].top } : null;
  if(!def) return;
  _antApplyPos(id, def.left, def.top);
  try {
    await fetch('/api/antenna_positions/' + encodeURIComponent(id),
                { method: 'DELETE' });
  } catch(err){ console.warn('antenna position reset failed', err); }
  if(window.UndoStack && cur && (cur.left !== def.left || cur.top !== def.top)){
    window.UndoStack.push({
      label: 'reset ' + id,
      undo: async () => {
        _antApplyPos(id, cur.left, cur.top);
        await _antSavePos(id, cur.left, cur.top);
      },
    });
  }
}

/** Pull overrides from the server and apply them on top of the defaults. */
async function loadAntennaPositions(){
  try {
    const res = await fetch('/api/antenna_positions');
    const map = await res.json();
    Object.entries(map).forEach(([id, p]) => {
      if(COORD_MAP[id]){
        COORD_MAP[id].left = p.left;
        COORD_MAP[id].top  = p.top;
      }
    });
  } catch(err){ console.warn('antenna positions load failed', err); }
}

/* Right-click menu — purposely uses the same `.device-context-menu` class as
   devices.js so styling matches without us duplicating CSS. */
function onAntRightClick(e, id){
  e.preventDefault();
  e.stopPropagation();
  const editing  = antEditingId === id;
  const hasOverride = !defaultsMatchCurrent(id);
  showAntMenu(e.clientX, e.clientY, [
    { label: editing ? 'Done moving' : 'Edit position',
      action: () => editing ? exitAntEdit() : enterAntEdit(id) },
    { label: 'Reset to default position',
      action: () => resetAntPosition(id),
      disabled: !hasOverride },
  ]);
}
function defaultsMatchCurrent(id){
  const c = COORD_MAP[id], d = DEFAULT_COORDS[id];
  if(!c || !d) return true;
  return c.left === d.left && c.top === d.top;
}

function showAntMenu(x, y, items){
  closeAntMenu();
  // Also close any device-menu that might be open so we don't stack two
  document.querySelectorAll('.device-context-menu').forEach(el => el.remove());
  antMenuEl = document.createElement('div');
  antMenuEl.className = 'device-context-menu ant-menu';
  antMenuEl.style.left = x + 'px';
  antMenuEl.style.top  = y + 'px';
  items.forEach(it => {
    if(it.sep){
      const s = document.createElement('div');
      s.className = 'sep';
      antMenuEl.appendChild(s);
      return;
    }
    const item = document.createElement('div');
    item.className = 'item' + (it.danger ? ' danger' : '') + (it.disabled ? ' disabled' : '');
    item.textContent = it.label;
    if(!it.disabled){
      item.onclick = (e) => { e.stopPropagation(); closeAntMenu(); it.action(); };
    }
    antMenuEl.appendChild(item);
  });
  document.body.appendChild(antMenuEl);
  const rect = antMenuEl.getBoundingClientRect();
  if(rect.right  > window.innerWidth)  antMenuEl.style.left = (window.innerWidth  - rect.width  - 6) + 'px';
  if(rect.bottom > window.innerHeight) antMenuEl.style.top  = (window.innerHeight - rect.height - 6) + 'px';
  setTimeout(() => {
    document.addEventListener('mousedown', closeAntMenuOnOutside);
    document.addEventListener('keydown',   closeAntMenuOnKey);
  }, 0);
}
function closeAntMenu(){
  if(antMenuEl){ antMenuEl.remove(); antMenuEl = null; }
  document.removeEventListener('mousedown', closeAntMenuOnOutside);
  document.removeEventListener('keydown',   closeAntMenuOnKey);
}
function closeAntMenuOnOutside(e){
  if(antMenuEl && !antMenuEl.contains(e.target)) closeAntMenu();
}
function closeAntMenuOnKey(e){
  if(e.key === 'Escape'){
    closeAntMenu();
    if(antEditingId !== null) exitAntEdit();
  }
}
// Always-on Esc handler — capture phase on window so it fires before any
// other keydown listener (including ones that might call stopPropagation).
window.addEventListener('keydown', e => {
  if(e.key !== 'Escape') return;
  if(antEditingId !== null){
    exitAntEdit();
    e.preventDefault();
    e.stopPropagation();
  }
}, true);


/* ── Per-layer mapped/unmapped filter ──────────────────────────────────── */
/* Separate from the layer toggle: when a layer is on, the filter narrows
   which subset is shown — 'all', 'mapped', or 'unmapped'. The filter UI is
   uniform across all three layers (USRP / Radios / UEs); marker visuals are
   unchanged (no color shift for radios/UEs based on mapped state). */
const layerFilters = { usrp: 'all', radio: 'all', ue: 'all' };

function setFilter(layer, f){
  if(!(layer in layerFilters)) return;
  if(f !== 'all' && f !== 'mapped' && f !== 'unmapped') return;
  layerFilters[layer] = f;
  applyLayerFilters();
}

function applyLayerFilters(){
  const wrap = document.getElementById('floor-wrap');
  if(wrap){
    ['usrp','radio','ue'].forEach(layer => {
      wrap.classList.toggle(layer + '-filter-mapped',   layerFilters[layer] === 'mapped');
      wrap.classList.toggle(layer + '-filter-unmapped', layerFilters[layer] === 'unmapped');
    });
  }
  // Sync the active state of each layer-group's filter buttons
  document.querySelectorAll('.layer-group').forEach(group => {
    const layer = group.dataset.layerGroup;
    if(!layer) return;
    group.querySelectorAll('.lf-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.f === layerFilters[layer]);
    });
  });
}


/* ── Layer visibility (USRP / Radios / UEs) ──────────────────────────────── */
const layerVisibility = {usrp:true, radio:true, ue:true};

/** Toggle one floor-plan layer and reflect the new state in its chip. */
function toggleLayer(name){
  if(!(name in layerVisibility)) return;
  layerVisibility[name] = !layerVisibility[name];
  applyLayerVisibility();
}

/** Apply the current layerVisibility state to #floor-wrap and the chips. */
function applyLayerVisibility(){
  const wrap = document.getElementById('floor-wrap');
  ['usrp','radio','ue'].forEach(n => {
    if(wrap) wrap.classList.toggle('hide-' + n, !layerVisibility[n]);
    const chip = document.querySelector('.layer-chip[data-layer="' + n + '"]');
    if(chip){
      chip.classList.toggle('off', !layerVisibility[n]);
      // Keep the chip's checkbox in sync (when toggled via legacy paths)
      const cb = chip.querySelector('input[type="checkbox"]');
      if(cb) cb.checked = layerVisibility[n];
    }
  });
  // Mapped/Unmapped legend is USRP-specific — hide it when that layer is off.
  const legend = document.getElementById('usrp-legend');
  if(legend) legend.style.display = layerVisibility.usrp ? '' : 'none';
}

/** Recount markers currently on the floor and update each chip's badge. */
function refreshLayerCounts(){
  const wrap = document.getElementById('floor-wrap');
  if(!wrap) return;
  const set = (id, n) => { const el = document.getElementById(id); if(el) el.textContent = n; };
  set('layer-count-usrp',  wrap.querySelectorAll('.floor-dot').length);
  set('layer-count-radio', wrap.querySelectorAll('.device-marker.device-radio').length);
  set('layer-count-ue',    wrap.querySelectorAll('.device-marker.device-ue').length);
}
// Expose so devices.js can ping after it re-renders its layer
window.refreshLayerCounts = refreshLayerCounts;


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

/** Switch the displayed floor plan and rebuild dots for that floor. */
function switchFloor(floor){
  if(floor === currentFloor) return;
  currentFloor = floor;
  document.getElementById('floor-6').classList.toggle('active', floor === 6);
  document.getElementById('floor-7').classList.toggle('active', floor === 7);
  // Reset zoom/pan so the new image isn't shown at a stale transform
  floorScale = 1; floorPanX = 0; floorPanY = 0;
  buildFloorView();
}


/* ── Selection & right panel ─────────────────────────────────────────────── */

/** Select an antenna by ID — updates grid, floor dots, and right panel. */
function selectCell(id){
  selected = id;
  buildTable();
  refreshFloorDots();
  renderPanel(id);
  openDetailPanel();
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
  const [resMap] = await Promise.all([
    fetch('/api/mappings'),
    loadAntennaPositions(),   // overlay custom antenna positions on COORD_MAP
  ]);
  mappings = await resMap.json();
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

/** Update the auto-save indicator (top-right floating pill). */
function setStatus(s){
  const el = document.getElementById('save-status');
  if(!el) return;
  if(s === 'saved')  { el.textContent = 'Saved';   el.className = 'save-status saved';  }
  if(s === 'saving') { el.textContent = 'Saving…'; el.className = 'save-status saving'; }
}


/* ── Zoom buttons + detail panel helpers (Google-Maps-style controls) ───── */

/** Zoom in/out by `delta` (positive = in, negative = out). Centred on viewport. */
function floorZoom(delta){
  const vp = document.getElementById('floor-viewport');
  if(!vp) return;
  const rect     = vp.getBoundingClientRect();
  const mx       = rect.width  / 2;
  const my       = rect.height / 2;
  const oldScale = floorScale;
  floorScale     = Math.max(1, Math.min(5, floorScale + delta));
  floorPanX      = mx - (mx - floorPanX) * (floorScale / oldScale);
  floorPanY      = my - (my - floorPanY) * (floorScale / oldScale);
  clampFloorPan();
  applyFloorTransform();
}

/** Reset zoom + pan to the default (1×, centred). */
function floorReset(){
  floorScale = 1; floorPanX = 0; floorPanY = 0;
  applyFloorTransform();
}

/** Slide the right detail panel in/out. */
function openDetailPanel(){
  const p = document.getElementById('detail-panel');
  if(p) p.classList.add('open');
}
function closeDetailPanel(){
  const p = document.getElementById('detail-panel');
  if(p) p.classList.remove('open');
  selected = null;
  refreshFloorDots();
  if(typeof buildTable === 'function') buildTable();
}

/* ── Detail-panel resize (drag the bottom-left corner grip) ───────────────── */
(function initPanelResizer(){
  const panel = document.getElementById('detail-panel');
  const grip  = document.getElementById('panel-resizer');
  if(!panel || !grip) return;

  const MIN = 360;
  const max = () => Math.round(window.innerWidth * 0.96);

  // Restore a previously chosen width.
  const saved = parseInt(localStorage.getItem('arenaPanelWidth') || '', 10);
  if(saved) document.documentElement.style.setProperty('--panel-w', saved + 'px');

  let dragging = false;

  const onMove = (e) => {
    if(!dragging) return;
    // Panel is anchored to the right edge, so width grows as the cursor moves left.
    const w = Math.min(max(), Math.max(MIN, window.innerWidth - e.clientX));
    document.documentElement.style.setProperty('--panel-w', w + 'px');
    e.preventDefault();
  };
  const stop = () => {
    if(!dragging) return;
    dragging = false;
    panel.classList.remove('resizing');
    const cur = getComputedStyle(panel).width;
    localStorage.setItem('arenaPanelWidth', parseInt(cur, 10));
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', stop);
  };

  grip.addEventListener('pointerdown', (e) => {
    dragging = true;
    panel.classList.add('resizing');
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', stop);
    e.preventDefault();
  });
})();

/** Save the form values for a single antenna, then refresh the UI. */
async function saveMapping(id){
  const prev      = mappings[id] ? { ...mappings[id] } : null;   // for undo
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
    if(window.UndoStack){
      window.UndoStack.push({
        label: 'save ' + lbl(id),
        undo: async () => {
          if(prev) mappings[id] = prev;
          else     delete mappings[id];
          await saveToServer();
          buildTable();
          refreshFloorDots();
          if(selected === id) renderPanel(id);
        },
      });
    }
  }
  buildTable();
  refreshFloorDots();
  renderPanel(id);
}

/** Remove a single antenna's mapping, then refresh the UI. */
async function clearMapping(id){
  const prev = mappings[id] ? { ...mappings[id] } : null;
  delete mappings[id];
  await saveToServer();
  buildTable();
  refreshFloorDots();
  renderPanel(id);
  showToast('Cleared ' + lbl(id));
  if(window.UndoStack && prev){
    window.UndoStack.push({
      label: 'clear ' + lbl(id),
      undo: async () => {
        mappings[id] = prev;
        await saveToServer();
        buildTable();
        refreshFloorDots();
        if(selected === id) renderPanel(id);
      },
    });
  }
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
