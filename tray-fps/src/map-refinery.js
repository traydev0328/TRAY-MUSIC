// 맵: 사막 정유소 (한낮) — 140×140m. 남쪽 = 공격 진영(출하 야드), 북쪽 = 수비 진영.
// 폭파 지점 A(서북 저장 탱크 단지) · B(동북 증류탑 단지). 중앙을 동서로 가로지르는 고가 파이프랙(밑으로 통과 가능),
// 서쪽 / 중앙 / 동쪽 3개 진입로. 모서리의 플레어 스택(불꽃)과 모래바람이 랜드마크.
import * as THREE from 'three';

let seed = 4242;
const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
let RICH = true;

export function buildRefinery(W) {
  const A = W.A, T = W.tex;
  seed = 4242;
  RICH = !(W.G && W.G.settings && W.G.settings.gfx && W.G.settings.gfx.detail === false);
  const set = (n, extra = {}, ud = {}) => {
    const s = A.set(n);
    const m = s ? new THREE.MeshStandardMaterial({ map: s.map, normalMap: s.normalMap, roughnessMap: s.ormMap, metalnessMap: s.ormMap, aoMap: s.aoMap, roughness: 1, metalness: s.ormMap ? 1 : 0, ...extra })
      : new THREE.MeshStandardMaterial({ color: extra.color || 0xc8b48c, roughness: 0.9 });
    m.userData = { surface: 'concrete', tw: 3, ...ud };
    return m;
  };
  const std = (o, surface, tw = 1) => { const m = new THREE.MeshStandardMaterial(o); m.userData = { surface, tw }; return m; };
  const M = W.mat = {
    sand: set('aerial_beach_01', {}, { tw: 5, surface: 'ground' }),
    conc: set('concrete_floor_worn_001', { color: new THREE.Color(3.4, 3.1, 2.6) }, { tw: 3.5 }),  // 원본이 어두운 회색 → 햇빛에 바랜 모래빛 콘크리트로 밝힘
    road: set('sandstone_cracks', {}, { tw: 4 }),
    rust: set('rusty_metal_02', {}, { tw: 2, surface: 'metal' }),
    plate: set('metal_plate', { map: null, color: 0xe7e2d8, metalness: 0.12, metalnessMap: null, aoMap: null, roughness: 0.9 }, { tw: 2.5, surface: 'metal' }), // 흰 도장 강판: 원본 색은 어두운 갈색이라 버리고 요철·거칠기만 사용
    brick: set('seaworn_sandstone_brick', {}, { tw: 2.5 }),
    clad: set('corrugated_iron_02', {}, { tw: 2.2, surface: 'metal' }),
    cont: [0x7a2a1c, 0x1d4a7a, 0xb0661c, 0x3f5f36].map((c) => set('corrugated_iron_02', { color: c }, { tw: 2.2, surface: 'metal' })),
    yellow: std({ color: 0xd2a01c, roughness: 0.5, metalness: 0.3, normalMap: T.micro }, 'metal'),
    steel: std({ color: 0x5b5f63, roughness: 0.45, metalness: 0.8, normalMap: T.micro }, 'metal'),
    dark: std({ color: 0x1d1e20, roughness: 0.6, metalness: 0.5 }, 'metal'),
    pipeS: std({ color: 0xb9bdc1, roughness: 0.32, metalness: 0.85 }, 'metal'),
    pipeR: std({ color: 0x8c2416, roughness: 0.45, metalness: 0.5 }, 'metal'),
    pipeY: std({ color: 0xc89a1a, roughness: 0.45, metalness: 0.5 }, 'metal'),
    pipeG: std({ color: 0x35603e, roughness: 0.5, metalness: 0.45 }, 'metal'),
    white: std({ color: 0xeeebe4, roughness: 0.45, metalness: 0.2, normalMap: T.micro }, 'metal'),
    glass: std({ color: 0x24323c, roughness: 0.06, metalness: 0.9, envMapIntensity: 1.3 }, 'glass'),
    rubber: std({ color: 0x111112, roughness: 0.85 }, 'metal'),
    stripe: std({ color: 0xc23a1e, roughness: 0.5 }, 'metal'),
    crate: W._std(T.crate), barrier: W._std(T.barrier),
  };
  M.crate.userData = { surface: 'wood', tw: 1.2 }; M.barrier.userData = { surface: 'concrete', tw: 2 };
  const H = W.H;

  // ── 지면: 끝없는 모래 + 포장 구역 ──
  const S = 1400;
  const g = new THREE.PlaneGeometry(S, S); g.rotateX(-Math.PI / 2);
  const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * S / 5, uv.getY(i) * S / 5);
  const ground = new THREE.Mesh(g, M.sand); ground.receiveShadow = true; ground.userData.surface = 'ground';
  W.root.add(ground);
  const pad = (x0, z0, x1, z1, mat = M.conc) => W.box((x0 + x1) / 2, 0, (z0 + z1) / 2, x1 - x0, 0.04, z1 - z0, mat, { collide: false, cast: false });
  pad(-68, -68, 68, -6);              // 북쪽 공정 구역 콘크리트
  pad(-50, 30, 50, 68);               // 남쪽 출하 야드
  pad(-5, -6, 5, 30, M.road); pad(-46, -6, -34, 30, M.road); pad(34, -6, 46, 30, M.road); // 3개 진입로

  // ── 외곽 담장 (사암 벽돌) + 보이지 않는 벽 ──
  for (const [x0, z0, x1, z1] of [[-H, -H - 0.5, H, -H], [-H, H, H, H + 0.5], [-H - 0.5, -H, -H, H], [H, -H, H + 0.5, H]]) {
    W.box((x0 + x1) / 2, 0, (z0 + z1) / 2, Math.max(0.5, x1 - x0), 3.2, Math.max(0.5, z1 - z0), M.brick, { collide: false });
  }
  for (let x = -H; x <= H; x += 8) for (const z of [-H, H]) W.box(x, 0, z, 0.8, 3.6, 0.8, M.brick, { collide: false });
  for (let z = -H; z <= H; z += 8) for (const x of [-H, H]) W.box(x, 0, z, 0.8, 3.6, 0.8, M.brick, { collide: false });
  W.collider(-H - 1, 0, -H, -H, 20, H, 'invisible'); W.collider(H, 0, -H, H + 1, 20, H, 'invisible');
  W.collider(-H, 0, -H - 1, H, 20, -H, 'invisible'); W.collider(-H, 0, H, H, 20, H + 1, 'invisible');

  // ── A: 저장 탱크 단지 (서북) ──
  tank(W, M, -56, -52, 8.5, 11);
  tank(W, M, -58, -14, 6.5, 9);
  tank(W, M, -22, -56, 6, 10);
  bund(W, M, -66, -64, -44, -40); bund(W, M, -66, -24, -48, -4, [1]); bund(W, M, -31, -66, -13, -46, [2]);
  // ── B: 증류탑 단지 (동북) ──
  column(W, M, 54, -46, 2.0, 27); column(W, M, 59, -32, 1.5, 21); column(W, M, 53, -19, 1.25, 16);
  frame(W, M, 60, -56, 68, -10, 3, 6);
  building(W, M, 20, -58, 32, -48, 4.5, M.brick, '제어실');
  // ── 중앙: 고가 파이프랙 (동서) ──
  pipeRack(W, M, -62, 62, -1, 5.4);
  pump(W, M, -6, -24, 6, -14);                       // 중앙 펌프장 (미드 북쪽)
  building(W, M, -28, 6, -14, 22, 7, M.clad, '창고');  // 서-중앙 사이 창고
  building(W, M, 14, 6, 28, 22, 7, M.clad, '창고');    // 동-중앙 사이 창고
  building(W, M, -68, 6, -52, 28, 6, M.brick, '사무동');
  building(W, M, 52, 6, 68, 28, 6, M.brick, '정비동');
  building(W, M, -10, -50, 10, -42, 4, M.brick, '실험실'); // 수비 진영 앞 연결부
  // 바닥 배관 (허리 높이 엄폐물)
  pipeRun(W, M, -30, -8, -10, -8, 0.7, M.pipeY); pipeRun(W, M, 10, -8, 30, -8, 0.7, M.pipeG);
  pipeRun(W, M, -62, 34, -52, 34, 0.55, M.pipeS); pipeRun(W, M, 52, 34, 62, 34, 0.55, M.pipeS);

  // ── 남쪽 출하 야드 ──
  gantry(W, M, -18, 44, 18, 50);
  tanker(W, M, -12, 47, 0); tanker(W, M, 6, 47, 0); tanker(W, M, -36, 58, Math.PI / 2); tanker(W, M, 40, 54, -Math.PI / 2);
  for (const [x, z, r, n] of [[-60, 46, 0, 2], [-60, 54, 0, 1], [60, 44, 0, 2], [58, 60, 0.3, 1], [-22, 64, Math.PI / 2, 1], [24, 63, Math.PI / 2, 2]]) containers(W, M, x, z, r, n);

  // ── 플레어 스택 (북동 모서리) + 굴뚝 ──
  flare(W, M, 64, -64);
  { const gc = cylGeo(1.1, 1.4, 26, 16, M.brick); gc.translate(-64, 13, 64); W.geo(gc, M.brick); W.collider(-65.2, 0, 62.8, -62.8, 26, 65.2, 'concrete'); }

  // ── 엄폐물 (실사 모델) ──
  const hasM = (n) => !!A.models[n];
  const crates = [[-40, -24, 2], [-30, -36, 3], [-44, -38, 1], [32, -38, 2], [42, -24, 3], [46, -40, 1], [0, -32, 2], [-4, 12, 2], [4, 26, 1], [-40, 14, 2], [40, 16, 2], [0, 40, 2], [-28, 56, 2], [30, 52, 1]];
  for (const [x, z, h] of crates) { if (hasM('wooden_military_crate')) W.crateStack(x, z, h); else W.box(x, 0, z, 1.2, 1.2, 1.2, M.crate); }
  if (hasM('cement_bag')) for (const [x, z, ax, n] of [[-38, -40, true, 4], [-46, -28, false, 4], [36, -42, true, 4], [28, -26, false, 4], [0, -2, true, 5], [-40, 30, true, 3], [40, 30, true, 3], [0, 20, true, 4]]) W.bagWall(x, z, ax, n);
  if (hasM('Barrel_01')) for (const [x, z] of [[-34, -26], [-35, -25.2], [44, -34], [-8, -36], [10, 36], [-50, 40], [52, -6]]) W.prop('Barrel_01', x, 0, z, rnd() * 6.28, 1, { surface: 'metal', explosive: { hp: 40, radius: 6.5, dmg: 190 } });
  if (hasM('barrel_03')) for (const [x, z] of [[-27, -44], [-26.3, -44.6], [26, -36], [48, 38], [-46, 22], [12, -30], [-12, 30]]) W.prop('barrel_03', x, 0, z, rnd() * 6.28, 1, { surface: 'metal' });
  if (hasM('propane_tank')) for (const [x, z] of [[24, -44], [-16, -30], [16, 30]]) W.prop('propane_tank', x, 0, z, rnd() * 6.28, 1, { surface: 'metal', explosive: { hp: 60, radius: 8, dmg: 230 } });
  if (hasM('concrete_road_barrier')) for (const [x, z, r] of [[-40, 4, 0], [-38.4, 4, 0], [40, 4, 0], [38.4, 4, 0], [-2, 32, 0], [2, 32, 0], [-26, 34, Math.PI / 2], [26, 34, Math.PI / 2]]) W.prop('concrete_road_barrier', x, 0, z, r, 1, { surface: 'concrete' });
  if (hasM('old_tyre')) for (const [x, z, n] of [[-48, 50, 3], [46, 48, 2]]) W.tyreStack(x, z, n);
  if (hasM('street_lamp_01')) for (const [x, z] of [[-30, 40], [30, 40], [-8, 4], [8, 4], [-40, -8], [40, -8], [0, -60]]) W.prop('street_lamp_01', x, 0, z, rnd() * 6.28, 1.6, { pad: -0.15, surface: 'metal' });

  // ── 폭파 지점 표시 ──
  W.sites = { A: new THREE.Vector3(-38, 0, -31), B: new THREE.Vector3(38, 0, -31) };
  for (const [k, p] of Object.entries(W.sites)) siteMark(W, k, p);

  // ── 스폰 ──
  W.playerSpawn = new THREE.Vector3(0, 0, 58);
  W.menuCam = { x: 8, y: 2.3, z: 18, yaw: 0.62, pitch: 0.1 }; // 메뉴 배경: 탱크 단지와 증류탑 방향
  const snap = (x, z) => { const [i, j] = W.nearestWalkable(...W.cellOf(x, z)); return W.cellCenter(i, j); };
  W._pendingSpawns = () => {
    W.teamSpawns = [[[-5, 58], [0, 56], [5, 58], [-3, 64], [3, 64]].map(([x, z]) => snap(x, z)), [[-5, -62], [0, -64], [5, -62], [-3, -67], [3, -67]].map(([x, z]) => snap(x, z))];
    W.spawnPoints = [[-40, 50], [40, 50], [-40, -4], [40, -4], [0, -36], [-50, -36], [50, -36], [-20, 0], [20, 0], [0, 30]].map(([x, z]) => snap(x, z));
    W.ffaSpawns = [...W.spawnPoints, ...W.teamSpawns[0], ...W.teamSpawns[1]];
  };

  atmosphere(W);
}

