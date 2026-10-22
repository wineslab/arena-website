/* ═══════════════════════════════════════════════════════════════════════════
   devices.js — Floor-plan device markers (radios + UEs)

   Self-contained layer. Adds:
     • Right-click context menu over the floor plan
       - empty space:  "Create Radio" / "Create UE"
       - on a marker:  "Edit position", "Rename", "Remove"
     • Per-floor persistence via /api/devices
     • Drag-to-reposition is gated behind "Edit position" — markers are only
       movable once explicitly placed into edit mode (prevents accidental drags
       on a normal click). Ctrl/Cmd+Z reverts the most recent move; Esc exits
       edit mode without moving anything.

   Independent of app.js (antennas) and phone.js (phone marker).
   Reads the global `currentFloor` declared by app.js to know which floor to
   render, and re-renders whenever app.js rebuilds #floor-wrap.
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ── State ─────────────────────────────────────────────────────────────── */
  const devicesByFloor = {};   // { floor: [device, ...] }
  let   loadedFloor    = null; // last floor we successfully fetched
  let   menuEl         = null; // active context menu element
  let   dragId         = null; // device id currently being dragged
  let   preDragPos     = null; // position before the current drag started
  let   editingId      = null; // device currently in "Edit position" mode

  /** Floor currently displayed by app.js. */
  function activeFloor() {
    return (typeof currentFloor === 'number') ? currentFloor : 6;
  }

  function findDevice(id) {
    const list = devicesByFloor[activeFloor()] || [];
    return list.find(d => d.id === id);
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /* ── Persistence ───────────────────────────────────────────────────────── */
  async function loadDevices(floor) {
    try {
      const res  = await fetch('/api/devices?floor=' + floor);
      const list = await res.json();
      devicesByFloor[floor] = list;
      loadedFloor = floor;
      if (activeFloor() === floor) renderAll();
    } catch (_) { /* server not ready yet */ }
  }

  async function apiCreate(payload) {
    const res = await fetch('/api/devices', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
    });
    return res.json();
  }

  async function apiUpdate(id, patch) {
    const res = await fetch('/api/devices/' + id, {
      method:  'PUT',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(patch),
    });
    return res.json();
  }

  async function apiDelete(id) {
    await fetch('/api/devices/' + id, { method: 'DELETE' });
  }

  /* ── Rendering ─────────────────────────────────────────────────────────── */
  function renderAll() {
    const wrap = document.getElementById('floor-wrap');
    if (!wrap) return;
    wrap.querySelectorAll('.device-marker').forEach(el => el.remove());
    const list = devicesByFloor[activeFloor()] || [];
    // Drop edit state if the target device is not on the visible floor
    if (editingId !== null && !list.some(d => d.id === editingId)) editingId = null;
    list.forEach(d => wrap.appendChild(makeMarker(d)));
    if (typeof window.refreshLayerCounts === 'function') window.refreshLayerCounts();
  }

  function makeMarker(d) {
    const el = document.createElement('div');
    el.className = 'device-marker device-' + d.kind
      + (d.mapped ? ' mapped' : ' unmapped')
      + (editingId === d.id ? ' editing' : '');
    el.dataset.deviceId = String(d.id);
    el.style.left = d.left + '%';
    el.style.top  = d.top  + '%';
    el.title = d.name + ' — right-click for menu (use "Edit position" to move)';

    // Visual icon (kind-specific shape) + label below
    el.innerHTML =
      '<div class="device-icon"></div>' +
      '<div class="device-label">' + escapeHtml(d.name) + '</div>';

    el.addEventListener('mousedown',   onMDown);
    el.addEventListener('touchstart',  onTStart, { passive: false });
    el.addEventListener('contextmenu', e => onDeviceRightClick(e, d.id));
    el.addEventListener('click',       e => e.stopPropagation()); // dev coord logger
    return el;
  }

  function setMarkerPos(id, p) {
    const el = document.querySelector('.device-marker[data-device-id="' + id + '"]');
    if (el) {
      el.style.left = p.left + '%';
      el.style.top  = p.top  + '%';
    }
  }

  function clientToPercent(cx, cy) {
    const img = document.getElementById('floor-img');
    if (!img) return null;
    const r = img.getBoundingClientRect();
    return {
      left: Math.max(0, Math.min(100, ((cx - r.left) / r.width)  * 100)),
      top:  Math.max(0, Math.min(100, ((cy - r.top)  / r.height) * 100)),
    };
  }

  /* ── Edit mode ─────────────────────────────────────────────────────────── */
  /** Mark a device as the one currently being moved. Only this device is draggable. */
  function enterEditMode(id) {
    if (editingId === id) return;
    exitEditMode();
    editingId = id;
    const el = document.querySelector('.device-marker[data-device-id="' + id + '"]');
    if (el) el.classList.add('editing');
  }
  function exitEditMode() {
    if (editingId === null) return;
    const el = document.querySelector('.device-marker[data-device-id="' + editingId + '"]');
    if (el) el.classList.remove('editing');
    editingId = null;
  }

  /* ── Drag (mouse) ──────────────────────────────────────────────────────── */
  function onMDown(e) {
    if (e.button !== 0) return;          // ignore right/middle
    const id = parseInt(e.currentTarget.dataset.deviceId, 10);
    if (editingId !== id) return;        // dragging only allowed in edit mode
    e.stopPropagation();
    e.preventDefault();
    const d  = findDevice(id);
    if (!d) return;
    dragId     = id;
    preDragPos = { left: d.left, top: d.top };
    e.currentTarget.classList.add('dragging');
    window.addEventListener('mousemove', onMMove);
    window.addEventListener('mouseup',   onMUp);
  }

  function onMMove(e) {
    if (dragId === null) return;
    const p = clientToPercent(e.clientX, e.clientY);
    if (!p) return;
    const d = findDevice(dragId);
    if (d) { d.left = p.left; d.top = p.top; setMarkerPos(dragId, p); }
  }

  function onMUp() {
    if (dragId === null) return;
    const id  = dragId;
    const pre = preDragPos;
    dragId = null; preDragPos = null;
    const el = document.querySelector('.device-marker[data-device-id="' + id + '"]');
    if (el) el.classList.remove('dragging');
    window.removeEventListener('mousemove', onMMove);
    window.removeEventListener('mouseup',   onMUp);
    const d = findDevice(id);
    if (!d) return;
    apiUpdate(id, { left: d.left, top: d.top }).then(() => {
      if (pre && (pre.left !== d.left || pre.top !== d.top) && window.UndoStack) {
        window.UndoStack.push({
          label: 'move ' + (d.name || ('#' + id)),
          undo: async () => {
            await apiUpdate(id, pre);
            const cur = findDevice(id);
            if (cur) { cur.left = pre.left; cur.top = pre.top; setMarkerPos(id, pre); }
          },
        });
      }
    });
    exitEditMode();
  }

  /* ── Drag (touch) ──────────────────────────────────────────────────────── */
  function onTStart(e) {
    if (e.touches.length !== 1) return;
    const id = parseInt(e.currentTarget.dataset.deviceId, 10);
    if (editingId !== id) return;        // dragging only allowed in edit mode
    e.stopPropagation();
    const d  = findDevice(id);
    if (!d) return;
    dragId     = id;
    preDragPos = { left: d.left, top: d.top };
    window.addEventListener('touchmove', onTMove, { passive: false });
    window.addEventListener('touchend',  onTEnd);
  }

  function onTMove(e) {
    if (dragId === null) return;
    e.preventDefault();
    const p = clientToPercent(e.touches[0].clientX, e.touches[0].clientY);
    if (!p) return;
    const d = findDevice(dragId);
    if (d) { d.left = p.left; d.top = p.top; setMarkerPos(dragId, p); }
  }

  function onTEnd() {
    if (dragId === null) return;
    const id  = dragId;
    const pre = preDragPos;
    dragId = null; preDragPos = null;
    window.removeEventListener('touchmove', onTMove);
    window.removeEventListener('touchend',  onTEnd);
    const d = findDevice(id);
    if (!d) return;
    apiUpdate(id, { left: d.left, top: d.top }).then(() => {
      if (pre && (pre.left !== d.left || pre.top !== d.top) && window.UndoStack) {
        window.UndoStack.push({
          label: 'move ' + (d.name || ('#' + id)),
          undo: async () => {
            await apiUpdate(id, pre);
            const cur = findDevice(id);
            if (cur) { cur.left = pre.left; cur.top = pre.top; setMarkerPos(id, pre); }
          },
        });
      }
    });
    exitEditMode();
  }

  /* ── Context menu ──────────────────────────────────────────────────────── */
  function showMenu(x, y, items) {
    closeMenu();
    menuEl = document.createElement('div');
    menuEl.className = 'device-context-menu';
    menuEl.style.left = x + 'px';
    menuEl.style.top  = y + 'px';
    items.forEach(it => {
      if (it.sep) {
        const s = document.createElement('div');
        s.className = 'sep';
        menuEl.appendChild(s);
        return;
      }
      const item = document.createElement('div');
      item.className = 'item' + (it.danger ? ' danger' : '') + (it.disabled ? ' disabled' : '');
      item.textContent = it.label;
      if (!it.disabled) {
        item.onclick = (e) => {
          e.stopPropagation();
          closeMenu();
          it.action();
        };
      }
      menuEl.appendChild(item);
    });
    document.body.appendChild(menuEl);
    // Nudge inside viewport
    const rect = menuEl.getBoundingClientRect();
    if (rect.right > window.innerWidth)  menuEl.style.left = (window.innerWidth  - rect.width  - 6) + 'px';
    if (rect.bottom > window.innerHeight) menuEl.style.top  = (window.innerHeight - rect.height - 6) + 'px';
    setTimeout(() => {
      document.addEventListener('mousedown', closeMenuOnOutside);
      document.addEventListener('keydown',   closeMenuOnEscape);
    }, 0);
  }

  function closeMenu() {
    if (menuEl) { menuEl.remove(); menuEl = null; }
    document.removeEventListener('mousedown', closeMenuOnOutside);
    document.removeEventListener('keydown',   closeMenuOnEscape);
  }
  function closeMenuOnOutside(e) {
    if (menuEl && !menuEl.contains(e.target)) closeMenu();
  }
  function closeMenuOnEscape(e) {
    if (e.key === 'Escape') closeMenu();
  }

  /** Right-click anywhere — decide between empty-area menu vs. device menu. */
  function onContextMenu(e) {
    const wrap = document.getElementById('floor-wrap');
    if (!wrap || !wrap.contains(e.target)) return;       // outside the floor area
    if (e.target.closest('.device-marker')) return;       // device handler runs instead
    if (e.target.closest('#phone-marker')) return;        // leave the phone alone
    if (e.target.closest('.floor-dot'))    return;        // antenna handler (app.js) runs
    e.preventDefault();
    const p = clientToPercent(e.clientX, e.clientY);
    if (!p) return;
    showMenu(e.clientX, e.clientY, [
      { label: 'Create Radio',  action: () => createDeviceAt('radio', p) },
      { label: 'Create UE',     action: () => createDeviceAt('ue',    p) },
    ]);
  }

  function onDeviceRightClick(e, id) {
    e.preventDefault();
    e.stopPropagation();
    const d = findDevice(id);
    if (!d) return;
    const editing = editingId === id;
    showMenu(e.clientX, e.clientY, [
      { label: editing ? 'Done moving' : 'Edit position',
        action: () => editing ? exitEditMode() : enterEditMode(id) },
      { label: 'Rename "' + d.name + '"',     action: () => renameDevice(id) },
      { label: d.mapped ? 'Mark as unmapped' : 'Mark as mapped',
        action: () => toggleMapped(id) },
      { sep: true },
      { label: 'Remove',  danger: true,        action: () => removeDevice(id) },
    ]);
  }

  async function toggleMapped(id) {
    const d = findDevice(id);
    if (!d) return;
    const before  = !!d.mapped;
    const after   = !before;
    const updated = await apiUpdate(id, { mapped: after });
    Object.assign(d, updated);
    renderAll();
    if (window.UndoStack) {
      window.UndoStack.push({
        label: (after ? 'mark mapped: ' : 'mark unmapped: ') + d.name,
        undo: async () => {
          const reverted = await apiUpdate(id, { mapped: before });
          const cur = findDevice(id);
          if (cur) Object.assign(cur, reverted);
          renderAll();
        },
      });
    }
  }

  /* ── Actions ───────────────────────────────────────────────────────────── */
  async function createDeviceAt(kind, p) {
    const floor = activeFloor();
    const list  = devicesByFloor[floor] || [];
    const n     = list.filter(x => x.kind === kind).length + 1;
    const name  = (kind === 'radio' ? 'Radio ' : 'UE ') + n;
    const d = await apiCreate({ floor, kind, name, left: p.left, top: p.top });
    if (!devicesByFloor[floor]) devicesByFloor[floor] = [];
    devicesByFloor[floor].push(d);
    renderAll();
    if (window.UndoStack) {
      window.UndoStack.push({
        label: 'create ' + d.name,
        undo: async () => {
          await apiDelete(d.id);
          Object.keys(devicesByFloor).forEach(f => {
            devicesByFloor[f] = (devicesByFloor[f] || []).filter(x => x.id !== d.id);
          });
          if (editingId === d.id) editingId = null;
          renderAll();
        },
      });
    }
  }

  async function renameDevice(id) {
    const d = findDevice(id);
    if (!d) return;
    const oldName = d.name;
    const name    = (window.prompt('Rename device', d.name) || '').trim();
    if (!name || name === d.name) return;
    const updated = await apiUpdate(id, { name });
    Object.assign(d, updated);
    renderAll();
    if (window.UndoStack) {
      window.UndoStack.push({
        label: 'rename → ' + name,
        undo: async () => {
          const reverted = await apiUpdate(id, { name: oldName });
          const cur = findDevice(id);
          if (cur) Object.assign(cur, reverted);
          renderAll();
        },
      });
    }
  }

  /** Esc exits "Edit position" mode without moving anything. */
  function onKeyDown(e) {
    if (e.key === 'Escape' && editingId !== null) {
      exitEditMode();
    }
  }

  async function removeDevice(id) {
    const d = findDevice(id);
    const snapshot = d ? {
      kind: d.kind, name: d.name, floor: d.floor, left: d.left, top: d.top,
    } : null;
    await apiDelete(id);
    Object.keys(devicesByFloor).forEach(f => {
      devicesByFloor[f] = (devicesByFloor[f] || []).filter(x => x.id !== id);
    });
    if (editingId === id) editingId = null;
    renderAll();
    if (window.UndoStack && snapshot) {
      window.UndoStack.push({
        label: 'remove ' + snapshot.name,
        undo: async () => {
          // Re-creates with a new id (DB-assigned); visually equivalent.
          const newD = await apiCreate(snapshot);
          if (!devicesByFloor[newD.floor]) devicesByFloor[newD.floor] = [];
          devicesByFloor[newD.floor].push(newD);
          renderAll();
        },
      });
    }
  }

  /* ── Re-render after app.js rebuilds #floor-wrap (floor switch / refresh) */
  function watchFloor() {
    const wrap = document.getElementById('floor-wrap');
    if (!wrap) return;
    new MutationObserver(muts => {
      const rebuilt = muts.some(m =>
        Array.from(m.addedNodes).some(n => n.id === 'floor-img')
      );
      if (!rebuilt) return;
      const f = activeFloor();
      if (loadedFloor !== f) loadDevices(f);
      else                    renderAll();
    }).observe(wrap, { childList: true });
  }

  /* ── Init ──────────────────────────────────────────────────────────────── */
  document.addEventListener('contextmenu', onContextMenu);
  document.addEventListener('keydown',     onKeyDown);
  const wait = setInterval(() => {
    if (document.getElementById('floor-wrap')) {
      loadDevices(activeFloor());
      watchFloor();
      clearInterval(wait);
    }
  }, 100);
}());
