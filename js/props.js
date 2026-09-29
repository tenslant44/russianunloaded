// Per-map set dressing: small Russian props scattered around each map, plus rooftop decorations
import * as THREE from 'three';
import { toon, rand, pick } from './util.js';
import { heightAt, addCircle, world, ISLAND_R } from './world.js';

const matCache = new Map();
const M = (c, extra) => { const k = c + (extra ? JSON.stringify(extra) : ''); if (!matCache.has(k)) matCache.set(k, toon(c, extra)); return matCache.get(k); };
const box = (w, h, d, c) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), M(c));
const cyl = (r0, r1, h, c, n = 10) => new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, h, n), M(c));
const sph = (r, c) => new THREE.Mesh(new THREE.SphereGeometry(r, 12, 8), M(c));

function place(scene, g, x, z, col) {
  const y = heightAt(x, z);
  g.position.set(x, y, z);
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.userData.type = 'landmark'; } });
  scene.add(g);
  world.raycastables.push(...g.children.filter(o => o.isMesh));
  if (col) addCircle({ x, z, r: col.r, top: y + col.h, alive: true, kind: 'rock' });
  return g;
}

// ---- individual props
const LADA_COLORS = [0xe8e0c8, 0x6a8a3a, 0xc03020, 0x3a5aa0, 0xd8a030, 0x8a8a8a];
function lada(wreck) {
  const g = new THREE.Group();
  const c = wreck ? pick([0x7a4a2a, 0x6a5a4a, 0x5a4030]) : pick(LADA_COLORS);
  const body = box(4.2, 1.0, 1.9, c); body.position.y = 0.9; g.add(body);
  const cab = box(2.4, 0.8, 1.7, c); cab.position.set(-0.2, 1.8, 0); g.add(cab);
  const glass = box(2.45, 0.55, 1.72, wreck ? 0x1a1a1a : 0x8ab8d8); glass.position.set(-0.2, 1.85, 0); glass.scale.set(1.01, 1, 1.01); g.add(glass);
  for (const x of [-1.3, 1.3]) for (const z of [-0.95, 0.95]) {
    const w = cyl(0.42, 0.42, 0.3, 0x1a1a1a, 10); w.rotation.x = Math.PI / 2; w.position.set(x, 0.42, z); if (wreck && Math.random() < 0.5) w.position.y = 0.2; g.add(w);
  }
  if (wreck) { g.rotation.z = rand(-0.08, 0.08); body.rotation.x = rand(-0.05, 0.05); }
  g.rotation.y = rand(0, 6.28);
  return g;
}
function barrel() {
  const g = new THREE.Group();
  const b = cyl(0.55, 0.55, 1.4, 0xd8c020, 12); b.position.y = 0.7; g.add(b);
  const band = cyl(0.57, 0.57, 0.12, 0x1a1a1a, 12); band.position.y = 1.0; g.add(band);
  const goo = cyl(0.45, 0.45, 0.05, 0x80ff40, 12); goo.material = new THREE.MeshBasicMaterial({ color: 0x9aff3a }); goo.position.y = 1.41; g.add(goo);
  if (Math.random() < 0.4) g.rotation.z = Math.PI / 2, g.position.y = 0.55;
  return g;
}
function tank() { // frozen T-34
  const g = new THREE.Group();
  const green = 0x4a5a32;
  const hull = box(6.5, 1.4, 3.2, green); hull.position.y = 1.2; g.add(hull);
  for (const z of [-1.75, 1.75]) { const tr = box(6.8, 1.1, 0.7, 0x2a2a24); tr.position.set(0, 0.6, z); g.add(tr); }
  const tur = cyl(1.3, 1.5, 1.1, green, 10); tur.position.set(0.5, 2.4, 0); g.add(tur);
  const gun = cyl(0.14, 0.18, 4.2, green, 8); gun.rotation.z = Math.PI / 2; gun.position.set(-2.4, 2.5, 0); g.add(gun);
  const star = new THREE.Mesh(new THREE.CircleGeometry(0.45, 5), M(0xd52b1e)); star.position.set(0.5, 2.4, 1.52); g.add(star);
  const snow = box(6.6, 0.25, 3.3, 0xf2f6fa); snow.position.y = 2.0; g.add(snow);
  g.rotation.y = rand(0, 6.28);
  return g;
}
function logPile() {
  const g = new THREE.Group();
  for (let r = 0; r < 3; r++) for (let i = 0; i < 3 - r; i++) {
    const l = cyl(0.35, 0.35, 4, 0x6a4424, 8); l.rotation.x = Math.PI / 2; l.position.set((i - (2 - r) / 2) * 0.72, 0.35 + r * 0.62, 0); g.add(l);
  }
  g.rotation.y = rand(0, 6.28);
  return g;
}
function snowman() {
  const g = new THREE.Group();
  [[0.9, 0.9], [0.65, 2.2], [0.45, 3.1]].forEach(([r, y]) => { const s = sph(r, 0xf6f8fb); s.position.y = y; g.add(s); });
  const hat = cyl(0.4, 0.45, 0.45, 0x5a3a24, 10); hat.position.y = 3.55; g.add(hat); // ushanka
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.5, 6), M(0xff8020)); nose.rotation.x = Math.PI / 2; nose.position.set(0, 3.1, 0.6); g.add(nose);
  const bottle = cyl(0.08, 0.1, 0.5, 0xd8e8f0, 6); bottle.position.set(0.7, 2.2, 0.2); bottle.rotation.z = 0.5; g.add(bottle);
  return g;
}
function dish() { // Baikonur satellite dish
  const g = new THREE.Group();
  const post = cyl(0.3, 0.5, 5, 0x9a9a9a); post.position.y = 2.5; g.add(post);
  const d = new THREE.Mesh(new THREE.SphereGeometry(3.4, 18, 8, 0, 6.28, 0, 1.0), M(0xe8e8e8, { side: THREE.DoubleSide }));
  d.position.y = 5.8; d.rotation.x = 2.4; g.add(d);
  const horn = cyl(0.08, 0.08, 2.4, 0x6a6a6a); horn.position.set(0, 6.6, 0.8); horn.rotation.x = 0.7; g.add(horn);
  g.rotation.y = rand(0, 6.28);
  return g;
}
function fuelTank() {
  const g = new THREE.Group();
  const t = cyl(2.2, 2.2, 7, 0xd8d8d0, 14); t.rotation.z = Math.PI / 2; t.position.y = 2.8; g.add(t);
  const stripe = cyl(2.25, 2.25, 0.6, 0xd52b1e, 14); stripe.rotation.z = Math.PI / 2; stripe.position.y = 2.8; g.add(stripe);
  for (const x of [-2.5, 2.5]) { const l = box(0.4, 1.2, 3, 0x6a6a6a); l.position.set(x, 0.6, 0); g.add(l); }
  g.rotation.y = rand(0, 6.28);
  return g;
}
function camel() {
  const g = new THREE.Group(), c = 0xc8a060;
  const b = box(2.4, 1.1, 0.9, c); b.position.y = 2.0; g.add(b);
  for (const x of [-0.5, 0.5]) { const h = sph(0.55, c); h.position.set(x, 2.6, 0); g.add(h); }
  for (const x of [-0.9, 0.9]) for (const z of [-0.3, 0.3]) { const l = box(0.25, 1.5, 0.25, c); l.position.set(x, 0.75, z); g.add(l); }
  const n = box(0.35, 1.3, 0.35, c); n.position.set(1.4, 2.6, 0); n.rotation.z = -0.4; g.add(n);
  const hd = box(0.8, 0.4, 0.4, c); hd.position.set(1.8, 3.2, 0); g.add(hd);
  g.rotation.y = rand(0, 6.28);
  return g;
}
function outhouse() {
  const g = new THREE.Group();
  const b = box(1.5, 2.4, 1.5, 0x8a5a2b); b.position.y = 1.2; g.add(b);
  const r = box(1.8, 0.2, 1.8, 0x6a3a1a); r.position.y = 2.5; g.add(r);
  const h = new THREE.Mesh(new THREE.CircleGeometry(0.15, 12), M(0x1a1a1a)); h.position.set(0, 1.9, 0.76); g.add(h);
  g.rotation.y = rand(0, 6.28);
  return g;
}
function potatoPatch() {
  const g = new THREE.Group();
  const soil = box(6, 0.2, 4, 0x4a3020); soil.position.y = 0.1; g.add(soil);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 7; j++) { const p = sph(0.28, 0x3a8a2a); p.position.set(-2.6 + j * 0.85, 0.35, -1.4 + i * 0.95); p.scale.y = 0.7; g.add(p); }
  g.rotation.y = rand(0, 6.28);
  return g;
}
function haystack() {
  const g = new THREE.Group();
  const h = new THREE.Mesh(new THREE.ConeGeometry(1.8, 3.2, 10), M(0xd8b848)); h.position.y = 1.6; g.add(h);
  return g;
}
function lamp() {
  const g = new THREE.Group();
  const p = cyl(0.12, 0.18, 6, 0x2a2a2a, 8); p.position.y = 3; g.add(p);
  const arm = box(1.4, 0.12, 0.12, 0x2a2a2a); arm.position.set(0.6, 5.9, 0); g.add(arm);
  const l = sph(0.28, 0xfff0b0); l.material = new THREE.MeshBasicMaterial({ color: 0xfff0b0 }); l.position.set(1.2, 5.75, 0); g.add(l);
  g.rotation.y = rand(0, 6.28);
  return g;
}
function flag() {
  const g = new THREE.Group();
  const p = cyl(0.08, 0.1, 7, 0xcccccc, 6); p.position.y = 3.5; g.add(p);
  const cloth = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.5, 8, 1), M(0xd52b1e, { side: THREE.DoubleSide }));
  cloth.position.set(1.25, 6.2, 0); g.add(cloth);
  const star = new THREE.Mesh(new THREE.CircleGeometry(0.22, 5), new THREE.MeshBasicMaterial({ color: 0xffd040, side: THREE.DoubleSide })); star.position.set(0.5, 6.5, 0.01); g.add(star);
  world.flags = world.flags || []; world.flags.push(cloth);
  return g;
}
export function lenin(scale = 1) {
  const g = new THREE.Group(), bronze = 0x5a6a6a;
  const ped = box(2.6, 3, 2.6, 0x8a2a2a); ped.position.y = 1.5; g.add(ped);
  const coat = cyl(0.55, 0.9, 2.6, bronze, 10); coat.position.y = 4.3; g.add(coat);
  const head = sph(0.42, bronze); head.position.y = 6.0; g.add(head);
  const cap = cyl(0.42, 0.45, 0.2, bronze, 10); cap.position.y = 6.35; g.add(cap);
  const arm = cyl(0.14, 0.16, 1.7, bronze, 6); arm.position.set(0.6, 5.5, 0.4); arm.rotation.set(-1.0, 0, -0.9); g.add(arm);
  g.scale.setScalar(scale);
  g.rotation.y = rand(0, 6.28);
  return g;
}
function busStop() { // brutalist soviet bus stop
  const g = new THREE.Group();
  const back = box(4, 2.6, 0.3, 0x9aa0a8); back.position.y = 1.3; g.add(back);
  const roof = box(4.6, 0.3, 2, 0xd85a3a); roof.position.set(0, 2.75, 0.8); g.add(roof);
  const bench = box(3, 0.2, 0.6, 0x6a4a2a); bench.position.set(0, 0.6, 0.4); g.add(bench);
  g.rotation.y = rand(0, 6.28);
  return g;
}

