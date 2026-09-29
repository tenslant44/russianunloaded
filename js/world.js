import * as THREE from 'three';
import { fbm, noise2, toon, rand, clamp } from './util.js';
import { MAPCFG } from './maps.js';

export const ISLAND_R = 300;
export const MAP = 760;

const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

export function heightAt(x, z) {
  const d = Math.hypot(x, z) / ISLAND_R;
  const C = MAPCFG, M = C.mountain;
  let h = 7 + fbm(x / 140, z / 140, 4) * C.rough + noise2(x / 35, z / 35) * 3;
  // a mountain
  const md = Math.hypot(x - M.x, z - M.z) / M.r;
  h += Math.max(0, 1 - md) ** 2 * M.h;
  h = h * (1 - smooth(0.72, 1.0, d)) + 1.2 * (1 - smooth(0.9, 1.0, d));
  h -= smooth(0.95, 1.2, d) * 10;
  return h;
}
export function normalAt(x, z) {
  const e = 0.5;
  return new THREE.Vector3(heightAt(x - e, z) - heightAt(x + e, z), 2 * e, heightAt(x, z - e) - heightAt(x, z + e)).normalize();
}

// Circle colliders on a spatial hash (trees, rocks)
const CG = 8;
const circleGrid = new Map();
const ckey = (i, j) => i * 10000 + j;
export function addCircle(c) {
  const i = Math.floor(c.x / CG), j = Math.floor(c.z / CG);
  const k = ckey(i, j);
  if (!circleGrid.has(k)) circleGrid.set(k, []);
  circleGrid.get(k).push(c);
}
export function circlesNear(x, z) {
  const out = [];
  const i0 = Math.floor(x / CG), j0 = Math.floor(z / CG);
  for (let i = i0 - 1; i <= i0 + 1; i++) for (let j = j0 - 1; j <= j0 + 1; j++) {
    const a = circleGrid.get(ckey(i, j));
    if (a) for (const c of a) if (c.alive) out.push(c);
  }
  return out;
}

export const world = { trees: [], treeTrunks: null, treeLeaves: null, rocks: null, raycastables: [], terrain: null, water: null };

