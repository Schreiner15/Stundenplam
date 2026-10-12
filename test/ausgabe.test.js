import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  berechne, erstelleVorlage, normalisiere, zuJSON, ausJSON, stuecklisteAlsCSV, bearbeitungenAlsCSV,
  SCHEMA_VERSION, BodenTyp, Einbauart, Verbindung, ERLAUBT,
} from '../src/index.js';
import { rechne, UB, OB, MB } from './helfer.js';

/** Achse → [Minimum, Maximum] in Teilkoordinaten. */
function grenzen(t) {
  return { x: t.laenge, y: t.breite, z: t.staerke };
}

function pruefePunkt(t, p, wo) {
  const g = grenzen(t);
  for (const a of ['x', 'y', 'z']) {
    assert.ok(p[a] >= -0.05 && p[a] <= g[a] + 0.05, `${t.id} ${wo}: ${a}=${p[a]} außerhalb 0…${g[a]}`);
  }
}

const KONFIGURATIONEN = {
  vorlage: () => berechne(erstelleVorlage()),
  durchlaufend: () => rechne([{ ...UB, einbauart: 'durchlaufend', verbindung: 'exzenter' }, { ...OB, einbauart: 'durchlaufend', verbindung: 'konfirmat' }]),
  gehrung: () => rechne([{ ...UB, einbauart: 'gehrung', verbindung: 'lamello' }, { ...OB, einbauart: 'gehrung', verbindung: 'lamello' }]),
  sockel: () => rechne([{ ...UB, einbauart: 'sockel', verbindung: 'exzenter' }, OB, { ...MB, verbindung: 'zapfen' }]),
  genutet: () => rechne([UB, OB, { ...MB, einbauart: 'eingenutet', verbindung: 'nut_feder', nutbreite: 8 }]),
};

