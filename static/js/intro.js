/* ═══════════════════════════════════════════════════════════════════════════
   intro.js — Rack view entry title: "INSI LAB" zooms past the viewer.

   Built only from transform + opacity animations (Web Animations API), which
   the browser runs on the compositor thread — so the motion stays smooth even
   while the main thread is busy starting the 3D room.

   Timeline (2.2 s):
     0.00–0.65  title fades in while its letters glide together
     0.65–1.10  holds, easing slightly larger
     1.10–2.20  the whole title zooms past the viewer and fades out, the
                backdrop fading with it to reveal the room flying in

   playIntro(host) fills `host` and resolves when done; a click skips.
   ═══════════════════════════════════════════════════════════════════════════ */

const DURATION = 2200;
// The word is laid out RASTER× larger than it appears and scaled down, so the
// GPU layer stays sharp while it is zoomed up (the layer is not re-rasterised).
const RASTER = 3;

const EASE_OUT = 'cubic-bezier(.22,.7,.3,1)';
const EASE_IN  = 'cubic-bezier(.6,0,.85,.3)';
const EASE_IO  = 'cubic-bezier(.65,0,.35,1)';

let running = null;

export function playIntro(host) {
  if (running) running.stop();
  host.innerHTML = `
    <div class="lab-intro-word">
      <div class="lab-intro-letters">${['I', 'N', 'S', 'I'].map(l => `<span>${l}</span>`).join('')}</div>
      <div class="lab-intro-sub">LAB</div>
    </div>`;
  host.classList.add('play');
  const word = host.querySelector('.lab-intro-word');
  const letters = [...host.querySelectorAll('.lab-intro-letters span')];
  const r = 1 / RASTER;

  const anims = [
    host.animate([
      { opacity: 1, offset: 0 },
      { opacity: 1, offset: 0.5, easing: EASE_IO },
      { opacity: 0, offset: 1 },
    ], { duration: DURATION, fill: 'forwards' }),

    word.animate([
      { transform: `scale(${0.82 * r})`, opacity: 0, offset: 0,   easing: EASE_OUT },
      { transform: `scale(${1.00 * r})`, opacity: 1, offset: 0.3, easing: 'ease-in-out' },
      { transform: `scale(${1.05 * r})`, opacity: 1, offset: 0.5, easing: EASE_IN },
      { transform: `scale(${32 * r})`,   opacity: 0, offset: 1 },
    ], { duration: DURATION, fill: 'forwards' }),

    // Letters start spread out and glide into place.
    ...letters.map((el, i) => el.animate([
      { transform: `translateX(${(i - 1.5) * 0.45}em)` },
      { transform: 'translateX(0)' },
    ], { duration: DURATION * 0.3, easing: EASE_OUT, fill: 'both' })),
  ];

  return new Promise(resolve => {
    let done = false;
    const stop = () => {
      if (done) return;
      done = true;
      anims.forEach(a => a.cancel());
      host.classList.remove('play');
      host.innerHTML = '';
      running = null;
      resolve();
    };
    running = { stop };
    host.onclick = stop;
    anims[1].finished.then(stop, () => {});
    // Safety net: never leave the title covering the room (e.g. if the tab
    // was backgrounded and the animation paused).
    setTimeout(stop, DURATION + 400);
  });
}
