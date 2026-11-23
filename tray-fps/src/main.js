// TRAY BLACK RAIN — 부트스트랩, 게임 루프, 웨이브, 픽업, HUD, 메뉴
import * as THREE from 'three';
import { PRESETS, settings, loadSettings, saveSettings, loadBest, saveBest, IS_TOUCH } from './config.js';
import { AudioEngine } from './audio.js';
import { Input } from './input.js';
import { World } from './world.js';
import { Effects } from './effects.js';
import { Player } from './player.js';
import { Weapons } from './weapons.js';
import { Enemies } from './enemies.js';
import { Post } from './post.js';

const $ = (id) => document.getElementById(id);
const G = window.__G = { settings, state: 'loading', time: 0, wave: 0, score: 0 };

// ───────────── HUD ─────────────
class Hud {
  constructor(G) {
    this.G = G; this.cache = {};
    const strip = $('compass');
    const labels = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' };
    let html = '';
    for (let k = -2; k < 3; k++) for (let d = 0; d < 360; d += 15) html += `<span class="${labels[d] ? 'c' : ''}">${labels[d] || d}</span>`;
    strip.innerHTML = html;
    this.strip = strip;
  }
  set(id, val, fn) { if (this.cache[id] === val) return; this.cache[id] = val; fn(val); }
  update() {
    const G = this.G, P = G.player, W = G.weapons;
    const hp = Math.ceil(P.hp);
    this.set('hp', hp, (v) => { $('hp-num').textContent = v; $('hp-fill').style.transform = `scaleX(${v / 100})`; $('hp-fill').classList.toggle('low', v <= 35); });
    const s = W.ammo;
    this.set('ammo', `${s.mag}/${s.reserve}/${W.cur}`, () => {
      $('ammo-main').innerHTML = `${s.mag}<small> / ${s.reserve}</small>`;
      $('ammo-main').classList.toggle('empty', s.mag === 0);
      $('wpn-name').textContent = `${W.def.name} · ${W.def.cal}`;
    });
    this.set('wave', G.wave, (v) => { $('wave-n').textContent = String(v).padStart(2, '0'); });
    const left = G.waves.remaining();
    this.set('left', left, (v) => { $('wave-left').textContent = v; });
    this.set('score', G.score, (v) => { $('score').textContent = v.toLocaleString('ko-KR'); });
    // 나침반: yaw 0 = 북(-z)
    const deg = ((-P.yaw * 180 / Math.PI) % 360 + 360) % 360;
    const w = this.strip.parentElement.clientWidth;
    this.strip.style.transform = `translateX(${(w / 2 - (24 + deg / 15) * 30 - 15).toFixed(1)}px)`;
    // 조준선 퍼짐 (화면 픽셀로 환산)
    const spread = W.currentSpread();
    const px = Math.tan(spread) * (window.innerHeight / 2) / Math.tan(THREE.MathUtils.degToRad(G.camera.fov / 2));
    const gap = Math.max(5, Math.min(60, px)) | 0;
    this.set('gap', gap, (g) => {
      const xh = $('xh');
      xh.querySelector('.l').style.left = `${-g - 9}px`; xh.querySelector('.r').style.left = `${g}px`;
      xh.querySelector('.u').style.top = `${-g - 9}px`; xh.querySelector('.d').style.top = `${g}px`;
    });
    this.set('xh', (W.adsT > 0.6 || P.sprinting) ? 0 : 1, (o) => { $('xh').style.opacity = o; });
    const rl = W.reloading;
    this.set('rl', rl, (v) => $('reload').classList.toggle('on', v));
    if (rl) $('reload-bar').style.transform = `scaleX(${Math.min(1, W.reloadT / W.def.reload)})`;
    this.set('ads', G.input.ads, (v) => $('b-ads') && $('b-ads').classList.toggle('on', v));
    this.set('crouch', G.input.crouch, (v) => $('b-crouch') && $('b-crouch').classList.toggle('on', v));
  }
  hitmarker(kill) { const h = $('hit'); h.classList.remove('show', 'kill'); void h.offsetWidth; h.classList.add('show'); if (kill) h.classList.add('kill'); }
  damage(from, amount) {
    const P = this.G.player;
    const dx = from.x - P.pos.x, dz = from.z - P.pos.z;
    const ang = Math.atan2(dx, -dz) + P.yaw; // 화면 기준 각도(0 = 정면)
    const el = document.createElement('div');
    el.className = 'dmg-arc';
    el.style.transform = `rotate(${ang}rad)`;
    $('dmg').appendChild(el);
    setTimeout(() => el.remove(), 1300);
    this.G.dmgFlash = Math.min(1, (this.G.dmgFlash || 0) + amount / 25);
  }
  feed(text, pts) {
    const f = $('feed'); const d = document.createElement('div');
    d.innerHTML = `${text}<b>+${pts}</b>`; f.prepend(d);
    while (f.children.length > 5) f.lastChild.remove();
    setTimeout(() => d.remove(), 3300);
  }
  banner(h, p) { const b = $('banner'); $('banner-h').textContent = h; $('banner-p').textContent = p || ''; b.classList.remove('show'); void b.offsetWidth; b.classList.add('show'); }
}

