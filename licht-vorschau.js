// Live-Vorschau für das Lichtquellen-Modul, gekoppelt an das Möbel-Modul (beide nur über ihre öffentliche API).

import { berechneLicht, lichtVorlage, kelvinZuRgb, PROFILE, SPOTS } from './licht/src/index.js';
import { berechne as berechneMoebel, erstelleVorlage } from './src/index.js';
import { Ansicht3D } from './licht-3d.js';

const $ = (s) => document.querySelector(s);
const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const de = (v, n = 1) => (typeof v === 'number' ? v.toLocaleString('de-DE', { maximumFractionDigits: n }) : v ?? '');
const SPEICHER = 'moebel-lichtplaner-v1';
// Sequentielle Rampe (eine Farbe, hell → dunkel) für die Beleuchtungsstärke
const RAMPE = ['#cde2fb', '#b7d3f6', '#9ec5f4', '#86b6ef', '#6da7ec', '#5598e7', '#3987e5', '#2a78d6', '#256abf', '#1c5cab', '#184f95', '#104281', '#0d366b'];
const KELVIN = [2700, 3000, 4000, 6500];
const RICHTUNGEN = [['nach unten', { x: 0, y: 0, z: -1 }], ['nach oben', { x: 0, y: 0, z: 1 }], ['nach vorne', { x: 0, y: -1, z: 0 }], ['nach hinten', { x: 0, y: 1, z: 0 }], ['nach rechts', { x: 1, y: 0, z: 0 }], ['nach links', { x: -1, y: 0, z: 0 }]];

let z = laden() ?? startZustand();
let moebel = null;
let ergebnis = null;
let reiter = 'stueck';
let ansicht = 'ansicht' in (z ?? {}) ? z.ansicht : '3d';
let drei = null;
// Zugriff für automatisierte Oberflächentests
globalThis.lichtplaner = { get drei() { return drei; }, get zustand() { return z; }, get ergebnis() { return ergebnis; } };
const offen = new Set();

function startZustand() {
  const m = berechneMoebel(erstelleVorlage());
  const v = lichtVorlage(m);
  return { masse: { breite: 800, hoehe: 2000, tiefe: 560 }, leuchten: v.leuchten, pruef: v.pruefflaechen.map((p) => p.teil), soll: 300 };
}
function laden() {
  try { const t = localStorage.getItem(SPEICHER); const o = t ? JSON.parse(t) : null; return o?.masse && Array.isArray(o.leuchten) ? o : null; } catch { return null; }
}
function speichern() { try { localStorage.setItem(SPEICHER, JSON.stringify(z)); } catch { /* optional */ } }

function rgb(kelvin) {
  const [r, g, b] = kelvinZuRgb(kelvin);
  return `rgb(${Math.round(r * 255)} ${Math.round(g * 255)} ${Math.round(b * 255)})`;
}
function leseZahl(el, leer = false) {
  const roh = el.value.trim().replace(',', '.');
  el.classList.remove('ungueltig');
  if (roh === '' && leer) return undefined;
  const n = Number(roh);
  if (roh === '' || !Number.isFinite(n)) { el.classList.add('ungueltig'); return null; }
  return n;
}
const optionen = (liste, wert) => liste.map(([v, t]) => `<option value="${esc(v)}"${String(v) === String(wert) ? ' selected' : ''}>${esc(t)}</option>`).join('');

// ── Formular ─────────────────────────────────────────────────────────────────

function befestigungsTeile() {
  return (moebel?.teile ?? []).filter((t) => (t.kategorie === 'boden' && t.bodenTyp !== 'schubladenboden') || t.kategorie === 'seite')
    .sort((a, b) => b.lage.z - a.lage.z)
    .map((t) => [t.id, `${t.bezeichnung} ${t.id}`]);
}

function zahlFeld(id, label, wert, platz = '') {
  return `<div class="feld"><label for="${id}">${esc(label)}</label><input id="${id}" inputmode="decimal" value="${wert ?? ''}" placeholder="${esc(platz)}"></div>`;
}
function auswahl(id, label, wert, liste, breit = false) {
  return `<div class="feld${breit ? ' breit' : ''}"><label for="${id}">${esc(label)}</label><select id="${id}">${optionen(liste, wert)}</select></div>`;
}

