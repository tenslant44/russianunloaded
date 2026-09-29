import * as THREE from 'three';
import { toon, rand, pick } from './util.js';

export const RARITY = [
  { name: 'Common', color: 0xb0b0b0 },
  { name: 'Uncommon', color: 0x3cd23c },
  { name: 'Rare', color: 0x3c8cff },
  { name: 'Epic', color: 0xb44bff },
  { name: 'Legendary', color: 0xffa014 },
];

export const WEAPONS = {
  pickaxe: { name: 'Pickaxe', kind: 'melee', dmg: 22, rate: 0.42, range: 2.8 },
  ar: { name: 'Kalashnikov', kind: 'gun', dmg: 30, rate: 0.14, mag: 30, reload: 2.2, spread: 0.018, bloom: 0.006, maxSpread: 0.05, range: 300, pellets: 1, sound: 'ar', auto: true, gore: 1.2, kick: 0.45, recoil: [0.014, 0.006] },
  smg: { name: 'Bizon SMG', kind: 'gun', dmg: 17, rate: 0.075, mag: 30, reload: 2.0, spread: 0.035, bloom: 0.004, maxSpread: 0.07, range: 120, pellets: 1, sound: 'ar', auto: true, gore: 0.9, kick: 0.3, recoil: [0.009, 0.009] },
  shotgun: { name: 'Pump Shotgun', kind: 'gun', dmg: 11, rate: 0.95, mag: 5, reload: 4.0, spread: 0.075, bloom: 0, maxSpread: 0.075, range: 45, pellets: 10, sound: 'shotgun', auto: false, gore: 2.2, kick: 1.4, recoil: [0.075, 0.015] },
  sniper: { name: 'Dragunov', kind: 'gun', dmg: 105, rate: 1.3, mag: 5, reload: 3.0, spread: 0.002, bloom: 0, maxSpread: 0.002, range: 600, pellets: 1, sound: 'shotgun', auto: false, gore: 3, zoom: 3.2, kick: 1.5, recoil: [0.1, 0.012] },
  pistol: { name: 'Makarov', kind: 'gun', dmg: 24, rate: 0.2, mag: 8, reload: 1.4, spread: 0.02, bloom: 0.012, maxSpread: 0.06, range: 90, pellets: 1, sound: 'pistol', auto: false, gore: 1.0, kick: 0.5, recoil: [0.022, 0.008] },
  lmg: { name: 'PKM Machine Gun', kind: 'gun', dmg: 26, rate: 0.09, mag: 100, reload: 5.5, spread: 0.03, bloom: 0.003, maxSpread: 0.08, range: 280, pellets: 1, sound: 'ar', auto: true, gore: 1.6, kick: 0.5, recoil: [0.011, 0.011] },
  obrez: { name: 'Obrez Sawed-Off', kind: 'gun', dmg: 13, rate: 0.35, mag: 2, reload: 2.4, spread: 0.12, bloom: 0, maxSpread: 0.12, range: 28, pellets: 14, sound: 'shotgun', auto: false, gore: 3.2, kick: 2, recoil: [0.11, 0.03] },
  rpg: { name: 'RPG-7', kind: 'gun', dmg: 160, rate: 1.2, mag: 1, reload: 3.4, spread: 0.004, bloom: 0, maxSpread: 0.004, range: 400, pellets: 1, sound: 'rpg', auto: false, gore: 4, kick: 2, recoil: [0.09, 0.01], rocket: true },
  vodka: { name: 'Shield Vodka', kind: 'heal', shield: 50, use: 2.2 },
  medkit: { name: 'Medkit', kind: 'heal', health: 100, use: 4.0, stopBleed: true },
  bandage: { name: 'Бинт Bandage', kind: 'heal', health: 15, use: 1.6, stopBleed: true },
  pelmeni: { name: 'Babushka Pelmeni', kind: 'heal', health: 30, shield: 10, use: 2.6 },
};
export const LOOT_TABLE = ['ar', 'ar', 'ar', 'smg', 'smg', 'shotgun', 'shotgun', 'shotgun', 'sniper', 'vodka', 'vodka', 'medkit',
  'pistol', 'pistol', 'lmg', 'obrez', 'obrez', 'rpg', 'bandage', 'bandage', 'bandage', 'pelmeni', 'pelmeni'];

export function rollRarity() {
  const r = Math.random();
  return r < 0.38 ? 0 : r < 0.66 ? 1 : r < 0.86 ? 2 : r < 0.96 ? 3 : 4;
}
export function makeItem(id, rarity = rollRarity()) {
  const d = WEAPONS[id];
  const it = { id, rarity, def: d };
  if (d.kind === 'gun') it.ammo = d.mag;
  if (d.kind === 'heal') it.count = id === 'vodka' ? 2 : id === 'bandage' ? 5 : id === 'pelmeni' ? 3 : 1;
  return it;
}
export function itemDamage(it) { return it.def.dmg * (1 + it.rarity * 0.07); }

const mats = {};
function m(c) { return mats[c] || (mats[c] = toon(c)); }