describe('Ausgabe', () => {
  test('Schema-Version und Enums', () => {
    assert.equal(SCHEMA_VERSION, '1.0.0');
    assert.equal(berechne(erstelleVorlage()).schemaVersion, SCHEMA_VERSION);
    assert.equal(Object.keys(BodenTyp).length, 6);
    assert.equal(Object.keys(Einbauart).length, 5);
    assert.equal(Object.keys(Verbindung).length, 7);
    assert.ok(Object.isFrozen(BodenTyp) && Object.isFrozen(ERLAUBT));
  });

  test('Vorlage ist gültig und enthält alle Teile', () => {
    const e = berechne(erstelleVorlage());
    assert.deepEqual(e.pruefungen.filter((p) => p.schwere === 'fehler'), []);
    assert.equal(e.gueltig, true);
    const kategorien = new Set(e.teile.map((t) => t.kategorie));
    for (const k of ['seite', 'boden', 'rueckwand']) assert.ok(kategorien.has(k), k);
  });

  for (const [name, erzeuge] of Object.entries(KONFIGURATIONEN)) {
    test(`CNC: alle Bearbeitungen liegen im Teil (${name})`, () => {
      const e = erzeuge();
      assert.deepEqual(e.pruefungen.filter((p) => p.schwere === 'fehler'), []);
      for (const t of e.teile) {
        for (const b of t.bearbeitungen) {
          assert.equal(b.teil, t.id);
          assert.ok(typeof b.art === 'string' && typeof b.flaeche === 'string');
          if ('x' in b) pruefePunkt(t, b, b.art);
          if (b.von) { pruefePunkt(t, b.von, `${b.art}.von`); pruefePunkt(t, b.bis, `${b.art}.bis`); }
          if ('tiefe' in b) assert.ok(b.tiefe > 0);
        }
      }
      const summe = e.teile.reduce((n, t) => n + t.bearbeitungen.length, 0);
      assert.equal(e.bearbeitungen.length, summe);
    });
  }

  test('Stückliste fasst gleiche Teile zusammen', () => {
    const e = rechne([UB, OB, MB, { id: 'fb', typ: 'fachboden', anzahl: 3 }]);
    const seite = e.stueckliste.find((z) => z.bezeichnung === 'Seite');
    assert.equal(seite.anzahl, 2);
    assert.deepEqual(seite.teile, ['seite-links', 'seite-rechts']);
    const fach = e.stueckliste.find((z) => z.bezeichnung === 'Fachboden');
    assert.equal(fach.anzahl, 3);
    assert.deepEqual(e.stueckliste.map((z) => z.pos), e.stueckliste.map((_, i) => i + 1));
  });

  test('Kantenstärke wird vom Zuschnitt abgezogen', () => {
    const e = rechne([UB, OB, MB], { kantenStaerke: 2 });
    const mb = e.stueckliste.find((z) => z.bezeichnung === 'Mittelboden');
    assert.equal(mb.breite, 542);
    assert.equal(mb.zuschnittBreite, 540);
    assert.equal(mb.zuschnittLaenge, 762);
    assert.deepEqual(mb.kanten, ['vorne']);
    const rw = e.stueckliste.find((z) => z.bezeichnung === 'Rückwand');
    assert.equal(rw.zuschnittBreite, rw.breite);
  });

  test('CSV: Semikolon, Dezimalkomma, Kopfzeile', () => {
    const e = rechne([UB, OB, { ...MB, position: '50%' }]);
    const csv = stuecklisteAlsCSV(e).split('\n');
    assert.equal(csv[0], 'Pos;Bezeichnung;Anzahl;Länge;Breite;Stärke;Zuschnitt Länge;Zuschnitt Breite;Material;Kanten;Teile');
    assert.ok(csv.length >= 5);
    const bearb = bearbeitungenAlsCSV(rechne([{ ...UB, einbauart: 'eingenutet', verbindung: 'nut_feder', position: 50, nutbreite: 6 }, OB]));
    assert.ok(bearb.split('\n')[0].startsWith('Teil;Art;Fläche;'));
    assert.ok(bearb.includes('7,5'), 'Dezimalkomma fehlt');
  });

  test('JSON: verlustfreie Serialisierung', () => {
    const e = berechne(erstelleVorlage());
    assert.deepEqual(JSON.parse(zuJSON(e)), e);
  });

  test('ausJSON liefert normalisierte Eingabe und lehnt Unsinn ab', () => {
    const roh = JSON.stringify({ korpus: { breite: 900, hoehe: 1800, tiefe: 500 }, boeden: [{ typ: 'unterboden' }] });
    const eingabe = ausJSON(roh);
    assert.equal(eingabe.korpus.seitenStaerke, 19);
    assert.equal(eingabe.boeden[0].id, 'unterboden-1');
    assert.equal(eingabe.boeden[0].einbauart, 'zwischen');
    assert.throws(() => ausJSON('{kaputt'), SyntaxError);
    assert.throws(() => ausJSON('[]'), TypeError);
  });

  test('berechne ist deterministisch und verändert die Eingabe nicht', () => {
    const eingabe = erstelleVorlage();
    const kopie = structuredClone(eingabe);
    const a = berechne(eingabe);
    const b = berechne(eingabe);
    assert.deepEqual(a, b);
    assert.deepEqual(eingabe, kopie);
  });

  test('normalisiere füllt Standardwerte je Bodentyp', () => {
    const n = normalisiere({ korpus: { breite: 800, hoehe: 2000, tiefe: 560 }, boeden: [
      { typ: 'festboden', position: 500 }, { typ: 'fachboden' }, { typ: 'schubladenboden' },
    ] });
    assert.equal(n.boeden[0].verbindung, 'exzenter');
    assert.equal(n.boeden[1].verbindung, 'fachbodentraeger');
    assert.equal(n.boeden[1].lochraster, 32);
    assert.equal(n.boeden[1].anzahl, 1);
    assert.equal(n.boeden[2].einbauart, 'eingenutet');
    assert.equal(n.boeden[2].materialstaerke, 8);
    assert.equal(n.korpus.rueckwand.art, 'eingenutet');
  });
});
