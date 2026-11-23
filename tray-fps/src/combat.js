// 전투 시스템 — 수류탄(물리 궤적·튕김·지연 신관), 폭발 피해(거리 감쇠 + 엄폐 차단), 폭발물(드럼통/프로판) 연쇄 폭발
import * as THREE from 'three';

const R = 0.045;          // 수류탄 반지름
const _v = new THREE.Vector3();

export class Combat {
  constructor(G) {
    this.G = G;
    this.grenades = [];
    this.playerGrenades = 3;
    this.maxGrenades = 4;
    this.enemyGlobalCool = 0;
    this.pendingProps = [];
    // 수류탄 모델 (M67 형태: 구형 몸체 + 신관 + 안전손잡이)
    const body = new THREE.SphereGeometry(0.034, 16, 12); body.scale(1, 1.15, 1);
    const fuse = new THREE.CylinderGeometry(0.009, 0.011, 0.028, 10); fuse.translate(0, 0.046, 0);
    const spoon = new THREE.BoxGeometry(0.012, 0.06, 0.004); spoon.translate(0.02, 0.03, 0);
    this.geo = { body, fuse, spoon };
    this.mat = {
      body: new THREE.MeshStandardMaterial({ color: 0x3d4430, roughness: 0.65, metalness: 0.25 }),
      metal: new THREE.MeshStandardMaterial({ color: 0x8c8f92, roughness: 0.35, metalness: 0.9 }),
    };
  }

  reset() {
    for (const g of this.grenades) g.mesh.removeFromParent();
    this.grenades = [];
    this.playerGrenades = 3;
    this.pendingProps = [];
  }

  _mesh(withSpoon) {
    const g = new THREE.Group();
    const b = new THREE.Mesh(this.geo.body, this.mat.body); b.castShadow = true; g.add(b);
    g.add(new THREE.Mesh(this.geo.fuse, this.mat.metal));
    if (withSpoon) g.add(new THREE.Mesh(this.geo.spoon, this.mat.metal));
    return g;
  }

  enemyGrenadeReady() {
    if (this.enemyGlobalCool > 0) return false;
    this.enemyGlobalCool = 5 + Math.random() * 3;
    return true;
  }

  // 로컬 플레이어 투척
  playerThrow() {
    const G = this.G;
    if (this.playerGrenades <= 0 || !G.player.alive) return false;
    this.playerGrenades--;
    const cam = G.camera;
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    const up = new THREE.Vector3(0, 1, 0);
    const from = cam.position.clone().addScaledVector(fwd, 0.45).addScaledVector(up, -0.12);
    const v = fwd.clone().multiplyScalar(15.5).addScaledVector(up, 3.2).add(G.player.vel);
    const owner = G.net.active ? G.net.myId : 'local';
    this.throwGrenade(from, v, owner, 2.7);
    if (G.net.active) G.net.sendAll({ t: 'gren', p: G.net.v3(from), v: G.net.v3(v), f: 2.7, o: owner });
    G.audio.click(2600, 0, 0.3, 0.05); G.audio.click(900, 0.12, 0.25, 0.06);
    return true;
  }

  // 모든 피어가 같은 초기값으로 각자 시뮬레이션 (결과 오차는 시각적으로 무시 가능한 수준)
  throwGrenade(from, vel, owner, fuse) {
    const G = this.G;
    const mesh = this._mesh(false);
    mesh.position.copy(from);
    G.scene.add(mesh);
    this.grenades.push({ mesh, pos: from.clone(), vel: vel.clone(), w: new THREE.Vector3((Math.random() - 0.5) * 18, (Math.random() - 0.5) * 18, (Math.random() - 0.5) * 18), fuse, owner, bounced: 0 });
    if (owner === 'enemy' && G.net.isHost) G.net.broadcast({ t: 'gren', p: G.net.v3(from), v: G.net.v3(vel), f: fuse, o: 'enemy' });
  }

  // 구 vs AABB 충돌 + 지면
  _collide(g) {
    const W = this.G.world, p = g.pos, v = g.vel;
    let hit = false;
    for (const b of W.colliders) {
      if (b.surface === 'invisible') continue;
      const cx = Math.max(b.minX, Math.min(p.x, b.maxX)), cy = Math.max(b.minY, Math.min(p.y, b.maxY)), cz = Math.max(b.minZ, Math.min(p.z, b.maxZ));
      const dx = p.x - cx, dy = p.y - cy, dz = p.z - cz, d2 = dx * dx + dy * dy + dz * dz;
      if (d2 >= R * R) continue;
      let nx, ny, nz;
      if (d2 > 1e-10) { const d = Math.sqrt(d2); nx = dx / d; ny = dy / d; nz = dz / d; p.x = cx + nx * R; p.y = cy + ny * R; p.z = cz + nz * R; }
      else { nx = 0; ny = 1; nz = 0; p.y = b.maxY + R; }
      const vn = v.x * nx + v.y * ny + v.z * nz;
      if (vn < 0) { v.x -= 1.4 * vn * nx; v.y -= 1.4 * vn * ny; v.z -= 1.4 * vn * nz; v.multiplyScalar(0.72); hit = true; }
    }
    if (p.y < R) { p.y = R; if (v.y < 0) { v.y *= -0.32; v.x *= 0.7; v.z *= 0.7; hit = v.y > 0.3 || hit; } }
    return hit;
  }

