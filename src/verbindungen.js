// CNC-Bearbeitungen je Verbindung.
//
// Eine Fuge verbindet ein Flächenteil (Bohrung/Nut in der Fläche) mit einem Stirnteil (Bohrung/Feder in
// der Kante). Welche Rolle welches Teil hat, bestimmt die Einbauart (siehe berechne.js). Beide Seiten
// liefern ihre Punkte bereits in Teilkoordinaten, deshalb kennen die Generatoren keine Weltkoordinaten.
//
// Flächen-Anschluss  fl = { teil, staerke, innen, aussen, punkt(s) → {x, y}, achse, quer }
//   innen/aussen = { flaeche, richtung, z }; quer = { achse, laenge } (Teilmaß quer zur Fuge, für Falz)
// Stirn-Anschluss    st = { teil, staerke, kante, richtung, punkt(s) → {x, y, z}, achse,
//                           versteckt: { flaeche, richtung, punkt(s, abstand) → {x, y, z} } }

import { Verbindung } from './enums.js';
import { KONSTANTEN } from './defaults.js';
import { verteile } from './raster.js';
import { rundeAlles } from './util.js';

const { EPS, MIN_RESTWAND } = KONSTANTEN;

export function fuegeHinzu(teil, bearbeitung) {
  teil.bearbeitungen.push(rundeAlles({ teil: teil.id, ...bearbeitung }));
}

/** Prüft, ob nach einer Bearbeitung in der Fläche genug Restwand bleibt. */
export function pruefeRestwand(kontext, teil, staerke, tiefe, was, quelle) {
  if (tiefe > staerke - MIN_RESTWAND + EPS) {
    kontext.fehler('RESTWAND', quelle,
      `${was} in ${teil.id}: Tiefe ${tiefe} mm lässt nur ${(staerke - tiefe).toFixed(1)} mm Restwand (min. ${MIN_RESTWAND} mm)`);
  }
}

function flaechenPunkt(fl, s, seite = 'innen') {
  const { x, y } = fl.punkt(s);
  return { flaeche: fl[seite].flaeche, x, y, z: fl[seite].z, richtung: fl[seite].richtung };
}

function stirnPunkt(st, s) {
  return { flaeche: st.kante, ...st.punkt(s), richtung: st.richtung };
}

function duebel(fuge, p, kontext) {
  const { fl, st, quelle } = fuge;
  const tiefeStirn = p.laenge - p.tiefeFlaeche + 2;
  pruefeRestwand(kontext, fl.teil, fl.staerke, p.tiefeFlaeche, 'Dübelbohrung', quelle);
  for (const s of verteile(fuge.von, fuge.bis, p.rand, p.maxAbstand)) {
    fuegeHinzu(fl.teil, { art: 'bohrung', ...flaechenPunkt(fl, s), durchmesser: p.durchmesser, tiefe: p.tiefeFlaeche, quelle, verbindung: Verbindung.DUEBEL });
    fuegeHinzu(st.teil, { art: 'bohrung', ...stirnPunkt(st, s), durchmesser: p.durchmesser, tiefe: tiefeStirn, quelle, verbindung: Verbindung.DUEBEL });
  }
}

function lamello(fuge, p, kontext) {
  const { fl, st, quelle } = fuge;
  pruefeRestwand(kontext, fl.teil, fl.staerke, p.tiefe, 'Lamello-Schlitz', quelle);
  const mass = { laenge: p.schlitzLaenge, breite: p.schlitzBreite, tiefe: p.tiefe };
  for (const s of verteile(fuge.von, fuge.bis, p.rand, p.maxAbstand)) {
    fuegeHinzu(fl.teil, { art: 'schlitz', ...flaechenPunkt(fl, s), achse: fl.achse, ...mass, quelle, verbindung: Verbindung.LAMELLO });
    fuegeHinzu(st.teil, { art: 'schlitz', ...stirnPunkt(st, s), achse: st.achse, ...mass, quelle, verbindung: Verbindung.LAMELLO });
  }
}

function exzenter(fuge, p, kontext) {
  const { fl, st, quelle } = fuge;
  pruefeRestwand(kontext, fl.teil, fl.staerke, p.bolzenTiefe, 'Exzenter-Bolzenbohrung', quelle);
  pruefeRestwand(kontext, st.teil, st.staerke, p.gehaeuseTiefe, 'Exzenter-Gehäusebohrung', quelle);
  for (const s of verteile(fuge.von, fuge.bis, p.rand, p.maxAbstand)) {
    fuegeHinzu(fl.teil, { art: 'bohrung', ...flaechenPunkt(fl, s), durchmesser: p.bolzenDurchmesser, tiefe: p.bolzenTiefe, quelle, verbindung: Verbindung.EXZENTER });
    const v = st.versteckt;
    fuegeHinzu(st.teil, { art: 'bohrung', flaeche: v.flaeche, ...v.punkt(s, p.abstand), richtung: v.richtung, durchmesser: p.gehaeuseDurchmesser, tiefe: p.gehaeuseTiefe, quelle, verbindung: Verbindung.EXZENTER });
    fuegeHinzu(st.teil, { art: 'bohrung', ...stirnPunkt(st, s), durchmesser: p.kanalDurchmesser, tiefe: p.abstand, quelle, verbindung: Verbindung.EXZENTER });
  }
}

