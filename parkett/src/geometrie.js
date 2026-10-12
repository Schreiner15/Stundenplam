// 2D-Geometrie: Polygone als Arrays von [x, y] (mm).

export function flaeche(punkte) {
  let s = 0;
  for (let i = 0; i < punkte.length; i++) {
    const [x1, y1] = punkte[i];
    const [x2, y2] = punkte[(i + 1) % punkte.length];
    s += x1 * y2 - x2 * y1;
  }
  return Math.abs(s) / 2;
}

export function drehe(punkte, winkelGrad, [cx, cy]) {
  const w = (winkelGrad * Math.PI) / 180;
  const c = Math.cos(w);
  const s = Math.sin(w);
  return punkte.map(([x, y]) => [cx + (x - cx) * c - (y - cy) * s, cy + (x - cx) * s + (y - cy) * c]);
}

export function rechteck(x0, y0, x1, y1) {
  return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
}

export function huelle(punkte) {
  const xs = punkte.map((p) => p[0]);
  const ys = punkte.map((p) => p[1]);
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}

/** Sutherland-Hodgman: Polygon auf achsparalleles Rechteck zuschneiden. */
export function schneideZu(punkte, { x0, y0, x1, y1 }) {
  const kanten = [
    [(p) => p[0] >= x0, (a, b) => schnitt(a, b, 0, x0)],
    [(p) => p[0] <= x1, (a, b) => schnitt(a, b, 0, x1)],
    [(p) => p[1] >= y0, (a, b) => schnitt(a, b, 1, y0)],
    [(p) => p[1] <= y1, (a, b) => schnitt(a, b, 1, y1)],
  ];
  let aus = punkte;
  for (const [innen, schneide] of kanten) {
    if (!aus.length) break;
    const ein = aus;
    aus = [];
    for (let i = 0; i < ein.length; i++) {
      const a = ein[i];
      const b = ein[(i + 1) % ein.length];
      if (innen(b)) {
        if (!innen(a)) aus.push(schneide(a, b));
        aus.push(b);
      } else if (innen(a)) {
        aus.push(schneide(a, b));
      }
    }
  }
  return aus;
}

function schnitt(a, b, achse, wert) {
  const t = (wert - a[achse]) / (b[achse] - a[achse]);
  return [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
}

export function punktInPolygon([x, y], punkte) {
  let innen = false;
  for (let i = 0, j = punkte.length - 1; i < punkte.length; j = i++) {
    const [xi, yi] = punkte[i];
    const [xj, yj] = punkte[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) innen = !innen;
  }
  return innen;
}

/** Deterministischer Zufall (mulberry32) aus einem ganzzahligen Startwert. */
export function zufall(startwert) {
  let a = startwert >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function mischeWert(...zahlen) {
  let h = 2166136261;
  for (const z of zahlen) {
    h ^= Math.round(z * 1000) | 0;
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
