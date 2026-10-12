// Live-Vorschau für das Bodenbelag-Modul (Parkett und Fliesen). Nutzt nur die öffentliche API.

import {
  berechneBelag, parkettVorlage, fliesenVorlage, PARKETTARTEN, MUSTER, VERLEGEARTEN, HOLZARTEN, SORTIERUNGEN,
  FLIESENARTEN, FLIESEN_MUSTER, RAUMTYPEN, RUTSCHHEMMUNG, ABRIEBKLASSEN, FLIESEN_OPTIKEN, FUGENFARBEN, zahnungFuer,
} from './src/index.js';

const $ = (s) => document.querySelector(s);
const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const de = (v, stellen = 2) => (typeof v === 'number' ? v.toLocaleString('de-DE', { maximumFractionDigits: stellen }) : v ?? '');
const SPEICHER = 'bodenbelag-planer-v1';

// Zustand: gemeinsamer Raum, je Belag eigene Einstellungen
function startZustand() {
  const p = parkettVorlage();
  const f = fliesenVorlage();
  return { belag: 'parkett', raum: p.raum, parkett: { parkett: p.parkett, verlegung: p.verlegung }, fliesen: { raumtyp: f.raum.raumtyp, fliese: f.fliese, verlegung: f.verlegung } };
}
let z = laden() ?? startZustand();
let ergebnis = null;
let reiter = 'material';

function laden() {
  try { const t = localStorage.getItem(SPEICHER); const o = t ? JSON.parse(t) : null; return o?.raum && o?.fliesen ? o : null; } catch { return null; }
}
function speichern() {
  try { localStorage.setItem(SPEICHER, JSON.stringify(z)); } catch { /* optional */ }
}
const istFliesen = () => z.belag === 'fliesen';

function eingabe() {
  if (istFliesen()) return { belag: 'fliesen', raum: { ...z.raum, raumtyp: z.fliesen.raumtyp }, fliese: z.fliesen.fliese, verlegung: z.fliesen.verlegung };
  return { belag: 'parkett', raum: z.raum, parkett: z.parkett.parkett, verlegung: z.parkett.verlegung };
}
const verlegung = () => (istFliesen() ? z.fliesen.verlegung : z.parkett.verlegung);

function leseZahl(el, leerErlaubt = false) {
  const roh = el.value.trim().replace(',', '.');
  el.classList.remove('ungueltig');
  if (roh === '' && leerErlaubt) return undefined;
  const n = Number(roh);
  if (roh === '' || !Number.isFinite(n)) { el.classList.add('ungueltig'); return null; }
  return n;
}
function binde(id, setzen, leerErlaubt = false) {
  $(id).addEventListener('input', (ev) => {
    const v = leseZahl(ev.target, leerErlaubt);
    if (v === null) return;
    setzen(v);
    aktualisiere();
  });
}
const optionen = (eintraege, wert) => eintraege.map(([v, t]) => `<option value="${esc(v)}"${v === wert ? ' selected' : ''}>${esc(t)}</option>`).join('');
const farbKnoepfe = (katalog, wert, attr) => Object.entries(katalog).map(([id, h]) => `<button type="button" data-${attr}="${id}" aria-pressed="${id === wert}" style="background:${h.farbe}" title="${esc(h.name)}"><span>${esc(h.name)}</span></button>`).join('');

// ── Formular ─────────────────────────────────────────────────────────────────

function fuelleFormular() {
  document.querySelectorAll('.nur-parkett').forEach((el) => { el.hidden = istFliesen(); });
  document.querySelectorAll('.nur-fliesen').forEach((el) => { el.hidden = !istFliesen(); });
  document.querySelectorAll('[data-belag]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.belag === z.belag)));
  $('#r-laenge').value = z.raum.laenge;
  $('#r-breite').value = z.raum.breite;
  const v = verlegung();
  if (istFliesen()) fuelleFliesen(); else fuelleParkett();
  document.querySelectorAll('#v-drehung button').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.wert) === (v.drehung ?? 0))));
  $('#v-start').value = v.startwert ?? 1;
  $('#mischen').hidden = v.muster !== 'wild';
  $('#tab-arten').textContent = istFliesen() ? 'Fliesenarten' : 'Parkettarten';
  zeichneListen();
}

