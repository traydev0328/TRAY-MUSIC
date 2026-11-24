// 맵: 지중해 해안 마을 (낮) — 150×150m. 북쪽은 바다·산책로, 남쪽은 공격 진영.
// 폭파 지점 A(서북 안뜰) · B(동북 항구 마당), 중앙 분수 광장, 3개 진입로(A 롱 / 미드 / B 롱).
import * as THREE from 'three';

let seed = 1337;
let RICH = true; // 그래픽 옵션 '건물 세부 묘사' (끄면 넝쿨·화분·난간 살·창살 생략)
const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };

// 건물 블록 [x0, z0, x1, z1, 높이]
const BLOCKS = [
  // 외곽 (남/서/동)
  [-75, 66, 75, 75, 11], [-75, -62, -66, 66, 12], [66, -62, 75, 66, 12],
  // 남쪽 (공격 진영 주변)
  [-66, 40, -42, 62, 8], [-30, 44, -9, 62, 7], [9, 44, 30, 62, 9], [42, 40, 66, 62, 8],
  // 중간 지대
  [-66, 8, -46, 30, 9], [-36, 14, -14, 34, 8], [14, 14, 36, 34, 8], [46, 8, 66, 30, 10],
  [-36, -14, -16, 2, 7], [16, -14, 36, 2, 7],
  // 북쪽 (방어 진영 · 폭파 지점 사이)
  [-20, -50, -10, -22, 9], [10, -50, 20, -22, 9],
  [-60, -62, -30, -54, 6], [30, -62, 60, -54, 6],
  // A·B 안쪽 벽
  [-66, -50, -60, -2, 9], [60, -50, 66, -2, 9],
];