// ───────── 형상 도우미 ─────────
// 원기둥: 월드 크기에 맞춘 UV(텍셀 밀도 일정)
function cylGeo(r0, r1, h, seg, mat, open = false) {
  const g = new THREE.CylinderGeometry(r0, r1, h, seg, 1, open);
  const tw = (mat.userData && mat.userData.tw) || 2, uv = g.attributes.uv, circ = Math.PI * 2 * Math.max(r0, r1);
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * circ / tw, uv.getY(i) * h / tw);
  return g;
}
// 원형 단면 충돌: 축 정렬 상자 2개(십자)로 근사 → 모서리 빈 공간 최소화
function cylCollider(W, x, z, r, y0, y1, surface = 'metal') {
  W.collider(x - r, y0, z - r * 0.62, x + r, y1, z + r * 0.62, surface);
  W.collider(x - r * 0.62, y0, z - r, x + r * 0.62, y1, z + r, surface);
}

// 저장 탱크: 흰 강판 몸통 + 원뿔 지붕 + 보강 링 + 꼭대기 난간 + 측면 계단
function tank(W, M, x, z, r, h) {
  const body = cylGeo(r, r, h, 48, M.plate); body.translate(x, h / 2, z); W.geo(body, M.plate);
  const roofG = new THREE.ConeGeometry(r + 0.15, r * 0.18, 48, 1, true); roofG.translate(x, h + r * 0.09, z); W.geo(roofG, M.plate);
  for (const y of [h * 0.33, h * 0.66, h - 0.3]) { const ring = new THREE.TorusGeometry(r + 0.08, 0.08, 6, 48); ring.rotateX(Math.PI / 2); ring.translate(x, y, z); W.geo(ring, M.steel, false); }
  const base = cylGeo(r + 0.4, r + 0.5, 0.35, 48, M.conc); base.translate(x, 0.17, z); W.geo(base, M.conc);
  if (RICH) {
    const rail = new THREE.TorusGeometry(r - 0.3, 0.035, 4, 48); rail.rotateX(Math.PI / 2); rail.translate(x, h + r * 0.12 + 1.0, z); W.geo(rail, M.yellow, false);
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 12) W.box(x + Math.cos(a) * (r - 0.3), h + r * 0.1, z + Math.sin(a) * (r - 0.3), 0.04, 1.0, 0.04, M.yellow, { collide: false, cast: false });
  }
  // 몸통을 감아 오르는 계단 (계단판 + 바깥 난간)
  const steps = Math.ceil(h / 0.25), arc = Math.PI * 0.9, a0 = rnd() * Math.PI * 2;
  for (let i = 0; i < steps; i++) {
    const t = i / steps, a = a0 + t * arc, rr = r + 0.55;
    W.box(x + Math.cos(a) * rr, t * h, z + Math.sin(a) * rr, 1.0, 0.06, 0.32, M.steel, { collide: false, cast: false, rotY: -a });
    if (RICH && i % 3 === 0) W.box(x + Math.cos(a) * (rr + 0.5), t * h, z + Math.sin(a) * (rr + 0.5), 0.04, 1.0, 0.04, M.yellow, { collide: false, cast: false });
  }
  // 경고 띠 + 표기판
  const band = cylGeo(r + 0.02, r + 0.02, 0.5, 48, M.stripe, true); band.translate(x, 2.2, z); W.geo(band, M.stripe, false);
  cylCollider(W, x, z, r + 0.1, 0, h + r * 0.2);
}

