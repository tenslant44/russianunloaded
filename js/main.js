import * as THREE from 'three';
import { G } from './state.js';
import { createWorld, findHouseSpots, heightAt, world, damageTree, ISLAND_R, updateWorld } from './world.js';
import { setMap, MAPCFG } from './maps.js';
import { updateRockets, resetRockets } from './combat.js';
import { initStructures, buildHouse, updateStructures } from './structures.js';
import { initGore, updateGore, resetGore } from './gore.js';
import { initFx, updateFx } from './fx.js';
import { initLoot, spawnLoot, randomLootItem, updateLoot, makeItem } from './weapons.js';
import { Player, TOUCH } from './player.js';
import { Bot } from './bots.js';
import { botName } from './combat.js';
import { spawnBears } from './bears.js';
import { scatterProps, DECO, updateProps } from './props.js';
import { gloryStart, gloryKill, gloryLoadout } from './glory.js';
import { initAudio, setListener } from './audio.js';
import { rand, toon } from './util.js';
import * as hud from './hud.js';

let renderer, scene, camera, sun, bus, stormWall, running = false, over = false, endT = 0;

function setupRenderer() {
  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  document.getElementById('app').appendChild(renderer.domElement);
  camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.1, 2500);
  addEventListener('resize', () => {
    renderer.setSize(innerWidth, innerHeight);
    camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
    hud.resize();
  });
}

function makeBus() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(4, 3.4, 11), toon(0x2f7fe8)); g.add(body);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(4.05, 0.6, 11.05), toon(0xffffff)); stripe.position.y = -0.6; g.add(stripe);
  const win = new THREE.Mesh(new THREE.BoxGeometry(4.1, 1, 9), toon(0x9adfff)); win.position.y = 0.6; g.add(win);
  const bal = new THREE.Mesh(new THREE.SphereGeometry(6, 18, 14), toon(0xff3a3a)); bal.position.y = 10; bal.scale.set(1, 1.1, 1.4); g.add(bal);
  const bstripe = new THREE.Mesh(new THREE.SphereGeometry(6.05, 18, 14, 0, Math.PI * 2, Math.PI * 0.42, Math.PI * 0.16), toon(0xffffff)); bstripe.position.y = 10; bstripe.scale.copy(bal.scale); g.add(bstripe);
  for (const x of [-1.6, 1.6]) for (const z of [-4, 4]) {
    const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 6), toon(0x333333)); rope.position.set(x, 4.5, z * 0.8); g.add(rope);
  }
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(3, 2), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, map: flagTex() }));
  flag.position.set(0, 3.2, 4.5); g.add(flag);
  // the bus driver is a bear in an ushanka. obviously.
  const fur = toon(0x6a4222), bear = new THREE.Group();
  const bb = new THREE.Mesh(new THREE.SphereGeometry(0.9, 12, 10), fur); bb.scale.set(1, 1.2, 0.9); bear.add(bb);
  const bh = new THREE.Mesh(new THREE.SphereGeometry(0.6, 12, 10), fur); bh.position.y = 1.4; bear.add(bh);
  const sn = new THREE.Mesh(new THREE.SphereGeometry(0.25, 8, 6), toon(0xc09a70)); sn.position.set(0, 1.3, -0.52); bear.add(sn);
  const no = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 4), toon(0x111111)); no.position.set(0, 1.38, -0.75); bear.add(no);
  for (const s of [-1, 1]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6), fur); e.position.set(s * 0.42, 1.95, 0); bear.add(e);
    const ey = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 4), toon(0x111111)); ey.position.set(s * 0.22, 1.55, -0.52); bear.add(ey);
  }
  const hat = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.55, 0.35, 12), toon(0x3a2a1a)); hat.position.y = 1.95; bear.add(hat);
  const bottle = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.6, 8), new THREE.MeshToonMaterial({ color: 0xbfe8ff, transparent: true, opacity: 0.8 })); bottle.position.set(0.8, 0.6, -0.4); bottle.rotation.z = -0.5; bear.add(bottle);
  bear.position.set(0, 2.6, 2.5); g.add(bear);
  scene.add(g);
  return g;
}
function flagTex() {
  const c = document.createElement('canvas'); c.width = 3; c.height = 3;
  const x = c.getContext('2d');
  x.fillStyle = '#fff'; x.fillRect(0, 0, 3, 1); x.fillStyle = '#0039a6'; x.fillRect(0, 1, 3, 1); x.fillStyle = '#d52b1e'; x.fillRect(0, 2, 3, 1);
  const t = new THREE.CanvasTexture(c); t.magFilter = THREE.NearestFilter; t.colorSpace = THREE.SRGBColorSpace; return t;
}

