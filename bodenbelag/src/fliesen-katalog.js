// Fliesen-Katalog: Fliesenarten, Verlegemuster, Raumtypen, Optiken.
// Wasseraufnahme-Gruppen nach DIN EN 14411; alle Maße, Fugenbreiten und Empfehlungen sind Richtwerte
// (siehe bodenbelag/README.md). Herstellerangaben und ZDB-Merkblätter haben Vorrang.

function frieren(o) {
  for (const v of Object.values(o)) if (v && typeof v === 'object') frieren(v);
  return Object.freeze(o);
}

/** Fliesenmuster. verschnitt = Richtwert in % parallel zur Wand. */
export const FLIESEN_MUSTER = frieren({
  kreuzfuge: { name: 'Kreuzfuge (Raster)', kurz: 'Fugen durchgehend in beiden Richtungen', verschnitt: 7, familie: 'verband', versatz: 0 },
  halbverband: { name: 'Halbverband (½-Versatz)', kurz: 'klassischer Läuferverband', verschnitt: 10, familie: 'verband', versatz: 1 / 2 },
  drittelverband: { name: 'Drittelverband (⅓-Versatz)', kurz: 'empfohlen für lange Formate (vermeidet Überzahn)', verschnitt: 10, familie: 'verband', versatz: 1 / 3 },
  wild: { name: 'Wilder Verband (Dielenoptik)', kurz: 'zufälliger Versatz, für Holzoptik', verschnitt: 10, familie: 'verband', versatz: null },
  fischgraet: { name: 'Fischgrät', kurz: 'für Holzoptik, Cotto und Klinker', verschnitt: 15, familie: 'fischgraet' },
});

/** Zuschlag in Prozentpunkten bei diagonaler Verlegung (45°). */
export const FLIESEN_DIAGONAL_ZUSCHLAG = 8;

const ALLE = ['kreuzfuge', 'halbverband', 'drittelverband'];

/**
 * Fliesenarten.
 * einsatz: wand_innen | boden_innen | aussen; frostsicher: true | false | 'abhaengig'
 * formate: [Länge, Breite] in mm (erstes = Standard); fuge: [min, standard] in mm
 */
export const FLIESENARTEN = frieren({
  feinsteinzeug: {
    name: 'Feinsteinzeug', gruppe: 'BIa – Wasseraufnahme ≤ 0,5 %', frostsicher: true, glasiert: 'beides',
    beschreibung: 'Dicht gesintert, sehr hart und frostsicher. Allround-Material für Wand, Boden, Terrasse und Balkon.',
    einsatz: ['wand_innen', 'boden_innen', 'aussen'], formate: [[600, 600], [600, 300], [1200, 600], [1200, 300], [800, 800], [1200, 1200]],
    staerke: 10, fuge: [2, 3], muster: [...ALLE, 'wild'], optik: 'beton', streuung: 0.03, pei: 'IV',
  },
  holzoptik: {
    name: 'Feinsteinzeug Holzoptik (Dielenformat)', gruppe: 'BIa – Wasseraufnahme ≤ 0,5 %', frostsicher: true, glasiert: true,
    beschreibung: 'Feinsteinzeug im Dielenformat mit Holzdekor; pflegeleichte Alternative zu Parkett, auch mit Fußbodenheizung.',
    einsatz: ['boden_innen', 'aussen'], formate: [[1200, 200], [1200, 300], [1800, 200], [600, 150]],
    staerke: 10, fuge: [2, 3], muster: ['drittelverband', 'wild', 'fischgraet'], optik: 'holzEiche', streuung: 0.12, pei: 'IV',
  },
  grossformat: {
    name: 'Großformat / Keramikplatte', gruppe: 'BIa – Wasseraufnahme ≤ 0,5 %', frostsicher: true, glasiert: true,
    beschreibung: 'Platten ab 120 cm Kantenlänge, wenige Fugen; braucht ebenen Untergrund und Buttering-Floating.',
    einsatz: ['wand_innen', 'boden_innen', 'aussen'], formate: [[1200, 1200], [2400, 1200], [3200, 1600]],
    staerke: 9, fuge: [2, 3], muster: ['kreuzfuge', 'drittelverband'], optik: 'marmor', streuung: 0.02, pei: 'IV',
  },
  steinzeug: {
    name: 'Steinzeug (glasiert)', gruppe: 'BIb–BIIa – Wasseraufnahme 0,5–6 %', frostsicher: 'abhaengig', glasiert: true,
    beschreibung: 'Robust und preiswert für Böden innen; frostsicher nur bei sehr geringer Wasseraufnahme (bis ca. 3 %).',
    einsatz: ['wand_innen', 'boden_innen'], formate: [[330, 330], [300, 300], [450, 450], [600, 300]],
    staerke: 8, fuge: [3, 3], muster: [...ALLE], optik: 'sand', streuung: 0.04, pei: 'III',
  },
  steingut: {
    name: 'Steingut (Wandfliese)', gruppe: 'BIII – Wasseraufnahme > 10 %', frostsicher: false, glasiert: true,
    beschreibung: 'Porös und weich, nicht frostsicher; nur für Wände im Innenbereich.',
    einsatz: ['wand_innen'], formate: [[400, 250], [250, 200], [600, 300]],
    staerke: 8, fuge: [2, 2], muster: [...ALLE], optik: 'weiss', streuung: 0.01, pei: null,
  },
  cotto: {
    name: 'Cotto / Terrakotta', gruppe: 'BIII – unglasiert, Wasseraufnahme > 10 %', frostsicher: false, glasiert: false,
    beschreibung: 'Gebrannter Ton mit lebendiger Farbe; muss imprägniert werden, meist nicht frostsicher.',
    einsatz: ['boden_innen'], formate: [[300, 300], [400, 200], [300, 150]],
    staerke: 15, fuge: [6, 8], muster: ['kreuzfuge', 'halbverband', 'fischgraet'], optik: 'terrakotta', streuung: 0.14, pei: null, impraegnieren: true,
  },
  klinker: {
    name: 'Klinker / Spaltplatte', gruppe: 'AI–AIIa – stranggepresst, Wasseraufnahme ≤ 6 %', frostsicher: true, glasiert: false,
    beschreibung: 'Stranggepresst, hart gebrannt und frostsicher; für Terrasse, Eingang, Gewerbe.',
    einsatz: ['boden_innen', 'aussen'], formate: [[240, 115], [240, 52], [300, 300]],
    staerke: 11, fuge: [6, 8], muster: ['halbverband', 'kreuzfuge', 'fischgraet'], optik: 'ziegelrot', streuung: 0.1, pei: null,
  },
  mosaik: {
    name: 'Mosaik (auf Netz)', gruppe: 'meist BIa (Feinsteinzeug) oder Glas', frostsicher: true, glasiert: 'beides',
    beschreibung: 'Kleine Steine (z. B. 2,5 × 2,5 cm) auf 30 × 30 cm Netzmatten; ideal für Duschen und Gefälle.',
    einsatz: ['wand_innen', 'boden_innen', 'aussen'], formate: [[300, 300]], mosaikStein: 25,
    staerke: 6, fuge: [2, 2], muster: ['kreuzfuge'], optik: 'blaugruen', streuung: 0.015, pei: 'III',
  },
  zementfliese: {
    name: 'Zementfliese', gruppe: 'hydraulisch gepresst (nicht nach EN 14411)', frostsicher: false, glasiert: false,
    beschreibung: 'Handgefertigt mit farbiger Musterschicht; offenporig, muss imprägniert werden.',
    einsatz: ['wand_innen', 'boden_innen'], formate: [[200, 200], [150, 150]],
    staerke: 16, fuge: [1.5, 2], muster: ['kreuzfuge'], optik: 'blaugruen', streuung: 0.03, pei: null, impraegnieren: true,
  },
  naturstein: {
    name: 'Naturstein (Granit, Marmor, Schiefer, Travertin)', gruppe: 'Natursteinplatten nach DIN EN 12058', frostsicher: 'abhaengig', glasiert: false,
    beschreibung: 'Jede Platte ein Unikat; Granit und Schiefer meist frostsicher, Marmor und Travertin säureempfindlich und eher innen.',
    einsatz: ['wand_innen', 'boden_innen', 'aussen'], formate: [[600, 300], [600, 600], [400, 400], [305, 305]],
    staerke: 10, fuge: [2, 3], muster: [...ALLE, 'wild'], optik: 'travertin', streuung: 0.08, pei: null, impraegnieren: true,
  },
});