export function createWorld(scene) {
  circleGrid.clear();
  world.trees = []; world.raycastables = []; world.spinner = null; world.landmark = null; world.flags = [];

  // Sky dome
  const skyGeo = new THREE.SphereGeometry(1500, 32, 16);
  const C = MAPCFG;
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color(C.skyTop) }, bot: { value: new THREE.Color(C.skyBot) } },
    vertexShader: 'varying vec3 vp; void main(){ vp = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: 'uniform vec3 top; uniform vec3 bot; varying vec3 vp; void main(){ float t = clamp(vp.y*1.6+0.1,0.,1.); gl_FragColor = vec4(mix(bot, top, t),1.); }'
  });
  const sky = new THREE.Mesh(skyGeo, skyMat);
  sky.renderOrder = -10;
  scene.add(sky);
  world.sky = sky;

  // Terrain
  const seg = 190;
  const geo = new THREE.PlaneGeometry(MAP, MAP, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const cols = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const h = heightAt(x, z);
    pos.setY(i, h);
    const n = normalAt(x, z);
    const v = noise2(x / 12, z / 12) * 0.5 + 0.5;
    const [sr, sg, sb] = C.sand, [rr, rg, rb] = C.rock, [gr, gg, gb] = C.grass;
    if (h < 2.2) c.setRGB(sr, sg, sb);
    else if (n.y < 0.78 || h > C.peak) c.setRGB(rr + v * 0.1, rg + v * 0.1, rb + v * 0.1);
    else c.setRGB(gr + v * 0.12, gg + v * 0.1, gb + v * 0.05);
    cols[i * 3] = c.r; cols[i * 3 + 1] = c.g; cols[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  geo.computeVertexNormals();
  const terrain = new THREE.Mesh(geo, toon(0xffffff, { vertexColors: true }));
  terrain.receiveShadow = true;
  terrain.userData.type = 'terrain';
  scene.add(terrain);
  world.terrain = terrain;

  // Water
  const water = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), new THREE.MeshToonMaterial({ color: C.water, transparent: true, opacity: 0.85, gradientMap: null }));
  water.rotation.x = -Math.PI / 2;
  water.position.y = 0.3;
  scene.add(water);
  world.water = water;

  // Trees
  const N = C.trees;
  const trunkGeo = new THREE.CylinderGeometry(0.35, 0.5, 4, 7).translate(0, 2, 0);
  let leafGeo;
  if (C.pine) {
    const parts = [0, 1, 2].map(i => new THREE.ConeGeometry(2.6 - i * 0.7, 3.2, 9).translate(0, 4 + i * 1.8, 0));
    leafGeo = mergeGeos(parts);
  } else {
    leafGeo = new THREE.IcosahedronGeometry(2.4, 1).translate(0, 5.2, 0);
    const lp = leafGeo.attributes.position;
    for (let i = 0; i < lp.count; i++) { // lumpy cartoon canopy
      const x = lp.getX(i), y = lp.getY(i), z = lp.getZ(i);
      const k = 1 + noise2(x * 1.3 + 3, z * 1.3 + y) * 0.35;
      lp.setXYZ(i, x * k, 5.2 + (y - 5.2) * k * 0.9, z * k);
    }
  }
  leafGeo.computeVertexNormals();
  const trunks = new THREE.InstancedMesh(trunkGeo, toon(C.trunk), N);
  const leaves = new THREE.InstancedMesh(leafGeo, toon(0xffffff), N);
  trunks.castShadow = leaves.castShadow = true;
  trunks.receiveShadow = leaves.receiveShadow = true;
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  let placed = 0, tries = 0;
  while (placed < N && tries < 8000) {
    tries++;
    const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * ISLAND_R * 0.9;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const h = heightAt(x, z);
    if (h < 3 || normalAt(x, z).y < 0.8) continue;
    if (noise2(x / 60 + 9, z / 60) < -0.05 && Math.random() < 0.7) continue; // clumps
    const sc = rand(0.8, 1.4);
    const t = { x, z, y: h - 0.2, r: 0.6 * sc, scale: sc, hp: 150, alive: true, id: placed, kind: 'tree', rot: rand(0, 6.28) };
    world.trees.push(t);
    addCircle(t);
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), t.rot);
    m.compose(p.set(x, t.y, z), q, s.set(sc, sc, sc));
    trunks.setMatrixAt(placed, m);
    const dead = C.dead && Math.random() < C.dead;
    t.dead = dead;
    leaves.setMatrixAt(placed, dead ? new THREE.Matrix4().makeScale(0, 0, 0) : m);
    const lc = new THREE.Color().setHSL(C.leafH + rand(-0.04, 0.05), C.leafS, rand(C.leafL[0], C.leafL[1]));
    if (C.snowCap) lc.lerp(new THREE.Color(0xffffff), rand(0.1, 0.45));
    leaves.setColorAt(placed, lc);
    placed++;
  }
  trunks.count = leaves.count = placed;
  trunks.userData.type = leaves.userData.type = 'tree';
  scene.add(trunks, leaves);
  world.treeTrunks = trunks; world.treeLeaves = leaves;
  world.raycastables.push(trunks, leaves);

  // Rocks
  const RN = C.rocks;
  const rockGeo = new THREE.DodecahedronGeometry(1.5, 0);
  const rocks = new THREE.InstancedMesh(rockGeo, toon(C.rockColor), RN);
  rocks.castShadow = rocks.receiveShadow = true;
  for (let i = 0; i < RN; i++) {
    let x, z, h;
    do { const a = Math.random() * 6.28, r = Math.sqrt(Math.random()) * ISLAND_R * 0.9; x = Math.cos(a) * r; z = Math.sin(a) * r; h = heightAt(x, z); } while (h < 2);
    const sc = rand(0.6, 2.2);
    q.setFromEuler(new THREE.Euler(rand(0, 3), rand(0, 3), rand(0, 3)));
    m.compose(p.set(x, h, z), q, s.set(sc * rand(0.9, 1.5), sc, sc * rand(0.9, 1.5)));
    rocks.setMatrixAt(i, m);
    addCircle({ x, z, r: 1.4 * sc, alive: true, kind: 'rock', top: h + sc * 1.3 });
  }
  rocks.userData.type = 'rock';
  scene.add(rocks);
  world.rocks = rocks;
  world.raycastables.push(rocks);

  // Cartoon clouds
  const cloudMat = toon(C.clouds);
  for (let i = 0; i < 26; i++) {
    const g = new THREE.Group();
    for (let j = 0; j < 5; j++) {
      const b = new THREE.Mesh(new THREE.IcosahedronGeometry(rand(8, 16), 1), cloudMat);
      b.position.set(rand(-20, 20), rand(-3, 4), rand(-8, 8));
      g.add(b);
    }
    g.position.set(rand(-600, 600), rand(170, 230), rand(-600, 600));
    scene.add(g);
  }
  buildLandmark(scene, C.landmark);
  makeAmbient(scene, C);
  return world;
}