function makeGlider(c) {
  const g = new THREE.Group();
  const wing = new THREE.Mesh(new THREE.ConeGeometry(2.2, 0.8, 4, 1, true), toon(Math.random() * 0xffffff | 0, { side: THREE.DoubleSide }));
  wing.scale.set(1.3, 1, 0.6); wing.rotation.y = Math.PI / 4;
  wing.position.y = 3.4;
  g.add(wing);
  for (const s of [-1, 1]) { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.6), toon(0x333333)); b.position.set(s * 0.6, 2.6, 0); b.rotation.z = s * 0.5; g.add(b); }
  g.visible = false;
  c.char.root.add(g);
  c.glider = g;
}

function newStorm() {
  const phases = [
    { wait: 45, shrink: 35, r: 190, dps: 1 },
    { wait: 35, shrink: 30, r: 110, dps: 2 },
    { wait: 30, shrink: 25, r: 55, dps: 5 },
    { wait: 25, shrink: 20, r: 22, dps: 8 },
    { wait: 20, shrink: 20, r: 0, dps: 10 },
  ];
  // glory mode is endless: the storm settles on a final arena instead of closing
  if (G.mode === 'glory') { phases.length = 3; phases[2].r = 70; }
  const S = { phase: -1, x: 0, z: 0, r: 420, fromX: 0, fromZ: 0, fromR: 420, nextX: 0, nextZ: 0, nextR: 420, t: 0, shrinking: false, dps: 1, phases, started: false };
  const next = () => {
    S.phase++;
    const p = phases[S.phase];
    if (!p) return;
    S.fromX = S.x; S.fromZ = S.z; S.fromR = S.r;
    const maxOff = Math.max(0, Math.min(S.r, S.phase === 0 ? 150 : S.r) - p.r);
    const a = rand(0, 6.28), d = Math.sqrt(Math.random()) * maxOff * 0.8;
    S.nextX = S.x + Math.cos(a) * d; S.nextZ = S.z + Math.sin(a) * d; S.nextR = p.r;
    S.t = p.wait; S.shrinking = false; S.dps = p.dps;
  };
  S.next = next;
  next();
  return S;
}
function updateStorm(S, dt) {
  if (!S.started) return;
  const p = S.phases[S.phase];
  if (p) {
    S.t -= dt;
    if (!S.shrinking && S.t <= 0) { S.shrinking = true; S.t = p.shrink; hud.center('THE STORM IS SHRINKING', 3); }
    else if (S.shrinking) {
      const k = 1 - Math.max(0, S.t) / p.shrink;
      S.x = S.fromX + (S.nextX - S.fromX) * k; S.z = S.fromZ + (S.nextZ - S.fromZ) * k; S.r = S.fromR + (S.nextR - S.fromR) * k;
      if (S.t <= 0) { S.next(); if (S.phases[S.phase]) hud.center('STORM EYE WILL SHRINK IN ' + Math.ceil(S.t) + 's', 3); }
    }
  }
  stormWall.position.set(S.x, 0, S.z);
  stormWall.scale.set(Math.max(0.01, S.r), 1, Math.max(0.01, S.r));
  S.tick = (S.tick || 0) + dt;
  if (S.tick >= 1) {
    S.tick = 0;
    const damagedMounts = new Set();
    for (const c of G.combatants) {
      if (!c.alive || c.state === 'bus') continue;
      if (c.animal && damagedMounts.has(c)) continue;
      if (Math.hypot(c.pos.x - S.x, c.pos.z - S.z) > S.r) {
        const mount = c.riding?.alive ? c.riding : null;
        if (mount) damagedMounts.add(mount);
        c.hurt({ dmg: S.dps, part: 'torso', storm: true, dir: new THREE.Vector3(0, -1, 0) });
      }
    }
  }
}

