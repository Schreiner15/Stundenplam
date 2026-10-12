// Live-Vorschau für das Parkett-Modul (nutzt nur die öffentliche API).

import {
  berechneParkett, parkettVorlage, PARKETTARTEN, MUSTER, VERLEGEARTEN, HOLZARTEN, SORTIERUNGEN,
} from './src/index.js';

const $ = (s) => document.querySelector(s);
const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const de = (v, stellen = 2) => (typeof v === 'number' ? v.toLocaleString('de-DE', { maximumFractionDigits: stellen }) : v ?? '');
const SPEICHER = 'parkett-verlegeplaner-v1';

let eingabe = laden() ?? parkettVorlage();
let ergebnis = null;
let reiter = 'material';

function laden() {
  try { const t = localStorage.getItem(SPEICHER); return t ? JSON.parse(t) : null; } catch { return null; }
}
function speichern() {
  try { localStorage.setItem(SPEICHER, JSON.stringify(eingabe)); } catch { /* optional */ }
}

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

// ── Formular ─────────────────────────────────────────────────────────────────

function fuelleFormular() {
  const { raum, parkett: p, verlegung: v } = eingabe;
  const art = PARKETTARTEN[p.art];
  $('#r-laenge').value = raum.laenge;
  $('#r-breite').value = raum.breite;
  $('#p-art').innerHTML = Object.entries(PARKETTARTEN).map(([id, a]) => `<option value="${id}"${id === p.art ? ' selected' : ''}>${esc(a.name)}</option>`).join('');
  $('#p-beschreibung').textContent = art ? `${art.aufbau} · ${art.norm} · ${art.beschreibung}` : '';
  $('#p-laenge').value = p.laenge ?? art?.masse.laenge ?? '';
  $('#p-breite').value = p.breite ?? art?.masse.breite ?? '';
  $('#p-staerke').value = p.staerke ?? art?.masse.staerke ?? '';
  $('#p-paket').value = p.paketInhalt ?? art?.paketInhalt ?? '';
  $('#p-preis').value = p.preisProM2 ?? '';
  $('#holzarten').innerHTML = Object.entries(HOLZARTEN).map(([id, h]) => `<button type="button" data-holz="${id}" aria-pressed="${id === (p.holzart ?? 'eiche')}" style="background:${h.farbe}" title="${esc(h.name)}"><span>${esc(h.name)}</span></button>`).join('');
  $('#p-sortierung').innerHTML = Object.entries(SORTIERUNGEN).map(([id, s]) => `<option value="${id}"${id === (p.sortierung ?? 'natur') ? ' selected' : ''}>${esc(s.name)}</option>`).join('');
  const muster = art?.muster ?? Object.keys(MUSTER);
  $('#v-muster').innerHTML = muster.map((m) => `<option value="${m}"${m === v.muster ? ' selected' : ''}>${esc(MUSTER[m].name)}</option>`).join('');
  $('#v-beschreibung').textContent = MUSTER[v.muster] ? `${MUSTER[v.muster].kurz} · Verschnitt-Richtwert ${MUSTER[v.muster].verschnitt} %` : '';
  document.querySelectorAll('#v-drehung button').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.wert) === (v.drehung ?? 0))));
  const arten = art?.verlegung ?? Object.keys(VERLEGEARTEN);
  $('#v-art').innerHTML = arten.map((a) => `<option value="${a}"${a === v.art ? ' selected' : ''}>${esc(VERLEGEARTEN[a].name)}</option>`).join('');
  $('#v-rand').value = v.randabstand ?? '';
  $('#v-start').value = v.startwert ?? 1;
  $('#mischen').hidden = v.muster !== 'wild';
  zeichneListen();
}

