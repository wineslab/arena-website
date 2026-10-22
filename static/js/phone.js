/* ═══════════════════════════════════════════
   PHONE TRACKER  —  phone.js
   Draggable purple phone marker on the floor
   plan. Position persisted via /api/phones.
   No changes to index.html or app.py needed.
   ═══════════════════════════════════════════ */

(function () {
  'use strict';

  /* ── state ── */
  // Per-floor cache so switching floors doesn't blank the marker while we
  // wait for the server. Default centred until a position is loaded/set.
  const phonePositions = {};   // { 6: {left, top}, 7: {left, top} }
  let   loadedFloor    = null; // last floor we successfully fetched
  let   isDragging     = false;
  let   preDragPos     = null; // position before the current drag — for undo

  /** Floor currently displayed by app.js (defined in app.js as `let currentFloor`). */
  function activeFloor() {
    return (typeof currentFloor === 'number') ? currentFloor : 6;
  }

  /** Get cached position for a floor (or a sensible default). */
  function posFor(floor) {
    return phonePositions[floor] || { left: 50, top: 50 };
  }

  /* ─────────────────────────────────────────
     PERSISTENCE
  ───────────────────────────────────────── */
  async function loadPos(floor) {
    try {
      const res  = await fetch('/api/phones/' + floor);
      const data = await res.json();
      if (typeof data.left === 'number' && typeof data.top === 'number') {
        phonePositions[floor] = { left: data.left, top: data.top };
      } else if (!phonePositions[floor]) {
        phonePositions[floor] = { left: 50, top: 50 };
      }
      loadedFloor = floor;
      if (activeFloor() === floor) applyPos();
    } catch (_) { /* server not ready yet — keep default */ }
  }

  async function savePos() {
    const floor = activeFloor();
    const pos   = phonePositions[floor];
    if (!pos) return;
    try {
      await fetch('/api/phones/' + floor, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(pos),
      });
    } catch (_) {}
  }

  /* ─────────────────────────────────────────
     BUILD THE MARKER ELEMENT
  ───────────────────────────────────────── */
  function makeMarker() {
    const el = document.createElement('div');
    el.id    = 'phone-marker';
    // Tag as a UE so the floor-plan UE layer toggle (in app.js / main.css)
    // hides/shows and counts this marker alongside other UE devices.
    el.className = 'device-marker device-ue';
    el.title = 'Phone (UE) — drag to reposition';
 
    Object.assign(el.style, {
      position:     'absolute',
      width:        '8px',
      height:       '12px',
      background:   '#7c3aed',
      border:       '2px solid rgba(255,255,255,0.9)',
      borderRadius: '3px',
      transform:    'translate(-50%, -50%)',
      cursor:       'grab',
      zIndex:       '10',
      boxShadow:    '0 0 0 2px rgba(124,58,237,0.45), 0 2px 8px rgba(0,0,0,0.45)',
      userSelect:   'none',
      touchAction:  'none',
    });
 
    /* speaker bar */
    el.innerHTML =
      '<div style="position:absolute;top:2px;left:50%;transform:translateX(-50%)' +
      ';width:3px;height:1px;background:rgba(255,255,255,0.75);border-radius:1px"></div>' +
      /* "Phone" label below the box */
      '<div id="phone-marker-lbl" style="position:absolute;bottom:-14px;left:50%' +
      ';transform:translateX(-50%);font-family:\'IBM Plex Mono\',monospace' +
      ';font-size:7px;font-weight:700;color:#7c3aed;white-space:nowrap' +
      ';text-shadow:0 0 3px #fff,0 0 3px #fff">Phone</div>';
 
    el.addEventListener('mousedown', onMDown);
    el.addEventListener('touchstart', onTStart, { passive: false });
    return el;
  }

  /* ─────────────────────────────────────────
     POSITION HELPERS
  ───────────────────────────────────────── */
  /**
   * Convert a viewport coordinate to a % position over #floor-img.
   * getBoundingClientRect() already accounts for the CSS transform
   * (pan + scale) applied to #floor-wrap, so this works at any zoom level.
   */
  function clientToPercent(clientX, clientY) {
    const img = document.getElementById('floor-img');
    if (!img) return null;
    const r = img.getBoundingClientRect();
    return {
      left: Math.max(0, Math.min(100, ((clientX - r.left) / r.width)  * 100)),
      top:  Math.max(0, Math.min(100, ((clientY - r.top)  / r.height) * 100)),
    };
  }

  function applyPos() {
    const el  = document.getElementById('phone-marker');
    const pos = posFor(activeFloor());
    if (el) {
      el.style.left = pos.left + '%';
      el.style.top  = pos.top  + '%';
    }
  }

  /* ─────────────────────────────────────────
     MOUSE DRAG
  ───────────────────────────────────────── */
  function onMDown(e) {
    e.stopPropagation();   /* prevent #floor-viewport pan handler from firing */
    e.preventDefault();
    isDragging = true;
    preDragPos = { ...posFor(activeFloor()) };   // snapshot for undo

    const el = document.getElementById('phone-marker');
    if (el) {
      el.style.cursor    = 'grabbing';
      el.style.boxShadow = '0 0 0 4px rgba(124,58,237,0.55), 0 4px 14px rgba(0,0,0,0.5)';
    }

    window.addEventListener('mousemove', onMMove);
    window.addEventListener('mouseup',   onMUp);
  }

  function onMMove(e) {
    if (!isDragging) return;
    const p = clientToPercent(e.clientX, e.clientY);
    if (p) { phonePositions[activeFloor()] = p; applyPos(); }
  }

  function onMUp() {
    if (!isDragging) return;
    isDragging = false;

    const el = document.getElementById('phone-marker');
    if (el) {
      el.style.cursor    = 'grab';
      el.style.boxShadow = '0 0 0 2px rgba(124,58,237,0.45), 0 2px 8px rgba(0,0,0,0.45)';
    }

    window.removeEventListener('mousemove', onMMove);
    window.removeEventListener('mouseup',   onMUp);
    const pre   = preDragPos; preDragPos = null;
    const floor = activeFloor();
    const cur   = phonePositions[floor];
    savePos();
    if (pre && cur && (pre.left !== cur.left || pre.top !== cur.top) && window.UndoStack) {
      window.UndoStack.push({
        label: 'move phone',
        undo: async () => {
          phonePositions[floor] = { left: pre.left, top: pre.top };
          applyPos();
          await fetch('/api/phones/' + floor, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify(pre),
          });
        },
      });
    }
  }

  /* ─────────────────────────────────────────
     TOUCH DRAG
  ───────────────────────────────────────── */
  function onTStart(e) {
    e.stopPropagation();
    if (e.touches.length !== 1) return;
    isDragging = true;
    preDragPos = { ...posFor(activeFloor()) };
    window.addEventListener('touchmove', onTMove, { passive: false });
    window.addEventListener('touchend',  onTEnd);
  }

  function onTMove(e) {
    if (!isDragging) return;
    e.preventDefault();
    const p = clientToPercent(e.touches[0].clientX, e.touches[0].clientY);
    if (p) { phonePositions[activeFloor()] = p; applyPos(); }
  }

  function onTEnd() {
    isDragging = false;
    window.removeEventListener('touchmove', onTMove);
    window.removeEventListener('touchend',  onTEnd);
    const pre   = preDragPos; preDragPos = null;
    const floor = activeFloor();
    const cur   = phonePositions[floor];
    savePos();
    if (pre && cur && (pre.left !== cur.left || pre.top !== cur.top) && window.UndoStack) {
      window.UndoStack.push({
        label: 'move phone',
        undo: async () => {
          phonePositions[floor] = { left: pre.left, top: pre.top };
          applyPos();
          await fetch('/api/phones/' + floor, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify(pre),
          });
        },
      });
    }
  }

  /* ─────────────────────────────────────────
     INJECT / EJECT
  ───────────────────────────────────────── */
  function inject() {
    const wrap = document.getElementById('floor-wrap');
    if (!wrap) return;
    const old = document.getElementById('phone-marker'); /* prevent duplicates if already injected */
    if (old) old.remove();
    wrap.appendChild(makeMarker());
    applyPos();
    // Keep the UE layer count in sync — the phone counts as a UE.
    if (typeof window.refreshLayerCounts === 'function') window.refreshLayerCounts();
  }

  /* ─────────────────────────────────────────
     RE-INJECT AFTER buildFloorView() REBUILDS
     #floor-wrap (it does wrap.innerHTML = ...)
  ───────────────────────────────────────── */
  function watchFloor() {
    const wrap = document.getElementById('floor-wrap');
    if (!wrap) return;

    new MutationObserver(function (mutations) {
      if (!phoneVisible) return;
      const floorRebuilt = mutations.some(function (m) {
        return Array.from(m.addedNodes).some(function (n) {
          return n.id === 'floor-img';
        });
      });
      if (!floorRebuilt) return;
      inject();
      // Re-fetch from the server whenever a different floor becomes active
      const f = activeFloor();
      if (loadedFloor !== f) loadPos(f);
    }).observe(wrap, { childList: true });
  }

  /* ─────────────────────────────────────────
     PUBLIC API  —  called by the existing button
     <button onclick="togglePhone()"> in index.html
  ───────────────────────────────────────── */
  let phoneVisible = true;



  /* ─── INIT ─── */
  loadPos(activeFloor());
  watchFloor();
  // inject as soon as floor-wrap exists
  const waitForFloor = setInterval(function(){
    if(document.getElementById('floor-wrap')){
      inject();
      clearInterval(waitForFloor);
    }
  }, 100);
}());
