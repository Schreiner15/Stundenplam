import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  berechneFliesen, berechneBelag, fliesenVorlage, parkettVorlage, FLIESENARTEN, FLIESEN_MUSTER, FLIESEN_OPTIKEN,
  RAUMTYPEN, fugenmoertelJeM2, zahnungFuer,
} from '../src/index.js';
import { flaeche, punktInPolygon, zufall } from '../src/geometrie.js';

const rechne = (fliese, verlegung = {}, raum = {}) => berechneFliesen({
  raum: { laenge: 4000, breite: 3000, raumtyp: 'wohnraum', ...raum }, fliese, verlegung,
});
const codes = (e) => e.pruefungen.map((p) => p.code);
const material = (e, anfang) => e.material.find((m) => m.position.startsWith(anfang));

describe('Fliesen-Katalog', () => {
  test('mindestens 10 Fliesenarten mit gültigen Mustern, Formaten und Optiken', () => {
    assert.ok(Object.keys(FLIESENARTEN).length >= 10);
    for (const [id, a] of Object.entries(FLIESENARTEN)) {
      assert.ok(a.muster.length && a.muster.every((m) => FLIESEN_MUSTER[m]), id);
      assert.ok(a.formate.length && a.formate.every(([l, b]) => l > 0 && b > 0), id);
      assert.ok(FLIESEN_OPTIKEN[a.optik], id);
      assert.ok(a.fuge[0] <= a.fuge[1], id);
      assert.ok(a.gruppe && a.beschreibung, id);
    }
  });

  test('jede bodentaugliche Fliesenart ergibt im Standardformat einen gültigen Plan', () => {
    for (const [id, a] of Object.entries(FLIESENARTEN)) {
      const e = rechne({ art: id }, {}, { laenge: 2000, breite: 1500 });
      if (a.einsatz.includes('boden_innen')) {
        assert.equal(e.gueltig, true, `${id}: ${JSON.stringify(e.pruefungen)}`);
        assert.ok(e.teile.length > 0, id);
      } else {
        assert.ok(codes(e).includes('NICHT_FUER_BODEN'), id);
      }
    }
  });
});

describe('Verlegeplan mit Fugen', () => {
  test('Raster genau passend: nur ganze Fliesen, Fuge 3 mm zwischen den Fliesen', () => {
    // 3 × 603 − 3 = 1806 und 2 × 303 − 3 = 603, plus 2 × 5 mm Randfuge
    const e = rechne({ art: 'feinsteinzeug', laenge: 600, breite: 300 }, { muster: 'kreuzfuge', fugenbreite: 3, randfuge: 5 }, { laenge: 1816, breite: 613 });
    assert.equal(e.bedarf.ganze, 6);
    assert.equal(e.bedarf.zuschnitte, 0);
    const xs = [...new Set(e.teile.map((t) => Math.min(...t.punkte.map((p) => p[0]))))].sort((a, b) => a - b);
    assert.deepEqual(xs, [5, 608, 1211]);
  });

  for (const [muster, art, l, b, drehung] of [
    ['kreuzfuge', 'feinsteinzeug', 600, 600, 0], ['drittelverband', 'feinsteinzeug', 1200, 600, 0],
    ['kreuzfuge', 'feinsteinzeug', 600, 600, 45], ['fischgraet', 'holzoptik', 1200, 200, 0], ['halbverband', 'klinker', 240, 115, 90],
  ]) {
    test(`${muster} ${l}×${b} ${drehung}°: keine Überlappung, Fugenanteil stimmt`, () => {
      const fuge = art === 'klinker' ? 8 : 3;
      const e = rechne({ art, laenge: l, breite: b }, { muster, drehung, fugenbreite: fuge }, { laenge: 3100, breite: 2300 });
      const f = e.flaechen.feld;
      const feld = (f.x1 - f.x0) * (f.y1 - f.y0);
      const fliesen = e.teile.reduce((s, t) => s + flaeche(t.punkte), 0);
      const erwartet = (l * b) / ((l + fuge) * (b + fuge));
      assert.ok(Math.abs(fliesen / feld - erwartet) < 0.012, `Anteil ${fliesen / feld} ≠ ${erwartet}`);
      const rnd = zufall(7);
      for (let i = 0; i < 150; i++) {
        const p = [f.x0 + rnd() * (f.x1 - f.x0), f.y0 + rnd() * (f.y1 - f.y0)];
        assert.ok(e.teile.filter((t) => punktInPolygon(p, t.punkte)).length <= 1, `Überlappung bei ${p}`);
      }
    });
  }
});

