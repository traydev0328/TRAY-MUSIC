// Mixamo 모션캡처 동작 → 실사 캐릭터 리타깃 + 동작 상태 기계
//
// 원리
//  - assets/anim/mixamo.json 에는 동작마다 "Mixamo 휴지 자세(T자) 대비 각 뼈의 월드 회전 변화량 D(t)" 가 30fps 로 들어 있다.
//  - 캐릭터마다 바인드 자세(모델링 자세)가 다르다(T자·A자·총 든 자세 등). 그래서 뼈마다
//      C = (대상 바인드 자세의 뼈 방향 → Mixamo 휴지 자세의 뼈 방향) 회전
//    을 구해 "대상 캐릭터를 가상의 T자 자세로 맞춘 뒤" 변화량을 적용한다:  월드 회전 = D(t) · C · 바인드 월드 회전
//  - 월드 회전을 부모 기준 로컬 회전으로 바꿔 three.js AnimationClip 으로 굽는다(캐릭터 종류당 1회).
import * as THREE from 'three';

const BASE = new URL('../assets/', import.meta.url).href;
export const boneName = (n) => n.replace(/^.*mixamorig:?/, '').replace(/_\d+$/, '').replace(/_end$/, '');

const LOCO = ['idle', 'walk', 'run', 'strafeL', 'strafeR', 'back', 'crouchIdle', 'crouchWalk'];
// 제자리 동작의 기준 이동 속도(m/s) — 실제 이동 속도에 맞춰 재생 속도를 조절
const NOMINAL = { walk: 1.6, run: 4.2, strafeL: 1.6, strafeR: 1.6, back: 1.4, crouchWalk: 1.2 };
const UPPER = /^(Spine|Spine1|Spine2|Neck|Head|HeadTop_End|(Left|Right)(Shoulder|Arm|ForeArm|Hand.*))$/;

// Mixamo 표준 뼈대의 "주 자식" (뼈 방향 계산용)
function mainChild(n) {
  const fixed = { Hips: 'Spine', Spine: 'Spine1', Spine1: 'Spine2', Spine2: 'Neck', Neck: 'Head', Head: 'HeadTop_End' };
  if (fixed[n]) return fixed[n];
  let m = n.match(/^(Left|Right)(Shoulder|Arm|ForeArm|Hand|UpLeg|Leg|Foot|ToeBase)$/);
  if (m) return m[1] + { Shoulder: 'Arm', Arm: 'ForeArm', ForeArm: 'Hand', Hand: 'HandMiddle1', UpLeg: 'Leg', Leg: 'Foot', Foot: 'ToeBase', ToeBase: 'Toe_End' }[m[2]];
  m = n.match(/^((Left|Right)Hand(Thumb|Index|Middle|Ring|Pinky))(\d)$/);
  if (m) return m[1] + (+m[4] + 1);
  return null;
}

let dataP = null;
export function loadMixamo() {
  if (!dataP) dataP = fetch(`${BASE}anim/mixamo.json`).then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }).catch((e) => { console.warn('mixamo 동작 로딩 실패', e); return null; });
  return dataP;
}

const cache = new WeakMap(); // 템플릿 씬 → { clips, upper }

