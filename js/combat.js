import * as THREE from 'three';
import { G } from './state.js';
import { rand, pick, clamp } from './util.js';
import { heightAt, normalAt, world, circlesNear, damageTree } from './world.js';
import { pieceMeshes, pieces, damagePiece, resolveCircle, supportAt, ceilingAt } from './structures.js';
import { Character, meshOwner } from './character.js';
import { Ragdoll } from './ragdoll.js';
import { weaponModel, itemDamage, makeItem, spawnLoot } from './weapons.js';
import * as gore from './gore.js';
import { tracer, muzzleFlash, puff, explosionFx, shieldSpark } from './fx.js';
import { play } from './audio.js';

const ray = new THREE.Raycaster();
const _v = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

export function damageMultiplier(info) {
  if (info.fall || info.storm || info.explosive) return 1;
  return info.part === 'head' ? 2 : info.part === 'torso' ? 1 : 0.85;
}

function marchTerrain(o, d, max) {
  let prev = 0;
  const step = max > 60 ? 1.5 : 1.0;
  for (let t = 0.5; t < max; t += step) {
    const y = o.y + d.y * t;
    if (y < heightAt(o.x + d.x * t, o.z + d.z * t)) {
      let a = prev, b = t;
      for (let i = 0; i < 8; i++) { const m = (a + b) / 2; if (o.y + d.y * m < heightAt(o.x + d.x * m, o.z + d.z * m)) b = m; else a = m; }
      return b;
    }
    prev = t;
  }
  return Infinity;
}

function bodiesNear(origin, dir, range, ignore, includeCorpses, out) {
  const test = (c) => {
    _v.copy(c.pos).y += 1; _v.sub(origin);
    const t = _v.dot(dir);
    if (t < -2 || t > range + 2) return;
    if (_v.addScaledVector(dir, -t).lengthSq() > 4) return;
    for (const m of c.char.hitMeshes) if (!m.userData.gone) out.push(m);
  };
  for (const c of G.combatants) {
    if (c === ignore || !c.char || c.char.gibbed || !c.alive || c.state === 'bus') continue;
    test(c);
  }
  if (includeCorpses) for (const c of G.corpses) if (c !== ignore && !c.char.gibbed) test(c);
}

// Hitscan against everything. Returns {dist, point, normal, type, ...}
export function castRay(origin, dir, range, ignore = null, includeCorpses = true) {
  let best = { dist: range, type: null };
  const targets = [];
  bodiesNear(origin, dir, range, ignore, includeCorpses, targets);
  ray.set(origin, dir); ray.far = range;
  const hits = ray.intersectObjects(targets.length ? [...targets, ...pieceMeshes, ...world.raycastables] : [...pieceMeshes, ...world.raycastables], false);
  for (const h of hits) {
    if (h.distance >= best.dist) break;
    const ud = h.object.userData;
    if (ud.type === 'tree' && h.instanceId !== undefined && !world.trees[h.instanceId]?.alive) continue;
    const n = h.face ? h.face.normal.clone().transformDirection(h.object.matrixWorld) : dir.clone().negate();
    if (ud.part) best = { dist: h.distance, point: h.point, normal: n, type: 'char', mesh: h.object, part: ud.part, target: meshOwner.get(h.object).owner };
    else if (ud.type === 'piece') best = { dist: h.distance, point: h.point, normal: n, type: 'piece', piece: ud.piece };
    else if (ud.type === 'tree') best = { dist: h.distance, point: h.point, normal: n, type: 'tree', id: h.instanceId };
    else best = { dist: h.distance, point: h.point, normal: n, type: 'rock' };
    break;
  }
  const td = marchTerrain(origin, dir, best.dist);
  if (td < best.dist) {
    const p = origin.clone().addScaledVector(dir, td);
    best = { dist: td, point: p, normal: normalAt(p.x, p.z), type: 'terrain' };
  }
  if (!best.point) best.point = origin.clone().addScaledVector(dir, range);
  return best;
}

// Blood sprayed onto whatever is behind the victim
function exitSplatter(point, dir, target, power) {
  const o = point.clone().addScaledVector(dir, 0.6);
  const h = castRay(o, dir, 3 + 3 * power, target, false);
  if (h.type && h.type !== 'char') {
    const s = rand(1.0, 2.0) * Math.min(2, power) * (1 - h.dist / 12);
    gore.decal(h.point, h.normal, Math.max(0.5, s), Math.abs(h.normal.y) > 0.7 ? 'splat' : 'spray');
  }
}

// Find where a bullet leaves the body part, add a torn exit wound there
const _exitRay = new THREE.Raycaster();
function exitWound(char, info, power) {
  const far = info.point.clone().addScaledVector(info.dir, 1.2);
  _exitRay.set(far, info.dir.clone().negate()); _exitRay.far = 1.25;
  const meshes = char.hitMeshes.filter(m => m.userData.part === info.part && !m.userData.gone);
  const h = _exitRay.intersectObjects(meshes, false)[0];
  if (!h || h.point.distanceTo(info.point) < 0.08) return;
  const n = h.face.normal.clone().transformDirection(h.object.matrixWorld);
  char.addWound(h.object, h.point, n, 0.26 + power * 0.12, true, true);
  gore.hitSpray(h.point, info.dir, power * 1.2);
}

