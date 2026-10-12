// Katalog: Parkettarten, Verlegemuster, Verlegearten, Holzarten.
// Maße und Prozentwerte sind Richtwerte aus Ratgebern/Normen (siehe parkett/README.md);
// Herstellerangaben haben immer Vorrang.

function frieren(o) {
  for (const v of Object.values(o)) if (v && typeof v === 'object') frieren(v);
  return Object.freeze(o);
}

/** Verlegemuster. verschnitt = Richtwert in % für Verlegung parallel zur Wand. */
export const MUSTER = frieren({
  englisch: { name: 'Englischer Verband', kurz: '½-Versatz, ruhiges Bild, wenig Verschnitt', verschnitt: 5, familie: 'verband', versatz: 1 / 2 },
  drittel: { name: 'Drittelverband', kurz: '⅓-Versatz, typisch für Dielen', verschnitt: 6, familie: 'verband', versatz: 1 / 3 },
  wild: { name: 'Wilder Verband (Schiffsbodenmuster)', kurz: 'zufälliger Stoßversatz', verschnitt: 7, familie: 'verband', versatz: null },
  fischgraet: { name: 'Fischgrät', kurz: 'Stäbe im 90°-Winkel zueinander', verschnitt: 12, familie: 'fischgraet' },
  chevron: { name: 'Chevron (Französisches Fischgrät)', kurz: 'Stirnseiten auf 45° geschnitten, Spitze an Spitze', verschnitt: 15, familie: 'chevron' },
  wuerfel: { name: 'Würfelmuster', kurz: 'Quadrate aus Stäben, im Wechsel quer und längs', verschnitt: 8, familie: 'wuerfel' },
  tafel: { name: 'Tafelparkett (Quadratraster)', kurz: 'quadratische Tafeln im Raster', verschnitt: 8, familie: 'tafel' },
});

/** Zuschlag in Prozentpunkten bei diagonaler Verlegung (45°). */
export const DIAGONAL_ZUSCHLAG = 5;

export const VERLEGEARTEN = frieren({
  schwimmend: { name: 'schwimmend', kurz: 'auf Trittschalldämmung, ohne Verbindung zum Untergrund' },
  verklebt: { name: 'vollflächig verklebt', kurz: 'mit Parkettklebstoff auf grundiertem Estrich' },
  genagelt: { name: 'genagelt / geschraubt', kurz: 'verdeckt auf Blindboden oder Lagerhölzer' },
});

const VERBAND = ['englisch', 'drittel', 'wild'];

