import { parentPort, workerData } from 'node:worker_threads';
import { syncBuiltinESMExports } from 'node:module';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import tls from 'node:tls';

// The decoder receives bytes only, with an empty environment and no remote resource loaders.
const deny = () => { throw Error('external_resource_disabled'); };
globalThis.fetch = deny;
globalThis.WebSocket = class { constructor() { deny(); } };
http.request = http.get = https.request = https.get = net.connect = net.createConnection = tls.connect = deny;
syncBuiltinESMExports();
console.log = console.warn = console.error = console.info = () => {};
const pixels = 32_000_000;
let bytes;
try {
  bytes = new Uint8Array(workerData.content);
  if (workerData.mediaType === 'application/pdf') {
    const pdf = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const loading = pdf.getDocument({ data: bytes, stopAtErrors: true, isEvalSupported: false, enableXfa: false,
      useWasm: false, useSystemFonts: false, disableFontFace: true, disableAutoFetch: true, verbosity: 0 });
    let document;
    try {
      document = await loading.promise;
      if (!Number.isSafeInteger(document.numPages) || document.numPages < 1) throw Error('invalid_pdf');
      for (let number = 1; number <= document.numPages; number++) {
        const page = await document.getPage(number);
        await page.getOperatorList();
        await page.getAnnotations();
        page.cleanup();
      }
    } finally { await loading.destroy(); }
  } else {
    const { default: sharp } = await import('sharp');
    const image = sharp(bytes, { failOn: 'warning', limitInputPixels: pixels, sequentialRead: true });
    const metadata = await image.metadata();
    const format = workerData.mediaType === 'image/png' ? 'png' : workerData.mediaType === 'image/jpeg' ? 'jpeg' : null;
    if (!format || metadata.format !== format || !metadata.width || !metadata.height || metadata.width * metadata.height > pixels || (metadata.pages ?? 1) !== 1) throw Error('invalid_image');
    const decoded = await image.raw().toBuffer();
    decoded.fill(0); // Decode for validation only; never replace or recompress the submitted bytes.
  }
  parentPort.postMessage({ ok: true });
} catch {
  parentPort.postMessage({ error: 'clinical_file_invalid' });
} finally { if (bytes?.byteLength) bytes.fill(0); }
