import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  berechneParkett, parkettVorlage, PARKETTARTEN, MUSTER, VERLEGEARTEN, empfohlenerRandabstand,
} from '../src/index.js';
import { flaeche, punktInPolygon, zufall } from '../src/geometrie.js';

const raum = (laenge = 5000, breite = 4000, extra = {}) => ({ laenge, breite, ...extra });
const rechne = (parkett, verlegung = {}, r = raum()) => berechneParkett({ raum: r, parkett, verlegung });
const codes = (e) => e.pruefungen.map((p) => p.code);

describe('Katalog', () => {
  test('jede Parkettart verweist nur auf vorhandene Muster und Verlegearten', () => {
    assert.ok(Object.keys(PARKETTARTEN).length >= 10);
    for (const [id, a] of Object.entries(PARKETTARTEN)) {
      assert.ok(a.muster.length && a.muster.every((m) => MUSTER[m]), id);
      assert.ok(a.verlegung.length && a.verlegung.every((v) => VERLEGEARTEN[v]), id);
      for (const m of ['laenge', 'breite', 'staerke']) {
        const [min, max] = a.bereich[m];
        assert.ok(min <= a.masse[m] && a.masse[m] <= max, `${id}.${m} Standardmaß außerhalb des Bereichs`);
      }
    }
  });

  test('jede Parkettart im Standardformat ergibt einen gültigen Plan', () => {
    for (const [id, a] of Object.entries(PARKETTARTEN)) {
      const e = rechne({ art: id }, { muster: a.muster[0], art: a.verlegung[0] }, raum(2000, 1500));
      assert.equal(e.gueltig, true, `${id}: ${JSON.stringify(e.pruefungen)}`);
      assert.ok(e.staebe.length > 0, id);
    }
  });
});

describe('Verlegemuster überdecken die Fläche lückenlos und ohne Überlappung', () => {
  const faelle = [
    ['englisch', 'landhausdiele', 0], ['drittel', 'landhausdiele', 90], ['wild', 'landhausdiele', 0],
    ['englisch', 'stabparkett', 45], ['fischgraet', 'fischgraetparkett', 0], ['fischgraet', 'stabparkett', 90],
    ['chevron', 'chevronparkett', 0], ['wuerfel', 'mosaikparkett', 0], ['tafel', 'tafelparkett', 0],
  ];
  for (const [muster, art, drehung] of faelle) {
    test(`${muster} (${art}, ${drehung}°)`, () => {
      const e = rechne({ art }, { muster, drehung, art: PARKETTARTEN[art].verlegung[0] }, raum(2600, 1900));
      const f = e.flaechen.feld;
      const soll = (f.x1 - f.x0) * (f.y1 - f.y0);
      const summe = e.staebe.reduce((s, x) => s + flaeche(x.punkte), 0);
      assert.ok(Math.abs(summe - soll) / soll < 0.002, `Fläche ${summe} ≠ ${soll}`);
      // Stichprobe: jeder Punkt liegt in genau einem Stab
      const rnd = zufall(42);
      for (let i = 0; i < 150; i++) {
        const p = [f.x0 + 1 + rnd() * (f.x1 - f.x0 - 2), f.y0 + 1 + rnd() * (f.y1 - f.y0 - 2)];
        const treffer = e.staebe.filter((s) => punktInPolygon(p, s.punkte)).length;
        assert.ok(treffer <= 1, `Punkt ${p} liegt in ${treffer} Stäben (Überlappung)`);
        assert.ok(treffer >= 1 || randnah(p, e.staebe), `Punkt ${p} liegt in keinem Stab (Lücke)`);
      }
    });
  }
});

/** Punkte direkt auf einer Stabkante zählen nicht als Lücke. */
function randnah([x, y], staebe) {
  return staebe.some((s) => punktInPolygon([x + 0.01, y + 0.01], s.punkte) || punktInPolygon([x - 0.01, y - 0.01], s.punkte));
}

