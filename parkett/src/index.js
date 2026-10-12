// Öffentliche API des Parkett-Moduls.

export { PARKETTARTEN, MUSTER, VERLEGEARTEN, HOLZARTEN, SORTIERUNGEN, DIAGONAL_ZUSCHLAG } from './katalog.js';
export { berechneParkett, normalisiere, empfohlenerRandabstand, SCHEMA_VERSION, MAX_RAUMLAENGE_SCHWIMMEND } from './berechne.js';

/** Beispiel: Wohnzimmer 5,2 × 4,1 m mit Kaminvorsprung und zwei Türen, Landhausdiele Eiche. */
export function parkettVorlage() {
  return {
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
