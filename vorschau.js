// Live-Vorschau für das Boden-Modul. Nutzt ausschließlich die öffentliche API aus src/index.js.

import {
  berechne, erstelleVorlage, ausJSON, zuJSON, stuecklisteAlsCSV, bearbeitungenAlsCSV,
  BodenTyp, ERLAUBT, BEZEICHNUNG,
} from './src/index.js';

const $ = (sel) => document.querySelector(sel);
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const zahl = (v) => (typeof v === 'number' ? v.toLocaleString('de-DE', { maximumFractionDigits: 1 }) : v ?? '');

const SPEICHER = 'korpus-bodenplaner-v1';
let eingabe = laden() ?? erstelleVorlage();
let ergebnis = null;
let aktivesTeil = 'mb';
let aktiverReiter = 'pruefung';
const offen = new Set();

function laden() {
  try {
    const roh = localStorage.getItem(SPEICHER);
    return roh ? JSON.parse(roh) : null;
  } catch { return null; }
}
function speichern() {
  try { localStorage.setItem(SPEICHER, JSON.stringify(eingabe)); } catch { /* optional */ }
}

// ── Formular ─────────────────────────────────────────────────────────────────

const KORPUS_FELDER = [
  ['breite', 'Breite'], ['hoehe', 'Höhe'], ['tiefe', 'Tiefe'],
  ['seitenStaerke', 'Seitenstärke'], ['materialStaerke', 'Bodenstärke'], ['kantenStaerke', 'Kante'],
];
const RUECKWAND_FELDER = [['staerke', 'Stärke'], ['abstand', 'Abstand hinten'], ['nuttiefe', 'Nuttiefe']];
const SOCKEL_FELDER = [['hoehe', 'Höhe'], ['ruecksprung', 'Rücksprung']];

function zahlFeld(id, label, wert, platzhalter = '') {
  return `<div class="feld"><label for="${id}">${esc(label)}</label>
    <input id="${id}" inputmode="decimal" value="${wert ?? ''}" placeholder="${esc(platzhalter)}"></div>`;
}
function auswahlFeld(id, label, wert, optionen, breit = false) {
  const opts = optionen.map(([v, t]) => `<option value="${esc(v)}"${v === wert ? ' selected' : ''}>${esc(t)}</option>`).join('');
  return `<div class="feld${breit ? ' breit' : ''}"><label for="${id}">${esc(label)}</label><select id="${id}">${opts}</select></div>`;
}

function leseZahl(input, { erlaubeProzent = false, leerErlaubt = true } = {}) {
  const roh = input.value.trim().replace(',', '.');
  input.classList.remove('ungueltig');
  if (roh === '') return leerErlaubt ? undefined : (input.classList.add('ungueltig'), null);
  if (erlaubeProzent && /^-?\d+(\.\d+)?\s*%$/.test(roh)) return roh.replace(/\s/g, '');
  const n = Number(roh);
  if (!Number.isFinite(n)) { input.classList.add('ungueltig'); return null; }
  return n;
}

function zeichneKorpusFormular() {
  const k = eingabe.korpus;
  k.rueckwand ??= { art: 'eingenutet' };
  k.sockel ??= {};
  $('#korpus-felder').innerHTML = KORPUS_FELDER.map(([f, t]) => zahlFeld(`k-${f}`, t, k[f])).join('');
  $('#rueckwand-felder').innerHTML =
    auswahlFeld('rw-art', 'Art', k.rueckwand.art ?? 'eingenutet', [['eingenutet', 'eingenutet'], ['aufgesetzt', 'aufgesetzt'], ['keine', 'keine']])
    + RUECKWAND_FELDER.map(([f, t]) => zahlFeld(`rw-${f}`, t, k.rueckwand[f], f === 'staerke' ? '8' : f === 'abstand' ? '10' : '8')).join('');
  $('#sockel-felder').innerHTML = SOCKEL_FELDER.map(([f, t]) => zahlFeld(`so-${f}`, t, k.sockel[f], f === 'hoehe' ? '100' : '50')).join('');
}

function bindeKorpusFormular() {
  for (const [f] of KORPUS_FELDER) {
    $(`#k-${f}`).addEventListener('input', (ev) => {
      const v = leseZahl(ev.target, { leerErlaubt: f === 'kantenStaerke' });
      if (v === null) return;
      if (v === undefined) delete eingabe.korpus[f]; else eingabe.korpus[f] = v;
      aktualisiere();
    });
  }
  $('#rw-art').addEventListener('change', (ev) => { eingabe.korpus.rueckwand.art = ev.target.value; aktualisiere(); });
  for (const [f] of RUECKWAND_FELDER) {
    $(`#rw-${f}`).addEventListener('input', (ev) => {
      const v = leseZahl(ev.target);
      if (v === null) return;
      if (v === undefined) delete eingabe.korpus.rueckwand[f]; else eingabe.korpus.rueckwand[f] = v;
      aktualisiere();
    });
  }
  for (const [f] of SOCKEL_FELDER) {
    $(`#so-${f}`).addEventListener('input', (ev) => {
      const v = leseZahl(ev.target);
      if (v === null) return;
      if (v === undefined) delete eingabe.korpus.sockel[f]; else eingabe.korpus.sockel[f] = v;
      aktualisiere();
    });
  }
}