describe('Bedarf und Material', () => {
  test('Fugenmörtel nach Formel (A + B) / (A · B) · Fuge · Tiefe · 1,6', () => {
    assert.equal(Math.round(fugenmoertelJeM2(600, 300, 3, 10) * 1000) / 1000, 0.24);
    const e = rechne({ art: 'feinsteinzeug', laenge: 600, breite: 300, staerke: 10 }, { fugenbreite: 3 });
    assert.match(material(e, 'Fugenmörtel').detail, /0,24 kg\/m²/);
  });

  test('Mosaik: Fugenmörtel nach Steingröße statt Mattengröße', () => {
    const e = rechne({ art: 'mosaik' }, {});
    const erwartet = fugenmoertelJeM2(25, 25, 2, 6);
    assert.match(material(e, 'Fugenmörtel').detail, new RegExp(String(Math.round(erwartet * 100) / 100).replace('.', ',')));
  });

  test('Zahnung und Kleber nach Format, Großformat mit Buttering-Floating', () => {
    assert.equal(zahnungFuer(100, 100), 4);
    assert.equal(zahnungFuer(300, 300), 6);
    assert.equal(zahnungFuer(600, 600), 8);
    assert.equal(zahnungFuer(1200, 600), 10);
    assert.match(material(rechne({ art: 'feinsteinzeug', laenge: 600, breite: 600 }), 'Fliesenkleber').detail, /2,8 kg\/m²/);
    assert.match(material(rechne({ art: 'feinsteinzeug', laenge: 1200, breite: 600 }, { muster: 'drittelverband' }), 'Fliesenkleber').detail, /4,6 kg\/m² inkl\. Buttering/);
  });

  test('Kartons: Fliesen nach Richtwert bzw. Plan, auf ganze Kartons gerundet', () => {
    const e = rechne({ art: 'feinsteinzeug', laenge: 600, breite: 600, stueckProKarton: 4 }, { muster: 'kreuzfuge' });
    // Verlegefläche 3,99 × 2,99 = 11,93 m²; +7 % → 12,77 m² → 36 Fliesen à 0,36 m²
    assert.equal(e.flaechen.verlegeflaecheM2, 11.93);
    assert.ok(e.bedarf.fliesen >= 36);
    assert.equal(e.bedarf.kartons, Math.ceil(e.bedarf.fliesen / 4));
  });

  test('Abdichtung nur in Bad und Dusche, Imprägnierung bei Cotto', () => {
    assert.ok(material(rechne({ art: 'feinsteinzeug' }, {}, { raumtyp: 'bad' }), 'Flüssigabdichtung'));
    assert.equal(material(rechne({ art: 'feinsteinzeug' }, {}, { raumtyp: 'kueche' }), 'Flüssigabdichtung'), undefined);
    assert.ok(material(rechne({ art: 'cotto' }), 'Imprägnierung'));
    assert.equal(material(rechne({ art: 'feinsteinzeug' }), 'Imprägnierung'), undefined);
  });

  test('Nivelliersystem ab 60 cm, sonst Fliesenkreuze', () => {
    assert.ok(material(rechne({ art: 'feinsteinzeug', laenge: 600, breite: 600 }), 'Nivelliersystem'));
    assert.ok(material(rechne({ art: 'steinzeug' }), 'Fliesenkreuze'));
  });
});

describe('Prüfungen', () => {
  test('Steingut nicht für Böden', () => {
    assert.ok(codes(rechne({ art: 'steingut' })).includes('NICHT_FUER_BODEN'));
  });

  test('außen: nicht frostsichere Fliesen sind ein Fehler, „abhängig" eine Warnung', () => {
    const zement = rechne({ art: 'zementfliese' }, {}, { raumtyp: 'aussen' });
    assert.ok(codes(zement).includes('NICHT_FROSTSICHER'));
    assert.equal(zement.gueltig, false);
    const stein = rechne({ art: 'naturstein', rutschhemmung: 'R11' }, {}, { raumtyp: 'aussen', laenge: 3500 });
    assert.equal(stein.pruefungen.find((p) => p.code === 'NICHT_FROSTSICHER').schwere, 'warnung');
  });

  test('Rutschhemmung und Abriebklasse unter Empfehlung', () => {
    const e = rechne({ art: 'feinsteinzeug', rutschhemmung: 'R9', abriebklasse: 'I' }, {}, { raumtyp: 'dusche' });
    assert.ok(codes(e).includes('RUTSCHHEMMUNG'));
    assert.ok(codes(e).includes('ABRIEBKLASSE'));
    assert.equal(RAUMTYPEN.dusche.rutsch, 'R11');
  });

  test('Halbverband bei langen Formaten: Überzahn-Warnung', () => {
    assert.ok(codes(rechne({ art: 'feinsteinzeug', laenge: 1200, breite: 300 }, { muster: 'halbverband' })).includes('UEBERZAHN'));
    assert.ok(!codes(rechne({ art: 'feinsteinzeug', laenge: 1200, breite: 300 }, { muster: 'drittelverband' })).includes('UEBERZAHN'));
  });

  test('zu schmale Fuge und unpassendes Muster', () => {
    assert.ok(codes(rechne({ art: 'cotto' }, { fugenbreite: 2 })).includes('FUGE_SCHMAL'));
    assert.ok(codes(rechne({ art: 'zementfliese' }, { muster: 'fischgraet' })).includes('MUSTER_NICHT_PASSEND'));
  });

  test('schmale Randspalte bei Kreuzfuge', () => {
    // Feld 4000 − 10 = 3990: 6 × 603 = 3618 → Rest 372 − 3 … ok; 3700: Feld 3690 = 6 × 603 + 72 → 69 mm Rest
    const e = rechne({ art: 'feinsteinzeug', laenge: 600, breite: 600 }, { muster: 'kreuzfuge' }, { laenge: 3700 });
    assert.ok(codes(e).includes('SCHMALE_RANDSPALTE'));
  });
});

describe('Gemeinsame API', () => {
  test('berechneBelag verteilt nach belag', () => {
    assert.equal(berechneBelag(fliesenVorlage()).belag, 'fliesen');
    assert.ok(berechneBelag(parkettVorlage()).staebe.length > 0);
  });

  test('Fliesen-Vorlage ist gültig, deterministisch und JSON-serialisierbar', () => {
    const a = berechneBelag(fliesenVorlage());
    assert.equal(a.gueltig, true);
    assert.deepEqual(berechneBelag(fliesenVorlage()), a);
    assert.deepEqual(JSON.parse(JSON.stringify(a)), a);
  });
});
