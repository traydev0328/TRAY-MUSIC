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

// ─────────── 실사 대원 (Sketchfab CC-BY, Mixamo 뼈대) ───────────
import { clone as skClone } from 'three/addons/utils/SkeletonUtils.js';
import { retarget, AnimCtl } from './anim.js';

const boneName = (n) => n.replace(/^.*mixamorig:?/, '').replace(/_\d+$/, '').replace(/_end$/, '');

// 실사 모델을 Operator 에 연결: 크기 보정, 뼈 매핑, 대기 동작, 판정 박스, 팀 완장
export function buildRealOperator(op, variant) {
  const G = op.G, src = G.assets.real[variant] || G.assets.real.swat;
  const s = skClone(src.scene);
  const bones = {};
  s.traverse((o) => { if (o.isBone) { const k = boneName(o.name); if (!bones[k]) bones[k] = o; } if (o.isMesh) o.raycast = () => {}; });
  // 크기: 머리 뼈 높이를 1.62m 에 맞추고 발을 지면에
  s.updateMatrixWorld(true);
  const wp = (b) => b.getWorldPosition(new THREE.Vector3());
  const headY = wp(bones.Head).y, footY = Math.min(wp(bones.LeftToeBase || bones.LeftFoot).y, wp(bones.RightToeBase || bones.RightFoot).y);
  const k = (1.62 - 0.05) / (headY - footY);
  s.scale.multiplyScalar(k); s.updateMatrixWorld(true);
  s.position.y -= Math.min(wp(bones.LeftToeBase || bones.LeftFoot).y, wp(bones.RightToeBase || bones.RightFoot).y) - 0.03;
  op.root.add(s);
  pinStaticParts(s, bones);
  const rest = new Map(); for (const b of Object.values(bones)) rest.set(b, b.quaternion.clone());
  let mixer = null;
  // Mixamo 모션캡처 동작이 있으면 리타깃해서 사용, 없으면 모델 자체 동작 + 뼈 직접 회전
  const set = G.assets.mixamo && retarget(src.scene, G.assets.mixamo);
  if (set) { op.anim = new AnimCtl(s, set); op.anim.mixer.update(0); }
  else if (src.animations.length) { mixer = new THREE.AnimationMixer(s); mixer.clipAction(src.animations[0]).play(); mixer.update(Math.random() * 3); }
  // 판정 박스 (보이지 않음, 레이캐스트 전용)
  const hm = new THREE.MeshBasicMaterial({ visible: false });
  // 뼈마다 실제 월드 배율이 다르다(모델 내부 단위 변환 포함) → 판정 박스를 미터 단위로 맞추려면 각 뼈의 월드 배율로 나눠야 함
  s.updateMatrixWorld(true);
  const ws = (o) => o.getWorldScale(new THREE.Vector3()).x;
  const hit = (bone, geo, part, off = [0, 0, 0]) => { if (!bone) return; const w = ws(bone); const m = new THREE.Mesh(geo, hm); m.userData.part = part; m.position.set(...off).divideScalar(w); m.scale.setScalar(1 / w); bone.add(m); };
  hit(bones.Head, new THREE.SphereGeometry(0.13, 10, 8), 'head', [0, 0.08, 0.02]);
  hit(bones.Spine2 || bones.Spine1, new THREE.BoxGeometry(0.42, 0.42, 0.3), 'body', [0, 0.05, 0]);
  hit(bones.Hips, new THREE.BoxGeometry(0.36, 0.26, 0.26), 'body');
  for (const sd of ['Left', 'Right']) {
    hit(bones[`${sd}UpLeg`], new THREE.CylinderGeometry(0.09, 0.08, 0.44, 8), 'body', [0, 0.22, 0]);
    hit(bones[`${sd}Leg`], new THREE.CylinderGeometry(0.07, 0.06, 0.44, 8), 'body', [0, 0.22, 0]);
    hit(bones[`${sd}Arm`], new THREE.CylinderGeometry(0.06, 0.055, 0.3, 8), 'body', [0, 0.15, 0]);
    hit(bones[`${sd}ForeArm`], new THREE.CylinderGeometry(0.05, 0.045, 0.28, 8), 'body', [0, 0.14, 0]);
  }
  // 팀 완장 (왼팔 위)
  op.visorMat = new THREE.MeshBasicMaterial({ color: 0x40ff80 });
  if (bones.LeftArm) { const w = ws(bones.LeftArm); const band = new THREE.Mesh(new THREE.CylinderGeometry(0.068, 0.068, 0.05, 16, 1, true), op.visorMat); band.position.y = 0.12 / w; band.scale.setScalar(1 / w); band.raycast = () => {}; bones.LeftArm.add(band); }
  op.real = { s, bones, rest, mixer, k, hipsW: bones.Hips && bones.Hips.parent ? ws(bones.Hips.parent) : k };
  op.rig = { muzzle: new THREE.Object3D() };
  op.rig.muzzle.position.set(0.12, 1.42, 0.75); op.root.add(op.rig.muzzle);
  op.radius = 0.36; op.eyeH = 1.66;
}