/** Parkettarten. masse = Standardformat (mm), bereich = übliche Spanne [min, max]. */
export const PARKETTARTEN = frieren({
  stabparkett: {
    name: 'Stabparkett', aufbau: 'Massivparkett', norm: 'DIN EN 13226',
    beschreibung: 'Massive Einzelstäbe mit Nut und Feder, mehrfach abschleifbar.',
    masse: { laenge: 500, breite: 70, staerke: 22 }, bereich: { laenge: [250, 1000], breite: [40, 80], staerke: [14, 22] },
    muster: [...VERBAND, 'fischgraet', 'wuerfel'], verlegung: ['verklebt', 'genagelt'], paketInhalt: 1.5, werkfertig: false,
  },
  lamparkett: {
    name: 'Lamparkett (Lamellenparkett)', aufbau: 'Massivparkett', norm: 'DIN EN 13227',
    beschreibung: 'Kurze, dünne Massivlamellen ohne Nut und Feder, nur verklebt.',
    masse: { laenge: 250, breite: 50, staerke: 10 }, bereich: { laenge: [120, 400], breite: [40, 65], staerke: [10, 12] },
    muster: [...VERBAND, 'fischgraet', 'wuerfel'], verlegung: ['verklebt'], paketInhalt: 1.5, werkfertig: false,
  },
  mosaikparkett: {
    name: 'Mosaikparkett', aufbau: 'Massivparkett', norm: 'DIN EN 13488',
    beschreibung: 'Kleine Lamellen (ca. 8 mm), auf Netz oder Papier zu Würfeln vorgefertigt.',
    masse: { laenge: 120, breite: 24, staerke: 8 }, bereich: { laenge: [100, 165], breite: [18, 25], staerke: [8, 10] },
    muster: ['wuerfel'], verlegung: ['verklebt'], paketInhalt: 1.3, werkfertig: false,
  },
  hochkantlamelle: {
    name: 'Hochkantlamellenparkett (Industrieparkett)', aufbau: 'Massivparkett', norm: 'DIN EN 14761',
    beschreibung: 'Hochkant verleimte Lamellen, sehr robust, für Werkstatt und Gewerbe.',
    masse: { laenge: 160, breite: 8, staerke: 22 }, bereich: { laenge: [120, 650], breite: [8, 10], staerke: [14, 23] },
    muster: ['englisch', 'wild'], verlegung: ['verklebt'], paketInhalt: 2, werkfertig: false,
  },
  schiffsboden: {
    name: 'Mehrschichtparkett Schiffsboden (3-Stab)', aufbau: 'Mehrschichtparkett (Fertigparkett)', norm: 'DIN EN 13489',
    beschreibung: 'Element mit drei Stabreihen in der Deckschicht, werkseitig versiegelt.',
    masse: { laenge: 2200, breite: 207, staerke: 14 }, bereich: { laenge: [1800, 2400], breite: [180, 210], staerke: [11, 15] },
    staebeJeElement: 3, nutzschicht: 3.5,
    muster: [...VERBAND], verlegung: ['schwimmend', 'verklebt'], paketInhalt: 3.19, werkfertig: true,
  },
  landhausdiele: {
    name: 'Landhausdiele', aufbau: 'Mehrschichtparkett (Fertigparkett)', norm: 'DIN EN 13489',
    beschreibung: 'Breite, lange Einstabdiele mit 2,5–6 mm Nutzschicht.',
    masse: { laenge: 1900, breite: 190, staerke: 14 }, bereich: { laenge: [1200, 2400], breite: [140, 300], staerke: [12, 21] },
    nutzschicht: 3.5,
    muster: [...VERBAND], verlegung: ['schwimmend', 'verklebt'], paketInhalt: 2.53, werkfertig: true,
  },
  massivdiele: {
    name: 'Massivholzdiele', aufbau: 'Massivholz', norm: 'DIN EN 13990',
    beschreibung: 'Durchgehend massive Diele, ab 120 mm breit und ab 1,2 m lang.',
    masse: { laenge: 2500, breite: 160, staerke: 21 }, bereich: { laenge: [1200, 5000], breite: [120, 300], staerke: [18, 28] },
    muster: [...VERBAND], verlegung: ['genagelt', 'verklebt'], paketInhalt: 2.4, werkfertig: false,
  },
  fischgraetparkett: {
    name: 'Fischgrät-Mehrschichtparkett', aufbau: 'Mehrschichtparkett (Fertigparkett)', norm: 'DIN EN 13489',
    beschreibung: 'Links- und Rechtsstäbe (A/B) für das Fischgrätmuster, werkseitig behandelt.',
    masse: { laenge: 600, breite: 120, staerke: 14 }, bereich: { laenge: [400, 900], breite: [70, 150], staerke: [10, 16] },
    muster: ['fischgraet'], verlegung: ['verklebt'], paketInhalt: 1.44, werkfertig: true,
  },
  chevronparkett: {
    name: 'Chevron-Parkett', aufbau: 'Mehrschichtparkett (Fertigparkett)', norm: 'DIN EN 13489',
    beschreibung: 'Stäbe mit 45°-Stirnschnitt für das Französische Fischgrät.',
    masse: { laenge: 600, breite: 120, staerke: 14 }, bereich: { laenge: [400, 900], breite: [70, 150], staerke: [10, 16] },
    muster: ['chevron'], verlegung: ['verklebt'], paketInhalt: 1.44, werkfertig: true,
  },
  tafelparkett: {
    name: 'Tafelparkett', aufbau: 'Mehrschichtparkett', norm: 'DIN EN 13489',
    beschreibung: 'Quadratische, vorgefertigte Tafeln (z. B. Versailles-Tafeln).',
    masse: { laenge: 600, breite: 600, staerke: 20 }, bereich: { laenge: [400, 1000], breite: [400, 1000], staerke: [14, 22] },
    muster: ['tafel'], verlegung: ['verklebt', 'genagelt'], paketInhalt: 1.44, werkfertig: true,
  },
});

export const HOLZARTEN = frieren({
  eiche: { name: 'Eiche natur', farbe: '#c79a62' },
  eicheWeiss: { name: 'Eiche weiß geölt', farbe: '#e4d6c0' },
  eicheGeraeuchert: { name: 'Eiche geräuchert', farbe: '#75502f' },
  esche: { name: 'Esche', farbe: '#e2cda4' },
  ahorn: { name: 'Ahorn', farbe: '#ecdcbc' },
  buche: { name: 'Buche', farbe: '#d6a679' },
  kirsche: { name: 'Kirsche', farbe: '#b26d45' },
  nussbaum: { name: 'Nussbaum (amerik.)', farbe: '#6a4935' },
});

/** Sortierung: streuung = Farbstreuung der Stäbe in der Vorschau (0…1). */
export const SORTIERUNGEN = frieren({
  select: { name: 'Select (ruhig, astarm)', streuung: 0.04 },
  natur: { name: 'Natur (lebhaft, kleine Äste)', streuung: 0.09 },
  rustikal: { name: 'Rustikal (Äste, Farbspiel)', streuung: 0.16 },
});
