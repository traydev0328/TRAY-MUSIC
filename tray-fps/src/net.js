// 멀티플레이(협동) — 방장 호스팅 P2P.
// 방장 기기가 서버 역할: 적 AI·웨이브·점수·픽업·폭발물은 방장이 계산하고 20Hz 스냅샷으로 방송한다.
// 각 플레이어는 자기 이동을 직접 계산해 방장에게 보낸다(협동 모드라 신뢰 기반).
// 전송: PeerJS(WebRTC 데이터채널, 무료 공개 신호 서버). ?net=local 이면 같은 브라우저 탭끼리 BroadcastChannel 로 테스트.
import * as THREE from 'three';
import { Operator, TYPE_KEYS } from './enemies.js';

const PEERJS_URL = 'https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js';
const PREFIX = 'traybr7-';
const SEND_HZ = 20;
export const MAX_PLAYERS = 4;
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const r2 = (v) => Math.round(v * 100) / 100;

function loadScript(src) {
  if (window.Peer) return Promise.resolve();
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = src; s.async = true;
    s.onload = () => res(); s.onerror = () => rej(new Error('통신 라이브러리(PeerJS)를 불러오지 못했습니다.'));
    document.head.appendChild(s);
  });
}

// ── 테스트용 로컬 전송 (같은 브라우저의 다른 탭) ──
class Emitter {
  constructor() { this._h = {}; }
  on(ev, cb) { (this._h[ev] || (this._h[ev] = [])).push(cb); return this; }
  emit(ev, ...a) { (this._h[ev] || []).forEach((cb) => cb(...a)); }
}
class LocalConn extends Emitter {
  constructor(owner, peer, label) { super(); this.owner = owner; this.peer = peer; this.label = label; this.open = false; }
  send(data) { if (this.open) this.owner._post({ k: 'd', to: this.peer, label: this.label, data }); }
  close() { this.owner._post({ k: 'x', to: this.peer, label: this.label }); this.open = false; this.emit('close'); }
}
class LocalPeer extends Emitter {
  constructor(id) {
    super();
    this.id = id || `l${Math.random().toString(36).slice(2, 9)}`;
    this.conns = new Map();
    this.bc = new BroadcastChannel('tray-br-net-test');
    this.bc.onmessage = (ev) => this._on(ev.data);
    setTimeout(() => this.emit('open', this.id), 10);
  }
  _post(m) { this.bc.postMessage({ ...m, from: this.id }); }
  connect(peer, { label }) {
    const c = new LocalConn(this, peer, label); this.conns.set(`${peer}|${label}`, c);
    this._post({ k: 'c', to: peer, label });
    setTimeout(() => { if (!c.open) this.emit('error', { type: 'peer-unavailable' }); }, 3000);
    return c;
  }
  _on(m) {
    if (m.to !== this.id) return;
    const key = `${m.from}|${m.label}`;
    if (m.k === 'c') { const c = new LocalConn(this, m.from, m.label); this.conns.set(key, c); this.emit('connection', c); c.open = true; c.emit('open'); this._post({ k: 'a', to: m.from, label: m.label }); }
    else if (m.k === 'a') { const c = this.conns.get(key); if (c) { c.open = true; c.emit('open'); } }
    else if (m.k === 'd') { const c = this.conns.get(key); if (c) c.emit('data', m.data); }
    else if (m.k === 'x') { const c = this.conns.get(key); if (c) { c.open = false; c.emit('close'); } }
  }
  destroy() { for (const c of this.conns.values()) if (c.open) c.close(); this.bc.close(); }
}

