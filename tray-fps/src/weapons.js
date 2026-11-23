// 무기 — 1인칭 뷰모델(PBR 모델링 + 손/팔), 히트스캔 사격, 반동/탄 퍼짐, 재장전·교체 애니메이션
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import * as TX from './textures.js';
import { GUNS, PRIMARIES, SECONDARIES } from './arsenal.js';
import { buildRealViewmodel } from './realgun.js';
import { settings } from './config.js';

export const WEAPONS = {
  rifle: {
    id: 'rifle', name: 'TR-7 카빈', cal: '5.56×45mm', mag: 30, reserve: 210, rpm: 760, dmg: 27, headMul: 2.3, pellets: 1,
    spreadHip: 0.022, spreadAds: 0.0018, spreadMove: 0.028, bloomPer: 0.004, recoilP: 0.011, recoilY: 0.005,
    reload: 2.05, range: 220, falloff: [30, 80, 0.65], adsFov: 0.62, sightY: 0.095, adsZ: -0.1, kick: 0.035, tracerEvery: 2,
  },
  shotgun: {
    id: 'shotgun', name: 'M-12 전술 산탄총', cal: '12 게이지', mag: 7, reserve: 42, rpm: 78, dmg: 15, headMul: 1.5, pellets: 9,
    spreadHip: 0.062, spreadAds: 0.045, spreadMove: 0.02, bloomPer: 0, recoilP: 0.07, recoilY: 0.012,
    reload: 2.9, range: 70, falloff: [7, 26, 0.25], adsFov: 0.84, sightY: 0.062, adsZ: -0.14, kick: 0.09, tracerEvery: 3,
  },
};

Object.assign(WEAPONS, GUNS); // 실사 총기 13종
WEAPONS.rifle.cls = '소총'; WEAPONS.shotgun.cls = '산탄총';

const _v = new THREE.Vector3(), _q = new THREE.Quaternion();

export class Weapons {
  constructor(G) {
    this.G = G;
    this.vmScene = new THREE.Scene();
    this.vmScene.environment = G.scene.environment; // 금속 부품이 주변 환경을 반사하도록
    this.vmCam = new THREE.PerspectiveCamera(54, 1, 0.01, 10);
    this.holder = new THREE.Group();
    this.vmScene.add(this.holder);
    this._lights();
    this._materials();
    this.models = { rifle: this._buildRifle(), shotgun: this._buildShotgun() };
    for (const k in this.models) { this.models[k].root.visible = false; this.holder.add(this.models[k].root); }
    this.arms = this._buildArms();
    if (G.assets && G.assets.real && G.assets.real.m16) this._applyRealRifle(G.assets.real.m16);
    this.state = {};
    for (const k of Object.keys(WEAPONS)) this.state[k] = { mag: WEAPONS[k].mag, reserve: WEAPONS[k].reserve };
    this.order = this.loadout();
    this.cur = 'rifle';
    this.def = WEAPONS.rifle;
    this.adsT = 0; this.sprintT = 0;
    this.cool = 0; this.reloadT = -1; this.swapT = -1; this.swapTo = null;
    this.kickZ = 0; this.kickR = 0; this.swayX = 0; this.swayY = 0; this.bloom = 0;
    this.flashT = 0; this.shotCount = 0; this.pumpT = -1; this.throwT = -1;
    this.stats = { shots: 0, hits: 0 };
    this._show('rifle');
  }

  // 장비: 주무기 + 보조무기 (메뉴 '무기고'에서 선택, 설정에 저장)
  loadout() {
    const p = PRIMARIES.includes(settings.primary) ? settings.primary : 'rifle';
    const s = SECONDARIES.includes(settings.secondary) ? settings.secondary : 'p_engraved';
    return [p, s];
  }

  // 선택된 실사 총기 모델을 필요할 때만 받아서 준비
  // 동시에 여러 번 불려도 순서대로 처리 (게임 시작과 장비 변경이 겹칠 때의 경쟁 상태 방지)
  prepareLoadout() {
    this._prep = (this._prep || Promise.resolve()).then(() => this._prepareLoadout()).catch((e) => console.warn('loadout', e));
    return this._prep;
  }

  async _prepareLoadout() {
    this.order = this.loadout();
    for (const id of this.order) {
      if (this.models[id]) continue;
      const d = WEAPONS[id];
      if (!d.asset) continue;
      const R = await this.G.assets.loadReal([d.asset]);
      if (!R[d.asset]) continue;
      const m = buildRealViewmodel(this, id, d, R[d.asset]);
      m.root.visible = false; this.holder.add(m.root);
      this.models[id] = m;
    }
    // 끝난 시점의 최신 선택 기준으로 확정. 모델을 못 받은 무기만 기본 총으로 대체
    this.order = this.loadout().map((id) => (this.models[id] ? id : (WEAPONS[id].slot === 2 ? 'shotgun' : 'rifle')));
  }