function leuchteFelder(l, i) {
  const p = `l${i}`;
  const b = l.befestigung ?? {};
  const teilListe = befestigungsTeile();
  const istSeite = String(b.teil ?? '').startsWith('seite');
  const flaechen = istSeite ? [['innen', 'innen']] : [['unten', 'unten'], ['oben', 'oben']];
  let h = '<div class="felder">';
  if (l.typ === 'ledProfil') {
    h += auswahl(`${p}-teil`, 'Teil', b.teil, teilListe, true);
    h += auswahl(`${p}-flaeche`, 'Fläche', b.flaeche ?? flaechen[0][0], flaechen);
    h += auswahl(`${p}-profil`, 'Profil', l.profil ?? 'einbau', Object.entries(PROFILE).map(([k, v]) => [k, v.name.replace('Alu-', '')]));
    h += zahlFeld(`${p}-abstandVorne`, 'Abstand vorne', b.abstandVorne, '40');
    h += zahlFeld(`${p}-rand`, 'Rand links/rechts', b.rand, '20');
    h += auswahl(`${p}-kelvin`, 'Lichtfarbe', l.streifen?.kelvin ?? 3000, KELVIN.map((k) => [k, `${k} K`]));
    h += zahlFeld(`${p}-wpm`, 'W/m', l.streifen?.wattProMeter, '9,6');
    h += zahlFeld(`${p}-lpm`, 'lm/m', l.streifen?.lumenProMeter, '1000');
    h += auswahl(`${p}-spannung`, 'Spannung', l.streifen?.spannung ?? 24, [[24, '24 V'], [12, '12 V']]);
    h += auswahl(`${p}-kabel`, 'Kabel', b.kabel ?? 'nut', [['nut', 'Kabelnut'], ['bohrung', 'Bohrung Ø 8'], ['keine', 'keine']]);
  } else if (l.typ === 'spot') {
    h += auswahl(`${p}-teil`, 'Teil', b.teil, teilListe, true);
    h += auswahl(`${p}-flaeche`, 'Fläche', b.flaeche ?? flaechen[0][0], flaechen);
    h += auswahl(`${p}-modell`, 'Spot', l.modell ?? 'moebelspot58', Object.entries(SPOTS).map(([k, v]) => [k, v.name]), true);
    h += zahlFeld(`${p}-anzahl`, 'Anzahl', b.anzahl, '1');
    h += zahlFeld(`${p}-abstandVorne`, 'Abstand vorne', b.abstandVorne, '100');
    h += auswahl(`${p}-kelvin`, 'Lichtfarbe', l.kelvin ?? 3000, KELVIN.map((k) => [k, `${k} K`]));
    h += auswahl(`${p}-kabel`, 'Kabel', b.kabel ?? 'bohrung', [['bohrung', 'Bohrung Ø 8'], ['nut', 'Kabelnut'], ['keine', 'keine']]);
  } else if (l.typ === 'linie') {
    const info = ergebnis?.leuchten.find((x) => x.id === l.id);
    h += `<p class="leise feld breit">${info ? (info.teil ? `liegt auf ${esc(info.teil)} · ${esc(info.flaeche)} → strahlt von der Fläche weg` : 'frei im Raum') + ` · ${de(info.laenge, 0)} mm, ${info.segmente} Segment${info.segmente > 1 ? 'e' : ''}` : ''}</p>`;
    h += auswahl(`${p}-profil`, 'Profil', l.profil ?? 'aufbau', [['keins', 'LED-Streifen ohne Profil'], ...Object.entries(PROFILE).map(([k, v]) => [k, v.name.replace('Alu-', '')])], true);
    h += auswahl(`${p}-kelvin`, 'Lichtfarbe', l.streifen?.kelvin ?? 3000, KELVIN.map((k) => [k, `${k} K`]));
    h += zahlFeld(`${p}-wpm`, 'W/m', l.streifen?.wattProMeter, '9,6');
    h += zahlFeld(`${p}-lpm`, 'lm/m', l.streifen?.lumenProMeter, '1000');
    h += auswahl(`${p}-spannung`, 'Spannung', l.streifen?.spannung ?? 24, [[24, '24 V'], [12, '12 V']]);
    const abstr = typeof l.abstrahlung === 'object' ? JSON.stringify(l.abstrahlung) : (l.abstrahlung ?? 'auto');
    h += auswahl(`${p}-abstrahlung`, 'Abstrahlung', abstr, [['auto', 'von der Fläche weg'], ['rundum', 'rundum (360°)'], ...RICHTUNGEN.map(([n, v]) => [JSON.stringify(v), n])]);
    h += auswahl(`${p}-kabel`, 'Kabel', l.befestigung?.kabel ?? l.kabel ?? 'nut', [['nut', 'Kabelnut'], ['bohrung', 'Bohrung Ø 8'], ['keine', 'keine']]);
    h += `<div class="feld breit"><label>Punkte (mm, Welt: x Breite, y Tiefe, z Höhe)</label><div class="punkte">${(l.punkte ?? []).map((q, j) => `<span>${j + 1}</span>${['x', 'y', 'z'].map((a) => `<input id="${p}-pt${j}-${a}" inputmode="decimal" value="${q[a]}" aria-label="Punkt ${j + 1} ${a}">`).join('')}<button type="button" data-pt-weg="${i}:${j}" aria-label="Punkt ${j + 1} löschen">✕</button>`).join('')}</div></div>`;
  } else {
    h += zahlFeld(`${p}-px`, 'x', l.position?.x);
    h += zahlFeld(`${p}-py`, 'y', l.position?.y);
    h += zahlFeld(`${p}-pz`, 'z', l.position?.z);
    h += zahlFeld(`${p}-lumen`, 'Lumen', l.lumen, '800');
    h += auswahl(`${p}-kelvin`, 'Lichtfarbe', l.kelvin ?? 2700, KELVIN.map((k) => [k, `${k} K`]));
  }
  return `${h}</div>`;
}

function zeichneLeuchten() {
  $('#leuchten').innerHTML = z.leuchten.map((l, i) => {
    const kelvin = l.streifen?.kelvin ?? l.kelvin ?? 3000;
    const name = { ledProfil: 'LED-Profil', spot: 'Spots', punktlicht: 'Punktlicht', linie: 'Linienlicht' }[l.typ] ?? l.typ;
    const erg = ergebnis?.leuchten.find((x) => x.id === l.id);
    const info = l.typ === 'linie'
      ? `${(l.punkte ?? []).length} Punkte · ${erg?.teil ? `${erg.teil} ${erg.flaeche}` : 'frei'}`
      : l.befestigung ? `${l.befestigung.teil} · ${l.befestigung.flaeche}${l.befestigung.anzahl ? ` · ${l.befestigung.anzahl}×` : ''}` : 'frei im Raum';
    return `<details class="leuchte" data-i="${i}"${offen.has(i) ? ' open' : ''}><summary><i class="lampe" style="background:${rgb(kelvin)}"></i>
      <span class="titel">${esc(name)}</span><span class="info">${esc(l.id)} · ${esc(info)} · ${kelvin} K</span></summary>
      <div class="inhalt">${leuchteFelder(l, i)}<button type="button" class="weg" data-weg="${i}">Leuchte entfernen</button></div></details>`;
  }).join('');
  document.querySelectorAll('details.leuchte').forEach((d) => d.addEventListener('toggle', () => {
    const i = Number(d.dataset.i); if (d.open) offen.add(i); else offen.delete(i);
  }));
  z.leuchten.forEach(bindeLeuchte);
  document.querySelectorAll('[data-weg]').forEach((b) => b.addEventListener('click', () => {
    z.leuchten.splice(Number(b.dataset.weg), 1); offen.clear(); zeichneLeuchten(); aktualisiere();
  }));
  document.querySelectorAll('[data-pt-weg]').forEach((b) => b.addEventListener('click', () => {
    const [i, j] = b.dataset.ptWeg.split(':').map(Number);
    z.leuchten[i].punkte.splice(j, 1);
    offen.add(i); aktualisiere(); zeichneLeuchten();
  }));
}

