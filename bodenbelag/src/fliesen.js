// Fliesen-Berechnung: Verlegeplan mit Fugen, Bedarf in Kartons, Kleber, Fugenmörtel, Abdichtung, Prüfungen.

import {
  FLIESENARTEN, FLIESEN_MUSTER, FLIESEN_DIAGONAL_ZUSCHLAG, RAUMTYPEN, RUTSCHHEMMUNG, ABRIEBKLASSEN,
  FLIESEN_OPTIKEN, FUGENFARBEN,
} from './fliesen-katalog.js';
import { verlegeflaeche, erzeugePlan, benoetigteTeile, schmaleRandreihe } from './plan.js';

export const FLIESEN_SCHEMA_VERSION = '1.0.0';
const EPS = 1e-6;
const SCHNITT = 3; // mm Nassschnitt
const KLEBER_SACK = 25; // kg
const FUGE_SACK = 5; // kg
const r1 = (v) => Math.round(v * 10) / 10 || 0;
const r2 = (v) => Math.round(v * 100) / 100 || 0;
const de1 = (v) => String(r1(v)).replace('.', ',');
const de2 = (v) => String(r2(v)).replace('.', ',');

/** Kleberverbrauch in kg/m² je Zahnung (Richtwerte aus Herstellertabellen). */
export const KLEBER_JE_ZAHNUNG = Object.freeze({ 4: 1.7, 6: 2.0, 8: 2.8, 10: 3.6, 12: 4.4 });
export const BUTTERING_ZUSCHLAG = 1.0; // kg/m² beim kombinierten Verfahren

/** Zahnung nach längster Kante: ≤ 10 cm → 4, ≤ 30 cm → 6, ≤ 60 cm → 8, darüber 10 mm. */
export function zahnungFuer(laenge, breite) {
  const k = Math.max(laenge, breite);
  if (k <= 100) return 4;
  if (k <= 300) return 6;
  if (k <= 600) return 8;
  return 10;
}

/** Fugenmörtel kg/m² = (A + B) / (A · B) · Fugenbreite · Fugentiefe · 1,6 (A, B, Fuge in mm). */
export function fugenmoertelJeM2(a, b, fuge, tiefe) {
  return ((a + b) / (a * b)) * fuge * tiefe * 1.6;
}

function zahl(v, name, { positiv = true } = {}) {
  if (typeof v !== 'number' || !Number.isFinite(v) || (positiv && v <= 0)) {
    throw new TypeError(`${name} muss eine positive Zahl sein (erhalten: ${JSON.stringify(v)})`);
  }
  return v;
}

