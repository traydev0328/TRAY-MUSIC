// 적 — 전투 안드로이드 '워든', 비행 드론 '호넷', 중장갑 '불워크'. A* 길찾기 + 시야 판정 + 사격 토큰 AI
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import * as TX from './textures.js';

const TYPES = {
  warden:  { hp: 110, speed: 3.1, dmg: 7,  burst: [3, 5], rof: 0.13, acc: 0.42, range: 34, score: 100, scale: 1,    name: '워든' },
  heavy:   { hp: 420, speed: 2.0, dmg: 9,  burst: [6, 9], rof: 0.1,  acc: 0.34, range: 30, score: 300, scale: 1.24, name: '불워크' },
  drone:   { hp: 45,  speed: 6.5, dmg: 5,  burst: [3, 4], rof: 0.11, acc: 0.38, range: 28, score: 150, scale: 1,    name: '호넷' },
};

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3();
let GEO = null;

function geos() {
  if (GEO) return GEO;
  const RB = (w, h, d, r) => new RoundedBoxGeometry(w, h, d, 3, r);
  GEO = {
    pelvis: RB(0.34, 0.16, 0.22, 0.04),
    abdomen: new THREE.CylinderGeometry(0.11, 0.14, 0.24, 14),
    chest: RB(0.46, 0.36, 0.27, 0.07),
    pack: RB(0.32, 0.32, 0.14, 0.04),
    neck: new THREE.CylinderGeometry(0.045, 0.055, 0.1, 10),
    helmet: new THREE.SphereGeometry(0.13, 20, 16),
    visor: RB(0.19, 0.055, 0.08, 0.02),
    pauldron: RB(0.17, 0.12, 0.19, 0.05),
    upper: new THREE.CapsuleGeometry(0.052, 0.2, 4, 10),
    fore: new THREE.CapsuleGeometry(0.047, 0.2, 4, 10),
    hand: RB(0.07, 0.09, 0.06, 0.02),
    thigh: new THREE.CapsuleGeometry(0.075, 0.28, 4, 12),
    shin: new THREE.CapsuleGeometry(0.06, 0.3, 4, 10),
    shinPlate: RB(0.12, 0.3, 0.06, 0.025),
    foot: RB(0.11, 0.07, 0.22, 0.03),
    stripe: new THREE.BoxGeometry(0.2, 0.018, 0.01),
    gunBody: RB(0.06, 0.09, 0.5, 0.015),
    gunBarrel: new THREE.CylinderGeometry(0.014, 0.014, 0.25, 10).rotateX(Math.PI / 2),
    gunMag: RB(0.035, 0.14, 0.06, 0.01),
    // 드론
    dBody: new THREE.SphereGeometry(0.3, 24, 16),
    dArm: RB(0.62, 0.04, 0.06, 0.015),
    dRotor: new THREE.CylinderGeometry(0.2, 0.2, 0.01, 24),
    dHub: new THREE.CylinderGeometry(0.05, 0.05, 0.06, 12),
    dEye: new THREE.SphereGeometry(0.075, 16, 12),
    dGun: new THREE.CylinderGeometry(0.02, 0.02, 0.28, 10).rotateX(Math.PI / 2),
    hit: new THREE.SphereGeometry(1, 8, 6),
  };
  return GEO;
}

let MATS = null;
function mats() {
  if (MATS) return MATS;
  const micro = TX.microDetail(301);
  MATS = {
    armor: new THREE.MeshPhysicalMaterial({ color: 0xb9bcbd, roughness: 0.38, metalness: 0.1, clearcoat: 0.6, clearcoatRoughness: 0.25, normalMap: micro, normalScale: new THREE.Vector2(0.25, 0.25) }),
    armorDark: new THREE.MeshPhysicalMaterial({ color: 0x2b2e30, roughness: 0.42, metalness: 0.3, clearcoat: 0.5, clearcoatRoughness: 0.3, normalMap: micro, normalScale: new THREE.Vector2(0.25, 0.25) }),
    joint: new THREE.MeshStandardMaterial({ color: 0x141517, roughness: 0.4, metalness: 0.9, normalMap: micro }),
    gun: new THREE.MeshStandardMaterial({ color: 0x1a1b1d, roughness: 0.4, metalness: 0.7 }),
    hazard: new THREE.MeshStandardMaterial({ color: 0xc46a12, roughness: 0.5, metalness: 0.2 }),
    rotor: new THREE.MeshBasicMaterial({ color: 0x222222, transparent: true, opacity: 0.35, depthWrite: false }),
  };
  return MATS;
}