// ── 원격 아군 (방장에게는 적 AI 의 목표물이기도 함) ──
class Teammate {
  constructor(G, id, name) {
    this.G = G; this.id = id; this.name = name || '대원';
    this.isLocal = false;
    this.p = G.world.playerSpawn.clone();
    this.yaw = 0; this.pitch = 0; this.h = 1.75; this.hp = 100; this.alive = true; this.speedNow = 0;
    this.avatar = null; this.lastU = 0;
  }
  get pos() { return this.p; }
  get eye() { return new THREE.Vector3(this.p.x, this.p.y + this.h - 0.13, this.p.z); }
  get height() { return this.h; }
  get crouch() { return this.h < 1.5; }
  ensureAvatar() {
    if (this.avatar) return;
    // 팀 대전: 알파=공격팀 장비(SWAT), 브라보=수비팀 장비(FSB) / 그 외: 번갈아
    const M = this.G.match, idx = [...this.G.net.mates.keys()].indexOf(this.id);
    const variant = M.mode === 'tdm' ? (M.teamOf(this.id) === 0 ? 'swat' : 'fsb') : (idx % 2 ? 'fsb' : 'swat');
    this.avatar = new Operator(this.G, this.p, this.name, variant);
    this.avatar.pos.copy(this.p);
    this.avatar.root.userData.mate = this;
    this.avatar.tag.raycast = () => {}; // 이름표는 사격 판정 제외
  }
  apply(m) {
    const nx = m[0], ny = m[1], nz = m[2];
    const dt = Math.max(0.03, this.G.time - this.lastU); this.lastU = this.G.time;
    this.speedNow = Math.hypot(nx - this.p.x, nz - this.p.z) / dt;
    this.p.set(nx, ny, nz); this.yaw = m[3]; this.pitch = m[4]; this.h = m[5]; this.hp = m[6]; this.alive = !!m[7];
  }
  damage(a, from, by = null) {
    if (!this.alive) return;
    this.hp = Math.max(0, this.hp - a);
    this.G.net.sendTo(this.id, { t: 'dmg', a: r2(a), f: this.G.net.v3(from), ...(by ? { by } : {}) });
  }
  update() {
    if (!this.avatar) return;
    const A = this.avatar;
    A.netPos.copy(this.p); A.netYaw = this.yaw + Math.PI; A.netPitch = this.pitch; A.netH = this.h; A.netAlive = this.alive;
    // 피아 식별: 아군은 초록 표지 + 이름표, 적은 붉은 표지 + 이름표 숨김(벽 너머로 보이지 않게)
    const foe = this.G.match.isEnemy(this.id);
    if (A.foe !== foe) {
      A.foe = foe;
      A.visorMat.color.setRGB(foe ? 3.5 : 0.25, foe ? 0.25 : 1.6, foe ? 0.15 : 0.5);
    }
    A.tag.visible = !foe;
  }
  dispose() { if (this.avatar) this.avatar.dispose(); this.avatar = null; }
}

export class Net {
  constructor(G) {
    this.G = G;
    this.mode = 'off';
    this.peers = new Map();   // 방장: 참가자 연결
    this.mates = new Map();   // 모든 피어: 다른 플레이어
    this.myId = null; this.name = '대원'; this.code = null;
    this.sendT = 0;
    this.players = [];
    this.onLobby = () => {};
    this.hud = { wave: 0, left: 0, score: 0 };
    this.lobbyMode = 'coop';
    this.teams = new Map();
    this.ray = new THREE.Raycaster();
  }

  get active() { return this.mode !== 'off'; }
  get isHost() { return this.mode === 'host'; }
  get isClient() { return this.mode === 'client'; }
  v3(v) { return [r2(v.x), r2(v.y), r2(v.z)]; }
  V(a) { return new THREE.Vector3(a[0], a[1], a[2]); }
  static isLocalTest() { return new URLSearchParams(location.search).get('net') === 'local'; }

  async _newPeer(id) {
    if (Net.isLocalTest()) return new LocalPeer(id);
    await loadScript(PEERJS_URL);
    return new window.Peer(id || undefined, { debug: 1 });
  }

  _waitOpen(peer) {
    return new Promise((res, rej) => {
      const to = setTimeout(() => rej(new Error('신호 서버에 연결하지 못했습니다. 인터넷 연결을 확인하세요.')), 12000);
      peer.on('open', (id) => { clearTimeout(to); res(id); });
      peer.on('error', (e) => { clearTimeout(to); rej(e); });
    });
  }