// ───────────── 픽업 (탄약/구급상자) ─────────────
class Pickups {
  constructor(G) {
    this.G = G; this.list = [];
    this.ammoGeo = new THREE.BoxGeometry(0.42, 0.24, 0.28);
    this.medGeo = new THREE.BoxGeometry(0.36, 0.22, 0.3);
    this.ammoMat = new THREE.MeshStandardMaterial({ color: 0x3b4a2a, roughness: 0.6, metalness: 0.2, emissive: 0x6dff9a, emissiveIntensity: 0.25 });
    this.medMat = new THREE.MeshStandardMaterial({ color: 0xd9d6cf, roughness: 0.5, metalness: 0, emissive: 0xff3a2a, emissiveIntensity: 0.25 });
    this.ringGeo = new THREE.RingGeometry(0.42, 0.5, 32); this.ringGeo.rotateX(-Math.PI / 2);
  }
  clear() { for (const p of this.list) p.g.removeFromParent(); this.list = []; }
  maybeDrop(pos) {
    const r = Math.random();
    const type = r < 0.42 ? 'ammo' : r < 0.62 ? 'med' : null;
    if (!type) return;
    const g = new THREE.Group();
    const m = new THREE.Mesh(type === 'ammo' ? this.ammoGeo : this.medGeo, type === 'ammo' ? this.ammoMat : this.medMat);
    m.castShadow = true; g.add(m);
    const ring = new THREE.Mesh(this.ringGeo, new THREE.MeshBasicMaterial({ color: type === 'ammo' ? new THREE.Color(0.3, 2.5, 1) : new THREE.Color(2.5, 0.4, 0.3), transparent: true, opacity: 0.7, depthWrite: false }));
    ring.position.y = -0.3; g.add(ring);
    pos.y = this.G.world.groundAt(pos.x, pos.z, 0.2, (pos.y || 0) + 3) + 0.35;
    g.position.copy(pos);
    this.G.scene.add(g);
    this.list.push({ g, m, type, life: 35, t: Math.random() * 6 });
  }
  update(dt) {
    const P = this.G.player;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      p.life -= dt; p.t += dt;
      p.m.rotation.y += dt * 1.4; p.m.position.y = Math.sin(p.t * 2.2) * 0.06;
      const dx = P.pos.x - p.g.position.x, dz = P.pos.z - p.g.position.z;
      const near = dx * dx + dz * dz < 1.6 && Math.abs(P.pos.y + 0.4 - p.g.position.y) < 1.6;
      if (near) {
        if (p.type === 'ammo') { this.G.weapons.addAmmo(0.35); this.G.hud.feed('탄약 보급', 0); }
        else { P.hp = Math.min(P.maxHp, P.hp + 50); this.G.hud.feed('구급상자 +50 HP', 0); }
        this.G.audio.pickup();
      }
      if (near || p.life <= 0) { p.g.removeFromParent(); this.list.splice(i, 1); }
    }
  }
}