function glowMat(color, k) { return new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k), toneMapped: true }); }

class Enemy {
  constructor(G, type, pos) {
    this.G = G; this.type = type; this.T = TYPES[type];
    this.hp = this.T.hp; this.alive = true;
    this.pos = pos.clone();
    this.vel = new THREE.Vector3();
    this.yaw = Math.random() * 6.28;
    this.path = null; this.pathT = Math.random() * 0.5; this.losT = Math.random() * 0.2;
    this.canSee = false; this.seenT = 0; this.lastSeen = null; this.alerted = false;
    this.burstLeft = 0; this.shotT = 0; this.nextBurst = 1 + Math.random();
    this.strafeDir = Math.random() > 0.5 ? 1 : -1; this.strafeT = 0;
    this.walkT = 0; this.flinch = 0; this.hasToken = false;
    this.root = new THREE.Group();
    this.root.userData.enemy = this;
    this.build();
    this.root.position.copy(this.pos);
    G.scene.add(this.root);
  }

  build() {
    const g = geos(), M = mats(), s = this.T.scale, heavy = this.type === 'heavy';
    const armor = heavy ? M.armorDark : M.armor;
    this.visorMat = glowMat(heavy ? 0xff5a1a : 0x40d8ff, 7);
    const mk = (geo, mat, part = 'body', cast = false) => { const m = new THREE.Mesh(geo, mat); m.userData.part = part; m.castShadow = cast; return m; };
    const R = this.rig = {};
    const body = new THREE.Group(); body.scale.setScalar(s); this.root.add(body);
    R.hips = new THREE.Group(); R.hips.position.y = 0.98; body.add(R.hips);
    R.hips.add(mk(g.pelvis, M.joint, 'body', true));
    R.spine = new THREE.Group(); R.spine.position.y = 0.08; R.hips.add(R.spine);
    const ab = mk(g.abdomen, M.joint); ab.position.y = 0.12; R.spine.add(ab);
    const chest = mk(g.chest, armor, 'body', true); chest.position.y = 0.42; R.spine.add(chest);
    const pack = mk(g.pack, M.armorDark); pack.position.set(0, 0.44, -0.19); R.spine.add(pack);
    const st = mk(g.stripe, heavy ? M.hazard : this.visorMat); st.position.set(0, 0.5, 0.136); R.spine.add(st);
    const neck = mk(g.neck, M.joint); neck.position.y = 0.64; R.spine.add(neck);
    R.head = new THREE.Group(); R.head.position.y = 0.76; R.spine.add(R.head);
    const helm = mk(g.helmet, armor, 'head', true); helm.scale.set(1, 1.08, 1.15); R.head.add(helm);
    const visor = mk(g.visor, this.visorMat, 'head'); visor.position.set(0, 0.01, 0.12); R.head.add(visor);
    R.arms = [];
    for (const sd of [-1, 1]) {
      const sh = new THREE.Group(); sh.position.set(sd * 0.29, 0.54, 0); R.spine.add(sh);
      const pd = mk(g.pauldron, armor); pd.position.set(sd * 0.02, 0.03, 0); sh.add(pd);
      const up = mk(g.upper, M.joint); up.position.y = -0.16; sh.add(up);
      const el = new THREE.Group(); el.position.y = -0.31; sh.add(el);
      const fo = mk(g.fore, armor); fo.position.y = -0.15; el.add(fo);
      const hd = mk(g.hand, M.joint); hd.position.y = -0.3; el.add(hd);
      R.arms.push({ sh, el, sd });
    }
    R.legs = [];
    for (const sd of [-1, 1]) {
      const hp = new THREE.Group(); hp.position.set(sd * 0.115, -0.04, 0); R.hips.add(hp);
      const th = mk(g.thigh, armor, 'body', true); th.position.y = -0.22; hp.add(th);
      const kn = new THREE.Group(); kn.position.y = -0.46; hp.add(kn);
      const sn = mk(g.shin, M.joint, 'body', true); sn.position.y = -0.22; kn.add(sn);
      const sp = mk(g.shinPlate, armor); sp.position.set(0, -0.2, 0.05); kn.add(sp);
      const ft = mk(g.foot, M.joint); ft.position.set(0, -0.47, 0.04); kn.add(ft);
      R.legs.push({ hp, kn, sd });
    }
    // 소총 (가슴 앞 조준 자세)
    R.gun = new THREE.Group(); R.gun.position.set(0.1, 0.36, 0.32); R.spine.add(R.gun);
    R.gun.add(mk(g.gunBody, M.gun));
    const br = mk(g.gunBarrel, M.gun); br.position.set(0, 0.015, 0.36); R.gun.add(br);
    const mg = mk(g.gunMag, M.gun); mg.position.set(0, -0.1, 0.06); mg.rotation.x = 0.25; R.gun.add(mg);
    R.muzzle = new THREE.Object3D(); R.muzzle.position.set(0, 0.015, 0.5); R.gun.add(R.muzzle);
    // 조준 팔 자세
    R.arms[1].sh.rotation.set(-1.25, 0, -0.25); R.arms[1].el.rotation.set(-0.35, 0, 0);
    R.arms[0].sh.rotation.set(-1.05, 0, 0.55); R.arms[0].el.rotation.set(-0.75, 0, 0);
    this.radius = 0.36 * s;
    this.eyeH = 1.72 * s;
  }