// 방유제: 탱크를 둘러싼 낮은 콘크리트 벽 (허리 높이 엄폐). gaps: 0북 1남 2동 3서 — 해당 면 가운데를 터서 통로
function bund(W, M, x0, z0, x1, z1, gaps = []) {
  const h = 1.1, t = 0.4, gw = 5;
  const wall = (ax, az, bx, bz) => W.box((ax + bx) / 2, 0, (az + bz) / 2, Math.max(t, Math.abs(bx - ax)), h, Math.max(t, Math.abs(bz - az)), M.conc);
  const side = (k, ax, az, bx, bz) => {
    if (!gaps.includes(k)) return wall(ax, az, bx, bz);
    const mx = (ax + bx) / 2, mz = (az + bz) / 2, dx = Math.sign(bx - ax), dz = Math.sign(bz - az);
    wall(ax, az, mx - dx * gw / 2, mz - dz * gw / 2); wall(mx + dx * gw / 2, mz + dz * gw / 2, bx, bz);
  };
  side(0, x0, z0, x1, z0); side(1, x0, z1, x1, z1); side(2, x1, z0, x1, z1); side(3, x0, z0, x0, z1);
}

// 증류탑: 가는 원통 + 층마다 원형 작업대 + 사다리 + 반구 머리
function column(W, M, x, z, r, h) {
  const b = cylGeo(r, r, h, 32, M.plate); b.translate(x, h / 2, z); W.geo(b, M.plate);
  const cap = new THREE.SphereGeometry(r, 24, 8, 0, Math.PI * 2, 0, Math.PI / 2); cap.translate(x, h, z); W.geo(cap, M.plate);
  const skirt = cylGeo(r + 0.15, r + 0.3, 2.2, 32, M.conc); skirt.translate(x, 1.1, z); W.geo(skirt, M.conc);
  for (let y = 5; y < h - 1; y += 5) {
    const deck = new THREE.CylinderGeometry(r + 1.0, r + 1.0, 0.08, 32, 1, false); deck.translate(x, y, z); W.geo(deck, M.dark);
    if (RICH) { const rail = new THREE.TorusGeometry(r + 1.0, 0.03, 4, 32); rail.rotateX(Math.PI / 2); rail.translate(x, y + 1.0, z); W.geo(rail, M.yellow, false); }
  }
  // 사다리 + 보호망 기둥
  W.box(x + r + 0.15, 0, z - 0.25, 0.05, h - 0.5, 0.05, M.yellow, { collide: false, cast: false });
  W.box(x + r + 0.15, 0, z + 0.25, 0.05, h - 0.5, 0.05, M.yellow, { collide: false, cast: false });
  if (RICH) for (let y = 0.3; y < h - 0.5; y += 0.4) W.box(x + r + 0.15, y, z, 0.04, 0.03, 0.5, M.yellow, { collide: false, cast: false });
  // 측면 배관
  const p = cylGeo(0.22, 0.22, h * 0.8, 10, M.pipeS); p.translate(x - r - 0.4, h * 0.4, z); W.geo(p, M.pipeS);
  cylCollider(W, x, z, r + 0.3, 0, h);
}

