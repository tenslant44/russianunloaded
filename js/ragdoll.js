import * as THREE from 'three';
import { heightAt } from './world.js';
import { supportAt, resolveCircle } from './structures.js';
import { rand } from './util.js';

// Verlet ragdoll with a short "active" phase (Euphoria-style): the body tries to stay up,
// staggers, clutches the wound, then gives out and goes limp. Drives Character bone groups.
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();
const _d = new THREE.Vector3(), _e = new THREE.Vector3(), _f = new THREE.Vector3();
const _m = new THREE.Matrix4();
const DOWN = new THREE.Vector3(0, -1, 0), UPV = new THREE.Vector3(0, 1, 0);
const STEP = 1 / 60;
const NAMES = ['pelvis', 'chest', 'head', 'shL', 'shR', 'elL', 'elR', 'haL', 'haR', 'hiL', 'hiR', 'knL', 'knR', 'ftL', 'ftR'];
const PART_PTS = { head: ['head'], torso: ['chest', 'pelvis'], armL: ['elL', 'haL'], armR: ['elR', 'haR'], legL: ['knL', 'ftL'], legR: ['knR', 'ftR'] };

export class Ragdoll {
  constructor(char, vel, info = {}) {
    this.C = char;
    const P = char.parts;
    char.root.updateMatrixWorld(true);
    const wp = (o, x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z).applyMatrix4(o.matrixWorld);
    const pos = {
      pelvis: wp(char.hips), chest: wp(P.chest), head: wp(P.head, 0, 0.27, 0),
      shL: wp(P.armL), shR: wp(P.armR), elL: wp(P.elbowL), elR: wp(P.elbowR), haL: wp(P.handL, 0, -0.06, 0), haR: wp(P.handR, 0, -0.06, 0),
      hiL: wp(P.legL), hiR: wp(P.legR), knL: wp(P.kneeL), knR: wp(P.kneeR), ftL: wp(P.kneeL, 0, -0.48, 0), ftR: wp(P.kneeR, 0, -0.48, 0),
    };
    this.pts = {};
    const v = (vel || new THREE.Vector3()).clone().multiplyScalar(STEP);
    for (const n of NAMES) {
      const p = pos[n];
      this.pts[n] = { p, o: p.clone().sub(v), r: n === 'head' ? 0.22 : n === 'pelvis' || n === 'chest' ? 0.2 : n.startsWith('ft') ? 0.08 : 0.1 };
    }
    this.cons = [];
    const stick = (a, b, k = 1, min = false, scale = 1) => this.cons.push({ a: this.pts[a], b: this.pts[b], rest: pos[a].distanceTo(pos[b]) * scale, k, min });
    // rigid torso box
    const torso = ['pelvis', 'chest', 'shL', 'shR', 'hiL', 'hiR'];
    for (let i = 0; i < torso.length; i++) for (let j = i + 1; j < torso.length; j++) stick(torso[i], torso[j]);
    stick('head', 'chest'); stick('head', 'shL', 0.35); stick('head', 'shR', 0.35);
    for (const s of ['L', 'R']) {
      stick('sh' + s, 'el' + s); stick('el' + s, 'ha' + s);
      stick('hi' + s, 'kn' + s); stick('kn' + s, 'ft' + s);
      // joint range: limbs can't fold flat or pass through the chest
      stick('sh' + s, 'ha' + s, 1, true, 0.45); stick('hi' + s, 'ft' + s, 1, true, 0.5);
      stick('pelvis', 'kn' + s, 1, true, 0.8); stick('chest', 'el' + s, 0.5, true, 0.7);
    }
    stick('ftL', 'ftR', 0.4, true, 0.35); stick('knL', 'knR', 0.4, true, 0.4);
    // death impulse where the killing blow landed
    const part = info.part || 'torso', dir = info.dir || DOWN;
    let force = info.explosive ? 0.22 : info.weapon === 'sniper' ? 0.16 : info.weapon === 'shotgun' || info.weapon === 'obrez' ? 0.13 : info.weapon === 'bear' ? 0.14 : info.fall || info.storm || info.bleedOut ? 0 : 0.06;
    for (const n of PART_PTS[part] || PART_PTS.torso) this.pts[n].o.addScaledVector(dir, -force);
    if (info.explosive) for (const n of NAMES) this.pts[n].o.y -= rand(0.05, 0.15);
    // active behaviour
    this.t = 0; this.acc = 0;
    this.activeDur = info.explosive || info.part === 'head' || force > 0.12 ? 0.15 : info.bleedOut ? 1.8 : rand(0.8, 1.5);
    this.clutchSide = part === 'armL' ? 'R' : part === 'armR' ? 'L' : Math.random() < 0.5 ? 'L' : 'R';
    this.clutchT = part === 'head' || info.explosive ? 0 : rand(2.5, 5);
    const hit = info.point ? info.point.clone() : pos.chest.clone().lerp(pos.pelvis, 0.5);
    this.clutchOff = hit.sub(this.pts[part === 'torso' || part.startsWith('arm') ? 'chest' : 'pelvis'].p);
    this.clutchAnchor = part === 'torso' || part.startsWith('arm') ? 'chest' : 'pelvis';
    this.writhe = info.bleedOut || Math.random() < 0.6 ? rand(3, 7) : 0;
    this.still = 0; this.sleeping = false;
    // take the model out of its animated pose space
    char.root.position.set(0, 0, 0); char.root.rotation.set(0, 0, 0); char.root.scale.setScalar(1);
    char.body.position.set(0, 0, 0); char.body.rotation.set(0, 0, 0);
  }

