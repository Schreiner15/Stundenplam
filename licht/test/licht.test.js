import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  berechneLicht, lichtVorlage, kelvinZuRgb, cosExponent, spitzenLichtstaerke, PROFILE, SPOTS,
} from '../src/index.js';
import { berechne as berechneMoebel } from '../../src/index.js';

/** Korpus 800 × 2000 × 560: UB, OB (z 1981), MB (z 990,5–1009,5, Tiefe 542), Fachboden fb-1 (z 503). */
function moebel(korpus = {}, mbVerbindung = 'duebel') {
  return berechneMoebel({
    korpus: { breite: 800, hoehe: 2000, tiefe: 560, ...korpus },
    boeden: [
      { id: 'ub', typ: 'unterboden' }, { id: 'ob', typ: 'oberboden' },
      { id: 'mb', typ: 'mittelboden', verbindung: mbVerbindung }, { id: 'fb', typ: 'fachboden', abschnitt: 0 },
    ],
  });
}
const M = moebel();
const rechne = (leuchten, extra = {}) => berechneLicht({ moebel: M, leuchten, ...extra });
const codes = (e) => e.pruefungen.map((p) => p.code);
const ops = (e, filter) => e.bearbeitungen.filter((b) => Object.entries(filter).every(([k, v]) => b[k] === v));
const nah = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));

const PROFIL_MB = { id: 'led', typ: 'ledProfil', profil: 'einbau', befestigung: { teil: 'mb', flaeche: 'unten', abstandVorne: 40, rand: 20 } };
const SPOTS_OB = { id: 'sp', typ: 'spot', modell: 'moebelspot58', befestigung: { teil: 'ob', flaeche: 'unten', anzahl: 3, abstandVorne: 100 } };

describe('Photometrie-Grundlagen', () => {
  test('cosⁿ-Exponent: 120° ist lambertsch (n = 1), engere Winkel größer', () => {
    assert.ok(nah(cosExponent(120), 1, 1e-9));
    assert.ok(cosExponent(40) > cosExponent(60));
  });

  test('Spitzenlichtstärke erhält den Lichtstrom (numerische Integration über die Halbkugel)', () => {
    for (const winkel of [30, 60, 120]) {
      const phi = 500;
      const i0 = spitzenLichtstaerke(phi, winkel);
      const n = cosExponent(winkel);
      let summe = 0;
      const schritte = 20000;
      for (let k = 0; k < schritte; k++) {
        const g = ((k + 0.5) / schritte) * (Math.PI / 2);
        summe += i0 * Math.cos(g) ** n * 2 * Math.PI * Math.sin(g) * (Math.PI / 2 / schritte);
      }
      assert.ok(nah(summe, phi, 1e-3), `${winkel}°: ${summe} ≠ ${phi}`);
    }
  });

  test('Kelvin → RGB: warmweiß rötlich, 6500 K nahezu weiß', () => {
    const [r1, , b1] = kelvinZuRgb(2700);
    assert.equal(r1, 1);
    assert.ok(b1 < 0.65);
    const [r2, g2, b2] = kelvinZuRgb(6500);
    assert.ok(r2 > 0.97 && g2 > 0.95 && b2 > 0.93);
  });

  test('Punktlicht: E = I / d² senkrecht darunter, E = I · cos β / d² seitlich', () => {
    const e = berechneLicht({
      leuchten: [{ id: 'p', typ: 'punktlicht', lumen: 400 * Math.PI, position: { x: 0, y: 0, z: 1000 } }],
      pruefflaechen: [
        { name: 'unten', welt: { x0: -25, y0: -25, x1: 25, y1: 25, z: 0 }, raster: 50 },
        { name: 'seitlich', welt: { x0: 975, y0: -25, x1: 1025, y1: 25, z: 0 }, raster: 50 },
      ],
    });
    assert.ok(nah(e.beleuchtung[0].mittel, 100, 1e-3)); // I = 400π / 4π = 100 cd, d = 1 m
    assert.ok(nah(e.beleuchtung[1].mittel, 100 * Math.SQRT1_2 / 2, 1e-3));
  });
});

