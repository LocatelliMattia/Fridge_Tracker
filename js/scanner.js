// scanner.js — Thin wrapper around the html5-qrcode library.
// Library is loaded via CDN in index.html (window.Html5Qrcode global).
// We only care about 1D barcodes commonly used on food packaging
// (EAN-13, EAN-8, UPC-A) to keep scanning fast and avoid false positives.

const SCANNER_ELEMENT_ID = 'scanner-viewport';
const SUPPORTED_FORMATS = [
  Html5QrcodeSupportedFormats.EAN_13,
  Html5QrcodeSupportedFormats.EAN_8,
  Html5QrcodeSupportedFormats.UPC_A,
  Html5QrcodeSupportedFormats.UPC_E,
];

let scannerInstance = null;

/**
 * Starts the camera and begins scanning for a barcode.
 * Calls onDetected(barcodeText) exactly once when a code is found,
 * then automatically stops the camera (caller restarts it if needed).
 */
async function startScanning(onDetected, onError) {
  // getUserMedia is only available in a "secure context": HTTPS, or
  // http://localhost. Accessing the app via http://<lan-ip>:port from
  // another device (the tablet) does NOT count, even with camera
  // permission granted — the browser blocks the API before any prompt.
  if (!window.isSecureContext) {
    const err = new Error('Camera requires a secure context (HTTPS or localhost).');
    err.code = 'INSECURE_CONTEXT';
    if (onError) onError(err);
    return;
  }

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    const err = new Error('Camera API not available in this browser.');
    err.code = 'NO_MEDIA_DEVICES';
    if (onError) onError(err);
    return;
  }

  scannerInstance = new Html5Qrcode(SCANNER_ELEMENT_ID, {
    formatsToSupport: SUPPORTED_FORMATS,
    verbose: false,
  });

  const config = {
    fps: 10,
    qrbox: { width: 280, height: 180 }, // wide box suits 1D barcodes
    // Ask for 720p resolution to balance image quality and performance
    // on lower-end tablet hardware.
    videoConstraints: {
      facingMode: 'environment',
      width: { ideal: 1280 },
      height: { ideal: 720 },
    },
  };

  try {
    await scannerInstance.start(
      { facingMode: 'environment' }, // rear camera — device sits facing outward
      config,
      (decodedText) => {
        // Stop immediately after first successful read to avoid duplicates.
        stopScanning().finally(() => onDetected(decodedText));
      },
      () => {
        // Per-frame "no code found" callback — expected constantly while
        // scanning, intentionally ignored (not a real error).
      }
    );

    // Force continuous autofocus where supported. This only works on
    // Android Chrome/Edge via the Image Capture API — iOS Safari does not
    // expose focus control to web pages at all.
    try {
      await scannerInstance.applyVideoConstraints({
        advanced: [{ focusMode: 'continuous' }],
      });
    } catch (focusErr) {
      console.warn('Continuous autofocus not supported on this device', focusErr);
    }
  } catch (err) {
    console.error('Could not start camera for scanning', err);
    if (onError) onError(err);
  }
}

async function stopScanning() {
  if (!scannerInstance) return;
  try {
    await scannerInstance.stop();
    scannerInstance.clear();
  } catch (err) {
    // Camera may already be stopped — safe to ignore.
    console.warn('stopScanning: camera was not running', err);
  } finally {
    scannerInstance = null;
  }
}

window.BarcodeScanner = {
  startScanning,
  stopScanning,
};