// 템플릿(원본) 씬에 맞춘 클립 생성. scene 은 변환이 없는 원본(복제 전)이어야 한다.
export function retarget(scene, data) {
  if (cache.has(scene)) return cache.get(scene);
  scene.updateMatrixWorld(true);
  // 1) 바인드 자세의 월드 회전
  //  inverseBindMatrix(IBM)의 역행렬 = 바인드 자세 뼈 변환. 단 모델마다 IBM 좌표계의 단위·원점이 제각각이라
  //  (Sketchfab 변환본은 수백만 배 단위도 있음) 위치는 믿지 않고 회전만 쓴다. 위치·크기는 현재 씬 값을 사용.
  const ibm = new Map();
  scene.traverse((o) => { if (o.isSkinnedMesh) o.skeleton.bones.forEach((b, i) => { if (!ibm.has(b)) ibm.set(b, o.skeleton.boneInverses[i]); }); });
  const order = []; // 전위 순회(부모가 먼저)
  scene.traverse((o) => { if (o.isBone) order.push(o); });
  const rot = (m) => { const q = new THREE.Quaternion(); m.decompose(new THREE.Vector3(), q, new THREE.Vector3()); return q; };
  const bindQ = new Map();
  for (const b of order) {
    const m = ibm.get(b);
    if (m) bindQ.set(b, rot(m.clone().invert()));
    else bindQ.set(b, (b.parent && b.parent.isBone ? bindQ.get(b.parent).clone() : rot(b.parent ? b.parent.matrixWorld : new THREE.Matrix4())).multiply(b.quaternion));
  }
  const byName = {}; for (const b of order) { const k = boneName(b.name); if (!byName[k]) byName[k] = b; }
  const H = byName.Hips; if (!H) return null;
  const pos = (b) => b.getWorldPosition(new THREE.Vector3());
  const footY = Math.min(...['LeftToeBase', 'RightToeBase', 'LeftFoot', 'RightFoot'].filter((n) => byName[n]).map((n) => pos(byName[n]).y));
  const hipsH = pos(H).y - footY, hipsP = pos(H);
  const hipsParentInv = H.parent.matrixWorld.clone().invert();
  const staticLocal = new Map(order.map((b) => [b, b.quaternion.clone()]));
  const parentStaticQ = (b) => (b.parent && !b.parent.isBone ? rot(b.parent.matrixWorld) : null);

  const clips = {}, upper = {};
  const tmpQ = new THREE.Quaternion(), D = new THREE.Quaternion(), C = new THREE.Quaternion();
  for (const [key, c] of Object.entries(data.clips)) {
    const N = c.n, times = new Float32Array(N); for (let f = 0; f < N; f++) times[f] = f / data.fps;
    // 뼈별 보정 회전 C
    const corr = new Map();
    for (const b of order) {
      const n = boneName(b.name); if (byName[n] !== b || !c.restDir[n]) continue;
      const cn = mainChild(n), kid = cn && byName[cn];
      let td = null;
      // 바인드 자세 뼈 방향 = 바인드 회전 × 자식의 로컬 위치(뼈 길이는 자세와 무관)
      if (kid && kid.parent === b) td = kid.position.clone().applyQuaternion(bindQ.get(b));
      if (!td || td.lengthSq() < 1e-12) { corr.set(b, new THREE.Quaternion()); continue; }
      corr.set(b, new THREE.Quaternion().setFromUnitVectors(td.normalize(), new THREE.Vector3(...c.restDir[n]).normalize()));
    }
    const out = new Map(); // 뼈 → Float32Array (로컬 쿼터니언)
    const worldT = new Map();
    for (const b of order) { const n = boneName(b.name); if (byName[n] === b && (c.q[n] || corr.has(b))) out.set(b, new Float32Array(N * 4)); }
    for (let f = 0; f < N; f++) {
      worldT.clear();
      for (const b of order) {
        const n = boneName(b.name), mapped = out.has(b);
        const pw = b.parent && b.parent.isBone ? worldT.get(b.parent) : parentStaticQ(b) || new THREE.Quaternion();
        let w;
        if (mapped) {
          const a = c.q[n]; if (a) D.set(a[f * 4], a[f * 4 + 1], a[f * 4 + 2], a[f * 4 + 3]); else D.identity();
          w = D.clone().multiply(corr.get(b) || C.identity()).multiply(bindQ.get(b));
          const loc = tmpQ.copy(pw).invert().multiply(w).normalize();
          const arr = out.get(b);
          // 부호 연속성
          if (f > 0 && arr[f * 4 - 4] * loc.x + arr[f * 4 - 3] * loc.y + arr[f * 4 - 2] * loc.z + arr[f * 4 - 1] * loc.w < 0) loc.set(-loc.x, -loc.y, -loc.z, -loc.w);
          arr.set([loc.x, loc.y, loc.z, loc.w], f * 4);
        } else w = pw.clone().multiply(staticLocal.get(b));
        worldT.set(b, w);
      }
    }
    const tracks = [];
    for (const [b, arr] of out) tracks.push(new THREE.QuaternionKeyframeTrack(`${b.name}.quaternion`, times, arr));
    // 엉덩이 위치 (휴지 대비 이동량 × 대상 엉덩이 높이)
    const hp = new Float32Array(N * 3), v = new THREE.Vector3();
    for (let f = 0; f < N; f++) { v.set(c.hp[f * 3], c.hp[f * 3 + 1], c.hp[f * 3 + 2]).multiplyScalar(hipsH).add(hipsP).applyMatrix4(hipsParentInv); hp.set([v.x, v.y, v.z], f * 3); }
    tracks.push(new THREE.VectorKeyframeTrack(`${H.name}.position`, times, hp));
    clips[key] = new THREE.AnimationClip(key, (N - 1) / data.fps, tracks);
    upper[key] = new THREE.AnimationClip(key + '_upper', (N - 1) / data.fps, tracks.filter((t) => UPPER.test(boneName(t.name.split('.')[0]))));
  }
  const r = { clips, upper };
  cache.set(scene, r);
  return r;
}

