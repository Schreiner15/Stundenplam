// Abgeleitete Korpusmaße und die Fugen-Anschlüsse der Teile (Teilkoordinaten, siehe Architektur 2.5).

import { Einbauart, BodenTyp } from './enums.js';

/** Alle Maße, die sich aus Korpus + Einbauart von Ober-/Unterboden ergeben. */
export function korpusMasse(korpus, unterboden, oberboden) {
  const { breite, hoehe, tiefe, seitenStaerke, rueckwand } = korpus;
  const konstruktionsTiefe = tiefe - (rueckwand.art === 'aufgesetzt' ? rueckwand.staerke : 0);
  const lichteTiefe = rueckwand.art === 'eingenutet'
    ? tiefe - rueckwand.abstand - rueckwand.staerke
    : konstruktionsTiefe;
  const seitenZ0 = unterboden?.einbauart === Einbauart.DURCHLAUFEND ? unterboden.materialstaerke : 0;
  const seitenZ1 = oberboden?.einbauart === Einbauart.DURCHLAUFEND ? hoehe - oberboden.materialstaerke : hoehe;
  return {
    breite,
    hoehe,
    tiefe,
    seitenStaerke,
    lichteBreite: breite - 2 * seitenStaerke,
    konstruktionsTiefe,
    lichteTiefe,
    seitenZ0,
    seitenZ1,
    seitenLaenge: seitenZ1 - seitenZ0,
  };
}

/** Fläche, auf der Exzentergehäuse eines Bodens liegen (nicht sichtbare Seite). */
export function versteckteFlaeche(typ) {
  return typ === BodenTyp.OBERBODEN ? 'oben' : 'unten';
}

const FLAECHE_UNTEN = { flaeche: 'unten', richtung: '+z' };
const FLAECHE_OBEN = { flaeche: 'oben', richtung: '-z' };

/** Seite als Flächenteil für eine Fuge entlang Welt-Y auf Höhe zMitte (Boden zwischen den Seiten). */
export function seiteAlsFlaeche(seite, k, zMitte) {
  const s = k.seitenStaerke;
  return {
    teil: seite,
    staerke: s,
    innen: { flaeche: 'innen', richtung: '-z', z: s },
    aussen: { flaeche: 'aussen', richtung: '+z', z: 0 },
    punkt: (y) => ({ x: zMitte - k.seitenZ0, y }),
    achse: 'y',
    quer: { achse: 'x', laenge: k.seitenLaenge },
  };
}

/** Seite als Flächenteil für eine Fuge entlang Welt-Z bei Tiefe yMitte (Sockelblende). */
export function seiteAlsFlaecheSenkrecht(seite, k, yMitte) {
  const s = k.seitenStaerke;
  return {
    teil: seite,
    staerke: s,
    innen: { flaeche: 'innen', richtung: '-z', z: s },
    aussen: { flaeche: 'aussen', richtung: '+z', z: 0 },
    punkt: (z) => ({ x: z - k.seitenZ0, y: yMitte }),
    achse: 'x',
    quer: { achse: 'y', laenge: k.konstruktionsTiefe },
  };
}

/** Seite als Stirnteil (Kante unten/oben), wenn der Boden durchläuft oder auf Gehrung sitzt. */
export function seiteAlsStirn(seite, k, kante) {
  const s = k.seitenStaerke;
  const L = k.seitenLaenge;
  const unten = kante === 'unten';
  return {
    teil: seite,
    staerke: s,
    kante,
    richtung: unten ? '+x' : '-x',
    punkt: (y) => ({ x: unten ? 0 : L, y, z: s / 2 }),
    achse: 'y',
    versteckt: {
      flaeche: 'innen',
      richtung: '-z',
      punkt: (y, abstand) => ({ x: unten ? abstand : L - abstand, y, z: s }),
    },
  };
}

/** Boden als Stirnteil an der linken oder rechten Stirnseite. */
export function bodenAlsStirn(teil, geo, ende, verdeckt) {
  const L = geo.x1 - geo.x0;
  const links = ende === 'links';
  const flaeche = verdeckt === 'oben' ? FLAECHE_OBEN : FLAECHE_UNTEN;
  return {
    teil,
    staerke: geo.t,
    kante: ende,
    richtung: links ? '+x' : '-x',
    punkt: (y) => ({ x: links ? 0 : L, y: y - geo.y0, z: geo.t / 2 }),
    achse: 'y',
    versteckt: {
      ...flaeche,
      punkt: (y, abstand) => ({ x: links ? abstand : L - abstand, y: y - geo.y0, z: verdeckt === 'oben' ? geo.t : 0 }),
    },
  };
}

/** Boden als Flächenteil (durchlaufend): Seite steht auf dem Unterboden bzw. trägt den Oberboden. */
export function bodenAlsFlaeche(teil, geo, seitenMitteX, istUnterboden) {
  const innen = istUnterboden ? { ...FLAECHE_OBEN, z: geo.t } : { ...FLAECHE_UNTEN, z: 0 };
  const aussen = istUnterboden ? { ...FLAECHE_UNTEN, z: 0 } : { ...FLAECHE_OBEN, z: geo.t };
  return {
    teil,
    staerke: geo.t,
    innen,
    aussen,
    punkt: (y) => ({ x: seitenMitteX - geo.x0, y: y - geo.y0 }),
    achse: 'y',
    quer: { achse: 'x', laenge: geo.x1 - geo.x0 },
  };
}

/** Sockelblende als Stirnteil (Fuge entlang Welt-Z, Teil-y = Welt-Z). */
export function blendeAlsStirn(teil, laenge, staerke, ende) {
  const links = ende === 'links';
  return {
    teil,
    staerke,
    kante: ende,
    richtung: links ? '+x' : '-x',
    punkt: (z) => ({ x: links ? 0 : laenge, y: z, z: staerke / 2 }),
    achse: 'y',
    versteckt: {
      flaeche: 'innen',
      richtung: '-z',
      punkt: (z, abstand) => ({ x: links ? abstand : laenge - abstand, y: z, z: staerke }),
    },
  };
}