export function normalisiereFliesen(eingabe) {
  if (!eingabe || typeof eingabe !== 'object' || Array.isArray(eingabe)) throw new TypeError('Eingabe muss ein Objekt { raum, fliese, verlegung } sein');
  const raumRoh = eingabe.raum ?? {};
  const fRoh = eingabe.fliese ?? {};
  const vRoh = eingabe.verlegung ?? {};
  const art = String(fRoh.art ?? 'feinsteinzeug');
  const k = FLIESENARTEN[art];
  const [stdL, stdB] = k?.formate[0] ?? [600, 600];
  const laenge = zahl(fRoh.laenge ?? stdL, 'fliese.laenge');
  const breite = zahl(fRoh.breite ?? stdB, 'fliese.breite');
  const raum = {
    laenge: zahl(raumRoh.laenge ?? 4000, 'raum.laenge'),
    breite: zahl(raumRoh.breite ?? 3000, 'raum.breite'),
    raumtyp: String(raumRoh.raumtyp ?? 'wohnraum'),
    aussparungen: (raumRoh.aussparungen ?? []).map((a, i) => ({
      name: String(a.name ?? `Aussparung ${i + 1}`),
      x: zahl(a.x ?? 0, `raum.aussparungen[${i}].x`, { positiv: false }),
      y: zahl(a.y ?? 0, `raum.aussparungen[${i}].y`, { positiv: false }),
      laenge: zahl(a.laenge, `raum.aussparungen[${i}].laenge`),
      breite: zahl(a.breite, `raum.aussparungen[${i}].breite`),
    })),
    tueren: (raumRoh.tueren ?? []).map((t, i) => ({
      breite: zahl(t.breite ?? 900, `raum.tueren[${i}].breite`),
      wand: ['unten', 'oben', 'links', 'rechts'].includes(t.wand) ? t.wand : 'unten',
      position: zahl(t.position ?? 300, `raum.tueren[${i}].position`, { positiv: false }),
    })),
  };
  const fliese = {
    art,
    laenge,
    breite,
    staerke: zahl(fRoh.staerke ?? k?.staerke ?? 10, 'fliese.staerke'),
    optik: String(fRoh.optik ?? k?.optik ?? 'beton'),
    rutschhemmung: String(fRoh.rutschhemmung ?? RAUMTYPEN[raum.raumtyp]?.rutsch ?? 'R10'),
    abriebklasse: fRoh.abriebklasse === undefined ? (k?.pei ?? null) : fRoh.abriebklasse,
    stueckProKarton: Math.round(zahl(fRoh.stueckProKarton ?? Math.max(1, Math.round(1.44e6 / (laenge * breite))), 'fliese.stueckProKarton')),
    preisProM2: fRoh.preisProM2 == null ? null : zahl(fRoh.preisProM2, 'fliese.preisProM2', { positiv: false }),
  };
  const verlegung = {
    muster: String(vRoh.muster ?? k?.muster[0] ?? 'kreuzfuge'),
    drehung: zahl(vRoh.drehung ?? 0, 'verlegung.drehung', { positiv: false }),
    fugenbreite: zahl(vRoh.fugenbreite ?? k?.fuge[1] ?? 3, 'verlegung.fugenbreite'),
    fugenfarbe: String(vRoh.fugenfarbe ?? 'grau'),
    randfuge: zahl(vRoh.randfuge ?? 5, 'verlegung.randfuge', { positiv: false }),
    zahnung: zahl(vRoh.zahnung ?? zahnungFuer(laenge, breite), 'verlegung.zahnung'),
    startwert: Math.round(zahl(vRoh.startwert ?? 1, 'verlegung.startwert', { positiv: false })),
  };
  return { belag: 'fliesen', raum, fliese, verlegung };
}

