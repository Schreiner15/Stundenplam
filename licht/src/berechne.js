// Orchestrierung: normalisieren → Leuchten platzieren → Bearbeitungen → Elektrik → Lichtberechnung → Ausgabe.

import {
  PROFILE, STREIFEN_STANDARD, MAX_STREIFEN_JE_EINSPEISUNG, SPOTS, NETZTEIL_GROESSEN, PROFIL_STANGE, KABEL,
  VERTEILER_ANSCHLUESSE, MIN_RANDABSTAND, MIN_RESTWAND,
} from './katalog.js';
import { cosExponent, spitzenLichtstaerke, innererKegel, kelvinZuRgb, beleuchtungsstaerke } from './photometrie.js';
import { teilFlaeche, kollidiert } from './montage.js';

export const SCHEMA_VERSION = '1.0.0';
const TYPEN = ['ledProfil', 'spot', 'punktlicht', 'flaechenlicht'];
const SEGMENT = 50; // mm, Zerlegung linearer und flächiger Strahler
const r1 = (v) => Math.round(v * 10) / 10 || 0;
const r2 = (v) => Math.round(v * 100) / 100 || 0;
const r3 = (v) => Math.round(v * 1000) / 1000 || 0;
const de = (v) => String(r2(v)).replace('.', ',');
const vRund = (v) => ({ x: r1(v.x), y: r1(v.y), z: r1(v.z) });
const vRich = (v) => ({ x: r3(v.x), y: r3(v.y), z: r3(v.z) });

