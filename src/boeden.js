// Geometrie je Bodentyp. Alle Maße werden aus Korpus + Parametern abgeleitet, nie gespeichert.
// Ergebnis ist ein Welt-Quader { x0, x1, y0, y1, z0, z1, t } (Ursprung vorne links unten).

import { BodenTyp, Einbauart, Verbindung } from './enums.js';
import { KONSTANTEN } from './defaults.js';

/** "50%" → Bodenmitte bei 50 % der Korpushöhe; Zahl → Z der Unterseite. */
export function zAusPosition(position, hoehe, staerke) {
  if (typeof position === 'string') return (hoehe * parseFloat(position)) / 100 - staerke / 2;
  return position;
}

/** Wie weit ragt der Boden je Stirnseite in die Seite hinein (Zuschnittzugabe)? */
export function stirnZugabe(boden) {
  if (boden.einbauart === Einbauart.EINGENUTET) {
    return boden.nuttiefe - boden.verbindungsParameter[Verbindung.NUT_FEDER].luft;
  }
  if (boden.verbindung === Verbindung.ZAPFEN) return boden.verbindungsParameter[Verbindung.ZAPFEN].laenge;
  return 0;
}

/** Zulässiger X-Bereich (Kollision mit den Seiten). */
export function erlaubterXBereich(boden, k) {
  if ([Einbauart.DURCHLAUFEND, Einbauart.GEHRUNG].includes(boden.einbauart)) return [0, k.breite];
  if (boden.typ === BodenTyp.FACHBODEN) return [k.seitenStaerke, k.breite - k.seitenStaerke];
  let einstand = 0;
  if (boden.verbindung === Verbindung.NUT_FEDER) einstand = boden.nuttiefe;
  if (boden.verbindung === Verbindung.ZAPFEN) einstand = boden.verbindungsParameter[Verbindung.ZAPFEN].laenge;
  return [k.seitenStaerke - einstand, k.breite - k.seitenStaerke + einstand];
}

function xLage(boden, k, standardX0, standardLaenge) {
  if (boden.breite !== null) return { x0: k.breite / 2 - boden.breite / 2, laenge: boden.breite };
  return { x0: standardX0, laenge: standardLaenge };
}

function yLage(boden, yEnde) {
  const y0 = boden.vorderkante;
  const tiefe = boden.tiefe ?? yEnde - boden.rueckwandAbstand - y0;
  return { y0, tiefe };
}

function quader(x0, laenge, y0, tiefe, z0, t) {
  return { x0, x1: x0 + laenge, y0, y1: y0 + tiefe, z0, z1: z0 + t, t };
}

/** Unter-, Ober-, Mittel- und Festboden. */
export function festerBoden(boden, k, korpus, kontext) {
  const t = boden.materialstaerke;
  const { typ, einbauart } = boden;
  const zwingend = einbauart === Einbauart.DURCHLAUFEND || einbauart === Einbauart.GEHRUNG;
  if (zwingend && boden.position !== null) {
    kontext.warnung('POSITION_IGNORIERT', boden.id, `Position wird bei Einbauart „${einbauart}" ignoriert`);
  }
  const pos = boden.position === null ? null : zAusPosition(boden.position, k.hoehe, t);

  let z0;
  if (typ === BodenTyp.UNTERBODEN) {
    z0 = zwingend ? 0 : pos ?? (einbauart === Einbauart.SOCKEL ? korpus.sockel.hoehe : 0);
  } else if (typ === BodenTyp.OBERBODEN) {
    z0 = zwingend ? k.hoehe - t : pos ?? k.hoehe - t;
  } else {
    z0 = pos;
  }

  let x;
  if (zwingend) {
    x = xLage(boden, k, 0, k.breite);
  } else {
    const zugabe = stirnZugabe(boden);
    x = xLage(boden, k, k.seitenStaerke - zugabe, k.lichteBreite + 2 * zugabe);
  }

  const konstruktiv = typ === BodenTyp.UNTERBODEN || typ === BodenTyp.OBERBODEN;
  const y = yLage(boden, konstruktiv ? k.konstruktionsTiefe : k.lichteTiefe);
  return gueltigOderNull(boden, quader(x.x0, x.laenge, y.y0, y.tiefe, z0, t), kontext);
}

