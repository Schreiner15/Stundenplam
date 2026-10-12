// 3D-Ansicht für den Möbel-Lichtplaner (three.js r128, global THREE + THREE.OrbitControls).
// Physikalische Lichteinheiten: Spot-/Punktlichtstärke in Candela, Abstände in Metern → Beleuchtung in Lux.
// Koordinaten: Möbel-Welt (mm, X Breite, Y Tiefe nach hinten, Z Höhe) → three (m, x = X, y = Z, z = −Y).
// Zeichenwerkzeug: Linien auf Möbelflächen oder Raumflächen zeichnen (Raster-, Kanten- und Winkelfang).

import { kelvinZuRgb, spitzenLichtstaerke } from './licht/src/index.js';

const M = 0.001;
const MAX_SCHATTEN = 10; // Schatten werfende Lichter (Texturgrenzen in WebGL)
const RAMPE = ['#cde2fb', '#b7d3f6', '#9ec5f4', '#86b6ef', '#6da7ec', '#5598e7', '#3987e5', '#2a78d6', '#256abf', '#1c5cab', '#184f95', '#104281', '#0d366b'];
const ZEICHENFARBE = 0x22d3ee;

const zuThree = (p) => new THREE.Vector3(p.x * M, p.z * M, -p.y * M);
const zuWelt = (v) => ({ x: v.x / M, y: -v.z / M, z: v.y / M });
const richtungZuThree = (r) => new THREE.Vector3(r.x, r.z, -r.y).normalize();

function lichtfarbe(kelvin) {
  const [r, g, b] = kelvinZuRgb(kelvin);
  return new THREE.Color(r, g, b).convertSRGBToLinear();
}

/** Leuchtender Linienzug aus Stäben (für Profile und gezeichnete Linien). */
function leuchtzug(punkte, farbe, dicke = 0.006) {
  const gruppe = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color: farbe.clone().multiplyScalar(4) });
  for (let i = 0; i + 1 < punkte.length; i++) {
    const a = punkte[i];
    const b = punkte[i + 1];
    const laenge = a.distanceTo(b);
    if (laenge < 1e-6) continue;
    const stab = new THREE.Mesh(new THREE.CylinderGeometry(dicke, dicke, laenge, 8), mat);
    stab.position.copy(a.clone().lerp(b, 0.5));
    stab.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    gruppe.add(stab);
  }
  return gruppe;
}

/** Punkte gleichmäßig entlang eines Linienzugs (nach Bogenlänge). */
function verteileAuf(punkte, anzahl) {
  const laengen = [];
  let gesamt = 0;
  for (let i = 0; i + 1 < punkte.length; i++) { laengen.push(punkte[i].distanceTo(punkte[i + 1])); gesamt += laengen.at(-1); }
  const aus = [];
  for (let k = 0; k < anzahl; k++) {
    let rest = ((k + 0.5) / anzahl) * gesamt;
    for (let i = 0; i < laengen.length; i++) {
      if (rest <= laengen[i] || i === laengen.length - 1) { aus.push(punkte[i].clone().lerp(punkte[i + 1], Math.min(1, rest / (laengen[i] || 1)))); break; }
      rest -= laengen[i];
    }
  }
  return { punkte: aus, gesamt };
}

export class Ansicht3D {
  constructor(container) {
    if (!window.THREE?.OrbitControls) throw new Error('three.js konnte nicht geladen werden');
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.physicallyCorrectLights = true;
    this.renderer.outputEncoding = THREE.sRGBEncoding;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(40, 4 / 3, 0.01, 50);
    this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.inhalt = new THREE.Group();
    this.werkzeug = new THREE.Group(); // Zeichenhilfen, bleiben beim Neuaufbau erhalten
    this.scene.add(this.inhalt, this.werkzeug);
    this.hemi = new THREE.HemisphereLight(0xdfe8ff, 0x3a3128, 30);
    this.scene.add(this.hemi);
    this.optionen = { belichtungEV: 0, raumlicht: 5, luxKarte: true, schatten: true }; // Raumlicht in % des Lux-Niveaus
    this.ersterAufbau = true;
    this.zeichnen = null;
    this.raycaster = new THREE.Raycaster();

    this.bindeZeiger();
    new ResizeObserver(() => this.groesse()).observe(container);
    this.groesse();
    const schleife = () => {
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
      this.anim = requestAnimationFrame(schleife);
    };
    schleife();
  }