function bindeLeuchte(l, i) {
  const p = `#l${i}`;
  const bef = () => (l.befestigung ??= {});
  const neu = () => { offen.add(i); zeichneLeuchten(); aktualisiere(); };
  const zahl = (sel, setzen) => {
    const el = $(sel);
    el?.addEventListener('input', () => { const v = leseZahl(el, true); if (v === null) return; setzen(v); aktualisiere(); });
  };
  $(`${p}-teil`)?.addEventListener('change', (ev) => {
    bef().teil = ev.target.value;
    bef().flaeche = ev.target.value.startsWith('seite') ? 'innen' : 'unten';
    neu();
  });
  $(`${p}-flaeche`)?.addEventListener('change', (ev) => { bef().flaeche = ev.target.value; neu(); });
  $(`${p}-profil`)?.addEventListener('change', (ev) => { l.profil = ev.target.value; neu(); });
  $(`${p}-modell`)?.addEventListener('change', (ev) => { l.modell = ev.target.value; neu(); });
  $(`${p}-kabel`)?.addEventListener('change', (ev) => { bef().kabel = ev.target.value; aktualisiere(); });
  $(`${p}-abstrahlung`)?.addEventListener('change', (ev) => {
    const v = ev.target.value;
    l.abstrahlung = v.startsWith('{') ? JSON.parse(v) : v;
    neu();
  });
  (l.punkte ?? []).forEach((q, j) => {
    for (const a of ['x', 'y', 'z']) zahl(`${p}-pt${j}-${a}`, (v) => { q[a] = v ?? 0; });
  });
  $(`${p}-kelvin`)?.addEventListener('change', (ev) => {
    const k = Number(ev.target.value);
    if (l.typ === 'ledProfil' || l.typ === 'linie') (l.streifen ??= {}).kelvin = k; else l.kelvin = k;
    neu();
  });
  $(`${p}-spannung`)?.addEventListener('change', (ev) => { (l.streifen ??= {}).spannung = Number(ev.target.value); aktualisiere(); });
  for (const k of ['abstandVorne', 'rand', 'anzahl']) zahl(`${p}-${k}`, (v) => { if (v === undefined) delete bef()[k]; else bef()[k] = k === 'anzahl' ? Math.max(1, Math.round(v)) : v; });
  zahl(`${p}-wpm`, (v) => { (l.streifen ??= {}).wattProMeter = v ?? 9.6; });
  zahl(`${p}-lpm`, (v) => { (l.streifen ??= {}).lumenProMeter = v ?? 1000; });
  zahl(`${p}-lumen`, (v) => { l.lumen = v ?? 800; });
  for (const a of ['x', 'y', 'z']) zahl(`${p}-p${a}`, (v) => { (l.position ??= { x: 0, y: 0, z: 0 })[a] = v ?? 0; });
}

function zeichnePruefliste() {
  const boeden = (moebel?.teile ?? []).filter((t) => t.kategorie === 'boden' && t.bodenTyp !== 'schubladenboden').sort((a, b) => b.lage.z - a.lage.z);
  $('#pruefliste').innerHTML = boeden.map((t) => `<label><input type="checkbox" data-pruef="${esc(t.id)}"${z.pruef.includes(t.id) ? ' checked' : ''}> ${esc(t.bezeichnung)} ${esc(t.id)} <span class="klein">(Oberseite)</span></label>`).join('');
  document.querySelectorAll('[data-pruef]').forEach((c) => c.addEventListener('change', () => {
    z.pruef = [...document.querySelectorAll('[data-pruef]:checked')].map((x) => x.dataset.pruef);
    aktualisiere();
  }));
}

for (const k of ['breite', 'hoehe', 'tiefe']) {
  $(`#m-${k}`).addEventListener('input', (ev) => {
    const v = leseZahl(ev.target);
    if (v === null || v < 200) return;
    z.masse[k] = v;
    baueMoebel();
    zeichneLeuchten();
    zeichnePruefliste();
    aktualisiere();
  });
}
$('#soll').addEventListener('input', (ev) => { const v = leseZahl(ev.target, true); if (v === null) return; z.soll = v ?? null; aktualisiere(); });
document.querySelectorAll('[data-neu]').forEach((b) => b.addEventListener('click', () => {
  const typ = b.dataset.neu;
  const n = z.leuchten.filter((l) => l.typ === typ).length + 1;
  const ob = moebel.teile.find((t) => t.bodenTyp === 'oberboden');
  const fach = moebel.teile.find((t) => t.bodenTyp === 'fachboden');
  if (typ === 'ledProfil') z.leuchten.push({ id: `led-${n}`, typ, profil: 'aufbau', befestigung: { teil: fach?.id ?? ob.id, flaeche: 'unten', abstandVorne: 150, rand: 30 } });
  if (typ === 'spot') z.leuchten.push({ id: `spot-${n}`, typ, modell: 'moebelspot58', befestigung: { teil: ob.id, flaeche: 'unten', anzahl: 2, abstandVorne: 150 } });
  if (typ === 'punktlicht') z.leuchten.push({ id: `licht-${n}`, typ, lumen: 800, kelvin: 2700, position: { x: z.masse.breite / 2, y: -800, z: z.masse.hoehe + 400 } });
  offen.add(z.leuchten.length - 1);
  zeichneLeuchten();
  aktualisiere();
}));
$('#vorlage').addEventListener('click', () => {
  z = { ...startZustand(), masse: z.masse };
  baueMoebel();
  const v = lichtVorlage(moebel);
  z.leuchten = v.leuchten; z.pruef = v.pruefflaechen.map((p) => p.teil);
  offen.clear(); zeichneLeuchten(); zeichnePruefliste(); aktualisiere();
});
$('#reiter').addEventListener('click', (ev) => {
  const b = ev.target.closest('button[data-reiter]');
  if (b) { reiter = b.dataset.reiter; zeichneReiter(); }
});