export function buildTown(W) {
  const A = W.A, T = W.tex;
  seed = 1337;
  RICH = !(W.G && W.G.settings && W.G.settings.gfx && W.G.settings.gfx.detail === false);
  const set = (n, extra = {}, ud = {}) => {
    const s = A.set(n);
    const m = s ? new THREE.MeshStandardMaterial({ map: s.map, normalMap: s.normalMap, roughnessMap: s.ormMap, metalnessMap: s.ormMap, aoMap: s.aoMap, roughness: 1, metalness: s.ormMap ? 1 : 0, ...extra })
      : new THREE.MeshStandardMaterial({ color: extra.color || 0xd8d2c4, roughness: 0.9 });
    m.userData = { surface: 'concrete', tw: 3, ...ud };
    return m;
  };
  const M = W.mat = {
    white: set('white_stucco', {}, { tw: 3 }),
    beige: set('beige_wall_001', {}, { tw: 3 }),
    stone: set('plastered_stone_wall', {}, { tw: 2.5 }),
    roof: set('clay_roof_tiles', {}, { tw: 2.2 }),
    shutter: set('blue_painted_planks', {}, { tw: 1.4, surface: 'wood' }),
    cobble: set('cobblestone_floor_001', {}, { tw: 2.4 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x1b1712, roughness: 0.8 }),
    wood: new THREE.MeshStandardMaterial({ color: 0x5a3b22, roughness: 0.75, normalMap: T.micro }),
    iron: new THREE.MeshStandardMaterial({ color: 0x1e1f21, roughness: 0.5, metalness: 0.8 }),
    // 폴백 소품용 (모델 로드 실패 시)
    barrier: W._std(T.barrier), crate: W._std(T.crate),
    drumRed: new THREE.MeshStandardMaterial({ color: 0x6a140c, roughness: 0.4, metalness: 0.5 }),
    drumBlue: new THREE.MeshStandardMaterial({ color: 0x123a66, roughness: 0.4, metalness: 0.5 }),
    cone: new THREE.MeshStandardMaterial({ color: 0xd2480e, roughness: 0.5 }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x0c0c0d, roughness: 0.85 }),
    steel: new THREE.MeshStandardMaterial({ color: 0x2a2d31, roughness: 0.45, metalness: 0.85 }),
  };
  // 파사드 디테일 재질
  const std = (o, surface) => { const m = new THREE.MeshStandardMaterial(o); m.userData = { surface, tw: 1 }; return m; };
  M.glass = std({ color: 0x2b3a46, roughness: 0.06, metalness: 0.9, envMapIntensity: 1.4 }, 'glass');
  M.paint = std({ color: 0xece8df, roughness: 0.55, normalMap: T.micro }, 'wood');            // 흰 칠 창살·문틀
  M.door = std({ color: 0x4a2c1a, roughness: 0.6, normalMap: T.micro }, 'wood');
  M.doorG = std({ color: 0x23503a, roughness: 0.55, normalMap: T.micro }, 'wood');             // 녹색 칠 문
  M.pot = std({ color: 0xa4502c, roughness: 0.85 }, 'concrete');
  M.leaf = std({ color: 0x3d6a28, roughness: 0.8, flatShading: true }, 'wood');
  M.flower = std({ color: 0xc8286f, roughness: 0.7, flatShading: true }, 'wood');
  M.tank = std({ color: 0xd9d6cf, roughness: 0.4, metalness: 0.3 }, 'metal');
  M.bulb = std({ color: 0xfff1d0, emissive: 0xffc77a, emissiveIntensity: 2.2, roughness: 0.3 }, 'glass');
  M.signs = [0x1f4b3a, 0x5b2318, 0x1c3557, 0x3a2a1c].map((c) => std({ color: c, roughness: 0.6, normalMap: T.micro }, 'wood'));
  for (const k of ['dark', 'wood', 'iron', 'drumRed', 'drumBlue', 'cone', 'rubber', 'steel']) M[k].userData = { surface: k === 'wood' ? 'wood' : 'metal', tw: 1 };
  M.barrier.userData = { surface: 'concrete', tw: 2 }; M.crate.userData = { surface: 'wood', tw: 1.2 };
  // 차양 천막 (줄무늬 캔버스)
  const awn = (c1, c2) => {
    const c = document.createElement('canvas'); c.width = 64; c.height = 8;
    const x = c.getContext('2d'); for (let i = 0; i < 8; i++) { x.fillStyle = i % 2 ? c1 : c2; x.fillRect(i * 8, 0, 8, 8); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.MeshStandardMaterial({ map: t, roughness: 0.9, side: THREE.DoubleSide }); m.userData = { surface: 'wood', tw: 1 }; return m;
  };
  M.awnings = [awn('#e8e2d2', '#1f5f9a'), awn('#e8e2d2', '#b5412e'), awn('#e8e2d2', '#2f7a52')];

  // ── 지면 (자갈 포장) ──
  const S = W.H * 2 + 10;
  const g = new THREE.PlaneGeometry(S, S); g.rotateX(-Math.PI / 2);
  const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * S / 2.4, uv.getY(i) * S / 2.4);
  const ground = new THREE.Mesh(g, M.cobble); ground.receiveShadow = true; ground.userData.surface = 'ground';
  W.root.add(ground);

  // ── 바다와 산책로 ──
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(1600, 700).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x0b2c3d, roughness: 0.06, metalness: 0.2, normalMap: T.water, normalScale: new THREE.Vector2(0.5, 0.5) }));
  T.water.repeat.set(140, 60);
  sea.position.set(0, -1.6, -W.H - 360);
  W.root.add(sea); W.water = sea;
  W.box(0, -1.6, -W.H - 2, W.H * 2, 1.6, 4, M.stone, { collide: false });          // 방파제
  W.box(0, 0, -W.H + 4.6, W.H * 2, 1.05, 0.6, M.stone);                             // 난간 벽
  W.collider(-W.H, 0, -W.H - 1, W.H, 6, -W.H + 4.3, 'invisible');
  for (let x = -W.H + 4; x < W.H; x += 6) W.box(x, 1.05, -W.H + 4.6, 0.12, 0.9, 0.12, M.iron, { collide: false, cast: false });
  // 외곽 보이지 않는 벽
  W.collider(-W.H - 1, 0, -W.H, -W.H, 20, W.H, 'invisible'); W.collider(W.H, 0, -W.H, W.H + 1, 20, W.H, 'invisible'); W.collider(-W.H, 0, W.H, W.H, 20, W.H + 1, 'invisible');

  // ── 건물 ──
  for (const [x0, z0, x1, z1, h] of BLOCKS) block(W, M, x0, z0, x1, z1, h);

  // ── 중앙 분수 광장 ──
  const cyl = (r1, r2, h, n = 32) => new THREE.CylinderGeometry(r1, r2, h, n);
  const fb = cyl(3.2, 3.4, 0.7); fb.translate(0, 0.35, 2); W.geo(fb, M.stone);
  const fw = new THREE.Mesh(cyl(2.9, 2.9, 0.05).translate(0, 0.62, 2), new THREE.MeshStandardMaterial({ color: 0x2a4a55, roughness: 0.05, metalness: 0.3, normalMap: T.water }));
  W.root.add(fw);
  const fp = cyl(0.45, 0.6, 2.6, 16); fp.translate(0, 1.3, 2); W.geo(fp, M.stone);
  const fbowl = cyl(1.3, 0.5, 0.4, 24); fbowl.translate(0, 2.4, 2); W.geo(fbowl, M.stone);
  W.collider(-3.3, 0, -1.3, 3.3, 0.7, 5.3, 'concrete');
  W.collider(-0.6, 0, 1.4, 0.6, 2.6, 2.6, 'concrete');
  // 시장 노점 (차양)
  for (const [x, z, r, k] of [[-9, -4, 0, 0], [9, 8, Math.PI, 1], [-9, 10, 0, 2], [9, -6, Math.PI, 0]]) stall(W, M, x, z, r, k);

  // ── 엄폐물 ──
  const hasM = (n) => !!A.models[n];
  const crates = [[-40, -32, 3], [-30, -38, 2], [-45, -24, 2], [-28, -27, 1], [34, -32, 3], [44, -38, 2], [28, -26, 2], [50, -24, 1], [-3, -36, 2], [4, 30, 2], [-41, 20, 2], [41, 20, 2], [-2, 52, 2]];
  for (const [x, z, h] of crates) { if (hasM('wooden_military_crate')) W.crateStack(x, z, h); else W.box(x, 0, z, 1.2, 1.2, 1.2, M.crate); }
  if (hasM('cement_bag')) for (const [x, z, ax, n] of [[-36, -44, true, 5], [-50, -34, false, 4], [38, -44, true, 5], [52, -30, false, 4], [-41, 0, true, 3], [41, 0, true, 3], [0, -24, true, 5], [0, 38, true, 4]]) W.bagWall(x, z, ax, n);
  if (hasM('barrel_03')) for (const [x, z] of [[-24, -46], [-23.4, -45.4], [24, -46], [57, -45], [-57, -45], [-12, 40], [12, 40]]) W.prop('barrel_03', x, 0, z, rnd() * 6.28, 1, { surface: 'metal' });
  if (hasM('Barrel_01')) for (const [x, z] of [[-33, -20], [31, -21], [-6, -48]]) W.prop('Barrel_01', x, 0, z, rnd() * 6.28, 1, { surface: 'metal', explosive: { hp: 40, radius: 6.5, dmg: 190 } });
  if (hasM('concrete_road_barrier')) for (const [x, z, r] of [[-41, 36, 0], [-39.4, 36, 0], [41, 36, 0], [39.4, 36, 0], [-3, 18, 0], [3, 18, 0]]) W.prop('concrete_road_barrier', x, 0, z, r, 1, { surface: 'concrete' });
  if (hasM('street_lamp_01')) for (const [x, z] of [[-12, -8], [12, -8], [-12, 12], [12, 12], [-41, 10], [41, 10], [-20, -66], [20, -66], [0, -66]]) W.prop('street_lamp_01', x, 0, z, rnd() * 6.28, 1.6, { pad: -0.15, surface: 'metal' });

  // ── 폭파 지점 표시 (바닥 도색) ──
  W.sites = { A: new THREE.Vector3(-38, 0, -32), B: new THREE.Vector3(38, 0, -32) };
  for (const [k, p] of Object.entries(W.sites)) siteMark(W, k, p);

  // ── 진영 / 스폰 ──
  W.playerSpawn = new THREE.Vector3(0, 0, 58);
  W.menuCam = { x: 4, y: 1.9, z: 24, yaw: 0.12, pitch: 0.05 }; // 메뉴 배경: 분수 광장을 바라봄
  const snap = (x, z) => { const [i, j] = W.nearestWalkable(...W.cellOf(x, z)); return W.cellCenter(i, j); };
  W._pendingSpawns = () => {
    W.teamSpawns = [[[-5, 56], [0, 54], [5, 56], [-3, 64], [3, 64]].map(([x, z]) => snap(x, z)), [[-5, -60], [0, -62], [5, -60], [-3, -66], [3, -66]].map(([x, z]) => snap(x, z))];
    W.spawnPoints = [[-41, 50], [41, 50], [-41, -8], [41, -8], [0, -40], [-52, -40], [52, -40], [-20, 6], [20, 6], [0, 30]].map(([x, z]) => snap(x, z));
    W.ffaSpawns = [...W.spawnPoints, ...W.teamSpawns[0], ...W.teamSpawns[1]];
  };
}

