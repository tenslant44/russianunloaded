import * as THREE from 'three';
import { G } from './state.js';
import { heightAt } from './world.js';
import { MAPCFG } from './maps.js';
import { RARITY } from './weapons.js';
import { drawScreenSplat } from './goretex.js';
import { rand } from './util.js';
import { GLORY_RADIO } from './glory.js';

const $ = (id) => document.getElementById(id);
const touchUI = document.documentElement.classList.contains('touch-device');
let bc, bctx, drips = [], mapImg, lastSlots = '', centerT = 0, hitT = 0, hurtFlash = 0;
const nums = [];
const tagEls = new Map();
let teamT = 0;

export function resize() {
  bc = $('blood-canvas');
  bc.width = innerWidth; bc.height = innerHeight;
  bctx = bc.getContext('2d');
}

function renderMapImage() {
  const c = document.createElement('canvas'); c.width = c.height = 180;
  const g = c.getContext('2d');
  const img = g.createImageData(180, 180);
  for (let j = 0; j < 180; j++) for (let i = 0; i < 180; i++) {
    const x = (i / 180 - 0.5) * 760, z = (j / 180 - 0.5) * 760;
    const h = heightAt(x, z);
    let r, gg, b;
    const C = MAPCFG, w = C.water;
    const col = (a, k = 1) => [a[0] * 255 * k, a[1] * 255 * k, a[2] * 255 * k];
    if (h < 0.4) { r = (w >> 16 & 255); gg = (w >> 8 & 255); b = (w & 255); }
    else if (h < 2.2) [r, gg, b] = col(C.sand);
    else if (h > C.peak) [r, gg, b] = col(C.rock, 1.1);
    else [r, gg, b] = col(C.grass, 1.05 - Math.min(1, h / 40) * 0.25);
    const o = (j * 180 + i) * 4;
    img.data[o] = r; img.data[o + 1] = gg; img.data[o + 2] = b; img.data[o + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return c;
}

export function init(player) {
  $('hud').classList.remove('hidden');
  mapImg = renderMapImage();
  $('killfeed').innerHTML = '';
  $('tags').innerHTML = ''; tagEls.clear();
  $('respawn').textContent = '';
  lastSlots = '';
  drips = []; streakN = 0; radioT = 25;
  bctx && bctx.clearRect(0, 0, bc.width, bc.height);
}

export function center(text, dur = 2, small = false) {
  const el = $('center-msg');
  el.textContent = text; el.style.fontSize = small ? '26px' : '34px';
  el.style.color = small ? '#ffd84a' : '#fff';
  centerT = dur;
}

export function killfeed(killer, victim, how) {
  const d = document.createElement('div');
  const k = killer && killer !== victim ? killer.name : null;
  const cls = (c) => c?.isPlayer ? 'you' : '';
  d.innerHTML = k ? `<span class="${cls(killer)}">${k}</span> <span class="how">${how}</span> <span class="${cls(victim)}">${victim.name}</span>`
    : `<span class="${cls(victim)}">${victim.name}</span> <span class="how">${how}</span>`;
  const f = $('killfeed');
  f.prepend(d);
  while (f.children.length > 6) f.lastChild.remove();
}

export function playerHurt(hp, sh, info) {
  hurtFlash = Math.min(1, hurtFlash + (hp + sh * 0.3) / 40);
  if (hp <= 0 || !bctx) return;
  const n = Math.ceil(hp / 12);
  for (let i = 0; i < n; i++) {
    const x = rand(0, bc.width), y = rand(0, bc.height * 0.8);
    const edge = Math.random() < 0.7;
    const px = edge ? (Math.random() < 0.5 ? rand(0, bc.width * 0.25) : rand(bc.width * 0.75, bc.width)) : x;
    const r = rand(20, 50) * (hp > 30 ? 1.6 : 1);
    drawScreenSplat(bctx, px, y, r);
    for (let k = 0; k < 2; k++) drips.push({ x: px + rand(-r, r) * 0.6, y: y + rand(0, r * 0.5), v: rand(20, 60), w: rand(3, 8), life: rand(1.5, 4) });
  }
}

// big splatter across the screen from nearby gore
export function screenBlood(amount) {
  if (!bctx) return;
  const n = Math.min(10, Math.ceil(amount * 2));
  for (let i = 0; i < n; i++) {
    const x = rand(bc.width * 0.1, bc.width * 0.9), y = rand(0, bc.height * 0.85);
    const r = rand(18, 45) * Math.min(2.2, 0.7 + amount * 0.35);
    drawScreenSplat(bctx, x, y, r);
    for (let k = 0; k < 3; k++) drips.push({ x: x + rand(-r, r) * 0.6, y: y + rand(0, r * 0.5), v: rand(25, 70), w: rand(3, 9), life: rand(2, 5) });
  }
}
export function shieldBreak() {
  const el = $('shield-fill').parentElement;
  el.animate([{ filter: 'brightness(3)', transform: 'skewX(-12deg) scale(1.08)' }, { filter: 'none', transform: 'skewX(-12deg)' }], { duration: 400 });
  center('ЩИТ СЛОМАН • SHIELD BROKEN', 1.2, true);
}

// Radio Moscow chatter
const RADIO = [
  'РАДИО МОСКВА: The storm is Western propaganda. Stay calm and drink kvass.',
  'РАДИО МОСКВА: Babushka reports 3 enemies near her dacha. She has already handled 2.',
  'РАДИО МОСКВА: Reminder — squatting in combat increases accuracy by 400%.',
  'РАДИО МОСКВА: Lost your leg? In Soviet Russia, leg loses you.',
  'РАДИО МОСКВА: Today\'s weather: cloudy with a chance of limbs.',
  'РАДИО МОСКВА: Please return borrowed kidneys to the nearest tractor.',
  'РАДИО МОСКВА: Pelmeni heal wounds. Science confirms. Science is Babushka.',
  'РАДИО МОСКВА: The bear on the bus is NOT a passenger. Do not feed.',
  'РАДИО МОСКВА: Bleeding? Use bandage. No bandage? Use vodka. No vodka? Rest in peace, comrade.',
  'РАДИО МОСКВА: Shield soaks bullets first. Health is for emergencies only.',
  'РАДИО МОСКВА: Adidas tracksuit gives +10 armor. This is not proven. It is felt.',
  'РАДИО МОСКВА: Ferris wheel in Pripyat still turning. Nobody knows why. Nobody asks.',
  'РАДИО МОСКВА: Cosmonaut Yuri says the rocket is decorative. Please stop climbing it.',
  'РАДИО МОСКВА: Matryoshka inside matryoshka inside your skull. Relax.',
  'РАДИО МОСКВА: Someone left a Lada in the storm. It still runs better than your aim.',
  'РАДИО МОСКВА: Put mayonnaise on your wounds. It does nothing, but tastes nice.',
  'РАДИО МОСКВА: Dacha potatoes are strategic reserve. Do not step on them. Babushka will find you.',
  'РАДИО МОСКВА: Frozen T-34 in Siberia is still under warranty. Warranty expired 1944.',
  'РАДИО МОСКВА: Pripyat barrels glowing green is normal. Please do not lick.',
  'РАДИО МОСКВА: Moscow traffic update: 40 Ladas, 0 moving, 3 on fire.',
  'РАДИО МОСКВА: Camels at Baikonur are cosmonauts in training. Salute them.',
  'РАДИО МОСКВА: Lenin statue has seen things. Lenin statue will not testify.',
  'РАДИО МОСКВА: Khrushchevka elevator out of order since 1971. Use ramp.',
  'РАДИО МОСКВА: Blood on the snow is traditional decoration. Very festive.',
];
let radioT = 20, radioShow = 0;
// glory mode: big red "Putin is proud" banner
export function gloryBanner(title, sub) {
  const el = $('glory-banner');
  el.innerHTML = `<div class="gb-t">${title}</div>${sub ? `<div class="gb-s">${sub}</div>` : ''}`;
  el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
}
export function radio(text) { const el = $('radio'); el.textContent = text; el.classList.add('on'); radioShow = 6; }

// kill streaks
const STREAK = ['', '', 'ДВОЙНОЙ! • DOUBLE KILL', 'ТРОЙНОЙ! • TRIPLE KILL', 'БЕСПРЕДЕЛ! • RAMPAGE', 'ЦАРЬ! • TSAR OF DEATH', 'КОСМОС! • SPACE PROGRAM', 'БАБУШКА ГОРДИТСЯ • BABUSHKA IS PROUD'];
const GORE_WORDS = ['МЯСО!', 'БОРЩ!', 'КРОВЬ!', 'ФАРШ!', 'ОЙ-ОЙ!', 'УЖАС!'];
let streakN = 0, streakT = 0;
export function onPlayerKill(how) {
  streakN = G.time - streakT < 6 ? streakN + 1 : 1;
  streakT = G.time;
  const el = $('streak');
  let t = STREAK[Math.min(streakN, STREAK.length - 1)];
  const gory = /pieces|popped|pelmeni|mist|bits|deleted|borscht|apart/.test(how);
  if (!t && gory) t = GORE_WORDS[Math.floor(Math.random() * GORE_WORDS.length)];
  if (!t) return;
  el.innerHTML = t + (gory && streakN > 1 ? `<small>${how}</small>` : '');
  el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
}

export function hitmarker(head, kill, dmg, point, shield) {
  const el = $('hitmarker');
  el.className = kill ? 'kill' : head ? 'head' : '';
  el.style.opacity = 1; hitT = 0.15;
  const d = document.createElement('div');
  d.textContent = Math.round(dmg);
  d.style.cssText = `position:absolute;font-family:'Luckiest Guy';font-size:${head ? 30 : 24}px;color:${head ? '#ffd84a' : shield ? '#6cf' : '#fff'};text-shadow:0 2px 0 #000,0 0 4px #000;pointer-events:none;`;
  $('hud').appendChild(d);
  nums.push({ el: d, p: point.clone(), t: 0.9, off: rand(-20, 20) });
}

export function showEnd(win, place, killer, how) {
  const t = $('end-title');
  t.textContent = win ? '#1 VICTORY ROYALE' : G.mode === 'glory' ? (G.player.kills >= 4 ? 'ПУТИН ГОРДИТСЯ' : 'СЛАВА ГЕРОЮ') : `#${place}`;
  t.className = win ? 'win' : 'lose';
  if (G.mode === 'glory') {
    $('end-sub').innerHTML = `${killer && killer !== G.player ? `You were <b style="color:#f44">${how}</b> by ${killer.name} • ` : ''}${G.player.kills} eliminations • ${G.fallen} comrades fell<br><span style="color:#ffd84a">★ ${G.gloryRank} ★ ${G.player.kills >= 4 ? '— PUTIN IS PROUD OF YOU' : '— Putin expected more.'}</span>`;
    document.exitPointerLock?.();
    return;
  }
  $('end-sub').innerHTML = win ? `${G.player.kills} eliminations. Glory to the motherland.`
    : killer && killer !== G.player ? `You were <b style="color:#f44">${how}</b> by ${killer.name} • ${G.player.kills} eliminations`
      : `You were <b style="color:#f44">${how}</b> • ${G.player.kills} eliminations`;
  document.exitPointerLock?.();
}

function drawSlots(P) {
  const key = P.slots.map(s => s ? s.id + s.rarity + (s.count || '') : '-').join() + P.sel + P.buildMode;
  if (key === lastSlots) return;
  lastSlots = key;
  $('hotbar').innerHTML = P.slots.map((s, i) => `<div class="slot ${s ? 'r' + s.rarity : ''} ${i === P.sel && !P.buildMode ? 'sel' : ''}" data-i="${i}"><span class="n">${i + 1}</span><span class="nm">${s ? s.def.name + (s.count ? ' x' + s.count : '') : ''}</span></div>`).join('');
}

const _p = new THREE.Vector3();
export function update(dt, P, bus, S) {
  $('health-fill').style.width = P.hp + '%'; $('health-txt').textContent = Math.ceil(P.hp);
  $('shield-fill').style.width = P.shield + '%'; $('shield-txt').textContent = Math.ceil(P.shield);
  $('wood').textContent = P.wood;
  $('alive').textContent = G.combatants.filter(c => !c.animal && (c.alive || c.lives > 0)).length;
  $('lives').textContent = G.mode === 'glory' ? `★ ${G.gloryRank || ''} ★` : G.mode === 'reload' ? '❤'.repeat(Math.max(0, P.lives + (P.alive ? 0 : 0))) + '♡'.repeat(Math.max(0, 3 - P.lives)) : '';
  $('scope').style.display = P.scoped ? 'block' : 'none';
  $('crosshair').style.transform = `translate(0,0) scale(${1 + (P.spread || 0) * 12 + (P.speedNow > 1 ? 0.35 : 0) + (P.grounded ? 0 : 0.6) - (P.aiming ? 0.3 : 0) - (P.crouch ? 0.15 : 0)})`;
  drawTeam(P); drawTags(P);
  $('kills').textContent = P.kills;
  drawSlots(P);
  const it = P.item;
  $('ammo').textContent = P.buildMode ? '' : it?.def.kind === 'gun' ? (P.reloadT > 0 ? 'RELOADING…' : `${it.ammo} / ${it.def.mag}`) : P.useT > 0 ? `USING ${it.def.name.toUpperCase()}… ${P.useT.toFixed(1)}s` : '';
  $('buildbar').classList.toggle('hidden', !P.buildMode);
  for (const el of $('buildbar').children) el.classList.toggle('sel', el.dataset.b === P.buildType);
  $('crosshair').style.display = P.buildMode || P.scoped || !P.alive ? 'none' : '';

  // storm info
  if (S) {
    const p = S.phases[S.phase];
    $('storm-info').textContent = !S.started ? 'BATTLE BUS' : p ? (S.shrinking ? `STORM SHRINKING ${Math.ceil(S.t)}s` : `STORM IN ${Math.ceil(S.t)}s`) : 'FINAL CIRCLE';
  }
  // prompt
  const pr = $('prompt');
  if (P.state === 'bus') { pr.innerHTML = `<kbd>${touchUI ? 'JUMP' : 'SPACE'}</kbd>JUMP`; pr.style.display = 'block'; }
  else if (P.riding && P.alive) { pr.innerHTML = `<kbd>${touchUI ? 'USE' : 'E'}</kbd>СЛЕЗТЬ • DISMOUNT BEAR`; pr.style.display = 'block'; }
  else if (P.nearBear && !P.nearLoot && P.alive) { pr.innerHTML = `<kbd>${touchUI ? 'USE' : 'E'}</kbd>ОСЕДЛАТЬ • RIDE POLAR BEAR`; pr.style.display = 'block'; }
  else if (P.nearLoot && P.alive) {
    const l = P.nearLoot.item;
    pr.innerHTML = `<kbd>${touchUI ? 'USE' : 'E'}</kbd><span style="color:#${RARITY[l.rarity].color.toString(16).padStart(6, '0')}">${RARITY[l.rarity].name} ${l.def.name}</span>`;
    pr.style.display = 'block';
  } else pr.style.display = 'none';

  if (centerT > 0) { centerT -= dt; if (centerT <= 0) $('center-msg').textContent = ''; }
  if (hitT > 0) { hitT -= dt; if (hitT <= 0) $('hitmarker').style.opacity = 0; }

  // damage numbers
  for (let i = nums.length - 1; i >= 0; i--) {
    const n = nums[i];
    n.t -= dt;
    if (n.t <= 0) { n.el.remove(); nums.splice(i, 1); continue; }
    _p.copy(n.p).project(G.camera);
    if (_p.z > 1) { n.el.style.display = 'none'; continue; }
    n.el.style.display = '';
    n.el.style.left = ((_p.x + 1) / 2 * innerWidth + n.off) + 'px';
    n.el.style.top = ((1 - _p.y) / 2 * innerHeight - (0.9 - n.t) * 60 - 30) + 'px';
    n.el.style.opacity = Math.min(1, n.t * 3);
  }

  // blood vignette
  hurtFlash = Math.max(0, hurtFlash - dt * 1.2);
  const low = P.alive ? Math.max(0, (40 - P.hp) / 40) * (0.6 + Math.sin(G.time * 6) * 0.15) : 1;
  const inStorm = S && S.started && Math.hypot(P.pos.x - S.x, P.pos.z - S.z) > S.r;
  const bs = $('blood-screen');
  bs.style.opacity = Math.min(1, hurtFlash + low);
  bs.style.filter = inStorm ? 'hue-rotate(-80deg)' : '';

  // screen blood decay + drips
  if (bctx) {
    bctx.globalCompositeOperation = 'destination-out';
    bctx.fillStyle = `rgba(0,0,0,${dt * 0.22})`;
    bctx.fillRect(0, 0, bc.width, bc.height);
    bctx.globalCompositeOperation = 'source-over';
    for (let i = drips.length - 1; i >= 0; i--) {
      const d = drips[i];
      d.life -= dt;
      if (d.life <= 0) { drips.splice(i, 1); continue; }
      const ny = d.y + d.v * dt;
      bctx.strokeStyle = 'rgba(120,0,0,0.85)'; bctx.lineWidth = d.w; bctx.lineCap = 'round';
      bctx.beginPath(); bctx.moveTo(d.x, d.y); bctx.lineTo(d.x + rand(-0.5, 0.5), ny); bctx.stroke();
      d.y = ny; d.v *= 0.995; d.w *= 0.998;
    }
  }

  // bleeding / radio
  $('bleed-ind').classList.toggle('hidden', !(P.alive && P.bleed > 2));
  radioT -= dt;
  if (radioT <= 0 && S?.started) { radioT = rand(30, 55); const L = G.mode === 'glory' && Math.random() < 0.6 ? GLORY_RADIO : RADIO; radio(L[Math.floor(Math.random() * L.length)]); }
  if (radioShow > 0) { radioShow -= dt; if (radioShow <= 0) $('radio').classList.remove('on'); }

  drawMinimap(P, bus, S);
}

function drawMinimap(P, bus, S) {
  const g = $('minimap').getContext('2d');
  const k = 180 / 760, cx = 90;
  const m = (x) => cx + x * k;
  g.drawImage(mapImg, 0, 0);
  if (S) {
    g.fillStyle = 'rgba(120,40,220,0.45)';
    g.beginPath(); g.rect(0, 0, 180, 180); g.arc(m(S.x), m(S.z), S.r * k, 0, Math.PI * 2, true); g.fill();
    g.strokeStyle = '#fff'; g.lineWidth = 1.5;
    g.beginPath(); g.arc(m(S.nextX), m(S.nextZ), S.nextR * k, 0, Math.PI * 2); g.stroke();
  }
  if (bus && bus.progress < 1) {
    g.strokeStyle = 'rgba(255,255,255,0.8)'; g.setLineDash([4, 3]);
    g.beginPath(); g.moveTo(m(bus.from.x), m(bus.from.z)); g.lineTo(m(bus.to.x), m(bus.to.z)); g.stroke(); g.setLineDash([]);
    g.fillStyle = '#2f7fe8'; g.beginPath(); g.arc(m(bus.pos.x), m(bus.pos.z), 4, 0, 6.28); g.fill();
  }
  g.save();
  g.translate(m(P.pos.x), m(P.pos.z));
  g.rotate(-P.yaw);
  g.fillStyle = '#ffd84a'; g.strokeStyle = '#000'; g.lineWidth = 1;
  g.beginPath(); g.moveTo(0, -7); g.lineTo(5, 5); g.lineTo(0, 2); g.lineTo(-5, 5); g.closePath(); g.fill(); g.stroke();
  g.restore();
}

export function respawn(n) { $('respawn').textContent = n > 0 ? `RESPAWN IN ${n}` : ''; }

function drawTeam(P) {
  teamT -= 1;
  if (teamT > 0) return; teamT = 10;
  if (G.teamSize === 1) { $('team').innerHTML = ''; return; }
  const mates = G.combatants.filter(c => c.team === P.team && c !== P);
  $('team').innerHTML = mates.map(m => `<div class="m ${m.alive ? '' : 'dead'}">${m.name}${G.mode === 'reload' ? ' ' + '❤'.repeat(Math.max(0, m.lives)) : ''}<div class="b"><i style="width:${m.alive ? m.hp : 0}%"></i></div></div>`).join('');
}

// floating name tags: teammates always, enemies when close
const _t = new THREE.Vector3();
function drawTags(P) {
  const cam = G.camera;
  const seen = new Set();
  for (const c of G.combatants) {
    if (c === P || !c.alive || c.state === 'bus' || !c.char) continue;
    const mate = c.team === P.team;
    const d = c.pos.distanceTo(cam.position);
    if (!mate && d > 22) continue;
    _t.copy(c.pos); _t.y += (c.crouch ? 2.1 : 2.7);
    _t.project(cam);
    if (_t.z > 1 || Math.abs(_t.x) > 1.1 || Math.abs(_t.y) > 1.1) continue;
    seen.add(c);
    let el = tagEls.get(c);
    if (!el) { el = document.createElement('div'); el.className = 'tag' + (mate ? ' mate' : ''); el.innerHTML = `<span></span><div class="hb"><i></i></div>`; $('tags').appendChild(el); tagEls.set(c, el); }
    el.firstChild.textContent = c.name + (mate && d > 30 ? ` ${Math.round(d)}m` : '');
    el.querySelector('i').style.width = c.hp + '%';
    el.style.left = ((_t.x + 1) / 2 * innerWidth) + 'px';
    el.style.top = ((1 - _t.y) / 2 * innerHeight) + 'px';
    el.style.display = '';
  }
  for (const [c, el] of tagEls) if (!seen.has(c)) el.style.display = 'none';
}
