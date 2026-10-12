// Kollisions- und Plausibilitätsprüfung. Meldet über den Kontext, wirft nie.

import { KONSTANTEN } from './defaults.js';
import { r } from './util.js';

const { EPS } = KONSTANTEN;

export function neuerKontext() {
  const pruefungen = [];
  const schon = new Set();
  const melde = (schwere, code, teil, meldung) => {
    const schluessel = `${schwere}|${code}|${teil}|${meldung}`;
    if (schon.has(schluessel)) return;
    schon.add(schluessel);
    pruefungen.push({ schwere, code, teil: teil ?? null, meldung });
  };
  return {
    pruefungen,
    fehler: (code, teil, meldung) => melde('fehler', code, teil, meldung),
    warnung: (code, teil, meldung) => melde('warnung', code, teil, meldung),
  };
}

/** Boden ↔ Seiten: X-Lage innerhalb des zulässigen Bereichs? */
export function pruefeSeiten(id, geo, [xMin, xMax], kontext) {
  if (geo.x0 < xMin - EPS || geo.x1 > xMax + EPS) {
    kontext.fehler('KOLLISION_SEITE', id,
      `Boden (X ${r(geo.x0)}…${r(geo.x1)} mm) ragt in die Seite; zulässig ${r(xMin)}…${r(xMax)} mm`);
  }
}

/** Boden ↔ Rückwand bzw. Korpustiefe. */
export function pruefeTiefe(id, geo, yMax, rueckwandArt, kontext) {
  if (geo.y0 < -EPS) {
    kontext.fehler('AUSSERHALB', id, `Vorderkante liegt ${r(-geo.y0)} mm vor dem Korpus`);
  }
  if (geo.y1 > yMax + EPS) {
    const code = rueckwandArt === 'keine' ? 'AUSSERHALB' : 'KOLLISION_RUECKWAND';
    kontext.fehler(code, id, `Boden (Hinterkante ${r(geo.y1)} mm) ragt über ${r(yMax)} mm hinaus`);
  }
}

export function pruefeHoehe(id, geo, hoehe, kontext) {
  if (geo.z0 < -EPS || geo.z1 > hoehe + EPS) {
    kontext.fehler('AUSSERHALB', id, `Boden (Z ${r(geo.z0)}…${r(geo.z1)} mm) liegt außerhalb der Korpushöhe ${hoehe} mm`);
  }
}

function ueberlappt(a0, a1, b0, b1) {
  return Math.min(a1, b1) - Math.max(a0, b0) > EPS;
}

/** Paarweise Überschneidung aller Körper (Böden, Schubkästen). */
export function pruefeUeberlappungen(koerper, kontext) {
  for (let i = 0; i < koerper.length; i++) {
    for (let j = i + 1; j < koerper.length; j++) {
      const a = koerper[i];
      const b = koerper[j];
      if (ueberlappt(a.x0, a.x1, b.x0, b.x1) && ueberlappt(a.y0, a.y1, b.y0, b.y1) && ueberlappt(a.z0, a.z1, b.z0, b.z1)) {
        kontext.fehler('UEBERLAPPUNG', a.id, `${a.id} und ${b.id} überschneiden sich (Z ${r(Math.max(a.z0, b.z0))}…${r(Math.min(a.z1, b.z1))} mm)`);
      }
    }
  }
}

export function pruefeFaecher(faecher, kontext) {
  for (const f of faecher) {
    if (f.lichteHoehe > 0 && f.lichteHoehe < KONSTANTEN.MIN_FACHHOEHE) {
      kontext.warnung('FACH_KLEIN', null, `Fach ${f.index} hat nur ${f.lichteHoehe} mm lichte Höhe`);
    }
  }
}

export function pruefeDurchbiegung(id, laenge, staerke, kontext) {
  const max = KONSTANTEN.DURCHBIEGUNG_FAKTOR * staerke;
  if (laenge > max + EPS) {
    kontext.warnung('DURCHBIEGUNG', id, `Spannweite ${r(laenge)} mm > ${r(max)} mm (${KONSTANTEN.DURCHBIEGUNG_FAKTOR} × Stärke): Durchbiegung möglich`);
  }
}

export function pruefeAuflage(id, geo, spalten, kontext) {
  for (const y of spalten) {
    if (y < geo.y0 + KONSTANTEN.MIN_AUFLAGE - EPS || y > geo.y1 - KONSTANTEN.MIN_AUFLAGE + EPS) {
      kontext.warnung('TRAEGER_AUFLAGE', id, `Lochspalte bei Y = ${r(y)} mm liegt nicht unter dem Fachboden (Y ${r(geo.y0)}…${r(geo.y1)} mm)`);
    }
  }
}
