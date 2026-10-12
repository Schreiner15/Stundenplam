import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { rechne, teil, ops, fehlercodes, UB, OB, MB } from './helfer.js';

describe('Zwischenboden / Mittelboden', () => {
  test('Standardposition 50 %: Bodenmitte auf halber Korpushöhe, Tiefe bis zur Rückwand', () => {
    const e = rechne([UB, OB, MB]);
    const mb = teil(e, 'mb');
    assert.equal(mb.lage.z, 990.5);
    assert.equal(mb.laenge, 762);
    assert.equal(mb.breite, 542); // 560 − 10 (Rückwandabstand) − 8 (Rückwand)
    assert.equal(mb.lage.y, 0);
    assert.deepEqual(fehlercodes(e), []);
  });

  test('teilt den Korpus in zwei Abschnitte', () => {
    const e = rechne([UB, OB, MB]);
    assert.equal(e.abschnitte.length, 2);
    assert.deepEqual(
      e.abschnitte.map((a) => [a.zUnten, a.zOben, a.lichteHoehe, a.untenTeil, a.obenTeil]),
      [
        [19, 990.5, 971.5, 'ub', 'mb'],
        [1009.5, 1981, 971.5, 'mb', 'ob'],
      ],
    );
    assert.equal(e.faecher.length, 2);
    assert.equal(e.faecher[0].lichteBreite, 762);
    assert.equal(e.faecher[0].lichteTiefe, 542);
  });

  test('absolute Position in mm', () => {
    const e = rechne([UB, OB, { ...MB, position: 700 }]);
    assert.equal(teil(e, 'mb').lage.z, 700);
  });

  test('passt sich an geänderte Korpusmaße an (relative Position, Breite, Tiefe)', () => {
    const e = rechne([UB, OB, MB], { hoehe: 2400, breite: 1000, tiefe: 600 });
    const mb = teil(e, 'mb');
    assert.equal(mb.lage.z, 1190.5);
    assert.equal(mb.laenge, 962);
    assert.equal(mb.breite, 582);
  });

  test('Vorderkante (Rücksprung) und Rückwand-Abstand verkürzen die Tiefe', () => {
    const e = rechne([UB, OB, { ...MB, vorderkante: 20, rueckwandAbstand: 10 }]);
    const mb = teil(e, 'mb');
    assert.equal(mb.breite, 512);
    assert.equal(mb.lage.y, 20);
    // Dübel sitzen entlang der tatsächlichen Bodentiefe (Weltkoordinate in der Seite)
    const seite = ops(e, 'seite-links', { art: 'bohrung', quelle: 'mb' });
    assert.equal(seite[0].y, 52);
    assert.equal(seite.at(-1).y, 500);
  });

  test('Zapfen: Boden um 2 × Zapfenlänge länger, Zapfenlöcher in den Seiten', () => {
    const e = rechne([UB, OB, { ...MB, verbindung: 'zapfen' }]);
    const mb = teil(e, 'mb');
    assert.equal(mb.laenge, 786);
    assert.equal(mb.lage.x, 7);
    const loecher = ops(e, 'seite-links', { art: 'tasche', quelle: 'mb' });
    assert.deepEqual(loecher.map((t) => t.y), [40, 194, 348, 502]);
    for (const t of loecher) {
      assert.equal(t.achse, 'y');
      assert.equal(t.laenge, 50);
      assert.equal(t.breite, 6);
      assert.equal(t.tiefe, 13);
      assert.equal(t.x, 1000);
    }
    const zapfen = ops(e, 'mb', { art: 'zapfen', flaeche: 'links' });
    assert.equal(zapfen.length, 4);
    assert.ok(zapfen.every((z) => z.laenge === 12 && z.dicke === 6 && z.breite === 50 && z.x === 0));
  });

  test('eingenutet mit Feder', () => {
    const e = rechne([UB, OB, { ...MB, einbauart: 'eingenutet', verbindung: 'nut_feder', nutbreite: 8, nuttiefe: 10 }]);
    const mb = teil(e, 'mb');
    assert.equal(mb.laenge, 762 + 2 * 9.5);
    const [nut] = ops(e, 'seite-rechts', { art: 'nut', quelle: 'mb' });
    assert.equal(nut.breite, 8);
    assert.equal(nut.tiefe, 10);
    assert.equal(ops(e, 'mb', { art: 'feder' }).length, 2);
  });

  test('durchlaufend ist für den Mittelboden nicht zulässig', () => {
    const e = rechne([UB, OB, { ...MB, einbauart: 'durchlaufend' }]);
    assert.ok(fehlercodes(e).includes('KOMBINATION'));
  });
});
