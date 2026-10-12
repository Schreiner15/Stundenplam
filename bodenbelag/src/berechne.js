// Parkett-Berechnung: Eingabe normalisieren → Verlegeplan erzeugen → Flächen, Bedarf, Material, Prüfungen.

import {
  PARKETTARTEN, MUSTER, VERLEGEARTEN, HOLZARTEN, SORTIERUNGEN, DIAGONAL_ZUSCHLAG,
} from './katalog.js';
import { verlegeflaeche, erzeugePlan, benoetigteTeile, schmaleRandreihe } from './plan.js';

export const SCHEMA_VERSION = '1.0.0';
export const MAX_RAUMLAENGE_SCHWIMMEND = 10000; // mm, Richtwert ohne Bewegungsfuge
const LEISTENLAENGE = 2400;
const SAEGESCHNITT = 3; // mm Schnittfuge je Zuschnitt
const EPS = 1e-6;

const r1 = (v) => Math.round(v * 10) / 10 || 0;
const r2 = (v) => Math.round(v * 100) / 100 || 0;
const de1 = (v) => String(r1(v)).replace('.', ',');
const de2 = (v) => String(r2(v)).replace('.', ',');

function zahl(v, name, { positiv = true } = {}) {
  if (typeof v !== 'number' || !Number.isFinite(v) || (positiv && v <= 0)) {
    throw new TypeError(`${name} muss eine positive Zahl sein (erhalten: ${JSON.stringify(v)})`);
  }
  return v;
}

/** Empfohlener Randabstand (Wandfuge): schwimmend 1,5 mm je m Raumlänge, mindestens 10 mm. */
export function empfohlenerRandabstand(verlegeart, laenge, breite) {
  if (verlegeart === 'schwimmend') return Math.max(10, Math.ceil(1.5 * (Math.max(laenge, breite) / 1000)));
  return 10;
}

export function normalisiere(eingabe) {
  if (!eingabe || typeof eingabe !== 'object' || Array.isArray(eingabe)) throw new TypeError('Eingabe muss ein Objekt { raum, parkett, verlegung } sein');
  const raumRoh = eingabe.raum ?? {};
  const parkettRoh = eingabe.parkett ?? {};
  const verlegungRoh = eingabe.verlegung ?? {};
  const art = String(parkettRoh.art ?? 'landhausdiele');
  const katalog = PARKETTARTEN[art];
  const standard = katalog?.masse ?? { laenge: 1900, breite: 190, staerke: 14 };

  const raum = {
    laenge: zahl(raumRoh.laenge ?? 5000, 'raum.laenge'),
    breite: zahl(raumRoh.breite ?? 4000, 'raum.breite'),
    aussparungen: (raumRoh.aussparungen ?? []).map((a, i) => ({
      name: String(a.name ?? `Aussparung ${i + 1}`),
      x: zahl(a.x ?? 0, `raum.aussparungen[${i}].x`, { positiv: false }),
      y: zahl(a.y ?? 0, `raum.aussparungen[${i}].y`, { positiv: false }),
      laenge: zahl(a.laenge, `raum.aussparungen[${i}].laenge`),
      breite: zahl(a.breite, `raum.aussparungen[${i}].breite`),
    })),
    tueren: (raumRoh.tueren ?? []).map((t, i) => ({
      breite: zahl(t.breite ?? 900, `raum.tueren[${i}].breite`),
      wand: ['unten', 'oben', 'links', 'rechts'].includes(t.wand) ? t.wand : 'unten', // nur für die Zeichnung
      position: zahl(t.position ?? 300, `raum.tueren[${i}].position`, { positiv: false }),
    })),
  };
  const parkett = {
    art,
    laenge: zahl(parkettRoh.laenge ?? standard.laenge, 'parkett.laenge'),
    breite: zahl(parkettRoh.breite ?? standard.breite, 'parkett.breite'),
    staerke: zahl(parkettRoh.staerke ?? standard.staerke, 'parkett.staerke'),
    holzart: String(parkettRoh.holzart ?? 'eiche'),
    sortierung: String(parkettRoh.sortierung ?? 'natur'),
    paketInhalt: zahl(parkettRoh.paketInhalt ?? katalog?.paketInhalt ?? 2, 'parkett.paketInhalt'),
    preisProM2: parkettRoh.preisProM2 == null ? null : zahl(parkettRoh.preisProM2, 'parkett.preisProM2', { positiv: false }),
  };
  const verlegeart = String(verlegungRoh.art ?? katalog?.verlegung[0] ?? 'verklebt');
  const verlegung = {
    muster: String(verlegungRoh.muster ?? katalog?.muster[0] ?? 'englisch'),
    drehung: zahl(verlegungRoh.drehung ?? 0, 'verlegung.drehung', { positiv: false }),
    art: verlegeart,
    randabstand: verlegungRoh.randabstand == null
      ? empfohlenerRandabstand(verlegeart, raum.laenge, raum.breite)
      : zahl(verlegungRoh.randabstand, 'verlegung.randabstand', { positiv: false }),
    randabstandAuto: verlegungRoh.randabstand == null,
    startwert: Math.round(zahl(verlegungRoh.startwert ?? 1, 'verlegung.startwert', { positiv: false })),
  };
  return { raum, parkett, verlegung };
}

