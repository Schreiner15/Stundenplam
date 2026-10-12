# 2. Architekturvorschlag: Modul „Parametrische Möbelvorlage – Böden"

## 2.1 Leitprinzipien

1. **Eigenständiges Paket** ohne Abhängigkeiten (reines JavaScript, ES-Module). Es läuft in Node.js
   (Tests, Server, Batch) und unverändert im Browser (Live-Vorschau, späteres CAD-Plugin).
2. **Deklarative Eingabe → reine Berechnung → vollständiges Ergebnis.** Maße werden nie gespeichert,
   sondern immer abgeleitet (behebt U1, U9 aus der Analyse).
3. **Fachliche Fehler werfen keine Exceptions.** `berechne()` liefert immer ein Ergebnis mit einer Liste
   `pruefungen` (Fehler/Warnungen mit Code). Exceptions gibt es nur bei technisch kaputter Eingabe
   (z. B. kein Objekt).
4. **Ein Koordinatensystem pro Teil**, eindeutig definiert (behebt U4, U5).
5. **Kein Eingriff in MS Woodwork.** Die spätere Integration läuft ausschließlich über die öffentliche API
   (Abschnitt 2.8).

## 2.2 Paketstruktur

```
src/
  index.js          Öffentliche API (einzige Import-Stelle für Nutzer)
  enums.js          BodenTyp, Einbauart, Verbindung, ERLAUBT-Matrix, Bezeichnungen
  defaults.js       Standardwerte, normalisiere(eingabe)
  korpus.js         Abgeleitete Korpusmaße, Seiten, Rückwand, Sockelblende
  boeden.js         Geometrie je Bodentyp (Breite, Tiefe, Lage)
  raster.js         32-mm-Raster, gleichmäßige Fachboden-Teilung
  verbindungen.js   CNC-Bearbeitungen je Verbindung (Fuge zwischen Flächen- und Stirnteil)
  kollision.js      Kollisions- und Plausibilitätsprüfung
  ausgabe.js        Stückliste, CSV, JSON
  berechne.js       Orchestrierung: normalisieren → Geometrie → Fächer → Verbindungen → Prüfung → Ausgabe
test/               Unit-Tests (node:test), je Bodentyp eine Datei + Querschnittstests
vorschau.html       Live-Vorschau (Browser), nutzt dieselbe API
vorschau/           JS/CSS der Vorschau
scripts/serve.mjs   Mini-Webserver für die lokale Vorschau
```

## 2.3 Fachliche Typen

### Bodentypen (`BodenTyp`)

| Wert | Bedeutung | teilt Korpus in Abschnitte | Standard-Einbauart | Standard-Verbindung |
|---|---|---|---|---|
| `unterboden` | unterer Konstruktionsboden | ja (unten) | `zwischen` | `duebel` |
| `oberboden` | oberer Konstruktionsboden | ja (oben) | `zwischen` | `duebel` |
| `mittelboden` | Zwischen-/Mittelboden, konstruktiv | ja | `zwischen` | `duebel` |
| `festboden` | fest verbundener Fachboden | ja | `zwischen` | `exzenter` |
| `fachboden` | Einlegeboden auf Fachbodenträgern | teilt den **Abschnitt** in Fächer | `zwischen` | `fachbodentraeger` |
| `schubladenboden` | Boden eines Schubkastens | nein (liegt im Schubkasten) | `eingenutet` | `nut_feder` |

### Einbauarten (`Einbauart`)

| Wert | Bedeutung | Bodenbreite (vor Verbindungszugabe) | Seiten |
|---|---|---|---|
| `zwischen` | Boden zwischen den Seiten | `B − 2·sS` | volle Höhe |
| `durchlaufend` | Seiten stehen auf dem Boden / Boden liegt auf den Seiten | `B` | um `s` kürzer, Bohrbild vertauscht |
| `eingenutet` | Boden in Nut der Seiten | `B − 2·sS + 2·(Nuttiefe − Luft)` | Nut in Seite |
| `gehrung` | Ecke auf Gehrung 45° | `B` | volle Höhe, Gehrungsschnitt |
| `sockel` | Unterboden auf Sockelhöhe zwischen den Seiten, Sockelblende zurückgesetzt | `B − 2·sS` | volle Höhe bis Boden |

(`B` = Korpusbreite, `sS` = Seitenstärke, `s` = Bodenstärke)

### Verbindungen (`Verbindung`)