describe('LED-Profil', () => {
  test('Länge, Streifen auf Schnittraster, Leistung, Lichtstrom, Lage', () => {
    const e = rechne([PROFIL_MB]);
    const l = e.leuchten[0];
    assert.equal(l.laenge, 722); // 762 − 2 × 20
    assert.equal(l.streifenLaenge, 700); // ⌊(722 − 10) / 50⌋ · 50
    assert.ok(nah(l.watt, 6.72));
    assert.ok(nah(l.lumen, 560)); // 0,7 m · 1000 lm/m · 0,8 (opaler Diffusor)
    assert.deepEqual(l.position, { x: 400, y: 40, z: 990.5 });
    assert.deepEqual(l.richtung, { x: 0, y: 0, z: -1 });
    assert.deepEqual(e.netzteile.map((n) => [n.spannung, n.nennW, n.anzahl]), [[24, 15, 1]]);
    assert.deepEqual(codes(e), []);
  });

  test('Einbauprofil: Nut über die Profillänge, Kabelnut zur Hinterkante', () => {
    const e = rechne([PROFIL_MB]);
    const [nut, kabel] = ops(e, { teil: 'mb', art: 'nut' });
    assert.deepEqual(nut.von, { x: 20, y: 40, z: 0 });
    assert.deepEqual(nut.bis, { x: 742, y: 40, z: 0 });
    assert.equal(nut.breite, PROFILE.einbau.nutBreite);
    assert.equal(nut.tiefe, PROFILE.einbau.nutTiefe);
    assert.equal(nut.richtung, '+z');
    assert.deepEqual(kabel.von, { x: 727, y: 40, z: 0 });
    assert.deepEqual(kabel.bis, { x: 727, y: 542, z: 0 });
    assert.equal(kabel.breite, 8);
    assert.ok(e.bearbeitungen.every((b) => b.verbindung === 'licht' && b.quelle === 'led'));
  });

  test('Aufbauprofil braucht keine Nut, nur die Kabelführung', () => {
    const e = rechne([{ ...PROFIL_MB, profil: 'aufbau', befestigung: { ...PROFIL_MB.befestigung, kabel: 'bohrung' } }]);
    assert.equal(ops(e, { art: 'nut' }).length, 0);
    const [b] = ops(e, { art: 'bohrung' });
    assert.equal(b.durchmesser, 8);
    assert.equal(b.tiefe, 19);
  });

  test('senkrecht an der Seite innen (Vitrine): Richtung zur Korpusmitte', () => {
    const e = rechne([{ id: 'v', typ: 'ledProfil', profil: 'aufbau', befestigung: { teil: 'seite-links', flaeche: 'innen', abstandVorne: 30, rand: 50 } }]);
    const l = e.leuchten[0];
    assert.deepEqual(l.richtung, { x: 1, y: 0, z: 0 });
    assert.equal(l.position.x, 19);
    assert.equal(l.laenge, 1900);
  });

  test('Restwand: zu tiefe Profilnut', () => {
    assert.ok(codes(rechne([{ ...PROFIL_MB, nutTiefe: 17 }])).includes('RESTWAND'));
  });

  test('Spannungsabfall bei langen 12-V-Streifen', () => {
    const breit = moebel({ breite: 3000 });
    const e = berechneLicht({ moebel: breit, leuchten: [{ ...PROFIL_MB, streifen: { spannung: 12 } }] });
    assert.ok(codes(e).includes('SPANNUNGSABFALL'));
  });
});

describe('Spots', () => {
  test('gleichmäßig verteilt, Sackloch Ø 58 mit Kabelbohrung', () => {
    const e = rechne([SPOTS_OB]);
    assert.equal(e.leuchten.length, 3);
    const loecher = ops(e, { teil: 'ob', art: 'bohrung', durchmesser: SPOTS.moebelspot58.bohrung });
    assert.deepEqual(loecher.map((b) => [b.x, b.y]), [[127, 100], [381, 100], [635, 100]]);
    assert.ok(loecher.every((b) => b.tiefe === SPOTS.moebelspot58.bohrTiefe && b.flaeche === 'unten' && b.richtung === '+z'));
    assert.equal(ops(e, { teil: 'ob', art: 'bohrung', durchmesser: 8 }).length, 3);
    assert.ok(nah(e.leuchten.reduce((s, l) => s + l.watt, 0), 3 * SPOTS.moebelspot58.watt));
  });

  test('Kollision mit Möbel-Bearbeitung (Exzentergehäuse im Mittelboden)', () => {
    const m = moebel({}, 'exzenter');
    const e = berechneLicht({ moebel: m, leuchten: [{ id: 's', typ: 'spot', befestigung: { teil: 'mb', flaeche: 'unten', x: 60, y: 60 } }] });
    assert.ok(codes(e).includes('KOLLISION_BEARBEITUNG'));
    assert.equal(e.gueltig, false);
  });

  test('Randabstand und Lage außerhalb', () => {
    assert.ok(codes(rechne([{ id: 's', typ: 'spot', befestigung: { teil: 'ob', flaeche: 'unten', x: 40, y: 200 } }])).includes('RANDABSTAND'));
    assert.ok(codes(rechne([{ id: 's', typ: 'spot', befestigung: { teil: 'ob', flaeche: 'unten', x: 20, y: 200 } }])).includes('AUSSERHALB'));
  });

  test('sich überschneidende Spot-Bohrungen', () => {
    const e = rechne([
      { id: 'a', typ: 'spot', befestigung: { teil: 'ob', flaeche: 'unten', x: 200, y: 200 } },
      { id: 'b', typ: 'spot', befestigung: { teil: 'ob', flaeche: 'unten', x: 240, y: 200 } },
    ]);
    assert.ok(codes(e).includes('SPOT_ABSTAND'));
  });
});

