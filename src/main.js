import './style.css';
import '@google/model-viewer';
import { inject } from '@vercel/analytics';

inject();

const modelViewer = document.querySelector('model-viewer');
const hotspots = document.querySelectorAll('.Hotspot');

// Default target & camera orbit setup
let defaultTarget = '0m 1.22m 0m';

if (modelViewer) {
  modelViewer.addEventListener('load', () => {
    try {
      const target = modelViewer.getCameraTarget();
      defaultTarget = `${target.x}m ${target.y}m ${target.z}m`;
      console.log('Model loaded. Target: ', defaultTarget);
    } catch (e) {
      console.error('Error reading camera target on load:', e);
    }
  });
}

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

if (lidBtn && modelViewer) {
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
}

/* ==========================================================================
   AR Trigger & QR Modal Control (External Button)
   ========================================================================== */

const customArBtn = document.getElementById('custom-ar-btn');
const qrModal = document.getElementById('qr-modal');
const modalCloseBtn = document.getElementById('modal-close');
const qrImage = document.getElementById('qr-image');

/*
 * Detect what the device can actually do, instead of guessing from the window size or user agent
 * (iPadOS reports itself as a Mac, and a narrow desktop window is still a desktop):
 *  1. modelViewer.canActivateAR is true only where a native AR viewer exists
 *     (Scene Viewer on Android with Google Play Services for AR, Quick Look on iPhone/iPad Safari).
 *  2. Otherwise, a touch-first device (phone/tablet) gets browser-specific help.
 *  3. Otherwise it is a desktop, which gets a QR code to continue on a phone or tablet.
 */
const isTouchDevice = () =>
  (navigator.maxTouchPoints || 0) > 0 && window.matchMedia('(any-pointer: coarse)').matches;

function ensureModelLoaded() {
  if (!modelViewer || modelViewer.loaded) return Promise.resolve();
  return new Promise((resolve) => {
    modelViewer.addEventListener('load', resolve, { once: true });
    setTimeout(resolve, 20000); // do not hang forever on a slow connection
  });
}

function openArHelp(kind) {
  const title = qrModal.querySelector('.modal-header h3');
  const text = qrModal.querySelector('.qr-explanation');
  const qrWrap = qrModal.querySelector('.qr-wrapper');
  const steps = qrModal.querySelector('.modal-instructions');
  if (kind === 'desktop') {
    title.textContent = 'View cover in your space';
    text.textContent = 'AR works on phones and tablets. Scan this code with your device camera to continue there.';
    if (qrImage) qrImage.src = `https://api.qrserver.com/v1/create-qr-code/?size=210x210&data=${encodeURIComponent(window.location.href)}&color=0c0a09&bgcolor=ffffff&qzone=2`;
    qrWrap.style.display = '';
    steps.style.display = '';
  } else {
    const isApple = /iPhone|iPad|iPod/i.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    title.textContent = 'AR is not available in this browser';
    text.textContent = isApple
      ? 'On iPhone and iPad, please open this page in Safari (not inside another app) and tap the button again.'
      : 'On Android, please open this page in Chrome and make sure "Google Play Services for AR" is installed and up to date, then tap the button again.';
    qrWrap.style.display = 'none';
    steps.style.display = 'none';
  }
  qrModal.style.display = 'flex';
}

if (customArBtn) {
  customArBtn.addEventListener('click', async () => {
    if (modelViewer && modelViewer.canActivateAR) {
      try {
        await ensureModelLoaded(); // Quick Look builds its AR file from the loaded model
        await modelViewer.activateAR();
      } catch (e) {
        console.error('AR activation failed:', e);
        openArHelp('touch');
      }
    } else {
      openArHelp(isTouchDevice() ? 'touch' : 'desktop');
    }
  });
}

if (modalCloseBtn && qrModal) {
  modalCloseBtn.addEventListener('click', () => {
    qrModal.style.display = 'none';
  });
}

if (qrModal) {
  qrModal.addEventListener('click', (e) => {
    if (e.target === qrModal) {
      qrModal.style.display = 'none';
    }
  });
}

/* ==========================================================================
   Hotspots and Camera Focus Management
   ========================================================================== */

if (modelViewer) {
  // Dismiss hotspot on clicking empty space on the model-viewer
  modelViewer.addEventListener('click', (event) => {
    if (!event.target.closest('.Hotspot')) {
      deactivateAllHotspots();
    }
  });
}

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

if (modelViewer) {
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
}

/* ==========================================================================
   Lead Generation & Catalogue Navigation
   ========================================================================== */
const seeCatalogueBtn = document.getElementById('see-catalogue-btn');
const leadModal = document.getElementById('lead-modal');
const leadClose = document.getElementById('lead-close');
const leadForm = document.getElementById('lead-form');

if (seeCatalogueBtn) {
  seeCatalogueBtn.addEventListener('click', () => {
    // If they already filled the form, you could bypass it by checking localStorage:
    if (localStorage.getItem('catalogueAccess') === 'true') {
      window.location.href = 'catalogue/index.html';
    } else {
      leadModal.style.display = 'flex';
    }
  });
}

if (leadClose) {
  leadClose.addEventListener('click', () => {
    leadModal.style.display = 'none';
  });
}

if (leadModal) {
  leadModal.addEventListener('click', (e) => {
    if (e.target === leadModal) {
      leadModal.style.display = 'none';
    }
  });
}

if (leadForm) {
  leadForm.addEventListener('submit', (e) => {
    e.preventDefault();
    // Here you would typically send the data to your backend
    const name = document.getElementById('lead-name').value;
    const email = document.getElementById('lead-email').value;
    const phone = document.getElementById('lead-phone').value;
    
    console.log('Lead captured:', { name, email, phone });
    
    // Save access in localStorage
    localStorage.setItem('catalogueAccess', 'true');
    
    // Redirect to catalogue
    window.location.href = 'catalogue/index.html';
  });
}