describe('Verband', () => {
  test('Englischer Verband: Stoß um eine halbe Stablänge versetzt', () => {
    const e = rechne({ art: 'landhausdiele', laenge: 1000, breite: 200 }, { muster: 'englisch', art: 'schwimmend', randabstand: 0 }, raum(3000, 400));
    const stoesse = (y) => e.staebe.filter((s) => s.punkte.every(([, py]) => py >= y && py <= y + 200))
      .map((s) => Math.min(...s.punkte.map(([px]) => px))).filter((x) => x > 0).sort((a, b) => a - b);
    const r0 = stoesse(0);
    const r1 = stoesse(200);
    assert.ok(r0.length && r1.length);
    const d = Math.abs(r0[0] - r1[0]) % 1000;
    assert.equal(Math.min(d, 1000 - d), 500);
  });

  test('Wilder Verband: deterministisch je Startwert, anderer Startwert anderes Bild', () => {
    const p = { art: 'landhausdiele' };
    const a = rechne(p, { muster: 'wild', startwert: 3 });
    const b = rechne(p, { muster: 'wild', startwert: 3 });
    const c = rechne(p, { muster: 'wild', startwert: 4 });
    assert.deepEqual(a.staebe, b.staebe);
    assert.notDeepEqual(a.staebe, c.staebe);
  });

  test('schmale letzte Reihe wird gemeldet', () => {
    // 3840 − 2 × 10 = 3820 = 20 × 190 + 20 mm Rest
    const e = rechne({ art: 'landhausdiele' }, { muster: 'englisch', art: 'verklebt' }, raum(5000, 3840));
    assert.ok(codes(e).includes('SCHMALE_RANDREIHE'));
  });
});

describe('Flächen und Bedarf', () => {
  test('Verlegefläche = Raum minus Randabstand', () => {
    const e = rechne({ art: 'landhausdiele' }, { art: 'verklebt' });
    assert.equal(e.flaechen.randabstand, 10);
    assert.equal(e.flaechen.raumM2, 20);
    assert.equal(e.flaechen.verlegeflaecheM2, 19.82); // 4,98 × 3,98
  });

  test('Bedarf mit Verschnitt-Richtwert, auf ganze Pakete gerundet', () => {
    const e = rechne({ art: 'landhausdiele', paketInhalt: 2.5 }, { muster: 'drittel', art: 'verklebt' });
    assert.equal(e.verschnitt.richtwertProzent, 6);
    assert.equal(e.bedarf.bedarfM2, 21.01); // 19,8204 × 1,06
    assert.equal(e.bedarf.pakete, 9);
    assert.equal(e.bedarf.bestellM2, 22.5);
  });

  test('Fischgrät hat mehr Verschnitt als Verband, diagonal kommt ein Zuschlag dazu', () => {
    const fisch = rechne({ art: 'stabparkett' }, { muster: 'fischgraet' });
    const verband = rechne({ art: 'stabparkett' }, { muster: 'englisch' });
    const diagonal = rechne({ art: 'stabparkett' }, { muster: 'englisch', drehung: 45 });
    assert.ok(fisch.verschnitt.richtwertProzent > verband.verschnitt.richtwertProzent);
    assert.equal(diagonal.verschnitt.richtwertProzent, verband.verschnitt.richtwertProzent + 5);
    assert.ok(diagonal.bedarf.zuschnitte > verband.bedarf.zuschnitte);
  });

  test('ganze Stäbe und Zuschnitte', () => {
    // 2020 × 420 mit 10 mm Rand → Feld 2000 × 400 = genau 2 × 2 Stäbe 1000 × 200 bei ½-Versatz
    const e = rechne({ art: 'landhausdiele', laenge: 1000, breite: 200 }, { muster: 'englisch', art: 'verklebt' }, raum(2020, 420));
    assert.equal(e.bedarf.ganzeStaebe, 3);
    assert.equal(e.bedarf.zuschnitte, 2);
  });

  test('Aussparung verringert die Fläche, Stäbe darin entfallen', () => {
    const ohne = rechne({ art: 'stabparkett' }, { art: 'verklebt' });
    const mit = rechne({ art: 'stabparkett' }, { art: 'verklebt' }, raum(5000, 4000, { aussparungen: [{ x: 1000, y: 1000, laenge: 1000, breite: 1000 }] }));
    assert.equal(mit.flaechen.aussparungenM2, 1);
    assert.equal(mit.flaechen.verlegeflaecheM2, r2(19.8204 - 1.02 * 1.02));
    // kein Stab liegt vollständig innerhalb der Aussparung (inkl. Randabstand)
    const innen = (s) => s.punkte.every(([x, y]) => x >= 990 && x <= 2010 && y >= 990 && y <= 2010);
    assert.equal(mit.staebe.filter(innen).length, 0);
    assert.ok(ohne.staebe.filter(innen).length > 0);
  });

  test('Material: schwimmend mit Dämmung, verklebt mit Klebstoff, unbehandelt mit Oberflächenbehandlung', () => {
    const pos = (e) => e.material.map((m) => m.position);
    assert.ok(pos(rechne({ art: 'landhausdiele' }, { art: 'schwimmend' })).includes('Trittschalldämmung'));
    assert.ok(pos(rechne({ art: 'landhausdiele' }, { art: 'verklebt' })).includes('Parkettklebstoff'));
    const stab = pos(rechne({ art: 'stabparkett' }, { art: 'verklebt' }));
    assert.ok(stab.some((p) => p.startsWith('Oberflächenbehandlung')));
    assert.ok(!pos(rechne({ art: 'landhausdiele' }, { art: 'verklebt' })).some((p) => p.startsWith('Oberflächenbehandlung')));
  });

  test('Sockelleisten: Umfang minus Türen plus 5 %', () => {
    const e = rechne({ art: 'landhausdiele' }, {}, raum(5000, 4000, { tueren: [{ breite: 1000 }] }));
    const leiste = e.material.find((m) => m.position === 'Sockelleiste');
    assert.equal(leiste.menge, Math.ceil((17 * 1.05) / 2.4)); // 18 m − 1 m Tür
  });

  test('Kosten aus Bestellfläche × Preis', () => {
    const e = rechne({ art: 'landhausdiele', paketInhalt: 2.5, preisProM2: 50 }, { muster: 'drittel', art: 'verklebt' });
    assert.equal(e.bedarf.kosten, 1125);
  });
});

