// Map presets: palette, terrain shape, flora, lighting, building styles, props and a landmark
// building style: W/D in 4m cells, floor range, wall/roof materials, optional window gaps / damage / deco
const DACHA = { W: 3, D: 3, floors: [1, 2], wall: 'dacha', roof: 'roof', deco: 'chimney' };
const DACHA_G = { W: 3, D: 2, floors: [1, 1], wall: 'dachaG', roof: 'roof', deco: 'onion' };
const BANYA = { W: 2, D: 2, floors: [1, 1], wall: 'log', roof: 'roof', deco: 'chimney' };
const IZBA = { W: 3, D: 3, floors: [1, 2], wall: 'log', roof: 'snowroof', deco: 'snowpile', found: 0x6a5a4a };
const GULAG = { W: 6, D: 2, floors: [1, 1], wall: 'log', roof: 'snowroof', deco: 'star', found: 0x5a5a5a };
const PANEL = { W: 4, D: 3, floors: [3, 4], wall: 'panel', roof: 'concrete', floor: 'concrete', windows: 0.2, broken: 0.08, deco: 'antenna', found: 0x6a6a64 };
const PANEL_RUIN = { W: 3, D: 3, floors: [2, 3], wall: 'panel', roof: 'concrete', floor: 'concrete', windows: 0.35, broken: 0.25, noRoof: true, found: 0x6a6a64 };
const HANGAR = { W: 5, D: 4, floors: [1, 2], wall: 'tin', roof: 'rust', floor: 'concrete', deco: 'star', found: 0x9a8a78 };
const BUNKER = { W: 3, D: 3, floors: [1, 1], wall: 'concrete', roof: 'concrete', floor: 'concrete', found: 0x7a7a70 };
const STALINKA = { W: 4, D: 4, floors: [2, 4], wall: 'stalin', roof: 'greenroof', floor: 'concrete', windows: 0.1, deco: 'star', found: 0x9a8a78 };
const STALIN_TOWER = { W: 3, D: 3, floors: [4, 6], wall: 'stalin', roof: 'stalin', floor: 'concrete', windows: 0.1, deco: 'spire', found: 0x9a8a78 };
const MSK_PANEL = { W: 4, D: 3, floors: [3, 4], wall: 'panel', roof: 'concrete', floor: 'concrete', windows: 0.12, deco: 'antenna', found: 0x6a6a64 };
export const MAPS = {
  island: {
    name: 'ДАЧНЫЙ ОСТРОВ • Dacha Island',
    skyTop: 0x2f7fe8, skyBot: 0xbfe6ff, fog: 0xbfe6ff, fogNear: 150, fogFar: 700,
    hemiSky: 0xcfe8ff, hemiGround: 0x5a7a3a, hemi: 1.1, sun: 0xfff2d8, sunI: 2.2,
    water: 0x2aa8e0, sand: [0.93, 0.83, 0.55], grass: [0.32, 0.72, 0.25], rock: [0.55, 0.52, 0.5], peak: 42,
    mountain: { x: 110, z: -90, r: 70, h: 45 }, rough: 26,
    trees: 420, leafH: 0.27, leafS: 0.65, leafL: [0.32, 0.45], trunk: 0x8a5a2b, pine: false, dead: false,
    rocks: 90, rockColor: 0x9a9aa6, houses: 18, clouds: 0xffffff, landmark: 'church',
    styles: [DACHA, DACHA, DACHA_G, BANYA], props: { potato: 14, outhouse: 10, hay: 12, lada: 6, flag: 4 },
  },
  siberia: {
    name: 'СИБИРЬ • Siberia',
    skyTop: 0x7a90b0, skyBot: 0xdde6f0, fog: 0xdde6f0, fogNear: 60, fogFar: 420,
    hemiSky: 0xe8f0ff, hemiGround: 0x8a96a6, hemi: 1.25, sun: 0xe8f0ff, sunI: 1.5,
    water: 0x8ab8d0, sand: [0.8, 0.84, 0.88], grass: [0.9, 0.93, 0.97], rock: [0.45, 0.48, 0.55], peak: 30,
    mountain: { x: -60, z: 80, r: 90, h: 60 }, rough: 32,
    trees: 520, leafH: 0.4, leafS: 0.35, leafL: [0.16, 0.24], trunk: 0x4a3222, pine: true, snowCap: true, dead: false,
    rocks: 110, rockColor: 0x6a7080, houses: 15, clouds: 0xf4f6fa, landmark: 'matryoshka', snow: true, bears: 9,
    styles: [IZBA, IZBA, GULAG], props: { tank: 7, logs: 16, snowman: 12 },
  },
  pripyat: {
    name: 'ПРИПЯТЬ • Pripyat',
    skyTop: 0x5a6a4a, skyBot: 0x9aa878, fog: 0x9aa878, fogNear: 50, fogFar: 380,
    hemiSky: 0xd8e8b0, hemiGround: 0x4a4a30, hemi: 1.0, sun: 0xe8f0a0, sunI: 1.6,
    water: 0x5a8a3a, sand: [0.5, 0.48, 0.36], grass: [0.42, 0.46, 0.26], rock: [0.4, 0.4, 0.38], peak: 34,
    mountain: { x: 0, z: 0, r: 1, h: 0 }, rough: 14,
    trees: 300, leafH: 0.18, leafS: 0.4, leafL: [0.22, 0.32], trunk: 0x3a2e24, pine: false, dead: 0.45,
    rocks: 70, rockColor: 0x6a6a64, houses: 20, clouds: 0xa8b090, landmark: 'ferris', toxic: true,
    styles: [PANEL, PANEL, PANEL_RUIN], props: { wreck: 18, barrel: 30, busstop: 5, lenin: 2 },
  },
  steppe: {
    name: 'БАЙКОНУР • Baikonur Steppe',
    skyTop: 0xd05a30, skyBot: 0xf0b078, fog: 0xf0b078, fogNear: 120, fogFar: 650,
    hemiSky: 0xffd8a8, hemiGround: 0x8a6a3a, hemi: 1.1, sun: 0xffb070, sunI: 2.4,
    water: 0x3a7aa0, sand: [0.86, 0.72, 0.46], grass: [0.78, 0.66, 0.34], rock: [0.62, 0.48, 0.36], peak: 38,
    mountain: { x: 130, z: 120, r: 60, h: 30 }, rough: 10,
    trees: 110, leafH: 0.2, leafS: 0.45, leafL: [0.3, 0.4], trunk: 0x6a4a2a, pine: false, dead: 0.3,
    rocks: 150, rockColor: 0xa07a5a, houses: 14, clouds: 0xffe0c0, landmark: 'rocket',
    styles: [HANGAR, BUNKER, BUNKER], props: { dish: 7, fuel: 8, camel: 10, flag: 6 },
  },
  moscow: {
    name: 'МОСКВА • Moscow',
    skyTop: 0x4a5a78, skyBot: 0xc8ccd8, fog: 0xc8ccd8, fogNear: 90, fogFar: 520,
    hemiSky: 0xdde2f0, hemiGround: 0x6a6a70, hemi: 1.15, sun: 0xfff0e0, sunI: 1.9,
    water: 0x4a6a80, sand: [0.6, 0.6, 0.6], grass: [0.46, 0.46, 0.48], rock: [0.5, 0.5, 0.52], peak: 60,
    mountain: { x: 0, z: 0, r: 1, h: 0 }, rough: 5,
    trees: 90, leafH: 0.26, leafS: 0.4, leafL: [0.28, 0.36], trunk: 0xe8e8e0, pine: false, dead: false,
    rocks: 10, rockColor: 0x8a8a8a, houses: 20, clouds: 0xe0e4ec, landmark: 'basil',
    styles: [STALINKA, STALINKA, MSK_PANEL, STALIN_TOWER], props: { lada: 22, lamp: 30, flag: 10, lenin: 3, busstop: 8 }, bears: 3,
  },
};
export const MAP_KEYS = Object.keys(MAPS);
export let MAPCFG = MAPS.island;
export function setMap(k) {
  if (k === 'random' || !MAPS[k]) k = MAP_KEYS[Math.floor(Math.random() * MAP_KEYS.length)];
  MAPCFG = MAPS[k];
  return MAPCFG;
}
