import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { rechne, teil, hatTeil, ops, fehlercodes, UB, OB } from './helfer.js';

describe('Unterboden', () => {
  test('zwischen den Seiten: Breite = Korpusbreite − 2 × Seitenstärke, volle Konstruktionstiefe', () => {
    const e = rechne([UB, OB]);
    const ub = teil(e, 'ub');
    assert.equal(ub.laenge, 762);
    assert.equal(ub.breite, 560);
    assert.equal(ub.staerke, 19);
    assert.deepEqual(ub.lage, { x: 19, y: 0, z: 0, dx: 762, dy: 560, dz: 19 });
    assert.equal(teil(e, 'seite-links').laenge, 2000);
    assert.equal(e.korpus.seitenZ0, 0);
    assert.deepEqual(fehlercodes(e), []);
  });

  test('zwischen + Dübel: Flächenbohrungen in der Seite, Stirnbohrungen im Boden', () => {
    const e = rechne([UB, OB]);
    const seite = ops(e, 'seite-links', { art: 'bohrung', quelle: 'ub' });
    assert.deepEqual(seite.map((b) => b.y), [32, 156, 280, 404, 528]);
    for (const b of seite) {
      assert.equal(b.flaeche, 'innen');
      assert.equal(b.x, 9.5); // Bodenmitte in Seitenkoordinaten
      assert.equal(b.z, 19);
      assert.equal(b.richtung, '-z');
      assert.equal(b.durchmesser, 8);
      assert.equal(b.tiefe, 12);
    }
    const links = ops(e, 'ub', { art: 'bohrung', flaeche: 'links' });
    const rechts = ops(e, 'ub', { art: 'bohrung', flaeche: 'rechts' });
    assert.equal(links.length, 5);
    assert.equal(rechts.length, 5);
    assert.deepEqual(
      { x: links[0].x, y: links[0].y, z: links[0].z, r: links[0].richtung, t: links[0].tiefe },
      { x: 0, y: 32, z: 9.5, r: '+x', t: 25 },
    );
    assert.equal(rechts[0].x, 762);
    assert.equal(rechts[0].richtung, '-x');
  });

  test('durchlaufend: Boden volle Breite, Seiten stehen auf dem Boden (kürzer), Bohrbild vertauscht', () => {
    const e = rechne([{ ...UB, einbauart: 'durchlaufend' }, OB]);
    const ub = teil(e, 'ub');
    assert.equal(ub.laenge, 800);
    assert.equal(ub.lage.x, 0);
    assert.equal(e.korpus.seitenZ0, 19);
    assert.equal(teil(e, 'seite-links').laenge, 1981);
    assert.equal(teil(e, 'seite-links').lage.z, 19);

    // Flächenteil ist jetzt der Boden (Fläche oben), Stirnteil die Seite (Kante unten)
    const boden = ops(e, 'ub', { art: 'bohrung', flaeche: 'oben' });
    assert.equal(boden.length, 10);
    assert.deepEqual([...new Set(boden.map((b) => b.x))].sort((a, b) => a - b), [9.5, 790.5]);
    assert.ok(boden.every((b) => b.richtung === '-z' && b.tiefe === 12));
    const seite = ops(e, 'seite-links', { art: 'bohrung', flaeche: 'unten', quelle: 'ub' });
    assert.equal(seite.length, 5);
    assert.ok(seite.every((b) => b.x === 0 && b.z === 9.5 && b.richtung === '+x' && b.tiefe === 25));
  });

  test('eingenutet (Nut/Feder): Zugabe 2 × (Nuttiefe − Luft), Nut in der Seite', () => {
    const e = rechne([{ ...UB, einbauart: 'eingenutet', verbindung: 'nut_feder', position: 50 }, OB]);
    const ub = teil(e, 'ub');
    assert.equal(ub.laenge, 762 + 2 * 7.5);
    assert.equal(ub.lage.x, 11.5);
    assert.equal(ub.lage.z, 50);
    const [nut] = ops(e, 'seite-links', { art: 'nut', quelle: 'ub' });
    assert.ok(nut, 'Nut in Seite fehlt');
    assert.equal(nut.flaeche, 'innen');
    assert.deepEqual(nut.von, { x: 59.5, y: 0, z: 19 });
    assert.deepEqual(nut.bis, { x: 59.5, y: 560, z: 19 });
    assert.equal(nut.breite, 19);
    assert.equal(nut.tiefe, 8);
    // Volleinnutung (Nutbreite = Bodenstärke) → keine Feder
    assert.equal(ops(e, 'ub', { art: 'feder' }).length, 0);
  });

  test('eingenutet auf Seitenunterkante wird als Falz ausgegeben', () => {
    const e = rechne([{ ...UB, einbauart: 'eingenutet', verbindung: 'nut_feder' }, OB]);
    assert.equal(ops(e, 'seite-links', { art: 'falz', quelle: 'ub' }).length, 1);
    assert.equal(ops(e, 'seite-links', { art: 'nut', quelle: 'ub' }).length, 0);
  });

  test('eingenutet mit schmaler Nut: Feder an beiden Stirnseiten', () => {
    const e = rechne([{ ...UB, einbauart: 'eingenutet', verbindung: 'nut_feder', position: 50, nutbreite: 6 }, OB]);
    const federn = ops(e, 'ub', { art: 'feder' });
    assert.deepEqual(federn.map((f) => f.flaeche).sort(), ['links', 'rechts']);
    assert.equal(federn[0].laenge, 7.5);
    assert.equal(federn[0].dicke, 6);
    assert.equal(federn[0].versatz, 6.5);
  });

  test('Gehrung (Lamello): volle Breite, 45°-Schnitte an Boden und Seiten', () => {
    const e = rechne([{ ...UB, einbauart: 'gehrung', verbindung: 'lamello' }, OB]);
    const ub = teil(e, 'ub');
    assert.equal(ub.laenge, 800);
    assert.equal(teil(e, 'seite-links').laenge, 2000);
    const gehrungen = ops(e, 'ub', { art: 'gehrung' });
    assert.deepEqual(gehrungen.map((g) => g.flaeche).sort(), ['links', 'rechts']);
    assert.ok(gehrungen.every((g) => g.winkel === 45));
    assert.equal(ops(e, 'seite-links', { art: 'gehrung', flaeche: 'unten' }).length, 1);
    assert.ok(ops(e, 'ub', { art: 'schlitz', flaeche: 'links' }).length >= 2);
    assert.ok(ops(e, 'seite-rechts', { art: 'schlitz', flaeche: 'unten' }).length >= 2);
  });

  test('mit Sockel: Boden auf Sockelhöhe, zurückgesetzte Sockelblende', () => {
    const e = rechne([{ ...UB, einbauart: 'sockel' }, OB], { sockel: { hoehe: 100, ruecksprung: 50 } });
    const ub = teil(e, 'ub');
    assert.equal(ub.lage.z, 100);
    assert.equal(ub.laenge, 762);
    assert.equal(teil(e, 'seite-links').laenge, 2000);
    const blende = teil(e, 'sockelblende');
    assert.equal(blende.laenge, 762);
    assert.equal(blende.breite, 100);
    assert.equal(blende.lage.y, 50);
    assert.equal(blende.lage.z, 0);
    // Sockelblende ist mit den Seiten verbunden
    assert.ok(ops(e, 'seite-links', { quelle: 'sockelblende' }).length >= 1);
    // erster Abschnitt beginnt auf der Oberseite des Unterbodens
    assert.equal(e.abschnitte[0].zUnten, 119);
  });

  test('Rückwandnut im Unterboden (Oberseite, über volle Bodenlänge)', () => {
    const e = rechne([UB, OB]);
    const [nut] = ops(e, 'ub', { art: 'nut', quelle: 'rueckwand' });
    assert.ok(nut, 'Rückwandnut fehlt');
    assert.equal(nut.flaeche, 'oben');
    assert.deepEqual(nut.von, { x: 0, y: 546, z: 19 });
    assert.deepEqual(nut.bis, { x: 762, y: 546, z: 19 });
    assert.equal(nut.breite, 8);
    assert.equal(nut.tiefe, 8);
  });

  test('ungültige Kombination (Gehrung + Dübel) wird abgelehnt', () => {
    const e = rechne([{ ...UB, einbauart: 'gehrung', verbindung: 'duebel' }, OB]);
    assert.ok(fehlercodes(e).includes('KOMBINATION'));
    assert.equal(hatTeil(e, 'ub'), false);
    assert.equal(e.gueltig, false);
  });
});
