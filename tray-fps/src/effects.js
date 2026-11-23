// 이펙트 — 파티클(불꽃/연기/섬광), 탄흔 데칼, 예광탄, 탄피, 파편 물리, 섬광 조명
import * as THREE from 'three';
import * as TX from './textures.js';

const PVERT = /* glsl */`
  attribute vec3 aColor; attribute float aAlpha; attribute float aSize; attribute float aRot;
  uniform float uPx; varying vec3 vColor; varying float vAlpha; varying float vRot;
  void main(){
    vColor = aColor; vAlpha = aAlpha; vRot = aRot;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = min(aSize * uPx / max(-mv.z, 0.05), 512.0);
    gl_Position = projectionMatrix * mv;
  }`;
const PFRAG = /* glsl */`
  uniform sampler2D uMap; uniform float uAdd; varying vec3 vColor; varying float vAlpha; varying float vRot;
  void main(){
    vec2 c = gl_PointCoord - 0.5; float s = sin(vRot), co = cos(vRot);
    c = mat2(co, -s, s, co) * c + 0.5;
    vec4 t = texture2D(uMap, c);
    float a = t.a * vAlpha; if (a < 0.003) discard;
    gl_FragColor = uAdd > 0.5 ? vec4(vColor * t.rgb * a, 1.0) : vec4(vColor * t.rgb, a);
  }`;

class Particles {
  constructor(scene, max, map, additive, { gravity = 0, drag = 0 } = {}) {
    this.max = max; this.n = 0; this.gravity = gravity; this.drag = drag;
    const g = this.geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(max * 3); this.col = new Float32Array(max * 3);
    this.alpha = new Float32Array(max); this.size = new Float32Array(max); this.rot = new Float32Array(max);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aRot', new THREE.BufferAttribute(this.rot, 1).setUsage(THREE.DynamicDrawUsage));
    g.setDrawRange(0, 0);
    this.vel = new Float32Array(max * 3); this.life = new Float32Array(max); this.maxLife = new Float32Array(max);
    this.s0 = new Float32Array(max); this.s1 = new Float32Array(max); this.a0 = new Float32Array(max); this.vr = new Float32Array(max);
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: map }, uPx: { value: 800 }, uAdd: { value: additive ? 1 : 0 } },
      vertexShader: PVERT, fragmentShader: PFRAG, transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 8 : 7;
    scene.add(this.points);
  }

  spawn(p, v, life, s0, s1, color, a0 = 1) {
    let i = this.n;
    if (i >= this.max) i = Math.floor(Math.random() * this.max); else this.n++;
    this.pos[i * 3] = p.x; this.pos[i * 3 + 1] = p.y; this.pos[i * 3 + 2] = p.z;
    this.vel[i * 3] = v.x; this.vel[i * 3 + 1] = v.y; this.vel[i * 3 + 2] = v.z;
    this.col[i * 3] = color[0]; this.col[i * 3 + 1] = color[1]; this.col[i * 3 + 2] = color[2];
    this.life[i] = this.maxLife[i] = life; this.s0[i] = s0; this.s1[i] = s1; this.a0[i] = a0;
    this.size[i] = s0; this.alpha[i] = a0; this.rot[i] = Math.random() * 6.28; this.vr[i] = (Math.random() - 0.5) * 2;
  }

  update(dt) {
    const g = this.gravity, dr = Math.max(0, 1 - this.drag * dt);
    for (let i = 0; i < this.n; i++) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this._kill(i); i--; continue; }
      const k = 1 - this.life[i] / this.maxLife[i];
      const i3 = i * 3;
      this.vel[i3 + 1] -= g * dt;
      this.vel[i3] *= dr; this.vel[i3 + 1] *= dr; this.vel[i3 + 2] *= dr;
      this.pos[i3] += this.vel[i3] * dt; this.pos[i3 + 1] += this.vel[i3 + 1] * dt; this.pos[i3 + 2] += this.vel[i3 + 2] * dt;
      if (this.pos[i3 + 1] < 0.02 && g > 0) { this.pos[i3 + 1] = 0.02; this.vel[i3 + 1] *= -0.3; this.vel[i3] *= 0.5; this.vel[i3 + 2] *= 0.5; }
      this.size[i] = this.s0[i] + (this.s1[i] - this.s0[i]) * k;
      this.alpha[i] = this.a0[i] * (1 - k) * (1 - k * 0.3);
      this.rot[i] += this.vr[i] * dt;
    }
    const a = this.geo.attributes;
    a.position.needsUpdate = a.aColor.needsUpdate = a.aAlpha.needsUpdate = a.aSize.needsUpdate = a.aRot.needsUpdate = true;
    this.geo.setDrawRange(0, this.n);
  }

  _kill(i) {
    const j = --this.n;
    if (i === j) return;
    for (const [arr, w] of [[this.pos, 3], [this.vel, 3], [this.col, 3]]) for (let c = 0; c < w; c++) arr[i * w + c] = arr[j * w + c];
    for (const arr of [this.life, this.maxLife, this.s0, this.s1, this.a0, this.size, this.alpha, this.rot, this.vr]) arr[i] = arr[j];
  }
}