function baueMoebel() {
  const v = erstelleVorlage();
  v.korpus = { ...v.korpus, ...z.masse };
  moebel = berechneMoebel(v);
}

// ── Zeichnungen ──────────────────────────────────────────────────────────────

/** Nächstes Hindernis in Abstrahlrichtung (Vorderansicht): Abstand bis zur nächsten Bodenfläche bzw. Seite. */
function reichweite(p, r, k) {
  const boeden = moebel.teile.filter((t) => t.kategorie === 'boden' || t.kategorie === 'zarge');
  if (r.z < -0.5) {
    const unter = boeden.filter((t) => t.lage.x <= p.x && t.lage.x + t.lage.dx >= p.x && t.lage.z + t.lage.dz <= p.z - 0.5);
    return p.z - Math.max(0, ...unter.map((t) => t.lage.z + t.lage.dz));
  }
  if (r.z > 0.5) {
    const ueber = boeden.filter((t) => t.lage.x <= p.x && t.lage.x + t.lage.dx >= p.x && t.lage.z >= p.z + 0.5);
    return Math.min(k.hoehe, ...ueber.map((t) => t.lage.z)) - p.z;
  }
  return r.x > 0 ? k.breite - k.seitenStaerke - p.x : p.x - k.seitenStaerke;
}

function zeichneVorne() {
  const k = moebel.korpus;
  const B = k.breite;
  const H = k.hoehe;
  const fs = Math.max(B, H) / 50;
  const svg = $('#vorne');
  svg.setAttribute('viewBox', `${-fs * 4} ${-fs * 1.5} ${B + fs * 5} ${H + fs * 4.5}`);
  const y = (v) => H - v;
  let h = `<defs><clipPath id="innen"><rect x="${k.seitenStaerke}" y="0" width="${B - 2 * k.seitenStaerke}" height="${H}"/></clipPath>
    <filter id="weich" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="${fs * 0.8}"/></filter></defs>`;
  h += `<rect x="0" y="0" width="${B}" height="${H}" fill="var(--nacht)"/>`;
  // Lichtkegel
  h += '<g clip-path="url(#innen)" style="mix-blend-mode:screen">';
  let gi = 0;
  for (const l of ergebnis.leuchten) {
    const farbe = rgb(l.kelvin);
    const zug = l.punkte ?? (l.anfang ? [l.anfang, l.ende] : [l.position]);
    if (!l.richtung) {
      // rundum strahlende Linie oder Punktlicht: weicher Lichthof
      if (zug.length > 1) h += `<polyline points="${zug.map((q) => `${q.x},${y(q.z)}`).join(' ')}" fill="none" stroke="${farbe}" stroke-opacity="0.35" stroke-width="${fs * 4}" stroke-linecap="round" stroke-linejoin="round" filter="url(#weich)"/>`;
      continue;
    }
    const len = Math.hypot(l.richtung.x, l.richtung.z);
    if (len < 0.2) continue;
    const rx = l.richtung.x / len;
    const rz = l.richtung.z / len;
    const qx = -rz; const qz = rx; // quer zur Richtung in der Ansichtsebene
    const segmente = zug.length > 1 ? zug.slice(0, -1).map((a, j) => [a, zug[j + 1]]) : [[zug[0], zug[0]]];
    for (const [a, e] of segmente) {
      const mitte = { x: (a.x + e.x) / 2, z: (a.z + e.z) / 2 };
      const d = Math.max(20, reichweite(mitte, { x: rx, z: rz }, k));
      const spreiz = Math.tan(((l.abstrahlwinkel ?? 120) / 2) * Math.PI / 180) * d;
      // Anfang/Ende entlang der Querrichtung sortieren, dann beidseitig um die Spreizung aufweiten
      const [p1, p2] = [[a.x, a.z], [e.x, e.z]].sort((u, v) => (u[0] * qx + u[1] * qz) - (v[0] * qx + v[1] * qz));
      const ziel1 = [p1[0] + rx * d - qx * spreiz, p1[1] + rz * d - qz * spreiz];
      const ziel2 = [p2[0] + rx * d + qx * spreiz, p2[1] + rz * d + qz * spreiz];
      gi++;
      h += `<linearGradient id="g${gi}" gradientUnits="userSpaceOnUse" x1="${mitte.x}" y1="${y(mitte.z)}" x2="${mitte.x + rx * d}" y2="${y(mitte.z + rz * d)}">
        <stop offset="0" stop-color="${farbe}" stop-opacity="0.8"/><stop offset="1" stop-color="${farbe}" stop-opacity="0.12"/></linearGradient>`;
      h += `<polygon points="${p1[0]},${y(p1[1])} ${p2[0]},${y(p2[1])} ${ziel2[0]},${y(ziel2[1])} ${ziel1[0]},${y(ziel1[1])}" fill="url(#g${gi})"><title>${esc(l.id)}: ${de(l.lumen, 0)} lm, ${l.kelvin} K</title></polygon>`;
    }
  }
  h += '</g>';
  // Möbelteile
  for (const kat of ['rueckwand', 'zarge', 'boden', 'sockelblende', 'seite']) {
    for (const t of moebel.teile.filter((x) => x.kategorie === kat)) {
      if (kat === 'rueckwand') continue;
      const l = t.lage;
      h += `<rect x="${l.x}" y="${y(l.z + l.dz)}" width="${l.dx}" height="${Math.max(l.dz, 1)}" fill="var(--holz)" stroke="var(--holz-kante)" stroke-width="1" vector-effect="non-scaling-stroke"${kat === 'zarge' ? ' opacity="0.55"' : ''}><title>${esc(t.bezeichnung)} ${esc(t.id)}</title></rect>`;
    }
  }
  // Leuchten selbst
  for (const l of ergebnis.leuchten) {
    const farbe = rgb(l.kelvin);
    if (l.anfang) {
      const zug = l.punkte ?? [l.anfang, l.ende];
      h += `<polyline points="${zug.map((q) => `${q.x},${y(q.z)}`).join(' ')}" fill="none" stroke="${farbe}" stroke-width="${fs * 0.35}" stroke-linecap="round" stroke-linejoin="round"><title>${esc(l.id)}</title></polyline>`;
    } else {
      h += `<circle cx="${l.position.x}" cy="${y(l.position.z)}" r="${fs * 0.45}" fill="${farbe}" stroke="var(--nacht)" stroke-width="1" vector-effect="non-scaling-stroke"><title>${esc(l.id)}</title></circle>`;
    }
  }
  // Gezeichnete Linien (gestrichelt) und laufende Zeichnung
  const strich = (pts, extra = '') => `<polyline points="${pts.map((q) => `${q.x},${y(q.z)}`).join(' ')}" fill="none" stroke="#22d3ee" stroke-width="${fs * 0.22}" stroke-linecap="round" stroke-linejoin="round" ${extra}/>`;
  for (const lin of z.linien ?? []) h += strich(lin.punkte, `stroke-dasharray="${fs * 0.6} ${fs * 0.4}"`);
  if (zeichnen2d) {
    const kette = [...zeichnen2d.punkte, ...(zeichnen2d.cursor ? [zeichnen2d.cursor] : [])];
    if (kette.length > 1) h += strich(kette);
    kette.forEach((q, j) => { h += `<circle cx="${q.x}" cy="${y(q.z)}" r="${fs * (j === kette.length - 1 && zeichnen2d.cursor ? 0.4 : 0.3)}" fill="#22d3ee"/>`; });
    if (zeichnen2d.cursor) h += `<text x="${zeichnen2d.cursor.x + fs * 0.6}" y="${y(zeichnen2d.cursor.z) - fs * 0.6}" font-size="${fs * 0.8}" fill="#22d3ee">${de(zeichnen2d.cursor.x, 0)} / ${de(zeichnen2d.cursor.z, 0)}</text>`;
  }
  // Maße
  h += `<line x1="0" y1="${H + fs * 1.6}" x2="${B}" y2="${H + fs * 1.6}" stroke="var(--accent)" stroke-width="1" vector-effect="non-scaling-stroke"/>
    <text x="${B / 2}" y="${H + fs * 2.9}" font-size="${fs}" text-anchor="middle" fill="var(--accent)">${de(B, 0)}</text>
    <line x1="${-fs * 1.4}" y1="0" x2="${-fs * 1.4}" y2="${H}" stroke="var(--accent)" stroke-width="1" vector-effect="non-scaling-stroke"/>
    <text x="${-fs * 1.8}" y="${H / 2}" font-size="${fs}" text-anchor="end" dominant-baseline="middle" fill="var(--accent)">${de(H, 0)}</text>`;
  svg.innerHTML = h;
  $('#vorne-info').textContent = `${ergebnis.summe.anzahl} Leuchten · ${de(ergebnis.summe.lumen, 0)} lm`;
}

