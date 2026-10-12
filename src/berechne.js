// Orchestrierung: normalisieren → Korpus → feste Böden → Abschnitte → Fachböden → Schubkästen
// → Fächer → Verbindungen → Rückwand/Sockel → Prüfungen → Ausgabe.

import {
  BodenTyp, Einbauart, Verbindung, FESTE_TYPEN, BEZEICHNUNG, istBekannterTyp, istErlaubt,
} from './enums.js';
import { normalisiere, verbindungStandard, KONSTANTEN, SCHEMA_VERSION } from './defaults.js';
import {
  korpusMasse, versteckteFlaeche, seiteAlsFlaeche, seiteAlsFlaecheSenkrecht, seiteAlsStirn,
  bodenAlsStirn, bodenAlsFlaeche, blendeAlsStirn,
} from './korpus.js';
import {
  festerBoden, fachbodenGrundriss, fachboden, schublade, erlaubterXBereich,
} from './boeden.js';
import { verteileFachboeden, lochspalten } from './raster.js';
import { erzeugeVerbindung, erzeugeGehrung, fuegeHinzu, pruefeRestwand } from './verbindungen.js';
import {
  neuerKontext, pruefeSeiten, pruefeTiefe, pruefeHoehe, pruefeUeberlappungen, pruefeFaecher,
  pruefeDurchbiegung, pruefeAuflage,
} from './kollision.js';
import { neuesTeil } from './teile.js';
import { erstelleStueckliste } from './ausgabe.js';
import { r } from './util.js';

const { EPS } = KONSTANTEN;
const RESERVIERTE_IDS = new Set(['seite-links', 'seite-rechts', 'rueckwand', 'sockelblende']);

function lageAus(geo) {
  return { x: geo.x0, y: geo.y0, z: geo.z0, dx: geo.x1 - geo.x0, dy: geo.y1 - geo.y0, dz: geo.z1 - geo.z0 };
}

/** Vorprüfung: IDs, Typ, Kombination, Mehrfachbelegung, Pflichtfelder. */
function vorpruefen(boeden, kontext) {
  const ids = new Set();
  const gueltig = [];
  let unterboden = null;
  let oberboden = null;
  for (const b of boeden) {
    if (ids.has(b.id) || RESERVIERTE_IDS.has(b.id)) {
      kontext.fehler('ID_DOPPELT', b.id, `ID „${b.id}" ist nicht eindeutig`);
      continue;
    }
    ids.add(b.id);
    if (!istBekannterTyp(b.typ)) {
      kontext.fehler('KOMBINATION', b.id, `Unbekannter Bodentyp „${b.typ}"`);
      continue;
    }
    if (!istErlaubt(b.typ, b.einbauart, b.verbindung)) {
      kontext.fehler('KOMBINATION', b.id,
        `${BEZEICHNUNG[b.typ]}: Einbauart „${b.einbauart}" mit Verbindung „${b.verbindung}" ist nicht zulässig`);
      continue;
    }
    if (b.typ === BodenTyp.UNTERBODEN || b.typ === BodenTyp.OBERBODEN) {
      const bereits = b.typ === BodenTyp.UNTERBODEN ? unterboden : oberboden;
      if (bereits) {
        kontext.fehler('MEHRFACH', b.id, `Es ist bereits ein ${BEZEICHNUNG[b.typ]} vorhanden (${bereits.id})`);
        continue;
      }
      if (b.typ === BodenTyp.UNTERBODEN) unterboden = b;
      else oberboden = b;
    }
    if (b.typ === BodenTyp.FESTBODEN && b.position === null) {
      kontext.fehler('POSITION_FEHLT', b.id, 'Festboden benötigt eine Position');
      continue;
    }
    gueltig.push(b);
  }
  return { gueltig, unterboden, oberboden };
}