  get eye() { return _v2.set(this.pos.x, this.pos.y + this.eyeH, this.pos.z); }
  aimPoint() { return new THREE.Vector3(this.pos.x, this.pos.y + this.eyeH * 0.72, this.pos.z); }

  takeDamage(dmg, part, dir, point) {
    if (!this.alive) return { killed: false };
    this.hp -= dmg;
    this.flinch = Math.min(1, this.flinch + (part === 'head' ? 0.9 : 0.45));
    this.alerted = true; this.lastSeen = this.G.player.eye.clone();
    if (this.hp <= 0) { this.die(dir, part === 'head' || part === 'core'); return { killed: true }; }
    return { killed: false };
  }

  die(dir, head) {
    this.alive = false;
    const G = this.G;
    G.enemies.onKill(this, head);
    // 부품을 월드로 떼어내 파편 물리 적용 (래그돌 대용)
    this.root.updateMatrixWorld(true);
    const meshes = [];
    this.root.traverse((o) => { if (o.isMesh) meshes.push(o); });
    const center = this.aimPoint();
    for (const m of meshes) {
      G.scene.attach(m);
      m.castShadow = false;
      const p = m.getWorldPosition(_v);
      const out = p.clone().sub(center).setY(0).normalize();
      const v = new THREE.Vector3().addScaledVector(dir, 2.5 + Math.random() * 2).addScaledVector(out, 1 + Math.random() * 1.5);
      v.y = 1 + Math.random() * 2.5;
      G.effects.addDebris(m, v, new THREE.Vector3((Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10), 0.06 * this.T.scale);
    }
    G.effects.robotHit(center, dir, true);
    if (this.type === 'heavy') G.effects.explosion(center, 0.8);
    this.root.removeFromParent();
  }

  // ── AI ──
  update(dt) {
    const G = this.G, P = G.player, W = G.world, T = this.T;
    const target = P.eye;
    const toP = _v.subVectors(target, this.pos); toP.y = 0;
    const dist = toP.length();
    this.flinch = Math.max(0, this.flinch - dt * 3);

    // 시야 판정 (0.2초 간격)
    this.losT -= dt;
    if (this.losT <= 0) {
      this.losT = 0.2;
      const wasSee = this.canSee;
      this.canSee = dist < 70 && W.lineOfSight(this.eye.clone(), target);
      if (this.canSee) { this.lastSeen = target.clone(); if (!this.alerted || !wasSee) { if (!this.alerted) G.audio.alert(this.eye.clone()); this.alerted = true; this.seenT = 0; } }
    }
    if (this.canSee) this.seenT += dt; else this.seenT = 0;

    // 이동 목표 결정
    let moveTo = null, speed = T.speed;
    const engage = this.canSee && dist < T.range;
    if (engage) {
      // 교전: 좌우 이동하며 사격, 너무 가까우면 뒤로, 멀면 천천히 전진
      this.strafeT -= dt;
      if (this.strafeT <= 0) { this.strafeT = 1.2 + Math.random() * 1.8; this.strafeDir = Math.random() > 0.5 ? 1 : -1; }
      const n = toP.clone().normalize();
      const side = new THREE.Vector3(-n.z, 0, n.x).multiplyScalar(this.strafeDir);
      const fwd = dist > T.range * 0.55 ? 0.5 : dist < 7 ? -0.7 : 0;
      moveTo = this.pos.clone().addScaledVector(side, 2).addScaledVector(n, fwd * 2);
      speed *= 0.55;
      this.path = null;
    } else {
      const goal = this.alerted && this.lastSeen ? this.lastSeen : P.pos;
      this.pathT -= dt;
      if (this.pathT <= 0 || !this.path || !this.path.length) {
        this.pathT = 0.9 + Math.random() * 0.5;
        this.path = W.findPath(this.pos, goal);
      }
      if (this.path && this.path.length) {
        moveTo = this.path[0];
        if (_v2.set(moveTo.x - this.pos.x, 0, moveTo.z - this.pos.z).length() < 0.6) this.path.shift();
      }
      if (this.lastSeen && !this.canSee && this.pos.distanceTo(this.lastSeen) < 2) this.lastSeen = null;
    }

    // 조향 + 분리(서로 겹치지 않게)
    const want = new THREE.Vector3();
    if (moveTo) { want.set(moveTo.x - this.pos.x, 0, moveTo.z - this.pos.z); const l = want.length(); if (l > 0.05) want.multiplyScalar(speed * (1 - this.flinch * 0.6) / l); }
    for (const o of G.enemies.list) {
      if (o === this || !o.alive || o.type === 'drone') continue;
      const dx = this.pos.x - o.pos.x, dz = this.pos.z - o.pos.z, d2 = dx * dx + dz * dz;
      if (d2 < 1.4 && d2 > 1e-4) { const d = Math.sqrt(d2); want.x += dx / d * 1.5; want.z += dz / d * 1.5; }
    }
    this.vel.x += (want.x - this.vel.x) * Math.min(1, dt * 6);
    this.vel.z += (want.z - this.vel.z) * Math.min(1, dt * 6);
    this.pos.x += this.vel.x * dt; this.pos.z += this.vel.z * dt;
    W.collideCircle(this.pos, this.radius, this.pos.y + 0.3, this.pos.y + 1.8);
    this.pos.y = W.groundAt(this.pos.x, this.pos.z, 0.2, this.pos.y + 0.45);

    // 방향
    const faceTo = (engage || this.canSee) ? Math.atan2(toP.x, toP.z) : Math.atan2(this.vel.x, this.vel.z);
    if (engage || this.canSee || this.vel.lengthSq() > 0.1) {
      let d = faceTo - this.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
      this.yaw += d * Math.min(1, dt * 7);
    }

    // 사격
    this._combat(dt, engage, dist);
    this._animate(dt, target);
  }

  _combat(dt, engage, dist) {
    const G = this.G, T = this.T, E = G.enemies;
    if (!engage || this.seenT < 0.55 || !G.player.alive) { if (this.hasToken && this.burstLeft <= 0) E.releaseToken(this); return; }
    this.nextBurst -= dt;
    if (this.burstLeft <= 0 && this.nextBurst <= 0) {
      if (E.requestToken(this)) { this.burstLeft = T.burst[0] + Math.floor(Math.random() * (T.burst[1] - T.burst[0] + 1)); this.shotT = 0; }
      else this.nextBurst = 0.3;
    }
    if (this.burstLeft > 0) {
      this.shotT -= dt;
      if (this.shotT <= 0) {
        this.shotT = T.rof; this.burstLeft--;
        this._shoot(dist);
        if (this.burstLeft <= 0) { this.nextBurst = 0.9 + Math.random() * 1.4; E.releaseToken(this); }
      }
    }
  }

  _muzzleWorld() { return this.rig.muzzle.getWorldPosition(new THREE.Vector3()); }

  _shoot(dist) {
    const G = this.G, P = G.player, T = this.T;
    const from = this._muzzleWorld();
    const target = P.eye.clone(); target.y -= 0.35 + Math.random() * 0.4;
    // 명중률: 거리, 플레이어 이동 속도, 앉기, 난이도(웨이브)
    let acc = T.acc * (1 - Math.min(0.6, dist / 70)) * (1 - Math.min(0.45, P.speedNow / 14)) * (G.input.crouch ? 0.8 : 1);
    acc *= 1 + Math.min(0.5, (G.wave - 1) * 0.05);
    acc *= 1 - this.flinch * 0.6;
    const hit = Math.random() < acc;
    let end;
    if (hit) { end = target; P.damage(T.dmg * (0.85 + Math.random() * 0.3), this.pos.clone()); }
    else {
      const miss = new THREE.Vector3((Math.random() - 0.5) * 2.2, (Math.random() - 0.3) * 1.2, (Math.random() - 0.5) * 2.2);
      const dir = target.clone().add(miss).sub(from).normalize();
      const h = G.world.raycast(from, dir, 120);
      end = from.clone().addScaledVector(dir, h ? h.t : 80);
      if (h) G.effects.impact(end, h.normal, h.surface);
      if (end.distanceTo(P.eye) < 6 || target.distanceTo(from) > 3) { if (Math.random() < 0.3) G.audio.ricochetNear(); }
    }
    const dir = end.clone().sub(from).normalize();
    G.effects.enemyMuzzle(from, dir);
    G.effects.tracer(from, end, true);
    G.audio.gunshot(this.type === 'heavy' ? 'heavy' : 'enemy', from, 0.9);
  }

  _animate(dt, target) {
    const R = this.rig;
    const sp = Math.hypot(this.vel.x, this.vel.z);
    this.walkT += dt * sp * 2.6;
    const a = Math.min(1, sp / 2.5);
    for (const L of R.legs) {
      const ph = this.walkT + (L.sd > 0 ? Math.PI : 0);
      L.hp.rotation.x = Math.sin(ph) * 0.55 * a;
      L.kn.rotation.x = Math.max(0, -Math.cos(ph)) * 0.9 * a + 0.05;
    }
    R.hips.position.y = 0.98 - Math.abs(Math.cos(this.walkT)) * 0.04 * a;
    // 상체 조준: 피치를 목표로
    const eye = this.eye;
    const dy = target.y - eye.y, dh = Math.hypot(target.x - eye.x, target.z - eye.z);
    const pitch = this.canSee ? Math.atan2(dy, dh) : 0;
    R.spine.rotation.x = -pitch * 0.8 + this.flinch * -0.35;
    R.spine.rotation.z = Math.sin(this.walkT) * 0.04 * a;
    R.head.rotation.x = -pitch * 0.2;
    this.root.position.copy(this.pos);
    this.root.rotation.y = this.yaw;
    this.visorMat.color.setRGB(this.canSee ? 7 : 0.3, this.canSee ? 0.5 : 5, this.canSee ? 0.3 : 7);
    if (this.type === 'heavy') this.visorMat.color.setRGB(7, 1.8, 0.3);
  }
}

class Drone extends Enemy {
  build() {
    const g = geos(), M = mats();
    this.visorMat = glowMat(0xff2a1a, 8);
    const mk = (geo, mat, part = 'body', cast = false) => { const m = new THREE.Mesh(geo, mat); m.userData.part = part; m.castShadow = cast; return m; };
    const body = mk(g.dBody, M.armorDark, 'body', true); body.scale.set(1, 0.55, 1.25); this.root.add(body);
    const top = mk(g.dBody, M.armor); top.scale.set(0.7, 0.3, 0.9); top.position.y = 0.1; this.root.add(top);
    const eye = mk(g.dEye, this.visorMat, 'core'); eye.position.set(0, -0.02, 0.33); this.root.add(eye);
    this.rotors = [];
    for (let k = 0; k < 4; k++) {
      const a = Math.PI / 4 + k * Math.PI / 2;
      const arm = mk(g.dArm, M.joint); arm.rotation.y = -a; arm.position.set(Math.cos(a) * 0.3, 0.02, Math.sin(a) * 0.3); this.root.add(arm);
      const hub = mk(g.dHub, M.joint); hub.position.set(Math.cos(a) * 0.58, 0.05, Math.sin(a) * 0.58); this.root.add(hub);
      const rot = mk(g.dRotor, M.rotor); rot.position.set(Math.cos(a) * 0.58, 0.09, Math.sin(a) * 0.58); this.root.add(rot);
      const led = mk(new THREE.SphereGeometry(0.018, 6, 4), glowMat(k < 2 ? 0x30ff60 : 0xff2020, 8)); led.position.set(Math.cos(a) * 0.62, 0.0, Math.sin(a) * 0.62); this.root.add(led);
      this.rotors.push(rot);
    }
    const gun = mk(g.dGun, M.gun); gun.position.set(0, -0.17, 0.12); this.root.add(gun);
    this.rig = { muzzle: new THREE.Object3D() };
    this.rig.muzzle.position.set(0, -0.17, 0.28); this.root.add(this.rig.muzzle);
    this.radius = 0.55; this.eyeH = 0;
    this.pos.y = 6;
    this.alt = 4 + Math.random() * 3;
    this.orbit = Math.random() * 6.28;
    this.sound = this.G.audio.droneLoop(this.pos);
    this.wobble = Math.random() * 10;
  }

