// Stückliste, CSV-Export und JSON-Serialisierung.

import { normalisiere } from './defaults.js';

/** Fasst gleiche Teile (Bezeichnung, Maße, Material, Kanten) zu Stücklistenpositionen zusammen. */
export function erstelleStueckliste(teile) {
  const zeilen = new Map();
  for (const t of teile) {
    const schluessel = [t.bezeichnung, t.laenge, t.breite, t.staerke, t.material, t.kanten.join(',')].join('|');
    let zeile = zeilen.get(schluessel);
    if (!zeile) {
      zeile = {
        pos: zeilen.size + 1,
        bezeichnung: t.bezeichnung,
        anzahl: 0,
        laenge: t.laenge,
        breite: t.breite,
        staerke: t.staerke,
        zuschnittLaenge: t.zuschnitt.laenge,
        zuschnittBreite: t.zuschnitt.breite,
        material: t.material,
        kanten: [...t.kanten],
        teile: [],
      };
      zeilen.set(schluessel, zeile);
    }
    zeile.anzahl += 1;
    zeile.teile.push(t.id);
  }
  return [...zeilen.values()];
}

function zelle(wert) {
  if (wert === null || wert === undefined) return '';
  const text = typeof wert === 'number' ? String(wert).replace('.', ',') : String(wert);
  return /[;"\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function csv(kopf, zeilen) {
  return [kopf.join(';'), ...zeilen.map((z) => z.map(zelle).join(';'))].join('\n');
}

/** Stückliste als CSV (Semikolon, Dezimalkomma – direkt in deutschem Excel lesbar). */
export function stuecklisteAlsCSV(ergebnis) {
  return csv(
    ['Pos', 'Bezeichnung', 'Anzahl', 'Länge', 'Breite', 'Stärke', 'Zuschnitt Länge', 'Zuschnitt Breite', 'Material', 'Kanten', 'Teile'],
    ergebnis.stueckliste.map((z) => [
      z.pos, z.bezeichnung, z.anzahl, z.laenge, z.breite, z.staerke,
      z.zuschnittLaenge, z.zuschnittBreite, z.material, z.kanten.join(', '), z.teile.join(', '),
    ]),
  );
}

/** Alle Bearbeitungen als CSV, eine Zeile je Bearbeitung (Nut: X/Y/Z = Startpunkt). */
export function bearbeitungenAlsCSV(ergebnis) {
  return csv(
    ['Teil', 'Art', 'Fläche', 'X', 'Y', 'Z', 'Richtung', 'Durchmesser', 'Tiefe', 'Breite', 'Länge', 'Dicke',
      'Bis X', 'Bis Y', 'Bis Z', 'Winkel', 'Quelle', 'Verbindung'],
    ergebnis.bearbeitungen.map((b) => {
      const p = b.von ?? b;
      return [
        b.teil, b.art, b.flaeche, p.x, p.y, p.z, b.richtung, b.durchmesser, b.tiefe, b.breite, b.laenge, b.dicke,
        b.bis?.x, b.bis?.y, b.bis?.z, b.winkel, b.quelle, b.verbindung,
      ];
    }),
  );
}

export function zuJSON(ergebnis) {
  return JSON.stringify(ergebnis, null, 2);
}

/** Liest eine Eingabe aus JSON und normalisiert sie. Wirft SyntaxError/TypeError bei kaputter Eingabe. */
export function ausJSON(text) {
  const daten = JSON.parse(text);
  return normalisiere(daten);
}