function fuelleParkett() {
  const { parkett: p, verlegung: v } = z.parkett;
  const art = PARKETTARTEN[p.art];
  $('#p-art').innerHTML = optionen(Object.entries(PARKETTARTEN).map(([id, a]) => [id, a.name]), p.art);
  $('#p-beschreibung').textContent = art ? `${art.aufbau} · ${art.norm} · ${art.beschreibung}` : '';
  $('#p-laenge').value = p.laenge ?? art?.masse.laenge ?? '';
  $('#p-breite').value = p.breite ?? art?.masse.breite ?? '';
  $('#p-staerke').value = p.staerke ?? art?.masse.staerke ?? '';
  $('#p-paket').value = p.paketInhalt ?? art?.paketInhalt ?? '';
  $('#p-preis').value = p.preisProM2 ?? '';
  $('#holzarten').innerHTML = farbKnoepfe(HOLZARTEN, p.holzart ?? 'eiche', 'holz');
  $('#p-sortierung').innerHTML = optionen(Object.entries(SORTIERUNGEN).map(([id, s]) => [id, s.name]), p.sortierung ?? 'natur');
  $('#v-muster').innerHTML = optionen((art?.muster ?? Object.keys(MUSTER)).map((m) => [m, MUSTER[m].name]), v.muster);
  $('#v-beschreibung').textContent = MUSTER[v.muster] ? `${MUSTER[v.muster].kurz} · Verschnitt-Richtwert ${MUSTER[v.muster].verschnitt} %` : '';
  $('#v-art').innerHTML = optionen((art?.verlegung ?? Object.keys(VERLEGEARTEN)).map((a) => [a, VERLEGEARTEN[a].name]), v.art);
  $('#v-rand').value = v.randabstand ?? '';
}

function fuelleFliesen() {
  const { fliese: f, verlegung: v, raumtyp } = z.fliesen;
  const art = FLIESENARTEN[f.art];
  $('#r-raumtyp').innerHTML = optionen(Object.entries(RAUMTYPEN).map(([id, r]) => [id, `${r.name} (empf. ${r.rutsch}${r.pei ? `, PEI ${r.pei}` : ''})`]), raumtyp);
  $('#f-art').innerHTML = optionen(Object.entries(FLIESENARTEN).map(([id, a]) => [id, a.name]), f.art);
  $('#f-beschreibung').textContent = art?.beschreibung ?? '';
  const frost = art?.frostsicher === true ? 'frostsicher' : art?.frostsicher === false ? 'nicht frostsicher' : 'Frost: produktabhängig';
  $('#f-kennwerte').innerHTML = art ? [art.gruppe, frost, `Fuge ab ${de(art.fuge[0])} mm`, art.impraegnieren ? 'imprägnieren' : null]
    .filter(Boolean).map((t) => `<span>${esc(t)}</span>`).join('') : '';
  const formatWert = `${f.laenge}x${f.breite}`;
  const formate = (art?.formate ?? []).map(([l, b]) => [`${l}x${b}`, `${l / 10} × ${b / 10} cm`]);
  if (!formate.some(([w]) => w === formatWert)) formate.push([formatWert, `eigenes Format ${f.laenge / 10} × ${f.breite / 10} cm`]);
  $('#f-format').innerHTML = optionen(formate, formatWert);
  $('#f-laenge').value = f.laenge;
  $('#f-breite').value = f.breite;
  $('#f-staerke').value = f.staerke ?? art?.staerke ?? '';
  $('#optiken').innerHTML = farbKnoepfe(FLIESEN_OPTIKEN, f.optik ?? art?.optik, 'optik');
  $('#f-rutsch').innerHTML = optionen(RUTSCHHEMMUNG.map((r) => [r, r]), f.rutschhemmung ?? RAUMTYPEN[raumtyp]?.rutsch);
  $('#f-pei').innerHTML = optionen([['', 'unglasiert / k. A.'], ...ABRIEBKLASSEN.map((p) => [p, `PEI ${p}`])], f.abriebklasse ?? '');
  $('#f-karton').value = f.stueckProKarton ?? Math.max(1, Math.round(1.44e6 / (f.laenge * f.breite)));
  $('#f-preis').value = f.preisProM2 ?? '';
  $('#v-muster').innerHTML = optionen((art?.muster ?? Object.keys(FLIESEN_MUSTER)).map((m) => [m, FLIESEN_MUSTER[m].name]), v.muster);
  $('#v-beschreibung').textContent = FLIESEN_MUSTER[v.muster] ? `${FLIESEN_MUSTER[v.muster].kurz} · Verschnitt-Richtwert ${FLIESEN_MUSTER[v.muster].verschnitt} %` : '';
  $('#v-fuge').value = v.fugenbreite ?? art?.fuge[1] ?? 3;
  $('#v-fugenfarbe').innerHTML = optionen(Object.entries(FUGENFARBEN).map(([id, x]) => [id, x.name]), v.fugenfarbe ?? 'grau');
  $('#v-randfuge').value = v.randfuge ?? 5;
  $('#v-zahnung').value = v.zahnung ?? '';
  $('#v-zahnung').placeholder = `auto (${zahnungFuer(f.laenge, f.breite)})`;
}

