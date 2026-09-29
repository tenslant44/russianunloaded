import * as THREE from 'three';
import { G } from './state.js';
import { Combatant, damageMultiplier } from './combat.js';
import { Character, meshOwner, outline } from './character.js';
import { toon, rand, pick } from './util.js';
import { heightAt, ISLAND_R } from './world.js';
import { play } from './audio.js';

const damp = (a, b, r, dt) => a + (b - a) * (1 - Math.exp(-r * dt));
const angDiff = (a, b) => { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };
const _v = new THREE.Vector3();

// Quadruped body that speaks the same gore API as Character (wounds, soak, dismember, guts…)
class BearChar {
  constructor() {
    this.quadruped = true;
    const fur = 0xf4f1e6;
    this.mats = { shirt: toon(fur), pants: toon(0xe9e4d4), accent: toon(0xf0ecdf), vest: toon(0xece7d8), skin: toon(0x2a2a2a), glove: toon(0x1a1a1a), dark: toon(0x0e0e0e) };
    this.baseColors = {}; for (const k in this.mats) this.baseColors[k] = this.mats[k].color.clone();
    this.root = new THREE.Group();
    this.hitMeshes = []; this.outlines = []; this.parts = {}; this.wounds = []; this.missing = {};
    this.bloodiness = 0; this.cycle = 0; this.walkW = 0; this.detail = true;
    this.react = { x: 0, z: 0, vx: 0, vz: 0, head: 0, hv: 0 };
    this.weaponModel = null; this.hand = new THREE.Group();
    const M = this.mats;
    const add = (parent, geo, mat, part, ol = true, x = 0, y = 0, z = 0) => {
      const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true;
      if (part) { m.userData.part = part; meshOwner.set(m, this); this.hitMeshes.push(m); }
      if (ol) { const o = new THREE.Mesh(geo, outline()); m.add(o); this.outlines.push(o); }
      parent.add(m); return m;
    };
    const body = new THREE.Group(); body.position.y = 1.05; this.root.add(body);
    this.body = body; this.parts.torso = body;
    add(body, new THREE.SphereGeometry(0.6, 18, 12).scale(0.85, 0.8, 1.55), M.shirt, 'torso');
    add(body, new THREE.SphereGeometry(0.46, 14, 10), M.pants, 'torso', false, 0, 0.16, -0.5);
    add(body, new THREE.SphereGeometry(0.12, 8, 6), M.accent, 'torso', false, 0, 0.18, 0.92);
    // guts open on the belly, pointing forward
    const gut = new THREE.Group(); gut.position.set(0, -0.27, 0.32); gut.rotation.x = -Math.PI / 2; body.add(gut);
    this.parts.spine = gut;
    // head
    const neck = new THREE.Group(); neck.position.set(0, 0.12, -0.92); body.add(neck);
    const head = new THREE.Group(); neck.add(head); this.parts.head = head; this.neck = neck;
    add(head, new THREE.SphereGeometry(0.34, 16, 12).scale(0.9, 0.85, 1.1), M.shirt, 'head', true, 0, 0.2, -0.15);
    add(head, new THREE.SphereGeometry(0.19, 12, 8).scale(0.85, 0.7, 1.3), M.accent, 'head', false, 0, 0.1, -0.46);
    add(head, new THREE.SphereGeometry(0.075, 8, 6), M.dark, 'head', false, 0, 0.15, -0.68);
    for (const s of [-1, 1]) {
      add(head, new THREE.SphereGeometry(0.045, 8, 6), M.dark, 'head', false, s * 0.14, 0.28, -0.4);
      add(head, new THREE.SphereGeometry(0.1, 8, 6).scale(1, 1, 0.6), M.pants, 'head', false, s * 0.22, 0.46, -0.05);
    }
    this.jaw = add(head, new THREE.SphereGeometry(0.14, 10, 6).scale(0.8, 0.4, 1.3), M.pants, 'head', false, 0, -0.03, -0.38);
    // legs: front = arm L/R, hind = leg L/R
    const legGeo = new THREE.CylinderGeometry(0.19, 0.16, 0.5, 10).translate(0, -0.25, 0);
    const lowGeo = new THREE.CylinderGeometry(0.15, 0.14, 0.3, 10).translate(0, -0.15, 0);
    const pawGeo = new THREE.SphereGeometry(0.17, 10, 6).scale(1, 0.45, 1.3);
    for (const [name, x, z] of [['armL', -0.33, -0.6], ['armR', 0.33, -0.6], ['legL', -0.33, 0.55], ['legR', 0.33, 0.55]]) {
      const g = new THREE.Group(); g.position.set(x, -0.15, z); body.add(g);
      add(g, legGeo, M.shirt, name);
      const knee = new THREE.Group(); knee.position.y = -0.5; g.add(knee);
      add(knee, lowGeo, M.vest, name);
      add(knee, pawGeo, M.accent, name, false, 0, -0.33, -0.05);
      for (let i = -1; i <= 1; i++) add(knee, new THREE.ConeGeometry(0.02, 0.07, 4).rotateX(-Math.PI / 2.4), M.dark, null, false, i * 0.07, -0.35, -0.26);
      this.parts[name] = g;
      if (name.startsWith('leg')) this.parts['knee' + name.slice(3)] = knee;
      else this.parts['elbow' + name.slice(3)] = knee;
    }
  }
  setWeapon() {}
  setDetail(near) { if (near === this.detail) return; this.detail = near; for (const o of this.outlines) o.visible = near; }
  fire() {} melee() { this.meleeT = 1; }
  dismember(part) {
    const c = Character.prototype.dismember.call(this, part);
    const st = this.stumps?.[this.stumps.length - 1];
    if (c && st && st.part === part) {
      st.obj.rotation.set(part === 'head' ? -Math.PI / 2 : Math.PI, 0, 0);
      st.obj.scale.setScalar(part === 'head' ? 2.2 : 1.8);
    }
    return c;
  }
  animate(dt, st) {
    const moving = st.grounded ? Math.min(1, st.speed / 5) : 0;
    this.walkW = damp(this.walkW, moving, 8, dt);
    this.cycle += dt * (st.speed * 0.95 + 0.001);
    const c = this.cycle, w = this.walkW, gallop = st.speed > 8 ? 1 : 0;
    const P = this.parts;
    const sw = (ph) => Math.sin(c + ph) * (0.55 + gallop * 0.25) * w;
    const kn = (ph) => Math.max(0, Math.sin(c + ph + 0.8)) * 0.9 * w;
    // diagonal gait; gallop pairs the legs
    const ph = gallop ? [0, 0.3, Math.PI, Math.PI + 0.3] : [0, Math.PI, Math.PI, 0];
    if (P.armL) P.armL.rotation.x = sw(ph[0]); if (P.armR) P.armR.rotation.x = sw(ph[1]);
    if (P.legL) P.legL.rotation.x = sw(ph[2]); if (P.legR) P.legR.rotation.x = sw(ph[3]);
    if (P.elbowL) P.elbowL.rotation.x = kn(ph[0]); if (P.elbowR) P.elbowR.rotation.x = kn(ph[1]);
    P.kneeL.rotation.x = -kn(ph[2]) + (this.missing.brokenL ? 1.1 : 0); P.kneeR.rotation.x = -kn(ph[3]) + (this.missing.brokenR ? 1.1 : 0);
    const R = this.react;
    R.vx += (-R.x * 90 - R.vx * 12) * dt; R.x += R.vx * dt;
    R.vz += (-R.z * 90 - R.vz * 12) * dt; R.z += R.vz * dt;
    R.hv += (-R.head * 110 - R.hv * 10) * dt; R.head += R.hv * dt;
    this.meleeT = Math.max(0, (this.meleeT || 0) - dt * 2.2);
    const m = this.meleeT, swipe = m > 0 ? Math.sin((1 - m) * Math.PI) : 0;
    const bob = Math.abs(Math.sin(c)) * 0.06 * w * (1 + gallop);
    this.body.position.y = 1.05 + bob + swipe * 0.35 - (this.missing.legL || this.missing.legR ? 0.2 : 0);
    this.body.rotation.set(R.x * 0.4 - swipe * 0.35 + (gallop ? Math.sin(c * 2) * 0.06 : 0), 0, R.z * 0.4);
    // swipe: a front paw rakes forward
    if (m > 0 && P.armR) { P.armR.rotation.x = -1.6 * swipe; P.elbowR.rotation.x = 0.4 * swipe; }
    P.head.rotation.set(0.15 + Math.sin(c * 0.5) * 0.05 * w - swipe * 0.4 + R.head * 0.5, Math.sin(G.time * 0.7) * 0.2 * (1 - w), 0);
    if (this.jaw) this.jaw.position.y = -0.03 - (st.roar || swipe) * 0.12;
  }
  animateDead(dt, e, b, age) {
    const P = this.parts;
    const sp = age < 5 ? Math.max(0, 1 - age / 5) : 0;
    const tw = (f, p) => sp * (Math.sin(age * f + p) > 0.85 ? Math.sin(age * f * 3 + p) * 0.3 : 0);
    for (const [k, i] of [['armL', 0], ['armR', 1], ['legL', 2], ['legR', 3]]) if (P[k]) { P[k].rotation.x = (i < 2 ? -0.5 : 0.5) * e + tw(9 + i, i); P[k].rotation.z = 0.2 * e; }
    this.body.position.y = 1.05 - b * 0.35 * (1 - e);
    P.head.rotation.set(0.5 * b, 0.3 * e, 0);
    if (this.jaw) this.jaw.position.y = -0.1;
  }
  update(dt) {
    if (this.dangle) this.dangle.rotation.x = Math.sin(this.cycle * 0.7) * 0.25;
    if (this.heart && !this.dead) this.heart.scale.setScalar(1 + Math.max(0, Math.sin(performance.now() * 0.009)) * 0.25);
  }
}
for (const k of ['addWound', 'soak', 'flinch', 'crackSkull', 'openTorso', 'breakLeg', 'bleedPoints', 'brokenPose']) BearChar.prototype[k] = Character.prototype[k];

