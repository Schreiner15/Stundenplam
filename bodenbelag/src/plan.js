// Gemeinsamer Verlegeplan für alle Beläge (Parkett, Fliesen):
// Verlegefläche mit Aussparungen, Musterüberdeckung mit Fuge, Zuschnitt, Restverwertung.

import { GENERATOREN, stabFlaeche } from './muster.js';
import { flaeche, drehe, rechteck, huelle, schneideZu, mischeWert } from './geometrie.js';

const EPS = 1e-6;
const r1 = (v) => Math.round(v * 10) / 10 || 0;

/** Verlegefläche = Raum minus Randfuge, Aussparungen (mit Randfuge ringsum) als Löcher. */
export function verlegeflaeche(raum, rand, melde) {
  const feld = { x0: rand, y0: rand, x1: raum.laenge - rand, y1: raum.breite - rand };
  if (feld.x1 - feld.x0 <= 0 || feld.y1 - feld.y0 <= 0) throw new TypeError('Raum ist kleiner als der doppelte Randabstand');
  let aussparungFlaeche = 0;
  let lochFlaeche = 0;
  const loecher = [];
  for (const a of raum.aussparungen) {
    if (a.x < 0 || a.y < 0 || a.x + a.laenge > raum.laenge + EPS || a.y + a.breite > raum.breite + EPS) {
      melde('fehler', 'AUSSPARUNG_AUSSERHALB', `${a.name} liegt außerhalb des Raums`);
      continue;
    }
    aussparungFlaeche += a.laenge * a.breite;
    const loch = { x0: Math.max(feld.x0, a.x - rand), y0: Math.max(feld.y0, a.y - rand), x1: Math.min(feld.x1, a.x + a.laenge + rand), y1: Math.min(feld.y1, a.y + a.breite + rand) };
    if (loch.x1 > loch.x0 && loch.y1 > loch.y0) {
      lochFlaeche += (loch.x1 - loch.x0) * (loch.y1 - loch.y0);
      loecher.push(loch);
    }
  }
  return {
    feld,
    loecher,
    raumFlaeche: raum.laenge * raum.breite,
    aussparungFlaeche,
    netto: (feld.x1 - feld.x0) * (feld.y1 - feld.y0) - lochFlaeche,
  };
}

/**
 * Erzeugt den Verlegeplan. Bei Fuge > 0 wird das Muster mit Rastermaß (L + f) × (B + f) erzeugt; jedes Modul
 * ist Fliese + Fuge rechts/oben. So entstehen überall gleich breite Fugen (auch im Fischgrät), und die erste
 * Fliese liegt bündig an der Randfuge.
 */
export function erzeugePlan({ feld, loecher, familie, laenge, breite, fuge = 0, versatz = null, drehung = 0, startwert = 1, streuung = 0 }) {
  const gen = GENERATOREN[familie];
  const winkel = gen.grunddrehung + drehung;
  // Musterursprung = Ecke der Verlegefläche (erste Reihe an der Wandfuge), gedreht um die Feldmitte
  const [ox, oy] = [feld.x0, feld.y0];
  const mitte = [(feld.x1 - feld.x0) / 2, (feld.y1 - feld.y0) / 2];
  const bbox = huelle(drehe(rechteck(0, 0, feld.x1 - ox, feld.y1 - oy), -winkel, mitte));
  const roh = gen.erzeuge(bbox, { laenge: laenge + fuge, breite: breite + fuge, versatz, startwert });
  const voll = fuge > 0 ? laenge * breite : stabFlaeche(familie, laenge, breite);
  const teile = [];
  for (const s of roh) {
    let punkte = s.punkte;
    if (fuge > 0) {
      const h = huelle(punkte);
      punkte = rechteck(h.x0, h.y0, h.x1 - fuge, h.y1 - fuge); // Modul = Fliese + Fuge rechts/oben
    }
    const zu = schneideZu(drehe(punkte, winkel, mitte).map(([x, y]) => [x + ox, y + oy]), feld);
    if (zu.length < 3) continue;
    const a = flaeche(zu);
    if (a < 1) continue; // Splitter < 1 mm² ignorieren
    let rest = a;
    for (const loch of loecher) rest -= flaeche(schneideZu(zu, loch));
    if (rest < 1) continue; // liegt vollständig in einer Aussparung
    const ganz = a >= voll * (1 - 1e-6) - 0.5 && rest >= a - 1;
    // Farbton je Teil (−1…1) × Streuung – nur für die Vorschau
    const hash = mischeWert(...s.punkte.flat(), startwert);
    const ton = ((hash % 2001) / 1000 - 1) * streuung;
    teile.push({ punkte: zu.map(([x, y]) => [r1(x), r1(y)]), flaeche: r1(rest), ganz, ton: Math.round(ton * 1000) / 1000 || 0, seite: s.seite ?? null });
  }
  return { teile, voll };
}

/**
 * Restverwertung beim Verband parallel zur Wand: Zuschnitte werden per First-Fit-Decreasing aus ganzen
 * Teilen geschnitten (Reststück vom Reihenende beginnt die nächste Reihe). Liefert die Anzahl benötigter Teile.
 */
export function benoetigteTeile(teile, { familie, drehung, laenge, schnitt }) {
  if (familie !== 'verband' || Math.abs(drehung % 90) > EPS) return teile.length;
  const achse = Math.abs(drehung % 180) < EPS ? 0 : 1;
  const stuecke = teile.filter((t) => !t.ganz).map((t) => {
    const w = t.punkte.map((p) => p[achse]);
    return Math.max(...w) - Math.min(...w) + schnitt;
  }).sort((a, b) => b - a);
  const reste = [];
  for (const l of stuecke) {
    const i = reste.findIndex((r) => r >= l);
    if (i >= 0) reste[i] -= l; else reste.push(laenge - l);
  }
  return teile.filter((t) => t.ganz).length + reste.length;
}

/** Schmale Randreihe beim Verband parallel zur Wand. */
export function schmaleRandreihe(feld, { familie, drehung, breite, fuge = 0 }) {
  if (familie !== 'verband' || Math.abs(drehung % 90) > EPS) return null;
  const quer = Math.abs(drehung % 180) < EPS ? feld.y1 - feld.y0 : feld.x1 - feld.x0;
  const raster = breite + fuge;
  const rest = (quer + fuge) % raster - fuge;
  return rest > 0.5 && rest < breite / 3 ? { rest: r1(rest), besaeumt: r1((rest + breite) / 2) } : null;
}