function start() {
  // clear previous
  if (scene) { G.player?.dispose(); }
  scene = new THREE.Scene();
  G.scene = scene; G.camera = camera; G.time = 0; G.combatants = []; G.corpses = [];
  const MC = setMap(G.map);
  scene.fog = new THREE.Fog(MC.fog, MC.fogNear, MC.fogFar);
  scene.add(new THREE.HemisphereLight(MC.hemiSky, MC.hemiGround, MC.hemi));
  sun = new THREE.DirectionalLight(MC.sun, MC.sunI);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera; sc.left = -60; sc.right = 60; sc.top = 60; sc.bottom = -60; sc.near = 1; sc.far = 400;
  sun.shadow.bias = -0.0005;
  scene.add(sun, sun.target);

  createWorld(scene);
  initStructures(scene);
  initGore(scene); resetGore();
  initFx(scene);
  initLoot(scene);

  resetRockets();
  const styles = MC.styles;
  const maxSize = Math.max(...styles.map(st => Math.max(st.W, st.D) * 4));
  const spots = findHouseSpots(MC.houses, maxSize);
  const houses = [];
  for (const s of spots) {
    if (world.landmark && Math.hypot(s.x + maxSize / 2 - world.landmark.x, s.z + maxSize / 2 - world.landmark.z) < 18 + maxSize) continue;
    const st = styles[Math.floor(Math.random() * styles.length)];
    const h = buildHouse(s.x, s.z, s.y, { ...st, deco: DECO[st.deco] });
    houses.push(h);
    for (const t of world.trees) if (t.alive && t.x > h.x0 - 2 && t.x < h.x1 + 2 && t.z > h.z0 - 2 && t.z < h.z1 + 2) damageTree(t.id, 1e9);
    const n = h.floors + Math.ceil(st.W * st.D / 5);
    for (let i = 0; i < n; i++) {
      const f = i % h.floors;
      spawnLoot(randomLootItem(), new THREE.Vector3(rand(h.x0 + 1.5, h.x1 - 1.5), h.y + f * 4, rand(h.z0 + 1.5, h.z1 - 1.5)));
    }
  }
  scatterProps(scene, MC.props, houses);
  if (G.mode === 'glory') scatterProps(scene, { flag: 16, lenin: 3 }, houses);
  for (let i = 0; i < 70; i++) {
    const a = rand(0, 6.28), r = Math.sqrt(Math.random()) * ISLAND_R * 0.85;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (heightAt(x, z) < 2) continue;
    spawnLoot(randomLootItem(), new THREE.Vector3(x, heightAt(x, z), z));
  }

  // storm wall
  const sg = new THREE.CylinderGeometry(1, 1, 500, 64, 1, true);
  stormWall = new THREE.Mesh(sg, new THREE.MeshBasicMaterial({ color: 0x8a3cff, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false, fog: false }));
  stormWall.position.y = 0;
  scene.add(stormWall);
  G.storm = newStorm();

  // bus route
  const ang = rand(0, 6.28);
  const dir = new THREE.Vector3(Math.cos(ang), 0, Math.sin(ang));
  const off = new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(rand(-80, 80));
  bus = { obj: makeBus(), from: dir.clone().multiplyScalar(-430).add(off).setY(160), to: dir.clone().multiplyScalar(430).add(off).setY(160), t: 0, dur: 30, pos: new THREE.Vector3(), progress: 0, dir };
  bus.obj.lookAt(bus.to.clone().setY(160).add(dir));
  bus.obj.rotation.y += Math.PI;

  const TS = G.teamSize;
  const total = TS === 1 ? 50 : TS === 2 ? 50 : 48;
  const lives = G.mode === 'reload' ? 3 : G.mode === 'glory' ? Infinity : 1;
  const player = new Player(0);
  player.lives = G.mode === 'glory' ? 1 : lives;
  G.gloryN = total; G.fallen = 0;
  G.player = player;
  G.combatants.push(player);
  makeGlider(player); player.onBody = () => makeGlider(player);
  const pois = houses.length ? houses : [{ x0: 0, z0: 0, x1: 0, z1: 0 }];
  for (let i = 0; i < total - 1; i++) {
    const slot = i + 1;
    const team = Math.floor(slot / TS);
    const h = pois[team % pois.length];
    const land = Math.random() < 0.75 ? new THREE.Vector3((h.x0 + h.x1) / 2 + rand(-8, 8), 0, (h.z0 + h.z1) / 2 + rand(-8, 8)) : new THREE.Vector3(rand(-200, 200), 0, rand(-200, 200));
    const b = new Bot(i, land, team);
    b.lives = lives;
    if (team === 0) b.leader = player;
    makeGlider(b); b.onBody = () => makeGlider(b);
    G.combatants.push(b);
  }
  // teammates share a drop time and landing zone
  const byTeam = {};
  for (const c of G.combatants) (byTeam[c.team] = byTeam[c.team] || []).push(c);
  for (const t in byTeam) { const m = byTeam[t]; if (m[0].isPlayer) continue; for (const c of m) { c.dropAt = m[0].dropAt; c.landing = m[0].landing.clone().add(new THREE.Vector3(rand(-5, 5), 0, rand(-5, 5))); } }
  for (const c of G.combatants) { c.state = 'bus'; c.char.root.visible = false; }
  const bears = (MC.bears || 0) + (G.mode === 'glory' ? 6 : 0);
  if (bears) spawnBears(bears);
  G.respawns = [];

  G.events.kill = (killer, victim, how) => {
    hud.killfeed(killer, victim, how);
    if (victim.lives > 0) G.respawns.push({ c: victim, t: G.mode === 'glory' ? 3 : 5 });
    if (G.mode === 'glory' && !victim.animal) G.fallen++;
    if (victim.isPlayer) onPlayerDeath(killer, how);
    else if (killer?.isPlayer) { hud.center(`ELIMINATED ${victim.name}`, 1.6, true); hud.onPlayerKill(how); if (G.mode === 'glory' && !victim.animal) gloryKill(killer); }
    checkTeams();
  };
  G.events.playerHurt = (hp, sh, info) => { hud.playerHurt(hp, sh, info); if (hp > 10) player.shake = Math.max(player.shake || 0, Math.min(0.5, hp / 70)); };
  G.events.hitmarker = (head, kill, dmg, point, shield) => hud.hitmarker(head, kill, dmg, point, shield);
  G.events.land = (impact) => player.land(impact);
  G.events.screenBlood = (a) => hud.screenBlood(a);
  G.events.center = (t, d) => hud.center(t, d, true);
  G.events.shieldBreak = () => hud.shieldBreak();

  hud.init(player);
  hud.center(TOUCH ? 'TAP JUMP TO DROP FROM THE BUS' : 'PRESS SPACE TO JUMP FROM THE BATTLE BUS', 5);
  hud.radio(`WELCOME TO ${MC.name.toUpperCase()}. РАДИО МОСКВА IS ON AIR.`);
  if (G.mode === 'glory') gloryStart();
  over = false; running = true;
  document.getElementById('end').classList.add('hidden');
}