// Gore that happens whether the victim is alive or already a corpse
function applyGore(self, info, flesh, wasAlive) {
  const C = self.char;
  const part = info.part;
  const g = info.gore || 1;
  const power = clamp(flesh / 26, 0.3, 3.5) * (0.7 + g * 0.45);
  if (info.point && flesh > 0.5 && info.mesh && !info.fall && !info.explosive) {
    C.addWound(info.mesh, info.point, info.normal, 0.2 + power * 0.09, g >= 2 || flesh > 40);
    gore.hitSpray(info.point, info.dir, power);
    if (info.weapon !== 'pickaxe' && info.weapon !== 'bear' && (self.isPlayer || g >= 1.0 || Math.random() < 0.7)) exitWound(C, info, power);
    exitSplatter(info.point, info.dir, self, power);
    if (Math.random() < 0.8) gore.groundSplat(self.pos.x + rand(-0.6, 0.6) + info.dir.x * 1.2, self.pos.z + rand(-0.6, 0.6) + info.dir.z * 1.2, rand(0.6, 1.4) * power, self.pos.y + 1);
    if (g >= 1.0 && flesh > 12) gore.chunks(info.point, Math.ceil(power * 4), info.dir, 4);
    if (part === 'head' && flesh > 10) gore.chunks(info.point, 6, info.dir, 5);
    if ((part === 'head' || part === 'torso') && Math.random() < 0.6) gore.artery(info.point, info.normal, 0.6 + power * 0.25);
    C.soak(0.07 * power);
    C.flinch(info.dir, part, power * (wasAlive ? 1.2 : 2));
    play('flesh', { pos: self.isPlayer ? null : info.point, vol: 0.6 + power * 0.2 });
    if (power > 1.6) play('splat', { pos: self.isPlayer ? null : info.point, vol: 0.4 + power * 0.15 });
    self.bleed = Math.min(30, self.bleed + flesh * 0.14);
    nearCamBlood(info.point, power);
  }
  if (!info.point || info.fall) return;
  self.partDmg[part] = (self.partDmg[part] || 0) + flesh;
  const pd = self.partDmg[part];
  if (part === 'head' && pd > 50) C.crackSkull();
  if (part === 'torso' && pd > 65) { if (!C.missing.gutted) gore.chunks(info.point, 7, info.dir, 3); C.openTorso(); }
  if (part !== 'head' && part !== 'torso') {
    const lim = wasAlive ? (g >= 2 ? 60 : 100) : 35;
    if (pd >= lim) sever(self, part, info.dir);
  }
  if (part === 'head' && !wasAlive && pd > 80 && !C.missing.head) { gore.headExplode(C, info.dir); play('crunch', { pos: info.point }); }
}

// gore that happens right in front of the camera paints the screen
function nearCamBlood(p, power) {
  const cam = G.camera; if (!cam || !p) return;
  const d = cam.position.distanceTo(p);
  if (d < 5) G.events.screenBlood?.(power * (1 - d / 5) * 1.5);
}

function sever(self, part, dir) {
  const C = self.char;
  const limb = C.dismember(part);
  if (!limb) return;
  gore.gib(limb, dir.clone().multiplyScalar(rand(3, 6)).add(_v.set(rand(-2, 2), rand(2, 5), rand(-2, 2))), 5, 0.2, 9);
  const st = C.stumps[C.stumps.length - 1];
  if (st) gore.fountain(st.obj, 7, 1.3);
  gore.chunks(limb.position, 10, dir, 3);
  gore.mist(limb.position, 1.3, 4);
  gore.hitSpray(limb.position, dir, 2);
  nearCamBlood(limb.position, 2);
  play('crunch', { pos: self.isPlayer ? null : limb.position, vol: 1 });
  play('splat', { pos: self.isPlayer ? null : limb.position, vol: 0.9 });
  if (self.alive && Math.random() < 0.7) play('scream', { pos: self.isPlayer ? null : self.pos, vol: 0.8 });
}