  groesse() {
    const w = this.container.clientWidth || 600;
    const h = Math.round(w * 0.8);
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  setzeOptionen(o) {
    Object.assign(this.optionen, o);
    if (this.letzte) this.zeige(...this.letzte);
  }

  kamera(art) {
    const k = this.korpus;
    if (!k) return;
    const mitte = new THREE.Vector3(k.breite * M / 2, k.hoehe * M / 2, -k.tiefe * M / 2);
    const abstand = Math.max(k.hoehe, k.breite * 1.4) * M * 1.35;
    const pos = {
      vorne: new THREE.Vector3(mitte.x, mitte.y, abstand),
      schraeg: new THREE.Vector3(mitte.x + abstand * 0.5, mitte.y + abstand * 0.55, abstand * 0.75),
      oben: new THREE.Vector3(mitte.x, mitte.y + abstand * 0.9, abstand * 0.45),
      unten: new THREE.Vector3(mitte.x + abstand * 0.3, mitte.y * 0.35, abstand * 0.8),
    }[art];
    this.camera.position.copy(pos);
    this.controls.target.copy(mitte);
    this.controls.update();
  }

  /** Baut die Szene aus Möbel- und Licht-Ergebnis neu auf; linien = gezeichnete, noch nicht umgewandelte Linien. */
  zeige(moebel, licht, linien = []) {
    this.letzte = [moebel, licht, linien];
    this.korpus = moebel.korpus;
    this.moebel = moebel;
    for (const kind of [...this.inhalt.children]) {
      this.inhalt.remove(kind);
      kind.traverse?.((o) => { o.geometry?.dispose(); o.material?.map?.dispose(); o.material?.dispose?.(); o.shadow?.map?.dispose(); });
    }
    const o = this.optionen;
    const k = moebel.korpus;

    // Raum: Boden und Wand hinter dem Möbel (auch zum Zeichnen freier Linien)
    const raumMat = new THREE.MeshStandardMaterial({ color: 0xbfbab2, roughness: 0.9 });
    const boden = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), raumMat);
    boden.rotation.x = -Math.PI / 2;
    boden.position.set(k.breite * M / 2, 0, 0);
    boden.receiveShadow = true;
    boden.userData.raum = 'Fußboden';
    const wand = new THREE.Mesh(new THREE.PlaneGeometry(6, 3.2), raumMat.clone());
    wand.position.set(k.breite * M / 2, 1.6, -k.tiefe * M - 0.02);
    wand.receiveShadow = true;
    wand.userData.raum = 'Wand';
    this.inhalt.add(boden, wand);