// 블록을 6~11m 폭의 집들로 나눠 높이·벽 재질·덧창·문·지붕을 다르게
function block(W, M, x0, z0, x1, z1, h) {
  const along = (x1 - x0) >= (z1 - z0);
  const len = along ? x1 - x0 : z1 - z0;
  let p = 0;
  const walls = [M.white, M.white, M.beige, M.stone];
  while (p < len - 0.01) {
    const w = Math.min(len - p, 6 + rnd() * 5);
    const hh = Math.max(4, h + (rnd() - 0.5) * 3);
    const bx0 = along ? x0 + p : x0, bx1 = along ? x0 + p + w : x1, bz0 = along ? z0 : z0 + p, bz1 = along ? z1 : z0 + p + w;
    // 같은 블록 안에서 이웃 집과 맞닿은 면(보이지 않음)은 디테일 생략
    const skip = [];
    if (p > 0.01) skip.push(along ? 3 : 1);
    if (p + w < len - 0.01) skip.push(along ? 2 : 0);
    house(W, M, bx0, bz0, bx1, bz1, hh, walls[Math.floor(rnd() * walls.length)], skip);
    p += w;
  }
}

function house(W, M, x0, z0, x1, z1, h, wall, skip = []) {
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, sx = x1 - x0, sz = z1 - z0;
  W.box(cx, 0, cz, sx, h, sz, wall);
  W.box(cx, 0, cz, sx + 0.12, 0.9, sz + 0.12, M.stone, { collide: false });          // 석조 기단
  W.box(cx, h, cz, sx + 0.3, 0.18, sz + 0.3, M.stone, { collide: false });           // 처마 몰딩
  const pitched = rnd() < 0.55;
  if (pitched) roof(W, M, cx, cz, sx, sz, h + 0.18);
  else { W.box(cx, h + 0.18, cz, sx - 0.2, 0.7, sz - 0.2, wall, { collide: false }); rooftop(W, M, cx, cz, sx, sz, h + 0.88); }
  // 집마다 다른 외관 규칙: 창틀 색(벽과 대비), 덧창 성향, 층 띠, 발코니 빈도
  const trim = wall === M.white ? M.beige : M.white;
  const style = { shutter: rnd(), band: rnd() < 0.6, balcony: 0.1 + rnd() * 0.3, door: rnd() < 0.5 ? M.door : M.doorG };
  const floors = Math.max(1, Math.floor((h - 1.2) / 3));
  const faces = [[sx, cz + sz / 2, 0], [sx, cz - sz / 2, 1], [sz, cx + sx / 2, 2], [sz, cx - sx / 2, 3]];
  for (const [fw, off, fi] of faces) {
    if (skip.includes(fi) || Math.abs(off) > W.H - 0.6) continue; // 이웃과 붙은 면·맵 바깥쪽 면
    const sgn = fi === 0 || fi === 2 ? 1 : -1;
    // 면 기준 좌표 (u: 면을 따라, n: 벽에서 바깥으로) → 월드
    const P = (u, n) => (fi < 2 ? [cx + u, off + sgn * n] : [off + sgn * n, cz + u]);
    const F = (u, y, n, w, hh, d, mat, cast = true) => { const [x, z] = P(u, n); if (fi < 2) W.box(x, y, z, w, hh, d, mat, { collide: false, cast }); else W.box(x, y, z, d, hh, w, mat, { collide: false, cast }); };
    // 형상 배치: 로컬 +z(바깥 방향)를 면의 바깥 방향으로 회전한 뒤 이동
    const yaw = [0, Math.PI, Math.PI / 2, -Math.PI / 2][fi];
    const G = (g, u, y, n, mat, cast = true) => { const [x, z] = P(u, n); g.rotateY(yaw); g.translate(x, y, z); W.geo(g, mat, cast); };
    // 층 구분 띠
    if (style.band) for (let fl = 1; fl < floors; fl++) F(0, fl * 3 - 0.08, 0.04, fw, 0.16, 0.08, trim, false);
    // 배수관
    if (fi === 0 && rnd() < 0.5) { const g = new THREE.CylinderGeometry(0.055, 0.055, h, 8); g.translate(0, h / 2, 0); G(g, fw / 2 - 0.3, 0, 0.08, M.iron, false); }
    const n = Math.max(1, Math.floor(fw / 3.2));
    const shopAt = fw > 5.5 && rnd() < 0.22 ? Math.floor(rnd() * n) : -1;
    let doorAt = rnd() < 0.45 ? Math.floor(rnd() * n) : -1; if (doorAt === shopAt) doorAt = -1;
    for (let i = 0; i < n; i++) {
      const u = -fw / 2 + (i + 0.5) * (fw / n);
      for (let fl = 0; fl < floors; fl++) {
        const y0 = fl * 3;
        if (fl === 0 && i === shopAt) { shop(F, G, M, u, Math.min(fw / n - 0.4, 3.2), trim); continue; }
        if (fl === 0 && i === doorAt) { door(F, G, M, u, trim, style.door); continue; }
        if (rnd() < 0.1) continue;
        const bal = fl > 0 && rnd() < style.balcony;
        windowUnit(F, G, M, u, bal ? y0 + 0.05 : y0 + (fl === 0 ? 1.1 : 0.9), 1.0, bal ? 2.15 : 1.4, trim, style.shutter);
        if (bal) balcony(F, G, M, u, y0, 1.0, trim);
        else if (rnd() < 0.18) pots(G, M, u, y0 + (fl === 0 ? 1.1 : 0.9), 0.2);
      }
    }
    // 부겐빌레아 넝쿨 (벽을 타고 오르는 꽃)
    if (rnd() < 0.16) vine(G, M, (rnd() - 0.5) * (fw - 2), Math.min(h - 0.5, 3.5 + rnd() * 3));
  }
}

