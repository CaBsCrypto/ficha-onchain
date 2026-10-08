// Loopback-only static viewer. No directory listing, clinical APIs, or signing endpoints.
import { createServer } from 'node:http';
import { readFileSync, realpathSync } from 'node:fs';
import { join, relative, isAbsolute, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { evidenceDirectory, parseRunId } from './build-clinical-report.mjs';

export function reportRequestHandler(directory) {
  const root = realpathSync(directory), filename = join(root, 'index.html');
  const resolved = realpathSync(filename), rel = relative(root, resolved);
  if (rel.startsWith('..') || isAbsolute(rel) || rel !== 'index.html') throw Error('Unsafe report file.');
  const html = readFileSync(resolved);
  if (html.length > 2_000_000) throw Error('Report too large.');
  return (request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; object-src 'none'");
    if (!['GET', 'HEAD'].includes(request.method)) {
      response.writeHead(405, { Allow: 'GET, HEAD', 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Método no permitido.'); return;
    }
    // Match the raw target: never normalize traversal paths into an allowed file.
    if (!['/', '/index.html'].includes(request.url)) {
      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end(request.method === 'HEAD' ? undefined : 'Archivo no disponible.'); return;
    }
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Length': html.length });
    response.end(request.method === 'HEAD' ? undefined : html);
  };
}

export function startClinicalReportServer(runId, { port = 3014, directory = evidenceDirectory(runId) } = {}) {
  const server = createServer(reportRequestHandler(directory));
  server.listen(port, '127.0.0.1');
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const runId = parseRunId(process.argv.slice(2));
    const server = startClinicalReportServer(runId);
    server.on('listening', () => console.log(`Informe público guardado: http://127.0.0.1:3014/ (ejecución ${runId})`));
    server.on('error', () => { console.error('No se pudo abrir el visor local; comprueba la evidencia y el puerto 3014.'); process.exitCode = 1; });
    const stop = () => server.close();
    process.on('SIGINT', stop); process.on('SIGTERM', stop);
  } catch { console.error('Genera primero el informe y usa --run-id <UUID>.'); process.exitCode = 1; }
}
