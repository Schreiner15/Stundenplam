// Mustergeneratoren. Erzeugen Stäbe im Musterkoordinatensystem, die ein Rechteck (bbox) lückenlos überdecken.
// Grundrichtung: Reihen bzw. Musterachse parallel zur X-Achse (Raumlänge).

import { rechteck, zufall, mischeWert } from './geometrie.js';

const RAND = 2; // zusätzliche Reihen/Spalten über die bbox hinaus

/** Verband: Reihen der Breite B, Stäbe der Länge L, Versatz je Reihe. */
function verband(bbox, { laenge: L, breite: B, versatz, startwert }) {
  const staebe = [];
  const minVersatz = Math.min(300, L / 3);
  const k0 = Math.floor(bbox.y0 / B) - 1;
  const k1 = Math.ceil(bbox.y1 / B) + 1;
  let vorher = null;
  // Für den wilden Verband wird die Folge ab Reihe k0 erzeugt; deterministisch über den Startwert
  const rnd = zufall(mischeWert(startwert, k0));
  for (let k = k0; k <= k1; k++) {
    let o;
    if (versatz === null) {
      let versuch = 0;
      do {
        o = rnd() * L;
        versuch++;
      } while (vorher !== null && versuch < 50 && zyklischerAbstand(o, vorher, L) < minVersatz);
      vorher = o;
    } else {
      o = (((k * versatz * L) % L) + L) % L;
    }
    const y = k * B;
    for (let x = Math.floor((bbox.x0 - o) / L) * L + o - L; x < bbox.x1 + L; x += L) {
      staebe.push({ punkte: rechteck(x, y, x + L, y + B), reihe: k });
    }
  }
  return staebe;
}

function zyklischerAbstand(a, b, L) {
  const d = Math.abs(a - b) % L;
  return Math.min(d, L - d);
}

/**
 * Fischgrät (90°), achsparallel: Treppe aus liegenden Stäben H_i = [iB, iB+L] × [iB, iB+B] und
 * stehenden Stäben V_i = [iB, iB+B] × [iB+B, iB+B+L]; die Treppen wiederholen sich um T = (L, −L).
 * Die Musterachse verläuft dabei diagonal (1, 1); berechne.js dreht um −45°, damit sie parallel zur Wand liegt.
 */
function fischgraet(bbox, { laenge: L, breite: B }) {
  const staebe = [];
  const i0 = Math.floor((bbox.x0 + bbox.y0 - 2 * L) / (2 * B)) - RAND;
  const i1 = Math.ceil((bbox.x1 + bbox.y1) / (2 * B)) + RAND;
  const m0 = Math.floor((bbox.x0 - bbox.y1 - 2 * L) / (2 * L)) - RAND;
  const m1 = Math.ceil((bbox.x1 - bbox.y0 + 2 * L) / (2 * L)) + RAND;
  for (let m = m0; m <= m1; m++) {
    for (let i = i0; i <= i1; i++) {
      const x = i * B + m * L;
      const y = i * B - m * L;
      const h = [x, y, x + L, y + B];
      const v = [x, y + B, x + B, y + B + L];
      for (const [a, b, c, d, seite] of [[...h, 'A'], [...v, 'B']]) {
        if (c < bbox.x0 || a > bbox.x1 || d < bbox.y0 || b > bbox.y1) continue;
        staebe.push({ punkte: rechteck(a, b, c, d), seite });
      }
    }
  }
  return staebe;
}

/**
 * Chevron mit 45°-Stirnschnitt. Musterachse senkrecht (Y); berechne.js dreht um 90°.
 * Linker Stab: Parallelogramm (x, y) → (x+Lx, y+Lx) → (x+Lx, y+Lx+h) → (x, y+h), rechter gespiegelt.
 */
function chevron(bbox, { laenge: L, breite: B }) {
  const staebe = [];
  const lx = L * Math.SQRT1_2;
  const h = B * Math.SQRT2;
  const c0 = Math.floor(bbox.x0 / (2 * lx)) - 1;
  const c1 = Math.ceil(bbox.x1 / (2 * lx)) + 1;
  const r0 = Math.floor((bbox.y0 - lx - h) / h) - 1;
  const r1 = Math.ceil(bbox.y1 / h) + 1;
  for (let c = c0; c <= c1; c++) {
    const x = c * 2 * lx;
    for (let r = r0; r <= r1; r++) {
      const y = r * h;
      staebe.push({ punkte: [[x, y], [x + lx, y + lx], [x + lx, y + lx + h], [x, y + h]], seite: 'A' });
      staebe.push({ punkte: [[x + lx, y + lx], [x + 2 * lx, y], [x + 2 * lx, y + h], [x + lx, y + lx + h]], seite: 'B' });
    }
  }
  return staebe;
}

/** Würfelmuster: Quadrate der Kantenlänge L aus n Stäben, im Schachbrett quer/längs. */
function wuerfel(bbox, { laenge: L, breite: B }) {
  const staebe = [];
  const n = Math.max(2, Math.round(L / B));
  const b = L / n;
  for (let i = Math.floor(bbox.x0 / L) - 1; i <= Math.ceil(bbox.x1 / L); i++) {
    for (let j = Math.floor(bbox.y0 / L) - 1; j <= Math.ceil(bbox.y1 / L); j++) {
      const x = i * L;
      const y = j * L;
      const quer = (i + j) % 2 === 0;
      for (let k = 0; k < n; k++) {
        staebe.push({
          punkte: quer ? rechteck(x, y + k * b, x + L, y + (k + 1) * b) : rechteck(x + k * b, y, x + (k + 1) * b, y + L),
          wuerfel: `${i}/${j}`,
        });
      }
    }
  }
  return staebe;
}

/** Tafeln: Quadratraster der Kantenlänge L. */
function tafel(bbox, { laenge: L }) {
  const staebe = [];
  for (let i = Math.floor(bbox.x0 / L) - 1; i <= Math.ceil(bbox.x1 / L); i++) {
    for (let j = Math.floor(bbox.y0 / L) - 1; j <= Math.ceil(bbox.y1 / L); j++) {
      staebe.push({ punkte: rechteck(i * L, j * L, (i + 1) * L, (j + 1) * L) });
    }
  }
  return staebe;
}

export const GENERATOREN = {
  verband: { erzeuge: verband, grunddrehung: 0 },
  fischgraet: { erzeuge: fischgraet, grunddrehung: -45 },
  chevron: { erzeuge: chevron, grunddrehung: 90 },
  wuerfel: { erzeuge: wuerfel, grunddrehung: 0 },
  tafel: { erzeuge: tafel, grunddrehung: 0 },
};

/** Fläche eines ganzen Stabs je Musterfamilie (Würfel: Stabbreite = L / n). */
export function stabFlaeche(familie, L, B) {
  if (familie === 'wuerfel') return (L * L) / Math.max(2, Math.round(L / B));
  if (familie === 'tafel') return L * L;
  return L * B;
}
