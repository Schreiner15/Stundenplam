// Öffentliche API des Lichtquellen-Moduls.

export { PROFILE, SPOTS, STREIFEN_STANDARD, NETZTEIL_GROESSEN, MAX_STREIFEN_JE_EINSPEISUNG } from './katalog.js';
export { cosExponent, spitzenLichtstaerke, innererKegel, kelvinZuRgb, beleuchtungsstaerke } from './photometrie.js';
export { berechneLicht, normalisiereLicht, SCHEMA_VERSION } from './berechne.js';

/**
 * Beispiel-Beleuchtung für ein Möbel-Ergebnis: Spots im Oberboden, LED-Einbauprofil unter dem Mittelboden.
 * Geprüft wird jeweils der nächste Boden darunter (dort kommt das Licht tatsächlich an).
 */
export function lichtVorlage(moebel) {
  const boeden = moebel.teile.filter((t) => t.kategorie === 'boden' && t.bodenTyp !== 'schubladenboden');
  const unter = (teil) => boeden
    .filter((t) => t !== teil && t.lage.z + t.lage.dz <= teil.lage.z)
    .sort((a, b) => b.lage.z - a.lage.z)[0];
  const ob = boeden.find((t) => t.bodenTyp === 'oberboden');
  const mb = boeden.find((t) => t.bodenTyp === 'mittelboden');
  const leuchten = [];
  const pruefflaechen = [];
  const pruefe = (teil) => {
    const ziel = teil && unter(teil);
    if (ziel) pruefflaechen.push({ name: `${ziel.bezeichnung} ${ziel.id} (oben)`, teil: ziel.id, flaeche: 'oben', sollLux: 300 });
  };
  if (ob) {
    leuchten.push({ id: 'spots', typ: 'spot', modell: 'moebelspot58', befestigung: { teil: ob.id, flaeche: 'unten', anzahl: 3, abstandVorne: 150 } });
    pruefe(ob);
  }
  if (mb) {
    leuchten.push({ id: 'led', typ: 'ledProfil', profil: 'einbau', befestigung: { teil: mb.id, flaeche: 'unten', abstandVorne: 150, rand: 30 } });
    pruefe(mb);
  }
  return { moebel, leuchten, pruefflaechen };
}