  aimPoint() { return this.pos.clone(); }

  die(dir, head) {
    if (this.sound) this.sound.stop();
    this.G.effects.explosion(this.pos.clone(), 0.6);
    super.die(dir, head);
  }

  update(dt) {
    const G = this.G, P = G.player, W = G.world, T = this.T;
    const target = P.eye;
    const toP = new THREE.Vector3().subVectors(target, this.pos);
    const hd = Math.hypot(toP.x, toP.z);
    this.flinch = Math.max(0, this.flinch - dt * 3);
    this.losT -= dt;
    if (this.losT <= 0) {
      this.losT = 0.2;
      this.canSee = hd < 70 && W.lineOfSight(this.pos, target);
      if (this.canSee && !this.alerted) { this.alerted = true; G.audio.alert(this.pos.clone()); }
      if (this.canSee) this.lastSeen = target.clone();
    }
    if (this.canSee) this.seenT += dt; else this.seenT = 0;

    // 플레이어 주위를 선회하며 고도 유지. 시야가 막히면 고도를 높인다
    this.orbit += dt * 0.35;
    const R = this.canSee ? 11 : 6;
    const goal = new THREE.Vector3(P.pos.x + Math.cos(this.orbit) * R, 0, P.pos.z + Math.sin(this.orbit) * R);
    const wantAlt = (this.canSee ? this.alt : this.alt + 3.5) + Math.sin(G.time * 1.3 + this.wobble) * 0.4;
    const want = new THREE.Vector3(goal.x - this.pos.x, 0, goal.z - this.pos.z);
    const l = want.length(); if (l > 0.1) want.multiplyScalar(Math.min(T.speed, l * 1.2) / l);
    want.y = (wantAlt - this.pos.y) * 1.8;
    for (const o of G.enemies.list) {
      if (o === this || !o.alive || o.type !== 'drone') continue;
      const d = this.pos.distanceTo(o.pos);
      if (d < 2.5 && d > 0.01) want.addScaledVector(_v.subVectors(this.pos, o.pos), 2 / d);
    }
    this.vel.lerp(want, Math.min(1, dt * 2.2));
    this.pos.addScaledVector(this.vel, dt);
    // 지형 회피: 박스 위로 밀어 올리기
    const gnd = W.groundAt(this.pos.x, this.pos.z, 0.5, 60);
    if (this.pos.y < gnd + 1.5) { this.pos.y = gnd + 1.5; this.vel.y = Math.max(0, this.vel.y); }
    W.collideCircle(this.pos, 0.6, this.pos.y - 0.2, this.pos.y + 0.2);
    this.pos.y = Math.min(this.pos.y, 14);
    if (this.pos.x > -43 && this.pos.x < -17 && this.pos.z > -27 && this.pos.z < -9 && this.pos.y > 7.5) this.pos.y = Math.max(this.pos.y, 9.6);

    const yawT = Math.atan2(toP.x, toP.z);
    let d = yawT - this.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); this.yaw += d * Math.min(1, dt * 4);
    this.root.position.copy(this.pos);
    this.root.rotation.set(this.vel.z * 0.05 * Math.cos(this.yaw) + this.flinch * 0.4, this.yaw, -this.vel.x * 0.05);
    for (const r of this.rotors) r.rotation.y += dt * 60;
    if (this.sound) this.sound.update(this.pos);
    this._combat(dt, this.canSee && hd < T.range, hd);
  }
}