// ---- RPG rockets
const rockets = [];
let rocketGeo, rocketMat, flameMat;
export function resetRockets() { for (const r of rockets) G.scene?.remove(r.obj); rockets.length = 0; }
function fireRocket(owner, muzzle, dir, dmg, eye) {
  if (!rocketGeo) {
    rocketGeo = new THREE.ConeGeometry(0.09, 0.5, 8).rotateX(-Math.PI / 2);
    rocketMat = new THREE.MeshToonMaterial({ color: 0x4a5a2a });
    flameMat = new THREE.MeshBasicMaterial({ color: 0xffb040 });
  }
  const obj = new THREE.Group();
  obj.add(new THREE.Mesh(rocketGeo, rocketMat));
  const fl = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 4), flameMat); fl.position.z = 0.35; fl.scale.z = 2; obj.add(fl);
  // start on the aim line so it goes where the crosshair points
  const start = eye.clone().addScaledVector(dir, 1.2);
  obj.position.copy(start);
  obj.lookAt(start.clone().add(dir));
  G.scene.add(obj);
  rockets.push({ obj, pos: start, vel: dir.clone().multiplyScalar(70), owner, dmg, life: 6 });
}
export function updateRockets(dt) {
  for (let i = rockets.length - 1; i >= 0; i--) {
    const r = rockets[i];
    r.life -= dt;
    r.vel.y -= 2.5 * dt;
    const step = r.vel.length() * dt;
    const dir = r.vel.clone().normalize();
    const h = castRay(r.pos, dir, step, r.owner, true);
    if (!h.type && r.pos.y < heightAt(r.pos.x, r.pos.z)) { h.type = 'terrain'; h.point = r.pos.clone(); h.normal = UP; }
    if (h.type || r.life <= 0) {
      explode(h.type ? h.point.clone().addScaledVector(h.normal || dir.clone().negate(), 0.2) : r.pos.clone(), r.owner, r.dmg);
      G.scene.remove(r.obj); rockets.splice(i, 1); continue;
    }
    r.pos.addScaledVector(dir, step);
    r.obj.position.copy(r.pos);
    r.obj.lookAt(r.pos.clone().add(dir));
    if (Math.random() < 0.8) puff(r.pos.clone().addScaledVector(dir, -0.4), 0xdddddd, 0.6);
  }
}
export function explode(p, attacker, dmg = 160, R = 7) {
  explosionFx(p, R);
  play('explosion', { pos: p, vol: 1.6 });
  play('splat', { pos: p, vol: 0.8, rate: 0.8 });
  const cam = G.camera;
  const cd = cam ? cam.position.distanceTo(p) : 99;
  if (G.player && cd < 40) G.player.shake = Math.max(G.player.shake || 0, 0.7 * (1 - cd / 40));
  const damagedMounts = new Set();
  for (const c of G.combatants) {
    if (!c.alive || !c.char || c.state === 'bus') continue;
    if (c.animal && damagedMounts.has(c)) continue;
    if (attacker && c !== attacker && c.team === attacker.team) continue;
    const center = c.pos.clone().add(_v.set(0, 1.1, 0));
    const d = center.distanceTo(p);
    if (d > R) continue;
    const mount = c.riding?.alive ? c.riding : null;
    if (mount) damagedMounts.add(mount);
    const k = 1 - d / R;
    const dir = center.clone().sub(p).normalize();
    if (d < 0.001) dir.set(0, 1, 0);
    c.vel.addScaledVector(dir, 14 * k).y += 6 * k;
    if (mount) mount.vel.addScaledVector(dir, 14 * k).y += 6 * k;
    const bleedTarget = mount || c;
    bleedTarget.bleed = Math.min(30, bleedTarget.bleed + 12 * k);
    c.hurt({ dmg: dmg * k * k + 10 * k, part: 'torso', point: center.clone().addScaledVector(dir, -0.3), normal: dir.clone().negate(), dir, weapon: 'rpg', gore: 4, attacker, explosive: true, dist: d });
    // shrapnel wounds even if they survive
    if (c.alive && c.char && k > 0.2) {
      for (const m of c.char.hitMeshes) if (!m.userData.gone && Math.random() < 0.12 * k) {
        m.updateMatrixWorld(); const wp = new THREE.Vector3().setFromMatrixPosition(m.matrixWorld);
        const n = wp.clone().sub(p).normalize().negate();
        c.char.addWound(m, wp.addScaledVector(n, 0.12), n, rand(0.12, 0.25), Math.random() < 0.5);
      }
      c.char.soak(0.25 * k);
      if (k > 0.55) for (const part of ['armL', 'armR', 'legL', 'legR']) if (Math.random() < 0.3 * k) sever(c, part, dir);
    }
  }
  for (const c of G.corpses) {
    if (c.char.gibbed) continue;
    const d = c.pos.distanceTo(p);
    if (d < R * 0.75) { gore.explodeBody(c.char, c.pos.clone().sub(p).normalize().setY(0.6), c.pos.clone().add(_v.set(0, 0.5, 0))); }
  }
  for (const pc of [...pieces]) {
    const b = pc.mesh.position; const d = b.distanceTo(p);
    if (d < R) damagePiece(pc, 220 * (1 - d / R));
  }
  for (const t of world.trees) if (t.alive && Math.hypot(t.x - p.x, t.z - p.z) < R * 0.6 && Math.abs(t.y - p.y) < 8) damageTree(t.id, 200);
  gore.groundSplat(p.x, p.z, 2.5, p.y + 1);
}

const NAMES = ['Vladimir_2009', 'xX_Boris_Xx', 'Sergei_Sweat', 'DmitriTTV', 'Babushka_Sniper', 'Igor_No_Scope', 'Anatoly', 'KGB_Agent_47', 'Slav_Squatter', 'Pavel.exe',
  'Olga_Destroyer', 'CykaBlyat99', 'Gopnik_Gary', 'Nikolai_Tesla', 'Yuri_Bot', 'Natasha_Frag', 'BORSCHT_KING', 'Sasha_Sweats', 'Ivan_Drago', 'Mikhail_Default',
  'Kolya_Crank90s', 'Adidas_Andrei', 'Vodka_Vasily', 'Tractor_Timur', 'Lada_Lord', 'Semechki_Sam', 'Putinka_Pete', 'Balalaika_Bob',
  'Squat_Master_3000', 'Uncle_Fyodor', 'Kvass_Enjoyer', 'Chernobyl_Chad', 'Glowing_Gleb', 'Babushka_Bullet', 'Pelmeni_Pasha', 'Mayonnaise_Misha',
  'Dacha_Dmitri', 'Ushanka_Ulyana', 'Cheburashka_Main', 'Tetris_Timofey', 'Bear_Rider_Boris', 'Samovar_Stas', 'Gulag_Graduate'];
export const botName = (i) => NAMES[i % NAMES.length] + (i >= NAMES.length ? i : '');

