# Parametrische Möbelvorlage – Boden-Modul

> Im Ordner [`licht/`](licht/ARCHITEKTUR.md) liegt das **Lichtquellen-Modul** (LED-Profile, Spots, Lux-Berechnung, Bohrungen, Netzteil) mit Vorschau `licht-vorschau.html`.
>
> Im Ordner [`bodenbelag/`](bodenbelag/README.md) liegt der **Parkett- und Fliesenplaner**: Parkett- und Fliesenarten, Verlegemuster, Bedarf und Material mit Live-Vorschau.

Eigenständiges Paket (`@moebelvorlage/boden`) für die Boden-Logik eines Korpus. Es ist von MS Woodwork
getrennt. Die spätere Integration läuft ausschließlich über die öffentliche API in `src/index.js`.

- **Bodentypen:** Unterboden, Oberboden, Zwischen-/Mittelboden, Festboden, Fachboden (Einlegeboden), Schubladenboden
- **Einbauarten:** zwischen den Seiten, durchlaufend (Seiten auf Boden), eingenutet, Gehrung, mit Sockel
- **Verbindungen:** Dübel, Lamello, Exzenter, Konfirmat, Nut/Feder, Fachbodenträger (32-mm-Raster, Ø5), Zapfen
- **Regeln:** automatische Abschnitte und Fächer, Anpassung an Korpusmaße, Kollisionsprüfung mit Seiten, Rückwand und anderen Böden
- **Ausgabe:** Stückliste (Fertigmaß und Zuschnitt), CNC-Bearbeitungen in Teilkoordinaten, JSON, CSV

## Dokumentation

1. [Analyse des bestehenden Boden-Features](docs/01-analyse.md)
2. [Architektur, Datenmodell, Formeln, API](docs/02-architektur.md)

## Benutzung

```js
import { berechne, erstelleVorlage, stuecklisteAlsCSV } from '@moebelvorlage/boden';

const ergebnis = berechne({
  korpus: { breite: 800, hoehe: 2000, tiefe: 560 },
  boeden: [
    { id: 'ub', typ: 'unterboden', einbauart: 'sockel' },
    { id: 'ob', typ: 'oberboden' },
    { id: 'mb', typ: 'mittelboden', position: '50%' },
    { id: 'fb', typ: 'fachboden', abschnitt: 1, anzahl: 3 },
  ],
});

ergebnis.gueltig;        // false, sobald eine Prüfung „fehler" meldet
ergebnis.faecher;        // lichte Fachmaße
ergebnis.bearbeitungen;  // CNC-Daten (Bohrungen, Nuten, Schlitze …)
stuecklisteAlsCSV(ergebnis);
```

## Entwicklung

```bash
npm test          # Unit-Tests (node:test, keine Abhängigkeiten)
npm run vorschau  # Vorschauen: http://localhost:5173 (Möbelböden), /bodenbelag/vorschau.html (Parkett und Fliesen), /licht-vorschau.html (Licht)
```

Benötigt Node.js ≥ 18. Das Paket hat keine Laufzeit-Abhängigkeiten und läuft unverändert im Browser.