describe('Beleuchtungsstärke mit Verdeckung', () => {
  test('Spots im Oberboden beleuchten den Mittelboden, nicht den Unterboden', () => {
    const e = rechne([SPOTS_OB], { pruefflaechen: [
      { name: 'Mittelboden', teil: 'mb', flaeche: 'oben', sollLux: 300 },
      { name: 'Unterboden', teil: 'ub', flaeche: 'oben' },
    ] });
    const [mb, ub] = e.beleuchtung;
    assert.ok(mb.mittel > 300, `Mittelboden nur ${mb.mittel} lx`);
    assert.equal(ub.max, 0);
    assert.ok(!codes(e).includes('ZU_DUNKEL'));
  });

  test('zu dunkel gegenüber Sollwert', () => {
    const e = rechne([SPOTS_OB], { pruefflaechen: [{ name: 'Mittelboden', teil: 'mb', flaeche: 'oben', sollLux: 50000 }] });
    assert.ok(codes(e).includes('ZU_DUNKEL'));
  });

  test('Lichtstrom-Bilanz: auf großer Fläche kommt fast der ganze Lichtstrom an', () => {
    const e = berechneLicht({
      leuchten: [{ id: 's', typ: 'spot', modell: 'aufbauspot', position: { x: 0, y: 0, z: 500 }, richtung: { x: 0, y: 0, z: -1 } }],
      pruefflaechen: [{ name: 'Boden', welt: { x0: -3000, y0: -3000, x1: 3000, y1: 3000, z: 0 }, raster: 20 }],
    });
    const fluss = e.beleuchtung[0].mittel * 36; // lx · m²
    assert.ok(Math.abs(fluss - SPOTS.aufbauspot.lumen) / SPOTS.aufbauspot.lumen < 0.03, `${fluss} lm`);
  });
});

describe('Stückliste, Netzteil, Prüfungen', () => {
  test('Profile aus 2-m-Stangen, Endkappen, Streifen, Netzteil, Kabel, Verteiler', () => {
    const e = rechne([PROFIL_MB, { ...PROFIL_MB, id: 'led2', befestigung: { ...PROFIL_MB.befestigung, teil: 'fb-1' } }, SPOTS_OB]);
    const pos = (anfang) => e.stueckliste.find((z) => z.position.startsWith(anfang));
    assert.equal(pos('Alu-Einbauprofil').menge, 1); // 722 + 720 > 2000? nein: passt in eine Stange
    assert.equal(pos('Endkappen').menge, 4);
    assert.ok(nah(pos('LED-Streifen').menge, 1.4));
    assert.equal(pos('Möbel-Einbauspot').menge, 3);
    assert.ok(pos('Netzteil'));
    assert.equal(pos('Verteiler').menge, 1);
    assert.ok(e.kabel.gesamtM > 0);
  });

  test('Netzteil: 20 % Reserve, mehrere Netzteile bei großer Last', () => {
    const e = rechne([{ ...PROFIL_MB, streifen: { wattProMeter: 300 } }]);
    assert.equal(e.netzteile[0].anzahl, 2);
    assert.ok(codes(e).includes('MEHRERE_NETZTEILE'));
  });

  test('gemischte Lichtfarben und unbekannte Teile', () => {
    assert.ok(codes(rechne([PROFIL_MB, { ...SPOTS_OB, kelvin: 4000 }])).includes('LICHTFARBE_GEMISCHT'));
    assert.ok(codes(rechne([{ ...PROFIL_MB, befestigung: { teil: 'gibtsnicht', flaeche: 'unten' } }])).includes('TEIL_UNBEKANNT'));
    assert.ok(codes(rechne([{ ...PROFIL_MB, befestigung: { teil: 'mb', flaeche: 'innen' } }])).includes('FLAECHE_UNGUELTIG'));
    assert.ok(codes(rechne([{ id: 'x', typ: 'kronleuchter' }])).includes('TYP_UNBEKANNT'));
  });

  test('Render-Lichter im glTF-Stil (Meter, Candela, Kegelwinkel in rad)', () => {
    const e = rechne([SPOTS_OB, PROFIL_MB]);
    const spot = e.renderLichter.find((r) => r.typ === 'spot');
    assert.ok(nah(spot.aeussererKegel, (SPOTS.moebelspot58.abstrahlwinkel / 2) * Math.PI / 180));
    assert.ok(spot.innererKegel < spot.aeussererKegel);
    assert.ok(nah(spot.intensitaet, spitzenLichtstaerke(SPOTS.moebelspot58.lumen, SPOTS.moebelspot58.abstrahlwinkel)));
    assert.ok(nah(spot.position[2], 1.981));
    assert.ok(e.renderLichter.some((r) => r.typ === 'linie'));
  });

  test('kaputte Eingabe wirft TypeError; Vorlage ist gültig und JSON-fähig', () => {
    assert.throws(() => berechneLicht(null), TypeError);
    assert.throws(() => berechneLicht({ leuchten: 'x' }), TypeError);
    const v = berechneLicht(lichtVorlage(M));
    assert.equal(v.gueltig, true, JSON.stringify(v.pruefungen));
    assert.deepEqual(JSON.parse(JSON.stringify(v)), v);
  });
});