// 철골 구조물: 기둥·보 + 격자 바닥 (사람은 지상에서만 이동, 기둥만 충돌)
function frame(W, M, x0, z0, x1, z1, levels, lh) {
  const xs = [], zs = [];
  for (let x = x0; x <= x1 + 0.01; x += (x1 - x0) / Math.max(1, Math.round((x1 - x0) / 6))) xs.push(x);
  for (let z = z0; z <= z1 + 0.01; z += (z1 - z0) / Math.max(1, Math.round((z1 - z0) / 6))) zs.push(z);
  const top = levels * lh;
  for (const x of xs) for (const z of zs) W.box(x, 0, z, 0.35, top, 0.35, M.yellow, { surface: 'metal' });
  for (let l = 1; l <= levels; l++) {
    const y = l * lh;
    for (const z of zs) W.box((x0 + x1) / 2, y - 0.3, z, x1 - x0, 0.3, 0.22, M.yellow, { collide: false });
    for (const x of xs) W.box(x, y - 0.3, (z0 + z1) / 2, 0.22, 0.3, z1 - z0, M.yellow, { collide: false });
    W.box((x0 + x1) / 2, y, (z0 + z1) / 2, x1 - x0, 0.06, z1 - z0, M.dark, { collide: false });
    // 층마다 장비(드럼형 열교환기)
    for (let i = 0; i < 2; i++) { const g = cylGeo(0.7, 0.7, 4, 16, M.pipeS); g.rotateX(Math.PI / 2); g.translate(x0 + 2 + rnd() * (x1 - x0 - 4), y + 0.8, z0 + 4 + rnd() * (z1 - z0 - 8)); W.geo(g, M.pipeS); }
  }
}