function mergeGeos(list) {
  // tiny non-indexed merge (positions + normals) for simple static shapes
  const arrs = list.map(g => g.index ? g.toNonIndexed() : g);
  let n = 0; for (const g of arrs) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3);
  let o = 0;
  for (const g of arrs) { pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); o += g.attributes.position.count; }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  return out;
}

function landmarkSpot() {
  for (let i = 0; i < 400; i++) {
    const a = rand(0, 6.28), r = rand(40, 150);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const hs = [heightAt(x, z), heightAt(x + 10, z), heightAt(x - 10, z), heightAt(x, z + 10), heightAt(x, z - 10)];
    if (Math.min(...hs) > 3 && Math.max(...hs) - Math.min(...hs) < 3) return { x, z, y: Math.min(...hs) };
  }
  return { x: 0, z: 0, y: heightAt(0, 0) };
}
function solid(scene, g, colliders) {
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.userData.type = 'landmark'; world.raycastables.push(o); } });
  scene.add(g);
  for (const c of colliders) addCircle({ ...c, alive: true, kind: 'rock' });
}

// Iconic set pieces per map
function buildLandmark(scene, kind) {
  if (!kind) return;
  const s = landmarkSpot();
  world.landmark = { kind, ...s };
  const g = new THREE.Group(); g.position.set(s.x, s.y - 0.5, s.z);
  const M = (c) => toon(c);
  if (kind === 'ferris') {
    // the abandoned Pripyat Ferris wheel, rusty yellow
    const R = 13, hub = 16;
    const rust = M(0xb89a3a), dark = M(0x5a4a2a), cab = M(0xd8c030);
    const wheel = new THREE.Group(); wheel.position.y = hub; g.add(wheel);
    for (const zz of [-1.2, 1.2]) {
      const rim = new THREE.Mesh(new THREE.TorusGeometry(R, 0.25, 6, 48), rust); rim.position.z = zz; wheel.add(rim);
      for (let i = 0; i < 16; i++) {
        const sp = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, R, 4).translate(0, R / 2, 0), dark);
        sp.rotation.z = i / 16 * Math.PI * 2; sp.position.z = zz; wheel.add(sp);
      }
    }
    for (let i = 0; i < 16; i++) {
      const a = i / 16 * Math.PI * 2;
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.1, 1.8, 8), cab);
      c.position.set(Math.cos(a) * R, Math.sin(a) * R - 1.4, 0); wheel.add(c);
    }
    wheel.add(new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 3.2, 10).rotateX(Math.PI / 2), dark));
    for (const zz of [-2.2, 2.2]) for (const sx of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, hub + 3, 6), rust);
      leg.position.set(sx * 4.2, hub / 2, zz); leg.rotation.z = sx * 0.27; g.add(leg);
    }
    solid(scene, g, [{ x: s.x - 8.5, z: s.z, r: 1.4, top: s.y + 3 }, { x: s.x + 8.5, z: s.z, r: 1.4, top: s.y + 3 }]);
    world.spinner = { obj: wheel, speed: 0.03 };
  } else if (kind === 'rocket') {
    // Soyuz-style rocket on a launch pad
    const white = M(0xeeeeee), grey = M(0x8a8a8a), orange = M(0xe07a30), red = M(0xd52b1e);
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(12, 13, 1.5, 24), grey); pad.position.y = 0.75; g.add(pad);
    const core = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 2.2, 30, 16), white); core.position.y = 17; g.add(core);
    const top = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.8, 8, 16), white); top.position.y = 36; g.add(top);
    const nose = new THREE.Mesh(new THREE.ConeGeometry(1.2, 5, 16), red); nose.position.y = 42.5; g.add(nose);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(1.85, 1.85, 1.2, 16), red); band.position.y = 30; g.add(band);
    for (let i = 0; i < 4; i++) {
      const a = i / 4 * Math.PI * 2 + 0.4;
      const b = new THREE.Group(); b.position.set(Math.cos(a) * 2.8, 0, Math.sin(a) * 2.8); g.add(b);
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 1.3, 16, 10), orange); body.position.y = 10; b.add(body);
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.6, 3, 10), orange); cone.position.y = 19.5; b.add(cone);
    }
    const tower = new THREE.Mesh(new THREE.BoxGeometry(2, 40, 2), M(0xa03020)); tower.position.set(-8, 20, 0); g.add(tower);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(6, 0.8, 0.8), M(0xa03020)); arm.position.set(-5, 32, 0); g.add(arm);
    solid(scene, g, [{ x: s.x, z: s.z, r: 4.5, top: s.y + 40 }, { x: s.x - 8, z: s.z, r: 1.6, top: s.y + 40 }]);
  } else if (kind === 'church' || kind === 'basil') {
    // onion-dome orthodox church / St. Basil's Cathedral
    const big = kind === 'basil';
    const domeCols = big ? [0xd52b1e, 0x2a9a4a, 0x2a6ad8, 0xe0b030, 0xe07a30, 0x9a2ad8, 0x30b0b0, 0xd52b1e, 0xe0b030] : [0xe0b030, 0x2a6ad8, 0x2a6ad8, 0x2a6ad8, 0x2a6ad8];
    const wallC = big ? 0xb8402a : 0xf2eee4;
    const base = new THREE.Mesh(new THREE.BoxGeometry(big ? 18 : 10, big ? 8 : 7, big ? 18 : 12), M(wallC)); base.position.y = big ? 4 : 3.5; g.add(base);
    const towers = big
      ? [[0, 0, 26, 2.6], [7, 7, 15, 1.9], [-7, 7, 15, 1.9], [7, -7, 15, 1.9], [-7, -7, 15, 1.9], [0, 9, 13, 1.6], [0, -9, 13, 1.6], [9, 0, 13, 1.6], [-9, 0, 13, 1.6]]
      : [[0, 0, 14, 2.4], [3.5, 4, 10, 1.3], [-3.5, 4, 10, 1.3], [3.5, -4, 10, 1.3], [-3.5, -4, 10, 1.3]];
    towers.forEach(([x, z, h, r], i) => {
      const t = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.8, r * 0.9, h, 10), M(i ? wallC : big ? 0xe8e0c8 : wallC)); t.position.set(x, h / 2, z); g.add(t);
      const pts = [[0.01, 0], [r * 1.05, 0.2], [r * 1.35, r * 0.9], [r * 1.1, r * 1.7], [r * 0.5, r * 2.3], [0.1, r * 2.9], [0.01, r * 3.0]].map(([a, b]) => new THREE.Vector2(a, b));
      const d = new THREE.Mesh(new THREE.LatheGeometry(pts, 14), M(domeCols[i % domeCols.length])); d.position.set(x, h, z); g.add(d);
      const cross = new THREE.Mesh(new THREE.BoxGeometry(0.15, 1.6, 0.15), M(0xffd040)); cross.position.set(x, h + r * 3 + 0.8, z); g.add(cross);
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.12, 0.12), M(0xffd040)); bar.position.set(x, h + r * 3 + 1.1, z); g.add(bar);
    });
    solid(scene, g, [{ x: s.x, z: s.z, r: big ? 10 : 6, top: s.y + (big ? 8 : 7) }]);
  } else if (kind === 'matryoshka') {
    // enormous nesting doll frozen in the tundra
    const pts = [[0.01, 0], [5, 0], [6.2, 2], [6.4, 5], [5.6, 8], [4.2, 10], [4.4, 11.5], [4.8, 13.5], [4.3, 16], [2.8, 17.6], [0.01, 18]].map(([x, y]) => new THREE.Vector2(x, y));
    const doll = new THREE.Mesh(new THREE.LatheGeometry(pts, 28), M(0xd02030)); g.add(doll);
    const face = new THREE.Mesh(new THREE.SphereGeometry(3.2, 20, 14), M(0xffe0c8)); face.position.set(0, 13.4, -2.1); face.scale.set(1, 1, 0.55); g.add(face);
    for (const sx of [-1, 1]) {
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6), M(0x1a2a6a)); e.position.set(sx * 1.1, 14, -3.8); g.add(e);
      const ch = new THREE.Mesh(new THREE.SphereGeometry(0.6, 8, 6), M(0xff7a8a)); ch.position.set(sx * 1.7, 12.9, -3.6); ch.scale.z = 0.3; g.add(ch);
    }
    const mouth = new THREE.Mesh(new THREE.SphereGeometry(0.4, 8, 6), M(0xc01020)); mouth.position.set(0, 12.2, -3.85); mouth.scale.set(1.2, 0.5, 0.3); g.add(mouth);
    const apron = new THREE.Mesh(new THREE.SphereGeometry(4.8, 20, 14, 0, Math.PI * 2, 0, Math.PI / 2), M(0xffd040)); apron.position.set(0, 4, -2.2); apron.rotation.x = -Math.PI / 2; apron.scale.set(0.9, 0.6, 1.2); g.add(apron);
    for (let i = 0; i < 5; i++) { const f = new THREE.Mesh(new THREE.SphereGeometry(0.8, 8, 6), M([0xff4060, 0x40a040, 0x3060ff][i % 3])); f.position.set(-2 + i, 4.2 + (i % 2), -5.6); f.scale.z = 0.3; g.add(f); }
    solid(scene, g, [{ x: s.x, z: s.z, r: 6.2, top: s.y + 18 }]);
  }
}