function zeichneListen() {
  const { raum } = eingabe;
  raum.tueren ??= [];
  raum.aussparungen ??= [];
  const wandOpt = (w) => ['unten', 'oben', 'links', 'rechts'].map((x) => `<option value="${x}"${x === w ? ' selected' : ''}>${x}</option>`).join('');
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

binde('#r-laenge', (v) => { eingabe.raum.laenge = v; });
binde('#r-breite', (v) => { eingabe.raum.breite = v; });
binde('#p-laenge', (v) => { eingabe.parkett.laenge = v; });
binde('#p-breite', (v) => { eingabe.parkett.breite = v; });
binde('#p-staerke', (v) => { eingabe.parkett.staerke = v; });
binde('#p-paket', (v) => { eingabe.parkett.paketInhalt = v; });
binde('#p-preis', (v) => { if (v === undefined) delete eingabe.parkett.preisProM2; else eingabe.parkett.preisProM2 = v; }, true);
binde('#v-rand', (v) => { if (v === undefined) delete eingabe.verlegung.randabstand; else eingabe.verlegung.randabstand = v; }, true);
binde('#v-start', (v) => { eingabe.verlegung.startwert = Math.round(v); });

$('#p-art').addEventListener('change', (ev) => {
  const art = PARKETTARTEN[ev.target.value];
  eingabe.parkett = { ...eingabe.parkett, art: ev.target.value, ...art.masse, paketInhalt: art.paketInhalt };
  if (!art.muster.includes(eingabe.verlegung.muster)) eingabe.verlegung.muster = art.muster[0];
  if (!art.verlegung.includes(eingabe.verlegung.art)) eingabe.verlegung.art = art.verlegung[0];
  delete eingabe.verlegung.randabstand;
  fuelleFormular();
  aktualisiere();
});
$('#holzarten').addEventListener('click', (ev) => {
  const b = ev.target.closest('[data-holz]');
  if (!b) return;
  eingabe.parkett.holzart = b.dataset.holz;
  document.querySelectorAll('[data-holz]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  aktualisiere();
});
$('#p-sortierung').addEventListener('change', (ev) => { eingabe.parkett.sortierung = ev.target.value; aktualisiere(); });
$('#v-muster').addEventListener('change', (ev) => { eingabe.verlegung.muster = ev.target.value; fuelleFormular(); aktualisiere(); });
$('#v-drehung').addEventListener('click', (ev) => {
  const b = ev.target.closest('button[data-wert]');
  if (!b) return;
  eingabe.verlegung.drehung = Number(b.dataset.wert);
  fuelleFormular();
  aktualisiere();
});
$('#v-art').addEventListener('change', (ev) => { eingabe.verlegung.art = ev.target.value; delete eingabe.verlegung.randabstand; fuelleFormular(); aktualisiere(); });
$('#mischen').addEventListener('click', () => { eingabe.verlegung.startwert = ((eingabe.verlegung.startwert ?? 1) % 9973) + 1; $('#v-start').value = eingabe.verlegung.startwert; aktualisiere(); });
$('#vorlage').addEventListener('click', () => { eingabe = parkettVorlage(); fuelleFormular(); aktualisiere(); });
$('#tuer-neu').addEventListener('click', () => { eingabe.raum.tueren.push({ breite: 900, wand: 'unten', position: 300 }); zeichneListen(); aktualisiere(); });
$('#aussparung-neu').addEventListener('click', () => {
  eingabe.raum.aussparungen.push({ name: 'Pfeiler', x: Math.round(eingabe.raum.laenge / 2 - 200), y: Math.round(eingabe.raum.breite / 2 - 200), laenge: 400, breite: 400 });
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
  const { raum } = e.eingabe;
  const L = raum.laenge;
  const B = raum.breite;
  const wand = Math.max(L, B) / 60;
  const fs = Math.max(L, B) / 55;
  const svg = $('#grundriss');
  svg.setAttribute('viewBox', `${-wand - fs * 5.5} ${-wand - fs * 0.5} ${L + 2 * wand + fs * 6.5} ${B + 2 * wand + fs * 4}`);
  const y = (v) => B - v; // y = 0 unten (Fensterwand / Längswand vorne)
  const holz = HOLZARTEN[e.eingabe.parkett.holzart] ?? HOLZARTEN.eiche;
  const [h, s, l] = hexZuHsl(holz.farbe);
  const zuschnitt = $('#zeige-zuschnitt').checked;
  const fuge = Math.max(L, B) / 2500;
  let html = '';
  // Stäbe
  const stroke = `hsl(${h} ${s * 0.8}% ${Math.max(l - 22, 8)}%)`;
  html += `<g stroke="${stroke}" stroke-width="${fuge}">`;
  for (const st of e.staebe) {
    const pkt = st.punkte.map(([px, py]) => `${px},${y(py)}`).join(' ');
    const hell = Math.min(92, Math.max(10, l + st.ton * 100));
    html += `<polygon points="${pkt}" fill="hsl(${h} ${s}% ${hell}%)"${zuschnitt && !st.ganz ? ' stroke="var(--fehler)" stroke-width="' + fuge * 3 + '"' : ''}/>`;
  }
  html += '</g>';
  // Randabstand
  const f = e.flaechen.feld;
  html += `<rect x="${f.x0}" y="${y(f.y1)}" width="${f.x1 - f.x0}" height="${f.y1 - f.y0}" fill="none" stroke="var(--muted)" stroke-dasharray="${fs * 0.4} ${fs * 0.3}" stroke-width="${fuge * 1.5}"/>`;
  // Aussparungen
  html += `<defs><pattern id="schraffur" width="${fs * 0.6}" height="${fs * 0.6}" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="${fs * 0.6}" height="${fs * 0.6}" fill="var(--flaeche)"/><line x1="0" y1="0" x2="0" y2="${fs * 0.6}" stroke="var(--muted)" stroke-width="${fs * 0.12}"/></pattern></defs>`;
  for (const a of raum.aussparungen) {
    html += `<rect x="${a.x}" y="${y(a.y + a.breite)}" width="${a.laenge}" height="${a.breite}" fill="url(#schraffur)" stroke="var(--wand)" stroke-width="${fuge * 2}"/>`;
    html += `<text x="${a.x + a.laenge / 2}" y="${y(a.y + a.breite / 2)}" font-size="${fs * 0.7}" text-anchor="middle" dominant-baseline="middle">${esc(a.name)}</text>`;
  }
  // Wände mit Türöffnungen
  const waende = { unten: [[-wand, -wand, L + wand, 0], 'x'], oben: [[-wand, B, L + wand, B + wand], 'x'], links: [[-wand, 0, 0, B], 'y'], rechts: [[L, 0, L + wand, B], 'y'] };
  for (const [name, [[x0, y0, x1, y1], achse]] of Object.entries(waende)) {
    const oeffnungen = raum.tueren.filter((t) => t.wand === name).map((t) => [t.position, t.position + t.breite]).sort((a, b) => a[0] - b[0]);
    let start = achse === 'x' ? x0 : y0;
    const ende = achse === 'x' ? x1 : y1;
    const teile = [];
    for (const [o0, o1] of oeffnungen) { teile.push([start, o0]); start = o1; }
    teile.push([start, ende]);
    for (const [a0, a1] of teile) {
      if (a1 <= a0) continue;
      html += achse === 'x'
        ? `<rect x="${a0}" y="${y(y1)}" width="${a1 - a0}" height="${y1 - y0}" fill="var(--wand)"/>`
        : `<rect x="${x0}" y="${y(a1)}" width="${x1 - x0}" height="${a1 - a0}" fill="var(--wand)"/>`;
    }
    for (const [o0, o1] of oeffnungen) {
      // Türblatt nach innen als Viertelkreis
      const r = o1 - o0;
      const stil = `fill="none" stroke="var(--wand)" stroke-width="${fuge * 1.5}" stroke-dasharray="${fs * 0.3} ${fs * 0.2}"`;
      if (name === 'unten') html += `<path d="M${o0},${y(0)} L${o0},${y(r)} A${r},${r} 0 0 1 ${o1},${y(0)}" ${stil}/>`;
      if (name === 'oben') html += `<path d="M${o0},${y(B)} L${o0},${y(B - r)} A${r},${r} 0 0 0 ${o1},${y(B)}" ${stil}/>`;
      if (name === 'links') html += `<path d="M0,${y(o0)} L${r},${y(o0)} A${r},${r} 0 0 0 0,${y(o1)}" ${stil}/>`;
      if (name === 'rechts') html += `<path d="M${L},${y(o0)} L${L - r},${y(o0)} A${r},${r} 0 0 1 ${L},${y(o1)}" ${stil}/>`;
    }
  }
  // Maße
  const mass = (x1, y1, x2, y2, text, vertikal) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="var(--accent)" stroke-width="${fuge * 1.5}"/>
    <text x="${vertikal ? x1 - fs * 0.5 : (x1 + x2) / 2}" y="${vertikal ? (y1 + y2) / 2 : y1 + fs * 1.2}" font-size="${fs}" text-anchor="${vertikal ? 'end' : 'middle'}" dominant-baseline="middle" style="fill:var(--accent)">${text}</text>`;
  html += mass(0, B + wand + fs * 1.2, L, B + wand + fs * 1.2, `${de(L / 1000)} m`, false);
  html += mass(-wand - fs * 1.2, 0, -wand - fs * 1.2, B, `${de(B / 1000)} m`, true);
  svg.innerHTML = html;
  $('#plan-info').textContent = `${e.bedarf.staebeImPlan} Teile · ${e.bedarf.ganzeStaebe} ganz · ${e.bedarf.zuschnitte} Zuschnitte · Fuge ${e.flaechen.randabstand} mm`;
}

// ── Kennzahlen und Reiter ────────────────────────────────────────────────────

function zeichneKennzahlen() {
  const e = ergebnis;
  const kz = [
    ['haupt', `${e.bedarf.pakete} Pakete`, `${de(e.bedarf.bestellM2)} m² bestellen`],
    ['', `${de(e.flaechen.verlegeflaecheM2)} m²`, `Verlegefläche (Raum ${de(e.flaechen.raumM2)} m²)`],
    ['', `${e.verschnitt.richtwertProzent} %`, `Verschnitt-Richtwert · laut Plan ${de(e.verschnitt.geometrischProzent, 1)} %`],
    ['', `${e.bedarf.staebeBenoetigt}`, `Stäbe laut Plan · ${e.bedarf.zuschnitte} Zuschnitte`],
  ];
  if (e.bedarf.kosten != null) kz.push(['', `${de(e.bedarf.kosten, 0)} €`, `Parkett bei ${de(e.eingabe.parkett.preisProM2)} €/m²`]);
  $('#kennzahlen').innerHTML = kz.map(([k, b, s]) => `<div class="kz ${k}"><b>${esc(b)}</b><span>${esc(s)}</span></div>`).join('');
}

function tabelle(kopf, zeilen, zahlen = []) {
  return `<div class="tabelle"><table><thead><tr>${kopf.map((k) => `<th>${esc(k)}</th>`).join('')}</tr></thead><tbody>${zeilen.map((z) => `<tr${z.aktiv ? ' class="aktiv"' : ''}>${z.map((c, i) => `<td${zahlen.includes(i) ? ' class="zahl"' : ''}>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}

function zeichneReiter() {
  document.querySelectorAll('#reiter button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.reiter === reiter)));
  const z = $('#reiter-inhalt');
  const e = ergebnis;
  if (reiter === 'material') {
    z.innerHTML = tabelle(['Position', 'Menge', 'Einheit', 'Details'], e.material.map((m) => [esc(m.position), de(m.menge), esc(m.einheit), `<span class="klein">${esc(m.detail)}</span>`]), [1])
      + `<p class="leise">${esc(e.verschnitt.hinweis)}. Alle Mengen sind Richtwerte; Herstellerangaben haben Vorrang.</p>`;
  } else if (reiter === 'pruefung') {
    z.innerHTML = e.pruefungen.length
      ? e.pruefungen.map((p) => `<div class="meldung ${p.schwere}"><strong style="color:var(--${p.schwere})">${{ fehler: 'Fehler', warnung: 'Warnung', hinweis: 'Hinweis' }[p.schwere]}</strong><span>${esc(p.meldung)}</span><span></span><code>${esc(p.code)}</code></div>`).join('')
      : '<p class="leise">Keine Probleme: Muster, Verlegeart, Randabstand und Raum passen zusammen.</p>';
  } else if (reiter === 'arten') {
    const akt = e.eingabe.parkett.art;
    z.innerHTML = tabelle(['Parkettart', 'Aufbau / Norm', 'Standard L × B × S', 'übliche Spanne', 'Muster', 'Verlegung'],
      Object.entries(PARKETTARTEN).map(([id, a]) => Object.assign([
        `<strong>${esc(a.name)}</strong><br><span class="klein">${esc(a.beschreibung)}</span>`,
        `${esc(a.aufbau)}<br><span class="klein">${esc(a.norm)}</span>`,
        `${a.masse.laenge} × ${a.masse.breite} × ${a.masse.staerke}`,
        `<span class="klein">L ${a.bereich.laenge.join('–')}<br>B ${a.bereich.breite.join('–')}<br>S ${a.bereich.staerke.join('–')}</span>`,
        `<span class="klein">${a.muster.map((m) => esc(MUSTER[m].name)).join(', ')}</span>`,
        `<span class="klein">${a.verlegung.map((v) => esc(VERLEGEARTEN[v].name)).join(', ')}</span>`,
      ], { aktiv: id === akt })), [2])
      + '<p class="leise">Maße in mm, Richtwerte aus Normen und Ratgebern. Klick links auf „Parkettart" wechselt die Art.</p>';
  } else if (reiter === 'muster') {
    z.innerHTML = tabelle(['Muster', 'Merkmal', 'Verschnitt-Richtwert'], Object.entries(MUSTER).map(([id, m]) => Object.assign([
      `<strong>${esc(m.name)}</strong>`, esc(m.kurz), `${m.verschnitt} %`,
    ], { aktiv: id === e.eingabe.verlegung.muster })), [2]) + '<p class="leise">Diagonal (45°) verlegt: +5 Prozentpunkte.</p>';
  } else {
    const ohneStaebe = { ...e, staebe: `[${e.staebe.length} Stäbe – vollständig im Export]` };
    z.innerHTML = `<p class="leise">Eingabe und Ergebnis (gekürzt um die Stabgeometrie).</p><pre>${esc(JSON.stringify(e.eingabe, null, 2))}</pre><pre>${esc(JSON.stringify(ohneStaebe, null, 2))}</pre>`;
  }
}

function zeichneStatus(fehler) {
  const st = $('#status');
  if (fehler) { st.innerHTML = `<span class="pill fehler">${esc(fehler)}</span>`; return; }
  const zahl = (s) => ergebnis.pruefungen.filter((p) => p.schwere === s).length;
  const f = zahl('fehler'); const w = zahl('warnung'); const h = zahl('hinweis');
  st.innerHTML = (f ? `<span class="pill fehler">${f} Fehler</span>` : '<span class="pill ok">verlegbar</span>')
    + (w ? `<span class="pill warnung">${w} Warnung${w > 1 ? 'en' : ''}</span>` : '')
    + (h ? `<span class="pill hinweis">${h} Hinweis${h > 1 ? 'e' : ''}</span>` : '');
}

function aktualisiere() {
  try {
    ergebnis = berechneParkett(eingabe);
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
