// 사실적 전술 대원 모델 — 회전체(Lathe) 신체 + 위장복 직물 + 방탄 장비 + IK 파지 자세.
// 한 번 만든 원본(템플릿)을 복제해 쓰므로 인원이 늘어도 생성 비용이 작다.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import * as TX from './textures.js';

let TEMPLATE = null;

// ── 위장복 텍스처 (멀티캠 계열 5색) + 직물 짜임 노멀 ──
function camoTextures() {
  const S = 512;
  const n1 = TX.fbm(S, 6, 6, 5, 901), n2 = TX.fbm(S, 10, 10, 4, 902), n3 = TX.fbm(S, 16, 16, 3, 903);
  const c = document.createElement('canvas'); c.width = c.height = S;
  const ctx = c.getContext('2d'); const img = ctx.createImageData(S, S);
  const pal = [[0.42, 0.37, 0.27], [0.33, 0.29, 0.2], [0.24, 0.25, 0.16], [0.53, 0.47, 0.35], [0.17, 0.14, 0.1]];
  const h = new Float32Array(S * S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = y * S + x;
    let col = pal[0];
    if (n1[i] > 0.56) col = pal[1];
    if (n2[i] > 0.6) col = pal[2];
    if (n3[i] > 0.66) col = pal[3];
    if (n2[i] < 0.3 && n3[i] > 0.55) col = pal[4];
    // 직물 짜임 (가로·세로 실)
    const weave = (Math.sin(x * 1.6) * Math.sin(y * 1.6)) * 0.5 + 0.5;
    const shade = 0.9 + weave * 0.12 + (n3[i] - 0.5) * 0.12;
    img.data[i * 4] = Math.pow(col[0] * shade, 1 / 2.2) * 255;
    img.data[i * 4 + 1] = Math.pow(col[1] * shade, 1 / 2.2) * 255;
    img.data[i * 4 + 2] = Math.pow(col[2] * shade, 1 / 2.2) * 255;
    img.data[i * 4 + 3] = 255;
    h[i] = weave * 0.6 + n1[i] * 0.5; // 주름 + 짜임
  }
  ctx.putImageData(img, 0, 0);
  const map = new THREE.CanvasTexture(c); map.colorSpace = THREE.SRGBColorSpace; map.wrapS = map.wrapT = THREE.RepeatWrapping;
  // 노멀
  const nd = new Uint8Array(S * S * 4);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = y * S + x, xl = y * S + ((x + S - 1) % S), xr = y * S + ((x + 1) % S), yu = ((y + S - 1) % S) * S + x, yd = ((y + 1) % S) * S + x;
    const dx = (h[xr] - h[xl]) * 2.2, dy = (h[yd] - h[yu]) * 2.2, inv = 1 / Math.hypot(dx, dy, 1);
    nd[i * 4] = (-dx * inv * 0.5 + 0.5) * 255; nd[i * 4 + 1] = (-dy * inv * 0.5 + 0.5) * 255; nd[i * 4 + 2] = (inv * 0.5 + 0.5) * 255; nd[i * 4 + 3] = 255;
  }
  const normal = new THREE.DataTexture(nd, S, S); normal.wrapS = normal.wrapT = THREE.RepeatWrapping; normal.generateMipmaps = true; normal.minFilter = THREE.LinearMipmapLinearFilter; normal.needsUpdate = true;
  return { map, normal };
}

function mats() {
  const camo = camoTextures();
  const nylonN = TX.microDetail(921);
  const m = (o) => new THREE.MeshStandardMaterial(o);
  return {
    camo: m({ map: camo.map, normalMap: camo.normal, normalScale: new THREE.Vector2(0.8, 0.8), roughness: 0.93, metalness: 0 }),
    plate: m({ color: 0x6b5a42, normalMap: nylonN, normalScale: new THREE.Vector2(1.2, 1.2), roughness: 0.88 }),
    gear: m({ color: 0x3a3a30, normalMap: nylonN, roughness: 0.85 }),
    black: m({ color: 0x171717, normalMap: nylonN, normalScale: new THREE.Vector2(0.6, 0.6), roughness: 0.82 }),
    helmet: m({ color: 0x55573f, normalMap: nylonN, normalScale: new THREE.Vector2(0.35, 0.35), roughness: 0.6, metalness: 0.05 }),
    lens: m({ color: 0x0a0c0e, roughness: 0.05, metalness: 0.6 }),
    boot: m({ color: 0x4a3a28, normalMap: nylonN, roughness: 0.62 }),
    sole: m({ color: 0x141414, roughness: 0.9 }),
    metal: m({ color: 0x2a2b2d, roughness: 0.35, metalness: 0.85 }),
    band: new THREE.MeshBasicMaterial({ color: 0x40ff80, name: 'teamband' }),
  };
}

