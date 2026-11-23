// 실사 총기 1인칭 모델 자동 정렬 — 형상 분석으로 총구 방향·위아래·축척·손 위치·조준선을 계산
import * as THREE from 'three';

// 모델 정점을 (모델 루트 기준) 표본 추출
function samplePoints(root) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const pts = [], v = new THREE.Vector3(), M = new THREE.Matrix4();
  root.traverse((o) => {
    if (!o.isMesh) return;
    M.multiplyMatrices(inv, o.matrixWorld);
    const a = o.geometry.attributes.position, step = Math.max(1, Math.floor(a.count / 4000));
    for (let i = 0; i < a.count; i += step) { v.fromBufferAttribute(a, i).applyMatrix4(M); pts.push(v.clone()); }
  });
  return pts;
}

export function buildRealViewmodel(W, id, def, src) {
  const model = src.scene.clone(true);
  model.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.frustumCulled = false; } });
  const holder = new THREE.Group(); holder.add(model);
  // 1) 축 판별: 가장 긴 축 = 총열 방향, 두 번째 = 위아래
  let pts = samplePoints(holder);
  const box = new THREE.Box3().setFromPoints(pts), size = box.getSize(new THREE.Vector3());
  const axes = ['x', 'y', 'z'].sort((a, b) => size[b] - size[a]);
  const L = axes[0], U = axes[1];
  // 2) 위쪽: 길이 방향으로 더 넓게 퍼진 쪽(총열·몸체)이 위, 손잡이·탄창 쪽이 아래
  const cU = (box.min[U] + box.max[U]) / 2;
  const span = (arr) => { if (!arr.length) return 0; let a = Infinity, b = -Infinity; for (const p of arr) { a = Math.min(a, p[L]); b = Math.max(b, p[L]); } return b - a; };
  const upPos = span(pts.filter((p) => p[U] > cU)) >= span(pts.filter((p) => p[U] < cU));
  // 3) 총구: 길이 양끝 12% 구간 중 단면이 더 좁은 쪽
  const lMin = box.min[L], lMax = box.max[L], len = lMax - lMin;
  // 총구 판별: 양끝 15% 구간의 '아래쪽으로 뻗은 정도'를 비교. 개머리판은 아래(손잡이 방향)로 길게 내려오고,
  // 총구는 총열 높이(위쪽)에만 얇게 있다. upPos 로 위·아래 부호를 맞춘다.
  const sgn = upPos ? 1 : -1;
  const lowReach = (lo, hi) => { let m = Infinity, n = 0, sumH = 0; for (const p of pts) if (p[L] >= lo && p[L] <= hi) { const h = p[U] * sgn; m = Math.min(m, h); sumH += h; n++; } return n ? { low: m, mean: sumH / n } : { low: Infinity, mean: Infinity }; };
  const eMin = lowReach(lMin, lMin + len * 0.15), eMax = lowReach(lMax - len * 0.15, lMax);
  // 아래로 덜 내려온(최저점이 더 높은) 쪽이 총구. 차이가 작으면 평균 높이가 더 높은 쪽
  const muzzleAtMin = Math.abs(eMin.low - eMax.low) > size[U] * 0.08 ? eMin.low > eMax.low : eMin.mean > eMax.mean;
  // 4) 회전: 총구 → -z, 위 → +y
  const vec = (axis, sgn) => new THREE.Vector3(axis === 'x' ? sgn : 0, axis === 'y' ? sgn : 0, axis === 'z' ? sgn : 0);
  const fwd = vec(L, muzzleAtMin ? -1 : 1), up = vec(U, upPos ? 1 : -1);
  const right = new THREE.Vector3().crossVectors(fwd, up); // 오른손 좌표계에서 x
  const basis = new THREE.Matrix4().makeBasis(right, up, fwd.clone().negate()); // 모델 축 → (x,y,-z 반대)
  const rot = new THREE.Matrix4().copy(basis).invert();
  model.applyMatrix4(rot);
  // 5) 축척: 실총 전장에 맞춤
  const k = def.len / len;
  model.scale.multiplyScalar(k); model.position.multiplyScalar(k);
  pts = samplePoints(holder);
  const b2 = new THREE.Box3().setFromPoints(pts);
  // 6) 위치: 손잡이(뒤쪽 절반의 최저점 근처)를 원점 부근으로
  // 손잡이·가늠자는 '중간~뒤쪽' 구간에서만 찾는다 (개머리판 끝이 아래로 처진 산탄총·저격총 대응)
  const zf = b2.min.z, zl = b2.max.z - b2.min.z;
  const band = (a, b) => pts.filter((p) => p.z >= zf + zl * a && p.z <= zf + zl * b);
  // 조준선은 개머리판을 제외한 몸체 구간(30~65%)의 최상단 바로 위를 지난다
  const gripBand = band(0.42, 0.8), sightBand = band(0.3, 0.65);
  let lowest = gripBand[0]; for (const p of gripBand) if (p.y < lowest.y) lowest = p;
  const topRear = sightBand.reduce((a, p) => (p.y > a.y ? p : a), sightBand[0]);
  const front = pts.filter((p) => p.z < b2.min.z + (b2.max.z - b2.min.z) * 0.1);
  const boreY = front.length ? front.reduce((s, p) => s + p.y, 0) / front.length : (b2.max.y + b2.min.y) / 2;
  const off = new THREE.Vector3(-(b2.min.x + b2.max.x) / 2, -boreY, -lowest.z + 0.02);
  model.position.add(off);
  const gripZ = lowest.z + off.z, gripY = (lowest.y + boreY) / 2 + off.y;
  const g = new THREE.Group(); g.add(holder);
  const flash = W._flashGroup(); flash.position.set(0, 0, b2.min.z + off.z); g.add(flash);
  if (def.pellets > 1) flash.scale.setScalar(1.5);
  const muzzle = new THREE.Object3D(); muzzle.position.set(0, 0, b2.min.z + off.z - 0.01); g.add(muzzle);
  const port = new THREE.Object3D(); port.position.set(0.03, 0.01, gripZ - 0.12); g.add(port);
  const root = new THREE.Group(); root.add(g);
  // 조준: 저격총은 조준경 화면, 그 외는 뒤쪽 최상단(가늠자/조준경) 높이
  const sightY = def.scope ? 0 : (topRear.y + off.y) + 0.004;
  // 견착 시 눈은 손잡이보다 약 9~30cm 뒤 → 가늠자가 없는 총(산탄총 등)도 그 범위로 제한
  const adsZ = THREE.MathUtils.clamp(-((topRear.z + off.z) + 0.1), -0.3, -0.16);
  return {
    root, gun: g, flash, muzzle, port, real: true, generic: true,
    mag: new THREE.Object3D(), magHome: new THREE.Vector3(),
    rightHand: new THREE.Vector3(0, gripY, gripZ), leftHand: new THREE.Vector3(0, -0.03, (b2.min.z + off.z) * 0.55),
    sightY, adsZ,
  };
}