function zeichneListen() {
  const { raum } = z;
  raum.tueren ??= [];
  raum.aussparungen ??= [];
  const wandOpt = (w) => optionen(['unten', 'oben', 'links', 'rechts'].map((x) => [x, x]), w);
  $('#tueren').innerHTML = raum.tueren.map((t, i) => `<div class="eintrag">
      <div class="feld"><label for="t${i}-breite">Breite</label><input id="t${i}-breite" inputmode="decimal" value="${t.breite ?? 900}"></div>
      <div class="feld"><label for="t${i}-wand">Wand</label><select id="t${i}-wand">${wandOpt(t.wand ?? 'unten')}</select></div>
      <div class="feld"><label for="t${i}-position">ab Ecke</label><input id="t${i}-position" inputmode="decimal" value="${t.position ?? 300}"></div>
      <button type="button" class="weg" data-tuer-weg="${i}" aria-label="Tür ${i + 1} entfernen">✕</button></div>`).join('');
  $('#aussparungen').innerHTML = raum.aussparungen.map((a, i) => `<div class="eintrag">
      <div class="feld name"><label for="a${i}-name">Name</label><input id="a${i}-name" value="${esc(a.name ?? '')}" style="font-family:var(--font-body)"></div>
      <button type="button" class="weg" data-aus-weg="${i}" aria-label="Aussparung ${i + 1} entfernen">✕</button>
      ${['x', 'y', 'laenge', 'breite'].map((k) => `<div class="feld"><label for="a${i}-${k}">${{ x: 'x', y: 'y', laenge: 'Länge', breite: 'Breite' }[k]}</label><input id="a${i}-${k}" inputmode="decimal" value="${a[k] ?? ''}"></div>`).join('')}</div>`).join('');
  raum.tueren.forEach((t, i) => {
    binde(`#t${i}-breite`, (v) => { t.breite = v; });
    binde(`#t${i}-position`, (v) => { t.position = v; });
    $(`#t${i}-wand`).addEventListener('change', (ev) => { t.wand = ev.target.value; aktualisiere(); });
  });
  raum.aussparungen.forEach((a, i) => {
    for (const k of ['x', 'y', 'laenge', 'breite']) binde(`#a${i}-${k}`, (v) => { a[k] = v; });
    $(`#a${i}-name`).addEventListener('input', (ev) => { a.name = ev.target.value; aktualisiere(); });
  });
  document.querySelectorAll('[data-tuer-weg]').forEach((b) => b.addEventListener('click', () => { raum.tueren.splice(Number(b.dataset.tuerWeg), 1); zeichneListen(); aktualisiere(); }));
  document.querySelectorAll('[data-aus-weg]').forEach((b) => b.addEventListener('click', () => { raum.aussparungen.splice(Number(b.dataset.ausWeg), 1); zeichneListen(); aktualisiere(); }));
}

