// Glory mode extras: military ranks, heal-on-kill, Putin's approval, rank-up gifts from the motherland
import * as THREE from 'three';
import { G } from './state.js';
import { spawnLoot, makeItem } from './weapons.js';
import { pick, rand } from './util.js';
import * as hud from './hud.js';

export const RANKS = ['РЯДОВОЙ • Private', 'ЕФРЕЙТОР • Corporal', 'СЕРЖАНТ • Sergeant', 'ЛЕЙТЕНАНТ • Lieutenant', 'КАПИТАН • Captain',
  'МАЙОР • Major', 'ПОЛКОВНИК • Colonel', 'ГЕНЕРАЛ • General', 'МАРШАЛ • Marshal', 'ГЕРОЙ РОССИИ • Hero of Russia'];
const PROUD = [
  'ПУТИН ГОРДИТСЯ • PUTIN IS PROUD',
  'ПУТИН ОЧЕНЬ ГОРДИТСЯ • PUTIN IS VERY PROUD',
  'ПУТИН ПЛАЧЕТ ОТ ГОРДОСТИ • PUTIN WEEPS WITH PRIDE',
  'ПУТИН ЗВОНИТ ТВОЕЙ МАМЕ • PUTIN IS CALLING YOUR MOM',
  'ПУТИН СНЯЛ РУБАШКУ • PUTIN TOOK HIS SHIRT OFF FOR YOU',
];
export const GLORY_RADIO = [
  'РАДИО МОСКВА: Putin is watching this match live. He approves of the blood.',
  'РАДИО МОСКВА: For every comrade who falls, two more are already on the bus.',
  'РАДИО МОСКВА: The motherland has infinite soldiers. It does not have infinite you.',
  'РАДИО МОСКВА: Every elimination heals you. This is called Russian healthcare.',
  'РАДИО МОСКВА: Putin reminds you: retreat is not in the dictionary. We removed the page.',
  'РАДИО МОСКВА: Rank up to receive gifts from the Kremlin. Gifts may explode.',
  'РАДИО МОСКВА: Tsar Bomba is not in this game. Yet.',
  'РАДИО МОСКВА: Bears have been drafted. They fight for whoever feeds them.',
];
const GIFTS = [['rpg', 3], ['lmg', 3], ['medkit', 2], ['sniper', 4], ['vodka', 2], ['obrez', 4], ['rpg', 4], ['lmg', 4]];

let rank = 0;
export function gloryStart() {
  rank = 0;
  G.gloryRank = RANKS[0];
  setTimeout(() => hud.radio('РАДИО МОСКВА: SLAVA MODE. Putin is watching. When one falls, another takes his place.'), 1500);
}

export function gloryKill(P) {
  // heal on every kill
  const hp = Math.min(100 - P.hp, 20), sh = Math.min(100 - P.shield, 15);
  P.hp += hp; P.shield += sh;
  if (P.bleed) P.bleed = Math.max(0, P.bleed - 1);
  hud.center(`+${Math.round(hp)} ❤  +${Math.round(sh)} 🛡  ЗА РОДИНУ!`, 1.4, true);
  const r = Math.min(RANKS.length - 1, Math.floor(P.kills / 4));
  if (r > rank) {
    rank = r; G.gloryRank = RANKS[r];
    hud.gloryBanner(PROUD[Math.min(PROUD.length - 1, Math.floor((r - 1) / 2))], `ПОВЫШЕНИЕ: ${RANKS[r]}`);
    const [id, rar] = GIFTS[(r - 1) % GIFTS.length];
    spawnLoot(makeItem(id, rar), P.pos.clone().add(new THREE.Vector3(rand(-1.5, 1.5), 0.2, rand(-1.5, 1.5))));
    hud.radio(`KREMLIN GIFT DELIVERED: ${makeItem(id, rar).def.name.toUpperCase()}. ${pick(['DO NOT DISAPPOINT.', 'USE IT WISELY.', 'PUTIN SIGNED IT.'])}`);
  } else if (P.kills % 3 === 0) hud.gloryBanner(PROUD[0], null);
}

// replacements come back better armed as the war drags on
export function gloryLoadout(c) {
  const t = G.time;
  const pool = t < 90 ? ['ar', 'smg', 'shotgun', 'pistol'] : t < 200 ? ['ar', 'shotgun', 'lmg', 'obrez', 'sniper'] : ['lmg', 'rpg', 'obrez', 'ar', 'sniper'];
  const rar = Math.min(4, Math.floor(t / 70));
  c.slots[1] = makeItem(pick(pool), rar);
  c.shield = Math.min(100, t / 3);
  c.equip(1);
}