// A body left behind after death: still hittable, still bleeds, can be taken apart
export class Corpse {
  constructor(c) {
    this.char = c.char; this.char.owner = this; this.char.dead = true;
    this.name = c.name; this.isPlayer = false; this.isCorpse = true; this.alive = false;
    this.pos = c.pos.clone(); this.vel = new THREE.Vector3(0, Math.min(0, c.vel.y), 0);
    this.deathYaw = c.yaw; this.deathFall = c.deathFall; this.corpseT = 0; this.age = 0; this.buckle = 0;
    const di = c.deathInfo || {};
    // head deaths crumple straight down; big hits topple fast
    this.buckleDur = di.part === 'head' ? rand(0.35, 0.55) : di.explosive || di.weapon === 'sniper' || di.weapon === 'shotgun' || di.weapon === 'obrez' ? 0.12 : rand(0.25, 0.5);
    this.partDmg = { ...c.partDmg }; this.bleed = c.bleed + 4;
    this.char.setWeapon(null);
    if (c.glider) c.glider.visible = false;
    // The ragdoll starts from the exact pose at the moment of death.
    // Bears have a different skeleton and keep their quadruped collapse.
    this.ragdoll = !this.char.quadruped && !this.char.gibbed
      ? new Ragdoll(this.char, c.vel, di) : null;
    G.corpses.push(this);
    if (G.corpses.length > 28) { const o = G.corpses.shift(); G.scene.remove(o.char.root); }
  }
  hurt(info) {
    applyGore(this, info, info.dmg * (info.part === 'head' ? 2 : 1), false);
    if (this.ragdoll && info.point && info.dir) this.ragdoll.impulse(info.point, info.dir, info.dmg);
  }
  update(dt) {
    const C = this.char;
    this.age += dt;
    if (this.ragdoll && !C.gibbed) {
      this.ragdoll.step(dt);
      this.ragdoll.apply();
      const hips = this.ragdoll.pts.pelvis.p;
      this.pos.set(hips.x, hips.y - 1, hips.z);
      if (!this.thud && this.age > 0.2 && hips.y < heightAt(hips.x, hips.z) + 0.6) {
        this.thud = true;
        gore.groundSplat(hips.x, hips.z, rand(1, 1.8), hips.y + 0.5);
      }
      this.bleedCorpse(dt);
      return;
    }
    const gy = Math.max(heightAt(this.pos.x, this.pos.z), supportAt(this.pos.x, this.pos.z, this.pos.y));
    if (this.pos.y > gy) { this.vel.y -= 26 * dt; this.pos.y = Math.max(gy, this.pos.y + this.vel.y * dt); }
    this.buckle = Math.min(1, this.age / this.buckleDur);
    if (this.age > this.buckleDur * 0.7) this.corpseT = Math.min(1, this.corpseT + dt * (1.2 + this.corpseT * 3)); // accelerate like falling weight
    const t = this.corpseT, e = t * t;
    C.root.position.copy(this.pos);
    C.root.rotation.set(0, this.deathYaw, 0);
    const back = new THREE.Vector3(0, 0, 1).applyAxisAngle(UP, this.deathYaw);
    const forward = this.deathFall ? (back.dot(this.deathFall) > 0 ? 1 : -1) : 1;
    if (C.quadruped) { this.deadSide = this.deadSide || (Math.random() < 0.5 ? -1 : 1); C.root.rotation.z = this.deadSide * e * Math.PI / 2 * 0.95; C.root.position.y = this.pos.y + 0.5 * e; }
    else { C.root.rotateX(-forward * e * Math.PI / 2 * 0.97); C.root.position.y = this.pos.y + 0.14 * e; }
    if (t >= 1 && !this.thud) { this.thud = true; gore.groundSplat(this.pos.x, this.pos.z, rand(1, 1.8), this.pos.y + 1); }
    C.animateDead(dt, e, this.buckle, this.age);
    C.update(dt);
    this.bleedCorpse(dt);
  }
  bleedCorpse(dt) {
    const C = this.char;
    if (this.bleed > 0) {
      this.bleed -= dt * 0.4;
      const pts = []; C.bleedPoints(dt, pts);
      for (const p of pts) gore.drip(p);
      // heart keeps pumping for a few seconds
      if (this.age < 6 && pts.length && Math.random() < 0.5) gore.artery(pts[0], UP, 0.35 * (1 - this.age / 6));
    }
  }
}

export class Combatant {
  constructor(name, isPlayer = false, charOpts, team = 0) {
    this.name = name;
    this.isPlayer = isPlayer;
    this.team = team;
    this.charOpts = charOpts || {};
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0; this.pitch = 0;
    this.lives = 1;
    this.kills = 0;
    this.makeBody();
    this.resetStats();
    this.wood = isPlayer ? 60 : 200;
  }

  makeBody() {
    this.char = new Character(this.charOpts);
    this.charOpts.outfit = this.char.outfit; // keep look on respawn
    this.char.owner = this;
    G.scene.add(this.char.root);
    if (this.onBody) this.onBody();
  }

  resetStats() {
    this.hp = 100; this.shield = 0;
    this.alive = true;
    this.state = 'bus';
    this.grounded = false;
    this.slots = [makeItem('pickaxe', 0), null, null, null, null];
    this.sel = 0;
    this.fireT = 0; this.reloadT = 0; this.spread = 0; this.useT = 0;
    this.partDmg = { head: 0, torso: 0, armL: 0, armR: 0, legL: 0, legR: 0 };
    this.bleed = 0;
    this.lastHurt = -10;
    this.speedNow = 0; this.airTime = 0;
    this.crouch = false; this.coyote = 0; this.jumpBuf = 0; this.landT = 0; this.stagger = 0;
    this.switchT = 0;
    this.skyTilt = 0;
    this.equip(0);
  }

  // Reload mode: new body drops from the sky
  respawn(pos) {
    this.makeBody();
    this.resetStats();
    this.pos.copy(pos);
    this.vel.set(0, -5, 0);
    this.state = 'sky';
    this.airTime = 2;
    this.slots[1] = makeItem(pick(['ar', 'smg', 'shotgun']), 0);
    this.equip(1);
    this.char.root.visible = true;
  }

  get item() { return this.slots[this.sel]; }
  get height() { return this.crouch ? 1.45 : 2.05; }
  equip(i) {
    if (!this.slots[i] || !this.char) return;
    const changed = i !== this.sel || !this.char.weaponModel;
    this.sel = i;
    this.reloadT = 0; this.useT = 0;
    const it = this.slots[i];
    this.char.setWeapon(weaponModel(it.id, it.rarity));
    if (changed) { this.switchT = 1; this.fireT = Math.max(this.fireT, G.time + 0.28); }
  }
  give(item) {
    if (item.def.kind === 'heal') {
      const s = this.slots.find(s => s && s.id === item.id);
      if (s) { s.count += item.count; return true; }
    }
    let i = this.slots.indexOf(null);
    if (i < 0) {
      if (this.sel === 0) return false;
      i = this.sel;
      spawnLoot(this.slots[i], this.pos.clone());
    }
    this.slots[i] = item;
    if (i === this.sel || this.sel === 0) { this.sel = -1; this.equip(i); }
    return true;
  }

