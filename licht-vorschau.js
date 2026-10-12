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

let z = laden() ?? startZustand();
let moebel = null;
let ergebnis = null;
let reiter = 'stueck';
let ansicht = 'ansicht' in (z ?? {}) ? z.ansicht : '3d';
let drei = null;
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
    const name = { ledProfil: 'LED-Profil', spot: 'Spots', punktlicht: 'Punktlicht' }[l.typ] ?? l.typ;
    const info = l.befestigung ? `${l.befestigung.teil} · ${l.befestigung.flaeche}${l.befestigung.anzahl ? ` · ${l.befestigung.anzahl}×` : ''}` : 'frei im Raum';
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
  $(`${p}-kelvin`)?.addEventListener('change', (ev) => {
    const k = Number(ev.target.value);
    if (l.typ === 'ledProfil') (l.streifen ??= {}).kelvin = k; else l.kelvin = k;
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
  let h = `<defs><clipPath id="innen"><rect x="${k.seitenStaerke}" y="0" width="${B - 2 * k.seitenStaerke}" height="${H}"/></clipPath></defs>`;
  h += `<rect x="0" y="0" width="${B}" height="${H}" fill="var(--nacht)"/>`;
  // Lichtkegel
  h += '<g clip-path="url(#innen)" style="mix-blend-mode:screen">';
  ergebnis.leuchten.forEach((l, i) => {
    if (!l.richtung) return;
    const r = { x: l.richtung.x, z: l.richtung.z };
    const len = Math.hypot(r.x, r.z);
    if (len < 0.2) return;
    const rx = r.x / len;
    const rz = r.z / len;
    const a = l.anfang ?? l.position;
    const e = l.ende ?? l.position;
    const d = Math.max(20, reichweite(l.position, { x: rx, z: rz }, k));
    const spreiz = Math.tan(((l.abstrahlwinkel ?? 120) / 2) * Math.PI / 180) * d;
    const qx = -rz; const qz = rx; // quer zur Richtung in der Ansichtsebene
    // Anfang/Ende entlang der Querrichtung sortieren, dann beidseitig um die Spreizung aufweiten
    const [p1, p2] = [[a.x, a.z], [e.x, e.z]].sort((u, v) => (u[0] * qx + u[1] * qz) - (v[0] * qx + v[1] * qz));
    const ziel1 = [p1[0] + rx * d - qx * spreiz, p1[1] + rz * d - qz * spreiz];
    const ziel2 = [p2[0] + rx * d + qx * spreiz, p2[1] + rz * d + qz * spreiz];
    const farbe = rgb(l.kelvin);
    h += `<linearGradient id="g${i}" gradientUnits="userSpaceOnUse" x1="${l.position.x}" y1="${y(l.position.z)}" x2="${l.position.x + rx * d}" y2="${y(l.position.z + rz * d)}">
      <stop offset="0" stop-color="${farbe}" stop-opacity="0.8"/><stop offset="1" stop-color="${farbe}" stop-opacity="0.12"/></linearGradient>`;
    h += `<polygon points="${p1[0]},${y(p1[1])} ${p2[0]},${y(p2[1])} ${ziel2[0]},${y(ziel2[1])} ${ziel1[0]},${y(ziel1[1])}" fill="url(#g${i})"><title>${esc(l.id)}: ${de(l.lumen, 0)} lm, ${l.kelvin} K</title></polygon>`;
  });
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
      h += `<line x1="${l.anfang.x}" y1="${y(l.anfang.z)}" x2="${l.ende.x}" y2="${y(l.ende.z)}" stroke="${farbe}" stroke-width="${fs * 0.35}" stroke-linecap="round"><title>${esc(l.id)}</title></line>`;
    } else {
      h += `<circle cx="${l.position.x}" cy="${y(l.position.z)}" r="${fs * 0.45}" fill="${farbe}" stroke="var(--nacht)" stroke-width="1" vector-effect="non-scaling-stroke"><title>${esc(l.id)}</title></circle>`;
    }
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
    drei.zeige(moebel, ergebnis);
  } catch (err) {
    $('#hinweis-3d').textContent = `3D nicht verfügbar (${err.message}). Die 2D-Ansicht funktioniert weiterhin.`;
  }
}

function setzeAnsicht(neu) {
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
aktualisiere();
setzeAnsicht(ansicht);