// prop name -> [builder, collider]
const PROPS = {
  lada: [() => lada(false), { r: 2.1, h: 2.2 }],
  wreck: [() => lada(true), { r: 2.1, h: 2.2 }],
  barrel: [barrel, { r: 0.6, h: 1.4 }],
  tank: [tank, { r: 3.2, h: 2.6 }],
  logs: [logPile, { r: 2, h: 1.8 }],
  snowman: [snowman, { r: 0.9, h: 3.5 }],
  dish: [dish, { r: 0.7, h: 5 }],
  fuel: [fuelTank, { r: 3.4, h: 5 }],
  camel: [camel, { r: 1.2, h: 3 }],
  outhouse: [outhouse, { r: 1, h: 2.6 }],
  potato: [potatoPatch, null],
  hay: [haystack, { r: 1.6, h: 3 }],
  lamp: [lamp, { r: 0.3, h: 6 }],
  flag: [flag, { r: 0.2, h: 7 }],
  lenin: [() => lenin(1), { r: 1.6, h: 7 }],
  busstop: [busStop, { r: 2, h: 2.8 }],
};

export function scatterProps(scene, list, avoid = []) {
  for (const [name, count] of Object.entries(list || {})) {
    const [make, col] = PROPS[name];
    let n = 0, tries = 0;
    while (n < count && tries < count * 40) {
      tries++;
      const a = rand(0, 6.28), r = Math.sqrt(Math.random()) * ISLAND_R * 0.85;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (heightAt(x, z) < 2.5) continue;
      if (avoid.some(h => x > h.x0 - 4 && x < h.x1 + 4 && z > h.z0 - 4 && z < h.z1 + 4)) continue;
      place(scene, make(), x, z, col);
      n++;
    }
  }
}

