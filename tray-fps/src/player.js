// 플레이어 — 캡슐 충돌 이동, 점프/앉기/질주, 카메라(흔들림·반동·머리 흔들림), 체력 재생
import * as THREE from 'three';

const STAND = 1.75, CROUCH = 1.12, EYE_OFF = 0.13, R = 0.34, STEP = 0.5;

export class Player {
  constructor(G) {
    this.G = G;
    this.cam = G.camera;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0; this.pitch = 0;
    this.height = STAND;
    this.grounded = true;
    this.hp = 100; this.maxHp = 100;
    this.lastHit = 0;
    this.alive = true;
    this.bobT = 0; this.bobAmt = 0;
    this.shakeAmt = 0;
    this.recoilP = 0; this.recoilY = 0;  // 회복 가능한 반동
    this.landKick = 0;
    this.stepDist = 0;
    this.fovCur = 78;
    this.speedNow = 0;
    this._fwd = new THREE.Vector3(); this._right = new THREE.Vector3();
    this.euler = new THREE.Euler(0, 0, 0, 'YXZ');
  }

  spawn(p, yaw = 0) {
    this.pos.copy(p); this.vel.set(0, 0, 0); this.yaw = yaw; this.pitch = 0;
    this.hp = this.maxHp; this.alive = true; this.height = STAND; this.G.input.crouch = false;
    this.recoilP = this.recoilY = 0; this.shakeAmt = 0;
  }

  get eye() { return new THREE.Vector3(this.pos.x, this.pos.y + this.height - EYE_OFF, this.pos.z); }

  shake(a) { this.shakeAmt = Math.min(1.2, this.shakeAmt + a); }

  kick(p, y) { this.recoilP += p; this.recoilY += y; this.pitch += p; this.yaw += y; }

  damage(amount, from) {
    if (!this.alive) return;
    this.hp -= amount;
    this.lastHit = this.G.time;
    this.shake(0.18 + amount * 0.012);
    this.G.hud.damage(from, amount);
    this.G.audio.playerHit();
    if (this.G.settings.haptics && navigator.vibrate) try { navigator.vibrate(25); } catch (e) { /* 미지원 */ }
    if (this.hp <= 0) { this.hp = 0; this.alive = false; this.G.gameOver(); }
  }

