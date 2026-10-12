// Öffentliche API des Moduls „Parametrische Möbelvorlage – Böden".
// Nur diese Datei importieren; alles andere ist intern und kann sich ändern.

export { BodenTyp, Einbauart, Verbindung, ERLAUBT, BEZEICHNUNG, istErlaubt } from './enums.js';
export { SCHEMA_VERSION, KONSTANTEN, normalisiere, verbindungStandard } from './defaults.js';
export { berechne } from './berechne.js';
export { zuJSON, ausJSON, stuecklisteAlsCSV, bearbeitungenAlsCSV } from './ausgabe.js';
export { erstelleVorlage } from './vorlage.js';
