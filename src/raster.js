// 32-mm-System: Lochreihen, Lochspalten und gleichmäßige Fachboden-Verteilung.

import { KONSTANTEN } from './defaults.js';

const { EPS } = KONSTANTEN;

/** Z-Lagen der Lochreihen in einem Abschnitt (Weltkoordinaten). */
export function lochreihen(zUnten, zOben, raster, rand) {
  const reihen = [];
  for (let z = zUnten + rand; z <= zOben - rand + EPS; z += raster) reihen.push(z);
  return reihen;
}

/** Y-Lagen der Lochspalten: vorne fest, hinten auf dem Raster ab der vorderen Spalte. */
export function lochspalten(lichteTiefe, raster, reiheVorne, reiheHinten) {
  const schritte = Math.floor((lichteTiefe - reiheHinten - reiheVorne + EPS) / raster);
  return schritte >= 1 ? [reiheVorne, reiheVorne + schritte * raster] : [reiheVorne];
}

/**
 * Verteilt `anzahl` Fachböden gleichmäßig im Abschnitt und rundet auf die Lochreihen.
 * @returns {{ reihen: number[], unterseiten: number[] } | { fehler: string, reihen: number[] }}
 */
export function verteileFachboeden({ zUnten, zOben, anzahl, staerke, raster, rand, traegerHoehe }) {
  const reihen = lochreihen(zUnten, zOben, raster, rand);
  if (anzahl <= 0) return { reihen, unterseiten: [] };

  // nutzbar sind Reihen, auf denen ein Boden vollständig im Abschnitt liegt
  const nutzbar = reihen.filter((r) => r + traegerHoehe >= zUnten - EPS && r + traegerHoehe + staerke <= zOben + EPS);
  if (nutzbar.length < anzahl) {
    return { fehler: `Nur ${nutzbar.length} nutzbare Lochreihen für ${anzahl} Fachböden`, reihen };
  }

  const abstand = Math.max(1, Math.ceil((staerke - EPS) / raster)); // Mindestabstand in Reihen
  const fach = (zOben - zUnten - anzahl * staerke) / (anzahl + 1);
  const idx = [];
  for (let i = 1; i <= anzahl; i++) {
    const ideal = zUnten + i * fach + (i - 1) * staerke - traegerHoehe;
    let k = Math.round((ideal - nutzbar[0]) / raster);
    k = Math.min(Math.max(k, 0), nutzbar.length - 1);
    idx.push(k);
  }
  // vorwärts: Mindestabstand einhalten, rückwärts: oben nicht überlaufen
  for (let i = 1; i < anzahl; i++) idx[i] = Math.max(idx[i], idx[i - 1] + abstand);
  idx[anzahl - 1] = Math.min(idx[anzahl - 1], nutzbar.length - 1);
  for (let i = anzahl - 2; i >= 0; i--) idx[i] = Math.min(idx[i], idx[i + 1] - abstand);
  if (idx[0] < 0) {
    return { fehler: `Lochreihen reichen für ${anzahl} Fachböden à ${staerke} mm nicht aus`, reihen };
  }
  return { reihen, unterseiten: idx.map((k) => nutzbar[k] + traegerHoehe) };
}

/** Verbinderpositionen gleichmäßig zwischen von + rand und bis − rand. */
export function verteile(von, bis, rand, maxAbstand) {
  const spanne = bis - von - 2 * rand;
  if (spanne <= EPS) return [von + (bis - von) / 2];
  const n = Math.max(2, Math.ceil(spanne / maxAbstand - EPS) + 1);
  const schritt = spanne / (n - 1);
  return Array.from({ length: n }, (_, i) => von + rand + i * schritt);
}