  reset() {
    for (const k of this.order) { this.state[k].mag = WEAPONS[k].mag; this.state[k].reserve = WEAPONS[k].reserve; }
    this.cool = 0; this.reloadT = -1; this.swapT = -1; this.bloom = 0; this.adsT = 0;
    this.stats = { shots: 0, hits: 0 };
    this._show(this.order[0]);
  }

  _lights() {
    const S = this.vmScene;
    this.vmHemi = new THREE.HemisphereLight(0x9aaac4, 0x2a2420, 1.0); S.add(this.vmHemi);
    const key = this.vmKey = new THREE.DirectionalLight(0xffb27a, 1.4); key.position.set(-1, 1.2, 0.6); S.add(key);
    const rim = this.vmRim = new THREE.DirectionalLight(0x9fb8ff, 0.9); rim.position.set(1, 0.4, -1); S.add(rim);
    this.vmFlash = new THREE.PointLight(0xffaa55, 0, 1.5, 2); S.add(this.vmFlash);
  }

  // 낮 맵: 강한 햇빛 + 밝은 하늘광 / 밤 맵: 따뜻한 가로등 + 차가운 림
  setDay(day) {
    this.vmHemi.color.set(day ? 0xdbe8ff : 0x9aaac4); this.vmHemi.groundColor.set(day ? 0x8c7a62 : 0x2a2420); this.vmHemi.intensity = day ? 1.3 : 1.0;
    this.vmKey.color.set(day ? 0xfff0dc : 0xffb27a); this.vmKey.intensity = day ? 3.0 : 1.4;
    this.vmRim.color.set(day ? 0xcfe2ff : 0x9fb8ff); this.vmRim.intensity = day ? 0.6 : 0.9;
  }