export class Enemies {
  constructor(G) {
    this.G = G;
    this.list = [];
    this.tokens = new Set();
    this.maxTokens = 2;
    this.ray = new THREE.Raycaster();
    this.kills = 0; this.headshots = 0;
  }

  clear() {
    for (const e of this.list) { if (e.sound) e.sound.stop(); e.root.removeFromParent(); }
    this.list = []; this.tokens.clear();
  }

  spawn(type) {
    const G = this.G, W = G.world, P = G.player;
    // 플레이어에게서 멀고 보이지 않는 스폰 지점 선택
    const scored = W.spawnPoints.map((p) => {
      const d = p.distanceTo(P.pos);
      const vis = W.lineOfSight(new THREE.Vector3(p.x, 1.6, p.z), P.eye);
      // 25~55m 거리, 플레이어 시야 밖을 선호
      return { p, s: (d < 20 ? -200 : -Math.abs(d - 40)) + (vis ? -60 : 0) + Math.random() * 18 };
    }).sort((a, b) => b.s - a.s);
    const base = W.randomWalkableNear(scored[0].p, 2);
    const e = type === 'drone' ? new Drone(G, 'drone', base) : new Enemy(G, type, base);
    this.list.push(e);
    return e;
  }

  get alive() { return this.list.filter((e) => e.alive).length; }