// 창 한 칸: 반사 유리 + 흰 창살 + 돌 창틀(창턱·상인방·문설주) + 덧창(열림/닫힘/반열림)
function windowUnit(F, G, M, u, y, w, hh, trim, shutterBias) {
  F(u, y, 0.012, w, hh, 0.02, M.glass, false);
  if (RICH) { F(u, y, 0.03, 0.045, hh, 0.035, M.paint, false); F(u, y + hh * 0.62, 0.03, w, 0.045, 0.035, M.paint, false); } // 창살
  F(u, y - 0.09, 0.1, w + 0.3, 0.09, 0.2, trim);                          // 창턱
  F(u, y + hh, 0.06, w + 0.34, 0.2, 0.12, trim);                          // 상인방
  for (const sd of [-1, 1]) F(u + sd * (w / 2 + 0.06), y, 0.05, 0.12, hh, 0.1, trim, false);
  const r = rnd() * 0.6 + shutterBias * 0.4;
  if (r > 0.62) { for (const sd of [-1, 1]) F(u + sd * (w / 2 + 0.14 + w / 4), y, 0.04, w / 2, hh, 0.05, M.shutter); }       // 활짝 열린 덧창
  else if (r > 0.42) { F(u, y, 0.06, w, hh, 0.06, M.shutter); }                                                                // 닫힌 덧창
  else if (r > 0.28) { F(u - w / 4, y, 0.06, w / 2, hh, 0.06, M.shutter); F(u + w / 2 + 0.14 + w / 4, y, 0.04, w / 2, hh, 0.05, M.shutter); } // 반만 열림
}

