import './style.css';
import './perf.js'; // must come before model-viewer
import '@google/model-viewer';
import { enableFreeRotate } from './freeRotate.js';
import { inject } from '@vercel/analytics';
import { triggerAR } from './arHelper.js';

inject();

const modelViewer = document.querySelector('model-viewer');
// Full 360-degree turntable in every direction (model-viewer's camera orbit stops at the poles)
const rotator = modelViewer
  ? enableFreeRotate(modelViewer, { autoRotate: modelViewer.hasAttribute('auto-rotate') })
  : null;


/* ==========================================================================
   AR Trigger & QR Modal Control (External Button)
   ========================================================================== */

const customArBtn = document.getElementById('custom-ar-btn');
const qrModal = document.getElementById('qr-modal');
const modalCloseBtn = document.getElementById('modal-close');
const qrImage = document.getElementById('qr-image');

const getPlainGlbUrl = () => {
  if (!modelViewer) return null;
  const src = modelViewer.getAttribute('src') || '';
  if (src.includes('750_X_245_CO_D400')) {
    return new URL('/catalogue-models/ar/750-x-245-co-d400-grate-and-channel.glb', window.location.href).href;
  }
  return new URL(src, window.location.href).href;
};

function openArModal(kind) {
  if (!qrModal) return;
  const title = qrModal.querySelector('.modal-header h3');
  const text = qrModal.querySelector('.qr-explanation');
  const qrWrap = qrModal.querySelector('.qr-wrapper');
  const steps = qrModal.querySelector('.modal-instructions');

  if (kind === 'qr') {
    if (title) title.textContent = 'View in your space';
    if (text) text.textContent = 'AR works on phones and tablets. Scan this code with your device camera to continue there.';
    if (qrImage) {
      qrImage.src = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(
        window.location.href
      )}&color=0c0a09&bgcolor=ffffff&qzone=2`;
    }
    if (qrWrap) qrWrap.style.display = '';
    if (steps) {
      steps.innerHTML = `
        <div class="instruction-step">
          <span class="step-num">1</span>
          <span>Open the camera app on your iPhone or Android.</span>
        </div>
        <div class="instruction-step">
          <span class="step-num">2</span>
          <span>Scan the QR code to open this model.</span>
        </div>
        <div class="instruction-step">
          <span class="step-num">3</span>
          <span>Tap "View in your space" to place the 1:1 scale model.</span>
        </div>
      `;
      steps.style.display = '';
    }
  } else if (kind === 'ios_inapp') {
    if (title) title.textContent = 'Open in Safari for AR';
    if (text) text.textContent = 'In-app browsers (like Instagram or WhatsApp) block 3D camera access. Please open this page in Safari to view this model in your space.';
    if (qrWrap) qrWrap.style.display = 'none';
    if (steps) {
      steps.innerHTML = `
        <div class="instruction-step">
          <span class="step-num">1</span>
          <span>Tap the <strong>•••</strong> or <strong>Share</strong> button.</span>
        </div>
        <div class="instruction-step">
          <span class="step-num">2</span>
          <span>Select <strong>Open in Safari</strong> (or Open in Chrome).</span>
        </div>
        <div class="instruction-step">
          <span class="step-num">3</span>
          <span>Tap <strong>View in your space</strong> to place the model.</span>
        </div>
      `;
      steps.style.display = '';
    }
  } else {
    if (title) title.textContent = 'AR is not available on this browser';
    if (text) text.textContent = 'On iPhone/iPad, please use Safari. On Android, please use Chrome with "Google Play Services for AR" installed and updated.';
    if (qrWrap) qrWrap.style.display = 'none';
    if (steps) steps.style.display = 'none';
  }

  qrModal.style.display = 'flex';
}

if (customArBtn) {
  customArBtn.addEventListener('click', async () => {
    const plainGlb = getPlainGlbUrl();
    const pageTitle = document.querySelector('h1')?.textContent?.trim() || '3D Product';

    const result = await triggerAR({
      modelViewer,
      rotator,
      plainGlbUrl: plainGlb,
      fallbackUrl: window.location.href,
      title: pageTitle,
    });

    if (result.action === 'show_qr') {
      openArModal('qr');
    } else if (result.action === 'ios_inapp') {
      openArModal('ios_inapp');
    } else if (result.action === 'error') {
      openArModal('unsupported');
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

/* AR session logging only. (No per-frame camera-change listeners: they cost frames on phones.) */
if (modelViewer) {
  modelViewer.addEventListener('ar-status', (event) => {
    if (event.detail.status === 'session-started') console.log('AR Session started!');
    else if (event.detail.status === 'not-presenting') console.log('AR Session ended.');
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