`duebel`, `lamello`, `exzenter`, `konfirmat`, `nut_feder`, `fachbodentraeger`, `zapfen`

### Zulässige Kombinationen (`ERLAUBT`)

`STD` = `duebel, lamello, exzenter, konfirmat, zapfen`

| Typ | zwischen | durchlaufend | eingenutet | gehrung | sockel |
|---|---|---|---|---|---|
| unterboden | STD | duebel, lamello, exzenter, konfirmat | nut_feder | lamello | STD |
| oberboden | STD | duebel, lamello, exzenter, konfirmat | nut_feder | lamello | – |
| mittelboden | STD | – | nut_feder | – | – |
| festboden | STD | – | nut_feder | – | – |
| fachboden | fachbodentraeger | – | – | – | – |
| schubladenboden | – | – | nut_feder | – | – |

Ungültige Kombination → Fehler `KOMBINATION`, der Boden wird nicht berechnet (der Rest schon).

## 2.4 Datenmodell (JSON)

### Eingabe

```jsonc
{
  "korpus": {
    "breite": 800, "hoehe": 2000, "tiefe": 560,          // Außenmaße in mm (Tiefe inkl. Rückwand)
    "seitenStaerke": 19,
    "materialStaerke": 19,                                 // Standard für Böden
    "material": "Spanplatte melaminbeschichtet",
    "kantenStaerke": 0,                                    // wird bei Sichtkanten vom Zuschnitt abgezogen
    "rueckwand": { "art": "eingenutet", "staerke": 8, "abstand": 10, "nuttiefe": 8, "nutbreite": 8, "luft": 1 },
    "sockel": { "hoehe": 100, "ruecksprung": 50 }
  },
  "boeden": [
    { "id": "ub", "typ": "unterboden", "einbauart": "zwischen", "verbindung": "duebel" },
    { "id": "ob", "typ": "oberboden" },
    { "id": "mb", "typ": "mittelboden", "position": "50%" },
    { "id": "fb-unten", "typ": "fachboden", "abschnitt": 0, "anzahl": 2 },
    { "id": "sk1", "typ": "schubladenboden", "abschnitt": 1, "position": 5,
      "schublade": { "hoehe": 120, "zargenStaerke": 16, "seitenLuft": 12.5 } }
  ]
}
```

#### Gemeinsame Bodenparameter

| Parameter | Bedeutung | Standard |
|---|---|---|
| `id` | eindeutige Kennung | `<typ>-<n>` |
| `typ`, `einbauart`, `verbindung` | siehe oben | je Typ |
| `materialstaerke` | Bodenstärke | `korpus.materialStaerke` (Schubladenboden: 8) |
| `material` | Materialname | `korpus.material` |
| `breite`, `tiefe` | **optionale** feste Maße; ohne Angabe abgeleitet | `null` |
| `position` | Z-Lage der Unterseite in mm oder `"NN%"` der Korpushöhe (Bodenmitte) | je Typ |
| `vorderkante` | Rücksprung der Vorderkante von der Korpusvorderkante | 0 |
| `rueckwandAbstand` | Abstand der Hinterkante zur Rückwand | 0 |
| `nuttiefe`, `nutbreite` | für `eingenutet` / `nut_feder` | 8 / Bodenstärke |
| `lochraster` | Lochrasterabstand (Fachbodenträger) | 32 |
| `abschnitt`, `anzahl` | nur Fachboden/Schubladenboden: Abschnitt-Index (0 = unten), Anzahl Fachböden | 0 / 1 |
| `verbindungsParameter` | Überschreibt Standardwerte der Verbindung (s. 2.6) | – |

`position` bei Ober-/Unterboden wird nur bei `zwischen`, `eingenutet` und `sockel` beachtet. Bei
`durchlaufend` und `gehrung` ist die Lage zwingend (Warnung `POSITION_IGNORIERT`).
Beim Schubladenboden bedeutet `position` den Abstand des Schubkastens über dem Abschnittsboden.

### Ergebnis von `berechne()`

