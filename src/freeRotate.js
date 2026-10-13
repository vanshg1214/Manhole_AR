/*
 * Free 360° rotation for <model-viewer>.
 *
 * model-viewer's own camera controls orbit a camera and clamp the vertical angle to 0-180deg
 * (it can never pass over the poles), so a model can be spun sideways but not flipped over.
 * Here we rotate the MODEL instead (trackball style) so a finger can turn it any way, without limit.
 *
 *   1 finger / mouse drag  -> rotate in every direction, with a little inertia
 *   2 fingers / wheel      -> zoom
 *   double click           -> reset
 *
 * It writes straight to the scene pivot (no attribute change, so no bounding-box / shadow rebuilds
 * per move), which is also the cheapest way to turn the model on a phone.
 * If model-viewer's internals are not reachable it falls back to the built-in camera controls.
 */
const sceneOf = (mv) => {
  for (let o = mv; o; o = Object.getPrototypeOf(o)) {
    const sym = Object.getOwnPropertySymbols(o).find((s) => s.description === 'scene');
    if (sym && mv[sym] && mv[sym].scenePivot) return mv[sym];
  }
  return null;
};

// quaternion = [x, y, z, w]
const mul = (a, b) => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
];
const axis = (x, y, z, ang) => {
  const s = Math.sin(ang / 2);
  return [x * s, y * s, z * s, Math.cos(ang / 2)];
};
const norm = (q) => {
  const l = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
  return [q[0] / l, q[1] / l, q[2] / l, q[3] / l];
};

export function enableFreeRotate(mv, { autoRotate = false, autoRotateSpeed = 0.35, zoom = true } = {}) {
  const scene = sceneOf(mv);
  if (!scene) {
    console.warn('free rotate unavailable, using built-in controls');
    mv.setAttribute('camera-controls', '');
    if (autoRotate) mv.setAttribute('auto-rotate', '');
    return { reset() {} };
  }

  mv.removeAttribute('camera-controls');
  mv.removeAttribute('auto-rotate');
  mv.style.touchAction = 'none';

  const pivot = scene.scenePivot;
  let q = [0, 0, 0, 1];
  let velX = 0; // rad/s about world X (vertical drag)
  let velY = 0; // rad/s about world Y (horizontal drag)
  let lastMove = 0;
  let idleSince = performance.now();
  let raf = 0;
  let visible = true;
  let radius0 = 0;
  let pinchDist = 0;
  const pointers = new Map();

  const apply = () => {
    pivot.quaternion.set(q[0], q[1], q[2], q[3]);
    pivot.updateMatrixWorld(true);
    scene.queueRender();
  };

  const rotate = (dx, dy) => {
    // screen drag -> rotation about the camera's up / right axes (world Y / X)
    q = norm(mul(mul(axis(0, 1, 0, dx), axis(1, 0, 0, dy)), q));
    apply();
  };

  // a drag of 1.5 viewer widths is one full turn
  const perPx = () => (2 * Math.PI) / (1.5 * Math.max(240, mv.clientWidth));

  const tick = (now, prev) => {
    raf = 0;
    const dt = Math.min(0.05, (now - prev) / 1000);
    let moving = false;
    if (pointers.size === 0) {
      if (Math.abs(velX) > 0.02 || Math.abs(velY) > 0.02) {
        rotate(velY * dt, velX * dt);
        const decay = Math.pow(0.04, dt); // ~0.5s glide
        velX *= decay;
        velY *= decay;
        moving = true;
      } else if (autoRotate && visible && !document.hidden && now - idleSince > 2500) {
        rotate(autoRotateSpeed * dt, 0);
        moving = true;
      }
    }
    if (moving || (autoRotate && pointers.size === 0 && visible && !document.hidden)) schedule(now);
  };
  const schedule = (prev) => {
    if (!raf) raf = requestAnimationFrame((t) => tick(t, prev ?? t));
  };

  const setRadius = (r) => {
    const o = mv.getCameraOrbit();
    mv.cameraOrbit = `${o.theta}rad ${o.phi}rad ${r}m`;
  };
  const clampRadius = (r) => Math.min(radius0 * 2.2, Math.max(radius0 * 0.35, r));
  const readRadius = () => {
    try { radius0 = mv.getCameraOrbit().radius; } catch { /* not ready yet */ }
  };

  mv.addEventListener('load', readRadius, { once: true });
  if (mv.loaded) readRadius();

  mv.addEventListener('pointerdown', (e) => {
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try { mv.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    velX = velY = 0;
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
    }
  });

  mv.addEventListener('pointermove', (e) => {
    const p = pointers.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    p.x = e.clientX;
    p.y = e.clientY;

    if (pointers.size >= 2) {
      if (!zoom || !radius0) return;
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinchDist > 0 && d > 0) setRadius(clampRadius(mv.getCameraOrbit().radius * (pinchDist / d)));
      pinchDist = d;
      return;
    }

    const k = perPx();
    const now = performance.now();
    const dt = Math.max(0.008, (now - lastMove) / 1000);
    rotate(dx * k, dy * k);
    velY = velY * 0.5 + ((dx * k) / dt) * 0.5; // smoothed release velocity
    velX = velX * 0.5 + ((dy * k) / dt) * 0.5;
    lastMove = now;
    idleSince = now;
  });

  const end = (e) => {
    if (!pointers.delete(e.pointerId)) return;
    try { mv.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    if (performance.now() - lastMove > 90) velX = velY = 0; // finger rested before lifting
    idleSince = performance.now();
    pinchDist = 0;
    schedule();
  };
  mv.addEventListener('pointerup', end);
  mv.addEventListener('pointercancel', end);

  if (zoom) {
    mv.addEventListener(
      'wheel',
      (e) => {
        if (!radius0) return;
        e.preventDefault();
        setRadius(clampRadius(mv.getCameraOrbit().radius * Math.exp(e.deltaY * 0.0012)));
      },
      { passive: false }
    );
  }

  const reset = () => {
    q = [0, 0, 0, 1];
    velX = velY = 0;
    apply();
    if (radius0) setRadius(radius0);
  };
  mv.addEventListener('dblclick', reset);

  if (autoRotate) {
    new IntersectionObserver((en) => {
      visible = en[0].isIntersecting;
      if (visible) schedule();
    }).observe(mv);
    document.addEventListener('visibilitychange', () => schedule());
    schedule();
  }

  return { reset };
}