// ---- rooftop / facade decorations used by building styles
export const DECO = {
  chimney(scene, b) {
    const c = box(0.8, 2, 0.8, 0x8a4a3a); c.position.set(b.x0 + 2, b.top + 1, b.z0 + 2); c.castShadow = true; scene.add(c);
  },
  onion(scene, b) { // little dacha onion dome
    const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
    const d = sph(1.1, pick([0x2a8ad8, 0x3aa04a, 0xe0b030])); d.scale.y = 1.3; d.position.set(cx, b.top + 1.4, cz); scene.add(d);
    const t = new THREE.Mesh(new THREE.ConeGeometry(0.3, 1.2, 8), M(0xe0b030)); t.position.set(cx, b.top + 3.1, cz); scene.add(t);
  },
  antenna(scene, b) { // soviet TV antenna forest on panel blocks
    for (let i = 0; i < 3; i++) {
      const x = rand(b.x0 + 1, b.x1 - 1), z = rand(b.z0 + 1, b.z1 - 1);
      const p = cyl(0.05, 0.05, 2.5, 0x3a3a3a, 4); p.position.set(x, b.top + 1.25, z); scene.add(p);
      const bar = box(1.6, 0.06, 0.06, 0x3a3a3a); bar.position.set(x, b.top + 2.3, z); scene.add(bar);
    }
  },
  star(scene, b) { // big red star on the roof
    const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
    const s = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 0.3, 5), new THREE.MeshBasicMaterial({ color: 0xff2a1a }));
    s.rotation.x = Math.PI / 2; s.position.set(cx, b.top + 2.4, cz); scene.add(s);
    const p = cyl(0.1, 0.1, 1.2, 0x8a8a8a, 4); p.position.set(cx, b.top + 0.6, cz); scene.add(p);
  },
  spire(scene, b) { // stalinist high-rise spire
    const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
    const t = box(4, 4, 4, 0xd8b878); t.position.set(cx, b.top + 2, cz); scene.add(t);
    const sp = new THREE.Mesh(new THREE.ConeGeometry(1.6, 7, 8), M(0xd8b878)); sp.position.set(cx, b.top + 7.5, cz); scene.add(sp);
    const s = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 0.2, 5), new THREE.MeshBasicMaterial({ color: 0xff2a1a })); s.rotation.x = Math.PI / 2; s.position.set(cx, b.top + 11.6, cz); scene.add(s);
  },
  snowpile(scene, b) {
    const s = sph(1.6, 0xf6f8fb); s.scale.set(1.4, 0.5, 1); s.position.set(b.x1 + 1, heightAt(b.x1 + 1, b.z0 + 3) + 0.2, b.z0 + 3); scene.add(s);
  },
};

export function updateProps(t) {
  if (world.flags) for (const f of world.flags) {
    const p = f.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i); p.setZ(i, Math.sin(t * 4 + x * 2.5) * 0.18 * (x + 1.2)); }
    p.needsUpdate = true;
  }
}