export function berechneParkett(eingabe) {
  const e = normalisiere(eingabe);
  const { raum, parkett: p, verlegung: v } = e;
  const pruefungen = [];
  const melde = (schwere, code, meldung) => pruefungen.push({ schwere, code, meldung });

  const art = PARKETTARTEN[p.art];
  const muster = MUSTER[v.muster];
  if (!art) melde('fehler', 'ART_UNBEKANNT', `Unbekannte Parkettart „${p.art}"`);
  if (!muster) melde('fehler', 'MUSTER_UNBEKANNT', `Unbekanntes Verlegemuster „${v.muster}"`);
  if (!VERLEGEARTEN[v.art]) melde('fehler', 'VERLEGEART_UNBEKANNT', `Unbekannte Verlegeart „${v.art}"`);
  if (!HOLZARTEN[p.holzart]) melde('warnung', 'HOLZART_UNBEKANNT', `Holzart „${p.holzart}" ist nicht im Katalog`);

  if (art && muster && !art.muster.includes(v.muster)) {
    melde('fehler', 'MUSTER_NICHT_PASSEND', `${art.name} wird nicht im Muster „${muster.name}" verlegt (möglich: ${art.muster.map((m) => MUSTER[m].name).join(', ')})`);
  }
  if (art && VERLEGEARTEN[v.art] && !art.verlegung.includes(v.art)) {
    melde('fehler', 'VERLEGEART_NICHT_PASSEND', `${art.name} kann nicht ${VERLEGEARTEN[v.art].name} verlegt werden (möglich: ${art.verlegung.map((x) => VERLEGEARTEN[x].name).join(', ')})`);
  }
  if (art) {
    for (const m of ['laenge', 'breite', 'staerke']) {
      const [min, max] = art.bereich[m];
      if (p[m] < min || p[m] > max) melde('warnung', 'MASS_UNUEBLICH', `${m[0].toUpperCase() + m.slice(1)} ${p[m]} mm ist für ${art.name} unüblich (üblich ${min}–${max} mm)`);
    }
  }

  // Flächen
  const rand = v.randabstand;
  const empfohlen = empfohlenerRandabstand(v.art, raum.laenge, raum.breite);
  if (rand < empfohlen - EPS) melde('warnung', 'RANDABSTAND_KLEIN', `Randabstand ${rand} mm < empfohlen ${empfohlen} mm (Holz arbeitet; Herstellerangabe prüfen)`);
  if (v.art === 'schwimmend' && Math.max(raum.laenge, raum.breite) > MAX_RAUMLAENGE_SCHWIMMEND) {
    melde('warnung', 'BEWEGUNGSFUGE', `Raum länger als ${MAX_RAUMLAENGE_SCHWIMMEND / 1000} m: bei schwimmender Verlegung Bewegungsfuge einplanen oder verkleben`);
  }
  if (v.art === 'schwimmend' && raum.tueren.length) {
    melde('hinweis', 'TUERFUGE', `Schwimmend: an ${raum.tueren.length === 1 ? 'der Tür' : `allen ${raum.tueren.length} Türen`} Trennfuge mit Übergangsprofil setzen`);
  }

  const vf = verlegeflaeche(raum, rand, melde);
  const { feld, raumFlaeche, aussparungFlaeche } = vf;
  const flaecheNetto = vf.netto;

  // Verlegeplan
  const familie = muster?.familie;
  const sortierung = SORTIERUNGEN[p.sortierung] ?? SORTIERUNGEN.natur;
  const plan = familie
    ? erzeugePlan({ feld, loecher: vf.loecher, familie, laenge: p.laenge, breite: p.breite, versatz: muster.versatz ?? null, drehung: v.drehung, startwert: v.startwert, streuung: sortierung.streuung })
    : { teile: [], voll: p.laenge * p.breite };
  const staebe = plan.teile;
  const ganze = staebe.filter((s) => s.ganz).length;
  const zuschnitte = staebe.length - ganze;
  const staebeBenoetigt = benoetigteTeile(staebe, { familie, drehung: v.drehung, laenge: p.laenge, schnitt: SAEGESCHNITT });
  const geometrisch = flaecheNetto > 0 ? (staebeBenoetigt * plan.voll - flaecheNetto) / flaecheNetto : 0;

  const schmal = schmaleRandreihe(feld, { familie, drehung: v.drehung, breite: p.breite });
  if (schmal) melde('warnung', 'SCHMALE_RANDREIHE', `Letzte Reihe nur ${schmal.rest} mm breit: erste und letzte Reihe auf je ${schmal.besaeumt} mm besäumen`);

  // Bedarf
  const diagonal = Math.abs(((v.drehung % 90) + 90) % 90) > EPS;
  const richtwert = (muster?.verschnitt ?? 10) + (diagonal ? DIAGONAL_ZUSCHLAG : 0);
  // Beim Verband ist der Plan mit Restverwertung belastbar: bestellt wird der höhere Wert
  const nachRichtwert = (flaecheNetto / 1e6) * (1 + richtwert / 100);
  const nachPlan = familie === 'verband' ? (staebeBenoetigt * plan.voll) / 1e6 : 0;
  const bedarfM2 = Math.max(nachRichtwert, nachPlan);
  if (nachPlan > nachRichtwert + EPS) {
    melde('hinweis', 'VERSCHNITT_UEBER_RICHTWERT', `Laut Verlegeplan ${r1(geometrisch * 100)} % Verschnitt (Richtwert ${richtwert} %): Bestellung nach Plan (${staebeBenoetigt} Stäbe)`);
  }
  const pakete = Math.ceil(bedarfM2 / p.paketInhalt - 1e-9);
  const bestellM2 = pakete * p.paketInhalt;
  const stabM2 = plan.voll / 1e6;
  const nettoM2 = flaecheNetto / 1e6;

  // Material
  const material = [{
    position: `${art?.name ?? p.art}, ${HOLZARTEN[p.holzart]?.name ?? p.holzart}, ${SORTIERUNGEN[p.sortierung]?.name ?? p.sortierung}`,
    menge: pakete, einheit: 'Pakete', detail: `${de2(bestellM2)} m² à ${de2(p.paketInhalt)} m²/Paket · ca. ${Math.ceil(bestellM2 / stabM2)} ${familie === 'tafel' ? 'Tafeln' : 'Stäbe'} ${p.laenge} × ${p.breite} × ${p.staerke} mm`,
  }];
  const umfang = 2 * (raum.laenge + raum.breite) - raum.tueren.reduce((s, t) => s + t.breite, 0);
  const leistenM = (umfang / 1000) * 1.05;
  material.push({ position: 'Sockelleiste', menge: Math.ceil((leistenM * 1000) / LEISTENLAENGE), einheit: 'Stück', detail: `${de2(leistenM)} m inkl. 5 % Verschnitt, à ${LEISTENLAENGE / 1000} m` });
  if (raum.tueren.length) material.push({ position: 'Übergangsprofil', menge: raum.tueren.length, einheit: 'Stück', detail: `je Tür, ${raum.tueren.map((t) => t.breite).join(' / ')} mm` });
  if (v.art === 'schwimmend') {
    material.push({ position: 'Trittschalldämmung', menge: r2(nettoM2 * 1.05), einheit: 'm²', detail: 'inkl. 5 % Verschnitt' });
    material.push({ position: 'PE-Folie 0,2 mm (Dampfbremse)', menge: r2(nettoM2 * 1.1), einheit: 'm²', detail: 'nur auf mineralischem Untergrund, 20 cm Überlappung' });
  } else if (v.art === 'verklebt') {
    const kgJeM2 = art?.aufbau.startsWith('Mehrschicht') ? 0.9 : 1.1;
    material.push({ position: 'Parkettklebstoff', menge: r2(nettoM2 * kgJeM2), einheit: 'kg', detail: `ca. ${kgJeM2} kg/m² (Zahnspachtel laut Kleberhersteller)` });
    material.push({ position: 'Grundierung', menge: r2(nettoM2 * 0.15), einheit: 'l', detail: 'ca. 0,15 l/m², Estrich vorher auf Restfeuchte prüfen' });
  } else if (v.art === 'genagelt') {
    material.push({ position: 'Parkettnägel / -klammern', menge: Math.ceil((nettoM2 / stabM2) * Math.max(2, Math.ceil(p.laenge / 300))), einheit: 'Stück', detail: 'verdeckt in der Feder, ca. alle 30 cm' });
  }
  if (art && !art.werkfertig) {
    material.push({ position: 'Oberflächenbehandlung (Lack oder Öl)', menge: r2(nettoM2 * 0.3), einheit: 'l', detail: 'unbehandelt: nach dem Verlegen schleifen, 3 Aufträge à ca. 0,1 l/m²' });
  }
  const kosten = p.preisProM2 == null ? null : r2(bestellM2 * p.preisProM2);

  return {
    schemaVersion: SCHEMA_VERSION,
    eingabe: e,
    flaechen: {
      raumM2: r2(raumFlaeche / 1e6),
      aussparungenM2: r2(aussparungFlaeche / 1e6),
      verlegeflaecheM2: r2(nettoM2),
      randabstand: rand,
      randabstandEmpfohlen: empfohlen,
      feld: { x0: feld.x0, y0: feld.y0, x1: feld.x1, y1: feld.y1 },
    },
    verschnitt: {
      richtwertProzent: richtwert,
      geometrischProzent: r1(geometrisch * 100),
      hinweis: 'Richtwert für die Bestellung; geometrisch = Stäbe laut Plan (Verband mit Restverwertung, andere Muster je Zuschnitt ein Stab)',
    },
    bedarf: {
      bedarfM2: r2(bedarfM2), pakete, bestellM2: r2(bestellM2),
      staebeImPlan: staebe.length, ganzeStaebe: ganze, zuschnitte, staebeBenoetigt, stabFlaecheM2: Math.round(stabM2 * 1e5) / 1e5, kosten,
    },
    material,
    staebe,
    pruefungen,
    gueltig: !pruefungen.some((x) => x.schwere === 'fehler'),
  };
}