// 고가 파이프랙: 6m 간격 문형 기둥 + 2단 보 + 굵기·색이 다른 배관 다발
function pipeRack(W, M, xa, xb, z, y) {
  const w = 3.2;
  for (let x = xa; x <= xb; x += 6) {
    for (const dz of [-w / 2, w / 2]) W.box(x, 0, z + dz, 0.32, y + 1.4, 0.32, M.steel, { surface: 'metal' });
    W.box(x, y - 0.25, z, 0.24, 0.25, w + 0.3, M.steel, { collide: false });
    W.box(x, y + 1.1, z, 0.24, 0.25, w + 0.3, M.steel, { collide: false });
  }
  const pipes = [[-1.2, 0.35, M.pipeS], [-0.4, 0.25, M.pipeR], [0.3, 0.3, M.pipeS], [1.1, 0.2, M.pipeY], [-0.9, 0.18, M.pipeG, 1.35], [0.2, 0.42, M.pipeS, 1.35], [1.0, 0.22, M.pipeR, 1.35]];
  for (const [dz, r, mat, up] of pipes) {
    const g = cylGeo(r, r, xb - xa, 14, mat); g.rotateZ(Math.PI / 2); g.translate((xa + xb) / 2, y + r + (up || 0), z + dz); W.geo(g, mat);
  }
  // 배관이 땅으로 내려오는 곳 (양 끝)
  for (const x of [xa, xb]) { const g = cylGeo(0.35, 0.35, y, 12, M.pipeS); g.translate(x, y / 2, z - 1.2); W.geo(g, M.pipeS); }
}

// 지면 배관 (지지대 위, 허리 높이 → 엄폐 가능)
function pipeRun(W, M, xa, za, xb, zb, r, mat) {
  const len = Math.hypot(xb - xa, zb - za), ang = Math.atan2(zb - za, xb - xa), y = 0.35 + r;
  const g = cylGeo(r, r, len, 16, mat); g.rotateZ(Math.PI / 2); g.rotateY(-ang); g.translate((xa + xb) / 2, y, (za + zb) / 2); W.geo(g, mat);
  for (let t = 0; t <= len; t += 4) W.box(xa + Math.cos(ang) * t, 0, za + Math.sin(ang) * t, 0.3, 0.35, r * 2 + 0.3, M.conc, { collide: false, rotY: -ang });
  W.collider(Math.min(xa, xb) - r * Math.abs(Math.sin(ang)) - 0.02, 0, Math.min(za, zb) - r * Math.abs(Math.cos(ang)) - 0.02, Math.max(xa, xb) + r * Math.abs(Math.sin(ang)) + 0.02, y + r, Math.max(za, zb) + r * Math.abs(Math.cos(ang)) + 0.02, 'metal');
}