const _v = new THREE.Vector3();
const rnd = (a = 1) => (Math.random() - 0.5) * 2 * a;

export class Effects {
  constructor(G) {
    this.G = G;
    const S = this.scene = G.scene;
    const spark = TX.radialSprite(64, [[0, 'rgba(255,255,255,1)'], [0.35, 'rgba(255,255,255,0.6)'], [1, 'rgba(255,255,255,0)']]);
    this.sparks = new Particles(S, 700, spark, true, { gravity: 9.8, drag: 1.2 });
    this.smoke = new Particles(S, 160, TX.smokeSprite(3), false, { gravity: -0.35, drag: 1.6 });
    this.flashes = new Particles(S, 40, TX.flashSprite(), true);
    this.chips = new Particles(S, 300, spark, false, { gravity: 9.8, drag: 0.6 });
    this.systems = [this.sparks, this.smoke, this.flashes, this.chips];

    // 탄흔
    const holeMat = new THREE.MeshStandardMaterial({ map: TX.bulletHole(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, roughness: 0.9, metalness: 0 });
    const holeGeo = new THREE.PlaneGeometry(1, 1);
    this.holes = []; this.holeIdx = 0;
    for (let i = 0; i < 90; i++) { const m = new THREE.Mesh(holeGeo, holeMat); m.visible = false; m.renderOrder = 2; S.add(m); this.holes.push(m); }

    // 예광탄
    const trGeo = new THREE.BoxGeometry(0.009, 0.009, 1); trGeo.translate(0, 0, -0.5);
    const trMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.62, 0.28).multiplyScalar(6), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    const trMatE = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.3, 0.15).multiplyScalar(4), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    this.tracers = [];
    for (let i = 0; i < 40; i++) { const m = new THREE.Mesh(trGeo, i < 20 ? trMat : trMatE); m.visible = false; m.frustumCulled = false; S.add(m); this.tracers.push({ m, active: false, enemy: i >= 20 }); }

    // 탄피
    const shellGeo = new THREE.CylinderGeometry(0.0048, 0.0048, 0.045, 8); shellGeo.rotateZ(Math.PI / 2);
    const shellMat = new THREE.MeshStandardMaterial({ color: 0xc9a14a, metalness: 1, roughness: 0.28 });
    const shotMat = new THREE.MeshStandardMaterial({ color: 0x8a1414, metalness: 0.2, roughness: 0.5 });
    this.shells = []; this.shellIdx = 0;
    for (let i = 0; i < 30; i++) { const m = new THREE.Mesh(shellGeo, shellMat); m.visible = false; m.castShadow = false; S.add(m); this.shells.push({ m, v: new THREE.Vector3(), w: new THREE.Vector3(), life: 0, bounced: false }); }
    this.shellMat = shellMat; this.shotMat = shotMat;

