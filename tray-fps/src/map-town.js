// 맵: 지중해 해안 마을 (낮) — 150×150m. 북쪽은 바다·산책로, 남쪽은 공격 진영.
// 폭파 지점 A(서북 안뜰) · B(동북 항구 마당), 중앙 분수 광장, 3개 진입로(A 롱 / 미드 / B 롱).
import * as THREE from 'three';

let seed = 1337;
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
  const set = (n, extra = {}, ud = {}) => {
    const s = A.set(n);
    const m = s ? new THREE.MeshStandardMaterial({ map: s.map, normalMap: s.normalMap, roughnessMap: s.ormMap, metalnessMap: s.ormMap, aoMap: s.ormMap, roughness: 1, metalness: s.ormMap ? 1 : 0, ...extra })
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
    house(W, M, bx0, bz0, bx1, bz1, hh, walls[Math.floor(rnd() * walls.length)]);
    p += w;
  }
}

function house(W, M, x0, z0, x1, z1, h, wall) {
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, sx = x1 - x0, sz = z1 - z0;
  W.box(cx, 0, cz, sx, h, sz, wall);
  W.box(cx, 0, cz, sx + 0.12, 0.9, sz + 0.12, M.stone, { collide: false });          // 석조 기단
  W.box(cx, h, cz, sx + 0.3, 0.18, sz + 0.3, M.stone, { collide: false });           // 처마 몰딩
  if (rnd() < 0.55) roof(W, M, cx, cz, sx, sz, h + 0.18);
  else W.box(cx, h + 0.18, cz, sx - 0.2, 0.7, sz - 0.2, wall, { collide: false });   // 평지붕 난간
  // 파사드 디테일: 4면에 창(덧창)과 문
  const faces = [[sx, cz + sz / 2, 0], [sx, cz - sz / 2, Math.PI], [sz, cx + sx / 2, Math.PI / 2], [sz, cx - sx / 2, -Math.PI / 2]];
  faces.forEach(([fw, off, rot], fi) => {
    const n = Math.max(1, Math.floor(fw / 3.2));
    for (let i = 0; i < n; i++) {
      const t = -fw / 2 + (i + 0.5) * (fw / n);
      const px = fi < 2 ? cx + t : off + Math.sin(rot) * 0.05, pz = fi < 2 ? off + Math.cos(rot) * 0.05 : cz + t;
      for (let fl = 0; fl < Math.floor((h - 1.2) / 3); fl++) {
        const y = 1.5 + fl * 3;
        if (fl === 0 && rnd() < 0.18) { W.box(px, 0, pz, fi < 2 ? 1.25 : 0.14, 2.3, fi < 2 ? 0.14 : 1.25, rnd() < 0.5 ? M.shutter : M.wood, { collide: false }); continue; }
        if (rnd() < 0.15) continue;
        const open = rnd() < 0.35;
        if (open) W.box(px, y, pz, fi < 2 ? 0.9 : 0.1, 1.3, fi < 2 ? 0.1 : 0.9, M.dark, { collide: false });                     // 열린 창 (어두운 실내)
        else W.box(px, y, pz, fi < 2 ? 1.0 : 0.12, 1.4, fi < 2 ? 0.12 : 1.0, M.shutter, { collide: false });                   // 닫힌 덧창
        if (fl > 0 && rnd() < 0.12) W.box(px + (fi < 2 ? 0 : Math.sin(rot) * 0.5), y - 0.15, pz + (fi < 2 ? Math.cos(rot) * 0.5 : 0), fi < 2 ? 1.6 : 1.0, 0.12, fi < 2 ? 1.0 : 1.6, M.stone, { collide: false }); // 발코니
      }
    }
  });
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