export function berechneFliesen(eingabe) {
  const e = normalisiereFliesen(eingabe);
  const { raum, fliese: f, verlegung: v } = e;
  const pruefungen = [];
  const melde = (schwere, code, meldung) => pruefungen.push({ schwere, code, meldung });

  const art = FLIESENARTEN[f.art];
  const muster = FLIESEN_MUSTER[v.muster];
  const raumtyp = RAUMTYPEN[raum.raumtyp];
  if (!art) melde('fehler', 'ART_UNBEKANNT', `Unbekannte Fliesenart „${f.art}"`);
  if (!muster) melde('fehler', 'MUSTER_UNBEKANNT', `Unbekanntes Verlegemuster „${v.muster}"`);
  if (!raumtyp) melde('fehler', 'RAUMTYP_UNBEKANNT', `Unbekannter Raumtyp „${raum.raumtyp}"`);
  if (!FLIESEN_OPTIKEN[f.optik]) melde('warnung', 'OPTIK_UNBEKANNT', `Optik „${f.optik}" ist nicht im Katalog`);
  if (!RUTSCHHEMMUNG.includes(f.rutschhemmung)) melde('fehler', 'RUTSCHHEMMUNG_UNBEKANNT', `Rutschhemmung „${f.rutschhemmung}" (erlaubt: ${RUTSCHHEMMUNG.join(', ')})`);

  if (art && muster && !art.muster.includes(v.muster)) {
    melde('fehler', 'MUSTER_NICHT_PASSEND', `${art.name} wird nicht im Muster „${muster.name}" verlegt (möglich: ${art.muster.map((m) => FLIESEN_MUSTER[m].name).join(', ')})`);
  }
  if (art && raumtyp) {
    const bereich = raumtyp.aussen ? 'aussen' : 'boden_innen';
    if (!art.einsatz.includes(bereich)) {
      melde('fehler', raumtyp.aussen ? 'NICHT_FUER_AUSSEN' : 'NICHT_FUER_BODEN', `${art.name} ist nicht für ${raumtyp.aussen ? 'den Außenbereich' : 'Böden'} geeignet`);
    }
    if (raumtyp.aussen && art.frostsicher !== true) {
      melde(art.frostsicher === false ? 'fehler' : 'warnung', 'NICHT_FROSTSICHER',
        art.frostsicher === false ? `${art.name} ist nicht frostsicher` : `${art.name}: Frostsicherheit hängt vom Produkt ab – nur frostsichere Ware (Wasseraufnahme ≤ 3 %) verwenden`);
    }
    if (RUTSCHHEMMUNG.indexOf(f.rutschhemmung) < RUTSCHHEMMUNG.indexOf(raumtyp.rutsch)) {
      melde('warnung', 'RUTSCHHEMMUNG', `${raumtyp.name}: Rutschhemmung ${f.rutschhemmung} unter der Empfehlung ${raumtyp.rutsch} (DIN 51130, Richtwert)`);
    }
    if (f.abriebklasse && ABRIEBKLASSEN.indexOf(f.abriebklasse) < ABRIEBKLASSEN.indexOf(raumtyp.pei)) {
      melde('warnung', 'ABRIEBKLASSE', `${raumtyp.name}: Abriebklasse PEI ${f.abriebklasse} unter der Empfehlung PEI ${raumtyp.pei}`);
    }
    if (raumtyp.abdichtung) melde('hinweis', 'ABDICHTUNG', `${raumtyp.name}: Verbundabdichtung mit Dichtband an Wandanschlüssen einplanen (DIN 18534)`);
  }
  if (art && v.fugenbreite < art.fuge[0] - EPS) {
    melde('warnung', 'FUGE_SCHMAL', `Fuge ${v.fugenbreite} mm ist für ${art.name} zu schmal (mindestens ${art.fuge[0]} mm)`);
  }
  const lang = Math.max(f.laenge, f.breite);
  if (v.muster === 'halbverband' && lang >= 600 && f.laenge !== f.breite) {
    melde('warnung', 'UEBERZAHN', `Kantenlänge ${lang} mm im Halbverband: Überzahn durch Wölbung droht – höchstens ⅓-Versatz verlegen`);
  }
  if (lang >= 1200) melde('hinweis', 'GROSSFORMAT', 'Großformat: kombiniertes Verfahren (Buttering-Floating) und erhöhte Ebenheit des Untergrunds nötig');
  if (raumtyp?.aussen && Math.max(raum.laenge, raum.breite) > 4000) {
    melde('warnung', 'BEWEGUNGSFUGE', 'Außen: Feldbegrenzungsfugen ca. alle 3–4 m einplanen (Richtwert)');
  } else if (Math.max(raum.laenge, raum.breite) > 8000) {
    melde('hinweis', 'BEWEGUNGSFUGE', 'Fläche über 8 m: Bewegungsfugen des Estrichs in den Belag übernehmen');
  }

  // Fläche und Plan
  const vf = verlegeflaeche(raum, v.randfuge, melde);
  const familie = muster?.familie;
  const plan = familie
    ? erzeugePlan({ feld: vf.feld, loecher: vf.loecher, familie, laenge: f.laenge, breite: f.breite, fuge: v.fugenbreite, versatz: muster.versatz ?? null, drehung: v.drehung, startwert: v.startwert, streuung: art?.streuung ?? 0.03 })
    : { teile: [], voll: f.laenge * f.breite };
  const teile = plan.teile;
  const ganze = teile.filter((t) => t.ganz).length;
  const benoetigt = benoetigteTeile(teile, { familie, drehung: v.drehung, laenge: f.laenge, schnitt: SCHNITT });

  // Schmale Randstreifen: Reihen (quer) und bei Kreuzfuge auch Spalten (längs)
  const schmal = schmaleRandreihe(vf.feld, { familie, drehung: v.drehung, breite: f.breite, fuge: v.fugenbreite });
  if (schmal) melde('warnung', 'SCHMALE_RANDREIHE', `Letzte Reihe nur ${schmal.rest} mm breit: Raster mittig ausrichten, Randreihen je ${schmal.besaeumt} mm`);
  if (v.muster === 'kreuzfuge') {
    const spalte = schmaleRandreihe(vf.feld, { familie, drehung: v.drehung + 90, breite: f.laenge, fuge: v.fugenbreite });
    if (spalte) melde('warnung', 'SCHMALE_RANDSPALTE', `Letzte Spalte nur ${spalte.rest} mm breit: Raster mittig ausrichten, Randspalten je ${spalte.besaeumt} mm`);
  }

  // Bedarf
  const diagonal = Math.abs(((v.drehung % 90) + 90) % 90) > EPS;
  const richtwert = (muster?.verschnitt ?? 10) + (diagonal ? FLIESEN_DIAGONAL_ZUSCHLAG : 0);
  const nettoM2 = vf.netto / 1e6;
  const fliesenM2 = (f.laenge * f.breite) / 1e6;
  const nachRichtwert = Math.ceil((nettoM2 * (1 + richtwert / 100)) / fliesenM2 - 1e-9);
  const nachPlan = familie === 'verband' && !diagonal ? benoetigt : 0;
  const stueck = Math.max(nachRichtwert, nachPlan);
  if (nachPlan > nachRichtwert) melde('hinweis', 'VERSCHNITT_UEBER_RICHTWERT', `Laut Verlegeplan ${nachPlan} Fliesen nötig (Richtwert ${richtwert} % ergäbe ${nachRichtwert}): Bestellung nach Plan`);
  const kartons = Math.ceil(stueck / f.stueckProKarton);
  const bestellM2 = kartons * f.stueckProKarton * fliesenM2;
  // Fliesen inkl. ihres Fugenanteils gegen die Verlegefläche
  const geometrisch = vf.netto > 0 ? (benoetigt * (f.laenge + v.fugenbreite) * (f.breite + v.fugenbreite) - vf.netto) / vf.netto : 0;

  // Material
  const material = [{
    position: `${art?.name ?? f.art}, ${FLIESEN_OPTIKEN[f.optik]?.name ?? f.optik}, ${f.laenge / 10} × ${f.breite / 10} cm`,
    menge: kartons, einheit: 'Kartons',
    detail: `${kartons * f.stueckProKarton} ${f.art === 'mosaik' ? 'Matten' : 'Fliesen'} (${f.stueckProKarton} je Karton) = ${de2(bestellM2)} m² · ${f.rutschhemmung}${f.abriebklasse ? ` · PEI ${f.abriebklasse}` : ''}`,
  }];
  const buttering = lang > 600 || raumtyp?.aussen;
  const kleberJeM2 = (KLEBER_JE_ZAHNUNG[v.zahnung] ?? v.zahnung * 0.36) + (buttering ? BUTTERING_ZUSCHLAG : 0);
  const kleberKg = nettoM2 * kleberJeM2;
  material.push({ position: `Fliesenkleber${lang >= 600 ? ' (C2, verformbar S1)' : ' (C1/C2)'}`, menge: Math.ceil(kleberKg / KLEBER_SACK), einheit: `Sack à ${KLEBER_SACK} kg`, detail: `${de1(kleberKg)} kg · Zahnung ${v.zahnung} mm ≈ ${de1(kleberJeM2)} kg/m²${buttering ? ' inkl. Buttering-Floating' : ''}` });
  const stein = art?.mosaikStein ?? null;
  const fugeJeM2 = stein ? fugenmoertelJeM2(stein, stein, v.fugenbreite, f.staerke) : fugenmoertelJeM2(f.laenge, f.breite, v.fugenbreite, f.staerke);
  const fugeKg = nettoM2 * fugeJeM2 * 1.1;
  material.push({ position: `Fugenmörtel (${FUGENFARBEN[v.fugenfarbe]?.name ?? v.fugenfarbe})`, menge: Math.max(1, Math.ceil(fugeKg / FUGE_SACK)), einheit: `Sack à ${FUGE_SACK} kg`, detail: `${de1(fugeKg)} kg · ${de2(fugeJeM2)} kg/m² bei Fuge ${v.fugenbreite} × ${f.staerke} mm, inkl. 10 %` });
  material.push({ position: 'Grundierung / Tiefgrund', menge: r2(nettoM2 * 0.15), einheit: 'l', detail: 'ca. 0,15 l/m²' });
  const umfang = 2 * (raum.laenge + raum.breite) - raum.tueren.reduce((s, t) => s + t.breite, 0);
  if (raumtyp?.abdichtung) {
    material.push({ position: 'Flüssigabdichtung (2 Lagen)', menge: r2(nettoM2 * 1.5), einheit: 'kg', detail: 'ca. 1,5 kg/m², Herstellerangabe beachten' });
    material.push({ position: 'Dichtband + Innenecken', menge: r2((umfang / 1000) * 1.1), einheit: 'm', detail: `Wandanschluss rundum, dazu ${4 + raum.aussparungen.length * 4} Dichtecken` });
  }
  if (lang >= 600) {
    material.push({ position: 'Nivelliersystem (Laschen)', menge: Math.ceil(stueck * 3), einheit: 'Stück', detail: 'ca. 3 je Fliese gegen Überzahn' });
  } else if (!stein) {
    material.push({ position: 'Fliesenkreuze', menge: Math.ceil(stueck * 1.1), einheit: 'Stück', detail: `${v.fugenbreite} mm` });
  }
  if (raumtyp && !raumtyp.aussen) {
    const streifen = Math.max(1, Math.floor((f.breite + EPS) / 70));
    material.push({ position: 'Sockel aus Fliesen (7 cm)', menge: Math.ceil((umfang / f.laenge) / streifen), einheit: 'Fliesen', detail: `${de2(umfang / 1000)} m Sockel, ${streifen} Streifen je Fliese` });
  }
  material.push({ position: 'Silikon (Rand- und Anschlussfugen)', menge: Math.max(1, Math.ceil((umfang / 1000) / 8)), einheit: 'Kartuschen', detail: `${de2(umfang / 1000)} m, ca. 8 m je 310-ml-Kartusche` });
  if (art?.impraegnieren) material.push({ position: 'Imprägnierung', menge: r2(nettoM2 * 0.1), einheit: 'l', detail: 'vor dem Verfugen und danach, ca. 0,1 l/m²' });
  if (raum.tueren.length) material.push({ position: 'Übergangsprofil', menge: raum.tueren.length, einheit: 'Stück', detail: `je Tür, ${raum.tueren.map((t) => t.breite).join(' / ')} mm` });

  return {
    schemaVersion: FLIESEN_SCHEMA_VERSION,
    belag: 'fliesen',
    eingabe: e,
    flaechen: {
      raumM2: r2(vf.raumFlaeche / 1e6),
      aussparungenM2: r2(vf.aussparungFlaeche / 1e6),
      verlegeflaecheM2: r2(nettoM2),
      randabstand: v.randfuge,
      feld: { ...vf.feld },
    },
    verschnitt: {
      richtwertProzent: richtwert,
      geometrischProzent: r1(geometrisch * 100),
      hinweis: 'Richtwert für die Bestellung; geometrisch = Fliesen laut Plan (Verband mit Restverwertung, sonst je Zuschnitt eine Fliese)',
    },
    bedarf: {
      fliesen: stueck, kartons, bestellM2: r2(bestellM2), teileImPlan: teile.length, ganze, zuschnitte: teile.length - ganze,
      benoetigtLautPlan: benoetigt, kosten: f.preisProM2 == null ? null : r2(bestellM2 * f.preisProM2),
    },
    material,
    teile,
    pruefungen,
    gueltig: !pruefungen.some((p) => p.schwere === 'fehler'),
  };
}
