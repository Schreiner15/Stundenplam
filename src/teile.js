// Teil-Objekte (Stücklisten- und CNC-Einheit).

import { r } from './util.js';

/** Kanten, die entlang der Teillänge laufen (vermindern beim Bekanten die Zuschnitt-Breite). */
const LAENGSKANTEN = new Set(['vorne', 'hinten']);

/**
 * @param {object} p
 * @param {{x:number,y:number,z:number,dx:number,dy:number,dz:number}} p.lage  Welt-Quader
 */
export function neuesTeil({
  id, bezeichnung, kategorie, bodenId = null, bodenTyp = null,
  laenge, breite, staerke, material, kanten = [], kantenStaerke = 0, lage,
}) {
  const laengs = kanten.filter((k) => LAENGSKANTEN.has(k)).length;
  const quer = kanten.length - laengs;
  return {
    id,
    bezeichnung,
    kategorie,
    bodenId,
    bodenTyp,
    laenge: r(laenge),
    breite: r(breite),
    staerke: r(staerke),
    material,
    kanten: [...kanten],
    zuschnitt: {
      laenge: r(laenge - quer * kantenStaerke),
      breite: r(breite - laengs * kantenStaerke),
    },
    lage: { x: r(lage.x), y: r(lage.y), z: r(lage.z), dx: r(lage.dx), dy: r(lage.dy), dz: r(lage.dz) },
    bearbeitungen: [],
  };
}