const TYP_OPTIONEN = Object.values(BodenTyp).map((t) => [t, BEZEICHNUNG[t]]);

function bodenFelder(b, i) {
  const erlaubt = ERLAUBT[b.typ] ?? {};
  const einbauarten = Object.keys(erlaubt);
  const einbauart = einbauarten.includes(b.einbauart) ? b.einbauart : einbauarten[0];
  const verbindungen = erlaubt[einbauart] ?? [];
  const p = `b${i}`;
  const posPlatzhalter = { unterboden: 'auto', oberboden: 'auto', mittelboden: '50%', festboden: 'Pflicht', schubladenboden: '5' }[b.typ] ?? '';
  let html = '<div class="felder">';
  html += zahlFeld(`${p}-id`, 'ID', b.id).replace('inputmode="decimal"', '');
  html += auswahlFeld(`${p}-typ`, 'Typ', b.typ, TYP_OPTIONEN);
  html += auswahlFeld(`${p}-einbauart`, 'Einbauart', einbauart, einbauarten.map((e) => [e, BEZEICHNUNG[e]]), true);
  html += auswahlFeld(`${p}-verbindung`, 'Verbindung', b.verbindung, verbindungen.map((v) => [v, BEZEICHNUNG[v]]), true);
  if (b.typ !== BodenTyp.FACHBODEN) {
    html += zahlFeld(`${p}-position`, b.typ === BodenTyp.SCHUBLADENBODEN ? 'Abstand über Abschnitt' : 'Position Z (mm / %)', b.position, posPlatzhalter);
  }
  html += zahlFeld(`${p}-materialstaerke`, 'Stärke', b.materialstaerke, b.typ === BodenTyp.SCHUBLADENBODEN ? '8' : 'Korpus');
  html += zahlFeld(`${p}-vorderkante`, 'Rücksprung vorne', b.vorderkante, '0');
  if (b.typ !== BodenTyp.SCHUBLADENBODEN) {
    html += zahlFeld(`${p}-rueckwandAbstand`, 'Abstand Rückwand', b.rueckwandAbstand, '0');
    html += zahlFeld(`${p}-breite`, 'Breite fest', b.breite, 'auto');
    html += zahlFeld(`${p}-tiefe`, 'Tiefe fest', b.tiefe, 'auto');
  }
  if (einbauart === 'eingenutet') {
    html += zahlFeld(`${p}-nuttiefe`, 'Nuttiefe', b.nuttiefe, '8');
    html += zahlFeld(`${p}-nutbreite`, 'Nutbreite', b.nutbreite, 'Stärke');
  }
  if (b.typ === BodenTyp.FACHBODEN || b.typ === BodenTyp.SCHUBLADENBODEN) {
    html += zahlFeld(`${p}-abschnitt`, 'Abschnitt', b.abschnitt, '0');
  }
  if (b.typ === BodenTyp.FACHBODEN) {
    html += zahlFeld(`${p}-anzahl`, 'Anzahl', b.anzahl, '1');
    html += zahlFeld(`${p}-lochraster`, 'Lochraster', b.lochraster, '32');
  }
  if (b.typ === BodenTyp.SCHUBLADENBODEN) {
    const s = b.schublade ?? {};
    html += zahlFeld(`${p}-s-hoehe`, 'Kastenhöhe', s.hoehe, '120');
    html += zahlFeld(`${p}-s-zargenStaerke`, 'Zargenstärke', s.zargenStaerke, '16');
    html += zahlFeld(`${p}-s-laenge`, 'Kastenlänge', s.laenge, 'auto');
  }
  return `${html}</div>`;
}

const ZAHL_SCHLUESSEL = ['materialstaerke', 'vorderkante', 'rueckwandAbstand', 'breite', 'tiefe', 'nuttiefe', 'nutbreite', 'abschnitt', 'anzahl', 'lochraster'];

