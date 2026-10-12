// Standardwerte und Normalisierung der Eingabe.
// normalisiere() wirft nur bei technisch kaputter Eingabe (TypeError); fachliche Fehler meldet berechne().

import { BodenTyp, Einbauart, Verbindung } from './enums.js';

export const SCHEMA_VERSION = '1.0.0';

export const KONSTANTEN = Object.freeze({
  EPS: 0.01,
  MIN_RESTWAND: 3,
  MIN_FACHHOEHE: 50,
  MIN_AUFLAGE: 10,
  DURCHBIEGUNG_FAKTOR: 42,
  SCHUBLADEN_NORMLAENGEN: Object.freeze([250, 300, 350, 400, 450, 500, 550, 600, 650]),
});

export const KORPUS_STANDARD = Object.freeze({
  breite: 800,
  hoehe: 2000,
  tiefe: 560,
  seitenStaerke: 19,
  materialStaerke: 19,
  material: 'Spanplatte melaminbeschichtet',
  kantenStaerke: 0,
});

export const RUECKWAND_STANDARD = Object.freeze({
  art: 'eingenutet', // 'eingenutet' | 'aufgesetzt' | 'keine'
  staerke: 8,
  abstand: 10,
  nuttiefe: 8,
  luft: 1,
  material: 'HDF',
});

export const SOCKEL_STANDARD = Object.freeze({ hoehe: 100, ruecksprung: 50 });

/** Standardwerte je Verbindung; s = Bodenstärke. */
export function verbindungStandard(verbindung, s) {
  switch (verbindung) {
    case Verbindung.DUEBEL:
      return { durchmesser: 8, laenge: 35, tiefeFlaeche: 12, rand: 32, maxAbstand: 160 };
    case Verbindung.LAMELLO:
      return { groesse: 20, schlitzLaenge: 60, schlitzBreite: 4, tiefe: 12, rand: 50, maxAbstand: 200 };
    case Verbindung.EXZENTER:
      return {
        gehaeuseDurchmesser: 15, gehaeuseTiefe: 12.5, abstand: 34,
        kanalDurchmesser: 8, bolzenDurchmesser: 5, bolzenTiefe: 11, rand: 50, maxAbstand: 300,
      };
    case Verbindung.KONFIRMAT:
      return { durchmesser: 7, senkung: 10, kernDurchmesser: 5, laenge: 50, rand: 50, maxAbstand: 250 };
    case Verbindung.NUT_FEDER:
      return { luft: 0.5 };
    case Verbindung.FACHBODENTRAEGER:
      return { durchmesser: 5, tiefe: 12, reiheVorne: 37, reiheHinten: 37, rasterRand: 32, traegerHoehe: 4, seitenLuft: 1 };
    case Verbindung.ZAPFEN:
      return { laenge: 12, dicke: Math.round(s / 3), breite: 50, rand: 40, maxAbstand: 200, luft: 1 };
    default:
      return {};
  }
}

const TYP_STANDARD = {
  [BodenTyp.UNTERBODEN]: { einbauart: Einbauart.ZWISCHEN, verbindung: Verbindung.DUEBEL, position: null },
  [BodenTyp.OBERBODEN]: { einbauart: Einbauart.ZWISCHEN, verbindung: Verbindung.DUEBEL, position: null },
  [BodenTyp.MITTELBODEN]: { einbauart: Einbauart.ZWISCHEN, verbindung: Verbindung.DUEBEL, position: '50%' },
  [BodenTyp.FESTBODEN]: { einbauart: Einbauart.ZWISCHEN, verbindung: Verbindung.EXZENTER, position: null },
  [BodenTyp.FACHBODEN]: { einbauart: Einbauart.ZWISCHEN, verbindung: Verbindung.FACHBODENTRAEGER, position: null },
  [BodenTyp.SCHUBLADENBODEN]: { einbauart: Einbauart.EINGENUTET, verbindung: Verbindung.NUT_FEDER, position: 5 },
};

export const SCHUBLADE_STANDARD = Object.freeze({
  hoehe: 120,
  zargenStaerke: 16,
  seitenLuft: 12.5,
  laenge: null, // null = größte Normlänge, die in die lichte Tiefe passt
  bodenNutAbstand: 10,
  luftOben: 10,
});

function istObjekt(wert) {
  return wert !== null && typeof wert === 'object' && !Array.isArray(wert);
}

function zahl(wert, name, { positiv = false, null: nullErlaubt = false } = {}) {
  if (wert === null && nullErlaubt) return null;
  if (typeof wert !== 'number' || !Number.isFinite(wert)) {
    throw new TypeError(`${name} muss eine Zahl sein (erhalten: ${JSON.stringify(wert)})`);
  }
  if (positiv && wert <= 0) throw new TypeError(`${name} muss größer als 0 sein`);
  return wert;
}

function zahlenPruefen(objekt, pfad) {
  for (const [k, v] of Object.entries(objekt)) {
    if (v !== null && typeof v !== 'string' && typeof v !== 'object') zahl(v, `${pfad}.${k}`);
  }
  return objekt;
}

function position(wert, name) {
  if (wert === null || wert === undefined) return null;
  if (typeof wert === 'string') {
    if (!/^\s*-?\d+(\.\d+)?\s*%\s*$/.test(wert)) throw new TypeError(`${name} muss eine Zahl oder "NN%" sein`);
    return wert.replace(/\s+/g, '');
  }
  return zahl(wert, name);
}