const teamIn = (t) => G.combatants.some(c => c.team === t && (c.alive || c.lives > 0));
function teamsLeft() { return new Set(G.combatants.filter(c => !c.animal && (c.alive || c.lives > 0)).map(c => c.team)).size; }

function onPlayerDeath(killer, how) {
  const P = G.player;
  if (G.mode === 'glory') { over = true; endT = 3.5; hud.showEnd(false, 0, killer, how); return; }
  if (P.lives > 0) { hud.center(`LIVES LEFT: ${P.lives}  •  RESPAWNING…`, 4); return; }
  if (teamIn(0)) { hud.center('YOU ARE DEAD • SPECTATING TEAMMATE', 4); P.deathMsg = { killer, how }; return; }
  over = true; endT = 3.5;
  hud.showEnd(false, teamsLeft() + 1, killer, how);
}
function checkTeams() {
  if (over || G.mode === 'glory') return;
  if (!teamIn(0)) {
    const P = G.player;
    over = true; endT = 3;
    hud.showEnd(false, teamsLeft() + 1, P.deathMsg?.killer, P.deathMsg?.how || 'eliminated');
    return;
  }
  if (teamsLeft() === 1) { over = true; endT = 2; hud.showEnd(true, 1); }
}

function respawnPoint(c) {
  const S = G.storm;
  const mate = G.combatants.find(m => m !== c && m.team === c.team && m.alive && m.state === 'ground');
  let x, z;
  if (mate) { x = mate.pos.x + rand(-15, 15); z = mate.pos.z + rand(-15, 15); }
  else { const a = rand(0, 6.28), r = Math.sqrt(Math.random()) * Math.min(S.r, 250) * 0.8; x = S.x + Math.cos(a) * r; z = S.z + Math.sin(a) * r; }
  return new THREE.Vector3(x, Math.max(heightAt(x, z) + 110, 120), z);
}

