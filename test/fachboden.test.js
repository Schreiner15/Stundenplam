import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { rechne, teil, ops, fehlercodes, pruefung, UB, OB, MB } from './helfer.js';

const FACH = { id: 'fb', typ: 'fachboden' };

/** Lochmitte der Reihe unter einem Fachboden (Unterseite − Trägerhöhe 4). */
const lochUnter = (t) => t.lage.z - 4;

describe('Fachboden (Einlegeboden)', () => {
  test('ein Fachboden: Breite mit Seitenluft, auf das Raster gerundet', () => {
    const e = rechne([UB, OB, { ...FACH, anzahl: 1 }]);
    const fb = teil(e, 'fb-1');
    assert.equal(fb.laenge, 760);
    assert.equal(fb.lage.x, 20);
    assert.equal(fb.breite, 542);
    // ideal 990.5 → Loch 986.5 → nächste Reihe 51 + 29 × 32 = 979 → Unterseite 983
    assert.equal(fb.lage.z, 983);
    assert.deepEqual(fehlercodes(e), []);
  });

  test('drei Fachböden gleichmäßig verteilt, alle auf dem 32-mm-Raster', () => {
    const e = rechne([UB, OB, { ...FACH, anzahl: 3 }]);
    const zs = ['fb-1', 'fb-2', 'fb-3'].map((id) => teil(e, id).lage.z);
    assert.deepEqual(zs, [503, 983, 1495]);
    for (const id of ['fb-1', 'fb-2', 'fb-3']) {
      assert.equal((lochUnter(teil(e, id)) - 51) % 32, 0, `${id} liegt nicht auf dem Raster`);
    }
    assert.equal(e.faecher.length, 4);
    const hoehen = e.faecher.map((f) => f.lichteHoehe);
    assert.deepEqual(hoehen, [484, 461, 493, 467]);
    const mittel = hoehen.reduce((a, b) => a + b) / hoehen.length;
    assert.ok(hoehen.every((h) => Math.abs(h - mittel) <= 32), 'Fächer sind nicht gleichmäßig');
  });

  test('Lochreihen Ø5 in beiden Seiten: vordere Reihe 37 mm, hintere auf dem 32er-Raster', () => {
    const e = rechne([UB, OB, { ...FACH, anzahl: 1 }]);
    for (const seite of ['seite-links', 'seite-rechts']) {
      const loecher = ops(e, seite, { art: 'bohrung', quelle: 'fb' });
      assert.equal(loecher.length, 120); // 60 Reihen × 2 Spalten
      assert.deepEqual([...new Set(loecher.map((l) => l.y))].sort((a, b) => a - b), [37, 485]);
      assert.ok(loecher.every((l) => l.durchmesser === 5 && l.tiefe === 12 && l.flaeche === 'innen' && l.richtung === '-z'));
      const reihen = [...new Set(loecher.map((l) => l.x))].sort((a, b) => a - b);
      assert.equal(reihen[0], 51);
      assert.equal(reihen.at(-1), 1939);
      assert.ok(reihen.every((x, i) => i === 0 || x - reihen[i - 1] === 32));
    }
  });

  test('Lochrasterabstand ist einstellbar', () => {
    const e = rechne([UB, OB, { ...FACH, anzahl: 1, lochraster: 25 }]);
    const reihen = [...new Set(ops(e, 'seite-links', { quelle: 'fb' }).map((l) => l.x))].sort((a, b) => a - b);
    assert.equal(reihen[1] - reihen[0], 25);
  });

  test('Fachböden im oberen Abschnitt über einem Mittelboden', () => {
    const e = rechne([UB, OB, MB, { ...FACH, abschnitt: 1, anzahl: 2 }]);
    const unten = teil(e, 'fb-1').lage.z;
    assert.ok(unten > 1009.5, 'Fachboden muss über dem Mittelboden liegen');
    assert.equal(e.faecher.length, 4); // 1 Fach unten + 3 Fächer oben
    const reihen = ops(e, 'seite-links', { quelle: 'fb' }).map((l) => l.x);
    assert.ok(Math.min(...reihen) >= 1009.5 + 32);
  });

  test('nicht vorhandener Abschnitt', () => {
    const e = rechne([UB, OB, { ...FACH, abschnitt: 5 }]);
    assert.ok(fehlercodes(e).includes('ABSCHNITT'));
  });

  test('zwei Fachboden-Einträge im selben Abschnitt sind nicht erlaubt', () => {
    const e = rechne([UB, OB, { ...FACH, anzahl: 1 }, { id: 'fb2', typ: 'fachboden', anzahl: 1 }]);
    assert.ok(fehlercodes(e).includes('ABSCHNITT'));
  });

  test('zu viele Fachböden für das Raster', () => {
    const e = rechne([UB, OB, { ...FACH, anzahl: 10 }], { hoehe: 300 });
    assert.ok(fehlercodes(e).includes('RASTER'));
  });

  test('Durchbiegungswarnung bei großer Spannweite', () => {
    assert.equal(pruefung(rechne([UB, OB, FACH]), 'DURCHBIEGUNG').length, 0);
    const breit = rechne([UB, OB, FACH], { breite: 1000 });
    const [w] = pruefung(breit, 'DURCHBIEGUNG');
    assert.equal(w.schwere, 'warnung');
    assert.equal(w.teil, 'fb-1');
  });

  test('Warnung, wenn der Boden nicht auf der vorderen Lochreihe aufliegt', () => {
    const e = rechne([UB, OB, { ...FACH, vorderkante: 50 }]);
    assert.ok(pruefung(e, 'TRAEGER_AUFLAGE').length >= 1);
  });

  test('nur Fachbodenträger als Verbindung zulässig', () => {
    const e = rechne([UB, OB, { ...FACH, verbindung: 'duebel' }]);
    assert.ok(fehlercodes(e).includes('KOMBINATION'));
  });

  test('passt sich der Korpushöhe an und bleibt auf dem Raster', () => {
    const e = rechne([UB, OB, { ...FACH, anzahl: 3 }], { hoehe: 2400 });
    const zs = ['fb-1', 'fb-2', 'fb-3'].map((id) => teil(e, id).lage.z);
    assert.ok(zs[0] < zs[1] && zs[1] < zs[2]);
    for (const z of zs) assert.equal((z - 4 - 51) % 32, 0);
    assert.ok(zs[2] > 1495, 'Fachböden müssen sich mit dem Korpus verschieben');
  });
});
