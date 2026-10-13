/*
 * Mobile rendering budget. Import this BEFORE '@google/model-viewer'.
 *
 * model-viewer renders at window.devicePixelRatio. Phones report 3x, which is 9 shaded pixels per
 * CSS pixel; at 2x the image is still sharp but costs ~55% fewer pixels. Only the WebGL canvas is
 * affected (layout is in CSS pixels), so the page looks identical.
 */
const MAX_DPR = 2;
const realDpr = () => window.devicePixelRatio || 1;

if (realDpr() > MAX_DPR && (navigator.maxTouchPoints || 0) > 0) {
  const native = Object.getOwnPropertyDescriptor(window, 'devicePixelRatio');
  const read = native && native.get ? () => native.get.call(window) : () => native.value;
  Object.defineProperty(window, 'devicePixelRatio', {
    configurable: true,
    get: () => Math.min(read(), MAX_DPR),
  });
}