function normalisiereKorpus(roh) {
  if (!istObjekt(roh)) throw new TypeError('korpus muss ein Objekt sein');
  const k = { ...KORPUS_STANDARD, ...roh };
  for (const name of ['breite', 'hoehe', 'tiefe', 'seitenStaerke', 'materialStaerke']) {
    zahl(k[name], `korpus.${name}`, { positiv: true });
  }
  zahl(k.kantenStaerke, 'korpus.kantenStaerke');
  const rueckwand = { ...RUECKWAND_STANDARD, ...(roh.rueckwand ?? {}) };
  if (!['eingenutet', 'aufgesetzt', 'keine'].includes(rueckwand.art)) {
    throw new TypeError('korpus.rueckwand.art muss "eingenutet", "aufgesetzt" oder "keine" sein');
  }
  rueckwand.nutbreite = roh.rueckwand?.nutbreite ?? rueckwand.staerke;
  zahlenPruefen(rueckwand, 'korpus.rueckwand');
  const sockel = zahlenPruefen({ ...SOCKEL_STANDARD, ...(roh.sockel ?? {}) }, 'korpus.sockel');
  return {
    breite: k.breite,
    hoehe: k.hoehe,
    tiefe: k.tiefe,
    seitenStaerke: k.seitenStaerke,
    materialStaerke: k.materialStaerke,
    material: String(k.material),
    kantenStaerke: k.kantenStaerke,
    rueckwand,
    sockel,
  };
}

function normalisiereBoden(roh, index, korpus, zaehler) {
  if (!istObjekt(roh)) throw new TypeError(`boeden[${index}] muss ein Objekt sein`);
  const typ = String(roh.typ ?? '');
  const std = TYP_STANDARD[typ] ?? { einbauart: Einbauart.ZWISCHEN, verbindung: Verbindung.DUEBEL, position: null };
  zaehler[typ] = (zaehler[typ] ?? 0) + 1;
  const pfad = `boeden[${index}]`;

  const materialstaerke = zahl(
    roh.materialstaerke ?? (typ === BodenTyp.SCHUBLADENBODEN ? 8 : korpus.materialStaerke),
    `${pfad}.materialstaerke`, { positiv: true },
  );
  const verbindung = String(roh.verbindung ?? std.verbindung);
  const boden = {
    id: String(roh.id ?? `${typ || 'boden'}-${zaehler[typ]}`),
    typ,
    einbauart: String(roh.einbauart ?? std.einbauart),
    verbindung,
    materialstaerke,
    material: String(roh.material ?? (typ === BodenTyp.SCHUBLADENBODEN ? 'HDF' : korpus.material)),
    breite: zahl(roh.breite ?? null, `${pfad}.breite`, { positiv: true, null: true }),
    tiefe: zahl(roh.tiefe ?? null, `${pfad}.tiefe`, { positiv: true, null: true }),
    position: position(roh.position ?? std.position, `${pfad}.position`),
    vorderkante: zahl(roh.vorderkante ?? 0, `${pfad}.vorderkante`),
    rueckwandAbstand: zahl(roh.rueckwandAbstand ?? 0, `${pfad}.rueckwandAbstand`),
    nuttiefe: zahl(roh.nuttiefe ?? 8, `${pfad}.nuttiefe`, { positiv: true }),
    nutbreite: zahl(roh.nutbreite ?? materialstaerke, `${pfad}.nutbreite`, { positiv: true }),
  };

  if (typ === BodenTyp.FACHBODEN) {
    boden.lochraster = zahl(roh.lochraster ?? 32, `${pfad}.lochraster`, { positiv: true });
    boden.abschnitt = zahl(roh.abschnitt ?? 0, `${pfad}.abschnitt`);
    boden.anzahl = zahl(roh.anzahl ?? 1, `${pfad}.anzahl`);
  }
  if (typ === BodenTyp.SCHUBLADENBODEN) {
    boden.abschnitt = zahl(roh.abschnitt ?? 0, `${pfad}.abschnitt`);
    boden.schublade = zahlenPruefen({ ...SCHUBLADE_STANDARD, ...(roh.schublade ?? {}) }, `${pfad}.schublade`);
  }

  // Verbindungsparameter: gewählte Verbindung immer vollständig, weitere übergebene Einträge bleiben erhalten
  const vpRoh = istObjekt(roh.verbindungsParameter) ? roh.verbindungsParameter : {};
  const verbindungsParameter = {};
  for (const name of new Set([verbindung, ...Object.keys(vpRoh)])) {
    verbindungsParameter[name] = zahlenPruefen(
      { ...verbindungStandard(name, materialstaerke), ...(vpRoh[name] ?? {}) },
      `${pfad}.verbindungsParameter.${name}`,
    );
  }
  boden.verbindungsParameter = verbindungsParameter;
  return boden;
}

/** Liefert eine neue, vollständig mit Standardwerten gefüllte Eingabe. Die Eingabe bleibt unverändert. */
export function normalisiere(eingabe) {
  if (!istObjekt(eingabe)) throw new TypeError('Eingabe muss ein Objekt { korpus, boeden } sein');
  if (!Array.isArray(eingabe.boeden)) throw new TypeError('boeden muss ein Array sein');
  const korpus = normalisiereKorpus(eingabe.korpus);
  const zaehler = {};
  const boeden = eingabe.boeden.map((b, i) => normalisiereBoden(b, i, korpus, zaehler));
  return { korpus, boeden };
}