// 뼈 단위 절차적 동작: 걷기(다리), 앉기, 상체 조준 기울기. 대기 동작(mixer)은 그 위에 덧입힘
const _q = new THREE.Quaternion(), _ax = new THREE.Vector3(1, 0, 0);
export const LEG_SIGN = -1; // 화면 확인으로 조정한 Mixamo 다리 회전 방향
// 뼈에 묶이지 않은 부품(모델에 포함된 총·탄창 파우치·패치 등)을 원래 자세 그대로 가장 가까운 뼈에 고정한다.
// 이렇게 해야 모션캡처로 몸이 움직여도 총은 손에, 파우치는 허리에 붙어 따라간다. 총은 항상 오른손.
function pinStaticParts(s, bones) {
  s.updateMatrixWorld(true);
  const groups = new Set();
  const hasRig = (o) => { let r = false; o.traverse((c) => { if (c.isBone || c.isSkinnedMesh) r = true; }); return r; };
  s.traverse((o) => {
    if (!o.isMesh || o.isSkinnedMesh) return;
    for (let p = o.parent; p; p = p.parent) if (p.isBone) return; // 이미 뼈 아래에 있음
    let top = o;
    while (top.parent && top.parent !== s && !hasRig(top.parent)) top = top.parent;
    groups.add(top);
  });
  const list = Object.entries(bones).filter(([n]) => !/HeadTop_End|Toe_End|Hand(Thumb|Index|Middle|Ring|Pinky)/.test(n));
  const bp = new Map(list.map(([, b]) => [b, b.getWorldPosition(new THREE.Vector3())]));
  const seg = new THREE.Line3(), q = new THREE.Vector3();
  for (const g of groups) {
    const c = new THREE.Box3().setFromObject(g).getCenter(new THREE.Vector3());
    let bone = /gun|rifle|weapon/i.test(g.name) ? bones.RightHand : null;
    if (!bone) {
      let best = Infinity;
      for (const [, b] of list) {
        const kid = b.children.find((k) => k.isBone && bp.has(k));
        seg.set(bp.get(b), kid ? bp.get(kid) : bp.get(b));
        const d = seg.closestPointToPoint(c, true, q).distanceTo(c);
        if (d < best) { best = d; bone = b; }
      }
    }
    if (bone) bone.attach(g);
  }
}

export function animateReal(op, dt, speed, crouch, pitch) {
  const R = op.real; if (!R) return;
  const B = R.bones;
  if (op.anim) {
    // 모션캡처: 이동 방향·속도·앉기에 맞는 동작을 섞고, 조준 높이만 허리로 보정
    op.anim.update(dt, op.vel ? op.vel.x : 0, op.vel ? op.vel.z : 0, op.yaw || 0, crouch);
    if (!op.anim.dead) for (const b of [B.Spine1, B.Spine2]) if (b) b.quaternion.multiply(_q.setFromAxisAngle(_ax, -pitch * 0.32));
    return;
  }
  if (R.mixer) R.mixer.update(dt);
  const set = (b, ang) => { if (!b) return; const base = R.mixer ? b.quaternion.clone() : R.rest.get(b).clone(); b.quaternion.copy(base.multiply(_q.setFromAxisAngle(_ax, ang))); };
  op.walkT = (op.walkT || 0) + dt * speed * 2.4;
  const a = Math.min(1, speed / 2.5);
  for (const [sd, ph0] of [['Left', 0], ['Right', Math.PI]]) {
    const ph = op.walkT + ph0;
    set(B[`${sd}UpLeg`], LEG_SIGN * (Math.sin(ph) * 0.5 * a + crouch * 1.15));
    set(B[`${sd}Leg`], -LEG_SIGN * (Math.max(0, -Math.cos(ph)) * 0.85 * a + crouch * 2.0));
    set(B[`${sd}Foot`], LEG_SIGN * crouch * 0.85);
  }
  set(B.Spine1, -pitch * 0.35);
  set(B.Spine2, -pitch * 0.35);
  if (B.Hips) { const rp = R.restHipsY ?? (R.restHipsY = B.Hips.position.y); B.Hips.position.y = rp - (crouch * 0.42 + Math.abs(Math.cos(op.walkT)) * 0.03 * a) / R.hipsW; }
}