function normiere(v) {
  const l = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / l, y: v.y / l, z: v.z / l };
}
function istObjekt(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

export function normalisiereLicht(eingabe) {
  if (!istObjekt(eingabe)) throw new TypeError('Eingabe muss ein Objekt { moebel, leuchten, pruefflaechen } sein');
  if (!Array.isArray(eingabe.leuchten)) throw new TypeError('leuchten muss ein Array sein');
  if (eingabe.pruefflaechen !== undefined && !Array.isArray(eingabe.pruefflaechen)) throw new TypeError('pruefflaechen muss ein Array sein');
  const zaehler = {};
  const leuchten = eingabe.leuchten.map((roh, i) => {
    if (!istObjekt(roh)) throw new TypeError(`leuchten[${i}] muss ein Objekt sein`);
    const typ = String(roh.typ ?? '');
    zaehler[typ] = (zaehler[typ] ?? 0) + 1;
    const l = { ...roh, id: String(roh.id ?? `${typ}-${zaehler[typ]}`), typ };
    if (typ === 'ledProfil') {
      l.profil = String(roh.profil ?? 'einbau');
      l.streifen = { ...STREIFEN_STANDARD, ...(roh.streifen ?? {}) };
      if (roh.kelvin) l.streifen.kelvin = roh.kelvin;
      l.befestigung = { flaeche: 'unten', abstandVorne: 40, rand: 20, kabel: 'nut', ...(roh.befestigung ?? {}) };
    } else if (typ === 'spot') {
      l.modell = String(roh.modell ?? 'moebelspot58');
      const k = SPOTS[l.modell] ?? {};
      for (const f of ['watt', 'lumen', 'abstrahlwinkel', 'kelvin', 'spannung']) l[f] = roh[f] ?? k[f];
      if (roh.befestigung) l.befestigung = { flaeche: 'unten', kabel: 'bohrung', abstandVorne: 100, ...roh.befestigung };
    } else if (typ === 'punktlicht') {
      l.lumen = roh.lumen ?? 800; l.watt = roh.watt ?? 8; l.kelvin = roh.kelvin ?? 2700; l.spannung = roh.spannung ?? 230;
    } else if (typ === 'flaechenlicht') {
      l.lumen = roh.lumen ?? 3000; l.watt = roh.watt ?? 30; l.kelvin = roh.kelvin ?? 4000; l.spannung = roh.spannung ?? 230;
      l.breite = roh.breite ?? 600; l.tiefe = roh.tiefe ?? 600; l.richtung = roh.richtung ?? { x: 0, y: 0, z: -1 };
    }
    return l;
  });
  const pruefflaechen = (eingabe.pruefflaechen ?? []).map((p, i) => ({
    name: String(p.name ?? `Prüffläche ${i + 1}`), teil: p.teil ?? null, flaeche: p.flaeche ?? 'oben',
    welt: p.welt ?? null, raster: p.raster ?? 50, sollLux: p.sollLux ?? null,
  }));
  return {
    leuchten,
    netzteil: { reserve: 0.2, groessen: NETZTEIL_GROESSEN, position: null, ...(eingabe.netzteil ?? {}) },
    pruefflaechen,
  };
}

/** Streifenlänge auf Schnittraster und Profil-Zuschnitt. */
function streifenLaenge(profilLaenge, endkappe, raster) {
  return Math.max(0, Math.floor((profilLaenge - 2 * endkappe + 1e-9) / raster) * raster);
}

export function berechneLicht(eingabe) {
  const e = normalisiereLicht(eingabe);
  const moebel = eingabe.moebel ?? null;
  const teile = new Map((moebel?.teile ?? []).map((t) => [t.id, t]));
  const pruefungen = [];
  const melde = (schwere, code, teil, meldung) => pruefungen.push({ schwere, code, teil: teil ?? null, meldung });

  const leuchten = [];
  const strahler = [];
  const bearbeitungen = [];
  const ids = new Set();

  const neueBearbeitung = (teil, b) => {
    const op = { teil: teil.id, ...b, verbindung: 'licht' };
    for (const k of ['x', 'y', 'z', 'durchmesser', 'tiefe', 'breite']) if (typeof op[k] === 'number') op[k] = r1(op[k]);
    if (op.von) { op.von = vRund(op.von); op.bis = vRund(op.bis); }
    bearbeitungen.push(op);
    return op;
  };

  /** Kabelführung an Position (x, y) der Fläche. */
  const kabel = (tf, x, y, art, quelle) => {
    if (art === 'nut') {
      return neueBearbeitung(tf.teil, { art: 'nut', flaeche: tf.flaeche, von: { x, y, z: tf.cnc.z }, bis: { x, y: tf.breite, z: tf.cnc.z }, richtung: tf.cnc.richtung, breite: KABEL.nutBreite, tiefe: KABEL.nutTiefe, quelle });
    }
    if (art === 'bohrung') {
      return neueBearbeitung(tf.teil, { art: 'bohrung', flaeche: tf.flaeche, x, y, z: tf.cnc.z, richtung: tf.cnc.richtung, durchmesser: KABEL.bohrung, tiefe: tf.staerke, quelle });
    }
    return null;
  };

  const befestigeAn = (l) => {
    const t = teile.get(l.befestigung.teil);
    if (!t) { melde('fehler', 'TEIL_UNBEKANNT', l.id, `Teil „${l.befestigung.teil}" gibt es im Möbel nicht`); return null; }
    const tf = teilFlaeche(t, l.befestigung.flaeche);
    if (!tf) { melde('fehler', 'FLAECHE_UNGUELTIG', l.id, `Fläche „${l.befestigung.flaeche}" passt nicht zu ${t.bezeichnung} (${t.id})`); return null; }
    return tf;
  };

  const restwand = (tf, tiefe, was, id) => {
    if (tf.staerke - tiefe < MIN_RESTWAND - 1e-9) melde('fehler', 'RESTWAND', id, `${was} ${tiefe} mm in ${tf.staerke} mm Platte lässt nur ${r1(tf.staerke - tiefe)} mm Material`);
  };

  for (const l of e.leuchten) {
    if (ids.has(l.id)) { melde('fehler', 'ID_DOPPELT', l.id, `ID „${l.id}" ist doppelt`); continue; }
    ids.add(l.id);
    if (!TYPEN.includes(l.typ)) { melde('fehler', 'TYP_UNBEKANNT', l.id, `Unbekannter Leuchtentyp „${l.typ}" (möglich: ${TYPEN.join(', ')})`); continue; }

    if (l.typ === 'ledProfil') {
      const profil = PROFILE[l.profil];
      if (!profil) { melde('fehler', 'MODELL_UNBEKANNT', l.id, `Unbekanntes Profil „${l.profil}"`); continue; }
      const tf = befestigeAn(l);
      if (!tf) continue;
      const b = l.befestigung;
      const x0 = b.rand;
      const x1 = tf.laenge - b.rand;
      const laenge = x1 - x0;
      const yc = b.abstandVorne;
      const halb = Math.max(profil.nutBreite, 16) / 2;
      if (laenge <= 0 || yc - halb < 0 || yc + halb > tf.breite) {
        melde('fehler', 'AUSSERHALB', l.id, `Profil liegt nicht vollständig auf ${tf.teil.id}`);
        continue;
      }
      const s = l.streifen;
      const streifen = streifenLaenge(laenge, profil.endkappe, s.schnittraster);
      const watt = (streifen / 1000) * s.wattProMeter;
      const lumen = (streifen / 1000) * s.lumenProMeter * profil.wirkungsgrad;
      const nutTiefe = l.nutTiefe ?? profil.nutTiefe;
      const ops = [];
      if (profil.nutBreite > 0) {
        restwand(tf, nutTiefe, 'Profilnut', l.id);
        ops.push(neueBearbeitung(tf.teil, { art: 'nut', flaeche: tf.flaeche, von: { x: x0, y: yc, z: tf.cnc.z }, bis: { x: x1, y: yc, z: tf.cnc.z }, richtung: tf.cnc.richtung, breite: profil.nutBreite, tiefe: nutTiefe, quelle: l.id }));
      }
      const k = kabel(tf, x1 - 15, yc, b.kabel, l.id);
      if (k) ops.push(k);
      const max = MAX_STREIFEN_JE_EINSPEISUNG[s.spannung];
      if (max && streifen > max) melde('warnung', 'SPANNUNGSABFALL', l.id, `${de(streifen / 1000)} m Streifen an ${s.spannung} V: über ${de(max / 1000)} m beidseitig einspeisen`);
      // Abstrahlrichtung (Eckprofil um die Neigung zur Rückseite gekippt)
      const w = (profil.neigung * Math.PI) / 180;
      const richtung = normiere({
        x: tf.normale.x * Math.cos(w) + tf.tiefenRichtung.x * Math.sin(w),
        y: tf.normale.y * Math.cos(w) + tf.tiefenRichtung.y * Math.sin(w),
        z: tf.normale.z * Math.cos(w) + tf.tiefenRichtung.z * Math.sin(w),
      });
      const segmente = Math.max(1, Math.ceil(laenge / SEGMENT));
      const n = cosExponent(s.abstrahlwinkel);
      const i0 = spitzenLichtstaerke(lumen / segmente, s.abstrahlwinkel);
      for (let i = 0; i < segmente; i++) {
        const p = tf.welt(x0 + ((i + 0.5) * laenge) / segmente, yc);
        strahler.push({ quelle: l.id, position: versetzt(p, tf.normale), richtung, i0, n });
      }
      leuchten.push({
        id: l.id, typ: l.typ, name: profil.name, profil: l.profil, teil: tf.teil.id, flaeche: tf.flaeche,
        position: vRund(tf.welt(x0 + laenge / 2, yc)), richtung: vRich(richtung),
        anfang: vRund(tf.welt(x0, yc)), ende: vRund(tf.welt(x1, yc)),
        laenge: r1(laenge), streifenLaenge: streifen, watt: r2(watt), lumen: r1(lumen), kelvin: s.kelvin, spannung: s.spannung,
        abstrahlwinkel: s.abstrahlwinkel, wattProMeter: s.wattProMeter, bearbeitungen: ops.length,
      });
    } else if (l.typ === 'spot') {
      const modell = SPOTS[l.modell];
      if (!modell) { melde('fehler', 'MODELL_UNBEKANNT', l.id, `Unbekannter Spot „${l.modell}"`); continue; }
      const n = cosExponent(l.abstrahlwinkel);
      const i0 = spitzenLichtstaerke(l.lumen, l.abstrahlwinkel);
      const ablegen = (id, position, richtung, tf) => {
        strahler.push({ quelle: l.id, position: versetzt(position, richtung), richtung, i0, n });
        leuchten.push({
          id, typ: l.typ, name: modell.name, modell: l.modell, teil: tf?.teil.id ?? null, flaeche: tf?.flaeche ?? null,
          position: vRund(position), richtung: vRich(richtung), watt: l.watt, lumen: l.lumen, kelvin: l.kelvin,
          spannung: l.spannung, abstrahlwinkel: l.abstrahlwinkel, lichtstaerke: r1(i0),
        });
      };
      if (!l.befestigung) {
        if (!l.position) { melde('fehler', 'AUSSERHALB', l.id, 'Spot braucht eine Befestigung oder eine Position'); continue; }
        ablegen(l.id, l.position, normiere(l.richtung ?? { x: 0, y: 0, z: -1 }), null);
        continue;
      }
      const tf = befestigeAn(l);
      if (!tf) continue;
      const b = l.befestigung;
      const punkte = b.anzahl
        ? Array.from({ length: b.anzahl }, (_, i) => [(tf.laenge * (i + 0.5)) / b.anzahl, b.y ?? b.abstandVorne])
        : [[b.x, b.y]];
      const r = modell.bohrung / 2;
      punkte.forEach(([x, y], i) => {
        const id = punkte.length > 1 ? `${l.id}-${i + 1}` : l.id;
        const rand = Math.min(x - r, tf.laenge - x - r, y - r, tf.breite - y - r);
        if (rand < 0) { melde('fehler', 'AUSSERHALB', id, `Bohrung Ø ${modell.bohrung} ragt ${r1(-rand)} mm über ${tf.teil.id} hinaus`); return; }
        if (modell.bohrung > 0 && rand < MIN_RANDABSTAND) melde('warnung', 'RANDABSTAND', id, `Bohrungsrand nur ${r1(rand)} mm von der Kante (min. ${MIN_RANDABSTAND} mm)`);
        if (modell.bohrung > 0) {
          const tiefe = modell.bohrTiefe ?? tf.staerke;
          if (modell.bohrTiefe) restwand(tf, tiefe, 'Spot-Sackloch', id);
          neueBearbeitung(tf.teil, { art: 'bohrung', flaeche: tf.flaeche, x, y, z: tf.cnc.z, richtung: tf.cnc.richtung, durchmesser: modell.bohrung, tiefe, quelle: id });
        }
        if (!(modell.bohrung > 0 && !modell.bohrTiefe)) kabel(tf, x, y, b.kabel, id); // durchgehende Bohrung braucht keine
        ablegen(id, tf.welt(x, y), tf.normale, tf);
      });
    } else if (l.typ === 'punktlicht') {
      if (!l.position) { melde('fehler', 'AUSSERHALB', l.id, 'Punktlicht braucht eine Position'); continue; }
      strahler.push({ quelle: l.id, position: l.position, richtung: null, i0: l.lumen / (4 * Math.PI), n: 0 });
      leuchten.push({ id: l.id, typ: l.typ, name: 'Punktlicht', teil: null, flaeche: null, position: vRund(l.position), richtung: null, watt: l.watt, lumen: l.lumen, kelvin: l.kelvin, spannung: l.spannung, lichtstaerke: r1(l.lumen / (4 * Math.PI)) });
    } else if (l.typ === 'flaechenlicht') {
      if (!l.position) { melde('fehler', 'AUSSERHALB', l.id, 'Flächenlicht braucht eine Position'); continue; }
      const richtung = normiere(l.richtung);
      const u = normiere(Math.abs(richtung.z) > 0.9 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 0, z: 1 });
      const v = normiere({ x: richtung.y * u.z - richtung.z * u.y, y: richtung.z * u.x - richtung.x * u.z, z: richtung.x * u.y - richtung.y * u.x });
      const nu = Math.max(1, Math.ceil(l.breite / 100));
      const nv = Math.max(1, Math.ceil(l.tiefe / 100));
      const i0 = spitzenLichtstaerke(l.lumen / (nu * nv), 120);
      for (let a = 0; a < nu; a++) {
        for (let c = 0; c < nv; c++) {
          const du = ((a + 0.5) / nu - 0.5) * l.breite;
          const dv = ((c + 0.5) / nv - 0.5) * l.tiefe;
          const p = { x: l.position.x + u.x * du + v.x * dv, y: l.position.y + u.y * du + v.y * dv, z: l.position.z + u.z * du + v.z * dv };
          strahler.push({ quelle: l.id, position: p, richtung, i0, n: 1 });
        }
      }
      leuchten.push({ id: l.id, typ: l.typ, name: 'Flächenlicht', teil: null, flaeche: null, position: vRund(l.position), richtung: vRich(richtung), breite: l.breite, tiefe: l.tiefe, watt: l.watt, lumen: l.lumen, kelvin: l.kelvin, spannung: l.spannung });
    }
  }

  // Kollisionen der eigenen Bearbeitungen mit Möbel-Bearbeitungen und untereinander (Spots)
  for (const op of bearbeitungen) {
    const teil = teile.get(op.teil);
    const treffer = (teil?.bearbeitungen ?? []).find((m) => kollidiert(op, m));
    if (treffer) {
      melde('fehler', 'KOLLISION_BEARBEITUNG', op.quelle,
        `${op.art === 'nut' ? 'Nut' : `Bohrung Ø ${op.durchmesser}`} trifft ${treffer.art} (${treffer.verbindung ?? treffer.quelle}) in ${op.teil} bei x ${treffer.x ?? treffer.von?.x}, y ${treffer.y ?? treffer.von?.y}`);
    }
  }
  const spotLoecher = bearbeitungen.filter((b) => b.art === 'bohrung' && b.durchmesser > KABEL.bohrung);
  for (let i = 0; i < spotLoecher.length; i++) {
    for (let j = i + 1; j < spotLoecher.length; j++) {
      const a = spotLoecher[i];
      const b = spotLoecher[j];
      if (a.teil === b.teil && a.flaeche === b.flaeche && Math.hypot(a.x - b.x, a.y - b.y) < (a.durchmesser + b.durchmesser) / 2) {
        melde('fehler', 'SPOT_ABSTAND', a.quelle, `Bohrungen ${a.quelle} und ${b.quelle} überschneiden sich`);
      }
    }
  }
  if (new Set(leuchten.map((l) => l.kelvin)).size > 1) {
    melde('hinweis', 'LICHTFARBE_GEMISCHT', null, `Unterschiedliche Lichtfarben: ${[...new Set(leuchten.map((l) => l.kelvin))].sort().join(' K, ')} K`);
  }

  // Netzteile je Spannung (nur Kleinspannung)
  const korpus = moebel?.korpus;
  const npos = e.netzteil.position ?? (korpus ? { x: korpus.breite / 2, y: korpus.konstruktionsTiefe, z: 0 } : { x: 0, y: 0, z: 0 });
  const klein = leuchten.filter((l) => l.spannung <= 48);
  const netzteile = [];
  const groessen = [...e.netzteil.groessen].sort((a, b) => a - b);
  for (const spannung of [...new Set(klein.map((l) => l.spannung))].sort((a, b) => a - b)) {
    const gruppe = klein.filter((l) => l.spannung === spannung);
    const last = gruppe.reduce((s, l) => s + l.watt, 0);
    const bedarf = last * (1 + e.netzteil.reserve);
    const passend = groessen.find((g) => g >= bedarf - 1e-9);
    const groesste = groessen.at(-1);
    const anzahl = passend ? 1 : Math.ceil(bedarf / groesste);
    if (!passend) melde('hinweis', 'MEHRERE_NETZTEILE', null, `${spannung} V: ${de(last)} W Last – ${anzahl} Netzteile à ${groesste} W, Leuchten aufteilen`);
    netzteile.push({ spannung, lastW: r2(last), bedarfW: r2(bedarf), nennW: passend ?? groesste, anzahl, leuchten: gruppe.map((l) => l.id) });
  }
  const kabelLaengen = klein.map((l) => {
    const p = l.anfang ?? l.position;
    return { leuchte: l.id, m: r2(((Math.abs(p.x - npos.x) + Math.abs(p.y - npos.y) + Math.abs(p.z - npos.z) + KABEL.reserveMm) * 1.1) / 1000) };
  });

  // Beleuchtungsstärke
  const hindernisse = (moebel?.teile ?? []).map((t) => ({ id: t.id, x0: t.lage.x, y0: t.lage.y, z0: t.lage.z, x1: t.lage.x + t.lage.dx, y1: t.lage.y + t.lage.dy, z1: t.lage.z + t.lage.dz }));
  const beleuchtung = [];
  for (const pf of e.pruefflaechen) {
    let tf;
    if (pf.welt) {
      const w = pf.welt;
      tf = { laenge: w.x1 - w.x0, breite: w.y1 - w.y0, welt: (x, y) => ({ x: w.x0 + x, y: w.y0 + y, z: w.z }), normale: { x: 0, y: 0, z: 1 } };
    } else {
      const t = teile.get(pf.teil);
      tf = t && teilFlaeche(t, pf.flaeche);
      if (!tf) { melde('fehler', 'TEIL_UNBEKANNT', null, `Prüffläche „${pf.name}": Teil/Fläche ${pf.teil}/${pf.flaeche} nicht gefunden`); continue; }
    }
    const nx = Math.max(1, Math.round(tf.laenge / pf.raster));
    const ny = Math.max(1, Math.round(tf.breite / pf.raster));
    const werte = [];
    let summe = 0;
    let min = Infinity;
    let max = 0;
    for (let j = 0; j < ny; j++) {
      const zeile = [];
      for (let i = 0; i < nx; i++) {
        const p = versetzt(tf.welt(((i + 0.5) * tf.laenge) / nx, ((j + 0.5) * tf.breite) / ny), tf.normale);
        const lux = beleuchtungsstaerke(p, tf.normale, strahler, hindernisse);
        zeile.push(r2(lux));
        summe += lux;
        min = Math.min(min, lux);
        max = Math.max(max, lux);
      }
      werte.push(zeile);
    }
    const mittel = summe / (nx * ny);
    const u0 = mittel > 0 ? min / mittel : 0;
    if (pf.sollLux && mittel < pf.sollLux) melde('warnung', 'ZU_DUNKEL', null, `${pf.name}: ${Math.round(mittel)} lx statt ${pf.sollLux} lx`);
    if (mittel > 0 && u0 < 0.4) melde('hinweis', 'UNGLEICHMAESSIG', null, `${pf.name}: Gleichmäßigkeit U₀ = ${de(u0)} (Ränder deutlich dunkler)`);
    beleuchtung.push({
      name: pf.name, teil: pf.teil, flaeche: pf.welt ? null : pf.flaeche, sollLux: pf.sollLux,
      mittel: r2(mittel), min: r2(min), max: r2(max), gleichmaessigkeit: r2(u0),
      laenge: tf.laenge, breite: tf.breite, nx, ny, werte,
    });
  }

  // Stückliste
  const stueckliste = [];
  const profile = leuchten.filter((l) => l.typ === 'ledProfil');
  for (const art of Object.keys(PROFILE)) {
    const gruppe = profile.filter((l) => l.profil === art);
    if (!gruppe.length) continue;
    const stangen = stangenZuschnitt(gruppe.map((l) => l.laenge));
    stueckliste.push({ position: PROFILE[art].name, menge: stangen, einheit: `Stangen à ${PROFIL_STANGE / 1000} m`, detail: `Zuschnitte ${gruppe.map((l) => `${de(l.laenge)} mm`).join(', ')}` });
    stueckliste.push({ position: `Diffusor ${PROFILE[art].diffusor}`, menge: stangen, einheit: `Stangen à ${PROFIL_STANGE / 1000} m`, detail: 'gleiche Zuschnitte wie Profil' });
  }
  if (profile.length) stueckliste.push({ position: 'Endkappen', menge: profile.length * 2, einheit: 'Stück', detail: '2 je Profil' });
  const streifenGruppen = new Map();
  for (const l of profile) {
    const k = `${l.spannung}|${l.kelvin}|${l.wattProMeter}`;
    streifenGruppen.set(k, (streifenGruppen.get(k) ?? 0) + l.streifenLaenge);
  }
  for (const [k, mm] of streifenGruppen) {
    const [spannung, kelvin, wpm] = k.split('|');
    stueckliste.push({ position: `LED-Streifen ${spannung} V, ${kelvin} K, ${de(Number(wpm))} W/m`, menge: r2(mm / 1000), einheit: 'm', detail: 'auf Schnittmarken gekürzt' });
  }
  const spots = leuchten.filter((l) => l.typ === 'spot');
  for (const modell of Object.keys(SPOTS)) {
    const n = spots.filter((l) => l.modell === modell).length;
    if (n) stueckliste.push({ position: SPOTS[modell].name, menge: n, einheit: 'Stück', detail: `${de(SPOTS[modell].watt)} W, ${SPOTS[modell].lumen} lm, ${SPOTS[modell].abstrahlwinkel}°` });
  }
  for (const n of netzteile) {
    stueckliste.push({ position: `Netzteil ${n.spannung} V ${n.nennW} W`, menge: n.anzahl, einheit: 'Stück', detail: `Last ${de(n.lastW)} W + ${Math.round(e.netzteil.reserve * 100)} % Reserve = ${de(n.bedarfW)} W` });
    if (n.leuchten.length > 1) stueckliste.push({ position: `Verteiler ${VERTEILER_ANSCHLUESSE}-fach (${n.spannung} V)`, menge: Math.ceil(n.leuchten.length / VERTEILER_ANSCHLUESSE), einheit: 'Stück', detail: `${n.leuchten.length} Leuchten` });
  }
  const kabelGesamt = kabelLaengen.reduce((s, k) => s + k.m, 0);
  if (kabelLaengen.length) stueckliste.push({ position: 'Anschlusskabel 2 × 0,5 mm²', menge: r2(kabelGesamt), einheit: 'm', detail: 'Leuchte → Netzteil, inkl. 10 % und 30 cm Reserve je Leuchte' });

  // Render-Lichter (glTF KHR_lights_punctual-ähnlich, Meter und Candela)
  const m = (p) => [r3(p.x / 1000), r3(p.y / 1000), r3(p.z / 1000)];
  const renderLichter = leuchten.map((l) => {
    const farbe = kelvinZuRgb(l.kelvin);
    if (l.typ === 'spot') {
      return { id: l.id, typ: 'spot', position: m(l.position), richtung: [l.richtung.x, l.richtung.y, l.richtung.z], farbe, intensitaet: spitzenLichtstaerke(l.lumen, l.abstrahlwinkel), einheit: 'cd', innererKegel: innererKegel(l.abstrahlwinkel), aeussererKegel: ((l.abstrahlwinkel / 2) * Math.PI) / 180 };
    }
    if (l.typ === 'ledProfil') return { id: l.id, typ: 'linie', anfang: m(l.anfang), ende: m(l.ende), richtung: [l.richtung.x, l.richtung.y, l.richtung.z], farbe, lumen: l.lumen, einheit: 'lm' };
    if (l.typ === 'flaechenlicht') return { id: l.id, typ: 'flaeche', position: m(l.position), richtung: [l.richtung.x, l.richtung.y, l.richtung.z], breite: l.breite / 1000, tiefe: l.tiefe / 1000, farbe, lumen: l.lumen, einheit: 'lm' };
    return { id: l.id, typ: 'punkt', position: m(l.position), farbe, intensitaet: l.lumen / (4 * Math.PI), einheit: 'cd' };
  });

  return {
    schemaVersion: SCHEMA_VERSION,
    eingabe: e,
    leuchten,
    bearbeitungen,
    stueckliste,
    netzteile,
    kabel: { gesamtM: r2(kabelGesamt), je: kabelLaengen, netzteilPosition: vRund(npos) },
    beleuchtung,
    renderLichter,
    summe: { watt: r2(leuchten.reduce((s, l) => s + l.watt, 0)), lumen: r1(leuchten.reduce((s, l) => s + l.lumen, 0)), anzahl: leuchten.length },
    pruefungen,
    gueltig: !pruefungen.some((p) => p.schwere === 'fehler'),
  };
}

/** Punkt 0,01 mm in Richtung v verschieben (Strahler bzw. Messpunkt liegt knapp vor der Fläche). */
function versetzt(p, v) {
  return { x: p.x + v.x * 0.01, y: p.y + v.y * 0.01, z: p.z + v.z * 0.01 };
}

/** Profil-Zuschnitt aus Stangen (First-Fit-Decreasing, 3 mm Sägeschnitt). */
function stangenZuschnitt(laengen) {
  const reste = [];
  for (const l of [...laengen].sort((a, b) => b - a)) {
    const bedarf = l + 3;
    const i = reste.findIndex((r) => r >= bedarf);
    if (i >= 0) reste[i] -= bedarf;
    else reste.push(Math.max(0, PROFIL_STANGE - bedarf));
  }
  return reste.length + laengen.filter((l) => l > PROFIL_STANGE).reduce((s, l) => s + Math.ceil(l / PROFIL_STANGE) - 1, 0);
}