  _materials() {
    const micro = TX.microDetail(201);
    const ns = new THREE.Vector2(0.35, 0.35);
    this.M = {
      polymer: new THREE.MeshStandardMaterial({ color: 0x232427, roughness: 0.62, metalness: 0.08, normalMap: micro, normalScale: ns }),
      anod: new THREE.MeshStandardMaterial({ color: 0x3b3e43, roughness: 0.52, metalness: 0.6, normalMap: micro, normalScale: ns }),
      fde: new THREE.MeshStandardMaterial({ color: 0x6d604c, roughness: 0.66, metalness: 0.05, normalMap: micro, normalScale: ns }),
      steel: new THREE.MeshStandardMaterial({ color: 0x1b1c1e, roughness: 0.24, metalness: 1.0 }),
      wood: new THREE.MeshPhysicalMaterial({ color: 0x3e2414, roughness: 0.45, metalness: 0, clearcoat: 0.5, clearcoatRoughness: 0.3, normalMap: micro, normalScale: ns }),
      glove: new THREE.MeshStandardMaterial({ color: 0x1f1f1e, roughness: 0.78, metalness: 0, normalMap: micro, normalScale: new THREE.Vector2(0.8, 0.8) }),
      sleeve: new THREE.MeshStandardMaterial({ color: 0x24271f, roughness: 0.92, metalness: 0, normalMap: micro, normalScale: new THREE.Vector2(1.2, 1.2) }),
      lens: new THREE.MeshStandardMaterial({ color: 0x2c4a5a, roughness: 0.04, metalness: 1, transparent: true, opacity: 0.22, depthWrite: false }),
      dot: new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.02, 0.01).multiplyScalar(4), toneMapped: false }),
      brass: new THREE.MeshStandardMaterial({ color: 0xc9a14a, roughness: 0.3, metalness: 1 }),
    };
    const fl = TX.flashSprite();
    this.M.flash = new THREE.MeshBasicMaterial({ map: fl, color: new THREE.Color(1, 0.85, 0.65).multiplyScalar(5), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, side: THREE.DoubleSide });
  }

  _mesh(geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) {
    const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); return m;
  }

  _flashGroup() {
    const g = new THREE.Group();
    const plane = new THREE.PlaneGeometry(0.16, 0.16);
    const a = new THREE.Mesh(plane, this.M.flash); a.rotation.y = Math.PI / 2; a.scale.set(2.2, 1, 1);
    const b = new THREE.Mesh(plane, this.M.flash); b.rotation.set(Math.PI / 2, 0, Math.PI / 2); b.scale.set(2.2, 1, 1);
    const c = new THREE.Mesh(plane, this.M.flash);
    [a, b, c].forEach((m) => { m.position.z = -0.08; g.add(m); });
    g.visible = false;
    return g;
  }

  _buildRifle() {
    const M = this.M, root = new THREE.Group(), gun = new THREE.Group(); root.add(gun);
    const RB = (w, h, d, r = 0.006) => new RoundedBoxGeometry(w, h, d, 2, r);
    const cyl = (r, l, s = 16) => { const g = new THREE.CylinderGeometry(r, r, l, s); g.rotateX(Math.PI / 2); return g; };
    gun.add(this._mesh(RB(0.052, 0.056, 0.31), M.anod, 0, 0.03, -0.1));             // 상부 리시버
    gun.add(this._mesh(RB(0.046, 0.05, 0.2), M.anod, 0, -0.018, -0.08));            // 하부 리시버
    gun.add(this._mesh(RB(0.06, 0.062, 0.29, 0.01), M.polymer, 0, 0.026, -0.39));   // 핸드가드
    for (let i = 0; i < 5; i++) gun.add(this._mesh(new THREE.BoxGeometry(0.062, 0.012, 0.022), M.anod, 0, 0.026, -0.29 - i * 0.05)); // 슬롯
    gun.add(this._mesh(cyl(0.0095, 0.16), M.steel, 0, 0.03, -0.6));                 // 총열
    gun.add(this._mesh(cyl(0.015, 0.055, 12), M.steel, 0, 0.03, -0.7));             // 소염기
    gun.add(this._mesh(new THREE.BoxGeometry(0.022, 0.009, 0.56), M.anod, 0, 0.062, -0.24)); // 상단 레일
    for (let i = 0; i < 18; i++) gun.add(this._mesh(new THREE.BoxGeometry(0.024, 0.004, 0.012), M.anod, 0, 0.068, -0.02 - i * 0.03));
    const mag = this._mesh(RB(0.03, 0.16, 0.066, 0.005), M.polymer, 0, -0.115, -0.135, 0.2);
    gun.add(mag);
    gun.add(this._mesh(RB(0.032, 0.105, 0.046), M.polymer, 0, -0.075, 0.01, -0.32));  // 그립
    gun.add(this._mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.18, 14).rotateX(Math.PI / 2), M.anod, 0, 0.03, 0.12)); // 버퍼 튜브
    gun.add(this._mesh(RB(0.042, 0.078, 0.16, 0.012), M.fde, 0, 0.012, 0.2));       // 개머리판
    gun.add(this._mesh(new THREE.BoxGeometry(0.008, 0.02, 0.03), M.steel, 0.028, 0.045, -0.06)); // 장전 손잡이
    gun.add(this._mesh(RB(0.024, 0.024, 0.05, 0.004), M.polymer, 0.034, 0.02, -0.46)); // 전술 라이트
    gun.add(this._mesh(cyl(0.012, 0.008, 12), M.lens, 0.034, 0.02, -0.488));
    // 도트 사이트
    gun.add(this._mesh(new THREE.BoxGeometry(0.03, 0.014, 0.05), M.anod, 0, 0.07, -0.12)); // 마운트 (조준선 아래로 낮춤)
    const tube = new THREE.CylinderGeometry(0.021, 0.021, 0.064, 24, 1, true); tube.rotateX(Math.PI / 2);
    const tm = M.anod.clone(); tm.side = THREE.DoubleSide;
    gun.add(this._mesh(tube, tm, 0, 0.095, -0.12));
    const ring = new THREE.RingGeometry(0.019, 0.024, 24);
    gun.add(this._mesh(ring, M.anod, 0, 0.095, -0.088));
    gun.add(this._mesh(new THREE.CircleGeometry(0.0195, 24), M.lens, 0, 0.095, -0.152));
    const dot = this._mesh(new THREE.CircleGeometry(0.0011, 16), M.dot, 0, 0.095, -0.149); // 2 MOA 급 점 (화면에서 3~5px)
    gun.add(dot);
    const flash = this._flashGroup(); flash.position.set(0, 0.03, -0.73); gun.add(flash);
    const muzzle = new THREE.Object3D(); muzzle.position.set(0, 0.03, -0.74); gun.add(muzzle);
    const port = new THREE.Object3D(); port.position.set(0.03, 0.035, -0.08); gun.add(port);
    root.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
    return { root, gun, mag, flash, muzzle, port, magHome: mag.position.clone(), leftHand: new THREE.Vector3(-0.005, -0.005, -0.42), rightHand: new THREE.Vector3(0, -0.075, 0.015) };
  }

  // 실사 M16(Sketchfab CC-BY, 단위 mm → 0.001배)으로 교체. 붉은 점 조준경은 레일 위에 그대로 장착
  _applyRealRifle(real) {
    const m = this.models.rifle, gun = m.gun;
    const keep = new Set([m.flash, m.muzzle, m.port]);
    const optic = gun.children.filter((c) => c.isMesh && Math.abs(c.position.x) < 1e-6 && c.position.y >= 0.069 && c.position.z <= -0.08 && c.position.z >= -0.16);
    for (const c of [...gun.children]) if (!keep.has(c) && !optic.includes(c)) gun.remove(c);
    const model = real.scene.clone(true);
    model.scale.setScalar(0.001);
    model.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.frustumCulled = false; } });
    gun.add(model);
    // 부품 이름으로 실제 위치를 찾아 정렬 (총 그룹 좌표계 기준 bbox)
    gun.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(gun.matrixWorld).invert();
    const part = (re) => { let f = null; model.traverse((o) => { if (!f && o.isMesh && re.test(o.name)) f = o; }); return f; };
    const boxOf = (o) => { const b = new THREE.Box3(); if (!o) return null; o.geometry.computeBoundingBox(); return b.copy(o.geometry.boundingBox).applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld)); };
    const rail = boxOf(part(/RAIL/i)) || boxOf(part(/BODY/i));
    const grip = boxOf(part(/GRIP/i));
    const barrel = boxOf(part(/BARREL/i));
    // 실총 기계식 조준기(가늠자·가늠쇠)로 조준 → 가짜 조준경 제거
    const front = boxOf(part(/FRONT_SIGHT/i)), rear = boxOf(part(/REAR_SIGHT/i));
    optic.forEach((c) => gun.remove(c));
    if (barrel) { const cy = (barrel.min.y + barrel.max.y) / 2; m.muzzle.position.set(0, cy, barrel.min.z - 0.01); m.flash.position.set(0, cy, barrel.min.z); m.leftHand.set(0, cy - 0.035, barrel.min.z * 0.55 + rail.min.z * 0.45); }
    if (grip) m.rightHand.set(0, (grip.min.y + grip.max.y) / 2 + 0.01, (grip.min.z + grip.max.z) / 2);
    m.debugSight = { rear: rear && [rear.min.y, rear.max.y, rear.min.z, rear.max.z], front: front && [front.min.y, front.max.y, front.min.z] };
    m.port.position.set(0.025, rail.min.y - 0.01, (rail.min.z + rail.max.z) / 2 + 0.03);
    // 탄창은 총 그룹으로 분리 (미터 단위로 재장전 애니메이션)
    const magMesh = part(/MAGAZINE/i);
    if (magMesh) { gun.attach(magMesh); m.mag = magMesh; } else { m.mag = new THREE.Object3D(); gun.add(m.mag); }
    m.magHome = m.mag.position.clone();
    // 조준선 높이 = 가늠쇠 끝, 눈은 가늠자 뒷면에서 7cm 뒤
    // 가늠자 구멍(조준 링) 중심 높이 ≈ 가늠자 상단에서 높이의 13% 아래 (화면 측정으로 보정)
    const sightY = rear ? rear.max.y - (rear.max.y - rear.min.y) * 0.13 : (front ? front.max.y - 0.003 : rail.max.y + 0.02);
    const adsZ = rear ? -(rear.max.z + 0.07) : -0.1;
    WEAPONS.rifle.sightY = sightY; WEAPONS.rifle.adsZ = adsZ; WEAPONS.rifle.adsFov = 0.75; WEAPONS.rifle.name = 'M16A3 소총';
    m.real = true;
  }

  _buildShotgun() {
    const M = this.M, root = new THREE.Group(), gun = new THREE.Group(); root.add(gun);
    const RB = (w, h, d, r = 0.006) => new RoundedBoxGeometry(w, h, d, 2, r);
    const cyl = (r, l, s = 16) => { const g = new THREE.CylinderGeometry(r, r, l, s); g.rotateX(Math.PI / 2); return g; };
    gun.add(this._mesh(RB(0.05, 0.075, 0.24, 0.008), M.anod, 0, 0.018, -0.08));
    gun.add(this._mesh(cyl(0.0125, 0.54), M.steel, 0, 0.044, -0.46));
    gun.add(this._mesh(cyl(0.0115, 0.44), M.steel, 0, 0.012, -0.41));
    const pump = this._mesh(RB(0.046, 0.042, 0.17, 0.012), M.wood, 0, 0.012, -0.36);
    gun.add(pump);
    for (let i = 0; i < 6; i++) gun.add(this._mesh(new THREE.BoxGeometry(0.047, 0.004, 0.006), M.polymer, 0, -0.008, -0.3 - i * 0.025));
    gun.add(this._mesh(RB(0.034, 0.1, 0.05), M.polymer, 0, -0.06, 0.03, -0.35));
    gun.add(this._mesh(RB(0.042, 0.085, 0.26, 0.012), M.wood, 0, -0.012, 0.18, 0.1));
    gun.add(this._mesh(new THREE.BoxGeometry(0.044, 0.09, 0.016), M.polymer, 0, -0.03, 0.31, 0.1));
    gun.add(this._mesh(new THREE.SphereGeometry(0.0035, 8, 6), M.brass, 0, 0.06, -0.72));
    gun.add(this._mesh(new THREE.BoxGeometry(0.022, 0.016, 0.02), M.anod, 0, 0.062, -0.03));
    const flash = this._flashGroup(); flash.position.set(0, 0.044, -0.74); flash.scale.setScalar(1.5); gun.add(flash);
    const muzzle = new THREE.Object3D(); muzzle.position.set(0, 0.044, -0.75); gun.add(muzzle);
    const port = new THREE.Object3D(); port.position.set(0.03, 0.03, -0.1); gun.add(port);
    root.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
    return { root, gun, pump, pumpHome: pump.position.z, flash, muzzle, port, leftHand: new THREE.Vector3(0, -0.01, -0.36), rightHand: new THREE.Vector3(0, -0.06, 0.035) };
  }

  _buildArms() {
    const M = this.M;
    const mk = (r) => {
      const g = new THREE.Group();
      const fore = new THREE.Mesh(new THREE.CapsuleGeometry(r, 1, 6, 14), M.sleeve);
      const hand = new THREE.Mesh(new RoundedBoxGeometry(0.052, 0.085, 0.1, 2, 0.018), M.glove);
      const cuff = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.05, r * 1.1, 0.05, 14), M.glove);
      [fore, hand, cuff].forEach((m) => { m.frustumCulled = false; g.add(m); });
      return { g, fore, hand, cuff, r };
    };
    const L = mk(0.034), R = mk(0.036);
    return { L, R };
  }

  // a(손목) → b(팔꿈치) 로 팔을 배치 (gun 로컬 좌표)
  _placeArm(arm, wrist, elbow, handRot) {
    const dir = _v.subVectors(elbow, wrist);
    const len = dir.length(); dir.normalize();
    arm.fore.scale.set(1, Math.max(0.01, len - arm.r * 2), 1);
    arm.fore.position.copy(wrist).addScaledVector(dir, len / 2);
    arm.fore.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    arm.cuff.position.copy(wrist).addScaledVector(dir, 0.03);
    arm.cuff.quaternion.copy(arm.fore.quaternion);
    arm.hand.position.copy(wrist);
    arm.hand.rotation.set(handRot[0], handRot[1], handRot[2]);
  }

  _show(id) {
    for (const k in this.models) this.models[k].root.visible = k === id;
    this.cur = id; this.def = WEAPONS[id];
    const m = this.models[id];
    m.gun.add(this.arms.L.g); m.gun.add(this.arms.R.g);
    this._placeArm(this.arms.R, m.rightHand, new THREE.Vector3(0.11, -0.3, 0.32), [-0.35, 0, 0]);
    this._placeArm(this.arms.L, m.leftHand, new THREE.Vector3(-0.2, -0.28, -0.05), [0.2, 0, 0.25]);
  }

  get ammo() { return this.state[this.cur]; }
  get reloading() { return this.reloadT >= 0; }

  startReload() {
    const s = this.ammo;
    if (this.reloading || this.swapT >= 0 || s.mag >= this.def.mag || s.reserve <= 0) return;
    this.reloadT = 0;
    this.G.audio.reload(this.cur);
  }

  swap(to) {
    const next = to || this.order[(this.order.indexOf(this.cur) + 1) % this.order.length];
    if (next === this.cur || this.swapT >= 0) return;
    this.reloadT = -1;
    this.swapT = 0; this.swapTo = next;
    this.G.audio.swap();
  }

  addAmmo(frac) {
    for (const k of this.order) { const d = WEAPONS[k]; this.state[k].reserve = Math.min(d.reserve * 1.5, this.state[k].reserve + Math.ceil(d.reserve * frac)); }
  }

  currentSpread() {
    const d = this.def, P = this.G.player, I = this.G.input;
    let s = d.spreadHip + (d.spreadAds - d.spreadHip) * this.adsT;
    s += Math.min(1, P.speedNow / 4.3) * d.spreadMove * (1 - this.adsT * 0.7);
    if (!P.grounded) s += 0.05;
    if (I.crouch) s *= 0.72;
    return s + this.bloom;
  }

  _fire() {
    const G = this.G, d = this.def, s = this.ammo, cam = G.camera;
    s.mag--;
    this.cool = 60 / d.rpm;
    this.shotCount++;
    this.stats.shots++;
    const origin = cam.position.clone();
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(cam.quaternion);
    const spread = this.currentSpread();
    const m = this.models[this.cur];
    const muzzleW = m.muzzle.getWorldPosition(new THREE.Vector3());
    let hitAny = false, killAny = false, headAny = false, firstEnd = null, shotInfo = null;
    for (let p = 0; p < d.pellets; p++) {
      const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * spread;
      const dir = fwd.clone().addScaledVector(right, Math.cos(a) * r).addScaledVector(up, Math.sin(a) * r).normalize();
      const lvl = G.world.raycast(origin, dir, d.range);
      const maxT = lvl ? lvl.t : d.range;
      const eh = G.enemies.raycast(origin, dir, maxT);
      // 대전: 상대 플레이어 아바타 판정 (쏜 사람 화면 기준, 방장이 검증)
      const mh = G.match.pvp ? G.net.raycastMates(origin, dir, eh ? eh.dist : maxT) : null;
      let end;
      if (mh) {
        end = mh.point;
        const fo = d.falloff, k = Math.min(1, Math.max(0, (mh.dist - fo[0]) / (fo[1] - fo[0])));
        const dmg = d.dmg * (mh.part === 'head' ? Math.min(2, d.headMul) : 1) * (1 - k * (1 - fo[2]));
        G.net.playerHit(mh.mate.id, dmg, mh.part, dir);
        hitAny = true; if (mh.part === 'head') headAny = true;
        G.effects.playerHit(mh.point, dir);
      } else if (eh) {
        end = eh.point;
        const fo = d.falloff, k = Math.min(1, Math.max(0, (eh.dist - fo[0]) / (fo[1] - fo[0])));
        const mul = (eh.part === 'head' ? d.headMul : eh.part === 'core' ? 1.8 : 1) * (1 - k * (1 - fo[2]));
        let res = { killed: false };
        if (G.net.isClient) G.net.sendHost({ t: 'hit', id: eh.enemy.id, d: Math.round(d.dmg * mul * 10) / 10, p: eh.part, dir: G.net.v3(dir) });
        else res = eh.enemy.takeDamage(d.dmg * mul, eh.part, dir, eh.point, G.net.active ? G.net.myId : 'local');
        hitAny = true; if (res.killed) killAny = true; if (eh.part === 'head' || eh.part === 'core') headAny = true;
        G.effects.robotHit(eh.point, dir, eh.part === 'head');
      } else if (lvl) {
        end = origin.clone().addScaledVector(dir, lvl.t);
        G.effects.impact(end, lvl.normal, lvl.surface);
        if (lvl.ref && lvl.ref.explosive) G.combat.damageProp(lvl.ref, d.dmg, G.net.active ? G.net.myId : 'local');
        if (p === 0) shotInfo = { n: lvl.normal, s: lvl.surface };
      } else end = origin.clone().addScaledVector(dir, 120);
      if (p === 0 && (this.shotCount % d.tracerEvery === 0)) G.effects.tracer(muzzleW, end, false);
      if (p === 0) firstEnd = end;
    }
    if (hitAny) { this.stats.hits++; G.hud.hitmarker(killAny, headAny); G.audio.hitmarker(killAny, headAny); }
    G.enemies.alertNoise(origin, 45);
    if (G.net.active && firstEnd) G.net.sendAll({ t: 'shot', e: G.net.v3(firstEnd), w: this.cur === 'shotgun' ? 1 : 0, ...(shotInfo ? { n: G.net.v3(shotInfo.n), s: shotInfo.s } : {}) });

    // 반동/효과
    const ads = this.adsT;
    const crouch = G.input.crouch ? 0.75 : 1;
    G.player.kick(d.recoilP * (1 - ads * 0.4) * crouch * (0.8 + Math.random() * 0.4), (Math.random() - 0.5) * 2 * d.recoilY * crouch);
    this.kickZ += d.kick; this.kickR += d.kick * 1.6;
    this.bloom = Math.min(0.05, this.bloom + d.bloomPer);
    this.flashT = 0.045;
    m.flash.visible = true; m.flash.rotation.z = Math.random() * 6.28; m.flash.scale.setScalar((this.cur === 'shotgun' ? 1.5 : 1) * (0.8 + Math.random() * 0.5));
    this.vmFlash.intensity = 3;
    G.effects.muzzle(muzzleW, this.cur === 'shotgun');
    G.audio.gunshot(this.cur);
    // 탄피 배출
    const port = m.port.getWorldPosition(new THREE.Vector3());
    if (this.cur === 'shotgun' || d.pump) this.pumpT = 0.12;
    else G.effects.shell(port, right.clone().multiplyScalar(2.2 + Math.random()).addScaledVector(up, 1.4 + Math.random() * 0.6).addScaledVector(fwd, 0.4).add(G.player.vel), d.pellets > 1);
    if (G.settings.haptics && navigator.vibrate) try { navigator.vibrate(this.cur === 'shotgun' ? 30 : 12); } catch (e) { /* 미지원 */ }
  }

  update(dt) {
    const G = this.G, I = G.input, d = this.def, s = this.ammo, P = G.player;
    this.cool -= dt;
    this.bloom = Math.max(0, this.bloom - dt * 0.09);

    if (I.take('reload')) this.startReload();
    if (I.take('swap')) this.swap();
    if (I.take('slot1')) this.swap(this.order[0]);
    if (I.take('slot2')) this.swap(this.order[1]);
    if (I.take('grenade') && this.throwT < 0 && this.swapT < 0 && G.player.alive) {
      if (G.combat.playerThrow()) { this.throwT = 0; this.reloadT = -1; }
    }
    if (this.throwT >= 0) { this.throwT += dt; if (this.throwT > 0.55) this.throwT = -1; }

    // 교체
    if (this.swapT >= 0) {
      this.swapT += dt;
      if (this.swapT >= 0.28 && this.swapTo) { this._show(this.swapTo); this.swapTo = null; }
      if (this.swapT >= 0.56) this.swapT = -1;
    }
    // 재장전
    if (this.reloadT >= 0) {
      this.reloadT += dt;
      if (this.reloadT >= d.reload) {
        const need = d.mag - s.mag, take = Math.min(need, s.reserve);
        s.mag += take; s.reserve -= take; this.reloadT = -1;
      }
    }
    const busy = this.reloadT >= 0 || this.swapT >= 0 || this.throwT >= 0;
    const sprint = P.sprinting;
    const wantAds = I.ads && !sprint && this.swapT < 0 && this.reloadT < 0;
    this.adsT += ((wantAds ? 1 : 0) - this.adsT) * Math.min(1, dt * 14);
    this.sprintT += ((sprint && !busy ? 1 : 0) - this.sprintT) * Math.min(1, dt * 9);

    if (I.fire && !busy && this.sprintT < 0.3 && this.cool <= 0 && P.alive) {
      if (s.mag > 0) this._fire();
      else { if (s.reserve > 0) this.startReload(); else if (this.cool <= -0.3) { G.audio.dryFire(); this.cool = 0.3; } }
    }
    if (!busy && s.mag === 0 && s.reserve > 0 && !I.fire) this.startReload();

    // ── 뷰모델 애니메이션 ──
    this.holder.position.copy(G.camera.position);
    this.holder.quaternion.copy(G.camera.quaternion);
    this.vmCam.position.copy(G.camera.position);
    this.vmCam.quaternion.copy(G.camera.quaternion);

    const m = this.models[this.cur];
    const hip = new THREE.Vector3(0.155, -0.155, -0.36);
    const adsP = new THREE.Vector3(0, -(m.sightY ?? d.sightY), m.adsZ ?? d.adsZ); // 실사 총기는 모델별 계산값
    const pos = hip.lerp(adsP, this.adsT);
    const [lx, ly] = [I.lookX, I.lookY];
    this.swayX += (-lx * 0.9 - this.swayX) * Math.min(1, dt * 10) ; this.swayY += (ly * 0.9 - this.swayY) * Math.min(1, dt * 10);
    this.swayX = Math.max(-0.05, Math.min(0.05, this.swayX)); this.swayY = Math.max(-0.05, Math.min(0.05, this.swayY));
    const bt = P.bobT, ba = P.bobAmt * (1 - this.adsT * 0.85) * (sprint ? 1.7 : 1);
    pos.x += Math.cos(bt) * 0.011 * ba + this.swayX * 0.3 * (1 - this.adsT * 0.7);
    pos.y += -Math.abs(Math.sin(bt)) * 0.012 * ba + this.swayY * 0.2 * (1 - this.adsT * 0.7) + Math.sin(G.time * 1.6) * 0.0015 * (1 - this.adsT);
    this.kickZ *= Math.max(0, 1 - dt * 18); this.kickR *= Math.max(0, 1 - dt * 14);
    pos.z += this.kickZ * (1 - this.adsT * 0.4);
    let rx = this.kickR * (1 - this.adsT * 0.6), ry = this.swayX * 1.5, rz = this.swayX * 2 + Math.cos(bt) * 0.02 * ba;
    // 질주 자세
    pos.x += 0.04 * this.sprintT; pos.y -= 0.05 * this.sprintT; pos.z += 0.02 * this.sprintT;
    rx -= 0.32 * this.sprintT; ry += 0.75 * this.sprintT; rz += 0.25 * this.sprintT;
    // 재장전 애니메이션
    if (this.reloadT >= 0) {
      const t = this.reloadT / d.reload;
      const e = Math.sin(Math.min(1, t * 1.25) * Math.PI);
      rz += 0.55 * e; rx += 0.18 * e; pos.y -= 0.06 * e; pos.x -= 0.02 * e;
      if (this.cur === 'rifle') {
        const mp = m.mag.position;
        if (t < 0.22) mp.copy(m.magHome);
        else if (t < 0.4) mp.set(0, m.magHome.y - (t - 0.22) / 0.18 * 0.35, m.magHome.z);
        else if (t < 0.6) mp.set(0, m.magHome.y - 0.35, m.magHome.z);
        else if (t < 0.66) mp.set(0, m.magHome.y - 0.35 + (t - 0.6) / 0.06 * 0.35, m.magHome.z);
        else mp.copy(m.magHome);
        if (t > 0.82 && t < 0.92) pos.z += 0.015;
      } else if (m.pump) {
        const cyc = (t * 4) % 1;
        if (t < 0.85) m.pump.position.z = m.pumpHome + Math.sin(cyc * Math.PI) * 0.01;
      }
    } else if (this.cur === 'rifle') m.mag.position.copy(m.magHome);
    // 펌프 액션
    if (this.pumpT > 0 && !m.pump) { // 실사 펌프 산탄총: 총 전체를 살짝 당겨 펌프 동작 표현 + 탄피 배출
      this.pumpT += dt;
      const k = (this.pumpT - 0.12) / 0.35;
      if (k > 0 && k < 1) { pos.z += Math.sin(k * Math.PI) * 0.03; rx += Math.sin(k * Math.PI) * 0.05; if (k > 0.45 && !this._ejected) { this._ejected = true; const port = m.port.getWorldPosition(new THREE.Vector3()); const r = new THREE.Vector3(1, 0, 0).applyQuaternion(G.camera.quaternion); G.effects.shell(port, r.multiplyScalar(2).add(new THREE.Vector3(0, 1.5, 0)), true); G.audio.click(1800, 0, 0.25, 0.06); } }
      if (k >= 1) { this.pumpT = -1; this._ejected = false; }
    }
    if (this.cur === 'shotgun') {
      if (this.pumpT > 0) {
        this.pumpT += dt;
        const k = (this.pumpT - 0.12) / 0.35;
        if (k > 0 && k < 1) {
          m.pump.position.z = m.pumpHome + Math.sin(k * Math.PI) * 0.07;
          if (k > 0.45 && !this._ejected) { this._ejected = true; const port = m.port.getWorldPosition(new THREE.Vector3()); const r = new THREE.Vector3(1, 0, 0).applyQuaternion(G.camera.quaternion); G.effects.shell(port, r.multiplyScalar(2).add(new THREE.Vector3(0, 1.5, 0)), true); G.audio.click(1800, 0, 0.25, 0.06); }
        }
        if (k >= 1) { this.pumpT = -1; this._ejected = false; m.pump.position.z = m.pumpHome; }
      }
    }
    // 투척 애니메이션 (총을 내렸다 올림)
    if (this.throwT >= 0) { const e = Math.sin(Math.min(1, this.throwT / 0.55) * Math.PI); pos.y -= 0.22 * e; pos.x += 0.05 * e; rx -= 0.5 * e; rz -= 0.3 * e; }
    // 교체 애니메이션
    if (this.swapT >= 0) { const e = Math.sin(Math.min(1, this.swapT / 0.56) * Math.PI); pos.y -= 0.25 * e; rx -= 0.6 * e; }
    m.root.position.copy(pos);
    m.root.rotation.set(rx, ry, rz);
    // 저격 조준경: 정조준이 거의 끝나면 조준경 화면으로 전환
    const scoped = !!d.scope && this.adsT > 0.85 && this.reloadT < 0;
    m.root.visible = !scoped;
    if (this._scoped !== scoped) { this._scoped = scoped; const el = document.getElementById('scope'); if (el) el.hidden = !scoped; }

    // 섬광
    if (this.flashT > 0) { this.flashT -= dt; if (this.flashT <= 0) { m.flash.visible = false; this.vmFlash.intensity = 0; } }
    this.vmFlash.position.copy(m.muzzle.getWorldPosition(_v));
  }
}