function zeichneBodenListe() {
  const markierung = new Map();
  for (const pr of ergebnis?.pruefungen ?? []) {
    const id = pr.teil?.replace(/-\d+$/, '');
    if (!id) continue;
    const alt = markierung.get(id);
    if (alt !== 'fehler') markierung.set(id, pr.schwere);
  }
  $('#boden-liste').innerHTML = eingabe.boeden.map((b, i) => {
    const farbe = b.typ === BodenTyp.FACHBODEN ? 'var(--holz-hell)' : b.typ === BodenTyp.SCHUBLADENBODEN ? 'var(--hdf)' : 'var(--holz)';
    const m = markierung.get(b.id);
    const info = [b.einbauart && BEZEICHNUNG[b.einbauart], b.verbindung && BEZEICHNUNG[b.verbindung], b.anzahl ? `× ${b.anzahl}` : null].filter(Boolean).join(' · ');
    return `<details class="boden" data-index="${i}"${offen.has(i) ? ' open' : ''}>
      <summary><i class="farbe" style="background:${farbe}"></i><span class="boden-titel">${esc(BEZEICHNUNG[b.typ] ?? b.typ)}</span>
      <span class="boden-info">${esc(b.id ?? '')}${info ? ' · ' + esc(info) : ''}</span>
      ${m ? `<span class="boden-markierung" style="color:var(--${m})">${m === 'fehler' ? 'Fehler' : 'Warnung'}</span>` : ''}</summary>
      <div class="boden-inhalt">${bodenFelder(b, i)}<button type="button" class="entfernen" data-entfernen="${i}">Boden entfernen</button></div>
    </details>`;
  }).join('');

  document.querySelectorAll('details.boden').forEach((d) => {
    d.addEventListener('toggle', () => { const i = Number(d.dataset.index); d.open ? offen.add(i) : offen.delete(i); });
  });
  eingabe.boeden.forEach((b, i) => bindeBoden(b, i));
  document.querySelectorAll('[data-entfernen]').forEach((btn) => btn.addEventListener('click', () => {
    eingabe.boeden.splice(Number(btn.dataset.entfernen), 1);
    offen.clear();
    zeichneBodenListe();
    aktualisiere();
  }));
}

function bindeBoden(b, i) {
  const p = `#b${i}`;
  const neuZeichnen = () => { offen.add(i); aktualisiere(); zeichneBodenListe(); };
  $(`${p}-id`).addEventListener('change', (ev) => { b.id = ev.target.value.trim() || undefined; aktualisiere(); zeichneBodenListe(); });
  $(`${p}-typ`).addEventListener('change', (ev) => {
    const typ = ev.target.value;
    for (const k of Object.keys(b)) if (k !== 'id') delete b[k];
    b.typ = typ;
    const [einbauart] = Object.keys(ERLAUBT[typ]);
    b.einbauart = einbauart;
    b.verbindung = ERLAUBT[typ][einbauart][0];
    if (typ === BodenTyp.FESTBODEN) b.position = Math.round((eingabe.korpus.hoehe ?? 2000) / 3);
    neuZeichnen();
  });
  $(`${p}-einbauart`).addEventListener('change', (ev) => {
    b.einbauart = ev.target.value;
    const erlaubt = ERLAUBT[b.typ][b.einbauart];
    if (!erlaubt.includes(b.verbindung)) b.verbindung = erlaubt[0];
    neuZeichnen();
  });
  $(`${p}-verbindung`).addEventListener('change', (ev) => { b.verbindung = ev.target.value; neuZeichnen(); });
  const pos = $(`${p}-position`);
  pos?.addEventListener('input', () => {
    const v = leseZahl(pos, { erlaubeProzent: true });
    if (v === null) return;
    if (v === undefined) delete b.position; else b.position = v;
    aktualisiere();
  });
  for (const k of ZAHL_SCHLUESSEL) {
    const el = $(`${p}-${k}`);
    el?.addEventListener('input', () => {
      const v = leseZahl(el);
      if (v === null) return;
      if (v === undefined) delete b[k]; else b[k] = v;
      aktualisiere();
    });
  }
  for (const k of ['hoehe', 'zargenStaerke', 'laenge']) {
    const el = $(`${p}-s-${k}`);
    el?.addEventListener('input', () => {
      const v = leseZahl(el);
      if (v === null) return;
      b.schublade ??= {};
      if (v === undefined) delete b.schublade[k]; else b.schublade[k] = v;
      aktualisiere();
    });
  }
}

// ── Zeichnungen ──────────────────────────────────────────────────────────────

function fuellung(t) {
  if (t.kategorie === 'rueckwand' || t.kategorie === 'zarge' || t.bodenTyp === 'schubladenboden') return 'var(--hdf)';
  if (t.bodenTyp === 'fachboden') return 'var(--holz-hell)';
  return 'var(--holz)';
}

function rechteck(t, x, y, w, h, extra = '') {
  return `<g class="teil${t.id === aktivesTeil ? ' aktiv' : ''}" data-teil="${esc(t.id)}"><title>${esc(t.bezeichnung)} (${esc(t.id)}) ${zahl(t.laenge)} × ${zahl(t.breite)} × ${zahl(t.staerke)}</title>
    <rect x="${x}" y="${y}" width="${Math.max(w, 0.5)}" height="${Math.max(h, 0.5)}" fill="${fuellung(t)}" stroke="var(--holz-kante)" stroke-width="1" vector-effect="non-scaling-stroke" ${extra}/></g>`;
}