describe('Prüfungen', () => {
  test('Muster passt nicht zur Parkettart', () => {
    assert.ok(codes(rechne({ art: 'mosaikparkett' }, { muster: 'fischgraet' })).includes('MUSTER_NICHT_PASSEND'));
  });

  test('Verlegeart passt nicht zur Parkettart', () => {
    const e = rechne({ art: 'lamparkett' }, { art: 'schwimmend' });
    assert.ok(codes(e).includes('VERLEGEART_NICHT_PASSEND'));
    assert.equal(e.gueltig, false);
  });

  test('Randabstand: automatisch 1,5 mm je m bei schwimmend, Warnung wenn zu klein', () => {
    assert.equal(empfohlenerRandabstand('schwimmend', 6000, 4000), 10);
    assert.equal(empfohlenerRandabstand('schwimmend', 12000, 4000), 18);
    assert.equal(empfohlenerRandabstand('verklebt', 12000, 4000), 10);
    assert.equal(rechne({ art: 'landhausdiele' }, { art: 'schwimmend' }, raum(12000, 4000)).flaechen.randabstand, 18);
    assert.ok(codes(rechne({ art: 'landhausdiele' }, { art: 'schwimmend', randabstand: 5 })).includes('RANDABSTAND_KLEIN'));
  });

  test('Bewegungsfuge bei schwimmender Verlegung über 10 m', () => {
    assert.ok(codes(rechne({ art: 'landhausdiele' }, { art: 'schwimmend' }, raum(12000, 4000))).includes('BEWEGUNGSFUGE'));
    assert.ok(!codes(rechne({ art: 'landhausdiele' }, { art: 'verklebt' }, raum(12000, 4000))).includes('BEWEGUNGSFUGE'));
  });

  test('unübliche Maße sind eine Warnung, kein Fehler', () => {
    const e = rechne({ art: 'landhausdiele', staerke: 40 }, {});
    assert.ok(codes(e).includes('MASS_UNUEBLICH'));
    assert.equal(e.gueltig, true);
  });

  test('Aussparung außerhalb des Raums', () => {
    const e = rechne({ art: 'landhausdiele' }, {}, raum(5000, 4000, { aussparungen: [{ x: 4800, y: 0, laenge: 500, breite: 500 }] }));
    assert.ok(codes(e).includes('AUSSPARUNG_AUSSERHALB'));
  });

  test('kaputte Eingabe wirft TypeError', () => {
    assert.throws(() => berechneParkett(null), TypeError);
    assert.throws(() => rechne({ art: 'landhausdiele', laenge: -5 }), TypeError);
    assert.throws(() => rechne({ art: 'landhausdiele' }, { randabstand: 3000 }), TypeError);
  });

  test('Vorlage ist gültig und JSON-serialisierbar', () => {
    const e = berechneParkett(parkettVorlage());
    assert.equal(e.gueltig, true);
    assert.deepEqual(JSON.parse(JSON.stringify(e)), e);
  });
});

function r2(v) { return Math.round(v * 100) / 100; }
