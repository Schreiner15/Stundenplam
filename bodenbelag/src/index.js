// Öffentliche API des Bodenbelag-Moduls (Parkett und Fliesen).

import { berechneParkett } from './berechne.js';
import { berechneFliesen } from './fliesen.js';

export { PARKETTARTEN, MUSTER, VERLEGEARTEN, HOLZARTEN, SORTIERUNGEN, DIAGONAL_ZUSCHLAG } from './katalog.js';
export { berechneParkett, normalisiere, empfohlenerRandabstand, SCHEMA_VERSION, MAX_RAUMLAENGE_SCHWIMMEND } from './berechne.js';
export {
  FLIESENARTEN, FLIESEN_MUSTER, FLIESEN_DIAGONAL_ZUSCHLAG, RAUMTYPEN, RUTSCHHEMMUNG, ABRIEBKLASSEN, FLIESEN_OPTIKEN, FUGENFARBEN,
} from './fliesen-katalog.js';
export {
  berechneFliesen, normalisiereFliesen, zahnungFuer, fugenmoertelJeM2, KLEBER_JE_ZAHNUNG, BUTTERING_ZUSCHLAG,
} from './fliesen.js';

/** Berechnet je nach eingabe.belag ('parkett' | 'fliesen'). */
export function berechneBelag(eingabe) {
  return eingabe?.belag === 'fliesen' ? berechneFliesen(eingabe) : berechneParkett(eingabe);
}

/** Beispiel: Wohnzimmer 5,2 × 4,1 m mit Kaminvorsprung und zwei Türen, Landhausdiele Eiche. */
export function parkettVorlage() {
  return {
    belag: 'parkett',
    raum: {
      laenge: 5200,
      breite: 4100,
      aussparungen: [{ name: 'Kaminvorsprung', x: 2300, y: 3700, laenge: 900, breite: 400 }],
      tueren: [{ breite: 900, wand: 'unten', position: 400 }, { breite: 1000, wand: 'rechts', position: 1500 }],
    },
    parkett: { art: 'landhausdiele', holzart: 'eiche', sortierung: 'natur', preisProM2: 59.9 },
    verlegung: { muster: 'drittel', drehung: 0, art: 'schwimmend', startwert: 7 },
  };
}

/** Beispiel: Bad 3,2 × 2,6 m mit Badewanne, Feinsteinzeug 60 × 30 im Drittelverband. */
export function fliesenVorlage() {
  return {
    belag: 'fliesen',
    raum: {
      laenge: 3200,
      breite: 2600,
      raumtyp: 'bad',
      aussparungen: [{ name: 'Badewanne', x: 0, y: 1850, laenge: 1700, breite: 750 }],
      tueren: [{ breite: 800, wand: 'unten', position: 2200 }],
    },
    fliese: { art: 'feinsteinzeug', laenge: 600, breite: 300, optik: 'beton', rutschhemmung: 'R10', abriebklasse: 'IV', preisProM2: 44.9 },
    verlegung: { muster: 'drittelverband', drehung: 0, fugenbreite: 3, fugenfarbe: 'grau', randfuge: 5, startwert: 3 },
  };
}