function masslinieH(x1, x2, y, text, fs) {
  return `<g stroke="var(--accent)" vector-effect="non-scaling-stroke">
    <line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke-width="1" vector-effect="non-scaling-stroke"/>
    <line x1="${x1}" y1="${y - fs * 0.5}" x2="${x1}" y2="${y + fs * 0.5}" stroke-width="1" vector-effect="non-scaling-stroke"/>
    <line x1="${x2}" y1="${y - fs * 0.5}" x2="${x2}" y2="${y + fs * 0.5}" stroke-width="1" vector-effect="non-scaling-stroke"/></g>
    <text x="${(x1 + x2) / 2}" y="${y - fs * 0.4}" font-size="${fs}" text-anchor="middle" style="fill:var(--accent)">${text}</text>`;
}
function masslinieV(x, y1, y2, text, fs, seite = 1) {
  const tx = x + seite * fs * 0.5;
  return `<g><line x1="${x}" y1="${y1}" x2="${x}" y2="${y2}" stroke="var(--accent)" stroke-width="1" vector-effect="non-scaling-stroke"/>
    <line x1="${x - fs * 0.5}" y1="${y1}" x2="${x + fs * 0.5}" y2="${y1}" stroke="var(--accent)" stroke-width="1" vector-effect="non-scaling-stroke"/>
    <line x1="${x - fs * 0.5}" y1="${y2}" x2="${x + fs * 0.5}" y2="${y2}" stroke="var(--accent)" stroke-width="1" vector-effect="non-scaling-stroke"/></g>
    <text x="${tx}" y="${(y1 + y2) / 2}" font-size="${fs}" text-anchor="${seite > 0 ? 'start' : 'end'}" dominant-baseline="middle" style="fill:var(--accent)">${text}</text>`;
}

function zeichneVorne() {
  const { korpus: k, teile, faecher } = ergebnis;
  const W = k.breite;
  const H = k.hoehe;
  const fs = Math.max(W, H) / 48;
  const rand = fs * 7;
  const svg = $('#svg-vorne');
  svg.setAttribute('viewBox', `${-rand * 0.9} ${-fs * 1.5} ${W + rand * 2.4} ${H + fs * 5}`);
  const y = (z, h) => H - z - h;
  const reihenfolge = ['rueckwand', 'zarge', 'boden', 'sockelblende', 'seite'];
  let html = '';
  for (const kat of reihenfolge) {
    for (const t of teile.filter((x) => x.kategorie === kat)) {
      const l = t.lage;
      const extra = kat === 'rueckwand' ? 'opacity="0.45" stroke-dasharray="6 4"' : kat === 'zarge' ? 'opacity="0.85"' : '';
      html += rechteck(t, l.x, y(l.z, l.dz), l.dx, l.dz, extra);
    }
  }
  // Fächer: lichte Höhen als Kettenmaß rechts, Beschriftung in der Mitte
  const xKette = W + fs * 1.6;
  for (const f of faecher) {
    if (f.lichteHoehe <= 0) continue;
    html += masslinieV(xKette, y(f.zOben, 0), y(f.zUnten, 0), zahl(f.lichteHoehe), fs * 0.85);
    if (f.lichteHoehe > fs * 2) {
      html += `<text x="${W / 2}" y="${y((f.zUnten + f.zOben) / 2, 0)}" font-size="${fs * 0.8}" text-anchor="middle" dominant-baseline="middle" style="fill:var(--muted)">Fach ${f.index + 1}</text>`;
    }
  }
  html += masslinieV(-fs * 1.4, 0, H, zahl(H), fs, -1);
  html += masslinieH(0, W, H + fs * 2.6, zahl(W), fs);
  svg.innerHTML = html;
  $('#masse-vorne').textContent = `${zahl(W)} × ${zahl(H)} × ${zahl(k.tiefe)} mm`;
}