// 건물: 벽 재질 + 평지붕 난간 + 창·문 + 옥상 실외기
function building(W, M, x0, z0, x1, z1, h, wall, name) {
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, sx = x1 - x0, sz = z1 - z0;
  W.box(cx, 0, cz, sx, h, sz, wall);
  W.box(cx, h, cz, sx + 0.2, 0.5, sz + 0.2, wall === M.clad ? M.steel : M.brick, { collide: false });
  const faces = [[sx, cz + sz / 2, 0], [sx, cz - sz / 2, 1], [sz, cx + sx / 2, 2], [sz, cx - sx / 2, 3]];
  for (const [fw, off, fi] of faces) {
    if (Math.abs(off) > W.H - 1) continue;
    const sg = fi === 0 || fi === 2 ? 1 : -1;
    const F = (u, y, n, w, hh, d, mat) => { if (fi < 2) W.box(cx + u, y, off + sg * n, w, hh, d, mat, { collide: false, cast: false }); else W.box(off + sg * n, y, cz + u, d, hh, w, mat, { collide: false, cast: false }); };
    const n = Math.max(1, Math.floor(fw / 4));
    const doorAt = Math.floor(rnd() * n);
    for (let i = 0; i < n; i++) {
      const u = -fw / 2 + (i + 0.5) * (fw / n);
      if (i === doorAt) { F(u, 0, 0.03, wall === M.clad ? 3.6 : 1.2, wall === M.clad ? 3.8 : 2.3, 0.06, wall === M.clad ? M.steel : M.dark); F(u, wall === M.clad ? 3.8 : 2.3, 0.05, wall === M.clad ? 3.8 : 1.4, 0.15, 0.1, M.yellow); continue; }
      F(u, 1.4, 0.015, 1.4, 1.1, 0.03, M.glass);
      F(u, 1.32, 0.06, 1.6, 0.08, 0.14, M.steel);
      F(u, 2.5, 0.05, 1.6, 0.1, 0.1, M.steel);
    }
  }
  if (RICH) for (let i = 0, k = 1 + Math.floor(rnd() * 3); i < k; i++) W.box(cx + (rnd() - 0.5) * (sx - 3), h + 0.5, cz + (rnd() - 0.5) * (sz - 3), 1.1, 0.8, 0.8, M.white, { collide: false });
}

// 펌프장: 낮은 벽돌 벽(엄폐) 안에 펌프 여러 대 + 배관
function pump(W, M, x0, z0, x1, z1) {
  const h = 1.2;
  W.box((x0 + x1) / 2, 0, z0, x1 - x0, h, 0.35, M.brick); W.box((x0 + x1) / 2, 0, z1, x1 - x0, h, 0.35, M.brick);
  W.box(x0, 0, (z0 + z1) / 2 - 2.5, 0.35, h, z1 - z0 - 5, M.brick); W.box(x1, 0, (z0 + z1) / 2 + 2.5, 0.35, h, z1 - z0 - 5, M.brick);
  for (let i = 0; i < 3; i++) {
    const px = x0 + 2.5 + i * 3.5, pz = (z0 + z1) / 2;
    W.box(px, 0, pz, 1.4, 0.3, 2.4, M.conc);
    const m = cylGeo(0.45, 0.45, 1.5, 16, M.pipeG); m.rotateX(Math.PI / 2); m.translate(px, 0.85, pz - 0.3); W.geo(m, M.pipeG);
    const v = cylGeo(0.3, 0.3, 1.4, 12, M.pipeR); v.translate(px, 1.0, pz + 0.7); W.geo(v, M.pipeR);
    W.collider(px - 0.7, 0, pz - 1.2, px + 0.7, 1.5, pz + 1.2, 'metal');
  }
  // 차양 지붕
  W.box((x0 + x1) / 2, 3.6, (z0 + z1) / 2, x1 - x0 + 0.6, 0.12, z1 - z0 + 0.6, M.clad, { collide: false });
  for (const [x, z] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) W.box(x, 0, z, 0.25, 3.6, 0.25, M.steel);
}

