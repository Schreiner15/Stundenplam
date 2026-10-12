# 1. Analyse: Warum das bestehende Boden-Feature nicht funktioniert

> **Wichtig vorab:** Der Quellcode von MS Woodwork ist in dieser Arbeitsumgebung
> nicht verfügbar (das Repository `Schreiner15/Stundenplam` war leer, und kein anderes
> erreichbares Repository enthält MS Woodwork). Die folgende Analyse ist deshalb **keine
> Code-Analyse**, sondern eine strukturierte Fehlerbild-Analyse: Sie beschreibt die
> typischen Ursachen, an denen eine „Boden"-Funktion in einem Möbel-CAD scheitert. Zu
> jeder Ursache gibt es einen konkreten **Prüfschritt**, mit dem sie im MS-Woodwork-Code
> bestätigt oder ausgeschlossen werden kann, und den Hinweis, wie das neue Modul sie
> konstruktiv ausschließt.
>
> Sobald der MS-Woodwork-Code (oder ein Export/Beispielprojekt) bereitsteht, wird diese
> Tabelle Punkt für Punkt gegen den echten Code abgehakt.

## 1.1 Symptom-Beschreibung (Annahme)

„Das Boden-Konzept funktioniert nicht" zeigt sich in Möbel-CAD-Systemen erfahrungsgemäß als:

| Nr. | Symptom | Häufige Folge in der Werkstatt |
|---|---|---|
| S1 | Boden ist zu breit/zu schmal, wenn die Korpusbreite geändert wird | Fehlzuschnitt |
| S2 | Boden steht in die Seite oder in die Rückwand hinein | Teil passt nicht, Nacharbeit |
| S3 | Fachböden liegen nicht auf dem 32-mm-Raster, Bohrungen passen nicht | Fachboden wackelt / lässt sich nicht einlegen |
| S4 | Stückliste und 3D-Modell widersprechen sich | Falsche Zuschnittmaße |
| S5 | Bohr-/Nutdaten fehlen oder sitzen am falschen Teil (z. B. bei „Seiten auf Boden") | CNC-Programm unbrauchbar |
| S6 | Einbauart und Verbindung lassen sich frei kombinieren, auch wenn das konstruktiv unsinnig ist (z. B. Fachbodenträger an einem Oberboden) | Fehlerhafte Konstruktion |

## 1.2 Wahrscheinliche Ursachen

| Nr. | Ursache | Erzeugt Symptom | Prüfschritt im MS-Woodwork-Code | Wie das neue Modul sie ausschließt |
|---|---|---|---|---|
| U1 | **Absolute statt abgeleitete Maße:** Bodenbreite/-tiefe werden beim Anlegen einmal berechnet und als feste Zahl gespeichert. | S1, S4 | Wird `breite` des Bodens gespeichert oder bei jeder Korpusänderung neu berechnet? | Bodenmaße werden **nie gespeichert**, sondern bei jedem `berechne()` aus Korpus + Regeln abgeleitet (reine Funktion). |
| U2 | **Einbauart nur geometrisch, nicht konstruktiv:** „Seiten auf Boden" ändert die Bodenbreite, aber nicht die Seitenhöhe (oder umgekehrt). | S1, S2, S4 | Ändert die Einbauart des Unterbodens auch die Länge der Seiten? | Seitenhöhe wird aus den Einbauarten von Ober- **und** Unterboden berechnet (`seitenLaenge`). |
| U3 | **Verbindungszugabe fehlt:** Eingenutete Böden und Böden mit Zapfen brauchen Zugabe (2 × Nuttiefe bzw. 2 × Zapfenlänge); oft wird nur „lichte Breite" verwendet. | S1, S4 | Wird bei Nut/Zapfen die Zuschnittlänge erhöht? | Zuschnittlänge = lichte Breite + 2 × `stirnZugabe(einbauart, verbindung)`. |
| U4 | **Kein gemeinsames Koordinatensystem:** Bohrungen werden in Weltkoordinaten berechnet, CNC braucht Teilkoordinaten (je Fläche). | S5 | In welchem Koordinatensystem werden Bohrungen gespeichert? | Jede Bearbeitung hat `teil`, `flaeche` und lokale `x/y` mit fester Konvention (siehe Architektur 2.5). |
| U5 | **Flächen-/Stirnteil vertauscht:** Bei „Seiten auf Boden" muss das Flächenteil (Bohrung in der Fläche) der Boden sein, bei „zwischen den Seiten" die Seite. | S5 | Wird die Bohrseite abhängig von der Einbauart bestimmt? | Jede Verbindung wird zwischen einem `flaechenTeil` und einem `stirnTeil` erzeugt; die Einbauart bestimmt die Rollen. |
| U6 | **Fachboden ohne Raster-Logik:** Position wird frei gesetzt und nicht auf die Lochreihe gerundet. | S3 | Wird die Fachboden-Position auf `rasterStart + n × 32` gerundet? | Fachbodenpositionen werden auf das Lochraster gerundet; Lochreihen und Boden stammen aus derselben Berechnung. |
| U7 | **Keine Kollisionsprüfung:** Rückwandnut, Rücksprung und Bodentiefe werden nicht gegeneinander geprüft. | S2 | Gibt es eine Prüfung Boden ↔ Rückwand bzw. Boden ↔ Boden? | `pruefeKollisionen()` liefert strukturierte Fehler/Warnungen (Code, Teil, Text). |
| U8 | **Keine Kombinationsregeln:** Typ × Einbauart × Verbindung wird nicht validiert. | S6 | Gibt es eine Kompatibilitätstabelle? | Explizite Matrix `ERLAUBT` je Bodentyp; ungültige Kombinationen werden mit Fehlercode abgelehnt. |
| U9 | **Fächer werden nicht neu aufgeteilt:** Nach dem Einfügen eines Mittelbodens bleiben die Fachböden an alten absoluten Positionen. | S1, S3 | Werden Fachböden einem Abschnitt zugeordnet oder global positioniert? | Fachböden gehören zu einem **Abschnitt** zwischen festen Böden und werden darin gleichmäßig verteilt. |
| U10 | **Logik im UI/CAD-Objekt verteilt:** Rechenregeln stecken in Event-Handlern des CAD, keine testbare Einheit. | alle | Gibt es eine UI-unabhängige Berechnungsfunktion mit Tests? | Eigenes Paket, reine Funktionen, Unit-Tests je Bodentyp, keine Abhängigkeit vom CAD. |

## 1.3 Folgerung

Die Ursachen U1–U10 haben einen gemeinsamen Kern: **Böden sind im bestehenden System Objekte mit
gespeicherten Maßen, statt Ergebnisse einer Regelberechnung aus Korpus + Parametern.** Deshalb wird
das neue Modul als *deklaratives Datenmodell + reine Berechnungsfunktion* aufgebaut:

```
Eingabe (JSON: Korpus + Böden)  ──►  berechne()  ──►  Ergebnis (Teile, Fächer, Bearbeitungen, Prüfungen)
```

Es gibt keinen internen Zustand und kein Zurückschreiben in das CAD. MS Woodwork bindet das Modul später
nur über diese Schnittstelle an (siehe `02-architektur.md`, Abschnitt „Integration").

## 1.4 Offene Punkte für die Code-Analyse

- [ ] Zugriff auf MS-Woodwork-Quellcode oder ein Beispielprojekt mit fehlerhaftem Boden
- [ ] U1–U10 gegen den echten Code abhaken und Belegstellen eintragen
- [ ] Fehlerbilder aus der Werkstatt (Fotos/Stücklisten) S1–S6 zuordnen