// 캐릭터 1명의 동작 제어기
export class AnimCtl {
  constructor(root, set) {
    this.mixer = new THREE.AnimationMixer(root);
    this.base = {};
    for (const k of LOCO) {
      const a = this.mixer.clipAction(set.clips[k]);
      a.play(); a.setEffectiveWeight(k === 'idle' ? 1 : 0); a.time = Math.random() * set.clips[k].duration;
      this.base[k] = a;
    }
    this.w = Object.fromEntries(LOCO.map((k) => [k, k === 'idle' ? 1 : 0]));
    const once = (clip, w) => { const a = this.mixer.clipAction(clip); a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = false; a.weight0 = w; return a; };
    this.fireA = once(set.upper.fire, 1.6);
    this.reloadA = once(set.upper.reload, 3);
    this.hitA = once(set.upper.hit, 2);
    this.deathA = this.mixer.clipAction(set.clips.death); this.deathA.setLoop(THREE.LoopOnce, 1); this.deathA.clampWhenFinished = true;
    this.dead = false;
  }
  _one(a, scale = 1) { a.reset(); a.timeScale = scale; a.setEffectiveWeight(a.weight0); a.play(); }
  fire() { if (this.dead || this.reloadA.isRunning()) return; if (this.fireA.isRunning() && this.fireA.time < 0.12) return; this._one(this.fireA, 1.4); }
  reload(sec = 2.2) { if (this.dead) return; this.fireA.stop(); this._one(this.reloadA, this.reloadA.getClip().duration / sec); }
  hit() { if (this.dead || this.reloadA.isRunning()) return; this._one(this.hitA, 1.6); }
  die() {
    if (this.dead) return; this.dead = true;
    for (const a of [this.fireA, this.reloadA, this.hitA]) a.stop();
    // 다른 동작은 0.2초에 걸쳐 끄고 사망 동작만 남긴다
    for (const k of LOCO) { this.base[k].fadeOut(0.2); this.w[k] = 0; }
    this.deathA.reset(); this.deathA.setEffectiveWeight(1); this.deathA.fadeIn(0.2); this.deathA.play();
  }
  revive() {
    if (!this.dead) return; this.dead = false; this.deathA.stop();
    for (const k of LOCO) { const a = this.base[k]; a.stopFading(); a.enabled = true; a.play(); this.w[k] = k === 'idle' ? 1 : 0; a.setEffectiveWeight(this.w[k]); }
  }
  // vx, vz: 월드 속도, yaw: 캐릭터가 바라보는 방향, crouch: 0~1
  update(dt, vx, vz, yaw, crouch) {
    if (!this.dead) {
      const sp = Math.hypot(vx, vz);
      const fw = vx * Math.sin(yaw) + vz * Math.cos(yaw), rt = -vx * Math.cos(yaw) + vz * Math.sin(yaw);
      let want;
      if (crouch > 0.5) want = sp > 0.35 ? 'crouchWalk' : 'crouchIdle';
      else if (sp < 0.35) want = 'idle';
      else if (fw > 2.9) want = 'run';
      else if (Math.abs(rt) > Math.abs(fw) * 1.2) want = rt > 0 ? 'strafeR' : 'strafeL';
      else want = fw >= 0 ? 'walk' : 'back';
      this._cur = want;
      const k = Math.min(1, dt * 9);
      for (const n of LOCO) {
        this.w[n] += ((n === want ? 1 : 0) - this.w[n]) * k;
        const a = this.base[n]; a.setEffectiveWeight(this.w[n]);
        if (NOMINAL[n]) a.timeScale = THREE.MathUtils.clamp(sp / NOMINAL[n], 0.55, 1.7);
      }
    }
    this.mixer.update(dt);
  }
}