// 출하 갠트리: 탱크로리 위로 지나가는 철골 + 주입 팔
function gantry(W, M, x0, z0, x1, z1) {
  const h = 6;
  for (const x of [x0, (x0 + x1) / 2, x1]) for (const z of [z0, z1]) W.box(x, 0, z, 0.4, h, 0.4, M.yellow, { surface: 'metal' });
  W.box((x0 + x1) / 2, h, (z0 + z1) / 2, x1 - x0 + 1, 0.4, z1 - z0 + 1, M.steel, { collide: false });
  W.box((x0 + x1) / 2, h + 0.4, (z0 + z1) / 2, x1 - x0 + 1.4, 0.12, z1 - z0 + 1.4, M.clad, { collide: false });
  for (let x = x0 + 3; x < x1 - 2; x += 6) {
    W.box(x, h - 1.6, (z0 + z1) / 2, 0.18, 1.6, 0.18, M.pipeS, { collide: false });
    const arm = cylGeo(0.1, 0.1, 2.2, 8, M.pipeS); arm.rotateX(0.9); arm.translate(x, h - 2.2, (z0 + z1) / 2 + 0.7); W.geo(arm, M.pipeS, false);
  }
}

// 탱크로리: 운전석 + 은색 탱크 + 바퀴 6개
function tanker(W, M, x, z, rot) {
  const c = Math.cos(rot), s = Math.sin(rot);
  const P = (dx, dz) => [x + dx * c + dz * s, z - dx * s + dz * c];
  const L = 10, Wd = 2.5;
  const put = (dx, y, dz, sx, sy, sz, mat) => { const [px, pz] = P(dx, dz); W.box(px, y, pz, sx, sy, sz, mat, { collide: false, rotY: rot }); };
  put(0, 0.55, 0, Wd - 0.2, 0.4, L, M.dark);                         // 차대
  put(0, 0.95, L / 2 - 1.2, Wd, 2.0, 2.2, M.white);                   // 운전석
  put(0, 1.95, L / 2 - 0.1, Wd - 0.3, 0.8, 0.05, M.glass);            // 앞유리
  const t = cylGeo(1.15, 1.15, L - 3, 24, M.pipeS); t.rotateX(Math.PI / 2); t.rotateY(rot);
  const [tx, tz] = P(0, -1.3); t.translate(tx, 2.1, tz); W.geo(t, M.pipeS);
  for (const dz of [-L / 2 + 1, -L / 2 + 2.3, L / 2 - 1.4]) for (const sd of [-1, 1]) {
    const wg = new THREE.CylinderGeometry(0.5, 0.5, 0.35, 16); wg.rotateZ(Math.PI / 2); wg.rotateY(rot);
    const [wx, wz] = P(sd * (Wd / 2 - 0.1), dz); wg.translate(wx, 0.5, wz); W.geo(wg, M.rubber);
  }
  // 충돌: 회전된 박스의 외접 AABB 대신 축 정렬 회전(0/90°)만 사용
  const ex = Math.abs(c) * Wd / 2 + Math.abs(s) * L / 2, ez = Math.abs(s) * Wd / 2 + Math.abs(c) * L / 2;
  W.collider(x - ex, 0, z - ez, x + ex, 3.3, z + ez, 'metal');
}

// 컨테이너 더미 (n단)
function containers(W, M, x, z, rot, n) {
  for (let i = 0; i < n; i++) {
    const mat = M.cont[Math.floor(rnd() * M.cont.length)];
    const along = Math.abs(Math.sin(rot)) > 0.7;
    W.box(x + (rnd() - 0.5) * 0.3, i * 2.6, z + (rnd() - 0.5) * 0.3, along ? 2.44 : 6.06, 2.59, along ? 6.06 : 2.44, mat, { surface: 'metal' });
  }
}

// 플레어 스택: 45m 철탑 굴뚝 + 꼭대기 불꽃(깜빡임) + 연기
function flare(W, M, x, z) {
  const h = 45;
  const p = cylGeo(0.6, 0.9, h, 16, M.steel); p.translate(x, h / 2, z); W.geo(p, M.steel);
  for (let y = 4; y < h; y += 6) { const r = new THREE.TorusGeometry(0.95, 0.06, 4, 16); r.rotateX(Math.PI / 2); r.translate(x, y, z); W.geo(r, M.stripe, false); }
  for (const [dx, dz] of [[3, 3], [-3, 3], [3, -3], [-3, -3]]) { const g = cylGeo(0.03, 0.03, Math.hypot(h * 0.7, 4.2), 4, M.steel); g.rotateX(dz > 0 ? 0.09 : -0.09); g.rotateZ(dx > 0 ? -0.09 : 0.09); g.translate(x + dx / 2, h * 0.35, z + dz / 2); W.geo(g, M.steel, false); }
  W.collider(x - 1, 0, z - 1, x + 1, h, z + 1, 'metal');
  const tex = glowTex();
  const mk = (sz, col, op) => { const m = new THREE.SpriteMaterial({ map: tex, color: col, transparent: true, opacity: op, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }); const sp = new THREE.Sprite(m); sp.scale.set(sz, sz * 1.6, 1); sp.position.set(x, h + sz * 0.6, z); W.root.add(sp); return sp; };
  const outer = mk(7, new THREE.Color(1.5, 0.45, 0.08), 0.85), inner = mk(3.2, new THREE.Color(1.9, 1.1, 0.35), 0.95);
  const smoke = [];
  const sm = new THREE.SpriteMaterial({ map: tex, color: 0x2a2622, transparent: true, opacity: 0.25, depthWrite: false });
  for (let i = 0; i < 8; i++) { const sp = new THREE.Sprite(sm.clone()); W.root.add(sp); smoke.push({ sp, t: i / 8 }); }
  W.flare = { outer, inner, smoke, x, z, top: h + 4 };
}