// ───────────── 웨이브 ─────────────
class Waves {
  constructor(G) { this.G = G; this.queue = []; this.spawnT = 0; this.inter = -1; }
  reset() { this.queue = []; this.spawnT = 0; this.inter = 2.5; this.G.wave = 0; }
  remaining() { return this.queue.length + this.G.enemies.alive; }
  start(n) {
    const G = this.G; G.wave = n;
    const q = [];
    const wardens = 2 + n, drones = n >= 2 ? Math.floor(n / 2) + (n >= 6 ? 1 : 0) : 0, heavies = n >= 4 ? Math.floor((n - 2) / 2) : 0;
    for (let i = 0; i < wardens; i++) q.push('warden');
    for (let i = 0; i < drones; i++) q.splice(Math.floor(Math.random() * (q.length + 1)), 0, 'drone');
    for (let i = 0; i < heavies; i++) q.splice(Math.floor(q.length * 0.4 + Math.random() * q.length * 0.6), 0, 'heavy');
    this.queue = q; this.spawnT = 0.5;
    G.hud.banner(`WAVE ${String(n).padStart(2, '0')}`, `적 ${q.length}기 접근 중`);
  }
  update(dt) {
    const G = this.G;
    if (this.inter >= 0) { this.inter -= dt; if (this.inter < 0) this.start(G.wave + 1); return; }
    const maxAlive = Math.min(8, 4 + Math.floor(G.wave / 2));
    this.spawnT -= dt;
    if (this.queue.length && G.enemies.alive < maxAlive && this.spawnT <= 0) {
      G.enemies.spawn(this.queue.shift());
      this.spawnT = 1.1 + Math.random() * 1.4;
    }
    if (!this.queue.length && G.enemies.alive === 0) {
      const bonus = 400 * G.wave;
      G.addScore(bonus);
      G.hud.banner('웨이브 클리어', `보너스 +${bonus} · 체력·탄약 보급`);
      G.player.hp = G.player.maxHp;
      G.weapons.addAmmo(0.6);
      G.enemies.list = [];
      this.inter = 7;
    }
  }
}

// ───────────── 부트스트랩 ─────────────
function progress(p, label) { $('load-bar').style.width = `${Math.round(p * 100)}%`; if (label) $('load-label').textContent = label; }
function showError(e) {
  $('loading').hidden = false;
  $('load-err').textContent = `오류가 발생했습니다: ${e && (e.message || e)}\n페이지를 새로 고침해 주세요. WebGL2 를 지원하는 최신 Chrome/Safari 가 필요합니다.`;
}
window.addEventListener('error', (e) => { if (G.state === 'loading') showError(e.error || e.message); });
window.addEventListener('unhandledrejection', (e) => { if (G.state === 'loading') showError(e.reason); });

async function boot() {
  loadSettings();
  G.preset = PRESETS[settings.quality];
  progress(0.02, 'WebGL 렌더러 생성');
  const renderer = G.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', stencil: false });
  if (!renderer.capabilities.isWebGL2) throw new Error('WebGL2 미지원 기기');
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.shadowMap.enabled = G.preset.shadows;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  $('stage').appendChild(renderer.domElement);
  renderer.domElement.addEventListener('webglcontextlost', (e) => { e.preventDefault(); G.pause(); showError('그래픽 컨텍스트가 손실되었습니다(메모리 부족).'); });

  G.scene = new THREE.Scene();
  G.camera = new THREE.PerspectiveCamera(settings.fov, innerWidth / innerHeight, 0.05, 1200);
  G.camera.rotation.order = 'YXZ';
  G.audio = new AudioEngine();
  G.audio.volume = settings.volume;
  G.input = new Input(G);
  G.world = new World(G);
  await G.world.build(progress);
  progress(0.93, '무기와 적 모델 준비');
  await new Promise((r) => setTimeout(r, 0));
  G.effects = new Effects(G);
  G.player = new Player(G);
  G.weapons = new Weapons(G);
  G.enemies = new Enemies(G);
  G.pickups = new Pickups(G);
  G.hud = new Hud(G);
  G.waves = new Waves(G);
  G.post = new Post(G);

  // 셰이더 미리 컴파일 (첫 교전 때 끊김 방지)
  progress(0.96, '셰이더 컴파일');
  await new Promise((r) => setTimeout(r, 0));
  const warm = [G.enemies.spawn('warden'), G.enemies.spawn('drone'), G.enemies.spawn('heavy')];
  G.pickups.maybeDrop(new THREE.Vector3(0, 0, 0));
  renderer.compile(G.scene, G.camera);
  renderer.compile(G.weapons.vmScene, G.weapons.vmCam);
  G.enemies.clear(); G.pickups.clear();
  void warm;

  applyQuality(true);
  onResize();
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', () => setTimeout(onResize, 200));
  document.addEventListener('visibilitychange', () => { if (document.hidden && G.state === 'playing') G.pause(); });

  setupMenus();
  G.player.spawn(G.world.playerSpawn, 0);
  progress(1, '준비 완료');
  G.state = 'menu';
  $('loading').hidden = true;
  showMenu();
  last = performance.now();
  requestAnimationFrame(frame);
}

