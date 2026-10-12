// Befestigung an Möbelteilen: Teilflächen ↔ Welt, Bearbeitungs-Hüllquader, Kollisionsprüfung.

/**
 * Bildet eine Teilfläche des Möbel-Moduls ab. Liefert null, wenn die Fläche nicht zum Teil passt.
 * welt(x, y) → Weltpunkt auf der Fläche; normale = Abstrahlrichtung von der Fläche weg.
 */
export function teilFlaeche(teil, flaeche) {
  const l = teil.lage;
  if (teil.kategorie === 'boden') {
    if (flaeche !== 'unten' && flaeche !== 'oben') return null;
    const unten = flaeche === 'unten';
    const z = unten ? l.z : l.z + l.dz;
    return {
      teil, flaeche, laenge: l.dx, breite: l.dy, staerke: teil.staerke,
      welt: (x, y) => ({ x: l.x + x, y: l.y + y, z }),
      normale: { x: 0, y: 0, z: unten ? -1 : 1 },
      tiefenRichtung: { x: 0, y: 1, z: 0 },
      cnc: unten ? { z: 0, richtung: '+z' } : { z: teil.staerke, richtung: '-z' },
    };
  }
  if (teil.kategorie === 'seite') {
    if (flaeche !== 'innen') return null;
    const links = teil.id === 'seite-links';
    const x = links ? l.x + l.dx : l.x;
    return {
      teil, flaeche, laenge: l.dz, breite: l.dy, staerke: teil.staerke,
      welt: (u, v) => ({ x, y: l.y + v, z: l.z + u }),
      normale: { x: links ? 1 : -1, y: 0, z: 0 },
      tiefenRichtung: { x: 0, y: 1, z: 0 },
      cnc: { z: teil.staerke, richtung: '-z' },
    };
  }
  return null;
}

/** Hüllquader einer Bearbeitung in Teilkoordinaten (oder null für Profil-/Kantenbearbeitungen ohne Volumen). */
export function huelle(b) {
  const tiefe = (z, richtung, t) => (richtung === '+z' ? [z, z + t] : richtung === '-z' ? [z - t, z] : [z, z]);
  if (b.art === 'bohrung') {
    const r = b.durchmesser / 2;
    const ach = b.richtung[1];
    const vz = b.richtung[0] === '+' ? 1 : -1;
    const box = { x: [b.x - r, b.x + r], y: [b.y - r, b.y + r], z: [b.z - r, b.z + r] };
    box[ach] = vz > 0 ? [b[ach], b[ach] + b.tiefe] : [b[ach] - b.tiefe, b[ach]];
    return box;
  }
  if (b.art === 'nut' || b.art === 'falz') {
    const h = b.breite / 2;
    const quer = b.von.x === b.bis.x ? 'x' : 'y';
    const box = {
      x: [Math.min(b.von.x, b.bis.x), Math.max(b.von.x, b.bis.x)],
      y: [Math.min(b.von.y, b.bis.y), Math.max(b.von.y, b.bis.y)],
      z: tiefe(b.von.z, b.richtung, b.tiefe),
    };
    box[quer] = [box[quer][0] - h, box[quer][1] + h];
    return box;
  }
  if (b.art === 'schlitz' || b.art === 'tasche') {
    const [la, qu] = b.achse === 'x' ? [b.laenge / 2, b.breite / 2] : [b.breite / 2, b.laenge / 2];
    const box = { x: [b.x - la, b.x + la], y: [b.y - qu, b.y + qu], z: [b.z - b.breite / 2, b.z + b.breite / 2] };
    const ach = b.richtung?.[1];
    if (ach === 'z') box.z = tiefe(b.z, b.richtung, b.tiefe);
    else if (ach) box[ach] = b.richtung[0] === '+' ? [b[ach], b[ach] + b.tiefe] : [b[ach] - b.tiefe, b[ach]]; // Stirnseite
    return box;
  }
  return null;
}

function ueberlappen(a, b) {
  return ['x', 'y', 'z'].every((k) => Math.min(a[k][1], b[k][1]) - Math.max(a[k][0], b[k][0]) > 0.01);
}

/** Zwei Flächenbohrungen gleicher Fläche: exakter Kreistest; sonst Hüllquader. */
export function kollidiert(a, b) {
  const ha = huelle(a);
  const hb = huelle(b);
  if (!ha || !hb || !ueberlappen(ha, hb)) return false;
  if (a.art === 'bohrung' && b.art === 'bohrung' && a.richtung === b.richtung && a.richtung.endsWith('z')) {
    return Math.hypot(a.x - b.x, a.y - b.y) < (a.durchmesser + b.durchmesser) / 2 - 0.01;
  }
  return true;
}
