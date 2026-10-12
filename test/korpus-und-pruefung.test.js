import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { berechne } from '../src/index.js';
import { rechne, korpus, teil, ops, fehlercodes, pruefung, UB, OB, MB } from './helfer.js';

describe('Korpus, Rückwand und Anpassung', () => {
  test('abgeleitete Korpusmaße', () => {
    const e = rechne([UB, OB]);
    assert.equal(e.korpus.lichteBreite, 762);
    assert.equal(e.korpus.lichteTiefe, 542);
    assert.equal(e.korpus.konstruktionsTiefe, 560);
    assert.equal(e.korpus.seitenLaenge, 2000);
  });

  test('Seiten: Lage und Maße', () => {
    const e = rechne([UB, OB]);
    assert.deepEqual(teil(e, 'seite-links').lage, { x: 0, y: 0, z: 0, dx: 19, dy: 560, dz: 2000 });
    assert.deepEqual(teil(e, 'seite-rechts').lage, { x: 781, y: 0, z: 0, dx: 19, dy: 560, dz: 2000 });
    assert.equal(teil(e, 'seite-links').breite, 560);
  });

  test('eingenutete Rückwand: Teil und Nut in beiden Seiten', () => {
    const e = rechne([UB, OB]);
    const rw = teil(e, 'rueckwand');
    assert.equal(rw.laenge, 777); // 762 + 2 × 8 − 1
    assert.equal(rw.breite, 1977); // (1981 − 19) + 2 × 8 − 1
    assert.equal(rw.staerke, 8);
    for (const seite of ['seite-links', 'seite-rechts']) {
      const [nut] = ops(e, seite, { art: 'nut', quelle: 'rueckwand' });
      assert.deepEqual(nut.von, { x: 11, y: 546, z: 19 });
      assert.deepEqual(nut.bis, { x: 1989, y: 546, z: 19 });
      assert.equal(nut.breite, 8);
      assert.equal(nut.tiefe, 8);
    }
  });

  test('aufgesetzte Rückwand: keine Nuten, Konstruktionstiefe um Rückwandstärke kleiner', () => {
    const e = rechne([UB, OB], { rueckwand: { art: 'aufgesetzt', staerke: 8 } });
    assert.equal(e.korpus.konstruktionsTiefe, 552);
    assert.equal(e.korpus.lichteTiefe, 552);
    assert.equal(teil(e, 'ub').breite, 552);
    assert.equal(teil(e, 'seite-links').breite, 552);
    const rw = teil(e, 'rueckwand');
    assert.equal(rw.laenge, 800);
    assert.equal(rw.breite, 2000);
    assert.equal(rw.lage.y, 552);
    assert.equal(e.bearbeitungen.filter((b) => b.quelle === 'rueckwand').length, 0);
  });

  test('ohne Rückwand', () => {
    const e = rechne([UB, OB, MB], { rueckwand: { art: 'keine' } });
    assert.equal(e.korpus.lichteTiefe, 560);
    assert.equal(teil(e, 'mb').breite, 560);
    assert.equal(e.teile.some((t) => t.id === 'rueckwand'), false);
  });

  test('alle Maße passen sich bei Korpusänderung an (keine gespeicherten Maße)', () => {
    const boeden = [UB, OB, MB, { id: 'fb', typ: 'fachboden', abschnitt: 0, anzahl: 2 }];
    const klein = rechne(boeden, { breite: 600, hoehe: 1200, tiefe: 400 });
    const gross = rechne(boeden, { breite: 1000, hoehe: 2400, tiefe: 600 });
    for (const id of ['ub', 'ob', 'mb', 'fb-1', 'fb-2']) {
      assert.ok(teil(gross, id).laenge - teil(klein, id).laenge === 400, `${id}: Breite passt sich nicht an`);
      assert.ok(teil(gross, id).breite - teil(klein, id).breite === 200, `${id}: Tiefe passt sich nicht an`);
    }
    assert.ok(teil(gross, 'ob').lage.z - teil(klein, 'ob').lage.z === 1200);
    assert.deepEqual(fehlercodes(klein), []);
    assert.deepEqual(fehlercodes(gross), []);
  });
});

describe('Prüfungen', () => {
  test('Restwand: Dübelbohrung zu tief für 16-mm-Seite', () => {
    const e = rechne([{ ...UB, verbindungsParameter: { duebel: { tiefeFlaeche: 14 } } }, OB], { seitenStaerke: 16 });
    const p = pruefung(e, 'RESTWAND');
    assert.ok(p.length >= 1);
    assert.equal(p[0].schwere, 'fehler');
  });

  test('Restwand: Nut zu tief', () => {
    const e = rechne([UB, OB, { ...MB, einbauart: 'eingenutet', verbindung: 'nut_feder', nuttiefe: 17 }]);
    assert.ok(fehlercodes(e).includes('RESTWAND'));
  });

  test('mehrere Unterböden', () => {
    const e = rechne([UB, { id: 'ub2', typ: 'unterboden' }, OB]);
    assert.ok(fehlercodes(e).includes('MEHRFACH'));
  });

  test('doppelte IDs', () => {
    const e = rechne([UB, OB, { id: 'ub', typ: 'mittelboden' }]);
    assert.ok(fehlercodes(e).includes('ID_DOPPELT'));
  });

  test('Unterboden zu kurz für die Rückwandnut', () => {
    const e = rechne([{ ...UB, rueckwandAbstand: 30 }, OB]);
    assert.ok(fehlercodes(e).includes('RUECKWANDNUT'));
  });

  test('ungültige Maße (Rücksprung größer als Tiefe)', () => {
    const e = rechne([UB, OB, { ...MB, vorderkante: 600 }]);
    assert.ok(fehlercodes(e).includes('MASS_UNGUELTIG'));
  });

  test('Nut breiter als Boden → Warnung', () => {
    const e = rechne([UB, OB, { ...MB, einbauart: 'eingenutet', verbindung: 'nut_feder', nutbreite: 22 }]);
    assert.equal(pruefung(e, 'NUTBREITE')[0].schwere, 'warnung');
  });

  test('gueltig ist false bei Fehlern, true bei nur Warnungen', () => {
    assert.equal(rechne([UB, OB, { ...MB, position: 1990 }]).gueltig, false);
    const nurWarnung = rechne([UB, OB, { id: 'fb', typ: 'fachboden' }], { breite: 1000 });
    assert.ok(nurWarnung.pruefungen.length > 0);
    assert.equal(nurWarnung.gueltig, true);
  });

  test('technisch kaputte Eingabe wirft TypeError', () => {
    assert.throws(() => berechne(null), TypeError);
    assert.throws(() => berechne({ korpus: korpus() }), TypeError);
    assert.throws(() => berechne({ korpus: { ...korpus(), breite: 'abc' }, boeden: [] }), TypeError);
  });

  test('unbekannter Bodentyp wird als Fehler gemeldet', () => {
    const e = rechne([UB, OB, { id: 'x', typ: 'deckel' }]);
    assert.ok(fehlercodes(e).includes('KOMBINATION'));
  });
});