  muzzleWorld() {
    const mz = this.char.weaponModel?.muzzle;
    if (!mz) return this.pos.clone().add(_v.set(0, 1.5, 0));
    mz.updateMatrixWorld(true);
    return new THREE.Vector3().setFromMatrixPosition(mz.matrixWorld);
  }

  // Fire toward aimDir from eye origin (player: camera). Returns true if fired.
  tryFire(eye, aimDir) {
    const it = this.item;
    if (!it || !this.alive || G.time < this.fireT || this.reloadT > 0 || this.state !== 'ground') return false;
    const d = it.def;
    if (d.kind === 'melee') return this.melee(eye, aimDir, it);
    if (d.kind === 'heal') { if (this.useT <= 0) { this.useT = d.use; this.useDur = d.use; } return false; }
    if (it.ammo <= 0) { this.startReload(); return false; }
    this.fireT = G.time + d.rate;
    it.ammo--;
    this.char.fire(d.kick || 0.6);
    const muzzle = this.muzzleWorld();
    muzzleFlash(muzzle);
    play(d.sound, { pos: this.isPlayer ? null : this.pos, vol: this.isPlayer ? 0.7 : 1, maxDur: d.sound === 'ar' ? 0.45 : 1.4 });
    const missing = (this.char.missing.armL ? 1 : 0) + (this.char.missing.armR ? 1 : 0);
    const moving = this.speedNow > 1 ? (this.crouch ? 1.2 : 1.6) : 1;
    let sp = (d.spread + this.spread) * moving * (1 + missing) * (this.aiming && d.zoom ? 0.1 : this.aiming ? 0.6 : 1) * (this.crouch ? 0.7 : 1);
    if (!this.grounded) sp *= 1.8;
    this.spread = Math.min(d.maxSpread, this.spread + d.bloom);
    const dmgBase = itemDamage(it);
    if (d.rocket) {
      fireRocket(this, muzzle, aimDir.clone().add(_v.set(rand(-1, 1), rand(-1, 1), rand(-1, 1)).multiplyScalar(sp)).normalize(), dmgBase, eye);
      if (this.isPlayer) { this.fireT = G.time + 0.25; this.startReload(); }
      return true;
    }
    for (let k = 0; k < d.pellets; k++) {
      const dir = aimDir.clone().add(_v.set(rand(-1, 1), rand(-1, 1), rand(-1, 1)).multiplyScalar(sp)).normalize();
      const h = castRay(eye, dir, d.range, this);
      if (Math.random() < (d.pellets > 1 ? 0.4 : 0.85)) tracer(muzzle, h.point);
      this.applyHit(h, dir, dmgBase, it);
    }
    if (it.ammo <= 0 && this.isPlayer) this.fireT = G.time + 0.25, this.startReload();
    return true;
  }

  melee(eye, aimDir, it) {
    this.fireT = G.time + it.def.rate;
    this.char.melee();
    const reach = this.isPlayer ? it.def.range + 3.5 : it.def.range + 1;
    const h = castRay(eye, aimDir, reach, this);
    if (!h.type || h.dist > reach) return true;
    const p = h.point;
    if (h.type === 'char' && h.target) {
      if (h.target.pos.distanceTo(this.pos) > 3.5) return true;
      this.applyHit(h, aimDir, it.def.dmg, it);
      play('flesh', { pos: p, vol: 0.9 });
    } else if (h.type === 'tree') {
      damageTree(h.id, 50);
      this.wood = Math.min(999, this.wood + 10);
      puff(p, 0x8a5a2b, 0.7);
      play('pickaxe', { pos: this.isPlayer ? null : p, vol: 0.8 });
    } else if (h.type === 'piece') {
      damagePiece(h.piece, 50);
      this.wood = Math.min(999, this.wood + (h.piece.matName === 'wood' ? 5 : 8));
      puff(p, 0xb07040, 0.7);
      play('pickaxe', { pos: this.isPlayer ? null : p, vol: 0.8 });
    } else {
      puff(p, 0xaaaaaa, 0.6);
      play('pickaxe', { pos: this.isPlayer ? null : p, vol: 0.5, rate: 1.3 });
    }
    return true;
  }

  applyHit(h, dir, dmg, it) {
    if (!h.type) return;
    const d = it.def;
    if (h.type === 'char') {
      const t = h.target;
      if (t.alive && t.team === this.team && t !== this) { puff(h.point, 0x60c0ff, 0.3); return; } // no friendly fire
      let falloff = 1;
      if (d.pellets > 1) falloff = clamp(1.3 - h.dist / 25, 0.25, 1);
      t.hurt({ dmg: dmg * falloff, part: h.part, point: h.point, normal: h.normal, dir, weapon: it.id, gore: (d.gore || 1) * (d.pellets > 1 ? falloff : 1), attacker: this, mesh: h.mesh, dist: h.dist });
    } else if (h.type === 'piece') {
      damagePiece(h.piece, dmg * (it.id === 'sniper' ? 1 : 0.8));
      puff(h.point, 0xb08050, 0.5);
    } else if (h.type === 'tree') {
      damageTree(h.id, dmg * 0.4);
      puff(h.point, 0x7a5a3a, 0.5);
    } else {
      puff(h.point, h.type === 'terrain' ? 0xc8b890 : 0xaaaaaa, 0.6);
    }
  }