export function weaponModel(id, rarity = 0) {
  const g = new THREE.Group();
  const box = (w, h, d, c, x, y, z) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m(c)); b.position.set(x, y, z); b.castShadow = true; g.add(b); return b; };
  const cyl = (r, l, c, x, y, z) => { const b = new THREE.Mesh(new THREE.CylinderGeometry(r, r, l, 8), m(c)); b.rotation.x = Math.PI / 2; b.position.set(x, y, z); g.add(b); return b; };
  const rc = RARITY[rarity].color;
  const muzzle = new THREE.Object3D();
  if (id === 'pickaxe') {
    const h = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.0, 6), m(0x7a4a24));
    h.position.set(0, 0, -0.35); h.rotation.x = Math.PI / 2; g.add(h);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.7, 0.1), m(0x9aa6b8)); head.position.set(0, 0, -0.8); g.add(head);
    const tip1 = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.2, 5), m(0xd8e0ea)); tip1.position.set(0, 0.42, -0.8); g.add(tip1);
    const tip2 = tip1.clone(); tip2.position.y = -0.42; tip2.rotation.x = Math.PI; g.add(tip2);
    muzzle.position.set(0, 0, -0.9);
  } else if (id === 'ar') {
    box(0.08, 0.14, 0.6, 0x3a3a3a, 0, 0.05, -0.2);
    box(0.07, 0.1, 0.3, 0x8a5a2a, 0, 0.02, 0.2);   // wood stock
    box(0.07, 0.08, 0.2, 0x8a5a2a, 0, 0.05, -0.45); // handguard
    cyl(0.02, 0.35, 0x222222, 0, 0.08, -0.7);
    const mag = box(0.05, 0.22, 0.08, 0x333333, 0, -0.1, -0.2); mag.rotation.x = 0.35;
    box(0.085, 0.03, 0.2, rc, 0, 0.13, -0.15);
    muzzle.position.set(0, 0.08, -0.9);
  } else if (id === 'smg') {
    box(0.08, 0.13, 0.45, 0x2a2a2a, 0, 0.05, -0.15);
    cyl(0.045, 0.35, 0x444444, 0, -0.03, -0.2); // helical mag
    cyl(0.02, 0.15, 0x111111, 0, 0.07, -0.45);
    box(0.04, 0.05, 0.25, 0x333333, 0, 0.04, 0.15);
    box(0.085, 0.03, 0.15, rc, 0, 0.12, -0.1);
    muzzle.position.set(0, 0.07, -0.55);
  } else if (id === 'shotgun') {
    box(0.09, 0.12, 0.4, 0x3a3a3a, 0, 0.05, -0.15);
    box(0.08, 0.12, 0.35, 0x7a4a24, 0, 0.0, 0.22);
    cyl(0.035, 0.6, 0x222222, 0, 0.09, -0.6);
    cyl(0.035, 0.3, 0x7a4a24, 0, 0.02, -0.55); // pump
    box(0.095, 0.03, 0.15, rc, 0, 0.12, -0.1);
    muzzle.position.set(0, 0.09, -0.92);
  } else if (id === 'sniper') {
    box(0.07, 0.12, 0.7, 0x6a4424, 0, 0.03, -0.1);
    cyl(0.02, 0.6, 0x222222, 0, 0.07, -0.7);
    cyl(0.04, 0.3, 0x111111, 0, 0.17, -0.1); // scope
    box(0.05, 0.18, 0.07, 0x222222, 0, -0.1, -0.15);
    box(0.075, 0.03, 0.2, rc, 0, 0.1, 0.1);
    muzzle.position.set(0, 0.07, -1.0);
  } else if (id === 'pistol') {
    box(0.06, 0.09, 0.26, 0x2a2a2a, 0, 0.06, -0.12);
    const gr = box(0.05, 0.16, 0.08, 0x5a3a20, 0, -0.04, 0.0); gr.rotation.x = -0.25;
    box(0.065, 0.02, 0.08, rc, 0, 0.11, -0.05);
    muzzle.position.set(0, 0.07, -0.27);
  } else if (id === 'lmg') {
    box(0.1, 0.15, 0.7, 0x2a2a2a, 0, 0.05, -0.25);
    box(0.08, 0.13, 0.35, 0x6a3a1a, 0, 0.02, 0.25);
    cyl(0.028, 0.5, 0x1a1a1a, 0, 0.08, -0.85);
    box(0.16, 0.14, 0.16, 0x3a4a2a, 0.1, -0.06, -0.2); // ammo box
    for (let i = 0; i < 5; i++) box(0.02, 0.03, 0.02, 0xd8a030, 0.06 - i * 0.025, 0.04 + i * 0.012, -0.22); // belt
    const bp1 = box(0.015, 0.2, 0.015, 0x222222, 0.05, -0.08, -0.85); bp1.rotation.z = 0.4;
    const bp2 = box(0.015, 0.2, 0.015, 0x222222, -0.05, -0.08, -0.85); bp2.rotation.z = -0.4;
    box(0.105, 0.03, 0.2, rc, 0, 0.14, -0.15);
    muzzle.position.set(0, 0.08, -1.1);
  } else if (id === 'obrez') {
    for (const x of [-0.03, 0.03]) cyl(0.032, 0.4, 0x222222, x, 0.07, -0.4);
    box(0.12, 0.1, 0.2, 0x3a3a3a, 0, 0.05, -0.12);
    const gr = box(0.07, 0.16, 0.12, 0x6a3a1a, 0, -0.04, 0.02); gr.rotation.x = -0.4;
    box(0.125, 0.03, 0.12, rc, 0, 0.1, -0.12);
    muzzle.position.set(0, 0.07, -0.62);
  } else if (id === 'rpg') {
    cyl(0.055, 1.0, 0x3a4a2a, 0, 0.1, -0.1);
    const war = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.3, 8), m(0x5a6a3a)); war.rotation.x = -Math.PI / 2; war.position.set(0, 0.1, -0.78); g.add(war);
    const wb = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), m(0x5a6a3a)); wb.scale.z = 1.3; wb.position.set(0, 0.1, -0.62); g.add(wb);
    box(0.05, 0.14, 0.06, 0x6a3a1a, 0, -0.02, -0.05);
    box(0.05, 0.14, 0.06, 0x6a3a1a, 0, -0.02, -0.3);
    box(0.04, 0.06, 0.12, 0x111111, -0.06, 0.18, -0.15);
    const flare = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.055, 0.12, 8), m(0x2a2a2a)); flare.rotation.x = Math.PI / 2; flare.position.set(0, 0.1, 0.45); g.add(flare);
    box(0.06, 0.03, 0.15, rc, 0, 0.17, 0.1);
    muzzle.position.set(0, 0.1, -0.95);
  } else if (id === 'bandage') {
    const r = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.1, 12), m(0xf4f0e8)); r.rotation.z = Math.PI / 2; g.add(r);
    box(0.02, 0.06, 0.2, 0xf4f0e8, 0, -0.07, -0.08);
    box(0.105, 0.03, 0.03, 0xe02020, 0, 0.0, 0);
  } else if (id === 'pelmeni') {
    const bowl = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), m(0xffffff)); bowl.position.y = 0.08; g.add(bowl);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.015, 5, 16), m(0x2050c0)); rim.rotation.x = Math.PI / 2; rim.position.y = 0.08; g.add(rim);
    for (let i = 0; i < 6; i++) { const p = new THREE.Mesh(new THREE.SphereGeometry(0.045, 6, 4), m(0xf6ecd0)); p.scale.set(1.3, 0.6, 1); p.position.set(Math.cos(i) * 0.07, 0.07, Math.sin(i) * 0.07); g.add(p); }
  } else if (id === 'vodka') {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.3, 10), new THREE.MeshToonMaterial({ color: 0x9ad8ff, transparent: true, opacity: 0.8 }));
    b.rotation.x = Math.PI / 2; b.position.z = -0.1; g.add(b);
    cyl(0.03, 0.12, 0xdddddd, 0, 0, -0.3);
    box(0.165, 0.1, 0.12, 0xd02020, 0, 0, -0.1);
  } else if (id === 'medkit') {
    box(0.35, 0.2, 0.25, 0xffffff, 0, 0, -0.1);
    box(0.36, 0.06, 0.08, 0xe02020, 0, 0.01, -0.1);
    box(0.08, 0.06, 0.26, 0xe02020, 0, 0.01, -0.1).position.y = 0.011;
  }
  g.add(muzzle);
  g.muzzle = muzzle;
  return g;
}

