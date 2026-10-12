# Parkett-Verlegeplaner

Eigenständiges Modul für Parkettböden: Parkettarten-Katalog, Verlegemuster als echte Geometrie,
Bedarf und Materialliste, Prüfungen. Reines JavaScript ohne Abhängigkeiten, läuft in Node und im Browser.

```js
import { berechneParkett } from './src/index.js';

const e = berechneParkett({
  raum: { laenge: 5200, breite: 4100, tueren: [{ breite: 900 }], aussparungen: [{ x: 2300, y: 3700, laenge: 900, breite: 400 }] },
  parkett: { art: 'landhausdiele', holzart: 'eiche', sortierung: 'natur', paketInhalt: 2.53, preisProM2: 59.9 },
  verlegung: { muster: 'drittel', drehung: 0, art: 'schwimmend' },
});
e.bedarf;     // Pakete, Bestellfläche, Stäbe laut Plan, Kosten
e.material;   // Parkett, Sockelleisten, Profile, Dämmung/Folie oder Kleber/Grundierung, Oberfläche
e.staebe;     // Verlegeplan: jedes Teil als Polygon (mm), ganz oder Zuschnitt
e.pruefungen; // Fehler / Warnungen / Hinweise
```

Vorschau lokal: `npm run vorschau` im Hauptordner, dann http://localhost:5173/parkett/vorschau.html

## Parkettarten (Katalog)

| Art | Aufbau | Norm | Standardformat L × B × S (mm) | Muster | Verlegung |
|---|---|---|---|---|---|
| Stabparkett | massiv | DIN EN 13226 | 500 × 70 × 22 | Verband, Fischgrät, Würfel | verklebt, genagelt |
| Lamparkett | massiv | DIN EN 13227 | 250 × 50 × 10 | Verband, Fischgrät, Würfel | verklebt |
| Mosaikparkett | massiv | DIN EN 13488 | 120 × 24 × 8 | Würfel | verklebt |
| Hochkantlamellenparkett | massiv | DIN EN 14761 | 160 × 8 × 22 | Englischer/Wilder Verband | verklebt |
| Schiffsboden 3-Stab | Mehrschicht | DIN EN 13489 | 2200 × 207 × 14 | Verband | schwimmend, verklebt |
| Landhausdiele | Mehrschicht | DIN EN 13489 | 1900 × 190 × 14 | Verband | schwimmend, verklebt |
| Massivholzdiele | massiv | DIN EN 13990 | 2500 × 160 × 21 | Verband | genagelt, verklebt |
| Fischgrät-Mehrschichtparkett | Mehrschicht | DIN EN 13489 | 600 × 120 × 14 | Fischgrät | verklebt |
| Chevron-Parkett | Mehrschicht | DIN EN 13489 | 600 × 120 × 14 | Chevron | verklebt |
| Tafelparkett | Mehrschicht | DIN EN 13489 | 600 × 600 × 20 | Tafel | verklebt, genagelt |

Verlegemuster: Englischer Verband, Drittelverband, Wilder Verband (Schiffsbodenmuster), Fischgrät (90°),
Chevron (45°-Stöße), Würfelmuster, Tafelraster; jeweils 0°, 45° (diagonal) oder 90° zur Längswand.

## Richtwerte (bitte mit Herstellerangaben abgleichen)

Die Recherche hat keine verbindlichen Zahlen für Verschnitt und Randabstand ergeben. Verwendet werden
übliche Praxiswerte:

- Verschnitt: Englischer Verband 5 %, Drittel 6 %, Wild 7 %, Würfel/Tafel 8 %, Fischgrät 12 %, Chevron 15 %, diagonal +5 Punkte.
  Beim Verband wird zusätzlich der echte Plan mit Restverwertung gerechnet; bestellt wird der höhere Wert.
- Randabstand: schwimmend 1,5 mm je Meter Raumlänge, mindestens 10 mm; verklebt/genagelt 10 mm.
- Schwimmend über 10 m Raumlänge: Bewegungsfuge (Warnung).
- Klebstoff 0,9 kg/m² (Mehrschicht) bzw. 1,1 kg/m² (massiv), Grundierung 0,15 l/m², Endbehandlung unbehandelter Böden 0,3 l/m².

## Quellen der Recherche

- [heimwerker.de – Parkettarten](https://www.heimwerker.de/parkettarten/)
- [heimwerker.de – Massivparkett oder Mehrschichtparkett](https://www.heimwerker.de/massivparkett-oder-mehrschichtparkett/)
- [Baunetz Wissen – Arten von Parkett](https://www.baunetzwissen.de/boden/fachwissen/_parkett/arten-von-parkett-151764)
- [baustoffshop.de – Parkettarten](https://www.baustoffshop.de/infothek/parkettarten/)
- [OBI – Parkettarten](https://www.obi.de/magazin/bauen/boden/parkettarten)
- [Baunetz Wissen – Verlegemuster für Holzböden](https://www.baunetzwissen.de/boden/fachwissen/holzboeden/verlegemuster-fuer-holzboeden-9880027)
- [selbst.de – Parkett Verlegemuster](https://www.selbst.de/parkett-verlegemuster-63833.html)
- [wohnglueck.de – Parkett verlegen: Verlegemuster](https://wohnglueck.de/artikel/parkett-verlegen-verlegemuster-26070)
- [Hornbach – Fischgrätparkett verlegen](https://www.hornbach.de/projekte/fischgraetparkett-verlegen/)
- [Holzland – Verlegeanleitung (PDF)](https://media.holzland.de/docs/82126_verlegeanleitung.pdf)