let last = performance.now();
let vm = null;
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (!running) { renderer && scene && renderer.render(scene, camera); return; }
  G.time += dt;
  const P = G.player;

  // bus
  if (bus.t < bus.dur) {
    bus.t += dt;
    bus.progress = Math.min(1, bus.t / bus.dur);
    bus.pos.lerpVectors(bus.from, bus.to, bus.progress);
    bus.obj.position.copy(bus.pos);
    bus.obj.visible = true;
  } else { bus.obj.visible = false; G.storm.started = true; }

  if (P.state === 'bus' && P.alive) {
    P.pos.copy(bus.pos);
    if ((P.jumpFromBus && bus.progress > 0.05) || bus.progress >= 0.98) {
      P.state = 'sky'; P.vel.set(0, -5, 0); P.char.root.visible = true; P.jumpFromBus = false;
      hud.center('', 0);
    }
  }
  // reload-mode respawns
  for (let i = G.respawns.length - 1; i >= 0; i--) {
    const r = G.respawns[i];
    r.t -= dt;
    if (r.c.isPlayer) hud.respawn(Math.ceil(r.t));
    if (r.t <= 0 && !over) {
      const p = respawnPoint(r.c);
      if (G.mode === 'glory' && !r.c.isPlayer) {
        // a fresh comrade takes the fallen one's place
        const old = r.c.name;
        r.c.name = botName(G.gloryN++);
        r.c.charOpts = {};
        r.c.kills = 0;
        if (r.c.team === 0) hud.radio(`${r.c.name} TAKES THE PLACE OF ${old}. СЛАВА ГЕРОЮ!`);
      }
      r.c.respawn(p);
      if (G.mode === 'glory' && !r.c.isPlayer) gloryLoadout(r.c);
      if (r.c.landing) r.c.landing.set(p.x, 0, p.z);
      G.respawns.splice(i, 1);
      if (r.c.isPlayer) { hud.respawn(0); hud.center('ВОЗРОЖДЕНИЕ! BACK INTO THE FIGHT', 2.5); }
    }
  }
  P.update(dt);
  for (const c of G.combatants) if (!c.isPlayer) c.update(dt, bus);
  for (const c of G.combatants) if (c.alive && c.state !== 'bus') c.updateModel(dt, camera.position);
  for (const c of G.corpses) c.update(dt);
  if (!P.alive && !P.spectate?.alive) P.spectate = G.combatants.find(m => m.team === 0 && m.alive && m !== P);

  updateStorm(G.storm, dt);
  updateStructures(dt);
  updateRockets(dt);
  updateGore(dt);
  updateFx(dt);
  updateWorld(dt, camera.position);
  updateProps(G.time);
  updateLoot(dt);
  P.updateCamera(dt);
  setListener(camera.position);

  const focus = P.alive ? P.pos : P.spectate?.alive && P.lives <= 0 ? P.spectate.pos : P.pos;
  sun.position.copy(focus).add(new THREE.Vector3(60, 120, 40));
  sun.target.position.copy(focus);
  world.sky.position.copy(camera.position);

  hud.update(dt, P, bus, G.storm);
  if (over) {
    endT -= dt;
    if (endT <= 0) document.getElementById('end').classList.remove('hidden');
  }
  renderer.clear();
  renderer.render(scene, camera);
  if (P.firstPerson && P.alive && !P.scoped) {
    P.vm.update(dt, P);
    P.vm.cam.aspect = camera.aspect; P.vm.cam.updateProjectionMatrix();
    renderer.clearDepth();
    renderer.render(P.vm.scene, P.vm.cam);
  }
}

setupRenderer();
renderer.autoClear = false;
hud.resize();
requestAnimationFrame(loop);

// menu options
for (const id of ['opt-team', 'opt-mode', 'opt-map']) {
  const el = document.getElementById(id);
  el.addEventListener('click', (e) => {
    const b = e.target.closest('b'); if (!b) return;
    for (const x of el.querySelectorAll('b')) x.classList.toggle('on', x === b);
    if (id === 'opt-team') G.teamSize = +b.dataset.v; else if (id === 'opt-map') G.map = b.dataset.v; else G.mode = b.dataset.v;
  });
}

async function begin() {
  document.getElementById('menu').classList.add('hidden');
  if (!TOUCH) document.body.requestPointerLock?.();
  initAudio();
  start();
}
document.getElementById('warn-ok').onclick = () => {
  document.getElementById('warning').classList.add('hidden');
  document.getElementById('menu').classList.remove('hidden');
};
document.getElementById('play').onclick = begin;
document.getElementById('again').onclick = begin;
document.getElementById('tomenu').onclick = () => {
  document.getElementById('end').classList.add('hidden');
  document.getElementById('hud').classList.add('hidden');
  document.getElementById('menu').classList.remove('hidden');
  running = false;
};
renderer.domElement.addEventListener('click', () => { if (!TOUCH && running && !over) document.body.requestPointerLock?.(); });