```jsonc
{
  "schemaVersion": "1.0.0",
  "eingabe": { /* normalisierte Eingabe, alle Standardwerte ausgefüllt */ },
  "korpus": { "breite", "hoehe", "tiefe", "lichteBreite", "lichteTiefe", "konstruktionsTiefe",
              "seitenZ0", "seitenLaenge" },
  "teile": [ {
      "id": "mb", "bezeichnung": "Mittelboden", "kategorie": "boden", "bodenId": "mb", "bodenTyp": "mittelboden",
      "laenge": 762, "breite": 542, "staerke": 19, "material": "…",
      "kanten": ["vorne"], "zuschnitt": { "laenge": 762, "breite": 542 },
      "lage": { "x": 19, "y": 0, "z": 990.5, "dx": 762, "dy": 542, "dz": 19 },
      "bearbeitungen": [ /* CNC-Bearbeitungen in Teilkoordinaten */ ]
  } ],
  "abschnitte": [ { "index", "zUnten", "zOben", "lichteHoehe", "untenTeil", "obenTeil" } ],
  "faecher":    [ { "index", "abschnitt", "zUnten", "zOben", "lichteHoehe", "lichteBreite", "lichteTiefe" } ],
  "stueckliste": [ { "pos", "bezeichnung", "anzahl", "laenge", "breite", "staerke",
                     "zuschnittLaenge", "zuschnittBreite", "material", "kanten", "teile" } ],
  "bearbeitungen": [ /* alle Bearbeitungen flach, mit "teil" */ ],
  "pruefungen": [ { "schwere": "fehler" | "warnung", "code": "KOLLISION_SEITE", "teil": "mb", "meldung": "…" } ],
  "gueltig": true
}
```

## 2.5 Koordinatensysteme

**Welt (Korpus):** Ursprung = vordere linke untere Außenecke.
`X` nach rechts (Breite), `Y` nach hinten (Tiefe), `Z` nach oben (Höhe). Alle Maße in mm.

**Teil (für CNC):** Jedes Teil ist ein Quader `laenge × breite × staerke`.
`x` läuft entlang `laenge` (Faserrichtung), `y` entlang `breite`, `z` durch die Stärke.

| Teil | x | y | z = 0 auf Fläche | z = Stärke auf Fläche | Kanten (x=0 / x=L / y=0 / y=B) |
|---|---|---|---|---|---|
| Boden (alle) | Welt-X − x0 | Welt-Y − y0 | `unten` | `oben` | `links` / `rechts` / `vorne` / `hinten` |
| Seite links/rechts | Welt-Z − seitenZ0 | Welt-Y | `aussen` | `innen` | `unten` / `oben` / `vorne` / `hinten` |
| Sockelblende | Welt-X − x0 | Welt-Z | `aussen` (vorne) | `innen` | `links` / `rechts` / `unten` / `oben` |
| Rückwand | Welt-X − x0 | Welt-Z − z0 | `hinten` | `vorne` | `links` / `rechts` / `unten` / `oben` |
| Schubkasten-Zarge | entlang Zarge | Welt-Z − z0 | `aussen` | `innen` | – |

Jede Bearbeitung hat einen **Eintrittspunkt** `x, y, z` in Teilkoordinaten, eine **Richtung**
(`+x`, `-x`, `+y`, `-y`, `+z`, `-z`) ins Material hinein und eine **Tiefe**. Damit ist sie ohne
Weltwissen CNC-tauglich.

| `art` | Felder |
|---|---|
| `bohrung` | `flaeche, x, y, z, richtung, durchmesser, tiefe` (+ `senkung` bei Konfirmat) |
| `nut` / `falz` | `flaeche, von{x,y,z}, bis{x,y,z}, richtung, breite, tiefe` |
| `schlitz` (Lamello) | `flaeche, x, y, z, richtung, achse, laenge, breite, tiefe` |
| `tasche` (Zapfenloch) | `flaeche, x, y, z, richtung, achse, laenge, breite, tiefe` |
| `zapfen` | `flaeche, x, y, z, achse, laenge, breite, dicke` |
| `feder` | `flaeche, laenge, dicke, versatz` |
| `gehrung` | `flaeche, winkel` |

## 2.6 Regeln und Formeln

### Korpus

- `lichteBreite = B − 2·sS`
- `konstruktionsTiefe = T − (Rückwand aufgesetzt ? rwStärke : 0)`
- `lichteTiefe` (bis Vorderfläche Rückwand) = `T − rwAbstand − rwStärke` (eingenutet), `T − rwStärke` (aufgesetzt), `T` (keine)
- Seiten: `seitenZ0 = Unterboden durchlaufend ? sUB : 0`, `seitenZ1 = Oberboden durchlaufend ? H − sOB : H`

### Böden