// 연철 난간 발코니 + 화분
function balcony(F, G, M, u, y0, w, trim) {
  const bw = w + 1.0, d = 0.85;
  F(u, y0 - 0.04, d / 2, bw, 0.12, d, trim);                                 // 바닥 슬래브
  for (const sd of [-1, 1]) F(u + sd * (bw / 2 - 0.15), y0 - 0.34, 0.12, 0.1, 0.3, 0.22, trim, false); // 까치발
  F(u, y0 + 0.98, d - 0.02, bw, 0.045, 0.045, M.iron, false);               // 손잡이
  F(u, y0 + 0.16, d - 0.02, bw, 0.03, 0.03, M.iron, false);
  if (!RICH) { F(u, y0 + 0.08, d - 0.02, bw, 0.9, 0.02, M.iron, false); return; } // 간소화: 난간을 한 장의 판으로
  for (let k = -bw / 2 + 0.05; k <= bw / 2 - 0.04; k += 0.13) F(u + k, y0 + 0.08, d - 0.02, 0.022, 0.9, 0.022, M.iron, false);
  for (const sd of [-1, 1]) { F(u + sd * (bw / 2 - 0.02), y0 + 0.98, d / 2, 0.045, 0.045, d, M.iron, false); for (let k = 0.15; k < d - 0.05; k += 0.17) F(u + sd * (bw / 2 - 0.02), y0 + 0.08, k, 0.022, 0.9, 0.022, M.iron, false); }
  if (rnd() < 0.7) pots(G, M, u + (rnd() < 0.5 ? -1 : 1) * (bw / 2 - 0.3), y0 + 0.08, d - 0.25, true);
}