function farbeFuer(wert, max) {
  if (max <= 0) return RAMPE[0];
  return RAMPE[Math.min(RAMPE.length - 1, Math.floor((wert / max) * RAMPE.length))];
}

function zeichneKarten() {
  const flaechen = ergebnis.beleuchtung;
  const max = Math.max(1, ...flaechen.map((b) => b.max));
  if (!flaechen.length) {
    $('#karten').innerHTML = '<p class="leise">Links eine Prüffläche wählen, z. B. die Oberseite eines Fachbodens.</p>';
    $('#lux-info').textContent = '';
    return;
  }
  $('#karten').innerHTML = flaechen.map((b) => {
    const zw = b.laenge / b.nx;
    const zh = b.breite / b.ny;
    let zellen = '';
    b.werte.forEach((zeile, j) => zeile.forEach((w, i) => {
      // y = 0 (Vorderkante) unten in der Zeichnung
      zellen += `<rect x="${i * zw}" y="${b.breite - (j + 1) * zh}" width="${zw + 0.5}" height="${zh + 0.5}" fill="${farbeFuer(w, max)}"><title>${de((i + 0.5) * zw, 0)} / ${de((j + 0.5) * zh, 0)} mm: ${de(w, 0)} lx</title></rect>`;
    }));
    const ok = b.sollLux == null || b.mittel >= b.sollLux;
    const fs = b.laenge / 32;
    return `<div class="karte"><div class="karte-kopf"><b>${esc(b.name)}</b>
        <span class="pill ${ok ? 'ok' : 'warnung'}">${ok ? '✓' : '!'} Ø ${de(b.mittel, 0)} lx${b.sollLux ? ` / Soll ${de(b.sollLux, 0)}` : ''}</span></div>
      <svg viewBox="0 ${-fs * 1.4} ${b.laenge} ${b.breite + fs * 1.4}" role="img" aria-label="Lux-Karte ${esc(b.name)}">${zellen}
        <text x="0" y="${-fs * 0.4}" font-size="${fs}" fill="var(--muted)">hinten</text></svg>
      <div class="werte"><span>min ${de(b.min, 0)} lx</span><span>max ${de(b.max, 0)} lx</span><span>U₀ ${de(b.gleichmaessigkeit, 2)}</span><span>${b.nx} × ${b.ny} Punkte</span><span>vorne = unten</span></div></div>`;
  }).join('') + `<div class="legende"><span>0</span><span class="skala" style="background:linear-gradient(90deg, ${RAMPE.join(', ')})"></span><span>${de(max, 0)} lx</span></div>`;
  $('#lux-info').textContent = 'Raster 50 mm';
}