| Typ | Breite (X) | Tiefe (Y) | Z (Unterseite) |
|---|---|---|---|
| Unterboden | nach Einbauart + 2·Verbindungszugabe | `konstruktionsTiefe − vorderkante − rueckwandAbstand` | 0, `sockel.hoehe` bei `sockel`, sonst `position` |
| Oberboden | wie Unterboden | wie Unterboden | `H − s` oder `position` |
| Mittelboden | wie Unterboden | `lichteTiefe − vorderkante − rueckwandAbstand` | `position` (Standard `50%`) |
| Festboden | wie Unterboden | wie Mittelboden | `position` (Pflicht) |
| Fachboden | `lichteBreite − 2·seitenLuft` | wie Mittelboden | aus Raster (s. u.) |
| Schubladenboden | `Innenbreite Schubkasten + 2·(nuttiefe − luft)` | `Länge − 2·Zargenstärke + 2·(nuttiefe − luft)` | Schubkastenunterkante + Bodennutabstand |

Verbindungszugabe je Stirnseite: `zapfen` → Zapfenlänge, `nut_feder` → Nuttiefe − Luft, sonst 0.
Prozentangaben: `z = H·p − s/2` (Bodenmitte bei p % der Korpushöhe).

### Abschnitte und Fächer

1. Feste Böden (Unter-, Ober-, Mittel-, Festboden) nach Z sortieren.
2. **Abschnitte** sind die Lücken zwischen aufeinanderfolgenden festen Böden (Index 0 = unten).
3. Fachböden werden ihrem Abschnitt zugeordnet und **gleichmäßig** verteilt:
   `f = (h − n·s) / (n + 1)`, ideale Unterseite `uᵢ = zUnten + i·f + (i−1)·s`.
4. Raster: Lochreihen bei `zUnten + rasterRand + k·lochraster`, solange `≤ zOben − rasterRand`.
   Die Bodenunterseite liegt bei `Lochmitte + traegerHoehe`. Jede ideale Position wird auf die
   nächste Lochreihe gerundet. Bei Konflikt (zwei Böden auf derselben Reihe) wird zur nächsten
   freien Reihe ausgewichen, sonst Fehler `RASTER`.
5. **Fächer** sind die Lücken zwischen allen teilenden Böden (fest + Fachböden).

Lochspalten: vorne bei `reiheVorne` (37), hinten auf dem 32er-Raster ab der vorderen Reihe:
`reiheVorne + k·32 ≤ lichteTiefe − reiheHinten`.

### Verbindungen (Fuge zwischen Flächenteil und Stirnteil)

Die Einbauart bestimmt die Rollen: `zwischen`, `sockel`, `eingenutet` → **Seite = Flächenteil**, Boden =
Stirnteil. `durchlaufend` → **Boden = Flächenteil**, Seite = Stirnteil. `gehrung` → beide Gehrungsteile.

Verbinder-Positionen entlang der Fuge: `n = max(2, ⌈(L − 2·rand) / maxAbstand⌉ + 1)`, gleichmäßig von
`rand` bis `L − rand`.

| Verbindung | Flächenteil | Stirnteil | Standardwerte |
|---|---|---|---|
| Dübel | Ø8, Tiefe 12 | Ø8, Tiefe `laenge − 12 + 2` = 25 | rand 32, maxAbstand 160 |
| Lamello Nr. 20 | Schlitz 60×4, Tiefe 12 | Schlitz 60×4, Tiefe 12 | rand 50, maxAbstand 200 |
| Exzenter (Minifix 15) | Bolzenbohrung Ø5, Tiefe 11 | Gehäuse Ø15, Tiefe 12.5, Abstand 34 + Kanal Ø8 | rand 50, maxAbstand 300 |
| Konfirmat 7×50 | Durchgang Ø7 von außen, Senkung Ø10 | Kern Ø5, Tiefe `50 − sFläche + 2` | rand 50, maxAbstand 250 |
| Nut/Feder | Nut über Fugenlänge, Breite `nutbreite`, Tiefe `nuttiefe` | Feder, wenn `nutbreite < s` | Luft 0.5 |
| Fachbodenträger | Lochreihen Ø5, Tiefe 12, Raster 32 | – (Boden liegt lose auf) | traegerHoehe 4, seitenLuft 1 |
| Zapfen | Zapfenloch `breite × dicke`, Tiefe `laenge + luft` | Zapfen `laenge × breite × dicke` | laenge 12, dicke s/3, breite 50 |

Rückwandnut (bei `rueckwand.art = eingenutet`): in beiden Seiten (über die Rückwandhöhe) sowie in
Ober- und Unterboden (über die Rückwandbreite).

