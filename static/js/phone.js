/* ═══════════════════════════════════════════
   PHONE TRACKER  —  phone.js
   Draggable purple phone marker on the floor
   plan. Position persisted via /api/phones.
   No changes to index.html or app.py needed.
   ═══════════════════════════════════════════ */

(function () {
  'use strict';

  /* ── state ── */
  let phonePos     = { left: 50, top: 50 };   // % offsets over floor-img
  let isDragging   = false;

  /* ─────────────────────────────────────────
     PERSISTENCE
  ───────────────────────────────────────── */
  async function loadPos() {
    try {
      const res  = await fetch('/api/phones');
      const data = await res.json();
      if (typeof data.left === 'number' && typeof data.top === 'number') {
        phonePos = { left: data.left, top: data.top };
        applyPos();
      }
    } catch (_) { /* server not ready yet — keep default */ }
  }

  async function savePos() {
    try {
      await fetch('/api/phones', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(phonePos),
      });
    } catch (_) {}
  }

  /* ─────────────────────────────────────────
     BUILD THE MARKER ELEMENT
  ───────────────────────────────────────── */
  function makeMarker() {
    const el = document.createElement('div');
    el.id    = 'phone-marker';
    el.title = 'Phone — drag to reposition';
 
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
    const el = document.getElementById('phone-marker');
    if (el) {
      el.style.left = phonePos.left + '%';
      el.style.top  = phonePos.top  + '%';
    }
  }

  /* ─────────────────────────────────────────
     MOUSE DRAG
  ───────────────────────────────────────── */
  function onMDown(e) {
    e.stopPropagation();   /* prevent #floor-viewport pan handler from firing */
    e.preventDefault();
    isDragging = true;

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
    if (p) { phonePos = p; applyPos(); }
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
    savePos();
  }

  /* ─────────────────────────────────────────
     TOUCH DRAG
  ───────────────────────────────────────── */
  function onTStart(e) {
    e.stopPropagation();
    if (e.touches.length !== 1) return;
    isDragging = true;
    window.addEventListener('touchmove', onTMove, { passive: false });
    window.addEventListener('touchend',  onTEnd);
  }

  function onTMove(e) {
    if (!isDragging) return;
    e.preventDefault();
    const p = clientToPercent(e.touches[0].clientX, e.touches[0].clientY);
    if (p) { phonePos = p; applyPos(); }
  }

  function onTEnd() {
    isDragging = false;
    window.removeEventListener('touchmove', onTMove);
    window.removeEventListener('touchend',  onTEnd);
    savePos();
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
      if (floorRebuilt) inject();
    }).observe(wrap, { childList: true });
  }

  /* ─────────────────────────────────────────
     PUBLIC API  —  called by the existing button
     <button onclick="togglePhone()"> in index.html
  ───────────────────────────────────────── */
  let phoneVisible = true;



  /* ─── INIT ─── */
  loadPos();
  watchFloor();
  // inject as soon as floor-wrap exists
  const waitForFloor = setInterval(function(){
    if(document.getElementById('floor-wrap')){
      inject();
      clearInterval(waitForFloor);
    }
  }, 100);
}());