// 근육 굴곡이 있는 팔다리 (위에서 아래로 -y 방향)
function limb(len, r0, r1, r2, seg = 14) {
  const pts = [
    new THREE.Vector2(0.001, 0.01), new THREE.Vector2(r0 * 0.85, 0), new THREE.Vector2(r0, -len * 0.08),
    new THREE.Vector2(r1 * 1.04, -len * 0.32), new THREE.Vector2(r1, -len * 0.55), new THREE.Vector2((r1 + r2) / 2, -len * 0.78),
    new THREE.Vector2(r2, -len * 0.96), new THREE.Vector2(r2 * 0.75, -len - 0.005), new THREE.Vector2(0.001, -len - 0.012),
  ];
  return new THREE.LatheGeometry(pts, seg);
}
function lathe(points, seg = 18) { return new THREE.LatheGeometry(points.map(([r, y]) => new THREE.Vector2(r, y)), seg); }
const RB = (w, h, d, r = 0.015) => new RoundedBoxGeometry(w, h, d, 2, r);

// 그룹의 직속 메시들을 재질별로 병합 (드로우콜 절감)
function bake(group, part = 'body') {
  const byMat = new Map();
  for (const ch of [...group.children]) {
    if (!ch.isMesh) continue;
    ch.updateMatrix();
    let g = ch.geometry.index ? ch.geometry.toNonIndexed() : ch.geometry.clone();
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    g.applyMatrix4(ch.matrix);
    if (!byMat.has(ch.material)) byMat.set(ch.material, []);
    byMat.get(ch.material).push(g);
    group.remove(ch);
  }
  for (const [mat, list] of byMat) {
    const mesh = new THREE.Mesh(mergeGeometries(list, false), mat);
    mesh.castShadow = true; mesh.receiveShadow = true;
    mesh.userData.part = part;
    group.add(mesh);
  }
}

// 2-본 IK: 어깨(S)에서 목표(T)까지 상완 L1, 전완 L2. pole 방향으로 팔꿈치를 굽힌다.
function solveArm(sh, el, S, T, L1, L2, pole) {
  const d = new THREE.Vector3().subVectors(T, S);
  const D = Math.min(d.length(), L1 + L2 - 0.001); d.normalize();
  const a = Math.acos(THREE.MathUtils.clamp((L1 * L1 + D * D - L2 * L2) / (2 * L1 * D), -1, 1));
  const n = new THREE.Vector3().crossVectors(d, pole).normalize();
  const u = d.clone().applyAxisAngle(n, a);             // 상완 방향
  const E = S.clone().addScaledVector(u, L1);            // 팔꿈치
  const f = new THREE.Vector3().subVectors(T, E).normalize();
  const down = new THREE.Vector3(0, -1, 0);
  const qs = new THREE.Quaternion().setFromUnitVectors(down, u);
  const qf = new THREE.Quaternion().setFromUnitVectors(down, f);
  sh.quaternion.copy(qs);
  el.quaternion.copy(qs.clone().invert().multiply(qf));
}