  update(dt) {
    const G = this.G, I = G.input, W = G.world, wpn = G.weapons;
    // ── 시점 ──
    let [lx, ly] = I.consumeLook();
    const zoom = this.fovCur / G.settings.fov;
    let friction = 1;
    if (G.settings.aimAssist && I.touchUsed && G.enemies.aimFriction()) friction = 0.55;
    this.yaw -= lx * zoom * friction;
    this.pitch -= ly * zoom * friction;
    // 반동 회복 (플레이어가 반대로 끌어내린 만큼은 회복하지 않음)
    const rec = Math.min(1, dt * 7);
    const rp = this.recoilP * rec, ry = this.recoilY * rec;
    this.pitch -= rp; this.yaw -= ry; this.recoilP -= rp; this.recoilY -= ry;
    this.pitch = Math.max(-1.5, Math.min(1.5, this.pitch));

    // ── 자세 ──
    const wantH = I.crouch ? CROUCH : STAND;
    if (wantH > this.height) {
      const ceil = W.ceilingAt(this.pos.x, this.pos.z, R, this.pos.y + this.height, this.pos.y + wantH + 0.05);
      if (ceil > this.pos.y + wantH) this.height = Math.min(wantH, this.height + dt * 5);
    } else this.height = Math.max(wantH, this.height - dt * 6);

    // ── 이동 ──
    const ads = wpn.adsT > 0.5;
    let speed = 4.3;
    const sprinting = I.sprint && I.move.y > 0.5 && !I.crouch && !ads && this.grounded && !I.fire;
    if (sprinting) speed = 6.6;
    if (I.crouch) speed = 2.1;
    if (ads) speed = Math.min(speed, 2.7);
    this.sprinting = sprinting;
    const f = this._fwd.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const r = this._right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const wish = new THREE.Vector3().addScaledVector(f, I.move.y).addScaledVector(r, I.move.x);
    if (wish.lengthSq() > 1) wish.normalize();
    wish.multiplyScalar(speed);
    const accel = this.grounded ? 14 : 3;
    const k = Math.min(1, accel * dt);
    this.vel.x += (wish.x - this.vel.x) * k;
    this.vel.z += (wish.z - this.vel.z) * k;

    if (I.take('jump') && this.grounded) {
      if (I.crouch) I.crouch = false;
      else { this.vel.y = 6.1; this.grounded = false; }
    }

    // 수평 이동 + 충돌 (계단 오르기 지원)
    const prevY = this.pos.y;
    this.pos.x += this.vel.x * dt; this.pos.z += this.vel.z * dt;
    for (let it = 0; it < 2; it++) W.collideCircle(this.pos, R, this.pos.y + (this.grounded ? STEP : 0.05), this.pos.y + this.height);
    // 맵 경계
    this.pos.x = Math.max(-59.4, Math.min(59.4, this.pos.x));
    this.pos.z = Math.max(-59.2, Math.min(59.4, this.pos.z));

    // 수직
    this.vel.y -= 21 * dt;
    this.pos.y += this.vel.y * dt;
    const ground = W.groundAt(this.pos.x, this.pos.z, R * 0.7, prevY + STEP + 0.01);
    if (this.pos.y <= ground) {
      if (!this.grounded && this.vel.y < -6) { this.landKick = Math.min(0.12, -this.vel.y * 0.012); G.audio.land(); }
      this.pos.y = ground; this.vel.y = 0; this.grounded = true;
    } else if (this.pos.y > ground + 0.05) {
      if (this.grounded && this.pos.y - ground < STEP + 0.02 && this.vel.y <= 0) { this.pos.y = ground; this.vel.y = 0; }
      else this.grounded = false;
    }
    const ceil = W.ceilingAt(this.pos.x, this.pos.z, R * 0.8, this.pos.y + this.height - 0.2, this.pos.y + this.height + 0.3);
    if (this.vel.y > 0 && this.pos.y + this.height > ceil) { this.pos.y = ceil - this.height; this.vel.y = 0; }

    // ── 체력 재생 ──
    if (this.alive && G.time - this.lastHit > 4.5 && this.hp < this.maxHp) this.hp = Math.min(this.maxHp, this.hp + 22 * dt);

    // ── 카메라 ──
    const hs = Math.hypot(this.vel.x, this.vel.z);
    this.speedNow = hs;
    if (this.grounded && hs > 0.5) {
      const before = Math.floor(this.bobT / Math.PI);
      this.bobT += dt * hs * (sprinting ? 2.05 : 2.35);
      if (Math.floor(this.bobT / Math.PI) !== before) G.audio.footstep(sprinting);
    }
    const targetBob = this.grounded ? Math.min(1, hs / 4.3) : 0;
    this.bobAmt += (targetBob - this.bobAmt) * Math.min(1, dt * 8);
    const bobScale = ads ? 0.25 : 1;
    const bobY = Math.abs(Math.sin(this.bobT)) * 0.045 * this.bobAmt * bobScale * (sprinting ? 1.5 : 1);
    const bobX = Math.cos(this.bobT) * 0.025 * this.bobAmt * bobScale;
    this.landKick *= Math.max(0, 1 - dt * 6);

    this.shakeAmt = Math.max(0, this.shakeAmt - dt * 2.2);
    const sh = this.shakeAmt * this.shakeAmt;
    const t = G.time;
    const shX = (Math.sin(t * 47) + Math.sin(t * 31)) * 0.012 * sh, shY = (Math.cos(t * 53) + Math.sin(t * 37)) * 0.012 * sh;

    const eye = this.pos.y + this.height - EYE_OFF;
    this.cam.position.set(this.pos.x + r.x * bobX, eye - bobY - this.landKick + 0.02, this.pos.z + r.z * bobX);
    this.euler.set(this.pitch + shY, this.yaw + shX, Math.cos(this.bobT) * 0.004 * this.bobAmt * bobScale + shX * 0.5);
    this.cam.quaternion.setFromEuler(this.euler);

    // FOV: 조준 시 줌, 질주 시 약간 넓게
    const base = G.settings.fov;
    const target = base * (1 - (1 - wpn.def.adsFov) * wpn.adsT) * (sprinting ? 1.06 : 1);
    this.fovCur += (target - this.fovCur) * Math.min(1, dt * 12);
    if (Math.abs(this.cam.fov - this.fovCur) > 0.01) { this.cam.fov = this.fovCur; this.cam.updateProjectionMatrix(); }
  }
}