  impulse(point, dir, strength) {
    let best = null, bd = 1e9;
    for (const n of NAMES) { const d = this.pts[n].p.distanceToSquared(point); if (d < bd) { bd = d; best = this.pts[n]; } }
    if (!best) return;
    best.o.addScaledVector(dir, -Math.min(0.2, strength * 0.02));
    this.sleeping = false; this.still = 0;
  }

  groundY(p) { return Math.max(heightAt(p.x, p.z), supportAt(p.x, p.z, p.y + 0.3, 0.3)); }

  step(dt) {
    if (this.sleeping) return false;
    this.acc += Math.min(dt, 0.05);
    let moved = 0;
    while (this.acc >= STEP) {
      this.acc -= STEP; this.t += STEP;
      moved = Math.max(moved, this.sub());
    }
    this.still = moved < 0.018 ? this.still + dt : 0;
    if ((this.still > 1.2 && this.t > this.activeDur + 1 && this.t > this.writhe && this.t > this.clutchT) || this.t > 12) this.sleeping = true;
    return true;
  }

  sub() {
    const g = 22 * STEP * STEP;
    let moved = 0;
    for (const n of NAMES) {
      const q = this.pts[n];
      _a.subVectors(q.p, q.o).multiplyScalar(0.985);
      moved = Math.max(moved, _a.lengthSq());
      q.o.copy(q.p);
      q.p.add(_a); q.p.y -= g;
    }
    this.behave();
    for (let it = 0; it < 6; it++) {
      for (const c of this.cons) {
        _a.subVectors(c.b.p, c.a.p);
        const len = _a.length() || 1e-6;
        if (c.min && len >= c.rest) continue;
        const d = (len - c.rest) / len * 0.5 * c.k;
        c.a.p.addScaledVector(_a, d); c.b.p.addScaledVector(_a, -d);
      }
      this.hinges();
    }
    for (const n of NAMES) { // ground + walls with friction
      const q = this.pts[n];
      const gy = this.groundY(q.p) + q.r * 0.6;
      if (q.p.y < gy) {
        q.p.y = gy;
        q.o.x += (q.p.x - q.o.x) * 0.45; q.o.z += (q.p.z - q.o.z) * 0.45;
        if (q.o.y < q.p.y - 0.03) q.o.y = q.p.y - 0.03 * 0.3; // little bounce, mostly thud
      }
      _b.copy(q.p); _b.y -= 0.1;
      resolveCircle(_b, q.r, 0.2);
      q.p.x = _b.x; q.p.z = _b.z;
    }
    return Math.sqrt(moved);
  }

