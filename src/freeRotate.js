/*
 * Free 360° rotation for <model-viewer>.
 *
 * model-viewer's own camera controls orbit a camera and clamp the vertical angle to 0-180deg
 * (it can never pass over the poles), so a model can be spun sideways but not flipped over.
 * Here we rotate the MODEL instead (trackball style) so a finger can turn it any way, without limit.
 *
 *   1 finger / mouse drag  -> spin 360 degrees about the model's own vertical axis (horizontal drag) and tilt up/down (vertical drag), with a little inertia
 *   2 fingers / wheel      -> zoom
 *   double tap / dblclick  -> straighten + reset (also the small reset button on the stage)
 *
 * The model is spun about its OWN vertical axis and tilted about the SCREEN's horizontal axis, so it
 * can never lean sideways ("roll") or go upside down: it always stands level on screen.
 *
 * Zoom goes in close enough to read the detail; two fingers (or shift / right mouse button) also pan,
 * so a close-up can be moved to any part of the product.
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

export function enableFreeRotate(mv, { autoRotate = false, autoRotateSpeed = 0.35, zoom = true, fullTilt = false } = {}) {
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
  let yaw = 0; // spin about the model's own vertical axis
  let pitch = 0; // tilt about the screen's horizontal axis (clamped, see MAX_PITCH)
  let velX = 0; // rad/s tilt (vertical drag)
  let velY = 0; // rad/s spin (horizontal drag)
  let resetAnim = null;
  let lastMove = 0;
  let idleSince = performance.now();
  let raf = 0;
  let visible = true;
  let inAR = false; // while an AR session runs the model must stay still where it was placed
  let radius0 = 0;
  let target0 = null;
  let pinchDist = 0;
  let pinchMid = null;
  let panning = false;
  const pointers = new Map();

  const apply = () => {
    // yaw: about the model's own vertical axis (world Y).
    // pitch: about the camera's horizontal "right" axis, so a vertical drag always tilts the model
    // straight toward / away from the viewer, whatever azimuth the camera was framed from.
    let az = 0;
    try { az = mv.getCameraOrbit().theta; } catch { /* not ready yet */ }
    const rx = Math.cos(az);
    const rz = -Math.sin(az);
    const sp = Math.sin(pitch / 2), cp = Math.cos(pitch / 2);
    const sy = Math.sin(yaw / 2), cy = Math.cos(yaw / 2);
    // q = Raxis(right, pitch) * Ry(yaw)
    const ax = rx * sp, ay = 0, az2 = rz * sp, aw = cp;
    const bx = 0, by = sy, bz = 0, bw = cy;
    pivot.quaternion.set(
      aw * bx + ax * bw + ay * bz - az2 * by,
      aw * by - ax * bz + ay * bw + az2 * bx,
      aw * bz + ax * by - ay * bx + az2 * bw,
      aw * bw - ax * bx - ay * by - az2 * bz
    );
    pivot.updateMatrixWorld(true);
    scene.queueRender();
  };

  // Tilt stays within +/-85deg (top view <-> underside view) so the product is never upside down or leaning.
  // fullTilt: the tilt is unlimited too (a complete 360 over the top), still with no sideways lean.
  const MAX_PITCH = fullTilt ? Infinity : (85 * Math.PI) / 180;
  const rotate = (dYaw, dPitch) => {
    if (inAR) return;
    yaw += dYaw;
    pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, pitch + dPitch));
    apply();
  };

  // a drag of 1.5 viewer widths is one full turn
  const perPx = () => (2 * Math.PI) / (1.5 * Math.max(240, mv.clientWidth));

  const tick = (now, prev) => {
    raf = 0;
    const dt = Math.min(0.05, (now - prev) / 1000);
    let moving = false;
    if (inAR) return;
    if (resetAnim) {
      const t = Math.min(1, (now - resetAnim.t0) / 320);
      const e = 1 - Math.pow(1 - t, 3);
      yaw = resetAnim.yaw * (1 - e);
      pitch = resetAnim.pitch * (1 - e);
      apply();
      if (t >= 1) resetAnim = null;
      schedule(now);
      return;
    }
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
  const MIN_ZOOM = 0.12; // closest view: 12% of the framing distance (about 8x magnification)
  const clampRadius = (r) => Math.min(radius0 * 2.2, Math.max(radius0 * MIN_ZOOM, r));
  const readRadius = () => {
    try {
      radius0 = mv.getCameraOrbit().radius;
      const t = mv.getCameraTarget();
      target0 = { x: t.x, y: t.y, z: t.z };
      // let model-viewer's own limits allow the wider zoom range too
      const min = mv.minCameraOrbit?.split(' ') ?? ['auto', '0deg', 'auto'];
      mv.minCameraOrbit = `${min[0]} ${min[1]} ${radius0 * MIN_ZOOM}m`;
      mv.maxCameraOrbit = `auto 180deg ${radius0 * 2.2}m`;
    } catch { /* not ready yet */ }
  };

  // move the view in the screen plane (used by two-finger drag / shift or right-button drag)
  const pan = (dx, dy) => {
    if (!radius0 || !target0) return;
    const o = mv.getCameraOrbit();
    const t = mv.getCameraTarget();
    const fov = ((mv.getFieldOfView?.() ?? 45) * Math.PI) / 180;
    const k = (2 * o.radius * Math.tan(fov / 2)) / Math.max(1, mv.clientHeight);
    const rx = Math.cos(o.theta), rz = -Math.sin(o.theta); // screen right
    const ux = -Math.cos(o.phi) * Math.sin(o.theta), uy = Math.sin(o.phi), uz = -Math.cos(o.phi) * Math.cos(o.theta); // screen up
    const lim = radius0 * 0.6;
    const c = (v, v0) => Math.max(v0 - lim, Math.min(v0 + lim, v));
    const x = c(t.x - rx * dx * k + ux * dy * k, target0.x);
    const y = c(t.y + uy * dy * k, target0.y);
    const z = c(t.z - rz * dx * k + uz * dy * k, target0.z);
    mv.cameraTarget = `${x}m ${y}m ${z}m`;
  };

  mv.addEventListener('load', readRadius, { once: true });
  if (mv.loaded) readRadius();

  mv.addEventListener('pointerdown', (e) => {
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try { mv.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    velX = velY = 0;
    resetAnim = null;
    panning = e.pointerType === 'mouse' && (e.shiftKey || e.button === 2);
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
      pinchMid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
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
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      if (pinchMid) pan(mid.x - pinchMid.x, mid.y - pinchMid.y);
      pinchMid = mid;
      return;
    }

    if (panning) { pan(dx, dy); return; }

    // slower turning when zoomed in, so close-ups are easy to steer
    const zoomK = radius0 ? Math.max(0.25, Math.min(1, mv.getCameraOrbit().radius / radius0)) : 1;
    const k = perPx() * zoomK;
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
    pinchMid = null;
    if (pointers.size === 0) panning = false;
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
        setRadius(clampRadius(mv.getCameraOrbit().radius * Math.exp(e.deltaY * (e.ctrlKey ? 0.01 : 0.0012))));
      },
      { passive: false }
    );
  }

  const TAU = Math.PI * 2;
  const reset = (animate = true) => {
    velX = velY = 0;
    // go to the nearest upright pose instead of unwinding all the turns
    yaw -= Math.round(yaw / TAU) * TAU;
    pitch -= Math.round(pitch / TAU) * TAU;
    if (animate && (yaw || pitch)) resetAnim = { yaw, pitch, t0: performance.now() };
    else { yaw = pitch = 0; apply(); }
    if (radius0) setRadius(radius0);
    if (target0) mv.cameraTarget = `${target0.x}m ${target0.y}m ${target0.z}m`;
    schedule();
  };
  mv.addEventListener('dblclick', () => reset());
  mv.addEventListener('contextmenu', (e) => e.preventDefault()); // right button pans

  // double-tap (touch screens do not fire dblclick reliably)
  let lastTap = 0;
  let downAt = null;
  mv.addEventListener('pointerdown', (e) => { downAt = { x: e.clientX, y: e.clientY, t: performance.now() }; });
  mv.addEventListener('pointerup', (e) => {
    if (!downAt || e.pointerType === 'mouse') return;
    const now = performance.now();
    const tap = now - downAt.t < 250 && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) < 10;
    if (tap && now - lastTap < 350) { reset(); lastTap = 0; } else if (tap) lastTap = now;
  });

  // visible "straighten / reset view" button
  const host = mv.parentElement;
  if (host) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.setAttribute('aria-label', 'Reset view');
    btn.title = 'Reset view';
    btn.innerHTML =
      '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/></svg>';
    Object.assign(btn.style, {
      position: 'absolute', top: '10px', right: '10px', zIndex: '5',
      width: '40px', height: '40px', display: 'grid', placeItems: 'center',
      color: '#14213d', background: 'rgba(255,255,255,0.92)', border: '1px solid rgba(20,33,61,0.15)',
      borderRadius: '50%', cursor: 'pointer', padding: '0', WebkitTapHighlightColor: 'transparent',
      boxShadow: '0 2px 8px rgba(20,33,61,0.12)',
    });
    btn.addEventListener('click', (e) => { e.stopPropagation(); reset(); });
    host.appendChild(btn);
  }

  mv.addEventListener('ar-status', (e) => {
    const active = e.detail.status === 'session-started' || e.detail.status === 'object-placed';
    if (active && !inAR) {
      inAR = true;
      velX = velY = 0;
      resetAnim = null;
      yaw = pitch = 0; // upright, no spin
      apply();
    } else if (!active && e.detail.status !== 'object-placed' && inAR) {
      inAR = false;
      idleSince = performance.now();
      schedule();
    }
  });

  if (autoRotate) {
    new IntersectionObserver((en) => {
      visible = en[0].isIntersecting;
      if (visible) schedule();
    }).observe(mv);
    document.addEventListener('visibilitychange', () => schedule());
    schedule();
  }

  return { reset: () => reset(false) };
}