function glowTex() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, 'rgba(255,255,255,0.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// 대기 효과: 바람에 날리는 모래 먼지 입자 + 멀리 흘러가는 모래바람 막 + 플레어 불꽃 애니메이션
function atmosphere(W) {
  const N = RICH ? 1600 : 700, R = 30, YH = 4;
  const pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) { pos[i * 3] = (Math.random() - 0.5) * R * 2; pos[i * 3 + 1] = Math.random() * YH; pos[i * 3 + 2] = (Math.random() - 0.5) * R * 2; }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const tex = glowTex();
  const dust = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.028, map: tex, color: 0xc9a979, transparent: true, opacity: 0.5, depthWrite: false, sizeAttenuation: true }));
  dust.frustumCulled = false; W.root.add(dust);
  const sheets = [];
  const shM = new THREE.SpriteMaterial({ map: tex, color: 0xd8bf96, transparent: true, opacity: 0.1, depthWrite: false });
  for (let i = 0; i < (RICH ? 26 : 10); i++) {
    const sp = new THREE.Sprite(shM.clone()); const a = Math.random() * Math.PI * 2, r = 40 + Math.random() * 120;
    sp.position.set(Math.cos(a) * r, 2 + Math.random() * 4, Math.sin(a) * r); sp.scale.set(30 + Math.random() * 30, 7 + Math.random() * 5, 1);
    sp.material.opacity = 0.05 + Math.random() * 0.08; W.root.add(sp); sheets.push(sp);
  }
  const wind = new THREE.Vector3(3.2, 0, 1.4);
  W.onUpdate = (dt, cam, t) => {
    // 먼지: 월드 좌표로 바람 따라 흐르고, 카메라 기준 상자를 벗어나면 반대편으로 순환
    const cx = cam.position.x, cz = cam.position.z;
    const a = g.attributes.position.array;
    for (let i = 0; i < N; i++) {
      let x = a[i * 3] + (wind.x + Math.sin(t * 0.7 + i) * 0.8) * dt, y = a[i * 3 + 1] + Math.sin(t * 1.3 + i * 0.37) * 0.25 * dt, z = a[i * 3 + 2] + (wind.z + Math.cos(t * 0.5 + i) * 0.6) * dt;
      if (x - cx > R) x -= R * 2; else if (x - cx < -R) x += R * 2;
      if (z - cz > R) z -= R * 2; else if (z - cz < -R) z += R * 2;
      if (y > YH) y -= YH; else if (y < 0) y += YH;
      a[i * 3] = x; a[i * 3 + 1] = y; a[i * 3 + 2] = z;
    }
    g.attributes.position.needsUpdate = true;
    for (const sp of sheets) { sp.position.x += wind.x * dt * 0.8; sp.position.z += wind.z * dt * 0.8; if (sp.position.x > 170) sp.position.x -= 340; if (sp.position.z > 170) sp.position.z -= 340; }
    const F = W.flare;
    if (F) {
      const fl = 0.85 + Math.sin(t * 13) * 0.08 + Math.sin(t * 29) * 0.06 + Math.random() * 0.06;
      F.outer.scale.set(7 * fl, 11 * fl, 1); F.inner.scale.set(3.2 * fl, 5.5 * fl, 1);
      F.outer.position.y = F.top + 4 * fl; F.inner.position.y = F.top + 2.2 * fl;
      for (const s of F.smoke) {
        s.t = (s.t + dt * 0.06) % 1;
        const k = s.t; s.sp.position.set(F.x + wind.x * k * 12, F.top + 8 + k * 26, F.z + wind.z * k * 12);
        const sz = 5 + k * 18; s.sp.scale.set(sz, sz, 1); s.sp.material.opacity = 0.28 * (1 - k) * Math.min(1, k * 6);
      }
    }
  };
}

function siteMark(W, letter, p) {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const x = c.getContext('2d');
  x.strokeStyle = 'rgba(240,200,40,0.85)'; x.lineWidth = 10; x.strokeRect(12, 12, 232, 232);
  x.fillStyle = 'rgba(240,200,40,0.85)'; x.font = 'bold 170px Arial, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(letter, 128, 140);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(7, 7), new THREE.MeshStandardMaterial({ map: t, alphaMap: W.tex.paint, transparent: true, depthWrite: false, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -2 }));
  m.rotation.x = -Math.PI / 2; m.position.set(p.x, 0.05, p.z); m.receiveShadow = true;
  W.root.add(m);
}