  requestToken(e) {
    this.maxTokens = Math.min(4, 2 + Math.floor((this.G.wave - 1) / 3));
    if (this.tokens.has(e)) return true;
    if (this.tokens.size < this.maxTokens) { this.tokens.add(e); e.hasToken = true; return true; }
    return false;
  }
  releaseToken(e) { this.tokens.delete(e); e.hasToken = false; }

  alertNoise(pos, radius) {
    for (const e of this.list) if (e.alive && e.pos.distanceTo(pos) < radius && !e.alerted) { e.alerted = true; e.lastSeen = pos.clone(); }
  }

  onKill(e, head) {
    this.releaseToken(e);
    this.kills++; if (head) this.headshots++;
    const G = this.G;
    G.addScore(e.T.score + (head ? 50 : 0));
    G.hud.feed(`${e.T.name} 제거${head ? ' · 헤드샷' : ''}`, e.T.score + (head ? 50 : 0));
    G.pickups.maybeDrop(e.pos.clone());
  }

  raycast(origin, dir, maxT) {
    this.ray.set(origin, dir); this.ray.far = maxT;
    const roots = this.list.filter((e) => e.alive).map((e) => e.root);
    if (!roots.length) return null;
    for (const r of roots) r.updateMatrixWorld(true); // 렌더 전에도 최신 자세로 판정
    const hits = this.ray.intersectObjects(roots, true);
    for (const h of hits) {
      let o = h.object; while (o && !o.userData.enemy) o = o.parent;
      if (!o) continue;
      if (h.object.material && h.object.material.transparent) continue; // 로터 무시
      return { enemy: o.userData.enemy, part: h.object.userData.part || 'body', point: h.point, dist: h.distance };
    }
    return null;
  }

  // 조준 보정용: 화면 중앙 근처에 적이 있는가
  aimFriction() {
    const cam = this.G.camera;
    const f = _v.set(0, 0, -1).applyQuaternion(cam.quaternion);
    for (const e of this.list) {
      if (!e.alive || !e.canSee) continue;
      const p = e.aimPoint();
      const d = p.sub(cam.position); const dist = d.length(); d.divideScalar(dist);
      const ang = Math.acos(Math.min(1, d.dot(f)));
      if (ang < Math.atan2(0.9, dist)) return true;
    }
    return false;
  }

  update(dt) {
    for (const e of this.list) if (e.alive) e.update(dt);
    if (this.list.length > 40) this.list = this.list.filter((e) => e.alive);
  }
}