### Prüfungen (`kollision.js`)

| Code | Schwere | Regel |
|---|---|---|
| `KOMBINATION` | Fehler | Typ × Einbauart × Verbindung nicht in `ERLAUBT` |
| `ID_DOPPELT` | Fehler | Boden-IDs nicht eindeutig |
| `MEHRFACH` | Fehler | mehr als ein Unter- oder Oberboden |
| `POSITION_FEHLT` | Fehler | Festboden ohne Position |
| `POSITION_IGNORIERT` | Warnung | Position bei durchlaufend/gehrung angegeben |
| `AUSSERHALB` | Fehler | Boden liegt außerhalb der Korpushöhe |
| `KOLLISION_SEITE` | Fehler | Boden ragt weiter in die Seite als die Verbindung erlaubt |
| `KOLLISION_RUECKWAND` | Fehler | Boden ragt in die Rückwand |
| `RUECKWANDNUT` | Fehler | Ober-/Unterboden zu kurz für die Rückwandnut |
| `UEBERLAPPUNG` | Fehler | zwei Böden/Schubkästen überschneiden sich in Z |
| `RESTWAND` | Fehler | Bohr-/Nuttiefe lässt weniger als 3 mm Restwand |
| `MASS_UNGUELTIG` | Fehler | abgeleitete Breite/Tiefe ≤ 0 |
| `ABSCHNITT` | Fehler | Abschnitt existiert nicht / zweimal Fachböden im selben Abschnitt |
| `RASTER` | Fehler | zu wenige Lochreihen für die Anzahl Fachböden |
| `FACH_KLEIN` | Warnung | lichte Fachhöhe < 50 mm |
| `TRAEGER_AUFLAGE` | Warnung | Fachboden liegt nicht auf beiden Lochspalten auf |
| `DURCHBIEGUNG` | Warnung | Fachboden-Spannweite > 42 × Stärke |
| `SCHUBLADE_HOEHE` | Fehler | Schubkasten passt nicht in die Abschnittshöhe |
| `SCHUBLADE_TIEFE` | Fehler | Schubkasten länger als lichte Tiefe |
| `NUTBREITE` | Warnung | Nut breiter als Boden |

## 2.7 Öffentliche API (`src/index.js`)

```js
import {
  BodenTyp, Einbauart, Verbindung, ERLAUBT,   // Enums + Kompatibilitätsmatrix
  BEZEICHNUNG,                                // Anzeigenamen
  SCHEMA_VERSION,
  erstelleVorlage,                            // () → Beispiel-Eingabe (Standardschrank)
  normalisiere,                               // (eingabe) → Eingabe mit allen Standardwerten
  berechne,                                   // (eingabe) → Ergebnis (siehe 2.4)
  zuJSON, ausJSON,                            // Serialisierung (ausJSON prüft Grundstruktur)
  stuecklisteAlsCSV, bearbeitungenAlsCSV      // Export (Semikolon, Dezimalkomma)
} from '@moebelvorlage/boden';
```

Alles ist **zustandslos**: Eine Änderung der Korpusmaße bedeutet einfach `berechne()` mit neuer Eingabe.
Da keine Maße gespeichert sind, passen sich alle Böden, Fächer, Lochreihen und Bearbeitungen automatisch an.

## 2.8 Integration in MS Woodwork (später)

```
MS Woodwork  ──(Korpus + Boden-Parameter als JSON)──►  berechne()
             ◄──(teile[].lage, bearbeitungen, stueckliste)──
```

- MS Woodwork zeichnet nur noch `teile[].lage` (Quader) und übernimmt `bearbeitungen` 1:1 in den CNC-Export.
- Ein Adapter (eigenes kleines Modul) übersetzt `flaeche/richtung` in die Bearbeitungsseiten des
  CNC-Postprozessors. Am Modul selbst ändert sich dabei nichts.
- Die Versionierung läuft über `schemaVersion` (SemVer). Breaking Changes nur mit Major-Sprung.

## 2.9 Bewusst nicht enthalten (spätere Ausbaustufen)

- Fronten/Türen, Beschläge (Topfbänder), Schubkasten-Eckverbindungen
- Mehrteilige Rückwände (geteilt am Mittelboden)
- Kantenbilder außer Vorderkante, Furnierrichtung
- Statikberechnung (nur Faustregel-Warnung zur Durchbiegung)
