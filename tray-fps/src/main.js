// TRAY BLACK RAIN — 부트스트랩, 게임 루프, 웨이브, 픽업, HUD, 메뉴, 멀티플레이 흐름
import * as THREE from 'three';
import { PRESETS, settings, loadSettings, saveSettings, loadBest, saveBest, IS_TOUCH } from './config.js';
import { AudioEngine } from './audio.js';
import { Input } from './input.js';
import { Assets } from './assets.js';
import { World } from './world.js';
import { Effects } from './effects.js';
import { Player } from './player.js';
import { Weapons } from './weapons.js';
import { Enemies } from './enemies.js';
import { Combat } from './combat.js';
import { Net } from './net.js';
import { Post } from './post.js';

const $ = (id) => document.getElementById(id);
const G = window.__G = { settings, state: 'loading', time: 0, wave: 0, score: 0 };

// 공용 헬퍼: 단독/방장이면 게임 판정 권한을 가진다
Object.defineProperty(G, 'authority', { get: () => !G.net || !G.net.isClient });
G.targets = () => [G.player, ...(G.net && G.net.active ? [...G.net.mates.values()].filter((m) => m.avatar) : [])];
G.targetById = (id) => {
  if (id === 'local' || (G.net && id === G.net.myId)) return G.player;
  return G.net && G.net.mates.get(id) || null;
};
G.nameOf = (id) => {
  if (id === 'local' || (G.net && id === G.net.myId)) return G.net && G.net.active ? G.net.name : '나';
  if (id === 'world') return '폭발';
  const m = G.net && G.net.mates.get(id); return m ? m.name : '대원';
};
G.kills = new Map();
G.creditKill = (by, head) => { const k = G.kills.get(by) || { kills: 0, heads: 0 }; k.kills++; if (head) k.heads++; G.kills.set(by, k); };

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
    this.teamT = 0;
  }
  set(id, val, fn) { if (this.cache[id] === val) return; this.cache[id] = val; fn(val); }
  update(dt) {
    const G = this.G, P = G.player, W = G.weapons;
    const hp = Math.ceil(P.hp);
    this.set('hp', hp, (v) => { $('hp-num').textContent = v; $('hp-fill').style.transform = `scaleX(${v / 100})`; $('hp-fill').classList.toggle('low', v <= 35); });
    const s = W.ammo;
    this.set('ammo', `${s.mag}/${s.reserve}/${W.cur}`, () => {
      $('ammo-main').innerHTML = `${s.mag}<small> / ${s.reserve}</small>`;
      $('ammo-main').classList.toggle('empty', s.mag === 0);
      $('wpn-name').textContent = `${W.def.name} · ${W.def.cal}`;
    });
    this.set('gren', G.combat.playerGrenades, (v) => { $('gren-n').textContent = v; $('b-gren') && $('b-gren').classList.toggle('dim', v <= 0); });
    this.set('wave', G.wave, (v) => { $('wave-n').textContent = String(v).padStart(2, '0'); });
    const left = G.net.isClient ? G.net.hud.left : G.waves.remaining();
    this.set('left', left, (v) => { $('wave-left').textContent = v; });
    this.set('score', G.score, (v) => { $('score').textContent = v.toLocaleString('ko-KR'); });
    const deg = ((-P.yaw * 180 / Math.PI) % 360 + 360) % 360;
    const w = this.strip.parentElement.clientWidth;
    this.strip.style.transform = `translateX(${(w / 2 - (24 + deg / 15) * 30 - 15).toFixed(1)}px)`;
    const spread = W.currentSpread();
    const px = Math.tan(spread) * (window.innerHeight / 2) / Math.tan(THREE.MathUtils.degToRad(G.camera.fov / 2));
    const gap = Math.max(5, Math.min(60, px)) | 0;
    this.set('gap', gap, (g) => {
      const xh = $('xh');
      xh.querySelector('.l').style.left = `${-g - 9}px`; xh.querySelector('.r').style.left = `${g}px`;
      xh.querySelector('.u').style.top = `${-g - 9}px`; xh.querySelector('.d').style.top = `${g}px`;
    });
    this.set('xh', (W.adsT > 0.6 || P.sprinting || !P.alive) ? 0 : 1, (o) => { $('xh').style.opacity = o; });
    const rl = W.reloading;
    this.set('rl', rl, (v) => $('reload').classList.toggle('on', v));
    if (rl) $('reload-bar').style.transform = `scaleX(${Math.min(1, W.reloadT / W.def.reload)})`;
    this.set('ads', G.input.ads, (v) => $('b-ads') && $('b-ads').classList.toggle('on', v));
    this.set('crouch', G.input.crouch, (v) => $('b-crouch') && $('b-crouch').classList.toggle('on', v));
    this.set('dead', !P.alive && G.net.active && G.state === 'playing', (v) => { $('down').hidden = !v; });
    // 아군 상태 (멀티)
    this.teamT -= dt;
    if (this.teamT <= 0) {
      this.teamT = 0.25;
      const html = G.net.active ? [...G.net.mates.values()].map((m) => `<div class="mate${m.alive ? '' : ' down'}"><span>${esc(m.name)}</span><i><b style="transform:scaleX(${Math.max(0, m.hp) / 100})"></b></i></div>`).join('') : '';
      this.set('team', html, (v) => { $('team').innerHTML = v; });
    }
  }
  hitmarker(kill) { const h = $('hit'); h.classList.remove('show', 'kill'); void h.offsetWidth; h.classList.add('show'); if (kill) h.classList.add('kill'); }
  damage(from, amount) {
    const P = this.G.player;
    const dx = from.x - P.pos.x, dz = from.z - P.pos.z;
    const ang = Math.atan2(dx, -dz) + P.yaw;
    const el = document.createElement('div');
    el.className = 'dmg-arc';
    el.style.transform = `rotate(${ang}rad)`;
    $('dmg').appendChild(el);
    setTimeout(() => el.remove(), 1300);
    this.G.dmgFlash = Math.min(1, (this.G.dmgFlash || 0) + amount / 25);
  }
  grenadeWarn(pos) {
    const el = $('gwarn');
    if (!pos || this.G.state !== 'playing') { if (!el.hidden) el.hidden = true; return; }
    const P = this.G.player;
    const ang = Math.atan2(pos.x - P.pos.x, -(pos.z - P.pos.z)) + P.yaw;
    el.hidden = false;
    el.style.transform = `rotate(${ang}rad) translateY(-92px) rotate(${-ang}rad)`;
  }
  feed(text, pts) {
    const f = $('feed'); const d = document.createElement('div');
    d.innerHTML = `${esc(text)}${pts ? `<b>+${pts}</b>` : ''}`; f.prepend(d);
    while (f.children.length > 5) f.lastChild.remove();
    setTimeout(() => d.remove(), 3300);
  }
  banner(h, p) { const b = $('banner'); $('banner-h').textContent = h; $('banner-p').textContent = p || ''; b.classList.remove('show'); void b.offsetWidth; b.classList.add('show'); }
}
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ───────────── 픽업 (실사 탄약통/구급상자 모델) ─────────────
class Pickups {
  constructor(G) {
    this.G = G; this.list = []; this.nextId = 1;
    this.ringGeo = new THREE.RingGeometry(0.42, 0.5, 32); this.ringGeo.rotateX(-Math.PI / 2);
  }
  _model(type) {
    const name = type === 'ammo' ? 'ammo_box' : 'medical_box';
    const M = this.G.assets.models[name];
    const g = new THREE.Group();
    if (M) {
      const s = type === 'ammo' ? 2.2 : 1.1;
      for (const p of M.parts) { const m = new THREE.Mesh(p.geometry, p.material); m.applyMatrix4(p.matrix); m.castShadow = true; g.add(m); }
      g.scale.setScalar(s);
      g.position.y = -0.3;
    } else {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.24, 0.28), new THREE.MeshStandardMaterial({ color: type === 'ammo' ? 0x3b4a2a : 0xd9d6cf, roughness: 0.6 }));
      m.castShadow = true; g.add(m);
    }
    return g;
  }
  clear() { for (const p of this.list) p.g.removeFromParent(); this.list = []; }
  maybeDrop(pos) {
    const r = Math.random();
    const type = r < 0.42 ? 'ammo' : r < 0.62 ? 'med' : null;
    if (!type) return;
    pos.y = this.G.world.groundAt(pos.x, pos.z, 0.2, (pos.y || 0) + 3) + 0.35;
    const id = this.nextId++;
    this._add(id, type, pos);
    if (this.G.net.isHost) this.G.net.broadcast({ t: 'pk+', id, k: type, p: this.G.net.v3(pos) });
  }
  _add(id, type, pos) {
    const g = new THREE.Group();
    const m = this._model(type); g.add(m);
    const ring = new THREE.Mesh(this.ringGeo, new THREE.MeshBasicMaterial({ color: type === 'ammo' ? new THREE.Color(0.3, 2.5, 1) : new THREE.Color(2.5, 0.4, 0.3), transparent: true, opacity: 0.7, depthWrite: false }));
    ring.position.y = -0.33; g.add(ring);
    g.position.copy(pos);
    this.G.scene.add(g);
    this.list.push({ id, g, m, type, life: 35, t: Math.random() * 6 });
  }
  netAdd(msg) { this._add(msg.id, msg.k, this.G.net.V(msg.p)); }
  netRemove(id) { const i = this.list.findIndex((p) => p.id === id); if (i >= 0) { this.list[i].g.removeFromParent(); this.list.splice(i, 1); } }
  update(dt) {
    const G = this.G;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      p.life -= dt; p.t += dt;
      p.m.rotation.y += dt * 1.2; p.m.position.y = -0.3 + Math.sin(p.t * 2.2) * 0.05;
      if (!G.authority) continue; // 참가자는 방장의 판정을 따른다
      let taker = null;
      for (const t of G.targets()) {
        if (!t.alive) continue;
        const dx = t.pos.x - p.g.position.x, dz = t.pos.z - p.g.position.z;
        if (dx * dx + dz * dz < 1.6 && Math.abs(t.pos.y + 0.4 - p.g.position.y) < 1.6) { taker = t; break; }
      }
      if (taker) {
        if (taker.isLocal) G.grant(p.type); else G.net.sendTo(taker.id, { t: 'grant', k: p.type });
      }
      if (taker || p.life <= 0) {
        p.g.removeFromParent(); this.list.splice(i, 1);
        if (G.net.isHost) G.net.broadcast({ t: 'pk-', id: p.id });
      }
    }
  }
}