// 화분 (테라코타 + 잎/꽃)
function pots(G, M, u, y, n, big = false) {
  if (!RICH) return;
  const k = big ? 2 : 1 + Math.floor(rnd() * 2);
  for (let i = 0; i < k; i++) {
    const du = (i - (k - 1) / 2) * 0.34, r = big ? 0.16 : 0.1;
    G(new THREE.CylinderGeometry(r, r * 0.75, r * 1.6, 10).translate(0, r * 0.8, 0), u + du, y, n + 0.06, M.pot, false);
    const lg = new THREE.IcosahedronGeometry(r * 1.35, 0); lg.scale(1, 0.8, 1); G(lg, u + du, y + r * 1.9, n + 0.06, rnd() < 0.45 ? M.flower : M.leaf, false);
  }
}

// 현관: 칠한 나무문 + 돌 문틀 + 계단 + 벽등
function door(F, G, M, u, trim, mat) {
  F(u, 0.15, 0.03, 1.15, 2.25, 0.06, mat);
  for (const dy of [0.45, 1.35]) for (const sd of [-1, 1]) F(u + sd * 0.27, 0.15 + dy, 0.065, 0.42, 0.7, 0.02, mat, false); // 문 판넬
  F(u + 0.4, 1.2, 0.08, 0.06, 0.06, 0.06, M.iron, false);                   // 손잡이
  F(u, 2.4, 0.08, 1.6, 0.26, 0.16, trim);                                   // 상인방
  for (const sd of [-1, 1]) F(u + sd * 0.68, 0.15, 0.07, 0.2, 2.25, 0.14, trim);
  F(u, 0, 0.28, 1.7, 0.15, 0.56, M.stone);                                   // 돌계단
  F(u + 0.95, 2.35, 0.12, 0.14, 0.28, 0.14, M.iron, false);                 // 벽등
  F(u + 0.95, 2.4, 0.2, 0.08, 0.14, 0.08, M.bulb, false);
}

// 가게: 넓은 진열창 + 간판 + 줄무늬 차양
function shop(F, G, M, u, w, trim) {
  F(u, 0.55, 0.012, w, 2.0, 0.02, M.glass, false);
  F(u, 0.15, 0.06, w + 0.2, 0.4, 0.12, M.signs[Math.floor(rnd() * M.signs.length)]);   // 하부 판넬
  for (const k of [-0.5, 0, 0.5]) F(u + k * w, 0.55, 0.04, 0.07, 2.0, 0.06, M.paint, false);
  F(u, 2.6, 0.08, w + 0.4, 0.5, 0.1, M.signs[Math.floor(rnd() * M.signs.length)]);       // 간판
  for (const sd of [-1, 1]) F(u + sd * (w / 2 + 0.12), 0.15, 0.06, 0.2, 2.45, 0.12, trim);
  // 차양: 벽에서 앞으로 기울어진 천
  const a = new THREE.PlaneGeometry(w + 0.3, 1.5); a.rotateX(-Math.PI / 2 + 0.42);
  G(a, u, 2.35, 0.7, M.awnings[Math.floor(rnd() * M.awnings.length)], false);
  if (rnd() < 0.6) pots(G, M, u + w / 2 - 0.2, 0, 0.35, true);
}

// 부겐빌레아: 줄기가 벽을 타고 올라가 위쪽에서 넓게 퍼지는 작은 잎·꽃 무리
function vine(G, M, u, top) {
  if (!RICH) return;
  const stem = new THREE.CylinderGeometry(0.03, 0.05, top * 0.8, 5); stem.translate(0, top * 0.4, 0); G(stem, u, 0, 0.05, M.wood, false);
  // 덩굴 덮개: 아래는 좁고 위로 갈수록 옆으로 넓게 퍼짐 (지붕선 아래 캐노피)
  for (let i = 0; i < 110; i++) {
    const t = Math.pow(rnd(), 0.6), y = 0.6 + t * top;
    const spread = 0.25 + t * t * 2.4;
    const g = new THREE.IcosahedronGeometry(0.08 + rnd() * 0.1, 0);
    g.scale(1, 0.8, 0.45);
    G(g, u + (rnd() - 0.5) * spread * 2, y, 0.06 + rnd() * 0.12, rnd() < 0.6 ? M.flower : M.leaf, false);
  }
}