function zeichneKennzahlen() {
  const e = ergebnis;
  const nt = e.netzteile.map((n) => `${n.anzahl > 1 ? `${n.anzahl} × ` : ''}${n.nennW} W / ${n.spannung} V`).join(', ') || '–';
  const kz = [
    [`${de(e.summe.watt, 1)} W`, 'Leistung gesamt'],
    [`${de(e.summe.lumen, 0)} lm`, 'Lichtstrom gesamt'],
    [nt, 'Netzteil (20 % Reserve)'],
    [`${de(e.kabel.gesamtM, 1)} m`, 'Anschlusskabel'],
    [`${e.bearbeitungen.length}`, 'CNC-Bearbeitungen'],
  ];
  $('#kennzahlen').innerHTML = kz.map(([b, s]) => `<div class="kz"><b>${esc(b)}</b><span>${esc(s)}</span></div>`).join('');
}

function tabelle(kopf, zeilen, zahlen = []) {
  return `<div class="tabelle"><table><thead><tr>${kopf.map((k) => `<th>${esc(k)}</th>`).join('')}</tr></thead><tbody>${zeilen.map((r) => `<tr>${r.map((c, i) => `<td${zahlen.includes(i) ? ' class="zahl"' : ''}>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}

function zeichneReiter() {
  document.querySelectorAll('#reiter button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.reiter === reiter)));
  const e = ergebnis;
  const ziel = $('#reiter-inhalt');
  if (reiter === 'stueck') {
    ziel.innerHTML = tabelle(['Position', 'Menge', 'Einheit', 'Details'], e.stueckliste.map((s) => [esc(s.position), de(s.menge, 2), esc(s.einheit), `<span class="klein">${esc(s.detail)}</span>`]), [1]);
  } else if (reiter === 'pruef') {
    ziel.innerHTML = e.pruefungen.length
      ? e.pruefungen.map((p) => `<div class="meldung ${p.schwere}"><strong style="color:var(--${p.schwere})">${{ fehler: 'Fehler', warnung: 'Warnung', hinweis: 'Hinweis' }[p.schwere]}</strong><span>${esc(p.meldung)}</span><span></span><code>${esc(p.code)}${p.teil ? ` · ${esc(p.teil)}` : ''}</code></div>`).join('')
      : '<p class="leise">Keine Probleme: Bohrungen und Nuten kollidieren nicht, Netzteil und Beleuchtung passen.</p>';
  } else if (reiter === 'cnc') {
    ziel.innerHTML = tabelle(['Teil', 'Art', 'Fläche', 'x', 'y', 'Ø / Breite', 'Tiefe', 'bis', 'Leuchte'], e.bearbeitungen.map((b) => [
      esc(b.teil), esc(b.art), esc(b.flaeche), de((b.von ?? b).x), de((b.von ?? b).y), de(b.durchmesser ?? b.breite), de(b.tiefe),
      b.bis ? `${de(b.bis.x)} / ${de(b.bis.y)}` : '', esc(b.quelle),
    ]), [3, 4, 5, 6]) + '<p class="leise">Teilkoordinaten wie im Möbel-Modul; die Bearbeitungen werden zu den Möbel-CNC-Daten des Teils hinzugefügt.</p>';
  } else if (reiter === 'leuchten') {
    ziel.innerHTML = tabelle(['Leuchte', 'Typ', 'Teil', 'Länge', 'Leistung', 'Lichtstrom', 'Lichtfarbe', 'Winkel'], e.leuchten.map((l) => [
      esc(l.id), esc(l.name), esc(l.teil ?? 'frei'), l.laenge ? `${de(l.laenge, 0)} mm (Streifen ${de(l.streifenLaenge, 0)})` : '', `${de(l.watt, 2)} W`, `${de(l.lumen, 0)} lm`,
      `<span class="lampe" style="display:inline-block;vertical-align:-2px;background:${rgb(l.kelvin)}"></span> ${l.kelvin} K`, l.abstrahlwinkel ? `${l.abstrahlwinkel}°` : '360°',
    ]), [4, 5]);
  } else {
    ziel.innerHTML = `<p class="leise">Lichter im glTF-Stil (KHR_lights_punctual): Meter, Candela bzw. Lumen, Kegelwinkel in rad – für Renderer und 3D-Viewer.</p><pre>${esc(JSON.stringify(e.renderLichter, null, 2))}</pre>`;
  }
}

function zeichneStatus(fehler) {
  const st = $('#status');
  if (fehler) { st.innerHTML = `<span class="pill fehler">${esc(fehler)}</span>`; return; }
  const n = (s) => ergebnis.pruefungen.filter((p) => p.schwere === s).length;
  st.innerHTML = (n('fehler') ? `<span class="pill fehler">${n('fehler')} Fehler</span>` : '<span class="pill ok">montierbar</span>')
    + (n('warnung') ? `<span class="pill warnung">${n('warnung')} Warnung${n('warnung') > 1 ? 'en' : ''}</span>` : '')
    + (n('hinweis') ? `<span class="pill hinweis">${n('hinweis')} Hinweis${n('hinweis') > 1 ? 'e' : ''}</span>` : '');
}

function aktualisiere() {
  try {
    ergebnis = berechneLicht({
      moebel,
      leuchten: z.leuchten,
      pruefflaechen: z.pruef.filter((id) => moebel.teile.some((t) => t.id === id)).map((id) => {
        const t = moebel.teile.find((x) => x.id === id);
        return { name: `${t.bezeichnung} ${t.id}`, teil: id, flaeche: 'oben', sollLux: z.soll ?? null };
      }),
    });
  } catch (err) {
    zeichneStatus(err.message);
    return;
  }
  speichern();
  zeichneStatus();
  zeichneKennzahlen();
  zeichneVorne();
  zeige3D();
  zeichneKarten();
  zeichneReiter();
}

function zeige3D() {
  if (ansicht !== '3d') return;
  try {
    drei ??= new Ansicht3D($('#buehne'));
    drei.zeige(moebel, ergebnis, z.linien ?? []);
  } catch (err) {
    $('#hinweis-3d').textContent = `3D nicht verfügbar (${err.message}). Die 2D-Ansicht funktioniert weiterhin.`;
  }
}

// ── Linien zeichnen und in Lichtquellen umwandeln ───────────────────────────

let zeichnen2d = null; // { punkte, ebeneZ, cursor }
const zeichenOptionen = () => ({
  raster: Math.max(0, leseZahl($('#z-raster'), true) ?? 10),
  kantenAbstand: Math.max(0, leseZahl($('#z-kante'), true) ?? 20),
  rechtwinklig: $('#z-winkel').checked,
});

function zeigeZeichenStatus(info) {
  // Status steht unter der jeweiligen Ansicht, damit die Zeichenfläche beim Zeichnen nicht springt
  const st = ansicht === '3d' ? $('#z-status-3d') : $('#z-status');
  for (const el of [$('#z-status'), $('#z-status-3d')]) if (el !== st) el.hidden = true;
  if (!info) { st.hidden = true; return; }
  st.hidden = false;
  const c = info.cursor;
  st.textContent = info.punkte === 0
    ? `Auf eine Fläche klicken, um die Linie zu beginnen${c ? ` · Zeiger x ${de(c.x, 0)} y ${de(c.y, 0)} z ${de(c.z, 0)}` : ''}`
    : `${info.punkte} Punkt${info.punkte > 1 ? 'e' : ''} · ${de(info.laenge, 0)} mm${info.auf ? ` · auf ${info.auf}` : ''} · Doppelklick / Enter beendet`;
}

function setzeZeichnen(an) {
  $('#zeichnen').setAttribute('aria-pressed', String(an));
  for (const id of ['#z-fertig', '#z-zurueck', '#z-abbrechen']) $(id).disabled = !an;
  $('#vorne').classList.toggle('zeichnet', an);
  if (!an) {
    drei?.abbrechen();
    zeichnen2d = null;
    zeigeZeichenStatus(null);
    zeichneVorne();
    return;
  }
  if (ansicht === '3d' && drei) {
    drei.starteZeichnen(zeichenOptionen(), zeigeZeichenStatus, linieFertig);
  } else {
    zeichnen2d = { punkte: [], ebeneZ: null, cursor: null };
    zeigeZeichenStatus({ punkte: 0 });
  }
}

function linieFertig(linie) {
  z.linien ??= [];
  const n = Math.max(0, ...z.linien.map((x) => Number(String(x.id).split('-')[1]) || 0), ...z.leuchten.filter((x) => x.typ === 'linie').map((x) => Number(String(x.id).split('-')[1]) || 0)) + 1;
  z.linien.push({ id: `linie-${n}`, ...linie });
  setzeZeichnen(false);
  zeichneLinien();
  aktualisiere();
}

function zeichneLinien() {
  const liste = z.linien ?? [];
  $('#linien').innerHTML = liste.length ? liste.map((lin, i) => {
    let laenge = 0;
    for (let k = 0; k + 1 < lin.punkte.length; k++) laenge += Math.hypot(lin.punkte[k + 1].x - lin.punkte[k].x, lin.punkte[k + 1].y - lin.punkte[k].y, lin.punkte[k + 1].z - lin.punkte[k].z);
    return `<div class="linie-eintrag"><span class="info"><b>${esc(lin.id)}</b> · ${lin.punkte.length} Punkte · ${de(laenge, 0)} mm${lin.auf ? ` · ${esc(lin.auf)}` : ''}</span>
      <button type="button" class="umwandeln" data-umwandeln="${i}">→ Lichtquelle</button>
      <button type="button" class="weg" data-linie-weg="${i}">Löschen</button></div>`;
  }).join('') : '<p class="leise">Noch keine Linie gezeichnet.</p>';
  document.querySelectorAll('[data-umwandeln]').forEach((b) => b.addEventListener('click', () => umwandeln(Number(b.dataset.umwandeln))));
  document.querySelectorAll('[data-linie-weg]').forEach((b) => b.addEventListener('click', () => {
    z.linien.splice(Number(b.dataset.linieWeg), 1); zeichneLinien(); aktualisiere();
  }));
}

/** Gezeichnete Linie → Lichtquelle (Typ „linie"). Liegt sie auf keiner Möbelfläche, strahlt sie von ihrer Zeichenfläche weg. */
function umwandeln(i) {
  const lin = z.linien[i];
  const leuchte = { id: lin.id, typ: 'linie', profil: 'aufbau', punkte: lin.punkte.map((q) => ({ ...q })), streifen: { kelvin: 3000 } };
  const probe = berechneLicht({ moebel, leuchten: [leuchte] }).leuchten[0];
  if (!probe?.teil && lin.normale) leuchte.abstrahlung = lin.normale;
  z.linien.splice(i, 1);
  z.leuchten.push(leuchte);
  offen.clear();
  offen.add(z.leuchten.length - 1);
  zeichneLinien();
  aktualisiere();
  zeichneLeuchten();
}

/** 2D-Vorderansicht: Klick → Punkt (x, z), Tiefe y = Kantenabstand; Fang an Bodenflächen, Seiten und Raster. */
function fang2d(ev) {
  const svg = $('#vorne');
  const pt = svg.createSVGPoint();
  pt.x = ev.clientX; pt.y = ev.clientY;
  const q = pt.matrixTransform(svg.getScreenCTM().inverse());
  const k = moebel.korpus;
  const o = zeichenOptionen();
  const fang = Math.max(25, k.hoehe / 80);
  let x = q.x;
  let zz = k.hoehe - q.y;
  const innen = [k.seitenStaerke, k.breite - k.seitenStaerke];
  if (Math.abs(x - innen[0]) < fang) x = innen[0] + o.kantenAbstand;
  else if (Math.abs(x - innen[1]) < fang) x = innen[1] - o.kantenAbstand;
  else if (o.raster) x = Math.round(x / o.raster) * o.raster;
  if (zeichnen2d.ebeneZ !== null) zz = zeichnen2d.ebeneZ;
  else {
    const flaechen = moebel.teile.filter((t) => t.kategorie === 'boden' && t.lage.x <= x && t.lage.x + t.lage.dx >= x).flatMap((t) => [t.lage.z, t.lage.z + t.lage.dz]);
    const nah = flaechen.sort((a, b) => Math.abs(a - zz) - Math.abs(b - zz))[0];
    if (nah !== undefined && Math.abs(nah - zz) < fang) zz = nah;
    else if (o.raster) zz = Math.round(zz / o.raster) * o.raster;
  }
  const p = { x: Math.round(x * 10) / 10, y: o.kantenAbstand, z: Math.round(zz * 10) / 10 };
  const letzter = zeichnen2d.punkte.at(-1);
  if (letzter && o.rechtwinklig) { if (Math.abs(p.x - letzter.x) >= Math.abs(p.z - letzter.z)) p.z = letzter.z; else p.x = letzter.x; }
  return p;
}

function fertig2d() {
  if (!zeichnen2d || zeichnen2d.punkte.length < 2) return;
  const auf = zeichnen2d.ebeneZ !== null ? `Bodenfläche z ${de(zeichnen2d.ebeneZ, 1)}` : 'frei (Vorderansicht)';
  linieFertig({ punkte: zeichnen2d.punkte, normale: { x: 0, y: -1, z: 0 }, auf });
}

$('#vorne').addEventListener('click', (ev) => {
  if (!zeichnen2d) return;
  const p = fang2d(ev);
  const letzter = zeichnen2d.punkte.at(-1);
  if (letzter && Math.hypot(p.x - letzter.x, p.z - letzter.z) < 1) { fertig2d(); return; }
  if (!zeichnen2d.punkte.length) {
    // Liegt der erste Punkt auf einer Bodenfläche, bleibt die Linie auf dieser Höhe
    const aufBoden = moebel.teile.some((t) => t.kategorie === 'boden' && (Math.abs(t.lage.z - p.z) < 0.01 || Math.abs(t.lage.z + t.lage.dz - p.z) < 0.01));
    zeichnen2d.ebeneZ = aufBoden ? p.z : null;
  }
  zeichnen2d.punkte.push(p);
  zeichneVorne();
  zeigeZeichenStatus({ punkte: zeichnen2d.punkte.length, laenge: laengeVon(zeichnen2d.punkte), auf: zeichnen2d.ebeneZ !== null ? 'Bodenfläche' : null });
});
$('#vorne').addEventListener('mousemove', (ev) => {
  if (!zeichnen2d) return;
  zeichnen2d.cursor = fang2d(ev);
  zeichneVorne();
});
$('#vorne').addEventListener('dblclick', fertig2d);

function laengeVon(pts) {
  let l = 0;
  for (let k = 0; k + 1 < pts.length; k++) l += Math.hypot(pts[k + 1].x - pts[k].x, pts[k + 1].y - pts[k].y, pts[k + 1].z - pts[k].z);
  return l;
}

$('#zeichnen').addEventListener('click', () => setzeZeichnen($('#zeichnen').getAttribute('aria-pressed') !== 'true'));
$('#z-fertig').addEventListener('click', () => { if (zeichnen2d) fertig2d(); else drei?.fertig(); });
$('#z-zurueck').addEventListener('click', () => {
  if (zeichnen2d) { zeichnen2d.punkte.pop(); if (!zeichnen2d.punkte.length) zeichnen2d.ebeneZ = null; zeichneVorne(); } else drei?.punktZurueck();
});
$('#z-abbrechen').addEventListener('click', () => setzeZeichnen(false));
for (const id of ['#z-raster', '#z-kante', '#z-winkel']) $(id).addEventListener('change', () => drei?.setzeZeichenOptionen(zeichenOptionen()));
document.addEventListener('keydown', (ev) => {
  if ($('#zeichnen').getAttribute('aria-pressed') !== 'true' || ev.target.matches('input, select, textarea')) return;
  if (ev.key === 'Enter') { ev.preventDefault(); if (zeichnen2d) fertig2d(); else drei?.fertig(); }
  if (ev.key === 'Escape') setzeZeichnen(false);
  if (ev.key === 'Backspace') { ev.preventDefault(); $('#z-zurueck').click(); }
});

function setzeAnsicht(neu) {
  if ($('#zeichnen').getAttribute('aria-pressed') === 'true') setzeZeichnen(false);
  ansicht = neu;
  z.ansicht = neu;
  speichern();
  $('#feld-3d').hidden = neu !== '3d';
  $('#feld-2d').hidden = neu !== '2d';
  document.querySelectorAll('[data-ansicht]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.ansicht === neu)));
  zeige3D();
}
document.querySelectorAll('[data-ansicht]').forEach((b) => b.addEventListener('click', () => setzeAnsicht(b.dataset.ansicht)));
document.querySelectorAll('[data-kamera]').forEach((b) => b.addEventListener('click', () => drei?.kamera(b.dataset.kamera)));
$('#belichtung').addEventListener('input', (ev) => drei?.setzeOptionen({ belichtungEV: Number(ev.target.value) }));
$('#raumlicht').addEventListener('input', (ev) => drei?.setzeOptionen({ raumlicht: Number(ev.target.value) }));
$('#luxkarte').addEventListener('change', (ev) => drei?.setzeOptionen({ luxKarte: ev.target.checked }));
$('#schatten').addEventListener('change', (ev) => drei?.setzeOptionen({ schatten: ev.target.checked }));

$('#m-breite').value = z.masse.breite;
$('#m-hoehe').value = z.masse.hoehe;
$('#m-tiefe').value = z.masse.tiefe;
$('#soll').value = z.soll ?? '';
baueMoebel();
offen.add(0);
zeichneLeuchten();
zeichnePruefliste();
zeichneLinien();
aktualisiere();
zeichneLeuchten();
setzeAnsicht(ansicht);