function buildTemplate(G) {
  const M = mats();
  const root = new THREE.Group();
  const body = new THREE.Group(); body.name = 'body'; root.add(body);
  const add = (parent, geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => {
    const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.scale.set(sx, sy, sz); parent.add(m); return m;
  };
  const hips = new THREE.Group(); hips.name = 'hips'; hips.position.y = 0.98; body.add(hips);
  // 골반·벨트
  add(hips, lathe([[0.001, 0.08], [0.15, 0.07], [0.165, 0], [0.15, -0.09], [0.001, -0.1]]), M.camo, 0, 0, 0, 0, 0, 0, 1, 1, 0.72);
  add(hips, RB(0.36, 0.06, 0.25, 0.02), M.gear, 0, 0.05, 0);
  for (const [x, z] of [[-0.12, 0.11], [0.12, 0.11], [0.17, 0], [-0.17, -0.02]]) add(hips, RB(0.07, 0.09, 0.05, 0.012), M.gear, x, 0.02, z);
  add(hips, RB(0.06, 0.16, 0.05, 0.012), M.black, 0.19, -0.1, 0.03); // 허벅지 권총집
  bake(hips);

  const spine = new THREE.Group(); spine.name = 'spine'; spine.position.y = 0.08; hips.add(spine);
  // 몸통 (가슴이 넓고 허리가 좁은 회전체, 앞뒤로 납작)
  add(spine, lathe([[0.001, 0], [0.15, 0.01], [0.155, 0.12], [0.185, 0.3], [0.2, 0.44], [0.17, 0.56], [0.08, 0.62], [0.001, 0.63]], 20), M.camo, 0, 0, 0, 0, 0, 0, 1, 1, 0.66);
  // 플레이트 캐리어 + 컴머번드 + 탄창 파우치 + 어깨끈 + 배낭
  add(spine, RB(0.34, 0.34, 0.06, 0.02), M.plate, 0, 0.36, 0.125);
  add(spine, RB(0.34, 0.36, 0.06, 0.02), M.plate, 0, 0.37, -0.125);
  add(spine, RB(0.4, 0.14, 0.27, 0.03), M.plate, 0, 0.25, 0);
  for (const x of [-0.1, 0, 0.1]) add(spine, RB(0.085, 0.13, 0.055, 0.012), M.plate, x, 0.27, 0.175);
  add(spine, RB(0.2, 0.08, 0.04, 0.01), M.gear, 0, 0.44, 0.165);
  for (const x of [-0.12, 0.12]) add(spine, RB(0.07, 0.03, 0.27, 0.01), M.plate, x, 0.545, 0);
  add(spine, RB(0.3, 0.36, 0.14, 0.04), M.gear, 0, 0.38, -0.215);
  add(spine, new THREE.CylinderGeometry(0.06, 0.07, 0.09, 12), M.black, 0, 0.63, 0); // 목 (발라클라바)
  bake(spine);

  // 머리: 발라클라바 + 헬멧(레일·NVG 마운트·귀마개) + 보안경
  const head = new THREE.Group(); head.name = 'head'; head.position.y = 0.75; spine.add(head);
  add(head, new THREE.SphereGeometry(0.1, 20, 16), M.black, 0, 0, 0.005, 0, 0, 0, 0.92, 1.1, 1.02);
  add(head, new THREE.SphereGeometry(0.128, 24, 14, 0, Math.PI * 2, 0, Math.PI * 0.52), M.helmet, 0, 0.022, -0.008, -0.12, 0, 0, 1, 0.95, 1.1);
  add(head, new THREE.TorusGeometry(0.126, 0.007, 6, 28), M.helmet, 0, 0.02, -0.01, Math.PI / 2 - 0.12, 0, 0, 1, 1.1, 1);
  for (const s of [-1, 1]) {
    add(head, RB(0.012, 0.03, 0.12, 0.004), M.metal, s * 0.118, 0.035, -0.01);
    add(head, new THREE.CylinderGeometry(0.045, 0.045, 0.035, 16), M.gear, s * 0.095, -0.005, 0.0, 0, 0, Math.PI / 2);
  }
  add(head, RB(0.05, 0.035, 0.03, 0.008), M.metal, 0, 0.085, 0.118);
  add(head, new THREE.CylinderGeometry(0.104, 0.104, 0.034, 24, 1, true, -0.85, 1.7), M.lens, 0, 0.02, 0.005);
  bake(head, 'head');

  // 팔
  const arms = [];
  for (const sd of [-1, 1]) {
    const sh = new THREE.Group(); sh.name = `sh${sd}`; sh.position.set(sd * 0.215, 0.52, 0); spine.add(sh);
    add(sh, new THREE.SphereGeometry(0.07, 14, 10), M.camo, 0, 0, 0);
    add(sh, limb(0.29, 0.058, 0.055, 0.044), M.camo);
    add(sh, RB(0.07, 0.03, 0.12, 0.012), M.band, 0, -0.08, 0, 0, 0, Math.PI / 2, 1, 1, 1); // 팀 완장
    bake(sh);
    sh.children.forEach((c) => { if (c.material === M.band) c.userData.band = true; });
    const el = new THREE.Group(); el.name = `el${sd}`; el.position.y = -0.29; sh.add(el);
    add(el, limb(0.26, 0.046, 0.045, 0.036), M.camo);
    add(el, RB(0.07, 0.06, 0.075, 0.02), M.black, 0, 0, 0);          // 팔꿈치 보호대
    add(el, RB(0.06, 0.1, 0.045, 0.018), M.black, 0, -0.31, 0.005);   // 장갑
    bake(el);
    arms.push({ sh, el, sd });
  }
  // 다리
  for (const sd of [-1, 1]) {
    const hp = new THREE.Group(); hp.name = `hp${sd}`; hp.position.set(sd * 0.095, -0.04, 0); hips.add(hp);
    add(hp, limb(0.44, 0.088, 0.08, 0.058), M.camo, 0, 0, 0, 0, 0, 0, 1, 1, 0.95);
    add(hp, RB(0.07, 0.12, 0.06, 0.015), M.plate, sd * 0.07, -0.2, 0.0); // 다리 파우치
    bake(hp);
    const kn = new THREE.Group(); kn.name = `kn${sd}`; kn.position.y = -0.44; hp.add(kn);
    add(kn, limb(0.43, 0.06, 0.056, 0.043), M.camo);
    add(kn, RB(0.1, 0.12, 0.05, 0.025), M.black, 0, -0.03, 0.06);      // 무릎 보호대
    add(kn, RB(0.105, 0.13, 0.25, 0.03), M.boot, 0, -0.43, 0.04);       // 전투화
    add(kn, RB(0.11, 0.03, 0.27, 0.01), M.sole, 0, -0.5, 0.045);
    bake(kn);
  }
  // 소총: 1인칭 모델을 복제(팔·섬광 제외) → 같은 디테일
  const gunHolder = new THREE.Group(); gunHolder.name = 'gun'; spine.add(gunHolder);
  const src = G.weapons.models.rifle.gun;
  const gun = new THREE.Group();
  for (const ch of src.children) {
    if (ch === G.weapons.arms.L.g || ch === G.weapons.arms.R.g || ch === G.weapons.models.rifle.flash) continue;
    if (ch.isMesh) gun.add(ch.clone());
  }
  bake(gun);
  gun.rotation.y = Math.PI;                    // 1인칭 모델은 -z 가 앞, 캐릭터는 +z 가 앞
  gunHolder.add(gun);
  gunHolder.position.set(0.07, 0.4, 0.2);
  const muzzle = new THREE.Object3D(); muzzle.name = 'muzzle'; muzzle.position.set(0, 0.03, 0.74); gunHolder.add(muzzle);
  // IK: 오른손 → 손잡이, 왼손 → 총열 덮개 (척추 좌표계)
  const grip = new THREE.Vector3(0.07, 0.4 - 0.075, 0.2 - 0.015), fore = new THREE.Vector3(0.07, 0.4 - 0.005, 0.2 + 0.42);
  const R = arms.find((a) => a.sd === 1), L = arms.find((a) => a.sd === -1);
  solveArm(R.sh, R.el, R.sh.position.clone(), grip.clone().add(new THREE.Vector3(0, 0.03, 0)), 0.29, 0.31, new THREE.Vector3(0.6, -1, -0.3).normalize());
  solveArm(L.sh, L.el, L.sh.position.clone(), fore.clone().add(new THREE.Vector3(-0.02, 0.0, 0)), 0.29, 0.31, new THREE.Vector3(-0.8, -1, 0).normalize());
  root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return root;
}

// Operator(enemies.js) 가 호출: 템플릿 복제 후 리그 연결
export function buildOperator(op) {
  const G = op.G;
  if (!TEMPLATE) TEMPLATE = buildTemplate(G);
  const inst = TEMPLATE.clone(true);
  op.root.add(inst);
  const get = (n) => inst.getObjectByName(n);
  // 팀 완장 재질은 개체별 (피아 색 구분)
  op.visorMat = new THREE.MeshBasicMaterial({ color: 0x40ff80 });
  inst.traverse((o) => { if (o.isMesh && o.material && o.material.name === 'teamband') o.material = op.visorMat; });
  op.rig = {
    body: get('body'), hips: get('hips'), spine: get('spine'), head: get('head'), gun: get('gun'), muzzle: get('muzzle'),
    arms: [{ sh: get('sh-1'), el: get('el-1'), sd: -1 }, { sh: get('sh1'), el: get('el1'), sd: 1 }],
    legs: [{ hp: get('hp-1'), kn: get('kn-1'), sd: -1 }, { hp: get('hp1'), kn: get('kn1'), sd: 1 }],
  };
  op.radius = 0.36; op.eyeH = 1.72;
}
