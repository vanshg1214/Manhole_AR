/*
 * Mobile rendering budget. Import this BEFORE '@google/model-viewer'.
 *
 * model-viewer renders at window.devicePixelRatio. Phones report 3x, which is 9 shaded pixels per
 * CSS pixel; at 2x the image is still sharp but costs ~55% fewer pixels. Only the WebGL canvas is
 * affected (layout is in CSS pixels), so the page looks identical.
 */
const MAX_DPR = 2;

try {
  const real = window.devicePixelRatio || 1;
  if (real > MAX_DPR && (navigator.maxTouchPoints || 0) > 0) {
    // Safari / Chrome / Firefox differ on whether this lives on window or Window.prototype
    const desc =
      Object.getOwnPropertyDescriptor(window, 'devicePixelRatio') ||
      Object.getOwnPropertyDescriptor(Object.getPrototypeOf(window), 'devicePixelRatio');
    const read = desc && desc.get ? () => desc.get.call(window) : () => real;
    Object.defineProperty(window, 'devicePixelRatio', {
      configurable: true,
      get: () => Math.min(read(), MAX_DPR),
    });
  }
} catch {
  /* not allowed in this browser: render at native resolution */
}