// Falling snow / ash / dust around the camera
function makeAmbient(scene, C) {
  world.ambient = null;
  const kind = C.snow ? 'snow' : C.toxic ? 'ash' : C.landmark === 'rocket' ? 'dust' : null;
  if (!kind) return;
  const N = kind === 'snow' ? 2500 : 900;
  const pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) { pos[i * 3] = rand(-60, 60); pos[i * 3 + 1] = rand(-20, 40); pos[i * 3 + 2] = rand(-60, 60); }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const col = kind === 'snow' ? 0xffffff : kind === 'ash' ? 0xc8e878 : 0xe8b880;
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: col, size: kind === 'snow' ? 0.22 : 0.14, transparent: true, opacity: kind === 'snow' ? 0.9 : 0.6, depthWrite: false }));
  pts.frustumCulled = false;
  scene.add(pts);
  world.ambient = { pts, kind, fall: kind === 'snow' ? 3 : 0.4, t: 0 };
}
export function updateWorld(dt, camPos) {
  if (world.spinner) world.spinner.obj.rotation.z += dt * world.spinner.speed;
  const A = world.ambient;
  if (!A) return;
  A.t += dt;
  const p = A.pts.geometry.attributes.position, a = p.array;
  for (let i = 0; i < a.length; i += 3) {
    a[i + 1] -= A.fall * dt * (0.6 + (i % 7) * 0.1);
    a[i] += Math.sin(A.t + i) * dt * 0.6;
    if (a[i + 1] < -20) a[i + 1] += 60;
  }
  p.needsUpdate = true;
  // wrap around camera
  A.pts.position.set(0, camPos.y, 0);
  for (let i = 0; i < a.length; i += 3) {
    if (a[i] < camPos.x - 60) a[i] += 120; else if (a[i] > camPos.x + 60) a[i] -= 120;
    if (a[i + 2] < camPos.z - 60) a[i + 2] += 120; else if (a[i + 2] > camPos.z + 60) a[i + 2] -= 120;
  }
}

