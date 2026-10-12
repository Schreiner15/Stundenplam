// Beispielvorlage: Hochschrank mit Sockel, Schubkästen, Festboden, Mittelboden und Fachböden.
// Zeigt alle sechs Bodentypen; dient als Startpunkt für die Vorschau und als Testfall.

export function erstelleVorlage() {
  return {
    korpus: {
      breite: 800,
      hoehe: 2000,
      tiefe: 560,
      seitenStaerke: 19,
      materialStaerke: 19,
      material: 'Spanplatte melaminbeschichtet',
      kantenStaerke: 1,
      rueckwand: { art: 'eingenutet', staerke: 8, abstand: 10, nuttiefe: 8 },
      sockel: { hoehe: 100, ruecksprung: 50 },
    },
    boeden: [
      { id: 'ub', typ: 'unterboden', einbauart: 'sockel', verbindung: 'duebel' },
      { id: 'ob', typ: 'oberboden', einbauart: 'zwischen', verbindung: 'duebel' },
      { id: 'fest', typ: 'festboden', position: 700, verbindung: 'exzenter' },
      { id: 'mb', typ: 'mittelboden', position: '50%', verbindung: 'duebel' },
      { id: 'sk1', typ: 'schubladenboden', abschnitt: 0, position: 10, schublade: { hoehe: 180 } },
      { id: 'sk2', typ: 'schubladenboden', abschnitt: 0, position: 290, schublade: { hoehe: 180 } },
      { id: 'fb-mitte', typ: 'fachboden', abschnitt: 1, anzahl: 1 },
      { id: 'fb-oben', typ: 'fachboden', abschnitt: 2, anzahl: 3 },
    ],
  };
}