/** Abschnitte = Lücken zwischen den festen Böden (nach Z sortiert). */
function bildeAbschnitte(feste, k) {
  const sortiert = [...feste].sort((a, b) => a.geo.z0 - b.geo.z0);
  const grenzen = [];
  if (!sortiert.length || sortiert[0].boden.typ !== BodenTyp.UNTERBODEN) grenzen.push({ id: null, z0: k.seitenZ0, z1: k.seitenZ0 });
  for (const f of sortiert) grenzen.push({ id: f.boden.id, z0: f.geo.z0, z1: f.geo.z1 });
  if (!sortiert.length || sortiert.at(-1).boden.typ !== BodenTyp.OBERBODEN) grenzen.push({ id: null, z0: k.seitenZ1, z1: k.seitenZ1 });
  const abschnitte = [];
  for (let i = 0; i + 1 < grenzen.length; i++) {
    const unten = grenzen[i];
    const oben = grenzen[i + 1];
    abschnitte.push({
      index: i,
      zUnten: unten.z1,
      zOben: oben.z0,
      lichteHoehe: oben.z0 - unten.z1,
      untenTeil: unten.id,
      obenTeil: oben.id,
    });
  }
  return abschnitte;
}

export function berechne(eingabe) {
  const e = normalisiere(eingabe);
  const { korpus } = e;
  const kontext = neuerKontext();
  const { gueltig, unterboden, oberboden } = vorpruefen(e.boeden, kontext);

  // Konstruktionsdaten (k) bleiben ungerundet; gerundet wird erst in der Ausgabe
  const k = korpusMasse(korpus, unterboden, oberboden);
  const sS = korpus.seitenStaerke;
  const kante = korpus.kantenStaerke;
  const rw = korpus.rueckwand;

  const seiten = {
    links: neuesTeil({
      id: 'seite-links', bezeichnung: 'Seite', kategorie: 'seite', laenge: k.seitenLaenge, breite: k.konstruktionsTiefe,
      staerke: sS, material: korpus.material, kanten: ['vorne'], kantenStaerke: kante,
      lage: { x: 0, y: 0, z: k.seitenZ0, dx: sS, dy: k.konstruktionsTiefe, dz: k.seitenLaenge },
    }),
    rechts: neuesTeil({
      id: 'seite-rechts', bezeichnung: 'Seite', kategorie: 'seite', laenge: k.seitenLaenge, breite: k.konstruktionsTiefe,
      staerke: sS, material: korpus.material, kanten: ['vorne'], kantenStaerke: kante,
      lage: { x: k.breite - sS, y: 0, z: k.seitenZ0, dx: sS, dy: k.konstruktionsTiefe, dz: k.seitenLaenge },
    }),
  };
  const teileJeBoden = new Map(); // boden.id → Teile (Reihenfolge wie Eingabe)
  const koerper = []; // für die Überlappungsprüfung
  const bodenTeil = (b, geo, id = b.id, extra = {}) => neuesTeil({
    id, bezeichnung: BEZEICHNUNG[b.typ], kategorie: 'boden', bodenId: b.id, bodenTyp: b.typ,
    laenge: geo.x1 - geo.x0, breite: geo.y1 - geo.y0, staerke: geo.t, material: b.material,
    kanten: ['vorne'], kantenStaerke: kante, lage: lageAus(geo), ...extra,
  });

  // ── Feste Böden ─────────────────────────────────────────────────────────────
  const feste = [];
  for (const b of gueltig.filter((x) => FESTE_TYPEN.includes(x.typ))) {
    const geo = festerBoden(b, k, korpus, kontext);
    if (!geo) continue;
    const teil = bodenTeil(b, geo);
    feste.push({ boden: b, geo, teil });
    teileJeBoden.set(b.id, [teil]);
    koerper.push({ id: b.id, ...geo });
    pruefeSeiten(b.id, geo, erlaubterXBereich(b, k), kontext);
    const konstruktiv = b.typ === BodenTyp.UNTERBODEN || b.typ === BodenTyp.OBERBODEN;
    pruefeTiefe(b.id, geo, konstruktiv ? k.konstruktionsTiefe : k.lichteTiefe, rw.art, kontext);
    pruefeHoehe(b.id, geo, k.hoehe, kontext);
  }
  const geoVon = (typ) => feste.find((f) => f.boden.typ === typ) ?? null;
  const ub = geoVon(BodenTyp.UNTERBODEN);
  const ob = geoVon(BodenTyp.OBERBODEN);

  // ── Abschnitte ──────────────────────────────────────────────────────────────
  const abschnitte = bildeAbschnitte(feste, k);
  const einlagen = new Map(abschnitte.map((a) => [a.index, []])); // Fachböden je Abschnitt

  // ── Fachböden ───────────────────────────────────────────────────────────────
  const fachAbschnitte = new Map();
  for (const b of gueltig.filter((x) => x.typ === BodenTyp.FACHBODEN)) {
    const a = abschnitte[b.abschnitt];
    if (!a) {
      kontext.fehler('ABSCHNITT', b.id, `Abschnitt ${b.abschnitt} existiert nicht (vorhanden: 0…${abschnitte.length - 1})`);
      continue;
    }
    if (fachAbschnitte.has(a.index)) {
      kontext.fehler('ABSCHNITT', b.id, `Abschnitt ${a.index} hat bereits Fachböden (${fachAbschnitte.get(a.index)}); Anzahl dort erhöhen`);
      continue;
    }
    fachAbschnitte.set(a.index, b.id);

    const p = b.verbindungsParameter[Verbindung.FACHBODENTRAEGER];
    const grundriss = fachbodenGrundriss(b, k);
    if (grundriss.laenge <= 0 || grundriss.tiefe <= 0) {
      kontext.fehler('MASS_UNGUELTIG', b.id, 'Fachboden hat keine positive Breite/Tiefe');
      continue;
    }
    const verteilung = verteileFachboeden({
      zUnten: a.zUnten, zOben: a.zOben, anzahl: b.anzahl, staerke: b.materialstaerke,
      raster: b.lochraster, rand: p.rasterRand, traegerHoehe: p.traegerHoehe,
    });
    if (verteilung.fehler) {
      kontext.fehler('RASTER', b.id, verteilung.fehler);
      continue;
    }
    const teile = verteilung.unterseiten.map((z0, i) => {
      const geo = fachboden(grundriss, z0, b.materialstaerke);
      const id = `${b.id}-${i + 1}`;
      koerper.push({ id, ...geo });
      einlagen.get(a.index).push({ id, geo });
      pruefeSeiten(id, geo, erlaubterXBereich(b, k), kontext);
      pruefeTiefe(id, geo, k.lichteTiefe, rw.art, kontext);
      pruefeDurchbiegung(id, geo.x1 - geo.x0, geo.t, kontext);
      return bodenTeil(b, geo, id);
    });
    teileJeBoden.set(b.id, teile);

    // Lochreihen Ø5 in beiden Seiten (über den ganzen Abschnitt)
    const spalten = lochspalten(k.lichteTiefe, b.lochraster, p.reiheVorne, p.reiheHinten);
    if (teile.length) pruefeAuflage(b.id, fachboden(grundriss, 0, 0), spalten, kontext);
    for (const seite of [seiten.links, seiten.rechts]) {
      pruefeRestwand(kontext, seite, sS, p.tiefe, 'Fachbodenträger-Bohrung', b.id);
      for (const zReihe of verteilung.reihen) {
        for (const y of spalten) {
          fuegeHinzu(seite, {
            art: 'bohrung', flaeche: 'innen', x: zReihe - k.seitenZ0, y, z: sS, richtung: '-z',
            durchmesser: p.durchmesser, tiefe: p.tiefe, quelle: b.id, verbindung: Verbindung.FACHBODENTRAEGER,
          });
        }
      }
    }
  }

  // ── Schubkästen ─────────────────────────────────────────────────────────────
  for (const b of gueltig.filter((x) => x.typ === BodenTyp.SCHUBLADENBODEN)) {
    const a = abschnitte[b.abschnitt];
    if (!a) {
      kontext.fehler('ABSCHNITT', b.id, `Abschnitt ${b.abschnitt} existiert nicht`);
      continue;
    }
    const sk = schublade(b, k, a, kontext);
    if (!sk) continue;
    const s = b.schublade;
    const { kasten } = sk;
    koerper.push({ id: b.id, ...kasten });
    pruefeRestwand(kontext, { id: `${b.id}-zargen` }, s.zargenStaerke, b.nuttiefe, 'Bodennut', b.id);

    const bodenteil = bodenTeil(b, sk.boden, b.id, { kanten: [] });
    const zarge = (suffix, bezeichnung, laenge, lage) => neuesTeil({
      id: `${b.id}-zarge-${suffix}`, bezeichnung, kategorie: 'zarge', bodenId: b.id, bodenTyp: b.typ,
      laenge, breite: s.hoehe, staerke: s.zargenStaerke, material: korpus.material, lage,
    });
    const zs = s.zargenStaerke;
    const zargen = [
      zarge('links', 'Schubkasten-Seitenzarge', sk.laenge, { x: kasten.x0, y: kasten.y0, z: kasten.z0, dx: zs, dy: sk.laenge, dz: s.hoehe }),
      zarge('rechts', 'Schubkasten-Seitenzarge', sk.laenge, { x: kasten.x1 - zs, y: kasten.y0, z: kasten.z0, dx: zs, dy: sk.laenge, dz: s.hoehe }),
      zarge('vorne', 'Schubkasten-Vorderstück', sk.innenBreite, { x: kasten.x0 + zs, y: kasten.y0, z: kasten.z0, dx: sk.innenBreite, dy: zs, dz: s.hoehe }),
      zarge('hinten', 'Schubkasten-Hinterstück', sk.innenBreite, { x: kasten.x0 + zs, y: kasten.y1 - zs, z: kasten.z0, dx: sk.innenBreite, dy: zs, dz: s.hoehe }),
    ];
    const nutMitte = s.bodenNutAbstand + b.materialstaerke / 2;
    for (const z of zargen) {
      fuegeHinzu(z, {
        art: 'nut', flaeche: 'innen', von: { x: 0, y: nutMitte, z: zs }, bis: { x: z.laenge, y: nutMitte, z: zs },
        richtung: '-z', breite: b.nutbreite, tiefe: b.nuttiefe, quelle: b.id, verbindung: Verbindung.NUT_FEDER,
      });
    }
    if (b.nutbreite < b.materialstaerke - EPS) {
      for (const flaeche of ['links', 'rechts', 'vorne', 'hinten']) {
        fuegeHinzu(bodenteil, {
          art: 'feder', flaeche, laenge: b.nuttiefe - b.verbindungsParameter[Verbindung.NUT_FEDER].luft,
          dicke: b.nutbreite, versatz: (b.materialstaerke - b.nutbreite) / 2, quelle: b.id, verbindung: Verbindung.NUT_FEDER,
        });
      }
    }
    teileJeBoden.set(b.id, [bodenteil, ...zargen]);
  }

  // ── Fächer ──────────────────────────────────────────────────────────────────
  const faecher = [];
  for (const a of abschnitte) {
    let unten = a.zUnten;
    const grenzen = [...einlagen.get(a.index)].sort((x, y) => x.geo.z0 - y.geo.z0);
    for (const g of [...grenzen.map((x) => x.geo), { z0: a.zOben, z1: a.zOben }]) {
      faecher.push({
        index: faecher.length, abschnitt: a.index, zUnten: r(unten), zOben: r(g.z0), lichteHoehe: r(g.z0 - unten),
        lichteBreite: r(k.lichteBreite), lichteTiefe: r(k.lichteTiefe),
      });
      unten = g.z1;
    }
  }

  // ── Verbindungen der festen Böden mit den Seiten ───────────────────────────
  for (const { boden: b, geo, teil } of feste) {
    const von = Math.max(geo.y0, 0);
    const bis = Math.min(geo.y1, k.konstruktionsTiefe);
    const istUnterboden = b.typ === BodenTyp.UNTERBODEN;
    const p = b.verbindungsParameter[b.verbindung];
    for (const [ende, seite] of [['links', seiten.links], ['rechts', seiten.rechts]]) {
      if (b.einbauart === Einbauart.GEHRUNG) {
        erzeugeGehrung({
          quelle: b.id, von, bis,
          a: bodenAlsStirn(teil, geo, ende, versteckteFlaeche(b.typ)),
          b: seiteAlsStirn(seite, k, istUnterboden ? 'unten' : 'oben'),
        }, p);
        continue;
      }
      const fuge = b.einbauart === Einbauart.DURCHLAUFEND
        ? {
          fl: bodenAlsFlaeche(teil, geo, ende === 'links' ? sS / 2 : k.breite - sS / 2, istUnterboden),
          st: seiteAlsStirn(seite, k, istUnterboden ? 'unten' : 'oben'),
        }
        : {
          fl: seiteAlsFlaeche(seite, k, geo.z0 + geo.t / 2),
          st: bodenAlsStirn(teil, geo, ende, versteckteFlaeche(b.typ)),
        };
      erzeugeVerbindung({ ...fuge, quelle: b.id, von, bis, nuttiefe: b.nuttiefe, nutbreite: b.nutbreite }, b.verbindung, p, kontext);
    }
  }

  // ── Rückwand ────────────────────────────────────────────────────────────────
  let rueckwand = null;
  if (rw.art === 'eingenutet') {
    const nt = rw.nuttiefe;
    const x0 = sS - nt;
    const x1 = k.breite - sS + nt;
    const z0 = ub ? ub.geo.z1 - nt : k.seitenZ0;
    const z1 = ob ? ob.geo.z0 + nt : k.seitenZ1;
    const yHinten = k.tiefe - rw.abstand;
    const yMitte = yHinten - rw.nutbreite / 2;
    rueckwand = neuesTeil({
      id: 'rueckwand', bezeichnung: 'Rückwand', kategorie: 'rueckwand',
      laenge: x1 - x0 - rw.luft, breite: z1 - z0 - rw.luft, staerke: rw.staerke, material: rw.material,
      lage: { x: x0 + rw.luft / 2, y: yHinten - rw.staerke, z: z0 + rw.luft / 2, dx: x1 - x0 - rw.luft, dy: rw.staerke, dz: z1 - z0 - rw.luft },
    });
    for (const seite of [seiten.links, seiten.rechts]) {
      pruefeRestwand(kontext, seite, sS, nt, 'Rückwandnut', 'rueckwand');
      fuegeHinzu(seite, {
        art: 'nut', flaeche: 'innen',
        von: { x: Math.max(0, z0 - k.seitenZ0), y: yMitte, z: sS },
        bis: { x: Math.min(k.seitenLaenge, z1 - k.seitenZ0), y: yMitte, z: sS },
        richtung: '-z', breite: rw.nutbreite, tiefe: nt, quelle: 'rueckwand', verbindung: 'rueckwand',
      });
    }
    for (const f of [ub, ob].filter(Boolean)) {
      if (f.geo.y1 < yHinten - EPS) {
        kontext.fehler('RUECKWANDNUT', f.boden.id,
          `${BEZEICHNUNG[f.boden.typ]} endet bei ${r(f.geo.y1)} mm, Rückwandnut liegt bei ${r(yHinten - rw.nutbreite)}…${r(yHinten)} mm`);
        continue;
      }
      const oben = f.boden.typ === BodenTyp.UNTERBODEN; // Unterboden: Nut oben, Oberboden: Nut unten
      const L = f.geo.x1 - f.geo.x0;
      const z = oben ? f.geo.t : 0;
      pruefeRestwand(kontext, f.teil, f.geo.t, nt, 'Rückwandnut', 'rueckwand');
      fuegeHinzu(f.teil, {
        art: 'nut', flaeche: oben ? 'oben' : 'unten',
        von: { x: Math.max(0, x0 - f.geo.x0), y: yMitte - f.geo.y0, z },
        bis: { x: Math.min(L, x1 - f.geo.x0), y: yMitte - f.geo.y0, z },
        richtung: oben ? '-z' : '+z', breite: rw.nutbreite, tiefe: nt, quelle: 'rueckwand', verbindung: 'rueckwand',
      });
    }
  } else if (rw.art === 'aufgesetzt') {
    rueckwand = neuesTeil({
      id: 'rueckwand', bezeichnung: 'Rückwand', kategorie: 'rueckwand',
      laenge: k.breite, breite: k.hoehe, staerke: rw.staerke, material: rw.material,
      lage: { x: 0, y: k.konstruktionsTiefe, z: 0, dx: k.breite, dy: rw.staerke, dz: k.hoehe },
    });
  }

  // ── Sockelblende ────────────────────────────────────────────────────────────
  let sockelblende = null;
  if (ub && ub.boden.einbauart === Einbauart.SOCKEL && ub.geo.z0 > EPS) {
    const hoehe = ub.geo.z0;
    const t = korpus.materialStaerke;
    const y0 = korpus.sockel.ruecksprung;
    sockelblende = neuesTeil({
      id: 'sockelblende', bezeichnung: 'Sockelblende', kategorie: 'sockelblende',
      laenge: k.lichteBreite, breite: hoehe, staerke: t, material: korpus.material,
      lage: { x: sS, y: y0, z: 0, dx: k.lichteBreite, dy: t, dz: hoehe },
    });
    const p = verbindungStandard(Verbindung.DUEBEL, t);
    for (const [ende, seite] of [['links', seiten.links], ['rechts', seiten.rechts]]) {
      erzeugeVerbindung({
        quelle: 'sockelblende', von: Math.max(0, k.seitenZ0), bis: hoehe,
        fl: seiteAlsFlaecheSenkrecht(seite, k, y0 + t / 2),
        st: blendeAlsStirn(sockelblende, k.lichteBreite, t, ende),
      }, Verbindung.DUEBEL, p, kontext);
    }
  }

  // ── Querschnittsprüfungen ───────────────────────────────────────────────────
  pruefeUeberlappungen(koerper, kontext);
  pruefeFaecher(faecher, kontext);

  // ── Ausgabe ─────────────────────────────────────────────────────────────────
  const teile = [seiten.links, seiten.rechts];
  if (rueckwand) teile.push(rueckwand);
  if (sockelblende) teile.push(sockelblende);
  for (const b of e.boeden) teile.push(...(teileJeBoden.get(b.id) ?? []));
  // ID-Kollisionen (doppelte IDs) dürfen keine Teile doppelt ausgeben
  const eindeutig = [...new Map(teile.map((t) => [t.id, t])).values()];

  return {
    schemaVersion: SCHEMA_VERSION,
    eingabe: e,
    korpus: {
      breite: r(k.breite),
      hoehe: r(k.hoehe),
      tiefe: r(k.tiefe),
      seitenStaerke: r(sS),
      lichteBreite: r(k.lichteBreite),
      lichteTiefe: r(k.lichteTiefe),
      konstruktionsTiefe: r(k.konstruktionsTiefe),
      seitenZ0: r(k.seitenZ0),
      seitenLaenge: r(k.seitenLaenge),
    },
    teile: eindeutig,
    abschnitte: abschnitte.map((a) => ({ ...a, zUnten: r(a.zUnten), zOben: r(a.zOben), lichteHoehe: r(a.lichteHoehe) })),
    faecher,
    stueckliste: erstelleStueckliste(eindeutig),
    bearbeitungen: eindeutig.flatMap((t) => t.bearbeitungen),
    pruefungen: kontext.pruefungen,
    gueltig: !kontext.pruefungen.some((p) => p.schwere === 'fehler'),
  };
}
