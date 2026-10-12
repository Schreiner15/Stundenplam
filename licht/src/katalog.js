// Katalog: LED-Profile, Spots, Netzteilgrößen. Richtwerte typischer Möbelleuchten (Herstellerangaben haben Vorrang).

function frieren(o) {
  for (const v of Object.values(o)) if (v && typeof v === 'object') frieren(v);
  return Object.freeze(o);
}

/** Alu-Profile für LED-Streifen. Wirkungsgrad = Anteil des Streifen-Lichtstroms hinter dem Diffusor. */
export const PROFILE = frieren({
  einbau: { name: 'Alu-Einbauprofil (eingenutet)', nutBreite: 18, nutTiefe: 8, wirkungsgrad: 0.8, endkappe: 5, diffusor: 'opal', neigung: 0 },
  aufbau: { name: 'Alu-Aufbauprofil', nutBreite: 0, nutTiefe: 0, wirkungsgrad: 0.85, endkappe: 5, diffusor: 'opal', neigung: 0 },
  eck: { name: 'Alu-Eckprofil 45°', nutBreite: 0, nutTiefe: 0, wirkungsgrad: 0.85, endkappe: 5, diffusor: 'opal', neigung: 45 },
});

export const STREIFEN_STANDARD = frieren({
  wattProMeter: 9.6, lumenProMeter: 1000, kelvin: 3000, spannung: 24, schnittraster: 50, abstrahlwinkel: 120, cri: 90,
});

/** Maximale Streifenlänge je Einspeisung (Spannungsabfall), mm. */
export const MAX_STREIFEN_JE_EINSPEISUNG = frieren({ 12: 2500, 24: 5000 });

/** Spots: bohrung = Einbau-Ø (mm); bohrTiefe = Sackloch-Tiefe oder null = durchgehend; 0 = Aufbau ohne Bohrung. */
export const SPOTS = frieren({
  moebelspot58: { name: 'Möbel-Einbauspot Ø 58', bohrung: 58, bohrTiefe: 12, watt: 2.5, lumen: 200, abstrahlwinkel: 40, kelvin: 3000, spannung: 24 },
  einbauspot68: { name: 'Einbauspot Ø 68 (durchgehend)', bohrung: 68, bohrTiefe: null, watt: 5, lumen: 420, abstrahlwinkel: 36, kelvin: 3000, spannung: 24 },
  aufbauspot: { name: 'Aufbauspot rund', bohrung: 0, bohrTiefe: 0, watt: 3, lumen: 250, abstrahlwinkel: 38, kelvin: 3000, spannung: 24 },
});

export const NETZTEIL_GROESSEN = Object.freeze([15, 30, 60, 75, 100, 150, 240]);
export const PROFIL_STANGE = 2000; // mm
export const KABEL = frieren({ nutBreite: 8, nutTiefe: 5, bohrung: 8, reserveMm: 300 });
export const VERTEILER_ANSCHLUESSE = 6;
export const MIN_RANDABSTAND = 15;
export const MIN_RESTWAND = 3;