// ---------- Floor loot
export const loot = [];
let scene;
export function initLoot(sc) { scene = sc; for (const l of loot) scene.remove(l.obj); loot.length = 0; }

export function spawnLoot(item, pos) {
  const obj = new THREE.Group();
  const model = weaponModel(item.id, item.rarity);
  model.rotation.y = Math.PI / 2;
  model.scale.setScalar(1.3);
  obj.add(model);
  const glow = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, 0.05, 16), new THREE.MeshBasicMaterial({ color: RARITY[item.rarity].color, transparent: true, opacity: 0.55 }));
  glow.position.y = -0.5;
  obj.add(glow);
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.3, 2.5, 8, 1, true), new THREE.MeshBasicMaterial({ color: RARITY[item.rarity].color, transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide }));
  beam.position.y = 0.6;
  obj.add(beam);
  obj.position.copy(pos).add(new THREE.Vector3(0, 0.6, 0));
  scene.add(obj);
  const l = { item, obj, model, base: obj.position.y, t: rand(0, 6) };
  loot.push(l);
  return l;
}
export function removeLoot(l) { scene.remove(l.obj); const i = loot.indexOf(l); if (i >= 0) loot.splice(i, 1); }
export function updateLoot(dt) {
  for (const l of loot) { l.t += dt; l.model.rotation.y += dt; l.obj.position.y = l.base + Math.sin(l.t * 2) * 0.12; }
}
export function randomLootItem() { return makeItem(pick(LOOT_TABLE)); }