function konfirmat(fuge, p) {
  const { fl, st, quelle } = fuge;
  const kernTiefe = p.laenge - fl.staerke + 2;
  for (const s of verteile(fuge.von, fuge.bis, p.rand, p.maxAbstand)) {
    fuegeHinzu(fl.teil, { art: 'bohrung', ...flaechenPunkt(fl, s, 'aussen'), durchmesser: p.durchmesser, tiefe: fl.staerke, senkung: p.senkung, quelle, verbindung: Verbindung.KONFIRMAT });
    fuegeHinzu(st.teil, { art: 'bohrung', ...stirnPunkt(st, s), durchmesser: p.kernDurchmesser, tiefe: kernTiefe, quelle, verbindung: Verbindung.KONFIRMAT });
  }
}

function zapfen(fuge, p, kontext) {
  const { fl, st, quelle } = fuge;
  const lochTiefe = p.laenge + p.luft;
  pruefeRestwand(kontext, fl.teil, fl.staerke, lochTiefe, 'Zapfenloch', quelle);
  for (const s of verteile(fuge.von, fuge.bis, p.rand, p.maxAbstand)) {
    fuegeHinzu(fl.teil, { art: 'tasche', ...flaechenPunkt(fl, s), achse: fl.achse, laenge: p.breite, breite: p.dicke, tiefe: lochTiefe, quelle, verbindung: Verbindung.ZAPFEN });
    const { richtung, ...punkt } = stirnPunkt(st, s);
    fuegeHinzu(st.teil, { art: 'zapfen', ...punkt, achse: st.achse, laenge: p.laenge, breite: p.breite, dicke: p.dicke, quelle, verbindung: Verbindung.ZAPFEN });
  }
}

function nutFeder(fuge, p, kontext) {
  const { fl, st, quelle, nuttiefe, nutbreite } = fuge;
  pruefeRestwand(kontext, fl.teil, fl.staerke, nuttiefe, 'Nut', quelle);
  const von = flaechenPunkt(fl, fuge.von);
  const bis = flaechenPunkt(fl, fuge.bis);
  // Liegt die Nut an der Teilkante, ist es fertigungstechnisch ein Falz
  const mitte = von[fl.quer.achse];
  const falz = mitte - nutbreite / 2 <= EPS || mitte + nutbreite / 2 >= fl.quer.laenge - EPS;
  fuegeHinzu(fl.teil, {
    art: falz ? 'falz' : 'nut', flaeche: von.flaeche,
    von: { x: von.x, y: von.y, z: von.z }, bis: { x: bis.x, y: bis.y, z: bis.z },
    richtung: von.richtung, breite: nutbreite, tiefe: nuttiefe, quelle, verbindung: Verbindung.NUT_FEDER,
  });
  if (nutbreite < st.staerke - EPS) {
    fuegeHinzu(st.teil, {
      art: 'feder', flaeche: st.kante, laenge: nuttiefe - p.luft, dicke: nutbreite,
      versatz: (st.staerke - nutbreite) / 2, quelle, verbindung: Verbindung.NUT_FEDER,
    });
  } else if (nutbreite > st.staerke + EPS) {
    kontext.warnung('NUTBREITE', quelle, `Nutbreite ${nutbreite} mm ist größer als die Bodenstärke ${st.staerke} mm`);
  }
}

const GENERATOREN = {
  [Verbindung.DUEBEL]: duebel,
  [Verbindung.LAMELLO]: lamello,
  [Verbindung.EXZENTER]: exzenter,
  [Verbindung.KONFIRMAT]: konfirmat,
  [Verbindung.ZAPFEN]: zapfen,
  [Verbindung.NUT_FEDER]: nutFeder,
};

/** Erzeugt die Bearbeitungen einer Fuge. */
export function erzeugeVerbindung(fuge, verbindung, parameter, kontext) {
  const generator = GENERATOREN[verbindung];
  if (generator) generator(fuge, parameter, kontext);
}

/** Gehrungsfuge: beide Teile bekommen 45°-Schnitt und (bei Lamello) Schlitze auf der Gehrungsfläche. */
export function erzeugeGehrung(fuge, parameter) {
  const { a, b, quelle } = fuge;
  for (const st of [a, b]) {
    fuegeHinzu(st.teil, { art: 'gehrung', flaeche: st.kante, winkel: 45, quelle, verbindung: 'gehrung' });
  }
  const p = parameter;
  for (const s of verteile(fuge.von, fuge.bis, p.rand, p.maxAbstand)) {
    for (const st of [a, b]) {
      fuegeHinzu(st.teil, {
        art: 'schlitz', ...stirnPunkt(st, s), achse: st.achse, winkel: 45,
        laenge: p.schlitzLaenge, breite: p.schlitzBreite, tiefe: p.tiefe, quelle, verbindung: Verbindung.LAMELLO,
      });
    }
  }
}
