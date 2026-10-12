// Gemeinsame Hilfsfunktionen für die Tests (enthält selbst keine Tests).
import { berechne } from '../src/index.js';

/** Standardkorpus 800 × 2000 × 560, Seiten 19, Rückwand 8 mm eingenutet (Abstand 10, Nuttiefe 8). */
export function korpus(ueberschreiben = {}) {
  return {
    breite: 800,
    hoehe: 2000,
    tiefe: 560,
    seitenStaerke: 19,
    materialStaerke: 19,
    material: 'Spanplatte',
    ...ueberschreiben,
  };
}

export const UB = { id: 'ub', typ: 'unterboden' };
export const OB = { id: 'ob', typ: 'oberboden' };
export const MB = { id: 'mb', typ: 'mittelboden' };

/** Berechnet einen Korpus mit den angegebenen Böden. */
export function rechne(boeden, korpusUeberschreiben = {}) {
  return berechne({ korpus: korpus(korpusUeberschreiben), boeden });
}

export function teil(ergebnis, id) {
  const t = ergebnis.teile.find((x) => x.id === id);
  if (!t) throw new Error(`Teil ${id} nicht gefunden. Vorhanden: ${ergebnis.teile.map((x) => x.id).join(', ')}`);
  return t;
}

export function hatTeil(ergebnis, id) {
  return ergebnis.teile.some((x) => x.id === id);
}

/** Alle Prüfungen mit dem Code. */
export function pruefung(ergebnis, code) {
  return ergebnis.pruefungen.filter((p) => p.code === code);
}

export function fehlercodes(ergebnis) {
  return ergebnis.pruefungen.filter((p) => p.schwere === 'fehler').map((p) => p.code);
}

/** Bearbeitungen eines Teils, optional gefiltert (Objekt mit Feldern, die übereinstimmen müssen). */
export function ops(ergebnis, teilId, filter = {}) {
  return teil(ergebnis, teilId).bearbeitungen.filter((b) =>
    Object.entries(filter).every(([k, v]) => b[k] === v),
  );
}
