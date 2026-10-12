import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { berechneLicht } from '../src/index.js';
import { berechne as berechneMoebel } from '../../src/index.js';

// Korpus 800 × 2000 × 560; Mittelboden mb: Welt x 19…781, y 0…542, Unterseite z = 990,5
function moebel(mbVerbindung = 'duebel') {
  return berechneMoebel({
    korpus: { breite: 800, hoehe: 2000, tiefe: 560 },
    boeden: [
      { id: 'ub', typ: 'unterboden' }, { id: 'ob', typ: 'oberboden' },
      { id: 'mb', typ: 'mittelboden', verbindung: mbVerbindung }, { id: 'fb', typ: 'fachboden', abschnitt: 0 },
    ],
  });
}
const M = moebel();
const codes = (e) => e.pruefungen.map((p) => p.code);
const nah = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));
const Z = 990.5;
/** L-förmige Linie unter dem Mittelboden: lokal (30,60) → (730,60) → (730,500). */
const L_LINIE = { id: 'lin', typ: 'linie', punkte: [{ x: 49, y: 60, z: Z }, { x: 749, y: 60, z: Z }, { x: 749, y: 500, z: Z }] };

describe('Linienlicht (gezeichnete Linie → Lichtquelle)', () => {
  test('erkennt die Möbelfläche selbst, Länge über alle Segmente, Streifen auf Schnittraster', () => {
    const e = berechneLicht({ moebel: M, leuchten: [L_LINIE] });
    const l = e.leuchten[0];
    assert.equal(l.teil, 'mb');
    assert.equal(l.flaeche, 'unten');
    assert.deepEqual(l.richtung, { x: 0, y: 0, z: -1 });
    assert.equal(l.laenge, 1140);
    assert.equal(l.segmente, 2);
    assert.equal(l.streifenLaenge, 1100); // ⌊(1140 − 2 × 5) / 50⌋ · 50
    assert.ok(nah(l.watt, 10.56));
    assert.ok(nah(l.lumen, 935)); // Aufbauprofil, Wirkungsgrad 0,85
    assert.deepEqual(codes(e).filter((c) => c !== 'LICHTFARBE_GEMISCHT'), []);
  });

  test('Einbauprofil: eine Nut je Segment in Teilkoordinaten, Eckverbinder in der Stückliste', () => {
    const e = berechneLicht({ moebel: M, leuchten: [{ ...L_LINIE, profil: 'einbau' }] });
    const nuten = e.bearbeitungen.filter((b) => b.art === 'nut' && b.breite === 18);
    assert.deepEqual(nuten.map((n) => [n.von, n.bis]), [
      [{ x: 30, y: 60, z: 0 }, { x: 730, y: 60, z: 0 }],
      [{ x: 730, y: 60, z: 0 }, { x: 730, y: 500, z: 0 }],
    ]);
    assert.ok(nuten.every((n) => n.teil === 'mb' && n.flaeche === 'unten' && n.richtung === '+z'));
    const pos = (a) => e.stueckliste.find((s) => s.position.startsWith(a));
    assert.equal(pos('Eckverbinder').menge, 1);
    assert.equal(pos('Endkappen').menge, 2);
    assert.equal(pos('Alu-Einbauprofil').menge, 1); // 700 + 440 passen in eine 2-m-Stange
  });

  test('gleiche Lichtverteilung wie ein LED-Profil auf derselben Strecke', () => {
    const pf = [{ name: 'fb', teil: 'fb-1', flaeche: 'oben' }];
    const profil = berechneLicht({ moebel: M, pruefflaechen: pf, leuchten: [{ id: 'p', typ: 'ledProfil', profil: 'aufbau', befestigung: { teil: 'mb', flaeche: 'unten', abstandVorne: 150, rand: 30 } }] });
    const linie = berechneLicht({ moebel: M, pruefflaechen: pf, leuchten: [{ id: 'l', typ: 'linie', profil: 'aufbau', punkte: [{ x: 49, y: 150, z: Z }, { x: 751, y: 150, z: Z }] }] });
    assert.equal(linie.leuchten[0].lumen, profil.leuchten[0].lumen);
    assert.ok(nah(linie.beleuchtung[0].mittel, profil.beleuchtung[0].mittel, 1e-6));
  });

  test('freie Linie im Raum: keine Bearbeitung, strahlt rundum', () => {
    const e = berechneLicht({ moebel: M, leuchten: [{ id: 'w', typ: 'linie', profil: 'keins', punkte: [{ x: 0, y: -300, z: 2200 }, { x: 800, y: -300, z: 2200 }] }] });
    const l = e.leuchten[0];
    assert.equal(l.teil, null);
    assert.equal(l.richtung, null);
    assert.equal(e.bearbeitungen.length, 0);
    assert.ok(nah(l.lumen, 800)); // ohne Profil: keine Endkappen, kein Diffusor → 0,8 m · 1000 lm/m
  });

  test('Einbauprofil ohne Möbelfläche ist ein Fehler', () => {
    const e = berechneLicht({ moebel: M, leuchten: [{ id: 'w', typ: 'linie', profil: 'einbau', punkte: [{ x: 0, y: -300, z: 2200 }, { x: 800, y: -300, z: 2200 }] }] });
    assert.ok(codes(e).includes('KEINE_FLAECHE'));
  });

  test('weniger als zwei Punkte', () => {
    assert.ok(codes(berechneLicht({ moebel: M, leuchten: [{ id: 'x', typ: 'linie', punkte: [{ x: 1, y: 1, z: 1 }] }] })).includes('PUNKTE_FEHLEN'));
  });

  test('schräge Nut: genaue Kollisionsprüfung mit Exzentergehäusen', () => {
    const m = moebel('exzenter'); // Gehäuse Ø 15 unten bei lokal x = 34 / 728, y = 50 / 271 / 492
    const schraeg = (a, b) => berechneLicht({ moebel: m, leuchten: [{ id: 's', typ: 'linie', profil: 'einbau', punkte: [{ x: 19 + a[0], y: a[1], z: Z }, { x: 19 + b[0], y: b[1], z: Z }] }] });
    assert.ok(codes(schraeg([20, 30], [300, 310])).includes('KOLLISION_BEARBEITUNG'));
    assert.ok(!codes(schraeg([100, 100], [600, 400])).includes('KOLLISION_BEARBEITUNG'));
  });

  test('Render-Export enthält den Linienzug in Metern', () => {
    const e = berechneLicht({ moebel: M, leuchten: [L_LINIE] });
    const r = e.renderLichter[0];
    assert.equal(r.typ, 'linie');
    assert.deepEqual(r.punkte, [[0.049, 0.06, 0.991], [0.749, 0.06, 0.991], [0.749, 0.5, 0.991]]);
  });
});

describe('Diagnose bei 0 lx', () => {
  test('Licht strahlt von der Fläche weg', () => {
    const e = berechneLicht({ moebel: M, pruefflaechen: [{ name: 'fb', teil: 'fb-1', flaeche: 'oben' }],
      leuchten: [{ id: 'hoch', typ: 'ledProfil', profil: 'aufbau', befestigung: { teil: 'mb', flaeche: 'oben', abstandVorne: 150, rand: 30 } }] });
    const p = e.pruefungen.find((x) => x.code === 'KEIN_LICHT');
    assert.ok(p, JSON.stringify(e.pruefungen));
    assert.match(p.meldung, /weg/);
  });

  test('Licht wird von einem Möbelteil verdeckt', () => {
    const e = berechneLicht({ moebel: M, pruefflaechen: [{ name: 'ub', teil: 'ub', flaeche: 'oben' }],
      leuchten: [{ id: 'oben', typ: 'spot', befestigung: { teil: 'ob', flaeche: 'unten', x: 381, y: 200 } }] });
    const p = e.pruefungen.find((x) => x.code === 'KEIN_LICHT');
    assert.match(p.meldung, /verdeckt durch Mittelboden mb/);
  });
});