    // 파편(사망한 적 부품)
    this.debris = [];

    // 섬광 조명 (항상 visible, 세기만 조정 → 셰이더 재컴파일 방지)
    this.muzzleLight = new THREE.PointLight(0xffb066, 0, 14, 2);
    this.fxLight = new THREE.PointLight(0xff8840, 0, 30, 2);
    this.fxLight2 = new THREE.PointLight(0xff5533, 0, 12, 2);
    S.add(this.muzzleLight, this.fxLight, this.fxLight2);
    this.muzzleT = 0; this.fxT = 0; this.fxPeak = 0; this.fx2T = 0;
  }

  setPixelScale(px) { for (const s of this.systems) s.mat.uniforms.uPx.value = px; this.px = px; }

  muzzle(pos, big = false) {
    this.muzzleLight.position.copy(pos);
    this.muzzleLight.intensity = big ? 70 : 40;
    this.muzzleT = 0.05;
    for (let i = 0; i < (big ? 6 : 2); i++) this.smoke.spawn(pos, _v.set(rnd(0.3), 0.3 + Math.random() * 0.3, rnd(0.3)), 0.8 + Math.random() * 0.6, 0.08, big ? 0.9 : 0.5, [0.16, 0.15, 0.14], big ? 0.35 : 0.2);
  }

  enemyMuzzle(pos, dir) {
    this.flashes.spawn(pos, _v.set(0, 0, 0), 0.06, 0.55, 0.75, [3.2, 1.6, 0.8], 1);
    this.fxLight2.position.copy(pos); this.fxLight2.intensity = 25; this.fx2T = 0.06;
    for (let i = 0; i < 2; i++) this.sparks.spawn(pos, _v.copy(dir).multiplyScalar(4 + Math.random() * 4).add(new THREE.Vector3(rnd(1), rnd(1), rnd(1))), 0.08, 0.02, 0.01, [4, 2, 0.8]);
  }

  impact(p, n, surface) {
    const up = n;
    const out = (s) => _v.copy(up).multiplyScalar(s).add(new THREE.Vector3(rnd(s * 0.6), rnd(s * 0.6), rnd(s * 0.6)));
    if (surface === 'metal' || surface === 'glass') {
      const c = surface === 'glass' ? [2.5, 2.8, 3.2] : [5, 2.6, 0.9];
      for (let i = 0; i < 10; i++) this.sparks.spawn(p, out(3 + Math.random() * 5), 0.18 + Math.random() * 0.35, 0.025, 0.008, c);
      this.smoke.spawn(p, out(0.4), 0.7, 0.08, 0.5, [0.2, 0.19, 0.18], 0.3);
    } else if (surface === 'wood') {
      for (let i = 0; i < 8; i++) this.chips.spawn(p, out(2 + Math.random() * 3), 0.6 + Math.random() * 0.4, 0.03, 0.02, [0.22, 0.14, 0.07], 1);
      this.smoke.spawn(p, out(0.5), 0.9, 0.1, 0.6, [0.25, 0.2, 0.15], 0.35);
    } else if (surface === 'ground') {
      for (let i = 0; i < 7; i++) this.chips.spawn(p, out(1.5 + Math.random() * 3).setY(2 + Math.random() * 3), 0.45 + Math.random() * 0.3, 0.025, 0.012, [0.35, 0.38, 0.42], 0.8);
      this.smoke.spawn(p, out(0.3), 0.8, 0.1, 0.7, [0.22, 0.22, 0.23], 0.4);
      this.sparks.spawn(p, out(2), 0.08, 0.02, 0.01, [3, 1.8, 0.7]);
    } else {
      for (let i = 0; i < 8; i++) this.chips.spawn(p, out(2 + Math.random() * 3), 0.6 + Math.random() * 0.4, 0.022, 0.015, [0.3, 0.29, 0.27], 1);
      this.smoke.spawn(p, out(0.6), 1.2, 0.12, 0.9, [0.3, 0.28, 0.26], 0.45);
      this.sparks.spawn(p, out(3), 0.07, 0.02, 0.01, [3, 1.8, 0.7]);
    }
    if (surface !== 'ground' && surface !== 'glass') this.decal(p, n, surface === 'metal' ? 0.07 : 0.1);
    this.G.audio.impact(p, surface);
  }

  robotHit(p, dir, head) {
    for (let i = 0; i < (head ? 16 : 9); i++) this.sparks.spawn(p, _v.set(-dir.x * 3 + rnd(3), Math.random() * 3, -dir.z * 3 + rnd(3)), 0.2 + Math.random() * 0.3, 0.03, 0.008, i % 2 ? [0.6, 2.6, 4] : [4, 3, 1.5]);
    this.smoke.spawn(p, _v.set(rnd(0.3), 0.3, rnd(0.3)), 0.6, 0.06, 0.4, [0.3, 0.6, 0.75], 0.35);
  }

  // 대원(사람) 피격: 방탄복 섬유 파편 + 짙은 붉은 비산 (절제된 표현)
  playerHit(p, dir) {
    for (let i = 0; i < 7; i++) this.chips.spawn(p, _v.set(-dir.x * 2 + rnd(1.5), Math.random() * 2, -dir.z * 2 + rnd(1.5)), 0.4 + Math.random() * 0.3, 0.025, 0.015, i % 2 ? [0.18, 0.02, 0.015] : [0.25, 0.23, 0.18], 1);
    this.smoke.spawn(p, _v.set(rnd(0.2), 0.2, rnd(0.2)), 0.5, 0.06, 0.35, [0.22, 0.05, 0.04], 0.35);
  }

  decal(p, n, size) {
    const m = this.holes[this.holeIdx++ % this.holes.length];
    m.visible = true;
    m.position.copy(p).addScaledVector(n, 0.004);
    m.lookAt(_v.copy(p).add(n));
    m.rotateZ(Math.random() * 6.28);
    m.scale.setScalar(size * (0.8 + Math.random() * 0.5));
  }

  tracer(from, to, enemy = false) {
    const list = this.tracers.filter((t) => t.enemy === enemy);
    const t = list.find((x) => !x.active) || list[0];
    t.active = true; t.from = from.clone(); t.dir = new THREE.Vector3().subVectors(to, from); t.dist = t.dir.length(); t.dir.divideScalar(t.dist || 1);
    // 카메라 바로 앞까지 날아오면 화면을 가리는 기둥처럼 보이므로 카메라 2.5m 앞에서 끊는다
    const cam = this.G.camera.position;
    const along = _v.subVectors(cam, t.from).dot(t.dir);
    if (along > 0 && along < t.dist + 2.5) {
      const closest = t.from.clone().addScaledVector(t.dir, along);
      if (closest.distanceTo(cam) < 1.5) t.dist = Math.max(0, along - 2.5);
    }
    t.travel = enemy ? 0 : 1.2; t.speed = enemy ? 220 : 520; t.len = enemy ? 4 : 3.2;
    t.m.visible = true;
  }

  shell(pos, vel, shotgun = false) {
    const s = this.shells[this.shellIdx++ % this.shells.length];
    s.m.material = shotgun ? this.shotMat : this.shellMat;
    s.m.scale.setScalar(shotgun ? 2.6 : 1);
    s.m.position.copy(pos); s.v.copy(vel); s.w.set(rnd(25), rnd(25), rnd(25)); s.life = 4; s.bounced = false; s.m.visible = true;
  }

  explosion(p, scale = 1) {
    this.flashes.spawn(p, _v.set(0, 0, 0), 0.12, 1.5 * scale, 3.5 * scale, [4, 2.2, 1], 1);
    for (let i = 0; i < 50 * scale; i++) this.sparks.spawn(p, _v.set(rnd(9), Math.random() * 9, rnd(9)), 0.4 + Math.random() * 0.8, 0.05, 0.01, [5, 2.4, 0.7]);
    for (let i = 0; i < 10; i++) this.smoke.spawn(_v.set(p.x + rnd(0.5), p.y + rnd(0.5), p.z + rnd(0.5)), new THREE.Vector3(rnd(1.5), 0.6 + Math.random(), rnd(1.5)), 2 + Math.random() * 1.5, 0.6, 3.2 * scale, [0.09, 0.085, 0.08], 0.75);
    this.fxLight.position.copy(p); this.fxPeak = 600 * scale; this.fxT = 0.35;
    this.G.audio.explosion(p);
  }

  addDebris(obj, vel, ang, radius = 0.1) {
    this.debris.push({ obj, v: vel, w: ang, life: 7 + Math.random() * 2, r: radius, rest: false });
  }

  update(dt) {
    for (const s of this.systems) s.update(dt);
    // 섬광 감쇠
    this.muzzleT -= dt; if (this.muzzleT <= 0) this.muzzleLight.intensity = 0;
    this.fx2T -= dt; if (this.fx2T <= 0) this.fxLight2.intensity = 0;
    if (this.fxT > 0) { this.fxT -= dt; this.fxLight.intensity = this.fxPeak * Math.max(0, this.fxT / 0.35) ** 2; } else this.fxLight.intensity = 0;
    // 예광탄
    for (const t of this.tracers) {
      if (!t.active) continue;
      t.travel += t.speed * dt;
      const head = Math.min(t.travel, t.dist), tail = Math.max(0, head - t.len);
      if (tail >= t.dist - 0.01) { t.active = false; t.m.visible = false; continue; }
      t.m.position.copy(t.from).addScaledVector(t.dir, head);
      t.m.lookAt(_v.copy(t.from).addScaledVector(t.dir, head + 1));
      t.m.scale.set(1, 1, Math.max(0.01, head - tail));
    }
    // 탄피
    const W = this.G.world;
    for (const s of this.shells) {
      if (!s.m.visible) continue;
      s.life -= dt;
      if (s.life <= 0) { s.m.visible = false; continue; }
      s.v.y -= 9.8 * dt;
      s.m.position.addScaledVector(s.v, dt);
      s.m.rotation.x += s.w.x * dt; s.m.rotation.y += s.w.y * dt; s.m.rotation.z += s.w.z * dt;
      const gy = W.groundAt(s.m.position.x, s.m.position.z, 0.01, s.m.position.y + 0.05) + 0.006;
      if (s.m.position.y < gy) {
        s.m.position.y = gy;
        if (Math.abs(s.v.y) > 0.6) { if (!s.bounced) this.G.audio.click(5200 + Math.random() * 1500, 0, 0.06, 0.05, s.m.position); s.bounced = true; }
        s.v.y *= -0.35; s.v.x *= 0.6; s.v.z *= 0.6; s.w.multiplyScalar(0.6);
      }
    }
    // 파편
    for (let i = this.debris.length - 1; i >= 0; i--) {
      const d = this.debris[i];
      d.life -= dt;
      if (d.life <= 0) { d.obj.removeFromParent(); this.debris.splice(i, 1); continue; }
      if (d.life < 1) d.obj.scale.multiplyScalar(Math.max(0.0001, 1 - dt * 3));
      if (d.rest) continue;
      d.v.y -= 9.8 * dt;
      d.obj.position.addScaledVector(d.v, dt);
      d.obj.rotation.x += d.w.x * dt; d.obj.rotation.y += d.w.y * dt; d.obj.rotation.z += d.w.z * dt;
      const p = d.obj.position;
      const gy = W.groundAt(p.x, p.z, 0.05, p.y + 0.2) + d.r;
      if (p.y < gy) {
        p.y = gy; d.v.y *= -0.3; d.v.x *= 0.55; d.v.z *= 0.55; d.w.multiplyScalar(0.5);
        if (d.v.lengthSq() < 0.05) d.rest = true;
      }
      // 벽 관통 방지
      W.collideCircle(p, d.r, p.y - d.r, p.y + d.r);
    }
  }
}
