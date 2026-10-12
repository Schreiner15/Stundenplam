# Parkett- und Fliesenplaner (Bodenbelag)

Eigenständiges Modul für Bodenbeläge: Kataloge für Parkett und Fliesen, Verlegemuster als echte Geometrie
(mit Fugen), Bedarf, Materialliste und Prüfungen. Reines JavaScript ohne Abhängigkeiten, läuft in Node und im Browser.
`berechneBelag(eingabe)` wählt anhand von `eingabe.belag` (`'parkett'` oder `'fliesen'`).

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

Vorschau lokal: `npm run vorschau` im Hauptordner, dann http://localhost:5173/bodenbelag/vorschau.html

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

## Fliesen

```js
import { berechneFliesen } from './src/index.js';

const e = berechneFliesen({
  raum: { laenge: 3200, breite: 2600, raumtyp: 'bad', tueren: [{ breite: 800 }] },
  fliese: { art: 'feinsteinzeug', laenge: 600, breite: 300, optik: 'beton', rutschhemmung: 'R10', abriebklasse: 'IV' },
  verlegung: { muster: 'drittelverband', fugenbreite: 3, randfuge: 5 },
});
e.bedarf;   // Fliesen, Kartons, Bestellfläche, Zuschnitte, Kosten
e.material; // Fliesen, Kleber, Fugenmörtel, Grundierung, Abdichtung, Nivelliersystem/Kreuze, Sockel, Silikon …
```

| Fliesenart | Wasseraufnahme / Norm | frostsicher | Einsatz | Standardformate (cm) | Fuge |
|---|---|---|---|---|---|
| Feinsteinzeug | BIa ≤ 0,5 % | ja | Wand, Boden, außen | 60×60, 60×30, 120×60, 120×30, 80×80, 120×120 | 2–3 mm |
| Feinsteinzeug Holzoptik | BIa ≤ 0,5 % | ja | Boden, außen | 120×20, 120×30, 180×20, 60×15 | 2–3 mm |
| Großformat / Keramikplatte | BIa ≤ 0,5 % | ja | Wand, Boden, außen | 120×120, 240×120, 320×160 | 2–3 mm |
| Steinzeug (glasiert) | BIb–BIIa 0,5–6 % | je nach Produkt | Wand, Boden innen | 33×33, 30×30, 45×45, 60×30 | 3 mm |
| Steingut (Wandfliese) | BIII > 10 % | nein | nur Wand innen | 40×25, 25×20, 60×30 | 2 mm |
| Cotto / Terrakotta | BIII, unglasiert | nein | Boden innen | 30×30, 40×20, 30×15 | 6–8 mm |
| Klinker / Spaltplatte | AI–AIIa ≤ 6 % | ja | Boden, außen | 24×11,5, 24×5,2, 30×30 | 6–8 mm |
| Mosaik (auf Netz) | meist BIa | ja | Wand, Boden, außen | Matte 30×30, Stein 2,5×2,5 | 2 mm |
| Zementfliese | nicht nach EN 14411 | nein | Wand, Boden innen | 20×20, 15×15 | 1,5–2 mm |
| Naturstein | DIN EN 12058 | je nach Gestein | Wand, Boden, außen | 60×30, 60×60, 40×40, 30,5×30,5 | 2–3 mm |

Muster: Kreuzfuge, Halbverband, Drittelverband, Wilder Verband (Dielenoptik), Fischgrät; jeweils 0°, 45° oder 90°.

Richtwerte (bitte mit Hersteller- und ZDB-Angaben abgleichen):
- Verschnitt: Kreuzfuge 7 %, Halb-/Drittel-/Wilder Verband 10 %, Fischgrät 15 %, diagonal +8 Punkte; beim Verband zusätzlich Plan mit Restverwertung, bestellt wird der höhere Wert.
- Fugenmörtel: (A + B) / (A · B) × Fugenbreite × Fugentiefe × 1,6 kg/m² (A, B in mm), +10 %; Mosaik mit Steingröße.
- Kleber nach Zahnung: 4 mm 1,7 · 6 mm 2,0 · 8 mm 2,8 · 10 mm 3,6 kg/m²; über 60 cm Kantenlänge oder außen +1,0 kg/m² (Buttering-Floating).
- Rutschhemmung (DIN 51130) und Abriebklasse (PEI) je Raumtyp: Wohnraum R9/PEI II, Flur R9/PEI IV, Küche R10/PEI III, Bad R10/PEI II, Dusche R11, außen R11/PEI IV. Die Quellen widersprechen sich teilweise.
- Halbverband ab 60 cm Kantenlänge: Warnung Überzahn, besser ⅓-Versatz.

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
- [Baunetz Wissen – Arten keramischer Fliesen und Platten](https://www.baunetzwissen.de/fliesen-und-platten/fachwissen/grundlagen/arten-keramischer-fliesen-und-platten-1584603)
- [Baunetz Wissen – Einteilung nach Norm](https://www.baunetzwissen.de/fliesen-und-platten/fachwissen/keramische-belaege/einteilung-keramischer-fliesen-und-platten-nach-norm-1584291)
- [Baunetz Wissen – Wasseraufnahme](https://www.baunetzwissen.de/fliesen-und-platten/fachwissen/anforderungen/wasseraufnahme-156831)
- [baustoffshop.de – Fliesenarten](https://www.baustoffshop.de/infothek/fliesenarten/)
- [heimwerker.de – Fliesen-Abriebklassen](https://www.heimwerker.de/fliesen-abriebklassen/)
- [bau.de Forum – Abriebklassen & Rutschsicherheit im Bad](https://bau.de/forum/normen/10502.php)
- [bau.de Forum – Rektifizierte Fliesen, Fugenbreite](https://bau.de/forum/ausbauarbeiten/11147.php)
- [Hornbach – Technisches Datenblatt Fliesenkleber (PDF)](https://media.hornbach.nl/hb/technicaldatasheet/as.188544096.pdf)
- [Sopro – Technisches Produktinfo (PDF)](https://www.baustoffshop.de/media/pdf/sopro/TPIs_Sopro_de_808_de.pdf)