  // Euphoria-style: fight to stay up, stagger, clutch the wound, writhe
  behave() {
    const T = this.pts, t = this.t;
    const w = Math.max(0, 1 - t / this.activeDur);
    if (w > 0) {
      // balance: pull chest over pelvis, feet under hips
      _a.copy(T.pelvis.p); _a.y += 0.45;
      T.chest.p.x += (_a.x - T.chest.p.x) * 0.06 * w;
      T.chest.p.z += (_a.z - T.chest.p.z) * 0.06 * w;
      for (const s of ['L', 'R']) {
        const f = T['ft' + s].p, h = T['hi' + s].p;
        f.x += (h.x - f.x) * 0.05 * w; f.z += (h.z - f.z) * 0.05 * w;
      }
      T.head.p.y += 0.004 * w;
    }
    // hand pressed to the wound
    if (t < this.clutchT) {
      const k = 0.12 * Math.min(1, t * 4) * (1 - t / this.clutchT);
      _c.copy(T[this.clutchAnchor].p).add(this.clutchOff);
      T['ha' + this.clutchSide].p.lerp(_c, k);
      if (this.writhe && t > 0.5) T['ha' + (this.clutchSide === 'L' ? 'R' : 'L')].p.lerp(_c, k * 0.4);
    }
    // agonal writhing: weak kicks and curls that fade out
    if (t < this.writhe && t > this.activeDur && Math.random() < 0.08) {
      const k = (1 - t / this.writhe) * 0.02;
      const n = ['knL', 'knR', 'haL', 'haR', 'head', 'ftL', 'ftR'][Math.floor(Math.random() * 7)];
      this.pts[n].o.add(_a.set(rand(-1, 1), rand(0, 1.5), rand(-1, 1)).multiplyScalar(k));
    }
  }

  // knees bend forward, elbows bend backward
  hinges() {
    const T = this.pts;
    const right = _b.subVectors(T.shR.p, T.shL.p).add(_c.subVectors(T.hiR.p, T.hiL.p));
    const up = _a.subVectors(T.chest.p, T.pelvis.p).normalize();
    right.addScaledVector(up, -right.dot(up)).normalize();
    const back = _d.crossVectors(right, up);
    for (const s of ['L', 'R']) {
      this.hinge(T['hi' + s].p, T['kn' + s].p, T['ft' + s].p, back, 1);
      this.hinge(T['sh' + s].p, T['el' + s].p, T['ha' + s].p, back, -1);
    }
  }
  hinge(a, j, b, back, sign) {
    const mid = _e.addVectors(a, b).multiplyScalar(0.5);
    const off = _f.subVectors(j, mid);
    const d = off.dot(back) * sign;
    if (d > 0) j.addScaledVector(back, -d * sign * 1.2);
  }

  // write particle state into the bone hierarchy
  apply() {
    const C = this.C, P = C.parts, T = this.pts;
    const up = _a.subVectors(T.chest.p, T.pelvis.p).normalize();
    const right = _b.subVectors(T.shR.p, T.shL.p).add(_c.subVectors(T.hiR.p, T.hiL.p));
    right.addScaledVector(up, -right.dot(up)).normalize();
    const back = new THREE.Vector3().crossVectors(right, up);
    _m.makeBasis(right, up, back);
    const qT = new THREE.Quaternion().setFromRotationMatrix(_m);
    C.hips.position.copy(T.pelvis.p);
    C.hips.quaternion.copy(qT);
    P.spine.quaternion.identity(); P.chest.quaternion.identity(); P.neck.quaternion.identity();
    // head
    const hu = new THREE.Vector3().subVectors(T.head.p, T.chest.p).normalize();
    const qa = new THREE.Quaternion().setFromUnitVectors(UPV.clone().applyQuaternion(qT), hu);
    const hw = qa.multiply(qT.clone());
    P.head.quaternion.copy(qT.clone().invert().multiply(hw));
    const limb = (grp, parentQ, from, to) => {
      const d = new THREE.Vector3().subVectors(to, from).normalize();
      const cur = DOWN.clone().applyQuaternion(parentQ);
      const world = new THREE.Quaternion().setFromUnitVectors(cur, d).multiply(parentQ);
      grp.quaternion.copy(parentQ.clone().invert().multiply(world));
      return world;
    };
    for (const s of ['L', 'R']) {
      const aw = limb(P['arm' + s], qT, T['sh' + s].p, T['el' + s].p);
      limb(P['elbow' + s], aw, T['el' + s].p, T['ha' + s].p);
      P['hand' + s].quaternion.identity();
      const lw = limb(P['leg' + s], qT, T['hi' + s].p, T['kn' + s].p);
      limb(P['knee' + s], lw, T['kn' + s].p, T['ft' + s].p);
    }
    C.root.updateMatrixWorld(true);
  }

  center(out) { return out.copy(this.pts.pelvis.p); }
}
