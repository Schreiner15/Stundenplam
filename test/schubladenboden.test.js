import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { rechne, teil, ops, fehlercodes, UB, OB, MB } from './helfer.js';

const SB = { id: 'sk', typ: 'schubladenboden', abschnitt: 0, position: 5 };

describe('Schubladenboden', () => {
  test('Boden in Zargen eingenutet: Maße aus lichter Breite, Führungsluft und Zargenstärke', () => {
    const e = rechne([UB, OB, MB, SB]);
    const sb = teil(e, 'sk');
    // Schubkasten außen 762 − 2 × 12,5 = 737, innen 737 − 2 × 16 = 705, Boden 705 + 2 × 7,5 = 720
    assert.equal(sb.laenge, 720);
    // Länge automatisch 500 (größte Normlänge ≤ 542), Boden 500 − 32 + 15 = 483
    assert.equal(sb.breite, 483);
    assert.equal(sb.staerke, 8);
    assert.deepEqual(sb.lage, { x: 40, y: 8.5, z: 34, dx: 720, dy: 483, dz: 8 });
    assert.deepEqual(fehlercodes(e), []);
  });

  test('Zargen werden als Teile mit Bodennut ausgegeben', () => {
    const e = rechne([UB, OB, MB, SB]);
    const seitenzarge = teil(e, 'sk-zarge-links');
    assert.equal(seitenzarge.laenge, 500);
    assert.equal(seitenzarge.breite, 120);
    assert.equal(seitenzarge.staerke, 16);
    assert.equal(teil(e, 'sk-zarge-vorne').laenge, 705);
    assert.equal(teil(e, 'sk-zarge-hinten').laenge, 705);
    for (const id of ['sk-zarge-links', 'sk-zarge-rechts', 'sk-zarge-vorne', 'sk-zarge-hinten']) {
      const [nut] = ops(e, id, { art: 'nut' });
      assert.ok(nut, `Bodennut in ${id} fehlt`);
      assert.equal(nut.flaeche, 'innen');
      assert.equal(nut.von.y, 14); // Nutabstand 10 + halbe Bodenstärke
      assert.equal(nut.breite, 8);
      assert.equal(nut.tiefe, 8);
    }
  });

  test('teilt den Korpus nicht (Abschnitte bleiben gleich)', () => {
    const ohne = rechne([UB, OB, MB]);
    const mit = rechne([UB, OB, MB, SB]);
    assert.deepEqual(mit.abschnitte, ohne.abschnitte);
    assert.deepEqual(mit.faecher, ohne.faecher);
  });

  test('Schubkasten zu hoch für den Abschnitt', () => {
    const e = rechne([UB, OB, MB, { ...SB, schublade: { hoehe: 2000 } }]);
    assert.ok(fehlercodes(e).includes('SCHUBLADE_HOEHE'));
  });

  test('Schubkasten zu lang für die lichte Tiefe', () => {
    const e = rechne([UB, OB, MB, { ...SB, schublade: { laenge: 600 } }]);
    assert.ok(fehlercodes(e).includes('SCHUBLADE_TIEFE'));
  });

  test('Kollision mit Fachböden im selben Abschnitt', () => {
    const e = rechne([UB, OB, MB, { ...SB, schublade: { hoehe: 800 } }, { id: 'fb', typ: 'fachboden', abschnitt: 0 }]);
    assert.ok(fehlercodes(e).includes('UEBERLAPPUNG'));
  });

  test('passt sich der Korpusbreite an', () => {
    const e = rechne([UB, OB, MB, SB], { breite: 600 });
    assert.equal(teil(e, 'sk').laenge, 520);
  });

  test('nur eingenutet mit Nut/Feder zulässig', () => {
    const e = rechne([UB, OB, MB, { ...SB, einbauart: 'zwischen', verbindung: 'duebel' }]);
    assert.ok(fehlercodes(e).includes('KOMBINATION'));
  });
});