    // Möbelteile als Quader
    const farben = { seite: 0xd9bf94, boden: 0xd9bf94, rueckwand: 0xcfc4b0, sockelblende: 0xc8ad80, zarge: 0xe2d2b4 };
    for (const t of moebel.teile) {
      const l = t.lage;
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(Math.max(l.dx, 1) * M, Math.max(l.dz, 1) * M, Math.max(l.dy, 1) * M),
        new THREE.MeshStandardMaterial({ color: farben[t.kategorie] ?? 0xd9bf94, roughness: 0.65 }),
      );
      mesh.position.set((l.x + l.dx / 2) * M, (l.z + l.dz / 2) * M, -(l.y + l.dy / 2) * M);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData.teil = t.id;
      this.inhalt.add(mesh);
    }

    // Lichter
    let schatten = 0;
    const spot = (pos, richtung, cd, winkel, farbe) => {
      const s = new THREE.SpotLight(farbe, cd, 0, Math.min(Math.PI / 2 - 0.01, (winkel / 2) * Math.PI / 180 * 1.6), 0.6, 2);
      s.position.copy(pos);
      s.target.position.copy(pos.clone().add(richtung));
      if (o.schatten && schatten < MAX_SCHATTEN) {
        s.castShadow = true;
        s.shadow.mapSize.set(512, 512);
        s.shadow.camera.near = 0.005;
        s.shadow.camera.far = 4;
        s.shadow.bias = -0.0005;
        schatten++;
      }
      this.inhalt.add(s, s.target);
    };
    for (const l of licht.leuchten) {
      const farbe = lichtfarbe(l.kelvin);
      if (l.typ === 'spot' && l.richtung) {
        const pos = zuThree(l.position);
        const r = richtungZuThree(l.richtung);
        spot(pos.clone().add(r.clone().multiplyScalar(0.002)), r, spitzenLichtstaerke(l.lumen, l.abstrahlwinkel), l.abstrahlwinkel, farbe);
        const scheibe = new THREE.Mesh(new THREE.CircleGeometry(0.024, 24), new THREE.MeshBasicMaterial({ color: farbe.clone().multiplyScalar(4) }));
        scheibe.position.copy(pos.clone().add(r.clone().multiplyScalar(0.0012)));
        scheibe.lookAt(pos.clone().add(r));
        this.inhalt.add(scheibe);
      } else if (l.typ === 'ledProfil' || l.typ === 'linie') {
        const punkte = (l.punkte ?? [l.anfang, l.ende]).map(zuThree);
        const { punkte: lichtpunkte } = verteileAuf(punkte, Math.min(6, Math.max(1, Math.round(l.laenge / 250))));
        const anteil = l.lumen / lichtpunkte.length;
        if (l.richtung) {
          const r = richtungZuThree(l.richtung);
          for (const p of lichtpunkte) spot(p.clone().add(r.clone().multiplyScalar(0.002)), r, spitzenLichtstaerke(anteil, l.abstrahlwinkel), l.abstrahlwinkel, farbe);
        } else {
          for (const p of lichtpunkte) {
            const pl = new THREE.PointLight(farbe, anteil / (4 * Math.PI), 0, 2);
            pl.position.copy(p);
            this.inhalt.add(pl);
          }
        }
        this.inhalt.add(leuchtzug(punkte, farbe, l.typ === 'linie' ? 0.005 : 0.006));
      } else if (l.typ === 'punktlicht') {
        const p = new THREE.PointLight(farbe, l.lumen / (4 * Math.PI), 0, 2);
        p.position.copy(zuThree(l.position));
        this.inhalt.add(p);
        const kugel = new THREE.Mesh(new THREE.SphereGeometry(0.03, 16, 12), new THREE.MeshBasicMaterial({ color: farbe.clone().multiplyScalar(4) }));
        kugel.position.copy(p.position);
        this.inhalt.add(kugel);
      }
    }

    // Gezeichnete, noch nicht umgewandelte Linien (gestrichelt)
    for (const lin of linien) {
      const roehre = leuchtzug(lin.punkte.map(zuThree), new THREE.Color(ZEICHENFARBE).multiplyScalar(0.25), 0.003);
      roehre.traverse((o) => { if (o.material) { o.material.transparent = true; o.material.opacity = 0.75; o.material.depthTest = false; o.material.toneMapped = false; o.renderOrder = 10; } });
      this.inhalt.add(roehre);
    }

    // Lux-Karten als Textur auf den Prüfflächen
    const luxMax = Math.max(1, ...licht.beleuchtung.map((b) => b.max));
    if (o.luxKarte) {
      for (const b of licht.beleuchtung) {
        const t = moebel.teile.find((x) => x.id === b.teil);
        if (!t) continue;
        const canvas = document.createElement('canvas');
        canvas.width = b.nx;
        canvas.height = b.ny;
        const ctx = canvas.getContext('2d');
        b.werte.forEach((zeile, j) => zeile.forEach((w, i) => {
          ctx.fillStyle = RAMPE[Math.min(RAMPE.length - 1, Math.floor((w / luxMax) * RAMPE.length))];
          ctx.fillRect(i, b.ny - 1 - j, 1, 1); // Zeile 0 = vorne → unten im Bild
        }));
        const tex = new THREE.CanvasTexture(canvas);
        tex.magFilter = THREE.NearestFilter;
        tex.encoding = THREE.sRGBEncoding;
        const ebene = new THREE.Mesh(new THREE.PlaneGeometry(t.lage.dx * M, t.lage.dy * M), new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.72, toneMapped: false }));
        ebene.rotation.x = -Math.PI / 2;
        ebene.position.set((t.lage.x + t.lage.dx / 2) * M, (t.lage.z + t.lage.dz) * M + 0.0015, -(t.lage.y + t.lage.dy / 2) * M);
        ebene.userData.ignorieren = true;
        this.inhalt.add(ebene);
      }
    }

    // Belichtung: am mittleren Lux-Niveau ausrichten, dazu Korrektur in Blendenstufen
    const mittel = licht.beleuchtung.map((b) => b.mittel).filter((v) => v > 0);
    const referenz = Math.max(150, mittel.length ? mittel.reduce((a, b) => a + b) / mittel.length : 300);
    this.renderer.toneMappingExposure = (12 / referenz) * 2 ** o.belichtungEV;
    this.hemi.intensity = (o.raumlicht / 100) * referenz;
    if (this.ersterAufbau) {
      this.kamera('schraeg');
      this.ersterAufbau = false;
    }
  }

  // ── Zeichenwerkzeug ─────────────────────────────────────────────────────────

  /** Startet das Zeichnen. optionen: { raster, kantenAbstand, rechtwinklig }, beiAenderung(zustand), beiFertig(linie). */
  starteZeichnen(optionen, beiAenderung, beiFertig) {
    this.abbrechen();
    this.zeichnen = { ...optionen, punkte: [], ebene: null, beiAenderung, beiFertig, cursor: null };
    this.renderer.domElement.style.cursor = 'crosshair';
    this.meldeZeichnen();
  }

  setzeZeichenOptionen(o) {
    if (this.zeichnen) Object.assign(this.zeichnen, o);
  }

  abbrechen() {
    this.zeichnen = null;
    this.renderer.domElement.style.cursor = '';
    this.leereWerkzeug();
  }

  punktZurueck() {
    const z = this.zeichnen;
    if (!z) return;
    z.punkte.pop();
    if (!z.punkte.length) z.ebene = null;
    this.zeichneWerkzeug();
    this.meldeZeichnen();
  }

  fertig() {
    const z = this.zeichnen;
    if (!z || z.punkte.length < 2) return false;
    const linie = { punkte: z.punkte.map((p) => ({ x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10, z: Math.round(p.z * 10) / 10 })), normale: z.ebene.normale, auf: z.ebene.name };
    const fertigFn = z.beiFertig;
    this.abbrechen();
    fertigFn?.(linie);
    return true;
  }

  meldeZeichnen() {
    const z = this.zeichnen;
    if (!z) return;
    let laenge = 0;
    for (let i = 0; i + 1 < z.punkte.length; i++) laenge += Math.hypot(z.punkte[i + 1].x - z.punkte[i].x, z.punkte[i + 1].y - z.punkte[i].y, z.punkte[i + 1].z - z.punkte[i].z);
    z.beiAenderung?.({ punkte: z.punkte.length, laenge, auf: z.ebene?.name ?? null, cursor: z.cursor });
  }

  leereWerkzeug() {
    for (const kind of [...this.werkzeug.children]) {
      this.werkzeug.remove(kind);
      kind.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); });
    }
  }

  zeichneWerkzeug() {
    this.leereWerkzeug();
    const z = this.zeichnen;
    if (!z) return;
    const mat = new THREE.MeshBasicMaterial({ color: ZEICHENFARBE, depthTest: false, toneMapped: false });
    const kette = [...z.punkte, ...(z.cursor ? [z.cursor] : [])];
    for (const [i, p] of kette.entries()) {
      const kugel = new THREE.Mesh(new THREE.SphereGeometry(i === kette.length - 1 && z.cursor ? 0.007 : 0.005, 12, 8), mat);
      kugel.position.copy(zuThree(p));
      kugel.renderOrder = 20;
      this.werkzeug.add(kugel);
    }
    if (kette.length >= 2) {
      const roehre = leuchtzug(kette.map(zuThree), new THREE.Color(ZEICHENFARBE).multiplyScalar(0.25), 0.003);
      roehre.traverse((o) => { if (o.material) { o.material.depthTest = false; o.material.toneMapped = false; o.renderOrder = 20; } });
      this.werkzeug.add(roehre);
    }
  }

  bindeZeiger() {
    const el = this.renderer.domElement;
    let unten = null;
    el.addEventListener('pointerdown', (ev) => { unten = { x: ev.clientX, y: ev.clientY }; });
    el.addEventListener('pointermove', (ev) => {
      if (!this.zeichnen) return;
      this.zeichnen.cursor = this.fangPunkt(ev);
      this.zeichneWerkzeug();
      this.meldeZeichnen();
    });
    el.addEventListener('pointerup', (ev) => {
      if (!this.zeichnen || !unten || Math.hypot(ev.clientX - unten.x, ev.clientY - unten.y) > 4) return;
      const p = this.fangPunkt(ev, true);
      if (!p) return;
      const z = this.zeichnen;
      const letzter = z.punkte.at(-1);
      // Klick auf den letzten Punkt beendet die Linie
      if (letzter && Math.hypot(p.x - letzter.x, p.y - letzter.y, p.z - letzter.z) < 1) { this.fertig(); return; }
      z.punkte.push(p);
      this.zeichneWerkzeug();
      this.meldeZeichnen();
    });
    el.addEventListener('dblclick', () => this.fertig());
  }

  /** Strahl aus der Maus → Punkt auf Fläche (erster Punkt) bzw. auf der Zeichenebene, mit Fang. */
  fangPunkt(ev, festlegen = false) {
    const z = this.zeichnen;
    const r = this.renderer.domElement.getBoundingClientRect();
    const maus = new THREE.Vector2(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(maus, this.camera);
    let ebene = z.ebene;
    let roh;
    if (!ebene) {
      const ziele = this.inhalt.children.filter((o) => o.isMesh && (o.userData.teil || o.userData.raum) && !o.userData.ignorieren);
      const treffer = this.raycaster.intersectObjects(ziele, false)[0];
      if (!treffer) return null;
      ebene = this.ebeneAus(treffer);
      roh = zuWelt(treffer.point);
      if (festlegen) z.ebene = ebene;
    } else {
      const plane = new THREE.Plane();
      const n = richtungZuThree(ebene.normale);
      plane.setFromNormalAndCoplanarPoint(n, zuThree({ ...ebene.punkt }));
      const ziel = new THREE.Vector3();
      if (!this.raycaster.ray.intersectPlane(plane, ziel)) return null;
      roh = zuWelt(ziel);
    }
    return this.fange(roh, ebene);
  }

  /** Zeichenebene aus einem Treffer: Achse der Flächennormale, Ebenenwert, Grenzen der Fläche. */
  ebeneAus(treffer) {
    const n = treffer.face.normal.clone().transformDirection(treffer.object.matrixWorld);
    const welt = { x: n.x, y: -n.z, z: n.y };
    const achse = ['x', 'y', 'z'].reduce((a, b) => (Math.abs(welt[b]) > Math.abs(welt[a]) ? b : a));
    const vorzeichen = Math.sign(welt[achse]) || 1;
    const normale = { x: 0, y: 0, z: 0, [achse]: vorzeichen };
    const p = zuWelt(treffer.point);
    const teilId = treffer.object.userData.teil;
    const teil = teilId && this.moebel.teile.find((t) => t.id === teilId);
    let grenzen = { x: [-1e6, 1e6], y: [-1e6, 1e6], z: [-1e6, 1e6] };
    let wert = p[achse];
    let name = treffer.object.userData.raum ?? 'Fläche';
    if (teil) {
      const l = teil.lage;
      grenzen = { x: [l.x, l.x + l.dx], y: [l.y, l.y + l.dy], z: [l.z, l.z + l.dz] };
      wert = vorzeichen > 0 ? grenzen[achse][1] : grenzen[achse][0];
      const flaeche = achse === 'z' ? (vorzeichen > 0 ? 'oben' : 'unten') : achse === 'y' ? (vorzeichen < 0 ? 'Vorderkante' : 'Rückseite') : (teil.kategorie === 'seite' ? 'innen/außen' : 'Stirnseite');
      name = `${teil.bezeichnung} ${teil.id} · ${flaeche}`;
    }
    return { achse, wert, normale, grenzen, name, punkt: { ...p, [achse]: wert } };
  }

  /** Raster-, Kanten- und Winkelfang in der Zeichenebene. */
  fange(roh, ebene) {
    const z = this.zeichnen;
    const p = { ...roh, [ebene.achse]: ebene.wert };
    const fangweite = Math.max(30, z.kantenAbstand + 15);
    for (const a of ['x', 'y', 'z']) {
      if (a === ebene.achse) continue;
      const [min, max] = ebene.grenzen[a];
      let v = p[a];
      const begrenzt = max - min < 1e5;
      if (begrenzt && Math.abs(v - min) < fangweite) v = min + z.kantenAbstand;
      else if (begrenzt && Math.abs(v - max) < fangweite) v = max - z.kantenAbstand;
      else if (z.raster > 0) v = (begrenzt ? min : 0) + Math.round((v - (begrenzt ? min : 0)) / z.raster) * z.raster;
      p[a] = begrenzt ? Math.min(max, Math.max(min, v)) : v;
    }
    const letzter = z.punkte.at(-1);
    if (letzter && z.rechtwinklig) {
      const achsen = ['x', 'y', 'z'].filter((a) => a !== ebene.achse);
      const [a, b] = achsen;
      if (Math.abs(p[a] - letzter[a]) >= Math.abs(p[b] - letzter[b])) p[b] = letzter[b]; else p[a] = letzter[a];
    }
    return p;
  }
}