let bearN = 0;
export class PolarBear extends Combatant {
  constructor(pos) {
    super('Белый Медведь', false, {}, 900 + bearN++);
    this.animal = true;
    this.hp = 260;
    this.pos.copy(pos);
    this.state = 'ground'; this.grounded = true;
    this.yaw = rand(0, 6.28);
    this.goal = pos.clone(); this.target = null; this.hostileT = 0; this.swipeT = 0;
    this.rider = null; this.tamer = null; this.thinkT = rand(0, 1); this.roar = 0;
  }
  makeBody() {
    this.char = new BearChar();
    this.char.owner = this;
    G.scene.add(this.char.root);
  }
  get height() { return 1.8; }
  hurt(info) {
    const rider = this.rider?.alive && this.rider.riding === this ? this.rider : null;
    let riderOverflow = 0;
    let bearInfo = info;
    if (rider) {
      const mult = damageMultiplier(info);
      const incoming = Math.max(0, info.dmg * mult);
      const bearDamage = Math.min(Math.max(0, this.hp), incoming);
      riderOverflow = incoming - bearDamage;
      bearInfo = { ...info, dmg: mult ? bearDamage / mult : 0 };
    }
    if (info.attacker && info.attacker !== this && !info.attacker.animal) {
      this.target = info.attacker; this.hostileT = 18;
      if (info.attacker === this.tamer) this.tamer = null;
      if (this.rider && info.attacker === this.rider) this.throwRider();
    }
    if (info.dmg > 15 && this.alive && Math.random() < 0.5) { this.roar = 1; play('scream', { pos: this.pos, vol: 0.9, rate: 0.45 }); }
    super.hurt(bearInfo);
    if (!this.alive && this.rider) this.throwRider();
    if (rider && riderOverflow > 0 && rider.alive) {
      const mult = damageMultiplier(info);
      rider.hurt({ ...info, dmg: riderOverflow / mult, bearOverflow: true });
    }
  }
  throwRider() {
    const r = this.rider; if (!r) return;
    this.rider = null; r.riding = null;
    r.vel.set(rand(-4, 4), 7, rand(-4, 4)); r.grounded = false;
  }
  think() {
    if (this.rider) return;
    if (this.hostileT <= 0 || !this.target?.alive) {
      this.target = null;
      // wild bears sometimes take an interest in whoever gets too close
      for (const c of G.combatants) {
        if (c.animal || !c.alive || c.state !== 'ground' || c === this.tamer) continue;
        const d = c.pos.distanceTo(this.pos);
        if (d < 9 && Math.random() < 0.18) { this.target = c; this.hostileT = 10; this.roar = 1; play('scream', { pos: this.pos, vol: 0.8, rate: 0.4 }); break; }
      }
    }
    if (!this.target && (this.goal.distanceTo(this.pos) < 3 || Math.random() < 0.05)) {
      const a = rand(0, 6.28), r = rand(10, 35);
      const S = G.storm;
      let x = this.pos.x + Math.cos(a) * r, z = this.pos.z + Math.sin(a) * r;
      if (S?.started && Math.hypot(x - S.x, z - S.z) > S.r * 0.9) { x = S.x + (x - S.x) * 0.5; z = S.z + (z - S.z) * 0.5; }
      if (Math.hypot(x, z) > ISLAND_R * 0.9 || heightAt(x, z) < 2) { x = this.pos.x * 0.8; z = this.pos.z * 0.8; }
      this.goal.set(x, 0, z);
    }
  }
  update(dt) {
    if (!this.alive) { this.tick(dt); return; }
    this.roar = Math.max(0, this.roar - dt);
    if (this.rider) { this.tick(dt); return; } // the rider drives the physics
    this.hostileT -= dt; this.swipeT -= dt; this.thinkT -= dt;
    if (this.thinkT <= 0) { this.thinkT = rand(0.6, 1.2); this.think(); }
    const wish = new THREE.Vector3();
    let sprint = false;
    const t = this.target;
    if (t && t.alive && this.hostileT > 0) {
      const to = t.pos.clone().sub(this.pos).setY(0);
      const d = to.length();
      this.yaw += angDiff(this.yaw, Math.atan2(-to.x, -to.z)) * Math.min(1, dt * 6);
      if (d > 2.1) { wish.copy(to.normalize()).multiplyScalar(1.45); sprint = true; }
      if (d < 2.8 && this.swipeT <= 0) this.maul(t);
    } else {
      const to = this.goal.clone().sub(this.pos).setY(0);
      if (to.length() > 1.5) { wish.copy(to.normalize()).multiplyScalar(0.55); this.yaw += angDiff(this.yaw, Math.atan2(-wish.x, -wish.z)) * Math.min(1, dt * 2.5); }
    }
    this.physics(dt, wish, false, sprint);
    this.tick(dt);
  }
  maul(t) {
    this.swipeT = rand(0.9, 1.3);
    this.char.melee();
    const C = t.char; if (!C) return;
    const ms = C.hitMeshes.filter(m => !m.userData.gone);
    const mesh = pick(ms); if (!mesh) return;
    mesh.updateMatrixWorld();
    const p = new THREE.Vector3().setFromMatrixPosition(mesh.matrixWorld);
    const dir = p.clone().sub(this.pos.clone().add(_v.set(0, 1.2, 0))).normalize();
    // claw rakes: three parallel gashes
    for (let i = 0; i < 3; i++) C.addWound(mesh, p.clone().add(_v.set(rand(-0.06, 0.06), (i - 1) * 0.08, rand(-0.06, 0.06))).addScaledVector(dir, -0.12), dir.clone().negate(), rand(0.18, 0.26), true);
    t.vel.addScaledVector(dir.clone().setY(0.4), 7);
    play('flesh', { pos: t.isPlayer ? null : p, vol: 1 });
    t.hurt({ dmg: rand(24, 36), part: mesh.userData.part, point: p, normal: dir.clone().negate(), dir, weapon: 'bear', gore: 2.6, attacker: this, mesh, dist: 1 });
  }
  // called by the player while riding
  drive(dt, wish, jump, sprint) {
    if (wish.lengthSq() > 0.01) this.yaw += angDiff(this.yaw, Math.atan2(-wish.x, -wish.z)) * Math.min(1, dt * 5);
    this.physics(dt, wish.clone().multiplyScalar(sprint ? 1.75 : 1.3), jump, sprint);
    this.hostileT = 0; this.target = null;
  }
  updateModel(dt, camPos) {
    const C = this.char; if (!C) return;
    C.root.position.copy(this.pos);
    C.setDetail(!camPos || camPos.distanceToSquared(this.pos) < 55 * 55);
    this.speedNow = Math.hypot(this.vel.x, this.vel.z);
    C.root.rotation.set(0, this.yaw, 0);
    C.animate(dt, { speed: this.grounded ? this.speedNow : 0, grounded: this.grounded, roar: this.roar });
  }
}

export function spawnBears(n) {
  const out = [];
  for (let i = 0, tries = 0; i < n && tries < 500; tries++) {
    const a = rand(0, 6.28), r = Math.sqrt(Math.random()) * ISLAND_R * 0.75;
    const x = Math.cos(a) * r, z = Math.sin(a) * r, y = heightAt(x, z);
    if (y < 3) continue;
    const b = new PolarBear(new THREE.Vector3(x, y, z));
    G.combatants.push(b); out.push(b); i++;
  }
  return out;
}