// 평지붕 위 설비: 물탱크·실외기·안테나
function rooftop(W, M, cx, cz, sx, sz, y) {
  if (rnd() < 0.55) { const r = 0.45 + rnd() * 0.2, g = new THREE.CylinderGeometry(r, r, 1.1, 16); g.rotateZ(Math.PI / 2); g.translate(cx + (rnd() - 0.5) * (sx - 2.5), y + r + 0.15, cz + (rnd() - 0.5) * (sz - 2.5)); W.geo(g, M.tank); }
  for (let i = 0, k = Math.floor(rnd() * 3); i < k; i++) W.box(cx + (rnd() - 0.5) * (sx - 2), y, cz + (rnd() - 0.5) * (sz - 2), 0.8, 0.6, 0.35, M.tank, { collide: false });
  if (rnd() < 0.35) { const g = new THREE.CylinderGeometry(0.02, 0.02, 2.2, 5); g.translate(cx + (rnd() - 0.5) * (sx - 2), y + 1.1, cz + (rnd() - 0.5) * (sz - 2)); W.geo(g, M.iron, false); }
}

// 박공 지붕 (점토 기와)
function roof(W, M, cx, cz, sx, sz, y) {
  const along = sx >= sz;
  const L = (along ? sx : sz) + 0.5, D = (along ? sz : sx) + 0.5, rh = Math.min(2.4, D * 0.32);
  const g = new THREE.BufferGeometry();
  const hd = D / 2, hl = L / 2;
  // 두 경사면 (각 4꼭짓점 → 2삼각형)
  const pos = [-hl, 0, -hd, hl, 0, -hd, hl, rh, 0, -hl, 0, -hd, hl, rh, 0, -hl, rh, 0,
    -hl, 0, hd, -hl, rh, 0, hl, rh, 0, -hl, 0, hd, hl, rh, 0, hl, 0, hd,
    // 박공 삼각형
    -hl, 0, -hd, -hl, rh, 0, -hl, 0, hd, hl, 0, -hd, hl, 0, hd, hl, rh, 0];
  const slope = Math.hypot(hd, rh);
  const uvs = [0, 0, L, 0, L, slope, 0, 0, L, slope, 0, slope, 0, 0, 0, slope, L, slope, 0, 0, L, slope, L, 0, 0, 0, hd, rh, D, 0, 0, 0, D, 0, hd, rh].map((v) => v / 2.2);
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.computeVertexNormals();
  if (!along) g.rotateY(Math.PI / 2);
  g.translate(cx, y, cz);
  W.geo(g, M.roof);
}

function stall(W, M, x, z, rot, k) {
  const c = Math.cos(rot), s = Math.sin(rot);
  const P = (dx, dz) => [x + dx * c + dz * s, z - dx * s + dz * c];
  const [tx, tz] = P(0, 0);
  W.box(tx, 0, tz, 2.6, 0.95, 1.1, M.wood);
  for (const [dx, dz] of [[-1.25, -0.5], [1.25, -0.5], [-1.25, 1.2], [1.25, 1.2]]) { const [px, pz] = P(dx, dz); W.box(px, 0, pz, 0.07, 2.4, 0.07, M.wood, { collide: false }); }
  const a = new THREE.PlaneGeometry(2.9, 2.2); a.rotateX(-Math.PI / 2 + 0.25); a.rotateY(rot); const [ax, az] = P(0, 0.35); a.translate(ax, 2.35, az);
  W.geo(a, M.awnings[k]);
}

function siteMark(W, letter, p) {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const x = c.getContext('2d');
  x.strokeStyle = 'rgba(240,200,40,0.85)'; x.lineWidth = 10; x.strokeRect(12, 12, 232, 232);
  x.fillStyle = 'rgba(240,200,40,0.85)'; x.font = 'bold 170px Arial, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(letter, 128, 140);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(7, 7), new THREE.MeshStandardMaterial({ map: t, alphaMap: W.tex.paint, transparent: true, depthWrite: false, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -2 }));
  m.rotation.x = -Math.PI / 2; m.position.set(p.x, 0.015, p.z); m.receiveShadow = true;
  W.root.add(m);
}