function zeichneSeite() {
  const { korpus: k, teile } = ergebnis;
  const T = k.tiefe;
  const H = k.hoehe;
  const fs = Math.max(T * 1.6, H) / 48;
  const svg = $('#svg-seite');
  svg.setAttribute('viewBox', `${-fs * 6} ${-fs * 1.5} ${T + fs * 8} ${H + fs * 5}`);
  const y = (z, h) => H - z - h;
  let html = '';
  const seite = teile.find((t) => t.id === 'seite-links');
  // Seite als Hintergrund, darauf Böden im Schnitt
  html += `<g class="teil${aktivesTeil === seite.id ? ' aktiv' : ''}" data-teil="seite-links"><title>Seite links – Innenfläche</title>
    <rect x="0" y="${y(seite.lage.z, seite.lage.dz)}" width="${seite.lage.dy}" height="${seite.lage.dz}" fill="var(--surface)" stroke="var(--holz-kante)" stroke-width="1.5" vector-effect="non-scaling-stroke"/></g>`;
  for (const t of teile) {
    if (t.kategorie === 'seite') continue;
    const l = t.lage;
    if (t.kategorie === 'zarge' && !t.id.endsWith('-links') && !t.id.endsWith('-vorne') && !t.id.endsWith('-hinten')) continue;
    const extra = t.kategorie === 'zarge' ? 'opacity="0.55"' : '';
    html += rechteck(t, l.y, y(l.z, l.dz), l.dy, l.dz, extra);
  }
  // Bearbeitungen der linken Seite (Innenfläche): Bohrungen und Nuten
  for (const b of seite.bearbeitungen) {
    if (b.art === 'nut' || b.art === 'falz') {
      const z1 = k.seitenZ0 + b.von.x;
      const z2 = k.seitenZ0 + b.bis.x;
      html += `<line x1="${b.von.y}" y1="${y(z1, 0)}" x2="${b.bis.y}" y2="${y(z2, 0)}" stroke="var(--accent)" stroke-width="${b.breite}" stroke-opacity="0.45"><title>${b.art} ${zahl(b.breite)} × ${zahl(b.tiefe)} (${esc(b.quelle)})</title></line>`;
    } else if (b.art === 'bohrung' || b.art === 'schlitz' || b.art === 'tasche') {
      if (!['innen', 'aussen'].includes(b.flaeche)) continue;
      const cx = b.y;
      const cy = y(k.seitenZ0 + b.x, 0);
      const rad = Math.max((b.durchmesser ?? b.breite ?? 5) / 2, fs * 0.16);
      const gestrichelt = b.flaeche === 'aussen' ? 'fill="none" stroke-dasharray="2 2"' : 'fill="var(--bohrung)"';
      html += b.art === 'bohrung'
        ? `<circle cx="${cx}" cy="${cy}" r="${rad}" stroke="var(--bohrung)" stroke-width="1" vector-effect="non-scaling-stroke" ${gestrichelt}><title>Ø${zahl(b.durchmesser)} × ${zahl(b.tiefe)} · ${esc(b.verbindung)} (${esc(b.quelle)})</title></circle>`
        : `<rect x="${cx - b.laenge / 2}" y="${cy - b.breite / 2}" width="${b.laenge}" height="${Math.max(b.breite, fs * 0.25)}" fill="var(--bohrung)" opacity="0.8"><title>${b.art} ${zahl(b.laenge)} × ${zahl(b.breite)} (${esc(b.quelle)})</title></rect>`;
    }
  }
  html += masslinieH(0, T, H + fs * 2.6, zahl(T), fs);
  html += masslinieV(-fs * 1.4, 0, H, zahl(H), fs, -1);
  html += `<text x="${fs * 0.4}" y="${-fs * 0.4}" font-size="${fs * 0.8}" style="fill:var(--muted)">vorne</text>`;
  html += `<text x="${T - fs * 0.4}" y="${-fs * 0.4}" font-size="${fs * 0.8}" text-anchor="end" style="fill:var(--muted)">hinten</text>`;
  svg.innerHTML = html;
  const bohrungen = seite.bearbeitungen.filter((b) => b.art === 'bohrung').length;
  $('#masse-seite').textContent = `${bohrungen} Bohrungen · lichte Tiefe ${zahl(k.lichteTiefe)}`;
}

const FLAECHEN = new Set(['oben', 'unten', 'innen', 'aussen']);
const OBERE_FLAECHE = new Set(['oben', 'innen']);

