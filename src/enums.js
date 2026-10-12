// Fachliche Aufzählungen und die Kompatibilitätsmatrix Typ × Einbauart × Verbindung.

export const BodenTyp = Object.freeze({
  UNTERBODEN: 'unterboden',
  OBERBODEN: 'oberboden',
  MITTELBODEN: 'mittelboden',
  FESTBODEN: 'festboden',
  FACHBODEN: 'fachboden',
  SCHUBLADENBODEN: 'schubladenboden',
});

export const Einbauart = Object.freeze({
  ZWISCHEN: 'zwischen',
  DURCHLAUFEND: 'durchlaufend',
  EINGENUTET: 'eingenutet',
  GEHRUNG: 'gehrung',
  SOCKEL: 'sockel',
});

export const Verbindung = Object.freeze({
  DUEBEL: 'duebel',
  LAMELLO: 'lamello',
  EXZENTER: 'exzenter',
  KONFIRMAT: 'konfirmat',
  NUT_FEDER: 'nut_feder',
  FACHBODENTRAEGER: 'fachbodentraeger',
  ZAPFEN: 'zapfen',
});

const T = BodenTyp;
const E = Einbauart;
const V = Verbindung;

const STD = [V.DUEBEL, V.LAMELLO, V.EXZENTER, V.KONFIRMAT, V.ZAPFEN];
const AUFGESETZT = [V.DUEBEL, V.LAMELLO, V.EXZENTER, V.KONFIRMAT];

function tiefFrieren(objekt) {
  for (const wert of Object.values(objekt)) {
    if (wert && typeof wert === 'object') tiefFrieren(wert);
  }
  return Object.freeze(objekt);
}

/** ERLAUBT[typ][einbauart] = zulässige Verbindungen. Fehlt ein Eintrag, ist die Einbauart unzulässig. */
export const ERLAUBT = tiefFrieren({
  [T.UNTERBODEN]: {
    [E.ZWISCHEN]: [...STD],
    [E.DURCHLAUFEND]: [...AUFGESETZT],
    [E.EINGENUTET]: [V.NUT_FEDER],
    [E.GEHRUNG]: [V.LAMELLO],
    [E.SOCKEL]: [...STD],
  },
  [T.OBERBODEN]: {
    [E.ZWISCHEN]: [...STD],
    [E.DURCHLAUFEND]: [...AUFGESETZT],
    [E.EINGENUTET]: [V.NUT_FEDER],
    [E.GEHRUNG]: [V.LAMELLO],
  },
  [T.MITTELBODEN]: {
    [E.ZWISCHEN]: [...STD],
    [E.EINGENUTET]: [V.NUT_FEDER],
  },
  [T.FESTBODEN]: {
    [E.ZWISCHEN]: [...STD],
    [E.EINGENUTET]: [V.NUT_FEDER],
  },
  [T.FACHBODEN]: {
    [E.ZWISCHEN]: [V.FACHBODENTRAEGER],
  },
  [T.SCHUBLADENBODEN]: {
    [E.EINGENUTET]: [V.NUT_FEDER],
  },
});

/** Böden, die den Korpus in Abschnitte teilen. */
export const FESTE_TYPEN = Object.freeze([T.UNTERBODEN, T.OBERBODEN, T.MITTELBODEN, T.FESTBODEN]);

export function istBekannterTyp(typ) {
  return Object.hasOwn(ERLAUBT, typ);
}

export function istErlaubt(typ, einbauart, verbindung) {
  return Boolean(ERLAUBT[typ]?.[einbauart]?.includes(verbindung));
}

/** Anzeigenamen (Stückliste, Vorschau). */
export const BEZEICHNUNG = Object.freeze({
  [T.UNTERBODEN]: 'Unterboden',
  [T.OBERBODEN]: 'Oberboden',
  [T.MITTELBODEN]: 'Mittelboden',
  [T.FESTBODEN]: 'Festboden',
  [T.FACHBODEN]: 'Fachboden',
  [T.SCHUBLADENBODEN]: 'Schubladenboden',
  [E.ZWISCHEN]: 'zwischen den Seiten',
  [E.DURCHLAUFEND]: 'durchlaufend (Seiten auf Boden)',
  [E.EINGENUTET]: 'eingenutet',
  [E.GEHRUNG]: 'Gehrung',
  [E.SOCKEL]: 'mit Sockel',
  [V.DUEBEL]: 'Dübel',
  [V.LAMELLO]: 'Lamello',
  [V.EXZENTER]: 'Exzenter',
  [V.KONFIRMAT]: 'Konfirmat',
  [V.NUT_FEDER]: 'Nut/Feder',
  [V.FACHBODENTRAEGER]: 'Fachbodenträger',
  [V.ZAPFEN]: 'Zapfen',
});
