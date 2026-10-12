# Lichtquellen-Modul – Architektur

Eigenständiges Modul für Lichtquellen in der Möbel-CAD. Es berechnet aus Leuchten-Definitionen
**Montage** (CNC-Bearbeitungen, Stückliste, Netzteil, Kabel), **Lichttechnik** (Lichtstrom, Lichtstärke,
Beleuchtungsstärke auf Prüfflächen) und **Render-Daten** (glTF-kompatible Lichter).
Reines JavaScript ohne Abhängigkeiten. An das Möbel-Modul wird es nur über dessen Ergebnis gekoppelt
(`teile[].lage`, `teile[].bearbeitungen`); es importiert nichts daraus.

```
berechneLicht({ moebel, leuchten, netzteil, pruefflaechen })
   → { leuchten, emitter, bearbeitungen, stueckliste, netzteile, kabel, beleuchtung, renderLichter, pruefungen, gueltig }
```

## 1. Leuchtentypen (Phase 1)

| Typ | Beschreibung | Befestigung | Bearbeitung |
|---|---|---|---|
| `ledProfil` | LED-Streifen im Alu-Profil (Einbau, Aufbau, Eck 45°) | Möbelteil, Fläche, Abstand vorne, Rand links/rechts | Einbau: Nut; Kabelführung |
| `spot` | Möbel-Einbauspot / Aufbauspot, einzeln oder gleichmäßig verteilt | Möbelteil, Fläche, x/y oder Anzahl + Abstand vorne | Bohrung (Sackloch oder durchgehend), Kabelführung |
| `punktlicht` | Raumleuchte (Glühlampe, Pendel), strahlt in alle Richtungen | Weltposition | – |
| `flaechenlicht` | LED-Panel, Fenster, Lichtdecke (lambertsch) | Weltposition, Größe, Richtung | – |

Später (Phase 2/3): Sonne/Richtungslicht, Umgebung/HDRI, IES/LDT-Import (Feld `verteilung` ist vorgesehen).

## 2. Koordinaten

Welt = Möbel-Welt: Ursprung vorne links unten, X Breite, Y Tiefe (nach hinten), Z Höhe, Maße in mm.
Befestigungsflächen werden auf das Teilkoordinatensystem des Möbel-Moduls abgebildet:

| Teil | Fläche | lokales x | lokales y | Normale (Abstrahlrichtung) | CNC-Richtung |
|---|---|---|---|---|---|
| Boden | `unten` | Welt-X − x0 | Welt-Y − y0 | −Z | `+z` (z = 0) |
| Boden | `oben` | Welt-X − x0 | Welt-Y − y0 | +Z | `-z` (z = Stärke) |
| Seite links | `innen` | Welt-Z − z0 | Welt-Y | +X | `-z` (z = Stärke) |
| Seite rechts | `innen` | Welt-Z − z0 | Welt-Y | −X | `-z` (z = Stärke) |

## 3. Elektrische Werte und Lichttechnik

- LED-Streifen werden nur an Schnittmarken gekürzt: `Streifen = ⌊(Profil − 2 · Endkappe) / Raster⌋ · Raster`.
- Leistung `W = Streifenlänge · W/m`, Lichtstrom `Φ = Streifenlänge · lm/m · Profil-Wirkungsgrad (Diffusor)`.
- Netzteil je Spannung: `Last · (1 + Reserve)` (Reserve 20 %), kleinste Normgröße aus 15/30/60/75/100/150/240 W,
  darüber mehrere Netzteile.
- Abstrahlung als **cosⁿ-Strahler**: `I(γ) = I₀ · cosⁿ γ`, n so gewählt, dass bei halbem Abstrahlwinkel 50 %
  erreicht werden: `n = ln 0,5 / ln cos(θ/2)`. Energieerhaltung: `I₀ = Φ · (n + 1) / 2π`.
  (θ = 120° ergibt n = 1 = lambertscher Strahler.) Punktlicht: `I = Φ / 4π`.
- LED-Profile und Flächenlichter werden in Teilstrahler zerlegt (Schritt 50 mm).
- Beleuchtungsstärke im Punkt P mit Normale n: `E = Σ I(γ) · cos β / d²` (d in m → lx).
  Verdeckung: Strecke Strahler → Punkt wird gegen alle Möbelteile (Quader) geprüft; verdeckte Anteile zählen nicht.
  Keine Reflexionen (konservativ).
- Prüffläche: Raster (Standard 50 mm) auf einer Teilfläche oder einem Welt-Rechteck →
  `E_min`, `E_mittel`, `E_max`, Gleichmäßigkeit `U₀ = E_min / E_mittel`.
- Lichtfarbe: Kelvin → RGB (Näherung nach Tanner Helland) für die Render-Ausgabe.

## 4. Bearbeitungen (gleiches Format wie Möbel-Modul)

`{ teil, art, flaeche, x, y, z, richtung, durchmesser, tiefe, quelle, verbindung: 'licht' }`

- Einbauprofil: `nut` über die Profillänge (Nutbreite/-tiefe aus dem Profilkatalog).
- Spot: `bohrung` mit Ø des Einbaumaßes; Sackloch (Tiefe aus Katalog) oder durchgehend.
- Kabelführung: `nut` (8 × 5 mm) zur Hinterkante (Standard), `bohrung` Ø 8 durchgehend oder `keine`.

## 5. Prüfungen

| Code | Schwere | Regel |
|---|---|---|
| `TEIL_UNBEKANNT` | Fehler | Befestigungsteil fehlt im Möbel |
| `FLAECHE_UNGUELTIG` | Fehler | Fläche passt nicht zum Teil (Boden: oben/unten, Seite: innen) |
| `TYP_UNBEKANNT` / `MODELL_UNBEKANNT` | Fehler | nicht im Katalog |
| `AUSSERHALB` | Fehler | Leuchte oder Bohrung liegt nicht vollständig auf dem Teil |
| `RANDABSTAND` | Warnung | Bohrungsrand < 15 mm von der Teilkante |
| `RESTWAND` | Fehler | Nut/Sackloch lässt < 3 mm Material |
| `KOLLISION_BEARBEITUNG` | Fehler | Bohrung/Nut überschneidet eine Möbel-Bearbeitung (Dübel, Exzenter, Nut …) |
| `SPOT_ABSTAND` | Fehler | zwei Spot-Bohrungen überschneiden sich |
| `SPANNUNGSABFALL` | Warnung | Streifen je Einspeisung länger als 5 m (24 V) bzw. 2,5 m (12 V) |
| `ZU_DUNKEL` | Warnung | `E_mittel` unter Sollwert der Prüffläche |
| `UNGLEICHMAESSIG` | Hinweis | `U₀ < 0,4` |
| `LICHTFARBE_GEMISCHT` | Hinweis | unterschiedliche Kelvin-Werte im selben Möbel |
| `MEHRERE_NETZTEILE` | Hinweis | Last über größtem Netzteil |

## 6. Öffentliche API

```js
import {
  berechneLicht, normalisiereLicht, lichtVorlage,
  PROFILE, SPOTS, NETZTEIL_GROESSEN, kelvinZuRgb, cosExponent, spitzenLichtstaerke,
} from './src/index.js';
```