// 보급 적용 (로컬 플레이어)
G.grant = (k) => {
  const P = G.player, W = G.weapons, C = G.combat;
  if (k === 'ammo') { W.addAmmo(0.35); if (Math.random() < 0.5 && C.playerGrenades < C.maxGrenades) C.playerGrenades++; G.hud.feed('탄약 보급', 0); G.audio.pickup(); }
  else if (k === 'med') { P.hp = Math.min(P.maxHp, P.hp + 50); G.hud.feed('구급상자 +50 HP', 0); G.audio.pickup(); }
  else if (k === 'wave') { if (P.alive) P.hp = P.maxHp; W.addAmmo(0.6); C.playerGrenades = Math.min(C.maxGrenades, C.playerGrenades + 1); }
};

// ───────────── 웨이브 (방장/싱글) ─────────────
class Waves {
  constructor(G) { this.G = G; this.queue = []; this.spawnT = 0; this.inter = -1; }
  reset() { this.queue = []; this.spawnT = 0; this.inter = 2.5; this.G.wave = 0; }
  remaining() { return this.queue.length + this.G.enemies.alive; }
  start(n) {
    const G = this.G; G.wave = n;
    const players = G.targets().length;
    const q = [];
    // 인원이 늘면 적 수도 늘린다 (1인 기준 × 1 + 0.6×추가 인원)
    const mul = 1 + 0.6 * (players - 1);
    const wardens = Math.round((2 + n) * mul), drones = n >= 2 ? Math.round((Math.floor(n / 2) + (n >= 6 ? 1 : 0)) * mul) : 0, heavies = n >= 4 ? Math.round(Math.floor((n - 2) / 2) * mul) : 0;
    for (let i = 0; i < wardens; i++) q.push('warden');
    for (let i = 0; i < drones; i++) q.splice(Math.floor(Math.random() * (q.length + 1)), 0, 'drone');
    for (let i = 0; i < heavies; i++) q.splice(Math.floor(q.length * 0.4 + Math.random() * q.length * 0.6), 0, 'heavy');
    this.queue = q; this.spawnT = 0.5;
    const h = `WAVE ${String(n).padStart(2, '0')}`, p = `적 ${q.length}기 접근 중`;
    G.hud.banner(h, p);
    if (G.net.isHost) G.net.broadcast({ t: 'banner', h, p });
  }
  update(dt) {
    const G = this.G;
    if (this.inter >= 0) { this.inter -= dt; if (this.inter < 0) this.start(G.wave + 1); return; }
    const maxAlive = Math.min(G.net.active ? 11 : 8, 4 + Math.floor(G.wave / 2) + (G.targets().length - 1) * 2);
    this.spawnT -= dt;
    if (this.queue.length && G.enemies.alive < maxAlive && this.spawnT <= 0) {
      G.enemies.spawn(this.queue.shift());
      this.spawnT = 1.1 + Math.random() * 1.4;
    }
    if (!this.queue.length && G.enemies.alive === 0) {
      const bonus = 400 * G.wave;
      G.addScore(bonus);
      const h = '웨이브 클리어', p = `보너스 +${bonus} · 체력·탄약·수류탄 보급${G.net.active ? ' · 전사자 부활' : ''}`;
      G.hud.banner(h, p);
      if (!G.player.alive) G.respawnLocal();
      G.grant('wave');
      if (G.net.isHost) {
        G.net.broadcast({ t: 'banner', h, p });
        for (const m of G.net.mates.values()) { if (!m.alive) G.net.sendTo(m.id, { t: 'respawn' }); G.net.sendTo(m.id, { t: 'grant', k: 'wave' }); }
      }
      G.enemies.list = G.enemies.list.filter((e) => e.alive); G.enemies.byId = new Map(G.enemies.list.map((e) => [e.id, e]));
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
  progress(0.01, 'WebGL 렌더러 생성');
  const renderer = G.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', stencil: false });
  if (!renderer.capabilities.isWebGL2) throw new Error('WebGL2 미지원 기기');
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
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
  G.net = new Net(G);

  // 실사 에셋 (약 9.7MB) — 실패한 항목은 절차적 대체물 사용
  G.assets = new Assets(renderer);
  await G.assets.loadAll((p, label) => progress(0.02 + p * 0.5, label ? `실사 에셋 받는 중 · ${label}` : null));
  if (G.assets.failed.length) console.warn('일부 에셋 대체:', G.assets.failed);

  G.world = new World(G, G.assets);
  await G.world.build((p, l) => progress(0.52 + p * 0.38, l));
  progress(0.92, '무기와 적 모델 준비');
  await new Promise((r) => setTimeout(r, 0));
  G.effects = new Effects(G);
  G.player = new Player(G);
  G.weapons = new Weapons(G);
  G.enemies = new Enemies(G);
  G.combat = new Combat(G);
  G.pickups = new Pickups(G);
  G.hud = new Hud(G);
  G.waves = new Waves(G);
  G.post = new Post(G);

  progress(0.96, '셰이더 컴파일');
  await new Promise((r) => setTimeout(r, 0));
  G.player.spawn(G.world.playerSpawn, 0);
  G.enemies.spawn('warden'); G.enemies.spawn('drone'); G.enemies.spawn('heavy');
  G.pickups.maybeDrop(new THREE.Vector3(0, 0, 0)); G.pickups.maybeDrop(new THREE.Vector3(1, 0, 0)); G.pickups.maybeDrop(new THREE.Vector3(2, 0, 0));
  renderer.compile(G.scene, G.camera);
  renderer.compile(G.weapons.vmScene, G.weapons.vmCam);
  G.enemies.clear(); G.pickups.clear();

  applyQuality(true);
  onResize();
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', () => setTimeout(onResize, 200));
  document.addEventListener('visibilitychange', () => { if (document.hidden && G.state === 'playing') G.pause(); });

  setupMenus();
  setupLobby();
  progress(1, '준비 완료');
  G.state = 'menu';
  $('loading').hidden = true;
  showMenu();
  // 초대 링크(#join-ABCDE)로 들어온 경우 바로 참가 화면
  const m = /^#join-([A-Z0-9]{5})$/i.exec(location.hash);
  if (m) openLobby(m[1].toUpperCase());
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
function hideScreens() { for (const id of ['menu', 'pause', 'gameover', 'lobby', 'settings']) show(id, false); }
function showMenu() {
  const best = loadBest();
  $('best-score').textContent = best.score.toLocaleString('ko-KR');
  $('best-wave').textContent = best.wave;
  hideScreens(); show('menu', true); show('hud', false); show('controls', false);
  $('keys-touch').hidden = !IS_TOUCH; $('keys-desktop').hidden = IS_TOUCH;
  G.input.enabled = false;
  G.post.vmPass.enabled = false;
}

function requestImmersive() {
  if (IS_TOUCH) {
    try {
      const el = document.documentElement;
      const p = el.requestFullscreen ? el.requestFullscreen({ navigationUI: 'hide' }) : null;
      if (p && p.then) p.then(() => { try { screen.orientation.lock('landscape').catch(() => {}); } catch (e) { /* 미지원 */ } }).catch(() => {});
    } catch (e) { /* 전체 화면 불가 */ }
  }
  // 화면 꺼짐 방지 (방장은 특히 중요: 화면이 꺼지면 모두의 게임이 멈춘다)
  try { if (navigator.wakeLock) navigator.wakeLock.request('screen').then((l) => { G.wakeLock = l; }).catch(() => {}); } catch (e) { /* 미지원 */ }
}

function startGame(spawnIdx = 0) {
  G.audio.init();
  requestImmersive();
  G.enemies.clear(); G.pickups.clear(); G.combat.reset();
  G.weapons.reset();
  const sp = G.world.playerSpawn.clone().add(new THREE.Vector3((spawnIdx % 4) * 1.6 - 2.4, 0, Math.floor(spawnIdx / 4) * 1.6));
  G.player.spawn(sp, 0);
  G.enemies.kills = 0; G.enemies.headshots = 0; G.kills.clear();
  G.score = 0;
  G.waves.reset();
  G.input.reset(); G.input.ads = false; G.input.crouch = false;
  G.input.enabled = true; G.overlay = false;
  if (G.net.active) G.net.spawnMates();
  hideScreens(); show('hud', true); show('controls', IS_TOUCH);
  G.post.vmPass.enabled = true;
  G.state = 'playing';
  if (!IS_TOUCH) lockPointer();
}

function lockPointer() {
  try { const r = $('touch-layer').requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch (e) { /* 미지원 */ }
}

// 멀티에서는 일시정지해도 세계가 멈추지 않는다 (오버레이만)
G.pause = () => {
  if (G.state !== 'playing' || G.overlay) return;
  G.input.reset(); G.input.enabled = false; G.input.exitLock();
  if (G.net.active) G.overlay = true; else G.state = 'paused';
  $('pause-note').hidden = !G.net.active;
  show('pause', true);
};
G.resume = () => {
  if (G.state !== 'paused' && !G.overlay) return;
  show('pause', false); show('settings', false);
  G.overlay = false;
  G.state = 'playing'; G.input.enabled = true;
  if (!IS_TOUCH) lockPointer();
};
G.addScore = (n) => { G.score += n; };

G.onLocalDeath = () => {
  if (!G.net.active) { G.gameOver(); return; }
  G.input.reset();
  G.hud.feed(`${G.net.name} 전사`, 0);
  if (G.net.isClient) G.net.sendHost({ t: 'dead' });
  else { G.net.broadcast({ t: 'feed', txt: `${G.net.name} 전사`, pts: 0 }); G.checkAllDead(); }
};
G.respawnLocal = () => {
  const alive = G.net.active ? [...G.net.mates.values()].find((m) => m.alive) : null;
  const base = alive ? G.world.randomWalkableNear(alive.pos, 2.5) : G.world.playerSpawn;
  const keep = { ...G.weapons.state };
  G.player.spawn(base, G.player.yaw);
  G.weapons.state = keep;
  G.hud.banner('재투입', '전선에 복귀했습니다');
};
G.checkAllDead = () => {
  if (!G.net.isHost || G.state !== 'playing') return;
  if (G.player.alive) return;
  for (const m of G.net.mates.values()) if (m.alive) return;
  const stats = { score: G.score, wave: G.wave, players: G.net.players.map((p) => ({ name: p.name, ...(G.kills.get(p.id === G.net.myId ? G.net.myId : p.id) || { kills: 0, heads: 0 }) })) };
  G.net.broadcast({ t: 'over', ...stats });
  G.netOver(stats);
};
G.netOver = (stats) => { G.gameOver(stats); };

G.gameOver = (mp = null) => {
  G.state = 'gameover';
  G.input.reset(); G.input.enabled = false; G.input.exitLock();
  const best = loadBest();
  const newBest = G.score > best.score;
  if (newBest || G.wave > best.wave) saveBest({ score: Math.max(best.score, G.score), wave: Math.max(best.wave, G.wave) });
  const st = G.weapons.stats;
  const me = G.kills.get(G.net.active ? G.net.myId : 'local') || { kills: 0, heads: 0 };
  $('go-title').textContent = mp ? '분대 전멸 · KIA' : newBest ? '신기록 · KIA' : 'KIA · 전사';
  $('go-score').textContent = G.score.toLocaleString('ko-KR');
  $('go-wave').textContent = G.wave;
  $('go-kills').textContent = G.net.isClient ? me.kills : G.enemies.kills;
  $('go-heads').textContent = G.net.isClient ? me.heads : G.enemies.headshots;
  $('go-acc').textContent = st.shots ? `${Math.round(st.hits / st.shots * 100)}%` : '0%';
  $('go-best').textContent = Math.max(best.score, G.score).toLocaleString('ko-KR');
  $('go-team').innerHTML = mp && mp.players ? mp.players.map((p) => `<div>${esc(p.name)}<b>${p.kills}킬 · ${p.heads}헤드샷</b></div>`).join('') : '';
  $('btn-retry').hidden = G.net.isClient;
  $('go-wait').hidden = !G.net.isClient;
  setTimeout(() => { if (G.state === 'gameover') { show('gameover', true); show('controls', false); } }, 1400);
};

// 참가자: 방장이 시작 신호를 보냄
G.netStart = (m) => {
  hideScreens();
  startGame(typeof m.idx === 'number' ? m.idx : Math.max(0, G.net.players.findIndex((p) => p.id === G.net.myId)));
  if (m.mid) G.hud.banner('작전 합류', '진행 중인 작전에 합류했습니다');
};
G.netLost = (msg) => {
  G.enemies.clear(); G.pickups.clear(); G.combat.reset();
  G.state = 'menu'; showMenu();
  openLobby(); setLobbyStatus(msg, true);
};

function checkOrientation() {
  const portrait = IS_TOUCH && innerHeight > innerWidth * 1.05;
  show('rotate', portrait && !G.rotateSkip && G.state !== 'loading');
}

// ───────────── 메뉴/설정 ─────────────
function setupMenus() {
  const tap = (id, fn) => $(id).addEventListener('click', (e) => { e.preventDefault(); fn(); });
  tap('btn-start', () => { if (G.net.active) G.net.close(); startGame(); });
  tap('btn-multi', () => openLobby());
  tap('btn-retry', () => { if (G.net.isHost) hostStart(); else startGame(); });
  const toMenu = () => { if (G.net.active) G.net.close(); G.enemies.clear(); G.pickups.clear(); G.combat.reset(); G.state = 'menu'; showMenu(); };
  tap('btn-menu', toMenu);
  tap('btn-quit', toMenu);
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

// ───────────── 로비 (방 만들기 / 참가) ─────────────
const NAME_KEY = 'tray-black-rain-name';
function setLobbyStatus(msg, err = false) { const s = $('lobby-status'); s.textContent = msg || ''; s.classList.toggle('bad', !!err); }
function lobbyName() {
  const n = $('lobby-name').value.trim().slice(0, 12) || `대원${Math.floor(Math.random() * 90 + 10)}`;
  try { localStorage.setItem(NAME_KEY, n); } catch (e) { /* 무시 */ }
  return n;
}
function openLobby(code) {
  hideScreens(); show('lobby', true);
  try { $('lobby-name').value = $('lobby-name').value || localStorage.getItem(NAME_KEY) || ''; } catch (e) { /* 무시 */ }
  if (code) $('lobby-code').value = code;
  renderLobby();
}
function renderLobby() {
  const N = G.net, inRoom = N.active;
  $('lobby-entry').hidden = inRoom;
  $('lobby-room').hidden = !inRoom;
  if (!inRoom) return;
  $('lobby-code-big').textContent = N.code || '-----';
  $('lobby-players').innerHTML = N.players.map((p) => `<li>${esc(p.name)}${p.host ? ' <em>방장</em>' : ''}${p.id === N.myId ? ' <em>나</em>' : ''}</li>`).join('');
  $('btn-go').hidden = !N.isHost;
  $('lobby-wait').hidden = N.isHost;
  $('lobby-count').textContent = `${N.players.length} / 4`;
}
function hostStart() {
  const N = G.net;
  N.players.forEach((p, i) => { if (p.id !== N.myId) N.sendTo(p.id, { t: 'start', idx: i }); });
  startGame(0);
}
function setupLobby() {
  G.net.onLobby = renderLobby;
  const tap = (id, fn) => $(id).addEventListener('click', (e) => { e.preventDefault(); fn(); });
  tap('btn-host', async () => {
    G.audio.init();
    setLobbyStatus('방을 만드는 중…');
    try { await G.net.host(lobbyName()); setLobbyStatus('친구에게 방 코드나 초대 링크를 보내세요.'); renderLobby(); }
    catch (e) { G.net.close(); setLobbyStatus(e.message, true); }
  });
  tap('btn-join', async () => {
    G.audio.init();
    setLobbyStatus('방에 연결하는 중…');
    try { await G.net.join($('lobby-code').value, lobbyName()); setLobbyStatus('연결되었습니다. 방장이 출격하면 시작합니다.'); renderLobby(); }
    catch (e) { G.net.close(); setLobbyStatus(e.message, true); }
  });
  tap('btn-go', () => hostStart());
  tap('btn-lobby-leave', () => { G.net.close(); renderLobby(); setLobbyStatus(''); });
  tap('btn-lobby-back', () => { G.net.close(); showMenu(); });
  tap('btn-copy', async () => {
    const url = `${location.origin}${location.pathname}${location.search}#join-${G.net.code}`;
    try { await navigator.clipboard.writeText(url); setLobbyStatus('초대 링크를 복사했습니다.'); }
    catch (e) { setLobbyStatus(`복사가 막혀 있습니다. 직접 전달하세요: ${url}`); }
  });
  $('lobby-code').addEventListener('input', (e) => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5); });
}

// ───────────── 메인 루프 ─────────────
let last = 0, fpsAcc = 0, fpsN = 0, fpsT = 0, hbT = 0;
const menuCam = { t: 0 };

function spectateCam(dt) {
  const mate = [...G.net.mates.values()].find((m) => m.alive && m.avatar);
  const c = G.camera;
  if (mate) {
    const back = new THREE.Vector3(Math.sin(mate.yaw), 0, Math.cos(mate.yaw)).multiplyScalar(2.6);
    const want = mate.eye.add(back).add(new THREE.Vector3(0, 0.6, 0));
    c.position.lerp(want, Math.min(1, dt * 5));
    c.lookAt(mate.eye);
  } else { c.position.y = Math.max(G.player.pos.y + 0.3, c.position.y - dt * 1.4); }
}

function frame(now) {
  requestAnimationFrame(frame);
  const raw = (now - last) / 1000; last = now;
  const dt = Math.min(raw, 1 / 20);
  G.time += dt;

  if (G.state === 'playing' || G.state === 'gameover') {
    if (G.state === 'playing') {
      if (G.player.alive) { G.player.update(dt); G.weapons.update(dt); }
      else if (G.net.active) spectateCam(dt);
      else { const c = G.camera; c.position.y = Math.max(G.player.pos.y + 0.3, c.position.y - dt * 1.4); }
      if (G.authority) G.waves.update(dt);
      G.combat.update(dt);
    } else {
      const c = G.camera; c.position.y = Math.max(G.player.pos.y + 0.3, c.position.y - dt * 1.4);
    }
    G.enemies.update(dt);
    G.pickups.update(dt);
    G.hud.update(dt);
    if (G.player.hp < 30 && G.player.alive) { hbT -= dt; if (hbT <= 0) { hbT = 0.9; G.audio.heartbeat(); } }
  } else if (G.state === 'menu') {
    menuCam.t += dt;
    const t = menuCam.t * 0.05;
    G.camera.position.set(-6 + Math.sin(t) * 3, 2.1 + Math.sin(t * 1.7) * 0.2, 31 + Math.cos(t) * 1.5);
    G.camera.rotation.set(0.02 + Math.sin(t * 0.8) * 0.02, 0.38 + Math.sin(t * 1.1) * 0.12, 0);
    if (Math.abs(G.camera.fov - 62) > 0.1) { G.camera.fov = 62; G.camera.updateProjectionMatrix(); }
  }
  if (G.state === 'playing' && G.player.alive && Math.abs(G.camera.fov - G.player.fovCur) > 0.01) { G.camera.fov = G.player.fovCur; G.camera.updateProjectionMatrix(); }
  G.post.vmPass.enabled = G.state !== 'menu' && G.player.alive;

  G.net.update(dt);
  G.effects.update(G.state === 'paused' ? 0 : dt);
  G.world.update(G.state === 'paused' ? 0 : dt, G.camera, G.state === 'menu' ? G.camera.position : G.player.pos);
  G.audio.updateListener(G.camera);

  const gu = G.post.grade.uniforms;
  G.dmgFlash = Math.max(0, (G.dmgFlash || 0) - dt * 1.8);
  gu.uDamage.value = G.state === 'menu' ? 0 : G.dmgFlash;
  gu.uLowHp.value = G.state === 'menu' || !G.player.alive ? 0 : Math.max(0, (40 - G.player.hp) / 40);
  G.post.render(dt);

  frameAvg += (raw * 1000 - frameAvg) * 0.05;
  fpsAcc += raw; fpsN++; fpsT += raw;
  if (fpsT > 0.5) { if (settings.showFps) $('fps').textContent = `${Math.round(fpsN / fpsAcc)} FPS · ${Math.round(G.renderer.getPixelRatio() * 100) / 100}x${G.net.active ? ` · ${G.net.isHost ? '방장' : '참가'}` : ''}`; fpsAcc = 0; fpsN = 0; fpsT = 0; }
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