// ───────────── 품질/해상도 ─────────────
let dynScale = 1, frameAvg = 16, dynTimer = 0;
function pixelRatio() { return Math.max(0.5, Math.min(window.devicePixelRatio || 1, G.preset.maxPR) * (settings.dynRes ? dynScale : 1)); }
function applyQuality(first) {
  G.preset = PRESETS[settings.quality];
  G.world.applyQuality(G.preset);
  G.post.apply(G.preset);
  dynScale = 1;
  if (!first) onResize();
  $('menu-quality').textContent = G.preset.name;
}
function onResize() {
  const w = innerWidth, h = innerHeight;
  G.renderer.setPixelRatio(pixelRatio());
  G.renderer.setSize(w, h, false);
  G.camera.aspect = w / h; G.camera.updateProjectionMatrix();
  G.weapons.vmCam.aspect = w / h; G.weapons.vmCam.fov = w < h ? 68 : 54; G.weapons.vmCam.updateProjectionMatrix();
  G.post.resize();
  const pxScale = h * G.renderer.getPixelRatio() / (2 * Math.tan(THREE.MathUtils.degToRad(G.camera.fov / 2)));
  G.effects.setPixelScale(pxScale);
  G.world.splash.material.uniforms.uPx.value = pxScale;
  checkOrientation();
}

// ───────────── 상태 전환 ─────────────
function show(id, on) { $(id).hidden = !on; }
function showMenu() {
  const best = loadBest();
  $('best-score').textContent = best.score.toLocaleString('ko-KR');
  $('best-wave').textContent = best.wave;
  show('menu', true); show('hud', false); show('controls', false); show('pause', false); show('gameover', false);
  $('keys-touch').hidden = !IS_TOUCH; $('keys-desktop').hidden = IS_TOUCH;
  G.input.enabled = false;
  G.post.vmPass.enabled = false;
}

function requestImmersive() {
  if (!IS_TOUCH) return;
  try {
    const el = document.documentElement;
    const p = el.requestFullscreen ? el.requestFullscreen({ navigationUI: 'hide' }) : null;
    if (p && p.then) p.then(() => { try { screen.orientation.lock('landscape').catch(() => {}); } catch (e) { /* 미지원 */ } }).catch(() => {});
  } catch (e) { /* 전체 화면 불가 환경 */ }
}

function startGame() {
  G.audio.init();
  requestImmersive();
  G.enemies.clear(); G.pickups.clear();
  G.weapons.reset();
  G.player.spawn(G.world.playerSpawn, 0);
  G.enemies.kills = 0; G.enemies.headshots = 0;
  G.score = 0;
  G.waves.reset();
  G.input.reset(); G.input.ads = false; G.input.crouch = false;
  G.input.enabled = true;
  show('menu', false); show('gameover', false); show('pause', false); show('hud', true); show('controls', IS_TOUCH);
  G.post.vmPass.enabled = true;
  G.state = 'playing';
  if (!IS_TOUCH) lockPointer();
}

