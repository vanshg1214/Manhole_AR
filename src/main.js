import './style.css';
import '@google/model-viewer';
import { inject } from '@vercel/analytics';

inject();

const modelViewer = document.querySelector('model-viewer');
const hotspots = document.querySelectorAll('.Hotspot');

// Default target & camera orbit setup
let defaultTarget = '0m 1.22m 0m';

modelViewer.addEventListener('load', () => {
  try {
    const target = modelViewer.getCameraTarget();
    defaultTarget = `${target.x}m ${target.y}m ${target.z}m`;
    console.log('Model loaded. Target: ', defaultTarget);
  } catch (e) {
    console.error('Error reading camera target on load:', e);
  }
});

/* ==========================================================================
   Open Lid button (website only)
   The GLB clip is: 5s closed -> open -> hold -> close. AR viewers loop it
   as-is; on the page we skip the 5s wait and play the rest once.
   ========================================================================== */

const lidBtn = document.getElementById('lid-btn');
const LID_WAIT = 5;
let lidTimer = null;

function resetLid() {
  clearTimeout(lidTimer);
  modelViewer.pause();
  modelViewer.currentTime = 0;
  lidBtn.disabled = false;
  lidBtn.textContent = 'Open Lid';
}

lidBtn.addEventListener('click', () => {
  lidBtn.disabled = true;
  lidBtn.textContent = 'Opening...';
  modelViewer.play({ repetitions: 1 });
  // Jump past the 5s closed wait once playback has started
  modelViewer.currentTime = LID_WAIT;
  // Fallback in case the 'finished' event does not fire
  lidTimer = setTimeout(resetLid, (modelViewer.duration - LID_WAIT) * 1000 + 500);
});

modelViewer.addEventListener('finished', resetLid);

/* ==========================================================================
   AR Trigger & QR Modal Control (External Button)
   ========================================================================== */

const customArBtn = document.getElementById('custom-ar-btn');
const qrModal = document.getElementById('qr-modal');
const modalCloseBtn = document.getElementById('modal-close');
const qrImage = document.getElementById('qr-image');

const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

customArBtn.addEventListener('click', () => {
  if (isMobile) {
    // Mobile device: activate native AR overlay camera
    try {
      modelViewer.activateAR();
    } catch (e) {
      console.error('AR activation failed:', e);
    }
  } else {
    // Desktop device: show QR Modal explaining mobile-only restriction
    const currentUrl = window.location.href;
    // Generate QR code pointing to the current page
    qrImage.src = `https://api.qrserver.com/v1/create-qr-code/?size=210x210&data=${encodeURIComponent(currentUrl)}&color=0c0a09&bgcolor=ffffff&qzone=2`;
    qrModal.style.display = 'flex';
  }
});

modalCloseBtn.addEventListener('click', () => {
  qrModal.style.display = 'none';
});

qrModal.addEventListener('click', (e) => {
  if (e.target === qrModal) {
    qrModal.style.display = 'none';
  }
});

/* ==========================================================================
   Hotspots and Camera Focus Management
   ========================================================================== */

// Dismiss hotspot on clicking empty space on the model-viewer
modelViewer.addEventListener('click', (event) => {
  if (!event.target.closest('.Hotspot')) {
    deactivateAllHotspots();
  }
});

// Capture active hotspot toggles
hotspots.forEach(hotspot => {
  hotspot.addEventListener('click', (event) => {
    const isCloseClick = event.target.classList.contains('HotspotClose');
    
    if (isCloseClick) {
      event.stopPropagation();
      deactivateAllHotspots();
      return;
    }
    
    // Ignore clicks inside the active annotation card itself
    if (hotspot.classList.contains('active') && event.target.closest('.HotspotAnnotation')) {
      return;
    }
    
    // Toggle active state
    if (hotspot.classList.contains('active')) {
      deactivateAllHotspots();
    } else {
      activateHotspot(hotspot);
    }
  });
});

function activateHotspot(hotspot) {
  hotspots.forEach(h => {
    if (h !== hotspot) {
      h.classList.remove('active');
      h.classList.remove('flipped');
      h.style.setProperty('--shift-x', '0px');
    }
  });
  
  hotspot.classList.add('active');
  modelViewer.classList.add('has-active-hotspot');
  
  modelViewer.autoRotate = false;
  
  const position = hotspot.getAttribute('data-position');
  if (position) {
    modelViewer.cameraTarget = position;
  }
  
  requestAnimationFrame(() => {
    setTimeout(() => positionAnnotation(hotspot), 60);
  });
}

function positionAnnotation(hotspot) {
  const annotation = hotspot.querySelector('.HotspotAnnotation');
  if (!annotation) return;
  
  hotspot.style.setProperty('--shift-x', '0px');
  hotspot.classList.remove('flipped');
  
  const viewerRect = modelViewer.getBoundingClientRect();
  
  void annotation.offsetHeight;
  let annRect = annotation.getBoundingClientRect();
  
  // Vertical alignment check
  if (annRect.top < viewerRect.top + 5) {
    hotspot.classList.add('flipped');
    void annotation.offsetHeight;
    annRect = annotation.getBoundingClientRect();
  }
  
  // Horizontal alignment check
  let shiftX = 0;
  if (annRect.right > viewerRect.right - 8) {
    shiftX = viewerRect.right - 8 - annRect.right;
  } else if (annRect.left < viewerRect.left + 8) {
    shiftX = viewerRect.left + 8 - annRect.left;
  }
  
  if (shiftX !== 0) {
    hotspot.style.setProperty('--shift-x', `${shiftX}px`);
  }
}

function deactivateAllHotspots() {
  hotspots.forEach(h => {
    h.classList.remove('active');
    h.classList.remove('flipped');
    h.style.setProperty('--shift-x', '0px');
  });
  modelViewer.classList.remove('has-active-hotspot');
  
  modelViewer.autoRotate = true;
  modelViewer.cameraTarget = defaultTarget;
}

// Scale hotspots based on camera distance
modelViewer.addEventListener('camera-change', () => {
  try {
    const orbit = modelViewer.getCameraOrbit();
    const radius = orbit.radius;
    
    const scale = Math.max(0.55, Math.min(1.25, 1.35 / radius));
    hotspots.forEach(hotspot => {
      hotspot.style.setProperty('--camera-scale', scale);
    });
    
    const activeHotspot = document.querySelector('.Hotspot.active');
    if (activeHotspot) {
      positionAnnotation(activeHotspot);
    }
  } catch (e) {}
});

// Log AR Session events
modelViewer.addEventListener('ar-status', (event) => {
  if (event.detail.status === 'session-started') {
    console.log('AR Session started!');
  } else if (event.detail.status === 'not-presenting') {
    console.log('AR Session ended.');
  }
});