function zeichneTeil() {
  const t = ergebnis.teile.find((x) => x.id === aktivesTeil) ?? ergebnis.teile[0];
  aktivesTeil = t.id;
  const auswahl = $('#teil-wahl');
  auswahl.innerHTML = ergebnis.teile.map((x) => `<option value="${esc(x.id)}"${x.id === t.id ? ' selected' : ''}>${esc(x.bezeichnung)} · ${esc(x.id)} · ${zahl(x.laenge)} × ${zahl(x.breite)}</option>`).join('');
  const L = t.laenge;
  const B = t.breite;
  const fs = Math.max(L, B * 1.6) / 70;
  const svg = $('#svg-teil');
  svg.setAttribute('viewBox', `${-fs * 4} ${-fs * 2.5} ${L + fs * 8} ${B + fs * 6.5}`);
  const yy = (y) => B - y;
  let html = `<rect x="0" y="0" width="${L}" height="${B}" fill="${fuellung(t)}" fill-opacity="0.55" stroke="var(--holz-kante)" stroke-width="1.5" vector-effect="non-scaling-stroke"/>`;
  for (const b of t.bearbeitungen) {
    const titel = `<title>${esc(b.art)} · ${esc(b.flaeche)} · ${esc(b.verbindung ?? '')} (${esc(b.quelle ?? '')})</title>`;
    if (b.art === 'nut' || b.art === 'falz') {
      html += `<line x1="${b.von.x}" y1="${yy(b.von.y)}" x2="${b.bis.x}" y2="${yy(b.bis.y)}" stroke="var(--accent)" stroke-width="${b.breite}" stroke-opacity="${OBERE_FLAECHE.has(b.flaeche) ? 0.55 : 0.3}">${titel}</line>`;
    } else if (b.art === 'feder') {
      const w = b.laenge;
      const r = { links: [0, 0, w, B], rechts: [L - w, 0, w, B], vorne: [0, B - w, L, w], hinten: [0, 0, L, w] }[b.flaeche];
      if (r) html += `<rect x="${r[0]}" y="${r[1]}" width="${r[2]}" height="${r[3]}" fill="var(--accent)" opacity="0.35">${titel}</rect>`;
    } else if (b.art === 'gehrung') {
      const x = b.flaeche === 'links' || b.flaeche === 'unten' ? 0 : L;
      html += `<line x1="${x}" y1="0" x2="${x}" y2="${B}" stroke="var(--fehler)" stroke-width="3" stroke-dasharray="6 3" vector-effect="non-scaling-stroke">${titel}</line>
        <text x="${x === 0 ? fs * 0.4 : L - fs * 0.4}" y="${-fs * 0.6}" font-size="${fs * 0.8}" text-anchor="${x === 0 ? 'start' : 'end'}" style="fill:var(--fehler)">45°</text>`;
    } else if ('x' in b) {
      const cx = b.x;
      const cy = yy(b.y);
      if (FLAECHEN.has(b.flaeche)) {
        if (b.art === 'bohrung') {
          const stil = OBERE_FLAECHE.has(b.flaeche) ? 'fill="var(--bohrung)" fill-opacity="0.85"' : 'fill="none" stroke-dasharray="2 2"';
          html += `<circle cx="${cx}" cy="${cy}" r="${Math.max(b.durchmesser / 2, fs * 0.12)}" stroke="var(--bohrung)" stroke-width="1" vector-effect="non-scaling-stroke" ${stil}>${titel}</circle>`;
        } else {
          const [w, h] = b.achse === 'x' ? [b.laenge, b.breite] : [b.breite, b.laenge];
          html += `<rect x="${cx - w / 2}" y="${cy - h / 2}" width="${w}" height="${h}" fill="var(--bohrung)" opacity="0.75">${titel}</rect>`;
        }
      } else {
        // Stirnbearbeitung: Pfeil von der Kante ins Material, Länge = Tiefe
        const tiefe = b.tiefe ?? b.laenge ?? fs;
        const dir = { '+x': [1, 0], '-x': [-1, 0], '+y': [0, -1], '-y': [0, 1] }[b.richtung] ?? (b.x === 0 ? [1, 0] : [-1, 0]);
        const breite = b.durchmesser ?? b.breite ?? fs * 0.3;
        if (b.art === 'zapfen') {
          html += `<rect x="${cx}" y="${cy - b.breite / 2}" width="${b.laenge}" height="${b.breite}" fill="var(--bohrung)" opacity="0.6">${titel}</rect>`;
        } else {
          html += `<line x1="${cx}" y1="${cy}" x2="${cx + dir[0] * tiefe}" y2="${cy + dir[1] * tiefe}" stroke="var(--bohrung)" stroke-width="${breite}" stroke-opacity="0.7">${titel}</line>`;
        }
      }
    }
  }
  html += masslinieH(0, L, B + fs * 2.6, `x · Länge ${zahl(L)}`, fs);
  html += masslinieV(-fs * 1.4, 0, B, `y ${zahl(B)}`, fs, -1);
  svg.innerHTML = html;
  $('#masse-teil').textContent = `${zahl(L)} × ${zahl(B)} × ${zahl(t.staerke)} mm · ${t.bearbeitungen.length} Bearbeitungen`;
}

// ── Reiter ───────────────────────────────────────────────────────────────────

function tabelle(kopf, zeilen, zahlenSpalten = []) {
  const th = kopf.map((k, i) => `<th${zahlenSpalten.includes(i) ? ' class="zahl"' : ''}>${esc(k)}</th>`).join('');
  const tr = zeilen.map((z) => `<tr>${z.map((c, i) => `<td${zahlenSpalten.includes(i) ? ' class="zahl"' : ''}>${c}</td>`).join('')}</tr>`).join('');
  return `<div class="tabelle"><table><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table></div>`;
}

function kopierKnopf(id, text) {
  return `<button type="button" id="${id}">${esc(text)}</button>`;
}

async function kopiere(text, knopf, ersatz) {
  try {
    await navigator.clipboard.writeText(text);
    knopf.textContent = 'Kopiert';
  } catch {
    ersatz?.focus();
    ersatz?.select?.();
    knopf.textContent = 'Text markiert – mit Strg+C kopieren';
  }
}

