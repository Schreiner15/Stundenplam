// 3D-Ansicht für den Möbel-Lichtplaner (three.js r128, global THREE + THREE.OrbitControls).
// Physikalische Lichteinheiten: Spot-/Punktlichtstärke in Candela, Abstände in Metern → Beleuchtung in Lux.
// Koordinaten: Möbel-Welt (mm, X Breite, Y Tiefe nach hinten, Z Höhe) → three (m, x = X, y = Z, z = −Y).

import { kelvinZuRgb, spitzenLichtstaerke } from './licht/src/index.js';

const M = 0.001;
const MAX_SCHATTEN = 10; // Schatten werfende Lichter (Texturgrenzen in WebGL)
const RAMPE = ['#cde2fb', '#b7d3f6', '#9ec5f4', '#86b6ef', '#6da7ec', '#5598e7', '#3987e5', '#2a78d6', '#256abf', '#1c5cab', '#184f95', '#104281', '#0d366b'];

const zuThree = (p) => new THREE.Vector3(p.x * M, p.z * M, -p.y * M);
const richtungZuThree = (r) => new THREE.Vector3(r.x, r.z, -r.y).normalize();

function lichtfarbe(kelvin) {
  const [r, g, b] = kelvinZuRgb(kelvin);
  return new THREE.Color(r, g, b).convertSRGBToLinear();
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
    this.scene.add(this.inhalt);
    this.hemi = new THREE.HemisphereLight(0xdfe8ff, 0x3a3128, 30);
    this.scene.add(this.hemi);
    this.optionen = { belichtungEV: 0, raumlicht: 5, luxKarte: true, schatten: true }; // Raumlicht in % des Lux-Niveaus
    this.ersterAufbau = true;

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
    }[art];
    this.camera.position.copy(pos);
    this.controls.target.copy(mitte);
    this.controls.update();
  }

  /** Baut die Szene aus Möbel- und Licht-Ergebnis neu auf. */
  zeige(moebel, licht) {
    this.letzte = [moebel, licht];
    this.korpus = moebel.korpus;
    for (const kind of [...this.inhalt.children]) {
      this.inhalt.remove(kind);
      kind.traverse?.((o) => { o.geometry?.dispose(); o.material?.map?.dispose(); o.material?.dispose?.(); o.shadow?.map?.dispose(); });
    }
    const o = this.optionen;
    const k = moebel.korpus;

    // Raum: Boden und Wand hinter dem Möbel
    const raumMat = new THREE.MeshStandardMaterial({ color: 0xbfbab2, roughness: 0.9 });
    const boden = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), raumMat);
    boden.rotation.x = -Math.PI / 2;
    boden.position.set(k.breite * M / 2, 0, 0);
    boden.receiveShadow = true;
    this.inhalt.add(boden);
    const wand = new THREE.Mesh(new THREE.PlaneGeometry(6, 3.2), raumMat.clone());
    wand.position.set(k.breite * M / 2, 1.6, -k.tiefe * M - 0.02);
    wand.receiveShadow = true;
    this.inhalt.add(wand);

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
    const leuchtkoerper = (geo, pos, normale, farbe) => {
      const mat = new THREE.MeshBasicMaterial({ color: farbe.clone().multiplyScalar(4) });
      const m = new THREE.Mesh(geo, mat);
      m.position.copy(pos.clone().add(normale.clone().multiplyScalar(0.0012)));
      m.lookAt(pos.clone().add(normale));
      this.inhalt.add(m);
    };
    for (const l of licht.leuchten) {
      const farbe = lichtfarbe(l.kelvin);
      if (l.typ === 'spot' && l.richtung) {
        const pos = zuThree(l.position);
        const r = richtungZuThree(l.richtung);
        spot(pos.clone().add(r.clone().multiplyScalar(0.002)), r, spitzenLichtstaerke(l.lumen, l.abstrahlwinkel), l.abstrahlwinkel, farbe);
        leuchtkoerper(new THREE.CircleGeometry(0.024, 24), pos, r, farbe);
      } else if (l.typ === 'ledProfil') {
        const a = zuThree(l.anfang);
        const e = zuThree(l.ende);
        const r = richtungZuThree(l.richtung);
        const teile = Math.min(4, Math.max(1, Math.round(l.laenge / 250)));
        for (let i = 0; i < teile; i++) {
          const p = a.clone().lerp(e, (i + 0.5) / teile).add(r.clone().multiplyScalar(0.002));
          spot(p, r, spitzenLichtstaerke(l.lumen / teile, l.abstrahlwinkel), l.abstrahlwinkel, farbe);
        }
        const laenge = a.distanceTo(e);
        const streifen = new THREE.Mesh(new THREE.BoxGeometry(laenge, 0.004, 0.016), new THREE.MeshBasicMaterial({ color: farbe.clone().multiplyScalar(4) }));
        streifen.position.copy(a.clone().lerp(e, 0.5).add(r.clone().multiplyScalar(0.002)));
        streifen.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), e.clone().sub(a).normalize());
        this.inhalt.add(streifen);
      } else if (l.typ === 'punktlicht') {
        const p = new THREE.PointLight(farbe, l.lumen / (4 * Math.PI), 0, 2);
        p.position.copy(zuThree(l.position));
        this.inhalt.add(p);
        const kugel = new THREE.Mesh(new THREE.SphereGeometry(0.03, 16, 12), new THREE.MeshBasicMaterial({ color: farbe.clone().multiplyScalar(4) }));
        kugel.position.copy(p.position);
        this.inhalt.add(kugel);
      }
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
        this.inhalt.add(ebene);
      }
    }

    // Belichtung: am mittleren Lux-Niveau ausrichten (ein Wert ≈ Weiß), dazu Korrektur in Blendenstufen
    const mittel = licht.beleuchtung.map((b) => b.mittel).filter((v) => v > 0);
    const referenz = Math.max(150, mittel.length ? mittel.reduce((a, b) => a + b) / mittel.length : 300);
    this.renderer.toneMappingExposure = (12 / referenz) * 2 ** o.belichtungEV;
    this.hemi.intensity = (o.raumlicht / 100) * referenz; // diffuses Raumlicht als Anteil des Lux-Niveaus
    if (this.ersterAufbau) {
      this.kamera('schraeg');
      this.ersterAufbau = false;
    }
  }
}