  // 폭발: 효과 + 로컬 플레이어 피해(항상) + 적/폭발물 피해(권한 있는 쪽만)
  explode(pos, { radius = 7, dmg = 200, owner = 'local', scale = 1 } = {}) {
    const G = this.G, W = G.world;
    G.effects.explosion(pos, scale);
    // 화면 흔들림 / 귀 먹먹함
    const P = G.player;
    const dCam = G.camera.position.distanceTo(pos);
    P.shake(Math.max(0, 1.1 - dCam / 22));
    const probe = (target) => {
      const d = target.distanceTo(pos);
      if (d > radius) return 0;
      const lifted = pos.clone(); lifted.y += 0.25;
      if (!W.lineOfSight(lifted, target)) return 0; // 엄폐물이 폭발을 막는다
      return Math.pow(1 - d / radius, 1.25);
    };
    if (P.alive && !G.match.friendlyFire(owner)) { // 팀 대전에서 아군 폭발은 무해(자기 수류탄은 예외)
      const k = Math.max(probe(P.eye), probe(new THREE.Vector3(P.pos.x, P.pos.y + 0.5, P.pos.z)));
      const self = owner === (G.net.active ? G.net.myId : 'local') ? 0.55 : 1;
      if (k > 0) P.damage(dmg * 0.55 * k * self, pos.clone(), owner === 'enemy' ? null : owner);
    }
    if (!G.authority) return;
    for (const e of G.enemies.list) {
      if (!e.alive) continue;
      const k = probe(e.aimPoint());
      if (k > 0) {
        const dir = e.aimPoint().sub(pos).normalize();
        e.takeDamage(dmg * k, 'body', dir, e.aimPoint(), owner === 'enemy' ? 'world' : owner);
      }
    }
    for (const rec of W.explosives) {
      if (!rec.explosive.alive || rec.explosive.pending) continue;
      if (rec.explosive.center.distanceTo(pos) < radius * 0.85) this._queueProp(rec, owner, 0.12 + Math.random() * 0.2);
    }
  }

  // 총탄 등으로 폭발물에 피해 (권한 쪽에서 호출; 참가자는 방장에게 전달)
  damageProp(rec, dmg, owner) {
    const G = this.G;
    if (!rec || !rec.explosive || !rec.explosive.alive) return;
    if (!G.authority) { G.net.sendHost({ t: 'propHit', i: G.world.explosives.indexOf(rec), d: dmg }); return; }
    rec.explosive.hp -= dmg;
    if (rec.explosive.hp <= 0 && !rec.explosive.pending) this._queueProp(rec, owner, 0.05);
  }

  _queueProp(rec, owner, delay) {
    rec.explosive.pending = true;
    this.pendingProps.push({ rec, owner, t: delay });
  }

  // 폭발물 터짐 (방장은 계산 후 방송, 참가자는 방송을 받아 연출+자기 피해만)
  detonateProp(rec, owner) {
    const G = this.G, W = G.world;
    if (!rec.explosive.alive) return;
    const c = rec.explosive.center.clone();
    W.destroyProp(rec);
    if (G.net.isHost) G.net.broadcast({ t: 'prop', i: W.explosives.indexOf(rec), o: owner });
    this.explode(c, { radius: rec.explosive.radius, dmg: rec.explosive.dmg, owner, scale: 1.15 });
    // 불기둥 잔불
    for (let k = 0; k < 6; k++) G.effects.smoke.spawn(c, new THREE.Vector3((Math.random() - 0.5), 1.2 + Math.random(), (Math.random() - 0.5)), 3 + Math.random() * 2, 0.8, 3.5, [0.06, 0.055, 0.05], 0.8);
  }

  update(dt) {
    const G = this.G;
    this.enemyGlobalCool -= dt;
    for (let i = this.pendingProps.length - 1; i >= 0; i--) {
      const p = this.pendingProps[i];
      p.t -= dt;
      if (p.t <= 0) { this.pendingProps.splice(i, 1); this.detonateProp(p.rec, p.owner); }
    }
    let warn = null, warnD = 10;
    for (let i = this.grenades.length - 1; i >= 0; i--) {
      const g = this.grenades[i];
      g.fuse -= dt;
      // 서브스텝으로 빠른 투척도 벽을 뚫지 않게
      const steps = 3;
      for (let s = 0; s < steps; s++) {
        const h = dt / steps;
        g.vel.y -= 9.8 * h;
        g.pos.addScaledVector(g.vel, h);
        if (this._collide(g) && g.bounced < 6 && g.vel.lengthSq() > 2) { g.bounced++; G.audio.click(1400 + Math.random() * 600, 0, 0.2, 0.05, g.pos); }
      }
      if (g.pos.y <= R + 0.001 && Math.abs(g.vel.y) < 0.4) { g.vel.x *= Math.max(0, 1 - dt * 3); g.vel.z *= Math.max(0, 1 - dt * 3); }
      g.mesh.position.copy(g.pos);
      const sp = g.vel.length();
      g.mesh.rotation.x += g.w.x * dt * Math.min(1, sp / 3); g.mesh.rotation.z += g.w.z * dt * Math.min(1, sp / 3);
      // 내 것이 아닌 수류탄 경고
      const mine = g.owner === (G.net.active ? G.net.myId : 'local');
      if (!mine && G.player.alive) { const d = g.pos.distanceTo(G.player.pos); if (d < warnD) { warnD = d; warn = g; } }
      if (g.fuse <= 0) {
        g.mesh.removeFromParent();
        this.grenades.splice(i, 1);
        this.explode(g.pos.clone(), { radius: 7.5, dmg: 210, owner: g.owner, scale: 1 });
      }
    }
    G.hud.grenadeWarn(warn ? warn.pos : null);
  }
}