export function damageTree(id, amount) {
  const t = world.trees[id];
  if (!t || !t.alive) return null;
  t.hp -= amount;
  if (t.hp <= 0) {
    t.alive = false;
    const m = new THREE.Matrix4().makeScale(0, 0, 0);
    world.treeTrunks.setMatrixAt(id, m);
    world.treeLeaves.setMatrixAt(id, m);
    world.treeTrunks.instanceMatrix.needsUpdate = true;
    world.treeLeaves.instanceMatrix.needsUpdate = true;
  }
  return t;
}

// Find spots suitable for houses
export function findHouseSpots(n, size = 12) {
  const spots = [];
  let tries = 0;
  while (spots.length < n && tries < 20000) {
    tries++;
    const a = Math.random() * 6.28, r = rand(20, ISLAND_R * 0.8);
    const x = Math.round(Math.cos(a) * r / 4) * 4, z = Math.round(Math.sin(a) * r / 4) * 4;
    const S = size, hs = [heightAt(x, z), heightAt(x + S, z), heightAt(x, z + S), heightAt(x + S, z + S), heightAt(x + S / 2, z + S / 2)];
    const mn = Math.min(...hs), mx = Math.max(...hs);
    if (mn < 3 || mx - mn > 1.1 + S * 0.04) continue;
    if (spots.some(s => Math.hypot(s.x - x, s.z - z) < S + 16)) continue;
    spots.push({ x, z, y: mx });
  }
  return spots;
}
