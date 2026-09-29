import * as THREE from 'three';
import { rand, canvasTex } from './util.js';

let scene;
const tracers = [], flashes = [], puffs = [];
let puffTex;

export function initFx(sc) {
  scene = sc;
  tracers.length = 0; flashes.length = 0; puffs.length = 0; booms.length = 0;
  // pre-made so adding a blast never triggers shader recompiles
  boomLights = [0, 1].map(() => { const l = new THREE.PointLight(0xffa040, 0, 30, 2); scene.add(l); return l; });
  const tg = new THREE.CylinderGeometry(0.015, 0.015, 1, 4, 1, true).rotateX(Math.PI / 2).translate(0, 0, 0.5);
  for (let i = 0; i < 60; i++) {
    const t = new THREE.Mesh(tg, new THREE.MeshBasicMaterial({ color: 0xfff2a0, transparent: true }));
    t.visible = false; scene.add(t); tracers.push(t);
  }
  const fm = new THREE.SpriteMaterial({
    map: canvasTex(64, 64, (g) => {
      const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, 'rgba(255,255,220,1)'); gr.addColorStop(0.3, 'rgba(255,200,60,0.9)'); gr.addColorStop(1, 'rgba(255,120,0,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    }), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  for (let i = 0; i < 50; i++) { const s = new THREE.Sprite(fm); s.visible = false; scene.add(s); flashes.push(s); }
  puffTex = canvasTex(64, 64, (g) => {
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  });
  for (let i = 0; i < 110; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTex, transparent: true, depthWrite: false }));
    s.visible = false; scene.add(s); puffs.push(s);
  }
}

export function tracer(from, to) {
  const t = tracers.find(x => !x.visible); if (!t) return;
  t.position.copy(from);
  t.lookAt(to);
  t.scale.set(1, 1, from.distanceTo(to));
  t.visible = true; t.userData.life = 0.06; t.material.opacity = 0.9;
}
export function muzzleFlash(p) {
  const s = flashes.find(x => !x.visible); if (!s) return;
  s.position.copy(p); s.scale.setScalar(rand(0.5, 0.8)); s.visible = true; s.userData.life = 0.05;
}
export function puff(p, color = 0xd8c8a8, size = 0.8) {
  const s = puffs.find(x => !x.visible); if (!s) return;
  s.position.copy(p); s.material.color.setHex(color); s.visible = true;
  s.userData = { life: 0.5, size, vel: new THREE.Vector3(rand(-0.5, 0.5), rand(0.3, 1), rand(-0.5, 0.5)) };
}
// Fireball + smoke + scorch light
const booms = [];
let boomLights = [];
export function explosionFx(p, R = 7) {
  for (let i = 0; i < 10; i++) {
    const s = flashes.find(x => !x.visible); if (!s) break;
    s.position.copy(p).add(new THREE.Vector3(rand(-1, 1), rand(-0.5, 1.5), rand(-1, 1)).multiplyScalar(R * 0.25));
    s.scale.setScalar(rand(3, 6)); s.visible = true; s.userData.life = rand(0.12, 0.3);
  }
  for (let i = 0; i < 14; i++) {
    const s = puffs.find(x => !x.visible); if (!s) break;
    s.position.copy(p); s.material.color.setHex(i < 5 ? 0xff8030 : 0x3a3530); s.visible = true;
    s.userData = { life: 0.5, size: rand(3, 6), vel: new THREE.Vector3(rand(-4, 4), rand(1, 6), rand(-4, 4)) };
  }
  const light = boomLights.find(l => !booms.some(b => b.light === l)) || boomLights[0];
  light.position.copy(p); light.distance = R * 4;
  const old = booms.findIndex(b => b.light === light); if (old >= 0) booms.splice(old, 1);
  booms.push({ light, t: 0.35 });
}
// Blue shield shards when a hit is absorbed
export function shieldSpark(p, dir, broke) {
  const n = broke ? 6 : 2;
  for (let i = 0; i < n; i++) {
    const s = puffs.find(x => !x.visible); if (!s) return;
    s.position.copy(p); s.material.color.setHex(broke ? 0x9ae8ff : 0x40b0ff); s.visible = true;
    const v = new THREE.Vector3(rand(-2, 2), rand(0, 2.5), rand(-2, 2));
    if (dir) v.addScaledVector(dir, -2);
    s.userData = { life: 0.5, size: broke ? 0.9 : 0.5, vel: v };
  }
}
export function updateFx(dt) {
  for (let i = booms.length - 1; i >= 0; i--) { const b = booms[i]; b.t -= dt; b.light.intensity = Math.max(0, b.t / 0.35) * 60; if (b.t <= 0) { b.light.intensity = 0; booms.splice(i, 1); } }
  for (const t of tracers) if (t.visible) { t.userData.life -= dt; t.material.opacity = t.userData.life / 0.06; if (t.userData.life <= 0) t.visible = false; }
  for (const s of flashes) if (s.visible) { s.userData.life -= dt; if (s.userData.life <= 0) s.visible = false; }
  for (const s of puffs) if (s.visible) {
    const u = s.userData; u.life -= dt;
    if (u.life <= 0) { s.visible = false; continue; }
    s.position.addScaledVector(u.vel, dt);
    const k = 1 - u.life / 0.5;
    s.scale.setScalar(u.size * (0.4 + k));
    s.material.opacity = (1 - k) * 0.8;
  }
}
