// Kleine Hilfsfunktionen ohne Fachlogik.

/** Rundet auf 0,1 mm und normalisiert −0 zu 0 (wichtig für verlustfreies JSON). */
export function r(wert) {
  const gerundet = Math.round(wert * 10) / 10;
  return gerundet === 0 ? 0 : gerundet;
}

export function rPunkt({ x, y, z }) {
  return { x: r(x), y: r(y), z: r(z) };
}

/** Rundet alle Zahlen eines flachen Objekts bzw. von {x,y,z}-Unterobjekten. */
export function rundeAlles(objekt) {
  const aus = {};
  for (const [k, v] of Object.entries(objekt)) {
    if (v === undefined) continue;
    if (typeof v === 'number') aus[k] = r(v);
    else if (v && typeof v === 'object' && !Array.isArray(v) && 'x' in v) aus[k] = rPunkt(v);
    else aus[k] = v;
  }
  return aus;
}
