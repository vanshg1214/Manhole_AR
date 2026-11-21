/* ==========================================================================
   Cross-Device AR & QR Compatibility Helper
   Ensures reliable 1:1 camera AR on mobile and QR handover on desktop.
   ========================================================================== */

export const IS_IOS =
  /iPhone|iPad|iPod/i.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && (navigator.maxTouchPoints || 0) > 1);

export const IS_ANDROID = /Android/i.test(navigator.userAgent);

// True mobile devices only (phones & tablets). Excludes Windows/Mac touchscreen laptops.
export const IS_MOBILE =
  IS_IOS ||
  IS_ANDROID ||
  /Mobile|Tablet|Silk|Kindle/i.test(navigator.userAgent);

// Detect iOS in-app browsers (Instagram, WhatsApp, Facebook, LinkedIn, etc.)
// where WKWebView blocks Quick Look camera launch.
export const IS_IOS_INAPP =
  IS_IOS &&
  /FBAN|FBAV|Instagram|LinkedIn|Twitter|ByteLocale|Snapchat|Line|MicroMessenger/i.test(
    navigator.userAgent
  );

// Probe WebXR immersive-ar support in background
export let webxrSupported = false;
if (typeof navigator !== 'undefined' && navigator.xr?.isSessionSupported) {
  navigator.xr
    .isSessionSupported('immersive-ar')
    .then((ok) => {
      webxrSupported = ok;
    })
    .catch(() => {
      webxrSupported = false;
    });
}

/**
 * Builds an Android Google Scene Viewer intent URL.
 * Works even if browser doesn't support WebXR (e.g. Samsung Internet, Mi Browser, Chrome fallback).
 */
export function buildSceneViewerUrl(
  modelAbsoluteUrl,
  fallbackUrl = window.location.href,
  title = '3D Product'
) {
  const encModel = encodeURIComponent(modelAbsoluteUrl);
  const encFallback = encodeURIComponent(fallbackUrl);
  const encTitle = encodeURIComponent(title);
  return (
    `intent://arvr.google.com/scene-viewer/1.2?mode=ar_preferred&disable_occlusion=true&resizable=false` +
    `&file=${encModel}&title=${encTitle}` +
    `#Intent;scheme=https;package=com.google.android.googlequicksearchbox;action=android.intent.action.VIEW;` +
    `S.browser_fallback_url=${encFallback};end;`
  );
}

/**
 * Launch Android Scene Viewer synchronously inside tap event.
 */
export function launchSceneViewer(modelAbsoluteUrl, fallbackUrl, title) {
  window.location.href = buildSceneViewerUrl(modelAbsoluteUrl, fallbackUrl, title);
}

/**
 * Ensures a <model-viewer> has loaded its 3D model into memory (required for iOS Quick Look USDZ generation).
 */
export function ensureModelLoaded(modelViewer, timeoutMs = 15000) {
  if (!modelViewer || modelViewer.loaded) return Promise.resolve();
  modelViewer.loading = 'eager';
  return new Promise((resolve) => {
    modelViewer.addEventListener('load', resolve, { once: true });
    setTimeout(resolve, timeoutMs);
  });
}

/**
 * Unified AR Trigger:
 * Handles device compatibility, orientation reset, and camera/intent launching.
 */
export async function triggerAR({
  modelViewer,
  rotator = null,
  plainGlbUrl = null,
  fallbackUrl = window.location.href,
  title = 'Product',
}) {
  // 1. Desktop / Laptop (including touchscreen laptops) -> Always show QR code
  if (!IS_MOBILE) {
    return { action: 'show_qr' };
  }

  // 2. iOS Devices (iPhone / iPad)
  if (IS_IOS) {
    if (IS_IOS_INAPP) {
      return { action: 'ios_inapp' };
    }
    try {
      if (rotator) rotator.reset();
      // Quick Look builds temporary USDZ from cached GLB, so model must be loaded
      if (modelViewer) await ensureModelLoaded(modelViewer);
      if (modelViewer && (modelViewer.canActivateAR || true)) {
        await modelViewer.activateAR();
        return { action: 'ar_started' };
      }
    } catch (e) {
      console.warn('iOS AR activation error:', e);
      return { action: 'error', reason: 'ios_error' };
    }
  }

  // 3. Android Devices
  if (IS_ANDROID) {
    if (rotator) rotator.reset();

    // Preference A: If WebXR is supported and model-viewer is ready, open directly in Chrome
    if (webxrSupported && modelViewer && modelViewer.canActivateAR) {
      try {
        await modelViewer.activateAR();
        return { action: 'ar_started' };
      } catch (e) {
        console.warn('WebXR activation failed, trying Scene Viewer fallback:', e);
      }
    }

    // Preference B: Google Scene Viewer Intent (synchronous launch inside tap event)
    const targetModelUrl =
      plainGlbUrl || (modelViewer ? new URL(modelViewer.src, window.location.href).href : null);
    if (targetModelUrl) {
      launchSceneViewer(targetModelUrl, fallbackUrl, title);
      return { action: 'ar_started' };
    }
  }

  return { action: 'error', reason: 'unsupported' };
}
