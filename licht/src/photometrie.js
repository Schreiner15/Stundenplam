// Lichttechnik: cosⁿ-Strahler, Beleuchtungsstärke mit Verdeckung, Kelvin → RGB.

/** Exponent n, sodass I(θ/2) = 0,5 · I₀ (θ = voller Abstrahlwinkel in Grad). */
export function cosExponent(abstrahlwinkel) {
  const halb = ((abstrahlwinkel / 2) * Math.PI) / 180;
  return Math.log(0.5) / Math.log(Math.cos(halb));
}

/** Spitzenlichtstärke I₀ (cd) eines cosⁿ-Strahlers mit Lichtstrom Φ (lm): I₀ = Φ (n + 1) / 2π. */
export function spitzenLichtstaerke(lumen, abstrahlwinkel) {
  return (lumen * (cosExponent(abstrahlwinkel) + 1)) / (2 * Math.PI);
}

/** Winkel (rad), innerhalb dessen die Lichtstärke ≥ 90 % von I₀ ist. */
export function innererKegel(abstrahlwinkel) {
  return Math.acos(0.9 ** (1 / cosExponent(abstrahlwinkel)));
}

/** Kelvin → RGB (0…1), Näherung nach Tanner Helland. */
export function kelvinZuRgb(kelvin) {
  const t = Math.min(40000, Math.max(1000, kelvin)) / 100;
  const r = t <= 66 ? 255 : 329.698727446 * (t - 60) ** -0.1332047592;
  const g = t <= 66 ? 99.4708025861 * Math.log(t) - 161.1195681661 : 288.1221695283 * (t - 60) ** -0.0755148492;
  const b = t >= 66 ? 255 : t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  const k = (v) => Math.round(Math.min(255, Math.max(0, v)) / 255 * 1000) / 1000;
  return [k(r), k(g), k(b)];
}

/** Schneidet die Strecke a → b einen Quader? (Slab-Verfahren, Quader um 0,5 mm verkleinert) */
function streckeTrifftQuader(a, b, q) {
  let t0 = 0;
  let t1 = 1;
  for (const [achse, min, max] of [['x', q.x0, q.x1], ['y', q.y0, q.y1], ['z', q.z0, q.z1]]) {
    const d = b[achse] - a[achse];
    const lo = min + 0.5;
    const hi = max - 0.5;
    if (hi <= lo) return false;
    if (Math.abs(d) < 1e-12) {
      if (a[achse] <= lo || a[achse] >= hi) return false;
      continue;
    }
    let ta = (lo - a[achse]) / d;
    let tb = (hi - a[achse]) / d;
    if (ta > tb) [ta, tb] = [tb, ta];
    t0 = Math.max(t0, ta);
    t1 = Math.min(t1, tb);
    if (t0 >= t1) return false;
  }
  return true;
}

/**
 * Beleuchtungsstärke (lx) im Punkt p (mm) mit Flächennormale n.
 * strahler: { position, richtung | null (isotrop), i0, n }; hindernisse: Quader { x0…z1 } in mm.
 */
export function beleuchtungsstaerke(p, normale, strahler, hindernisse = []) {
  let e = 0;
  for (const s of strahler) {
    const vx = p.x - s.position.x;
    const vy = p.y - s.position.y;
    const vz = p.z - s.position.z;
    const d2 = vx * vx + vy * vy + vz * vz;
    if (d2 < 1) continue;
    const d = Math.sqrt(d2);
    const cosBeta = -(normale.x * vx + normale.y * vy + normale.z * vz) / d;
    if (cosBeta <= 0) continue;
    let i = s.i0;
    if (s.richtung) {
      const cosGamma = (s.richtung.x * vx + s.richtung.y * vy + s.richtung.z * vz) / d;
      if (cosGamma <= 0) continue;
      i *= cosGamma ** s.n;
    }
    if (i * cosBeta < 1e-9) continue;
    if (hindernisse.some((q) => streckeTrifftQuader(s.position, p, q))) continue;
    e += (i * cosBeta) / (d2 / 1e6);
  }
  return e;
}
