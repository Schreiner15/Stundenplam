import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { rechne, teil, hatTeil, ops, fehlercodes, pruefung, UB, OB, MB } from './helfer.js';

const FB = { id: 'fest', typ: 'festboden' };

describe('Festboden', () => {
  test('Position ist Pflicht', () => {
    const e = rechne([UB, OB, FB]);
    assert.ok(fehlercodes(e).includes('POSITION_FEHLT'));
    assert.equal(hatTeil(e, 'fest'), false);
  });

  test('Standardverbindung Exzenter: Gehäuse auf der Unterseite', () => {
    const e = rechne([UB, OB, { ...FB, position: 800 }]);
    const fest = teil(e, 'fest');
    assert.equal(fest.lage.z, 800);
    assert.equal(fest.laenge, 762);
    assert.equal(fest.breite, 542);
    const gehaeuse = ops(e, 'fest', { art: 'bohrung', durchmesser: 15 });
    assert.ok(gehaeuse.length >= 4);
    assert.ok(gehaeuse.every((b) => b.flaeche === 'unten' && b.z === 0 && b.richtung === '+z'));
  });

  test('Festboden + Mittelboden teilen den Korpus in drei Abschnitte (nach Z sortiert)', () => {
    const e = rechne([UB, OB, MB, { ...FB, position: 1500 }]);
    assert.deepEqual(
      e.abschnitte.map((a) => [a.untenTeil, a.obenTeil]),
      [
        ['ub', 'mb'],
        ['mb', 'fest'],
        ['fest', 'ob'],
      ],
    );
  });

  test('Überlappung mit dem Mittelboden wird erkannt', () => {
    const e = rechne([UB, OB, MB, { ...FB, position: 1000 }]);
    const p = pruefung(e, 'UEBERLAPPUNG');
    assert.equal(p.length, 1);
    assert.equal(p[0].schwere, 'fehler');
  });

  test('feste Breite größer als lichte Breite → Kollision mit der Seite', () => {
    const e = rechne([UB, OB, { ...FB, position: 800, breite: 800 }]);
    assert.ok(fehlercodes(e).includes('KOLLISION_SEITE'));
  });

  test('feste Tiefe bis in die Rückwand → Kollision mit der Rückwand', () => {
    const e = rechne([UB, OB, { ...FB, position: 800, tiefe: 560 }]);
    assert.ok(fehlercodes(e).includes('KOLLISION_RUECKWAND'));
  });

  test('feste Breite kleiner als lichte Breite ist zulässig (zentriert)', () => {
    const e = rechne([UB, OB, { ...FB, position: 800, breite: 700 }]);
    assert.deepEqual(fehlercodes(e), []);
    assert.equal(teil(e, 'fest').lage.x, 50);
  });

  test('Lamello: Schlitze in Seite (Fläche) und Boden (Stirn)', () => {
    const e = rechne([UB, OB, { ...FB, position: 800, verbindung: 'lamello' }]);
    const seite = ops(e, 'seite-links', { art: 'schlitz', quelle: 'fest' });
    assert.deepEqual(seite.map((s) => s.y), [50, 197.3, 344.7, 492]);
    assert.ok(seite.every((s) => s.achse === 'y' && s.laenge === 60 && s.breite === 4 && s.tiefe === 12));
    const boden = ops(e, 'fest', { art: 'schlitz', flaeche: 'rechts' });
    assert.equal(boden.length, 4);
    assert.ok(boden.every((s) => s.x === 762 && s.richtung === '-x'));
  });

  test('Position außerhalb des Korpus', () => {
    const e = rechne([UB, OB, { ...FB, position: 1995 }]);
    assert.ok(fehlercodes(e).includes('AUSSERHALB'));
  });
});
