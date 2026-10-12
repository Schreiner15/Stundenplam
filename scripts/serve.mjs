// Mini-Webserver für die lokalen Vorschauen: npm run vorschau → http://localhost:5173 (Möbelböden)
// und http://localhost:5173/bodenbelag/vorschau.html (Parkett und Fliesen)
// vorschau.html enthält nur den Seiteninhalt; hier wird das HTML-Grundgerüst ergänzt.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const wurzel = fileURLToPath(new URL('..', import.meta.url));
const port = Number(process.env.PORT ?? 5173);
const TYPEN = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json' };

createServer(async (req, res) => {
  const pfad = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const datei = pfad === '/' ? 'vorschau.html' : normalize(pfad).replace(/^[/\\]+/, '');
  if (datei.startsWith('..')) { res.writeHead(403).end(); return; }
  try {
    let inhalt = await readFile(join(wurzel, datei));
    if (datei.endsWith('.html')) {
      inhalt = `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"></head><body>${inhalt}</body></html>`;
    }
    res.writeHead(200, { 'content-type': TYPEN[extname(datei)] ?? 'application/octet-stream' }).end(inhalt);
  } catch {
    res.writeHead(404).end('Nicht gefunden');
  }
}).listen(port, () => console.log(`Vorschau: http://localhost:${port}`));