function lockPointer() {
  try { const r = $('touch-layer').requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch (e) { /* 미지원 */ }
}

G.pause = () => {
  if (G.state !== 'playing') return;
  G.state = 'paused';
  G.input.reset(); G.input.enabled = false; G.input.exitLock();
  show('pause', true);
};
G.resume = () => {
  if (G.state !== 'paused') return;
  show('pause', false); show('settings', false);
  G.state = 'playing'; G.input.enabled = true;
  if (!IS_TOUCH) lockPointer();
};
G.addScore = (n) => { G.score += n; };
G.gameOver = () => {
  G.state = 'gameover';
  G.input.reset(); G.input.enabled = false; G.input.exitLock();
  const best = loadBest();
  const newBest = G.score > best.score;
  if (newBest || G.wave > best.wave) saveBest({ score: Math.max(best.score, G.score), wave: Math.max(best.wave, G.wave) });
  const st = G.weapons.stats;
  $('go-title').textContent = newBest ? '신기록 · KIA' : 'KIA · 전사';
  $('go-score').textContent = G.score.toLocaleString('ko-KR');
  $('go-wave').textContent = G.wave;
  $('go-kills').textContent = G.enemies.kills;
  $('go-heads').textContent = G.enemies.headshots;
  $('go-acc').textContent = st.shots ? `${Math.round(st.hits / st.shots * 100)}%` : '0%';
  $('go-best').textContent = Math.max(best.score, G.score).toLocaleString('ko-KR');
  setTimeout(() => { if (G.state === 'gameover') { show('gameover', true); show('controls', false); } }, 1400);
};

function checkOrientation() {
  const portrait = IS_TOUCH && innerHeight > innerWidth * 1.05;
  show('rotate', portrait && !G.rotateSkip && G.state !== 'loading');
}

// ───────────── 메뉴/설정 바인딩 ─────────────
function setupMenus() {
  const tap = (id, fn) => $(id).addEventListener('click', (e) => { e.preventDefault(); fn(); });
  tap('btn-start', startGame);
  tap('btn-retry', startGame);
  tap('btn-menu', () => { G.enemies.clear(); G.pickups.clear(); G.state = 'menu'; showMenu(); });
  tap('btn-quit', () => { G.enemies.clear(); G.pickups.clear(); G.state = 'menu'; showMenu(); });
  tap('btn-resume', () => G.resume());
  let settingsFrom = null;
  const openSettings = (from) => { settingsFrom = from; show(from, false); show('settings', true); syncSettings(); };
  tap('btn-settings', () => openSettings('menu'));
  tap('btn-settings2', () => openSettings('pause'));
  tap('btn-settings-close', () => { saveSettings(); show('settings', false); show(settingsFrom || 'menu', true); });
  tap('btn-rotate-skip', () => { G.rotateSkip = true; checkOrientation(); });

  const seg = $('seg-quality');
  for (const k of Object.keys(PRESETS)) {
    const b = document.createElement('button'); b.textContent = PRESETS[k].name; b.dataset.q = k; b.id = `q-${k}`;
    b.addEventListener('click', () => { settings.quality = k; applyQuality(false); syncSettings(); });
    seg.appendChild(b);
  }
  const range = (id, key, fmt, after) => {
    const el = $(id);
    el.addEventListener('input', () => { settings[key] = parseFloat(el.value); $(`${id}-v`).textContent = fmt(settings[key]); if (after) after(); });
  };
  range('s-sens', 'sens', (v) => v.toFixed(2));
  range('s-fov', 'fov', (v) => `${v}°`, () => { G.player.fovCur = settings.fov; });
  range('s-vol', 'volume', (v) => `${Math.round(v * 100)}%`, () => G.audio.setVolume(settings.volume));
  const tog = (id, key, after) => $(id).addEventListener('click', () => { settings[key] = !settings[key]; syncSettings(); if (after) after(); });
  tog('t-aim', 'aimAssist'); tog('t-hap', 'haptics'); tog('t-inv', 'invertY');
  tog('t-dyn', 'dynRes', () => { dynScale = 1; onResize(); });
  tog('t-fps', 'showFps', () => { $('fps').hidden = !settings.showFps; });
  $('fps').hidden = !settings.showFps;
}

function syncSettings() {
  document.querySelectorAll('#seg-quality button').forEach((b) => b.classList.toggle('on', b.dataset.q === settings.quality));
  $('s-sens').value = settings.sens; $('s-sens-v').textContent = settings.sens.toFixed(2);
  $('s-fov').value = settings.fov; $('s-fov-v').textContent = `${settings.fov}°`;
  $('s-vol').value = settings.volume; $('s-vol-v').textContent = `${Math.round(settings.volume * 100)}%`;
  for (const [id, k] of [['t-aim', 'aimAssist'], ['t-dyn', 'dynRes'], ['t-hap', 'haptics'], ['t-inv', 'invertY'], ['t-fps', 'showFps']]) $(id).classList.toggle('on', !!settings[k]);
}

// ───────────── 메인 루프 ─────────────
let last = 0, fpsAcc = 0, fpsN = 0, fpsT = 0, hbT = 0;
const menuCam = { t: 0 };

function frame(now) {
  requestAnimationFrame(frame);
  const raw = (now - last) / 1000; last = now;
  const dt = Math.min(raw, 1 / 20);
  G.time += dt;

  if (G.state === 'playing' || (G.state === 'gameover')) {
    if (G.state === 'playing') {
      G.player.update(dt);
      G.weapons.update(dt);
      G.waves.update(dt);
    } else {
      // 사망 연출: 천천히 쓰러지는 카메라
      const c = G.camera; c.position.y = Math.max(G.player.pos.y + 0.3, c.position.y - dt * 1.4); c.rotation.z = Math.min(0.5, c.rotation.z + dt * 0.4);
    }
    G.enemies.update(dt);
    G.pickups.update(dt);
    G.hud.update();
    // 저체력 심장 박동
    if (G.player.hp < 30 && G.player.alive) { hbT -= dt; if (hbT <= 0) { hbT = 0.9; G.audio.heartbeat(); } }
  } else if (G.state === 'menu') {
    menuCam.t += dt;
    const t = menuCam.t * 0.05;
    G.camera.position.set(-6 + Math.sin(t) * 3, 2.1 + Math.sin(t * 1.7) * 0.2, 31 + Math.cos(t) * 1.5);
    G.camera.rotation.set(0.02 + Math.sin(t * 0.8) * 0.02, 0.38 + Math.sin(t * 1.1) * 0.12, 0);
    if (Math.abs(G.camera.fov - 62) > 0.1) { G.camera.fov = 62; G.camera.updateProjectionMatrix(); }
  }
  if (G.state === 'playing' && Math.abs(G.camera.fov - G.player.fovCur) > 0.01) { G.camera.fov = G.player.fovCur; G.camera.updateProjectionMatrix(); }

  G.effects.update(G.state === 'paused' ? 0 : dt);
  G.world.update(G.state === 'paused' ? 0 : dt, G.camera, G.state === 'menu' ? G.camera.position : G.player.pos);
  G.audio.updateListener(G.camera);

  // 후처리 파라미터
  const gu = G.post.grade.uniforms;
  G.dmgFlash = Math.max(0, (G.dmgFlash || 0) - dt * 1.8);
  gu.uDamage.value = G.state === 'menu' ? 0 : G.dmgFlash;
  gu.uLowHp.value = G.state === 'menu' ? 0 : Math.max(0, (40 - G.player.hp) / 40);
  G.post.render(dt);

  // 성능 측정 + 동적 해상도
  frameAvg += (raw * 1000 - frameAvg) * 0.05;
  fpsAcc += raw; fpsN++; fpsT += raw;
  if (fpsT > 0.5) { if (settings.showFps) $('fps').textContent = `${Math.round(fpsN / fpsAcc)} FPS · ${Math.round(G.renderer.getPixelRatio() * 100) / 100}x`; fpsAcc = 0; fpsN = 0; fpsT = 0; }
  dynTimer += raw;
  if (settings.dynRes && dynTimer > 1.5 && G.state === 'playing') {
    dynTimer = 0;
    let ns = dynScale;
    if (frameAvg > 21) ns = Math.max(0.55, dynScale - 0.1);
    else if (frameAvg < 15.5) ns = Math.min(1, dynScale + 0.05);
    if (ns !== dynScale) { dynScale = ns; onResize(); }
  }
}

boot().catch((e) => { console.error(e); showError(e); });
