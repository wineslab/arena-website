/* ═══════════════════════════════════════════════════════════════════════════
   reserve.js — Reservations: Outlook-style week calendar + "in use" state.

   window.reserve.open(resource)   Show the calendar for one radio / device in
                                   the detail panel. Drag down a day — or
                                   across days — to pick a time, then Reserve.
   window.reserve.setCatalog(list) All bookable resources {key, name, kind}
                                   (rack3d.js registers USRPs + bench gear).
   window.reserve.active           {resource_key: reservation} active now.

   Fires a `reservations-changed` event on window whenever `active` changes;
   rack3d.js uses it to glow reserved gear green, and this file uses it to
   update the availability counts (#lab-avail).

   Backend: /api/reservations (routes/reservations.py). The signed-in user
   comes from window.CURRENT_USER (set in index.html).
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  const SLOT_MIN = 30;                 // drag snaps to half hours
  const SLOTS    = 24 * 60 / SLOT_MIN; // per day
  const SLOT_H   = 20;                 // px per slot
  const DAYS     = 7;
  const POLL_MS  = 30000;

  let catalog = [];
  let active  = {};
  const st = { res: null, start: today(), rows: [], sel: null, drag: null, note: '' };

  /* ── Time helpers ──────────────────────────────────────────────────────── */

  function today() { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
  function addDays(d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); }
  /** Slot index (0 … DAYS*SLOTS) → local Date, DST-safe. */
  function slotDate(i) {
    const day = Math.floor(i / SLOTS), m = (i % SLOTS) * SLOT_MIN;
    const s = st.start;
    return new Date(s.getFullYear(), s.getMonth(), s.getDate() + day, 0, m);
  }
  const fmtDay  = d => d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
  const fmtTime = d => d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const fmtHour = h => new Date(2000, 0, 1, h).toLocaleTimeString([], { hour: 'numeric' });
  function fmtRange(a, b) {
    const sameDay = a.toDateString() === new Date(b - 1).toDateString();
    return sameDay
      ? `${fmtDay(a)} · ${fmtTime(a)} – ${b.getHours() === 0 && b.getMinutes() === 0 ? 'midnight' : fmtTime(b)}`
      : `${fmtDay(a)} ${fmtTime(a)} → ${fmtDay(b)} ${fmtTime(b)}`;
  }
  function fmtLength(ms) {
    const h = ms / 3600000;
    return h >= 24 && h % 24 === 0 ? `${h / 24} day${h === 24 ? '' : 's'}` : `${+h.toFixed(1)} h`;
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  }
  function toast(msg) { if (typeof showToast === 'function') showToast(msg); }


  /* ── Server ────────────────────────────────────────────────────────────── */

  async function loadRows() {
    const from = st.start, to = addDays(st.start, DAYS);
    const q = new URLSearchParams({ from: from.toISOString(), to: to.toISOString(), resource: st.res.key });
    try {
      const r = await fetch('/api/reservations?' + q);
      st.rows = r.ok ? await r.json() : [];
    } catch (_) { st.rows = []; }
  }

  async function refreshActive() {
    try {
      const r = await fetch('/api/reservations/now');
      if (!r.ok) return;
      const list = await r.json();
      active = {};
      list.forEach(x => { active[x.resource_key] = x; });
      window.reserve.active = active;
      updateAvail();
      window.dispatchEvent(new CustomEvent('reservations-changed', { detail: active }));
    } catch (_) { /* offline — keep last state */ }
  }

  function updateAvail() {
    const el = document.getElementById('lab-avail');
    if (!el || !catalog.length) return;
    const count = kind => {
      const all = catalog.filter(c => c.kind === kind);
      return [all.filter(c => !active[c.key]).length, all.length];
    };
    const [rf, rt] = count('radio'), [df, dt] = count('device');
    el.innerHTML = `
      <span class="avail-item" title="USRPs and radio units free right now">
        <span class="material-icons">settings_input_antenna</span>
        <b>${rf}</b>/${rt} radios free</span>
      <span class="avail-sep"></span>
      <span class="avail-item" title="Hosts, devkits, instruments and simulators free right now">
        <span class="material-icons">memory</span>
        <b>${df}</b>/${dt} devices free</span>`;
  }


  /* ── Panel ─────────────────────────────────────────────────────────────── */

  function open(res) {
    st.res = res;
    st.sel = null;
    st.note = '';
    if (typeof openDetailPanel === 'function') openDetailPanel();
    renderShell();
    loadRows().then(renderCalendar);
  }

  function renderShell() {
    const res = st.res;
    const cur = active[res.key];
    const status = cur
      ? `<span class="rsv-pill busy">In use · ${esc(cur.username)} until ${esc(fmtTime(new Date(cur.ends_at)))}</span>`
      : `<span class="rsv-pill free">Available now</span>`;
    document.getElementById('right-content').innerHTML = `
      <div class="rsv">
        <div class="rsv-head">
          <div class="rsv-kicker">${res.kind === 'radio' ? 'Radio' : 'Device'} · reserve</div>
          <div class="rsv-name">${esc(res.name)}</div>
          ${res.sub ? `<div class="rsv-sub">${esc(res.sub)}</div>` : ''}
          <div class="rsv-head-row">
            ${status}
            ${res.details ? `<button class="btn btn-ghost rsv-details">Details &amp; test</button>` : ''}
          </div>
        </div>
        <div class="rsv-toolbar">
          <button class="icon-btn rsv-prev" title="Previous week"><span class="material-icons">chevron_left</span></button>
          <button class="btn btn-ghost rsv-today">Today</button>
          <button class="icon-btn rsv-next" title="Next week"><span class="material-icons">chevron_right</span></button>
          <span class="rsv-range"></span>
        </div>
        <div class="rsv-form"></div>
        <div class="rsv-cal">
          <div class="rsv-days"></div>
          <div class="rsv-scroll"><div class="rsv-grid"></div></div>
        </div>
      </div>`;
    const root = document.querySelector('#right-content .rsv');
    fitHeight();
    root.querySelector('.rsv-prev').onclick  = () => shiftWeek(-DAYS);
    root.querySelector('.rsv-next').onclick  = () => shiftWeek(DAYS);
    root.querySelector('.rsv-today').onclick = () => { st.start = today(); st.sel = null; loadRows().then(renderCalendar); };
    if (res.details) root.querySelector('.rsv-details').onclick = res.details;
    renderForm();
  }

  /** Fill the detail panel's height (measured, since the panel is zoomed by --ui-scale). */
  function fitHeight() {
    const root = document.querySelector('#right-content .rsv');
    const panel = document.getElementById('detail-panel');
    if (!root || !panel) return;
    const cs = getComputedStyle(panel);
    root.style.height = (panel.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom)) + 'px';
  }
  window.addEventListener('resize', fitHeight);
  window.addEventListener('ui-scale', fitHeight);

  function shiftWeek(n) {
    st.start = addDays(st.start, n);
    st.sel = null;
    loadRows().then(renderCalendar);
  }

  /** Blocks for [a, b) clipped to each visible day: [{day, top, height}]. */
  function segments(a, b) {
    const out = [];
    for (let d = 0; d < DAYS; d++) {
      const d0 = slotDate(d * SLOTS), d1 = slotDate((d + 1) * SLOTS);
      const s = Math.max(a, d0), e = Math.min(b, d1);
      if (e <= s) continue;
      const px = (d1 - d0) / (SLOTS * SLOT_H);              // ms per px
      out.push({ day: d, top: (s - d0) / px, height: (e - s) / px });
    }
    return out;
  }

  function renderCalendar() {
    const root = document.querySelector('#right-content .rsv');
    if (!root || !st.res) return;
    const end = addDays(st.start, DAYS - 1);
    root.querySelector('.rsv-range').textContent =
      `${st.start.toLocaleDateString([], { month: 'short', day: 'numeric' })} – ${end.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}`;

    const t0 = today().getTime();
    root.querySelector('.rsv-days').innerHTML = '<div></div>' + Array.from({ length: DAYS }, (_, d) => {
      const day = slotDate(d * SLOTS);
      const isToday = day.getTime() === t0;
      return `<button class="rsv-day${isToday ? ' today' : ''}" data-day="${d}" title="Select the whole day">
        <span>${day.toLocaleDateString([], { weekday: 'short' })}</span><b>${day.getDate()}</b></button>`;
    }).join('');
    root.querySelector('.rsv-days').onwheel = e => {
      root.querySelector('.rsv-scroll').scrollTop += e.deltaY;
      e.preventDefault();
    };
    root.querySelectorAll('.rsv-day').forEach(b => b.onclick = () => {
      const d = +b.dataset.day;
      st.sel = [d * SLOTS, (d + 1) * SLOTS];
      drawSelection(); renderForm();
    });

    const grid = root.querySelector('.rsv-grid');
    const hours = Array.from({ length: 24 }, (_, h) =>
      `<div class="rsv-hour" style="height:${SLOT_H * 2}px">${h === 0 ? '' : fmtHour(h)}</div>`).join('');
    grid.innerHTML = `<div class="rsv-axis">${hours}</div>` +
      Array.from({ length: DAYS }, (_, d) =>
        `<div class="rsv-col" data-day="${d}" style="height:${SLOTS * SLOT_H}px"></div>`).join('');
    const cols = [...grid.querySelectorAll('.rsv-col')];

    // Past time shading + "now" line
    const now = Date.now();
    segments(slotDate(0).getTime(), now).forEach(s => {
      cols[s.day].insertAdjacentHTML('beforeend', `<div class="rsv-past" style="top:${s.top}px;height:${s.height}px"></div>`);
    });
    const nowSeg = segments(now, now + 60000)[0];
    if (nowSeg) cols[nowSeg.day].insertAdjacentHTML('beforeend', `<div class="rsv-now" style="top:${nowSeg.top}px"></div>`);

    // Existing reservations
    st.rows.forEach(r => {
      const a = new Date(r.starts_at).getTime(), b = new Date(r.ends_at).getTime();
      segments(a, b).forEach(s => {
        const el = document.createElement('div');
        el.className = 'rsv-block ' + (r.mine ? 'mine' : 'other');
        el.style.top = s.top + 'px';
        el.style.height = Math.max(s.height, 14) + 'px';
        el.title = `${r.username} · ${fmtRange(new Date(a), new Date(b))}${r.comment ? '\n' + r.comment : ''}`
          + (r.mine ? '\nClick to cancel' : '');
        el.innerHTML = `<b>${r.mine ? 'You' : esc(r.username)}</b>
          <span>${esc(fmtTime(new Date(a)))} – ${esc(fmtTime(new Date(b)))}</span>
          ${r.comment ? `<em>${esc(r.comment)}</em>` : ''}`;
        if (r.mine) el.onclick = () => cancel(r);
        cols[s.day].appendChild(el);
      });
    });

    wireDrag(grid, cols);
    drawSelection();
    // Start the view around the working day the first time.
    const scroller = root.querySelector('.rsv-scroll');
    if (!scroller.dataset.scrolled) {
      scroller.scrollTop = SLOT_H * 2 * 7;
      scroller.dataset.scrolled = '1';
    }
  }

  function wireDrag(grid, cols) {
    const scroller = grid.parentElement;
    const axis = grid.querySelector('.rsv-axis');
    const slotAt = (x, y) => {
      let d = cols.findIndex(c => { const r = c.getBoundingClientRect(); return x >= r.left && x < r.right; });
      if (d < 0) d = x < cols[0].getBoundingClientRect().left ? 0 : DAYS - 1;
      const r = cols[d].getBoundingClientRect();
      // Rects are in screen px but slots are SLOT_H layout px; the panel is
      // zoomed by --ui-scale, so convert with the column's actual scale.
      const scale = r.height / (SLOTS * SLOT_H) || 1;
      const row = Math.min(SLOTS - 1, Math.max(0, Math.floor((y - r.top) / (SLOT_H * scale))));
      return d * SLOTS + row;
    };
    const extend = (x, y) => {
      const cur = slotAt(x, y);
      st.sel = [Math.min(st.drag.anchor, cur), Math.max(st.drag.anchor, cur) + 1];
      drawSelection();
    };

    // Edge auto-scroll: only once the pointer has actually been dragged, and
    // faster the further it is past the edge.
    let raf = 0;
    const autoScroll = () => {
      raf = 0;
      if (!st.drag || !st.drag.moved) return;
      const r = scroller.getBoundingClientRect();
      const edge = 32, y = st.drag.y;
      const over = y < r.top + edge ? y - (r.top + edge) : y > r.bottom - edge ? y - (r.bottom - edge) : 0;
      if (over) {
        scroller.scrollTop += Math.max(-24, Math.min(24, over * 0.5));
        extend(st.drag.x, y);
        raf = requestAnimationFrame(autoScroll);
      }
    };
    const endDrag = () => {
      if (!st.drag) return;
      st.drag = null;
      if (raf) cancelAnimationFrame(raf), raf = 0;
      renderForm();
    };

    grid.onpointerdown = e => {
      if (e.button !== 0 || e.target.closest('.rsv-block') || e.target.closest('.rsv-axis')) return;
      e.preventDefault();
      grid.setPointerCapture(e.pointerId);
      st.drag = { anchor: slotAt(e.clientX, e.clientY), x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, moved: false };
      extend(e.clientX, e.clientY);
    };
    grid.onpointermove = e => {
      if (!st.drag) return;
      if (!e.buttons) return endDrag();                 // release happened outside / was missed
      st.drag.x = e.clientX;
      st.drag.y = e.clientY;
      if (Math.hypot(e.clientX - st.drag.x0, e.clientY - st.drag.y0) > 4) st.drag.moved = true;
      extend(e.clientX, e.clientY);
      if (!raf) raf = requestAnimationFrame(autoScroll);
    };
    grid.onpointerup = grid.onpointercancel = grid.onlostpointercapture = endDrag;

    // Scrolling (wheel / trackpad) while dragging keeps the selection under the pointer.
    scroller.onscroll = () => { if (st.drag) extend(st.drag.x, st.drag.y); };

    // Grab the hour column to scroll the calendar.
    if (axis) {
      axis.onpointerdown = e => {
        if (e.button !== 0) return;
        e.preventDefault();
        axis.setPointerCapture(e.pointerId);
        const y0 = e.clientY, top0 = scroller.scrollTop;
        const scale = axis.getBoundingClientRect().height / axis.offsetHeight || 1;
        axis.onpointermove = ev => { scroller.scrollTop = top0 - (ev.clientY - y0) / scale; };
        axis.onpointerup = axis.onpointercancel = () => { axis.onpointermove = null; };
      };
    }
  }

  function selRange() {
    if (!st.sel) return null;
    return [slotDate(st.sel[0]), slotDate(st.sel[1])];
  }

  function selConflicts() {
    const r = selRange();
    if (!r) return [];
    const [a, b] = r.map(d => d.getTime());
    return st.rows.filter(x => new Date(x.starts_at) < b && new Date(x.ends_at) > a);
  }

  function drawSelection() {
    const root = document.querySelector('#right-content .rsv');
    if (!root) return;
    root.querySelectorAll('.rsv-sel').forEach(n => n.remove());
    const r = selRange();
    if (!r) return;
    const cols = root.querySelectorAll('.rsv-col');
    const bad = selConflicts().length > 0;
    const segs = segments(r[0].getTime(), r[1].getTime());
    segs.forEach((s, i) => {
      const el = document.createElement('div');
      el.className = 'rsv-sel' + (bad ? ' bad' : '');
      el.style.top = s.top + 'px';
      el.style.height = s.height + 'px';
      if (i === 0) el.innerHTML = `<span>${esc(fmtTime(r[0]))} – ${esc(fmtTime(r[1]))}</span>`;
      cols[s.day].appendChild(el);
    });
    // Live summary while dragging
    const sum = root.querySelector('.rsv-form .rsv-sum');
    if (sum) sum.textContent = `${fmtRange(r[0], r[1])} (${fmtLength(r[1] - r[0])})`;
  }

  function renderForm() {
    const root = document.querySelector('#right-content .rsv');
    if (!root) return;
    const box = root.querySelector('.rsv-form');
    const r = selRange();
    if (!r) {
      box.innerHTML = st.note
        ? `<div class="rsv-done"><span class="material-icons">check_circle</span>${esc(st.note)}</div>`
        : `<div class="rsv-hint"><span class="material-icons">touch_app</span>
             Drag on the calendar to pick a time — down a day, or across days. Click a day header for the whole day.</div>`;
      return;
    }
    const clash = selConflicts();
    const past = r[1].getTime() < Date.now();
    const warn = clash.length
      ? `Overlaps ${clash.map(c => (c.mine ? 'your' : esc(c.username) + '’s')).join(', ')} reservation`
      : past ? 'That time is in the past' : '';
    box.innerHTML = `
      <div class="rsv-sum">${esc(fmtRange(r[0], r[1]))} (${esc(fmtLength(r[1] - r[0]))})</div>
      <div class="rsv-who">Reserving as <b>${esc(window.CURRENT_USER || 'you')}</b></div>
      <input class="rsv-comment" type="text" maxlength="300" placeholder="Comment (optional)">
      ${warn ? `<div class="rsv-warn"><span class="material-icons">error_outline</span>${warn}</div>` : ''}
      <div class="rsv-actions">
        <button class="btn btn-ghost rsv-clear">Clear</button>
        <button class="btn btn-primary rsv-go" ${warn ? 'disabled' : ''}>Reserve</button>
      </div>`;
    box.querySelector('.rsv-clear').onclick = () => { st.sel = null; drawSelection(); renderForm(); };
    box.querySelector('.rsv-go').onclick = submit;
    box.querySelector('.rsv-comment').onkeydown = e => { if (e.key === 'Enter' && !warn) submit(); };
  }

  async function submit() {
    const r = selRange();
    const root = document.querySelector('#right-content .rsv');
    if (!r || !root) return;
    const btn = root.querySelector('.rsv-go');
    btn.disabled = true;
    const comment = root.querySelector('.rsv-comment').value.trim();
    let res, data;
    try {
      res = await fetch('/api/reservations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resource_key: st.res.key, resource_name: st.res.name, resource_kind: st.res.kind,
          starts_at: r[0].toISOString(), ends_at: r[1].toISOString(), comment,
        }),
      });
      data = await res.json();
    } catch (_) {
      toast('Could not reach the server');
      btn.disabled = false;
      return;
    }
    if (!res.ok) {
      toast(data.error || 'Could not reserve');
      btn.disabled = false;
      await loadRows();
      renderCalendar();
      renderForm();
      return;
    }
    st.note = `Created a reservation for ${st.res.name} · ${fmtRange(r[0], r[1])}, as ${data.username}.`;
    toast(`Reserved ${st.res.name}`);
    st.sel = null;
    await loadRows();
    renderCalendar();
    renderForm();
    refreshActive();
  }

  async function cancel(r) {
    if (!confirm(`Cancel your reservation of ${r.resource_name}?\n${fmtRange(new Date(r.starts_at), new Date(r.ends_at))}`)) return;
    const res = await fetch('/api/reservations/' + r.id, { method: 'DELETE' });
    if (!res.ok) { toast('Could not cancel'); return; }
    st.note = `Cancelled your reservation of ${r.resource_name}.`;
    await loadRows();
    renderCalendar();
    renderForm();
    refreshActive();
  }


  /* ── Public API + polling ──────────────────────────────────────────────── */

  window.reserve = {
    open,
    active,
    setCatalog(list) { catalog = list; updateAvail(); },
    refresh: refreshActive,
  };
  refreshActive();
  setInterval(refreshActive, POLL_MS);
})();