  startReload() {
    const it = this.item;
    if (!it || it.def.kind !== 'gun' || it.ammo >= it.def.mag || this.reloadT > 0) return;
    this.reloadT = it.def.reload;
  }

  // ---- DAMAGE
  hurt(info) {
    if (!this.alive) return;
    if (info.attacker && info.attacker !== this) this.lastAttacker = info.attacker;
    const part = info.part;
    const dmg = info.dmg * damageMultiplier(info);
    let hpDmg = dmg;
    // shield always soaks first: bullets, blasts, falls, storm
    if (this.shield > 0) {
      const a = Math.min(this.shield, dmg);
      this.shield -= a; hpDmg = dmg - a;
      if (info.point) shieldSpark(info.point, info.dir, this.shield <= 0);
      if (this.shield <= 0 && this.isPlayer) G.events.shieldBreak?.();
    }
    this.hp -= hpDmg;
    this.lastHurt = G.time;
    if (!info.storm) this.stagger = Math.min(0.35, 0.08 + dmg / 150);
    if (this.useT > 0 && !info.storm) this.useT = 0; // interrupted
    if (this.isPlayer) G.events.playerHurt(hpDmg, dmg - hpDmg, info);
    if (info.attacker?.isPlayer) G.events.hitmarker(part === 'head', this.hp <= 0, dmg, info.point, this.shield > 0 || hpDmg < dmg);
    if (info.storm) return this.checkDeath(info);
    if (hpDmg <= 0.5 && info.dir && this.char) this.char.flinch(info.dir, part, 0.3);
    if (this.isPlayer && hpDmg > 0.5 && info.point && (part === 'armL' || part === 'armR')) this.vm?.addWound(part, hpDmg);
    applyGore(this, info, hpDmg, true);
    this.checkDeath(info);
  }

  checkDeath(info) {
    if (!this.alive || this.hp > 0) return;
    this.hp = 0;
    this.alive = false;
    this.deathInfo = info;
    const C = this.char;
    const dir = info.dir || new THREE.Vector3(0, -1, 0);
    const center = this.pos.clone().add(_v.set(0, 1.2, 0));
    const VERB = { ar: ['Kalashnikov\'d', 'sent to Siberia', 'shot'], smg: ['Bizon\'d', 'perforated'], pistol: ['Makarov\'d', 'shot'], lmg: ['PKM\'d into swiss cheese', 'shredded'],
      sniper: ['Dragunov\'d', 'sniped from Moscow'], shotgun: ['pumped', 'shotgunned'], obrez: ['obrez\'d'], rpg: ['RPG\'d'], pickaxe: ['pickaxed'], bear: ['mauled', 'hugged to death', 'eaten alive', 'unzipped'] };
    let how = pick(VERB[info.weapon] || ['shot']);
    if (info.fall) {
      how = 'splattered';
      if (info.impact > 32) { gore.explodeBody(C, new THREE.Vector3(0, 0.3, 0), this.pos.clone().add(_v.set(0, 0.5, 0))); how = 'turned into borscht'; }
      else { C.breakLeg('L'); C.breakLeg('R'); C.openTorso(); gore.chunks(center, 10, UP, 3, true); }
      play('crunch', { pos: this.isPlayer ? null : this.pos, vol: 1.2 });
    } else if (info.storm) {
      how = 'melted by storm';
    } else if (info.bleedOut) {
      how = pick(['bled out', 'bled out like borscht', 'ran out of blood']);
      C.openTorso();
    } else if (info.explosive) {
      if (info.dmg > 55) { gore.explodeBody(C, dir, center); how = pick(['RPG\'d into pelmeni', 'turned into red mist', 'sent to space (partially)']); }
      else { for (const p of ['armL', 'armR', 'legL', 'legR']) if (Math.random() < 0.5) sever(this, p, dir); C.openTorso(); how = 'blown apart'; }
      play('crunch', { pos: this.isPlayer ? null : this.pos, vol: 1.3 });
    } else if (info.weapon === 'obrez' && info.dist < 6) {
      if (info.part === 'head') { gore.headExplode(C, dir); how = 'head deleted by obrez'; }
      else { gore.explodeBody(C, dir, info.point || center); how = 'obrez\'d to bits'; }
      play('crunch', { pos: this.isPlayer ? null : this.pos, vol: 1.3 });
    } else if (info.weapon === 'shotgun' && info.dist < 7 && info.part !== 'head' || info.weapon === 'sniper' && info.part === 'torso' && Math.random() < 0.4) {
      gore.explodeBody(C, dir, info.point || center); how = 'blown to pieces';
      play('crunch', { pos: this.isPlayer ? null : this.pos, vol: 1.3 });
    } else if (info.part === 'head' && (info.weapon === 'sniper' || info.weapon === 'shotgun' || info.dmg >= 45 || Math.random() < 0.35)) {
      gore.headExplode(C, dir); how = 'head popped';
      play('crunch', { pos: this.isPlayer ? null : this.pos, vol: 1.2 });
    } else if (info.weapon === 'pickaxe') {
      how = 'pickaxed'; C.crackSkull(); C.openTorso();
    }
    if (!C.gibbed) {
      gore.bloodPool(this.pos.x, this.pos.z, rand(3, 4.6), this.pos.y + 1);
      gore.bloodPool(this.pos.x + this.deathFallGuess(dir).x * 1.2, this.pos.z + this.deathFallGuess(dir).z * 1.2, rand(1.8, 2.8), this.pos.y + 1);
      if (Math.random() < 0.5) play('scream', { pos: this.isPlayer ? null : this.pos, vol: 0.9, rate: 0.8 });
    }
    for (let i = 1; i < 5; i++) if (this.slots[i]) {
      spawnLoot(this.slots[i], this.pos.clone().add(_v.set(rand(-1.5, 1.5), 0, rand(-1.5, 1.5))));
      this.slots[i] = null;
    }
    this.deathFall = dir.clone().setY(0).normalize();
    this.lives--;
    this.corpse = new Corpse(this);
    this.char = null;
    if (info.attacker && info.attacker !== this) info.attacker.kills++;
    G.events.kill(info.attacker, this, how, info.weapon);
  }