/** Fachboden ohne Z (kommt aus dem Raster). */
export function fachbodenGrundriss(boden, k) {
  const p = boden.verbindungsParameter[Verbindung.FACHBODENTRAEGER];
  const x = xLage(boden, k, k.seitenStaerke + p.seitenLuft, k.lichteBreite - 2 * p.seitenLuft);
  const y = yLage(boden, k.lichteTiefe);
  return { x0: x.x0, laenge: x.laenge, y0: y.y0, tiefe: y.tiefe };
}

export function fachboden(grundriss, z0, t) {
  return quader(grundriss.x0, grundriss.laenge, grundriss.y0, grundriss.tiefe, z0, t);
}

/** Schubkasten im Abschnitt: Kasten (für Kollision), Boden und Zargen. */
export function schublade(boden, k, abschnitt, kontext) {
  const s = boden.schublade;
  const nf = boden.verbindungsParameter[Verbindung.NUT_FEDER];
  const verfuegbar = k.lichteTiefe - boden.vorderkante - boden.rueckwandAbstand;
  let laenge = s.laenge;
  if (laenge === null) {
    laenge = [...KONSTANTEN.SCHUBLADEN_NORMLAENGEN].reverse().find((l) => l <= verfuegbar + KONSTANTEN.EPS) ?? null;
    if (laenge === null) {
      kontext.fehler('SCHUBLADE_TIEFE', boden.id, `Keine Normlänge passt in die verfügbare Tiefe ${verfuegbar} mm`);
      return null;
    }
  } else if (laenge > verfuegbar + KONSTANTEN.EPS) {
    kontext.fehler('SCHUBLADE_TIEFE', boden.id, `Schubkastenlänge ${laenge} mm > verfügbare Tiefe ${verfuegbar} mm`);
  }

  const aussenBreite = k.lichteBreite - 2 * s.seitenLuft;
  const innenBreite = aussenBreite - 2 * s.zargenStaerke;
  if (innenBreite <= 0 || s.hoehe <= 0) {
    kontext.fehler('MASS_UNGUELTIG', boden.id, 'Schubkasten hat keine positive Innenbreite/Höhe');
    return null;
  }
  const kasten = {
    x0: k.seitenStaerke + s.seitenLuft,
    x1: k.seitenStaerke + s.seitenLuft + aussenBreite,
    y0: boden.vorderkante,
    y1: boden.vorderkante + laenge,
    z0: abschnitt.zUnten + zAusPosition(boden.position ?? 0, abschnitt.lichteHoehe, 0),
  };
  kasten.z1 = kasten.z0 + s.hoehe;
  if (kasten.z1 > abschnitt.zOben - s.luftOben + KONSTANTEN.EPS) {
    kontext.fehler('SCHUBLADE_HOEHE', boden.id,
      `Schubkasten (Oberkante ${kasten.z1} mm) passt nicht unter ${abschnitt.zOben} mm − ${s.luftOben} mm Luft`);
  }

  const zugabe = boden.nuttiefe - nf.luft;
  const t = boden.materialstaerke;
  const bodenQuader = quader(
    kasten.x0 + s.zargenStaerke - zugabe, innenBreite + 2 * zugabe,
    kasten.y0 + s.zargenStaerke - zugabe, laenge - 2 * s.zargenStaerke + 2 * zugabe,
    kasten.z0 + s.bodenNutAbstand, t,
  );
  return { kasten, boden: bodenQuader, laenge, innenBreite, aussenBreite };
}

function gueltigOderNull(boden, geo, kontext) {
  if (geo.x1 - geo.x0 <= 0 || geo.y1 - geo.y0 <= 0) {
    kontext.fehler('MASS_UNGUELTIG', boden.id,
      `Abgeleitete Maße ungültig (Breite ${geo.x1 - geo.x0} mm, Tiefe ${geo.y1 - geo.y0} mm)`);
    return null;
  }
  return geo;
}