// Raum
binde('#r-laenge', (v) => { z.raum.laenge = v; });
binde('#r-breite', (v) => { z.raum.breite = v; });
$('#r-raumtyp').addEventListener('change', (ev) => {
  z.fliesen.raumtyp = ev.target.value;
  z.fliesen.fliese.rutschhemmung = RAUMTYPEN[ev.target.value].rutsch;
  fuelleFormular(); aktualisiere();
});
// Parkett
binde('#p-laenge', (v) => { z.parkett.parkett.laenge = v; });
binde('#p-breite', (v) => { z.parkett.parkett.breite = v; });
binde('#p-staerke', (v) => { z.parkett.parkett.staerke = v; });
binde('#p-paket', (v) => { z.parkett.parkett.paketInhalt = v; });
binde('#p-preis', (v) => { if (v === undefined) delete z.parkett.parkett.preisProM2; else z.parkett.parkett.preisProM2 = v; }, true);
binde('#v-rand', (v) => { if (v === undefined) delete z.parkett.verlegung.randabstand; else z.parkett.verlegung.randabstand = v; }, true);
$('#p-art').addEventListener('change', (ev) => {
  const art = PARKETTARTEN[ev.target.value];
  const pv = z.parkett;
  pv.parkett = { ...pv.parkett, art: ev.target.value, ...art.masse, paketInhalt: art.paketInhalt };
  if (!art.muster.includes(pv.verlegung.muster)) pv.verlegung.muster = art.muster[0];
  if (!art.verlegung.includes(pv.verlegung.art)) pv.verlegung.art = art.verlegung[0];
  delete pv.verlegung.randabstand;
  fuelleFormular(); aktualisiere();
});
$('#holzarten').addEventListener('click', (ev) => {
  const b = ev.target.closest('[data-holz]');
  if (!b) return;
  z.parkett.parkett.holzart = b.dataset.holz;
  document.querySelectorAll('[data-holz]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  aktualisiere();
});
$('#p-sortierung').addEventListener('change', (ev) => { z.parkett.parkett.sortierung = ev.target.value; aktualisiere(); });
$('#v-art').addEventListener('change', (ev) => { z.parkett.verlegung.art = ev.target.value; delete z.parkett.verlegung.randabstand; fuelleFormular(); aktualisiere(); });
// Fliesen
$('#f-art').addEventListener('change', (ev) => {
  const art = FLIESENARTEN[ev.target.value];
  const fz = z.fliesen;
  const [laenge, breite] = art.formate[0];
  fz.fliese = { ...fz.fliese, art: ev.target.value, laenge, breite, staerke: art.staerke, optik: art.optik, abriebklasse: art.pei ?? undefined };
  delete fz.fliese.stueckProKarton;
  if (!art.muster.includes(fz.verlegung.muster)) fz.verlegung.muster = art.muster[0];
  fz.verlegung.fugenbreite = art.fuge[1];
  delete fz.verlegung.zahnung;
  fuelleFormular(); aktualisiere();
});
$('#f-format').addEventListener('change', (ev) => {
  const [l, b] = ev.target.value.split('x').map(Number);
  Object.assign(z.fliesen.fliese, { laenge: l, breite: b });
  delete z.fliesen.fliese.stueckProKarton;
  delete z.fliesen.verlegung.zahnung;
  fuelleFormular(); aktualisiere();
});
binde('#f-laenge', (v) => { z.fliesen.fliese.laenge = v; delete z.fliesen.fliese.stueckProKarton; });
binde('#f-breite', (v) => { z.fliesen.fliese.breite = v; delete z.fliesen.fliese.stueckProKarton; });
binde('#f-staerke', (v) => { z.fliesen.fliese.staerke = v; });
binde('#f-karton', (v) => { z.fliesen.fliese.stueckProKarton = Math.max(1, Math.round(v)); });
binde('#f-preis', (v) => { if (v === undefined) delete z.fliesen.fliese.preisProM2; else z.fliesen.fliese.preisProM2 = v; }, true);
$('#optiken').addEventListener('click', (ev) => {
  const b = ev.target.closest('[data-optik]');
  if (!b) return;
  z.fliesen.fliese.optik = b.dataset.optik;
  document.querySelectorAll('[data-optik]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  aktualisiere();
});
$('#f-rutsch').addEventListener('change', (ev) => { z.fliesen.fliese.rutschhemmung = ev.target.value; aktualisiere(); });
$('#f-pei').addEventListener('change', (ev) => { z.fliesen.fliese.abriebklasse = ev.target.value || null; aktualisiere(); });
binde('#v-fuge', (v) => { z.fliesen.verlegung.fugenbreite = v; });
binde('#v-randfuge', (v) => { z.fliesen.verlegung.randfuge = v; });
binde('#v-zahnung', (v) => { if (v === undefined) delete z.fliesen.verlegung.zahnung; else z.fliesen.verlegung.zahnung = v; }, true);
$('#v-fugenfarbe').addEventListener('change', (ev) => { z.fliesen.verlegung.fugenfarbe = ev.target.value; aktualisiere(); });
// Gemeinsam
binde('#v-start', (v) => { verlegung().startwert = Math.round(v); });
$('#v-muster').addEventListener('change', (ev) => { verlegung().muster = ev.target.value; fuelleFormular(); aktualisiere(); });
$('#v-drehung').addEventListener('click', (ev) => {
  const b = ev.target.closest('button[data-wert]');
  if (!b) return;
  verlegung().drehung = Number(b.dataset.wert);
  fuelleFormular(); aktualisiere();
});
document.querySelectorAll('[data-belag]').forEach((b) => b.addEventListener('click', () => {
  z.belag = b.dataset.belag; fuelleFormular(); aktualisiere();
}));
$('#mischen').addEventListener('click', () => { const v = verlegung(); v.startwert = ((v.startwert ?? 1) % 9973) + 1; $('#v-start').value = v.startwert; aktualisiere(); });
$('#vorlage').addEventListener('click', () => {
  const belag = z.belag;
  z = startZustand();
  z.belag = belag;
  if (belag === 'fliesen') z.raum = fliesenVorlage().raum;
  fuelleFormular(); aktualisiere();
});
$('#tuer-neu').addEventListener('click', () => { z.raum.tueren.push({ breite: 900, wand: 'unten', position: 300 }); zeichneListen(); aktualisiere(); });
$('#aussparung-neu').addEventListener('click', () => {
  z.raum.aussparungen.push({ name: 'Pfeiler', x: Math.round(z.raum.laenge / 2 - 200), y: Math.round(z.raum.breite / 2 - 200), laenge: 400, breite: 400 });
  zeichneListen(); aktualisiere();
});
$('#zeige-zuschnitt').addEventListener('change', zeichnePlan);
$('#reiter').addEventListener('click', (ev) => {
  const b = ev.target.closest('button[data-reiter]');
  if (b) { reiter = b.dataset.reiter; zeichneReiter(); }
});

// ── Zeichnung ────────────────────────────────────────────────────────────────

function hexZuHsl(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) / 255; const g = ((n >> 8) & 255) / 255; const b = (n & 255) / 255;
  const max = Math.max(r, g, b); const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l * 100];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s * 100, l * 100];
}