  deathFallGuess(dir) { return dir.clone().setY(0).normalize(); }

  // shield first, then health; used for bleeding
  drain(amount) {
    if (!this.alive) return;
    const a = Math.min(this.shield, amount);
    this.shield -= a; this.hp -= amount - a;
    if (this.hp <= 0) this.checkDeath({ bleedOut: true, attacker: this.lastAttacker || null, part: 'torso', dir: new THREE.Vector3(0, -1, 0) });
  }

  // ---- PHYSICS
  physics(dt, wish, jump, sprint) {
    const g = 26;
    const C = this.char;
    const legs = (C.missing.legL ? 1 : 0) + (C.missing.legR ? 1 : 0);
    const broken = (C.missing.brokenL ? 1 : 0) + (C.missing.brokenR ? 1 : 0);
    if (jump) this.jumpBuf = 0.15; else this.jumpBuf = Math.max(0, this.jumpBuf - dt);
    this.landT = Math.max(0, this.landT - dt * 3.2);
    this.stagger = Math.max(0, this.stagger - dt);
    if (this.state === 'sky') {
      this.vel.y = Math.max(-42, this.vel.y - g * dt);
      this.vel.x += (wish.x * 22 - this.vel.x) * dt * 2;
      this.vel.z += (wish.z * 22 - this.vel.z) * dt * 2;
      const gh = heightAt(this.pos.x, this.pos.z);
      if (this.pos.y - gh < 70 || jump && this.airTime > 1) this.state = 'glide';
      this.airTime += dt;
      this.crouch = false;
    } else if (this.state === 'glide') {
      this.vel.y += (-8 - this.vel.y) * dt * 3;
      this.vel.x += (wish.x * 15 - this.vel.x) * dt * 1.5;
      this.vel.z += (wish.z * 15 - this.vel.z) * dt * 1.5;
    } else {
      let speed = this.crouch ? 3.6 : sprint ? 9.2 : 6.6;
      speed *= 1 - broken * 0.25;
      speed *= [1, 0.45, 0.25][legs];
      if (this.useT > 0) speed *= 0.45;
      speed *= 1 - this.landT * 0.45 - this.stagger * 1.2;
      const wantX = wish.x * speed, wantZ = wish.z * speed;
      if (this.grounded) {
        // snappy accel, slightly heavier decel for weight
        const acc = wish.lengthSq() > 0 ? 16 : 11;
        const k = 1 - Math.exp(-acc * dt);
        this.vel.x += (wantX - this.vel.x) * k;
        this.vel.z += (wantZ - this.vel.z) * k;
      } else {
        const k = 1 - Math.exp(-3 * dt);
        this.vel.x += (wantX - this.vel.x) * k * (wish.lengthSq() > 0 ? 1 : 0.2);
        this.vel.z += (wantZ - this.vel.z) * k * (wish.lengthSq() > 0 ? 1 : 0.2);
      }
      this.vel.y -= g * dt;
      if (this.jumpBuf > 0 && (this.grounded || this.coyote > 0) && legs < 2) {
        this.vel.y = 9.2 * (broken ? 0.6 : 1) * (this.crouch ? 0.85 : 1);
        this.grounded = false; this.coyote = 0; this.jumpBuf = 0;
        this.jumped = true;
      }
    }
    const prevVy = this.vel.y;
    this.pos.addScaledVector(this.vel, dt);
    const r = 0.42;
    resolveCircle(this.pos, r, this.height);
    for (const c of circlesNear(this.pos.x, this.pos.z)) {
      if (c.kind === 'rock' && this.pos.y > c.top) continue;
      if (c.kind === 'tree' && this.pos.y > c.y + 4) continue;
      const dx = this.pos.x - c.x, dz = this.pos.z - c.z, d = Math.hypot(dx, dz), m = c.r + r;
      if (d < m && d > 0.001) { this.pos.x += dx / d * (m - d); this.pos.z += dz / d * (m - d); }
    }
    const R = Math.hypot(this.pos.x, this.pos.z);
    if (R > 360) { this.pos.x *= 360 / R; this.pos.z *= 360 / R; }
    const ceil = ceilingAt(this.pos.x, this.pos.z, this.pos.y, this.height);
    if (this.vel.y > 0 && this.pos.y + this.height > ceil) { this.pos.y = ceil - this.height; this.vel.y = 0; }
    const gh = Math.max(heightAt(this.pos.x, this.pos.z), supportAt(this.pos.x, this.pos.z, this.pos.y), -0.6);
    const wasGrounded = this.grounded;
    if (this.pos.y <= gh + (wasGrounded && this.vel.y <= 0 ? 0.35 : 0)) {
      const impact = -prevVy;
      this.pos.y = gh;
      if (this.state === 'glide' || this.state === 'sky') { this.state = 'ground'; this.landT = 0.7; }
      else if (!wasGrounded) {
        if (impact > 17 && this.alive) this.fallDamage(impact);
        this.landT = Math.max(this.landT, clamp((impact - 6) / 14, 0, 1));
        if (this.isPlayer && impact > 8) G.events.land?.(impact);
      }
      this.vel.y = 0;
      this.grounded = true; this.coyote = 0.12;
    } else {
      this.grounded = false;
      this.coyote = Math.max(0, this.coyote - dt);
    }
    // can't stand up under a low ceiling
    if (!this.wantCrouch && this.crouch) {
      const c2 = ceilingAt(this.pos.x, this.pos.z, this.pos.y, 2.05);
      if (this.pos.y + 2.05 <= c2) this.crouch = false;
    } else if (this.wantCrouch && this.state === 'ground') this.crouch = true;
    if (this.pos.y < 0.3 && gh < 0.3) { this.vel.x *= 0.95; this.vel.z *= 0.95; }
  }

