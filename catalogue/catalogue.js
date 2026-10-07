import '@google/model-viewer';
import products from './products.json';

// Models and posters live in /public/catalogue-models. Resolve from this script's
// location so it works in dev, on Vercel and under a sub-path (e.g. GitHub Pages).
// (kept as a variable: Vite would otherwise rewrite `new URL(literal, import.meta.url)` as an asset)
const scriptUrl = import.meta.url;
const BASE = new URL('../', scriptUrl).href;
const modelUrl = (p) => `${BASE}catalogue-models/${encodeURIComponent(p.file)}`;
const posterUrl = (p) => `${BASE}catalogue-models/posters/${encodeURIComponent(p.id)}.webp`;

const $ = (id) => document.getElementById(id);
const grid = $('grid');
const qrModal = $('qr-modal');

const AR_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><path d="M3.27 6.96L12 12.01l8.73-5.05M12 22.08V12" /></svg>';

function showQr(p) {
  const link = `${location.origin}${location.pathname}#${p.id}`;
  $('qr-img').src = `https://api.qrserver.com/v1/create-qr-code/?size=440x440&margin=8&data=${encodeURIComponent(link)}`;
  qrModal.hidden = false;
  document.body.classList.add('lock');
}

function hideQr() {
  qrModal.hidden = true;
  document.body.classList.remove('lock');
}

// Start loading a card's model (keeping its poster visible) once it is close to the screen.
const preloader = new IntersectionObserver(
  (entries) => {
    entries.forEach((en) => {
      if (!en.isIntersecting) return;
      en.target.__mv.loading = 'eager';
      preloader.unobserve(en.target);
    });
  },
  { rootMargin: '400px 0px' }
);

function ensureLoaded(mv) {
  if (mv.loaded) return Promise.resolve();
  mv.loading = 'eager';
  return new Promise((resolve) => {
    mv.addEventListener('load', resolve, { once: true });
    setTimeout(resolve, 20000); // don't hang forever on a slow connection
  });
}

function createCard(p) {
  const card = document.createElement('article');
  card.className = 'card';
  card.id = p.id;

  const media = document.createElement('div');
  media.className = 'card-media';

  // The poster image is what visitors see. Cards near the screen load their model in the
  // background (see `preloader`) so AR opens instantly; hovering (mouse) or tapping (touch)
  // the image reveals the live 3D model.
  const mv = document.createElement('model-viewer');
  mv.setAttribute('src', modelUrl(p));
  mv.setAttribute('poster', posterUrl(p));
  mv.setAttribute('alt', `3D model of ${p.name}`);
  mv.setAttribute('reveal', 'interaction');
  mv.setAttribute('loading', 'lazy');
  mv.setAttribute('camera-controls', '');
  mv.setAttribute('touch-action', 'pan-y');
  mv.setAttribute('environment-image', 'neutral');
  mv.setAttribute('exposure', '2.2');
  mv.setAttribute('camera-orbit', '35deg 62deg auto');
  mv.setAttribute('interaction-prompt', 'none');
  mv.setAttribute('disable-zoom', ''); // mouse wheel keeps scrolling the page; dragging still rotates
  // AR: native Scene Viewer (Android) / Quick Look (iPhone + iPad) at true 1:1 scale on the floor
  mv.setAttribute('ar', '');
  mv.setAttribute('ar-modes', 'scene-viewer quick-look');
  mv.setAttribute('ar-scale', 'fixed');
  mv.setAttribute('ar-placement', 'floor');
  const hidden = document.createElement('button'); // suppress model-viewer's built-in AR button
  hidden.slot = 'ar-button';
  hidden.hidden = true;
  mv.appendChild(hidden);
  media.appendChild(mv);

  // Mouse: hovering the image switches it to the live 3D model. Touch: tapping does (reveal="interaction").
  media.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') mv.dismissPoster(); });
  media.addEventListener('click', () => mv.dismissPoster()); // tap on phones / tablets (also click on desktop)
  preloader.observe(media);
  media.__mv = mv;

  const foot = document.createElement('div');
  foot.className = 'card-foot';
  const title = document.createElement('h2');
  title.className = 'card-title';
  title.textContent = p.name;
  title.title = p.name;

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn-ar';
  btn.innerHTML = `${AR_ICON}<span>View in your space</span>`;
  btn.addEventListener('click', async () => {
    // Feature-detect instead of sniffing the user agent: iPadOS reports itself as a Mac.
    if (mv.canActivateAR) {
      try {
        await ensureLoaded(mv); // iOS Quick Look needs the model loaded to build its AR file
        await mv.activateAR();
      } catch (err) {
        console.error('AR activation failed:', err);
      }
    } else {
      showQr(p);
    }
  });

  foot.append(title, btn);
  card.append(media, foot);
  return card;
}

products.forEach((p) => grid.appendChild(createCard(p)));

qrModal.addEventListener('click', (e) => { if (e.target === qrModal) hideQr(); });
$('qr-close').addEventListener('click', hideQr);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !qrModal.hidden) hideQr(); });

// Deep link (from the desktop QR code): /catalogue/#product-id scrolls to and highlights that product
const target = document.getElementById(decodeURIComponent(location.hash.slice(1)));
if (target && target.classList.contains('card')) {
  target.classList.add('highlight');
  requestAnimationFrame(() => target.scrollIntoView({ block: 'center' }));
}