function zeichnePlan() {
  const e = ergebnis;
  const fliesen = e.belag === 'fliesen';
  const { raum } = e.eingabe;
  const L = raum.laenge;
  const B = raum.breite;
  const wand = Math.max(L, B) / 60;
  const fs = Math.max(L, B) / 55;
  const svg = $('#grundriss');
  svg.setAttribute('viewBox', `${-wand - fs * 5.5} ${-wand - fs * 0.5} ${L + 2 * wand + fs * 6.5} ${B + 2 * wand + fs * 4}`);
  const y = (v) => B - v; // y = 0 unten (Längswand vorne)
  const basis = fliesen
    ? (FLIESEN_OPTIKEN[e.eingabe.fliese.optik] ?? FLIESEN_OPTIKEN.beton).farbe
    : (HOLZARTEN[e.eingabe.parkett.holzart] ?? HOLZARTEN.eiche).farbe;
  const [h, s, l] = hexZuHsl(basis);
  const zuschnitt = $('#zeige-zuschnitt').checked;
  const linie = Math.max(L, B) / 2500;
  const f = e.flaechen.feld;
  let html = '';
  if (fliesen) {
    // Fugenbild: Fläche in Fugenfarbe, Fliesen darauf
    const fuge = (FUGENFARBEN[e.eingabe.verlegung.fugenfarbe] ?? FUGENFARBEN.grau).farbe;
    html += `<rect x="${f.x0}" y="${y(f.y1)}" width="${f.x1 - f.x0}" height="${f.y1 - f.y0}" fill="${fuge}"/>`;
  }
  const teile = e.staebe ?? e.teile;
  const kante = fliesen ? (FUGENFARBEN[e.eingabe.verlegung.fugenfarbe] ?? FUGENFARBEN.grau).farbe : `hsl(${h} ${s * 0.8}% ${Math.max(l - 22, 8)}%)`;
  html += `<g stroke="${kante}" stroke-width="${linie}">`;
  for (const t of teile) {
    const pkt = t.punkte.map(([px, py]) => `${px},${y(py)}`).join(' ');
    const hell = Math.min(95, Math.max(8, l + t.ton * 100));
    html += `<polygon points="${pkt}" fill="hsl(${h} ${s}% ${hell}%)"${zuschnitt && !t.ganz ? ` stroke="var(--fehler)" stroke-width="${linie * 3}"` : ''}/>`;
  }
  html += '</g>';
  // Mosaik: Steinraster auf den Matten andeuten
  const stein = fliesen ? FLIESENARTEN[e.eingabe.fliese.art]?.mosaikStein : null;
  if (stein) {
    const fuge = e.eingabe.verlegung.fugenbreite;
    const fugeFarbe = (FUGENFARBEN[e.eingabe.verlegung.fugenfarbe] ?? FUGENFARBEN.grau).farbe;
    html += `<defs><pattern id="mosaik" x="${f.x0}" y="${y(f.y0)}" width="${stein + fuge}" height="${stein + fuge}" patternUnits="userSpaceOnUse"><rect x="${stein}" width="${fuge}" height="${stein + fuge}" fill="${fugeFarbe}"/><rect y="${stein}" width="${stein + fuge}" height="${fuge}" fill="${fugeFarbe}"/></pattern></defs>`;
    html += `<rect x="${f.x0}" y="${y(f.y1)}" width="${f.x1 - f.x0}" height="${f.y1 - f.y0}" fill="url(#mosaik)"/>`;
  }
  html += `<rect x="${f.x0}" y="${y(f.y1)}" width="${f.x1 - f.x0}" height="${f.y1 - f.y0}" fill="none" stroke="var(--muted)" stroke-dasharray="${fs * 0.4} ${fs * 0.3}" stroke-width="${linie * 1.5}"/>`;
  html += `<defs><pattern id="schraffur" width="${fs * 0.6}" height="${fs * 0.6}" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="${fs * 0.6}" height="${fs * 0.6}" fill="var(--flaeche)"/><line x1="0" y1="0" x2="0" y2="${fs * 0.6}" stroke="var(--muted)" stroke-width="${fs * 0.12}"/></pattern></defs>`;
  for (const a of raum.aussparungen) {
    html += `<rect x="${a.x}" y="${y(a.y + a.breite)}" width="${a.laenge}" height="${a.breite}" fill="url(#schraffur)" stroke="var(--wand)" stroke-width="${linie * 2}"/>`;
    html += `<text x="${a.x + a.laenge / 2}" y="${y(a.y + a.breite / 2)}" font-size="${fs * 0.7}" text-anchor="middle" dominant-baseline="middle">${esc(a.name)}</text>`;
  }
  // Wände mit Türöffnungen und Türblatt nach innen
  const waende = { unten: [[-wand, -wand, L + wand, 0], 'x'], oben: [[-wand, B, L + wand, B + wand], 'x'], links: [[-wand, 0, 0, B], 'y'], rechts: [[L, 0, L + wand, B], 'y'] };
  for (const [name, [[x0, y0, x1, y1], achse]] of Object.entries(waende)) {
    const oeffnungen = raum.tueren.filter((t) => t.wand === name).map((t) => [t.position, t.position + t.breite]).sort((a, b) => a[0] - b[0]);
    let start = achse === 'x' ? x0 : y0;
    const ende = achse === 'x' ? x1 : y1;
    const stuecke = [];
    for (const [o0, o1] of oeffnungen) { stuecke.push([start, o0]); start = o1; }
    stuecke.push([start, ende]);
    for (const [a0, a1] of stuecke) {
      if (a1 <= a0) continue;
      html += achse === 'x'
        ? `<rect x="${a0}" y="${y(y1)}" width="${a1 - a0}" height="${y1 - y0}" fill="var(--wand)"/>`
        : `<rect x="${x0}" y="${y(a1)}" width="${x1 - x0}" height="${a1 - a0}" fill="var(--wand)"/>`;
    }
    for (const [o0, o1] of oeffnungen) {
      const r = o1 - o0;
      const stil = `fill="none" stroke="var(--wand)" stroke-width="${linie * 1.5}" stroke-dasharray="${fs * 0.3} ${fs * 0.2}"`;
      if (name === 'unten') html += `<path d="M${o0},${y(0)} L${o0},${y(r)} A${r},${r} 0 0 1 ${o1},${y(0)}" ${stil}/>`;
      if (name === 'oben') html += `<path d="M${o0},${y(B)} L${o0},${y(B - r)} A${r},${r} 0 0 0 ${o1},${y(B)}" ${stil}/>`;
      if (name === 'links') html += `<path d="M0,${y(o0)} L${r},${y(o0)} A${r},${r} 0 0 0 0,${y(o1)}" ${stil}/>`;
      if (name === 'rechts') html += `<path d="M${L},${y(o0)} L${L - r},${y(o0)} A${r},${r} 0 0 1 ${L},${y(o1)}" ${stil}/>`;
    }
  }
  const mass = (x1, y1, x2, y2, text, vertikal) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="var(--accent)" stroke-width="${linie * 1.5}"/>
    <text x="${vertikal ? x1 - fs * 0.5 : (x1 + x2) / 2}" y="${vertikal ? (y1 + y2) / 2 : y1 + fs * 1.2}" font-size="${fs}" text-anchor="${vertikal ? 'end' : 'middle'}" dominant-baseline="middle" style="fill:var(--accent)">${text}</text>`;
  html += mass(0, B + wand + fs * 1.2, L, B + wand + fs * 1.2, `${de(L / 1000)} m`, false);
  html += mass(-wand - fs * 1.2, 0, -wand - fs * 1.2, B, `${de(B / 1000)} m`, true);
  svg.innerHTML = html;
  const b = e.bedarf;
  $('#plan-info').textContent = fliesen
    ? `${b.teileImPlan} Fliesen im Plan · ${b.ganze} ganz · ${b.zuschnitte} Zuschnitte · Fuge ${de(e.eingabe.verlegung.fugenbreite)} mm`
    : `${b.staebeImPlan} Teile · ${b.ganzeStaebe} ganz · ${b.zuschnitte} Zuschnitte · Fuge ${e.flaechen.randabstand} mm`;
}

// ── Kennzahlen und Reiter ────────────────────────────────────────────────────

function zeichneKennzahlen() {
  const e = ergebnis;
  const b = e.bedarf;
  const kz = e.belag === 'fliesen'
    ? [
      ['haupt', `${b.kartons} Kartons`, `${b.fliesen} Fliesen · ${de(b.bestellM2)} m² bestellen`],
      ['', `${de(e.flaechen.verlegeflaecheM2)} m²`, `Verlegefläche (Raum ${de(e.flaechen.raumM2)} m²)`],
      ['', `${e.verschnitt.richtwertProzent} %`, `Verschnitt-Richtwert · laut Plan ${de(e.verschnitt.geometrischProzent, 1)} %`],
      ['', `${b.zuschnitte}`, `Zuschnitte von ${b.teileImPlan} Fliesen im Plan`],
    ]
    : [
      ['haupt', `${b.pakete} Pakete`, `${de(b.bestellM2)} m² bestellen`],
      ['', `${de(e.flaechen.verlegeflaecheM2)} m²`, `Verlegefläche (Raum ${de(e.flaechen.raumM2)} m²)`],
      ['', `${e.verschnitt.richtwertProzent} %`, `Verschnitt-Richtwert · laut Plan ${de(e.verschnitt.geometrischProzent, 1)} %`],
      ['', `${b.staebeBenoetigt}`, `Stäbe laut Plan · ${b.zuschnitte} Zuschnitte`],
    ];
  if (b.kosten != null) kz.push(['', `${de(b.kosten, 0)} €`, `${e.belag === 'fliesen' ? 'Fliesen' : 'Parkett'} bei ${de((e.eingabe.fliese ?? e.eingabe.parkett).preisProM2)} €/m²`]);
  $('#kennzahlen').innerHTML = kz.map(([k, gross, klein]) => `<div class="kz ${k}"><b>${esc(gross)}</b><span>${esc(klein)}</span></div>`).join('');
}

function tabelle(kopf, zeilen, zahlen = []) {
  return `<div class="tabelle"><table><thead><tr>${kopf.map((k) => `<th>${esc(k)}</th>`).join('')}</tr></thead><tbody>${zeilen.map((r) => `<tr${r.aktiv ? ' class="aktiv"' : ''}>${r.map((c, i) => `<td${zahlen.includes(i) ? ' class="zahl"' : ''}>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}

function zeichneReiter() {
  document.querySelectorAll('#reiter button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.reiter === reiter)));
  const ziel = $('#reiter-inhalt');
  const e = ergebnis;
  const fliesen = e.belag === 'fliesen';
  if (reiter === 'material') {
    ziel.innerHTML = tabelle(['Position', 'Menge', 'Einheit', 'Details'], e.material.map((m) => [esc(m.position), de(m.menge), esc(m.einheit), `<span class="klein">${esc(m.detail)}</span>`]), [1])
      + `<p class="leise">${esc(e.verschnitt.hinweis)}. Alle Mengen sind Richtwerte; Herstellerangaben haben Vorrang.</p>`;
  } else if (reiter === 'pruefung') {
    ziel.innerHTML = e.pruefungen.length
      ? e.pruefungen.map((p) => `<div class="meldung ${p.schwere}"><strong style="color:var(--${p.schwere})">${{ fehler: 'Fehler', warnung: 'Warnung', hinweis: 'Hinweis' }[p.schwere]}</strong><span>${esc(p.meldung)}</span><span></span><code>${esc(p.code)}</code></div>`).join('')
      : '<p class="leise">Keine Probleme: Belag, Muster, Raum und Fugen passen zusammen.</p>';
  } else if (reiter === 'arten' && fliesen) {
    const akt = e.eingabe.fliese.art;
    ziel.innerHTML = tabelle(['Fliesenart', 'Wasseraufnahme / Norm', 'Frost', 'Einsatz', 'Formate (cm)', 'Fuge', 'Muster'],
      Object.entries(FLIESENARTEN).map(([id, a]) => Object.assign([
        `<strong>${esc(a.name)}</strong><br><span class="klein">${esc(a.beschreibung)}</span>`,
        `<span class="klein">${esc(a.gruppe)}</span>`,
        a.frostsicher === true ? 'ja' : a.frostsicher === false ? 'nein' : 'je nach Produkt',
        `<span class="klein">${a.einsatz.map((x) => ({ wand_innen: 'Wand innen', boden_innen: 'Boden innen', aussen: 'außen' }[x])).join(', ')}</span>`,
        `<span class="klein">${a.formate.map(([l, b]) => `${l / 10}×${b / 10}`).join(', ')}${a.mosaikStein ? ` (Stein ${a.mosaikStein / 10}×${a.mosaikStein / 10})` : ''}</span>`,
        `${de(a.fuge[0])}–${de(a.fuge[1])} mm`,
        `<span class="klein">${a.muster.map((m) => esc(FLIESEN_MUSTER[m].name)).join(', ')}</span>`,
      ], { aktiv: id === akt })))
      + '<p class="leise">Wasseraufnahme-Gruppen nach DIN EN 14411 (I ≤ 3 %, II 3–10 %, III > 10 %); Rutschhemmung nach DIN 51130. Werte sind Richtwerte.</p>';
  } else if (reiter === 'arten') {
    const akt = e.eingabe.parkett.art;
    ziel.innerHTML = tabelle(['Parkettart', 'Aufbau / Norm', 'Standard L × B × S', 'übliche Spanne', 'Muster', 'Verlegung'],
      Object.entries(PARKETTARTEN).map(([id, a]) => Object.assign([
        `<strong>${esc(a.name)}</strong><br><span class="klein">${esc(a.beschreibung)}</span>`,
        `${esc(a.aufbau)}<br><span class="klein">${esc(a.norm)}</span>`,
        `${a.masse.laenge} × ${a.masse.breite} × ${a.masse.staerke}`,
        `<span class="klein">L ${a.bereich.laenge.join('–')}<br>B ${a.bereich.breite.join('–')}<br>S ${a.bereich.staerke.join('–')}</span>`,
        `<span class="klein">${a.muster.map((m) => esc(MUSTER[m].name)).join(', ')}</span>`,
        `<span class="klein">${a.verlegung.map((v) => esc(VERLEGEARTEN[v].name)).join(', ')}</span>`,
      ], { aktiv: id === akt })), [2])
      + '<p class="leise">Maße in mm, Richtwerte aus Normen und Ratgebern.</p>';
  } else if (reiter === 'muster') {
    const katalog = fliesen ? FLIESEN_MUSTER : MUSTER;
    ziel.innerHTML = tabelle(['Muster', 'Merkmal', 'Verschnitt-Richtwert'], Object.entries(katalog).map(([id, m]) => Object.assign([
      `<strong>${esc(m.name)}</strong>`, esc(m.kurz), `${m.verschnitt} %`,
    ], { aktiv: id === e.eingabe.verlegung.muster })), [2]) + `<p class="leise">Diagonal (45°) verlegt: +${fliesen ? 8 : 5} Prozentpunkte.</p>`;
  } else {
    const kurz = { ...e, [fliesen ? 'teile' : 'staebe']: `[${(e.teile ?? e.staebe).length} Teile – vollständig im Ergebnis]` };
    ziel.innerHTML = `<p class="leise">Eingabe und Ergebnis (ohne Teilgeometrie).</p><pre>${esc(JSON.stringify(e.eingabe, null, 2))}</pre><pre>${esc(JSON.stringify(kurz, null, 2))}</pre>`;
  }
}

function zeichneStatus(fehler) {
  const st = $('#status');
  if (fehler) { st.innerHTML = `<span class="pill fehler">${esc(fehler)}</span>`; return; }
  const n = (s) => ergebnis.pruefungen.filter((p) => p.schwere === s).length;
  const f = n('fehler'); const w = n('warnung'); const h = n('hinweis');
  st.innerHTML = (f ? `<span class="pill fehler">${f} Fehler</span>` : '<span class="pill ok">verlegbar</span>')
    + (w ? `<span class="pill warnung">${w} Warnung${w > 1 ? 'en' : ''}</span>` : '')
    + (h ? `<span class="pill hinweis">${h} Hinweis${h > 1 ? 'e' : ''}</span>` : '');
}

function aktualisiere() {
  try {
    ergebnis = berechneBelag(eingabe());
  } catch (err) {
    zeichneStatus(err.message);
    return;
  }
  speichern();
  zeichneStatus();
  zeichnePlan();
  zeichneKennzahlen();
  if (ergebnis.pruefungen.some((p) => p.schwere === 'fehler') && reiter === 'material') reiter = 'pruefung';
  zeichneReiter();
}

fuelleFormular();
aktualisiere();