  _friendly(e) {
    const t = e && e.type;
    if (t === 'browser-incompatible') return new Error('이 브라우저는 실시간 P2P(WebRTC)를 지원하지 않습니다.');
    if (t === 'network' || t === 'server-error' || t === 'socket-error') return new Error('신호 서버 연결이 차단되었습니다. claude.ai 미리보기에서는 멀티플레이가 막혀 있으니 GitHub Pages 주소로 접속하세요.');
    return e instanceof Error ? e : new Error(String((e && e.message) || e));
  }

  // ─────────── 방장 ───────────
  async host(name) {
    this.name = name;
    let lastErr = null;
    for (let i = 0; i < 4; i++) {
      const code = Array.from({ length: 5 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
      try {
        const peer = await this._newPeer(PREFIX + code);
        this.myId = await this._waitOpen(peer);
        this.peer = peer; this.code = code; break;
      } catch (e) { lastErr = e; if (!(e && e.type === 'unavailable-id')) throw this._friendly(e); }
    }
    if (!this.peer) throw this._friendly(lastErr);
    this.mode = 'host';
    this.peer.on('connection', (c) => this._hostConn(c));
    this.peer.on('disconnected', () => { try { this.peer.reconnect(); } catch (e) { /* 재연결 실패 */ } });
    this._lobby();
    return this.code;
  }

  _hostConn(conn) {
    const pid = conn.peer;
    // 연결이 들어오는 즉시 등록 (open 이전에 데이터가 도착해도 잃지 않도록)
    let P = this.peers.get(pid);
    if (!P) {
      if (this.peers.size >= MAX_PLAYERS - 1) { conn.on('open', () => { try { conn.send({ t: 'full' }); } catch (e) { /* 무시 */ } setTimeout(() => conn.close(), 400); }); return; }
      P = { id: pid, name: '대원', evt: null, st: null };
      this.peers.set(pid, P);
    }
    if (conn.label === 'st') P.st = conn; else P.evt = conn;
    conn.on('data', (d) => this._fromClient(pid, d));
    conn.on('close', () => { if (conn.label !== 'st') this._drop(pid); });
    conn.on('error', () => {});
  }

  _drop(pid) {
    const P = this.peers.get(pid);
    if (!P) return;
    this.peers.delete(pid);
    const m = this.mates.get(pid);
    if (m) { this.G.hud.feed(`${m.name} 연결 끊김`, 0); m.dispose(); this.mates.delete(pid); }
    this._lobby();
    this.G.checkAllDead();
  }

  _lobby() {
    const ids = [this.myId, ...this.peers.keys()];
    for (const id of [...this.teams.keys()]) if (!ids.includes(id)) this.teams.delete(id);
    for (const id of ids) if (!this.teams.has(id)) {
      const n0 = [...this.teams.values()].filter((t) => t === 0).length, n1 = this.teams.size - n0;
      this.teams.set(id, n0 <= n1 ? 0 : 1); // 인원이 적은 팀으로 자동 배정
    }
    this.players = [{ id: this.myId, name: this.name, host: true, team: this.teams.get(this.myId) }, ...[...this.peers.values()].map((p) => ({ id: p.id, name: p.name, team: this.teams.get(p.id) }))];
    this.broadcast({ t: 'lobby', players: this.players, code: this.code, mode: this.lobbyMode });
    this._syncMates(this.players);
    this.onLobby();
  }

  setMode(mode) { if (!this.isHost) return; this.lobbyMode = mode; this._lobby(); }
  switchTeam(id) {
    if (!this.isHost) { this.sendHost({ t: 'team' }); return; }
    this.teams.set(id, this.teams.get(id) === 1 ? 0 : 1); this._lobby();
    if (this.G.state === 'playing') { this.G.match.teams = new Map(this.teams); this.broadcast({ t: 'teams', teams: [...this.teams] }); }
  }
  startMsg(idx) { return { t: 'start', idx, mode: this.lobbyMode, teams: [...this.teams], map: this.G.world.mapId }; }

  _fromClient(pid, m) {
    const G = this.G, P = this.peers.get(pid);
    if (!P || !m || typeof m !== 'object') return;
    switch (m.t) {
      case 'hello':
        P.name = String(m.name || '대원').replace(/[<>&]/g, '').slice(0, 12) || '대원';
        this._lobby();
        if (G.state === 'playing') { G.match.teams = new Map(this.teams); this.broadcast({ t: 'teams', teams: [...this.teams] }, pid); this.sendTo(pid, { ...this.startMsg(this.players.findIndex((p) => p.id === pid)), mid: 1, mode: G.match.mode }); G.match.broadcastScore(); }
        break;
      case 'u': { const mt = this.mates.get(pid); if (mt) mt.apply(m.s); break; }
      case 'hit': {
        const e = G.enemies.byId.get(m.id);
        if (e && e.alive && typeof m.d === 'number') {
          const r = e.takeDamage(Math.min(m.d, 200), m.p, this.V(m.dir), e.aimPoint(), pid);
          if (r.killed) this.sendTo(pid, { t: 'hitm', k: 1, h: r.head ? 1 : 0 });
        }
        break;
      }
      case 'shot': this.broadcast({ ...m, id: pid }, pid); this._remoteShot(pid, m); break;
      case 'gren': G.combat.throwGrenade(this.V(m.p), this.V(m.v), pid, m.f); this.broadcast({ ...m, o: pid }, pid); break;
      case 'propHit': { const rec = G.world.explosives[m.i]; if (rec) G.combat.damageProp(rec, m.d, pid); break; }
      case 'dead': {
        const mt = this.mates.get(pid); if (mt) mt.alive = false;
        if (G.match.pvp) { G.match.recordKill(pid, m.by || null); break; }
        G.hud.feed(`${P.name} 전사`, 0); this.broadcast({ t: 'feed', txt: `${P.name} 전사`, pts: 0 }, pid); G.checkAllDead(); break;
      }
      case 'phit': this._applyPlayerHit(pid, m.v, m.d, m.p); break;
      case 'team': if (G.state !== 'playing') this.switchTeam(pid); break;
    }
  }

  // ─────────── 참가자 ───────────
  async join(code, name) {
    this.name = name;
    code = String(code).toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (code.length !== 5) throw new Error('방 코드는 5자리입니다.');
    let peer;
    try { peer = await this._newPeer(null); this.myId = await this._waitOpen(peer); } catch (e) { throw this._friendly(e); }
    this.peer = peer;
    const hostId = PREFIX + code;
    const evt = peer.connect(hostId, { label: 'evt', reliable: true, serialization: 'json' });
    const st = peer.connect(hostId, { label: 'st', reliable: false, serialization: 'json' });
    await new Promise((res, rej) => {
      const fail = () => rej(new Error('방을 찾을 수 없습니다. 코드를 확인하거나 방장에게 다시 받아 주세요.'));
      const to = setTimeout(fail, 15000);
      evt.on('open', () => { clearTimeout(to); res(); });
      peer.on('error', (e) => { if (e && e.type === 'peer-unavailable') { clearTimeout(to); fail(); } });
    });
    this.evt = evt; this.st = st; this.mode = 'client'; this.code = code;
    evt.on('data', (d) => this._fromHost(d));
    st.on('data', (d) => this._fromHost(d));
    evt.on('close', () => this._hostLost());
    this.sendHost({ t: 'hello', name });
  }

  _hostLost() {
    if (this.mode !== 'client') return;
    this.close();
    this.G.netLost('방장과의 연결이 끊어졌습니다.');
  }

  _fromHost(m) {
    const G = this.G;
    if (!m || typeof m !== 'object') return;
    switch (m.t) {
      case 'lobby': this.players = m.players; this.lobbyMode = m.mode || 'coop'; this.teams = new Map(m.players.map((p) => [p.id, p.team || 0])); this._syncMates(m.players); this.onLobby(); break;
      case 'teams': this.teams = new Map(m.teams); G.match.teams = new Map(m.teams); break;
      case 'pscore': G.match.applyScore(m); break;
      case 'mend': G.match.over = true; G.matchEnd(m); break;
      case 'full': this.close(); G.netLost('방이 가득 찼습니다 (최대 4명).'); break;
      case 'start': G.netStart(m); break;
      case 's': this._applySnap(m); break;
      case 'kill': G.enemies.puppetKill(m.id, this.V(m.d), !!m.h); if (m.by === this.myId) { G.hud.hitmarker(true); } break;
      case 'efire': { const e = G.enemies.byId.get(m.id); if (e && e.alive) e.netFire(this.V(m.f), this.V(m.e)); break; }
      case 'dmg': G.player.damage(m.a, this.V(m.f), m.by || null); break;
      case 'hitm': G.audio.hitmarker(true, !!m.h); G.creditKill(this.myId, !!m.h); break;
      case 'grant': G.grant(m.k); break;
      case 'pk+': G.pickups.netAdd(m); break;
      case 'pk-': G.pickups.netRemove(m.id); break;
      case 'gren': G.combat.throwGrenade(this.V(m.p), this.V(m.v), m.o, m.f); break;
      case 'prop': { const rec = G.world.explosives[m.i]; if (rec) G.combat.detonateProp(rec, m.o); break; }
      case 'shot': this._remoteShot(m.id, m); break;
      case 'banner': G.hud.banner(m.h, m.p); break;
      case 'feed': G.hud.feed(m.txt, m.pts); break;
      case 'respawn': G.respawnLocal(); break;
      case 'over': G.netOver(m); break;
    }
  }

  _applySnap(m) {
    const G = this.G;
    this.hud.wave = m.w; this.hud.left = m.l; this.hud.score = m.sc;
    if (typeof m.tm === 'number') G.match.timeLeft = m.tm;
    G.wave = m.w; G.score = m.sc;
    for (const e of m.e) G.enemies.syncPuppet(e[0], TYPE_KEYS[e[1]], e[2], e[3], e[4], e[5], e[6]);
    for (const p of m.p) {
      if (p[0] === this.myId) continue;
      const mt = this.mates.get(p[0]);
      if (mt) mt.apply(p.slice(1));
    }
  }

  _syncMates(players) {
    const ids = new Set(players.map((p) => p.id));
    for (const p of players) {
      if (p.id === this.myId) continue;
      let mt = this.mates.get(p.id);
      if (!mt) { mt = new Teammate(this.G, p.id, p.name); this.mates.set(p.id, mt); }
      mt.name = p.name;
    }
    for (const [id, mt] of this.mates) if (!ids.has(id)) { mt.dispose(); this.mates.delete(id); }
  }

  _remoteShot(id, m) {
    const mt = this.mates.get(id);
    if (!mt || !mt.avatar) return;
    const end = this.V(m.e);
    mt.avatar.shotFx(end);
    if (m.s && m.n) this.G.effects.impact(end, this.V(m.n), m.s);
  }

  // ─────────── 대전: 플레이어 판정 ───────────
  raycastMates(origin, dir, maxT) {
    const roots = [];
    for (const m of this.mates.values()) if (m.alive && m.avatar && this.G.match.isEnemy(m.id)) { m.avatar.root.updateMatrixWorld(true); roots.push(m.avatar.root); }
    if (!roots.length) return null;
    this.ray.set(origin, dir); this.ray.far = maxT;
    for (const h of this.ray.intersectObjects(roots, true)) {
      let o = h.object; while (o && !o.userData.mate) o = o.parent;
      if (o) return { mate: o.userData.mate, part: h.object.userData.part || 'body', point: h.point, dist: h.distance };
    }
    return null;
  }

  // 내가 상대를 맞힘 → 방장이 검증 후 피해 적용
  playerHit(victimId, dmg, part, dir) {
    if (this.isHost) this._applyPlayerHit(this.myId, victimId, dmg, part);
    else this.sendHost({ t: 'phit', v: victimId, d: r2(dmg), p: part, dir: this.v3(dir) });
  }

  _applyPlayerHit(by, victimId, dmg, part) {
    const G = this.G, M = G.match;
    if (!M.pvp || M.over || typeof dmg !== 'number' || dmg <= 0) return;
    const shooter = G.targetById(by), victim = G.targetById(victimId);
    if (!shooter || !victim || !shooter.alive || !victim.alive || by === victimId) return;
    if (M.mode === 'tdm' && M.teamOf(by) === M.teamOf(victimId)) return; // 아군 사격 무효
    if (shooter.pos.distanceTo(victim.pos) > 250) return; // 비정상 거리
    const a = Math.min(dmg, 80);
    if (victim.isLocal) G.player.damage(a, shooter.pos.clone(), by);
    else victim.damage(a, shooter.pos.clone(), by);
  }

  // ─────────── 전송 ───────────
  _send(conn, msg) { try { if (conn && conn.open) conn.send(msg); } catch (e) { /* 연결 종료 중 */ } }
  sendHost(msg) { this._send(this.evt, msg); }
  sendTo(id, msg) { const P = this.peers.get(id); if (P) this._send(P.evt, msg); }
  broadcast(msg, except = null) { if (!this.isHost) return; for (const P of this.peers.values()) if (P.id !== except) this._send(P.evt, msg); }
  broadcastU(msg) { for (const P of this.peers.values()) this._send(P.st && P.st.open ? P.st : P.evt, msg); }
  sendAll(msg) { const m = { ...msg, id: this.myId }; if (this.isHost) this.broadcast(m); else if (this.isClient) this.sendHost(m); }

  // 게임 시작 시 모든 아군 아바타 생성
  spawnMates() { for (const mt of this.mates.values()) { mt.alive = true; mt.hp = 100; mt.ensureAvatar(); } }

  update(dt) {
    if (!this.active) return;
    const G = this.G;
    for (const mt of this.mates.values()) mt.update(dt);
    this.sendT -= dt;
    if (this.sendT > 0 || G.state !== 'playing' && G.state !== 'gameover') return;
    this.sendT = 1 / SEND_HZ;
    const P = G.player;
    const me = [r2(P.pos.x), r2(P.pos.y), r2(P.pos.z), r2(P.yaw), r2(P.pitch), r2(P.height), Math.round(P.hp), P.alive ? 1 : 0];
    if (this.isHost) {
      const e = G.enemies.list.filter((x) => x.alive).map((x) => [x.id, TYPE_KEYS.indexOf(x.type), r2(x.pos.x), r2(x.pos.y), r2(x.pos.z), r2(x.yaw), x.canSee ? 1 : 0]);
      const p = [[this.myId, ...me], ...[...this.mates.values()].map((m) => [m.id, r2(m.p.x), r2(m.p.y), r2(m.p.z), r2(m.yaw), r2(m.pitch), r2(m.h), Math.round(m.hp), m.alive ? 1 : 0])];
      this.broadcastU({ t: 's', w: G.wave, l: G.waves.remaining(), sc: G.score, tm: Math.round(G.match.timeLeft), e, p });
    } else {
      this._send(this.st && this.st.open ? this.st : this.evt, { t: 'u', s: me });
      // 오래 갱신되지 않은 퍼펫 정리
      for (const x of G.enemies.list) if (x.puppet && x.alive && G.time - (x.seenAt || G.time) > 2.5) { x.alive = false; if (x.sound) x.sound.stop(); x.root.removeFromParent(); }
    }
  }

  close() {
    for (const mt of this.mates.values()) mt.dispose();
    this.mates.clear(); this.peers.clear();
    try { if (this.peer) this.peer.destroy(); } catch (e) { /* 무시 */ }
    this.peer = null; this.evt = null; this.st = null;
    this.mode = 'off'; this.code = null; this.players = [];
  }
}