function zeichneReiter() {
  document.querySelectorAll('#reiter-leiste button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.reiter === aktiverReiter)));
  const ziel = $('#reiter-inhalt');
  const e = ergebnis;
  if (aktiverReiter === 'pruefung') {
    ziel.innerHTML = e.pruefungen.length
      ? e.pruefungen.map((p) => `<div class="meldung ${p.schwere}"><strong style="color:var(--${p.schwere})">${p.schwere === 'fehler' ? 'Fehler' : 'Warnung'}</strong><code>${esc(p.code)}${p.teil ? ' · ' + esc(p.teil) : ''}</code><span>${esc(p.meldung)}</span></div>`).join('')
      : '<p class="leer">Keine Kollisionen oder Warnungen. Alle Böden passen zu Seiten, Rückwand und Raster.</p>';
  } else if (aktiverReiter === 'stueck') {
    ziel.innerHTML = `<div class="zeile">${kopierKnopf('kopiere-stueck', 'Stückliste als CSV kopieren')}</div>`
      + tabelle(['Pos', 'Bezeichnung', 'Anz.', 'Länge', 'Breite', 'Stärke', 'Zuschnitt L × B', 'Material', 'Kante', 'Teile'],
        e.stueckliste.map((z) => [z.pos, esc(z.bezeichnung), z.anzahl, zahl(z.laenge), zahl(z.breite), zahl(z.staerke),
          `${zahl(z.zuschnittLaenge)} × ${zahl(z.zuschnittBreite)}`, esc(z.material), esc(z.kanten.join(', ')), `<span class="mono">${esc(z.teile.join(', '))}</span>`]),
        [0, 2, 3, 4, 5, 6]);
    $('#kopiere-stueck').addEventListener('click', (ev) => kopiere(stuecklisteAlsCSV(e), ev.target));
  } else if (aktiverReiter === 'faecher') {
    ziel.innerHTML = tabelle(['Fach', 'Abschnitt', 'Z unten', 'Z oben', 'Lichte Höhe', 'Lichte Breite', 'Lichte Tiefe'],
      e.faecher.map((f) => [f.index + 1, f.abschnitt, zahl(f.zUnten), zahl(f.zOben), zahl(f.lichteHoehe), zahl(f.lichteBreite), zahl(f.lichteTiefe)]),
      [0, 1, 2, 3, 4, 5, 6])
      + `<p class="hinweis">Abschnitte (zwischen festen Böden): ${e.abschnitte.map((a) => `${a.index}: ${a.untenTeil ?? '–'} → ${a.obenTeil ?? '–'} (${zahl(a.lichteHoehe)} mm)`).join(' · ')}</p>`;
  } else if (aktiverReiter === 'cnc') {
    const nurAktiv = $('#nur-aktiv')?.checked ?? true;
    const liste = nurAktiv ? e.bearbeitungen.filter((b) => b.teil === aktivesTeil) : e.bearbeitungen;
    ziel.innerHTML = `<div class="zeile"><label class="hinweis"><input type="checkbox" id="nur-aktiv" style="width:auto"${nurAktiv ? ' checked' : ''}> nur gewähltes Teil (${esc(aktivesTeil)})</label>
      ${kopierKnopf('kopiere-cnc', 'Alle Bearbeitungen als CSV kopieren')}</div>`
      + tabelle(['Teil', 'Art', 'Fläche', 'x', 'y', 'z', 'Richtung', 'Ø', 'Tiefe', 'Breite', 'Länge', 'Verbindung', 'Quelle'],
        liste.slice(0, 400).map((b) => {
          const p = b.von ?? b;
          return [`<span class="mono">${esc(b.teil)}</span>`, esc(b.art), esc(b.flaeche), zahl(p.x), zahl(p.y), zahl(p.z), esc(b.richtung ?? ''),
            zahl(b.durchmesser), zahl(b.tiefe), zahl(b.breite ?? b.dicke), zahl(b.laenge ?? (b.bis ? `→ ${zahl(b.bis.x)}/${zahl(b.bis.y)}` : '')), esc(b.verbindung ?? ''), esc(b.quelle ?? '')];
        }), [3, 4, 5, 7, 8, 9])
      + (liste.length > 400 ? `<p class="hinweis">${liste.length - 400} weitere Zeilen im CSV-Export.</p>` : '');
    $('#nur-aktiv').addEventListener('change', zeichneReiter);
    $('#kopiere-cnc').addEventListener('click', (ev) => kopiere(bearbeitungenAlsCSV(e), ev.target));
  } else if (aktiverReiter === 'json') {
    ziel.innerHTML = `<p class="hinweis">Eingabe (Datenmodell) bearbeiten und übernehmen, oder das vollständige Ergebnis kopieren.</p>
      <textarea id="json-eingabe" spellcheck="false" aria-label="Eingabe als JSON">${esc(JSON.stringify(eingabe, null, 2))}</textarea>
      <div class="zeile"><button type="button" class="primaer" id="json-uebernehmen">JSON übernehmen</button>
      ${kopierKnopf('kopiere-ergebnis', 'Ergebnis-JSON kopieren')} <span class="rueckmeldung" id="json-meldung"></span></div>
      <pre id="json-ergebnis">${esc(zuJSON(e).slice(0, 60000))}${zuJSON(e).length > 60000 ? '\n…' : ''}</pre>`;
    $('#json-uebernehmen').addEventListener('click', () => {
      const meldung = $('#json-meldung');
      try {
        const text = $('#json-eingabe').value;
        ausJSON(text);
        eingabe = JSON.parse(text);
        offen.clear();
        zeichneKorpusFormular(); bindeKorpusFormular();
        aktualisiere(); zeichneBodenListe();
        meldung.className = 'rueckmeldung';
        meldung.textContent = 'Übernommen';
      } catch (err) {
        meldung.className = 'rueckmeldung fehlertext';
        meldung.textContent = err.message;
      }
    });
    $('#kopiere-ergebnis').addEventListener('click', (ev) => kopiere(zuJSON(e), ev.target, $('#json-eingabe')));
  }
}

// ── Ablauf ───────────────────────────────────────────────────────────────────

function zeichneStatus(fehler) {
  const st = $('#status');
  if (fehler) { st.innerHTML = `<span class="pill fehler">Eingabe: ${esc(fehler)}</span>`; return; }
  const f = ergebnis.pruefungen.filter((p) => p.schwere === 'fehler').length;
  const w = ergebnis.pruefungen.length - f;
  st.innerHTML = (f ? `<span class="pill fehler">${f} Fehler</span>` : '<span class="pill ok">gültig</span>')
    + (w ? `<span class="pill warnung">${w} Warnung${w > 1 ? 'en' : ''}</span>` : '')
    + `<span class="pill neutral">${ergebnis.teile.length} Teile · ${ergebnis.faecher.length} Fächer · ${ergebnis.bearbeitungen.length} Bearbeitungen</span>`;
}

function aktualisiere() {
  try {
    ergebnis = berechne(eingabe);
  } catch (err) {
    zeichneStatus(err.message);
    return;
  }
  speichern();
  zeichneStatus();
  zeichneVorne();
  zeichneSeite();
  zeichneTeil();
  zeichneReiter();
  // Markierungen in den Bodenkarten nachziehen, ohne Fokus zu verlieren
  document.querySelectorAll('details.boden').forEach((d) => {
    const b = eingabe.boeden[Number(d.dataset.index)];
    const m = ergebnis.pruefungen.filter((p) => p.teil && (p.teil === b?.id || p.teil.startsWith(`${b?.id}-`)));
    const schwere = m.some((p) => p.schwere === 'fehler') ? 'fehler' : m.length ? 'warnung' : null;
    let marke = d.querySelector('.boden-markierung');
    if (!schwere) { marke?.remove(); return; }
    if (!marke) { marke = document.createElement('span'); marke.className = 'boden-markierung'; d.querySelector('summary').append(marke); }
    marke.style.color = `var(--${schwere})`;
    marke.textContent = schwere === 'fehler' ? 'Fehler' : 'Warnung';
  });
}

function waehleTeil(id) {
  aktivesTeil = id;
  zeichneVorne();
  zeichneSeite();
  zeichneTeil();
  if (aktiverReiter === 'cnc') zeichneReiter();
}

for (const id of ['#svg-vorne', '#svg-seite']) {
  $(id).addEventListener('click', (ev) => {
    const g = ev.target.closest('[data-teil]');
    if (g) waehleTeil(g.dataset.teil);
  });
}
$('#teil-wahl').addEventListener('change', (ev) => waehleTeil(ev.target.value));
$('#reiter-leiste').addEventListener('click', (ev) => {
  const b = ev.target.closest('button[data-reiter]');
  if (!b) return;
  aktiverReiter = b.dataset.reiter;
  zeichneReiter();
});
$('#neu-typ').innerHTML = TYP_OPTIONEN.map(([v, t]) => `<option value="${v}">${esc(t)}</option>`).join('');
$('#neu-typ').value = 'fachboden';
$('#neu-boden').addEventListener('click', () => {
  const typ = $('#neu-typ').value;
  const vorhandene = new Set(eingabe.boeden.map((b) => b.id));
  let n = 1;
  while (vorhandene.has(`${typ}-${n}`)) n++;
  const neu = { id: `${typ}-${n}`, typ };
  if (typ === BodenTyp.FESTBODEN) neu.position = Math.round((eingabe.korpus.hoehe ?? 2000) / 3);
  if (typ === BodenTyp.FACHBODEN) {
    const belegt = new Set(eingabe.boeden.filter((b) => b.typ === typ).map((b) => b.abschnitt ?? 0));
    neu.abschnitt = (ergebnis?.abschnitte ?? []).map((a) => a.index).find((i) => !belegt.has(i)) ?? 0;
  }
  eingabe.boeden.push(neu);
  offen.add(eingabe.boeden.length - 1);
  aktualisiere();
  zeichneBodenListe();
});
$('#vorlage').addEventListener('click', () => {
  eingabe = erstelleVorlage(); offen.clear(); aktivesTeil = 'mb';
  zeichneKorpusFormular(); bindeKorpusFormular(); aktualisiere(); zeichneBodenListe();
});
$('#leer').addEventListener('click', () => {
  eingabe = { korpus: eingabe.korpus, boeden: [{ id: 'ub', typ: 'unterboden' }, { id: 'ob', typ: 'oberboden' }] };
  offen.clear(); aktivesTeil = 'ub';
  aktualisiere(); zeichneBodenListe();
});

zeichneKorpusFormular();
bindeKorpusFormular();
aktualisiere();
offen.add(eingabe.boeden.findIndex((b) => b.id === 'mb'));
zeichneBodenListe();
