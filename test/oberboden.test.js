import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { rechne, teil, ops, fehlercodes, UB, OB } from './helfer.js';

describe('Oberboden', () => {
  test('zwischen den Seiten: oben bündig, Breite 762', () => {
    const e = rechne([UB, OB]);
    const ob = teil(e, 'ob');
    assert.equal(ob.lage.z, 1981);
    assert.equal(ob.laenge, 762);
    assert.equal(ob.breite, 560);
    assert.deepEqual(fehlercodes(e), []);
  });

  test('durchlaufend (liegt auf den Seiten): volle Breite, Seiten um Bodenstärke kürzer', () => {
    const e = rechne([UB, { ...OB, einbauart: 'durchlaufend' }]);
    assert.equal(teil(e, 'ob').laenge, 800);
    assert.equal(teil(e, 'ob').lage.z, 1981);
    assert.equal(teil(e, 'seite-links').laenge, 1981);
    assert.equal(e.korpus.seitenZ0, 0);
    // Bohrungen von unten in den Oberboden, Stirnbohrungen in die Oberkante der Seite
    const boden = ops(e, 'ob', { art: 'bohrung', flaeche: 'unten' });
    assert.equal(boden.length, 10);
    assert.ok(boden.every((b) => b.z === 0 && b.richtung === '+z'));
    const seite = ops(e, 'seite-rechts', { art: 'bohrung', flaeche: 'oben', quelle: 'ob' });
    assert.equal(seite.length, 5);
    assert.ok(seite.every((b) => b.x === 1981 && b.richtung === '-x'));
  });

  test('Ober- und Unterboden durchlaufend: Seitenlänge = H − 2 × Bodenstärke', () => {
    const e = rechne([
      { ...UB, einbauart: 'durchlaufend' },
      { ...OB, einbauart: 'durchlaufend' },
    ]);
    assert.equal(teil(e, 'seite-links').laenge, 1962);
    assert.equal(e.korpus.seitenZ0, 19);
  });

  test('Exzenter: Gehäuse auf der verdeckten Oberseite, Kanal von der Stirn, Bolzen in der Seite', () => {
    const e = rechne([UB, { ...OB, verbindung: 'exzenter' }]);
    const gehaeuse = ops(e, 'ob', { art: 'bohrung', durchmesser: 15 });
    assert.equal(gehaeuse.length, 6); // je Seite 3 Positionen (50, 280, 510)
    const links = gehaeuse.filter((b) => b.x === 34);
    assert.deepEqual(links.map((b) => b.y), [50, 280, 510]);
    assert.ok(gehaeuse.every((b) => b.flaeche === 'oben' && b.z === 19 && b.richtung === '-z' && b.tiefe === 12.5));
    const kanal = ops(e, 'ob', { art: 'bohrung', durchmesser: 8, flaeche: 'links' });
    assert.equal(kanal.length, 3);
    assert.ok(kanal.every((b) => b.x === 0 && b.z === 9.5 && b.tiefe === 34));
    const bolzen = ops(e, 'seite-links', { art: 'bohrung', quelle: 'ob' });
    assert.equal(bolzen.length, 3);
    assert.ok(bolzen.every((b) => b.durchmesser === 5 && b.tiefe === 11 && b.flaeche === 'innen'));
  });

  test('Konfirmat: Durchgangsbohrung von außen durch die Seite, Kernloch im Boden', () => {
    const e = rechne([UB, { ...OB, verbindung: 'konfirmat' }]);
    const seite = ops(e, 'seite-links', { art: 'bohrung', quelle: 'ob' });
    assert.ok(seite.length >= 2);
    for (const b of seite) {
      assert.equal(b.flaeche, 'aussen');
      assert.equal(b.z, 0);
      assert.equal(b.richtung, '+z');
      assert.equal(b.durchmesser, 7);
      assert.equal(b.senkung, 10);
      assert.equal(b.tiefe, 19);
      assert.equal(b.x, 1990.5);
    }
    const kern = ops(e, 'ob', { art: 'bohrung', flaeche: 'links' });
    assert.ok(kern.every((b) => b.durchmesser === 5 && b.tiefe === 33));
  });

  test('Sockel ist für den Oberboden nicht zulässig', () => {
    const e = rechne([UB, { ...OB, einbauart: 'sockel' }]);
    assert.ok(fehlercodes(e).includes('KOMBINATION'));
  });

  test('Rückwandnut im Oberboden auf der Unterseite', () => {
    const e = rechne([UB, OB]);
    const [nut] = ops(e, 'ob', { art: 'nut', quelle: 'rueckwand' });
    assert.equal(nut.flaeche, 'unten');
    assert.equal(nut.von.z, 0);
    assert.equal(nut.richtung, '+z');
  });

  test('Position bei durchlaufend wird ignoriert (Warnung)', () => {
    const e = rechne([UB, { ...OB, einbauart: 'durchlaufend', position: 1500 }]);
    assert.equal(teil(e, 'ob').lage.z, 1981);
    assert.ok(e.pruefungen.some((p) => p.code === 'POSITION_IGNORIERT' && p.schwere === 'warnung'));
  });
});