/** Raumtypen mit empfohlener Mindest-Rutschhemmung (DIN 51130) und Abriebklasse (PEI, nur glasiert). */
export const RAUMTYPEN = frieren({
  wohnraum: { name: 'Wohn-/Schlafraum', rutsch: 'R9', pei: 'II', aussen: false, abdichtung: false },
  flur: { name: 'Flur / Eingang', rutsch: 'R9', pei: 'IV', aussen: false, abdichtung: false },
  kueche: { name: 'Küche', rutsch: 'R10', pei: 'III', aussen: false, abdichtung: false },
  bad: { name: 'Bad', rutsch: 'R10', pei: 'II', aussen: false, abdichtung: true },
  dusche: { name: 'Dusche (bodengleich)', rutsch: 'R11', pei: 'II', aussen: false, abdichtung: true },
  aussen: { name: 'Terrasse / Balkon', rutsch: 'R11', pei: 'IV', aussen: true, abdichtung: false },
});

export const RUTSCHHEMMUNG = Object.freeze(['R9', 'R10', 'R11', 'R12', 'R13']);
export const ABRIEBKLASSEN = Object.freeze(['I', 'II', 'III', 'IV', 'V']);

export const FLIESEN_OPTIKEN = frieren({
  weiss: { name: 'Weiß', farbe: '#efeee9' },
  hellgrau: { name: 'Hellgrau', farbe: '#cfd0cc' },
  beton: { name: 'Betonoptik', farbe: '#a9a79f' },
  anthrazit: { name: 'Anthrazit', farbe: '#4b4d4f' },
  sand: { name: 'Sand', farbe: '#d8c6a4' },
  travertin: { name: 'Travertin', farbe: '#d6c09c' },
  marmor: { name: 'Marmoroptik', farbe: '#e9e7e2' },
  holzEiche: { name: 'Holzoptik Eiche', farbe: '#b7895a' },
  terrakotta: { name: 'Terrakotta', farbe: '#b9633f' },
  ziegelrot: { name: 'Ziegelrot', farbe: '#9b4a33' },
  blaugruen: { name: 'Blaugrün', farbe: '#5f8c8a' },
  schwarz: { name: 'Schwarz', farbe: '#26272b' },
});

export const FUGENFARBEN = frieren({
  grau: { name: 'Grau', farbe: '#9b9b96' },
  weiss: { name: 'Weiß', farbe: '#e8e7e2' },
  sand: { name: 'Sand', farbe: '#c7b799' },
  anthrazit: { name: 'Anthrazit', farbe: '#3e4042' },
});