  fallDamage(impact) {
    const dmg = (impact - 17) * 6.5;
    const C = this.char;
    const feet = this.pos.clone().add(_v.set(0, 0.35, 0));
    const through = dmg - Math.min(this.shield, dmg); // what gets past the shield
    if (through > 0) gore.groundSplat(this.pos.x, this.pos.z, 1 + through / 30, this.pos.y + 0.5);
    if (through > 12) {
      const side = Math.random() < 0.5 ? 'L' : 'R';
      C.breakLeg(side);
      if (through > 40) C.breakLeg(side === 'L' ? 'R' : 'L');
      gore.spurt(feet, UP, Math.ceil(through / 1.2), 4);
      gore.chunks(feet, Math.ceil(through / 8), UP, 2);
      gore.mist(feet, 0.9, 3);
      for (const b of C.boneOut || []) gore.fountain(b, 3, 0.6);
      play('crunch', { pos: this.isPlayer ? null : this.pos, vol: 1 });
      if (this.isPlayer || Math.random() < 0.5) play('scream', { pos: this.isPlayer ? null : this.pos, vol: 0.8 });
    }
    this.bleed += through * 0.12;
    this.hurt({ dmg, part: 'legL', fall: true, impact, dir: new THREE.Vector3(0, -1, 0), point: feet });
  }

  tick(dt) {
    const C = this.char;
    if (!C) return;
    this.switchT = Math.max(0, this.switchT - dt * 3.6);
    if (this.reloadT > 0) { this.reloadT -= dt; if (this.reloadT <= 0) { this.reloadT = 0; if (this.item?.def.kind === 'gun') this.item.ammo = this.item.def.mag; } }
    this.spread = Math.max(0, this.spread - dt * 0.08);
    const it = this.item;
    if (this.useT > 0 && it && it.def.kind === 'heal') {
      this.useT -= dt;
      if (this.useT <= 0) {
        this.useT = 0;
        if (it.def.shield) this.shield = Math.min(100, this.shield + it.def.shield);
        if (it.def.health) this.hp = Math.min(100, this.hp + it.def.health);
        if (it.def.stopBleed) { this.bleed = 0; for (const w of C.wounds) w.userData.bleed = 0; }
        it.count--;
        if (it.count <= 0) { this.slots[this.sel] = null; this.equip(0); }
      }
    } else if (this.useT > 0) this.useT = 0;
    if (this.bleed > 0) {
      this.bleed = Math.max(0, this.bleed - dt * 0.45);
      const pts = []; C.bleedPoints(dt, pts);
      for (const p of pts) gore.drip(p);
      if (Math.random() < dt * this.bleed * (this.speedNow > 1 ? 0.5 : 0.15)) gore.groundSplat(this.pos.x + rand(-0.3, 0.3), this.pos.z + rand(-0.3, 0.3), rand(0.3, 0.7), this.pos.y + 0.5);
      // heavy bleeding spurts in time with the heartbeat
      if (this.bleed > 10 && pts.length && Math.random() < 0.6) gore.artery(pts[0], UP.clone().add(_v.set(rand(-0.5, 0.5), 0, rand(-0.5, 0.5))), 0.3);
      if (this.alive && this.state === 'ground' && this.bleed > 2) this.drain(this.bleed * 0.06 * dt);
    }
    C.update(dt);
  }

  updateModel(dt, camPos) {
    const C = this.char;
    if (!C) return;
    C.root.position.copy(this.pos);
    const near = !camPos || camPos.distanceToSquared(this.pos) < 55 * 55;
    C.setDetail(near);
    const hv = this.riding ? 0 : Math.hypot(this.vel.x, this.vel.z);
    this.speedNow = hv;
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    const k = this.item?.def.kind;
    const sky = this.state === 'sky', glide = this.state === 'glide';
    this.skyTilt += ((sky ? -1.2 : 0) - this.skyTilt) * Math.min(1, dt * 5);
    C.root.rotation.set(this.skyTilt, this.yaw, 0, 'YXZ');
    const reloadFrac = this.reloadT > 0 ? 1 - this.reloadT / this.item.def.reload : -1;
    C.animate(dt, {
      speed: this.grounded ? hv : 0, grounded: this.grounded || this.state === 'bus', vy: this.vel.y, pitch: this.pitch,
      crouch: this.crouch, sprint: this.grounded && hv > 7.6, gliding: glide, sky,
      holding: k === 'gun' ? 'gun' : k === 'melee' ? 'melee' : k === 'heal' ? 'heal' : 'none',
      aiming: this.aiming, reload: reloadFrac, switchT: this.switchT, useT: this.useT, useFrac: this.useDur ? 1 - this.useT / this.useDur : 0,
      landT: this.landT, fwdVel: this.vel.x * fx + this.vel.z * fz, sideVel: this.vel.x * -fz + this.vel.z * fx,
      limp: Math.max(this.partDmg.legL, this.partDmg.legR) / 60 + (C.missing.brokenL || C.missing.brokenR ? 0.6 : 0),
      limpSide: this.partDmg.legR > this.partDmg.legL || C.missing.brokenR ? 'R' : 'L',
      hurt: Math.max(0, (45 - this.hp) / 45), riding: !!this.riding,
    });
    if (this.glider) this.glider.visible = glide;
  }
}
