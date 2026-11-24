// 폭파 작전 — 5대5 라운드제 (공격: 폭탄 설치 / 수비: 방어·해체), 구매·경제, 봇 AI
// 싱글: 사용자 1명 + 아군 봇 4명 vs 적 봇 5명.
// 멀티: 방장이 판정(봇 AI·폭탄·라운드·승패)을 맡고, 사람 수가 모자란 자리는 봇이 채운다(팀당 5명).
//       참가자는 자기 이동·사격·구매만 처리하고, 폭탄 상태·라운드는 방장의 방송을 따른다.
// 7라운드 선승, 6라운드 후 공수 교대.
import * as THREE from 'three';
import { Enemy, pickSkin, teamBand, ALLY_SKINS, FOE_SKINS } from './enemies.js';
import { WEAPONS } from './weapons.js';
import { TEAM_NAMES } from './pvp.js';

export const PRICES = {
  p_engraved: 0, p_deagle: 700, smg_mp5: 1500, smg_p90: 1700, sg_870: 1200, sg_benelli: 1800,
  rifle: 2900, ar_ar15: 2900, ar_aks: 2700, ar_ak47t: 2700, sr_m40: 4500, sr_l115: 5000, lmg_m249: 3200,
  armorL: 400, armorH: 1000, grenade: 300,
};
const BUY_T = 15, LIVE_T = 100, BOMB_T = 40, END_T = 5, PLANT_T = 4, DEFUSE_T = 7, WIN_ROUNDS = 7, TEAM_SIZE = 5;
const ROLE = ['공격', '수비'];
export const BOT_SKINS = ['swat', 'fullgear', 'ksk', 'tac_suit', 'rifleman', 'rus', 'fsb']; // 스냅샷 전송용 외형 번호표
const r2 = (v) => Math.round(v * 100) / 100;

// ── 봇: 실사 대원(Enemy 기반) + 팀 + 목표 행동 ──
class Bot extends Enemy {
  constructor(G, pos, team, info) {
    // 팀 0 = 아군 장비 로스터, 팀 1 = 적 장비 로스터 (멀티에서도 팀별로 외형이 갈려 피아 식별이 쉬움)
    super(G, 'warden', pos, { id: info.id, variant: pickSkin(G, team === 0 ? ALLY_SKINS : FOE_SKINS, info.id) });
    this.team = team; this.info = info; this.name = info.name;
    this.isBot = true; this.isLocal = false;
    this.T = { ...this.T, hp: 100, dmg: info.dmg, score: 0, name: info.name, acc: 0.38, range: 45 };
    this.hp = 100 + info.armor; this.gCool = Infinity; // 봇은 수류탄을 쓰지 않음 (아군 피해 방지)
    this.task = null; this.plantT = 0;
    this.team = team; teamBand(this, G.bomb.playerTeam);
  }
  get eye() { return new THREE.Vector3(this.pos.x, this.pos.y + this.eyeH, this.pos.z); }
  get height() { return 1.75; }
  get crouch() { return false; }
  get speedNow() { return Math.hypot(this.vel.x, this.vel.z); }
  set speedNow(v) { /* 계산값 */ }
  damage(a, from, by) { if (!this.alive) return; const d = new THREE.Vector3().subVectors(this.pos, from).normalize(); this.takeDamage(a, 'body', d, this.aimPoint(), by); }
  // 목표 지점: 최근에 본 적 > 임무 지점
  objectiveGoal() {
    if (this.lastSeen && this.alerted && this.G.time - (this.seenAtTime || 0) < 3) return this.lastSeen;
    return this.task || this.pos;
  }
  _pickTarget() {
    const foes = this.G.bomb.foesOf(this.team);
    let best = null, bs = Infinity;
    for (const t of foes) {
      const d = t.pos.distanceTo(this.pos);
      const vis = d < 70 && this.G.world.lineOfSight(this.eye, t.eye);
      const s = d - (vis ? 40 : 0);
      if (s < bs) { bs = s; best = t; }
    }
    this.target = best;
    if (best) this.seenAtTime = this.canSee ? this.G.time : this.seenAtTime;
  }
}

export class BombMode {
  constructor(G) {
    this.G = G;
    this.active = false;
    this.client = false;
    this.bots = [];
    this.useHeld = new Map();     // 방장: 참가자별 F(작업) 누름 상태
  }

  get mp() { return this.G.net.active; }
  get me() { return this.G.match.me; }
  teamOfHuman(id) { return this.mp ? this.G.match.teamOf(id) : 0; }

  // 사람 참가자 목록 (나 + 원격 대원)
  _humans() {
    const G = this.G, out = [{ id: this.me, team: this.playerTeam, ent: G.player, local: true }];
    if (this.mp) for (const m of G.net.mates.values()) out.push({ id: m.id, team: this.teamOfHuman(m.id), ent: m, local: false });
    return out;
  }

  // ─────────── 시작 ───────────
  start() {
    const G = this.G;
    this.active = true; this.client = false;
    this.round = 0; this.score = [0, 0];                 // 팀 0 / 팀 1 라운드 승수
    this.playerTeam = this.teamOfHuman(this.me);
    this.attackers = 0;                                   // 공격 팀 번호 (6라운드 후 교대)
    this.credits = 800; this.lossStreak = [0, 0];
    this.kills = 0; this.deaths = 0;
    this.useHeld.clear();
    // 봇 명단: 팀마다 사람 수만큼 빼고 5명까지 채움
    const humans = this._humans();
    this.roster = [];
    let id = 5000;
    for (const team of [0, 1]) {
      const n = Math.max(0, TEAM_SIZE - humans.filter((h) => h.team === team).length);
      for (let i = 0; i < n; i++) this.roster.push({ id: id++, team, name: `${TEAM_NAMES[team]}-${i + 1}${this.mp ? ' (봇)' : ''}`, credits: 800, gun: 'p_engraved', armor: 0, dmg: 6 });
    }
    this.playerGun = { primary: null, secondary: 'p_engraved', armor: 0 };
    this.newRound();
  }

  // 참가자: 방장의 진행을 따라가는 거울 모드
  startClient(mid = false) {
    const G = this.G;
    this.active = true; this.client = true;
    this.round = 0; this.score = [0, 0]; this.phase = mid ? 'end' : 'buy'; this.t = 0;
    this.playerTeam = this.teamOfHuman(this.me); this.attackers = 0;
    this.credits = 800; this.kills = 0; this.deaths = 0;
    this.playerGun = { primary: null, secondary: 'p_engraved', armor: 0 };
    this.bomb = { state: 'carried', carrier: null, pos: new THREE.Vector3(), timer: BOMB_T, site: null };
    this.bots = [];
    this._prog = -1; this._actor = null;
    if (mid) { G.player.alive = false; G.hud.banner('작전 합류', '다음 라운드부터 투입됩니다'); }
  }

  stop() { this.active = false; this.client = false; this._clearBots(); this._removeBomb(); }

  // 상대 진영 전투원 목록 (사람 + 봇)
  foesOf(team) {
    const out = [];
    for (const h of this._humans()) if (h.team !== team && h.ent.alive && (h.local || h.ent.avatar)) out.push(h.ent);
    for (const b of this.bots) if (b.alive && b.team !== team) out.push(b);
    return out;
  }
  isFoe(e) { return e.team !== undefined && e.team !== this.playerTeam; }

  _clearBots() { for (const b of this.bots || []) { if (b.root) b.root.removeFromParent(); } this.G.enemies.list = this.G.enemies.list.filter((e) => !e.isBot); this.G.enemies.byId = new Map(this.G.enemies.list.map((e) => [e.id, e])); this.bots = []; }

  spawnPointFor(team, i) {
    const W = this.G.world, side = team === this.attackers ? 0 : 1; // 공격 = 남쪽(teamSpawns[0])
    const list = W.teamSpawns[side];
    return W.randomWalkableNear(list[i % list.length], 1.2);
  }

  // ─────────── 라운드 시작 (방장/싱글) ───────────
  async newRound() {
    const G = this.G;
    this.round++;
    if (this.round === 7) { this._swapSides(); }
    this.phase = 'buy'; this.t = BUY_T;
    this.bomb = { state: 'carried', carrier: null, pos: new THREE.Vector3(), plantT: 0, defuseT: 0, timer: BOMB_T, site: null };
    this.useHeld.clear(); this._actor = null; this._prog = -1;
    this._removeBomb();
    this._clearBots();
    G.enemies.clear(); G.enemies.dying = [];
    this.bots = [];
    // 스폰 순번: 팀마다 사람 먼저, 그다음 봇
    const slot = [0, 0];
    const humans = this._humans();
    const humanSpawn = new Map();
    for (const h of humans) { const p = this.spawnPointFor(h.team, slot[h.team]++); humanSpawn.set(h.id, { p, yaw: h.team === this.attackers ? 0 : Math.PI }); }
    for (const r of this.roster) {
      this._botBuy(r);
      const b = new Bot(G, this.spawnPointFor(r.team, slot[r.team]++), r.team, r);
      b.yaw = r.team === this.attackers ? Math.PI : 0;
      G.enemies.list.push(b); G.enemies.byId.set(b.id, b);
      this.bots.push(b);
    }
    // 폭탄: 공격 팀 사람 중 한 명이 50% 확률로, 아니면 공격 봇 중 무작위
    const atkHumans = humans.filter((h) => h.team === this.attackers), atkBots = this.bots.filter((b) => b.team === this.attackers);
    if (atkHumans.length && (Math.random() < 0.5 || !atkBots.length)) this.bomb.carrier = atkHumans[Math.floor(Math.random() * atkHumans.length)].id;
    else this.bomb.carrier = atkBots[Math.floor(Math.random() * atkBots.length)] || null;
    this.targetSite = Math.random() < 0.5 ? 'A' : 'B';
    // 원격 참가자에게 라운드 시작 알림(각자 스폰 위치 포함)
    if (this.mp) for (const h of humans) if (!h.local) {
      const s = humanSpawn.get(h.id);
      G.net.sendTo(h.id, { t: 'bround', round: this.round, atk: this.attackers, sc: this.score, p: G.net.v3(s.p), yaw: s.yaw, carrier: this.bomb.carrier === h.id });
    }
    // 내 스폰
    const mine = humanSpawn.get(this.me);
    await this._spawnLocal(mine.p, mine.yaw);
    G.hud.banner(`라운드 ${this.round}`, `${ROLE[this.playerTeam === this.attackers ? 0 : 1]} · 구매 단계 ${BUY_T}초 (B 키 / 구매 버튼)`);
    this.openBuy(true);
  }

  _swapSides() {
    this.attackers = 1 - this.attackers;
    this.G.hud.banner('공수 교대', '팀의 역할이 바뀝니다');
    this.credits = 800; this.playerGun = { primary: null, secondary: 'p_engraved', armor: 0 };
    for (const r of this.roster || []) { r.credits = 800; r.gun = 'p_engraved'; r.armor = 0; }
  }

  async _spawnLocal(p, yaw) {
    const G = this.G, P = G.player;
    P.spawn(p, yaw);
    P.maxHp = 100; P.hp = 100 + this.playerGun.armor;
    G.combat.playerGrenades = this.playerGun.grenade ? 1 : 0; this.playerGun.grenade = 0;
    await this._applyPlayerLoadout();
  }

  // 참가자: 라운드 시작 메시지
  async onRoundMsg(m) {
    const G = this.G;
    if (!this.client) return;
    G.enemies.clear(); G.enemies.dying = []; G.enemies._deadIds = new Set(); // 봇 번호는 라운드마다 재사용
    this._removeBomb();
    const swapped = m.atk !== this.attackers && this.round > 0;
    this.round = m.round; this.attackers = m.atk; this.score = m.sc;
    if (swapped || m.round === 7) { this.credits = 800; this.playerGun = { primary: null, secondary: 'p_engraved', armor: 0 }; G.hud.banner('공수 교대', '팀의 역할이 바뀝니다'); }
    this.phase = 'buy'; this.t = BUY_T;
    this.bomb = { state: 'carried', carrier: m.carrier ? this.me : null, pos: new THREE.Vector3(), timer: BOMB_T, site: null };
    await this._spawnLocal(G.net.V(m.p), m.yaw);
    G.hud.banner(`라운드 ${this.round}`, `${ROLE[this.playerTeam === this.attackers ? 0 : 1]} · 구매 단계 ${BUY_T}초 (B 키 / 구매 버튼)${m.carrier ? ' · 💣 폭탄 소지' : ''}`);
    this.openBuy(true);
  }

  async _applyPlayerLoadout() {
    const W = this.G.weapons, g = this.playerGun;
    const ids = [g.primary || g.secondary, g.secondary];
    await W.prepareLoadout(ids);
    for (const id of ids) { W.state[id].mag = WEAPONS[id].mag; W.state[id].reserve = WEAPONS[id].reserve; }
    W._show(W.order[0]);
  }

  _botBuy(r) {
    // 봇 구매: 여유 자금에 따라 소총 > 기관단총 > 권총, 남으면 방탄복
    const opts = r.credits >= 3800 ? ['ar_ak47t', 'ar_ar15', 'ar_aks', 'rifle'] : r.credits >= 2000 ? ['smg_mp5', 'smg_p90', 'sg_870'] : [];
    if (opts.length && WEAPONS[r.gun].slot === 2) { const g = opts[Math.floor(Math.random() * opts.length)]; if (r.credits >= PRICES[g]) { r.credits -= PRICES[g]; r.gun = g; } }
    if (r.armor < 50 && r.credits >= PRICES.armorH + 500) { r.credits -= PRICES.armorH; r.armor = 50; } else if (r.armor < 25 && r.credits >= PRICES.armorL) { r.credits -= PRICES.armorL; r.armor = 25; }
    const cls = WEAPONS[r.gun].cls;
    r.dmg = cls === '소총' ? 9 : cls === '기관단총' ? 7 : cls === '산탄총' ? 11 : 6;
  }

  // ── 구매 메뉴 (각자 자기 돈으로) ──
  openBuy(on) {
    const el = document.getElementById('buy');
    if (!el) return;
    el.hidden = !on || this.phase !== 'buy';
    if (!el.hidden) { this.renderBuy(); this.G.input.exitLock(); } // 데스크톱: 구매 버튼을 누를 수 있게 마우스 잠금 해제
  }
  renderBuy() {
    const box = document.getElementById('buy-list'); if (!box) return;
    document.getElementById('buy-credits').textContent = `₩ ${this.credits.toLocaleString('ko-KR')}`;
    const g = this.playerGun;
    const item = (id, label, sub, owned) => `<button data-buy="${id}" ${owned ? 'class="on"' : ''} ${PRICES[id] > this.credits && !owned ? 'disabled' : ''}><span>${sub}</span>${label}<b>${PRICES[id] ? PRICES[id].toLocaleString('ko-KR') : '기본'}</b></button>`;
    let html = '';
    for (const id of ['p_engraved', 'p_deagle', 'smg_mp5', 'smg_p90', 'sg_870', 'sg_benelli', 'ar_aks', 'ar_ak47t', 'ar_ar15', 'rifle', 'sr_m40', 'sr_l115', 'lmg_m249']) {
      const d = WEAPONS[id]; html += item(id, d.name, d.cls, g.primary === id || g.secondary === id);
    }
    html += item('armorL', '경방탄복 +25', '장비', g.armor === 25) + item('armorH', '중방탄복 +50', '장비', g.armor === 50) + item('grenade', '수류탄', '장비', !!g.grenade);
    box.innerHTML = html;
    box.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => this.buy(b.dataset.buy)));
  }
  async buy(id) {
    const g = this.playerGun, price = PRICES[id];
    if (this.phase !== 'buy' || price > this.credits) return;
    if (id === 'armorL' || id === 'armorH') { const v = id === 'armorL' ? 25 : 50; if (g.armor >= v) return; this.credits -= price; g.armor = v; this.G.player.hp = 100 + v; }
    else if (id === 'grenade') { if (g.grenade) return; this.credits -= price; g.grenade = 1; this.G.combat.playerGrenades = 1; }
    else {
      const d = WEAPONS[id];
      if (d.slot === 2) { if (g.secondary === id) return; this.credits -= price; g.secondary = id; }
      else { if (g.primary === id) return; this.credits -= price; g.primary = id; }
      await this._applyPlayerLoadout();
    }
    this.G.audio.pickup();
    this.renderBuy();
  }

  // ── 폭탄 모형 ──
  _bombMesh() {
    if (this.bombObj) return this.bombObj;
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.12, 0.22), new THREE.MeshStandardMaterial({ color: 0x2b2d2a, roughness: 0.7, metalness: 0.2 }));
    const pad = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.02, 0.08), new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.4 })); pad.position.set(0.05, 0.07, 0);
    this.ledMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 0.1, 0.05) });
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 6), this.ledMat); led.position.set(-0.1, 0.075, 0.05);
    body.position.y = 0.06; body.castShadow = true;
    g.add(body, pad, led);
    this.G.scene.add(g); this.bombObj = g;
    return g;
  }
  _removeBomb() { if (this.bombObj) { this.bombObj.removeFromParent(); this.bombObj = null; } }
  _siteOf(p) { const S = this.G.world.sites; for (const k of ['A', 'B']) if (S[k] && p.distanceTo(S[k]) < 6.5) return k; return null; }
  _beep(dt) {
    const B = this.bomb;
    const rate = B.timer > 20 ? 1 : B.timer > 10 ? 0.5 : B.timer > 5 ? 0.25 : 0.12;
    this._beepT = (this._beepT || 0) - dt;
    if (this._beepT <= 0) { this._beepT = rate; this.G.audio.click(2600, 0, 0.35, 0.06, B.pos); if (this.ledMat) { this.ledMat.color.setRGB(6, 0.2, 0.1); setTimeout(() => this.ledMat && this.ledMat.color.setRGB(0.6, 0.02, 0.01), 80); } }
  }
  _isCarrier(id) { return this.bomb.state === 'carried' && this.bomb.carrier === id; }

  // ─────────── 매 프레임 ───────────
  update(dt) {
    if (!this.active) return;
    if (this.client) return this._updateClient(dt);
    const G = this.G, P = G.player, I = G.input, B = this.bomb;
    this.t -= dt;
    for (const b of this.bots) if (b.alive) this._botTask(b, dt);
    if (this.phase === 'buy') {
      P.vel.set(0, P.vel.y, 0);                                     // 구매 단계: 진영 밖 이동 금지
      for (const b of this.bots) b.vel.set(0, 0, 0);
      if (I.take('buy')) this.openBuy(document.getElementById('buy').hidden);
      if (this.t <= 0) this._goLive();
      this._hud(); return;
    }
    if (this.phase === 'end') { if (this.t <= 0) this._nextOrFinish(); this._hud(); return; }

    // 사람의 폭탄 운반·설치·해체 (F 키 / 작업 버튼을 누르고 있기). 방장이 모든 사람에 대해 판정
    let actor = null, prog = -1;
    for (const h of this._humans()) {
      const e = h.ent; if (!e.alive) continue;
      const use = h.local ? I.use : !!this.useHeld.get(h.id);
      const pos = e.pos;
      if (this._isCarrier(h.id)) {
        const site = this._siteOf(pos);
        if (site && use) { B.plantT += dt; actor = h.id; prog = B.plantT / PLANT_T; if (h.local) P.vel.set(0, P.vel.y, 0); if (B.plantT >= PLANT_T) { this._plant(pos.clone(), h.id, site); break; } }
        else B.plantT = 0;
      }
      if (B.state === 'dropped' && h.team === this.attackers && pos.distanceTo(B.pos) < 1.3) { B.state = 'carried'; B.carrier = h.id; this._removeBomb(); this._feed(`${this.G.nameOf(h.id)} 폭탄 획득`); }
      if (B.state === 'planted' && h.team !== this.attackers && pos.distanceTo(B.pos) < 1.6) {
        if (use) { B.defuseT += dt; actor = h.id; prog = B.defuseT / DEFUSE_T; if (h.local) P.vel.set(0, P.vel.y, 0); if (B.defuseT >= DEFUSE_T) return this._endRound(1 - this.attackers, '폭탄 해체'); }
        else if (!this._botDefusing && actor === null) B.defuseT = 0;
      }
    }
    this._actor = actor; this._prog = prog;
    G.hud.setProgress(actor === this.me ? prog : -1, B.state === 'planted' ? '해체 중' : '설치 중');
    // 운반자 사망 → 폭탄 떨어뜨림
    if (B.state === 'carried' && B.carrier) {
      if (typeof B.carrier === 'object') { if (!B.carrier.alive) this._drop(B.carrier.pos); }
      else { const h = this._humans().find((x) => x.id === B.carrier); if (!h || !h.ent.alive) this._drop(h ? h.ent.pos : B.pos); }
    }
    // 설치된 폭탄 타이머
    if (B.state === 'planted') {
      B.timer -= dt;
      this._beep(dt);
      if (B.timer <= 0) {
        G.combat.explode(B.pos.clone().setY(0.6), { radius: 22, dmg: 600, owner: 'enemy', scale: 3 });
        for (const b of this.bots) if (b.alive && b.pos.distanceTo(B.pos) < 22) b.takeDamage(600, 'body', new THREE.Vector3(0, 1, 0), b.aimPoint(), 'world');
        if (this.mp) G.net.broadcast({ t: 'bexp', p: G.net.v3(B.pos) }); // 참가자는 자기 피해를 스스로 계산
        this._removeBomb();
        return this._endRound(this.attackers, '폭탄 폭발');
      }
    }
    // 승패 판정
    const atk = this._aliveOf(this.attackers), def = this._aliveOf(1 - this.attackers);
    if (def === 0) return this._endRound(this.attackers, '수비 전멸');
    if (atk === 0 && B.state !== 'planted') return this._endRound(1 - this.attackers, '공격 전멸');
    if (this.t <= 0 && B.state !== 'planted') return this._endRound(1 - this.attackers, '시간 종료');
    this._hud();
  }

  _aliveOf(team) { return this.bots.filter((b) => b.alive && b.team === team).length + this._humans().filter((h) => h.team === team && h.ent.alive).length; }

  _goLive() {
    this.phase = 'live'; this.t = LIVE_T; this.openBuy(false);
    const msg = (atk) => (atk ? `폭탄을 ${this.targetSite} 또는 다른 지점에 설치하세요` : '폭탄 설치를 막으세요');
    this.G.hud.banner('교전 개시', msg(this.playerTeam === this.attackers));
    if (this.mp) for (const h of this._humans()) if (!h.local) this.G.net.sendTo(h.id, { t: 'banner', h: '교전 개시', p: msg(h.team === this.attackers) });
  }

  _feed(txt) { this.G.hud.feed(txt, 0); if (this.mp) this.G.net.broadcast({ t: 'feed', txt, pts: 0 }); }

  _drop(pos) {
    const B = this.bomb; B.state = 'dropped'; B.carrier = null;
    B.pos.copy(pos); B.pos.y = this.G.world.groundAt(pos.x, pos.z, 0.2, pos.y + 1);
    const m = this._bombMesh(); m.position.copy(B.pos);
    this._feed('폭탄 떨어짐');
  }

  _plant(pos, who, site) {
    const G = this.G, B = this.bomb;
    B.state = 'planted'; B.site = site; B.timer = BOMB_T; B.carrier = null; B.pos.copy(pos); B.pos.y = G.world.groundAt(pos.x, pos.z, 0.2, pos.y + 1);
    const m = this._bombMesh(); m.position.copy(B.pos);
    this.t = BOMB_T;
    if (this.attackers === this.playerTeam) this.credits += 300;
    for (const r of this.roster) if (r.team === this.attackers) r.credits += 300;
    G.hud.banner('폭탄 설치됨', `${site} 지점 · ${BOMB_T}초`);
    G.audio.alert(B.pos.clone());
    if (this.mp) G.net.broadcast({ t: 'bplant', s: site, p: G.net.v3(B.pos) });
  }

  // 봇 임무: 공격 = 지점으로 이동·설치·폭탄 경계 / 수비 = 지점 방어 → 폭탄 해체
  _botTask(b, dt) {
    const G = this.G, B = this.bomb, S = G.world.sites;
    const atk = b.team === this.attackers;
    const idx = this.bots.indexOf(b);
    const jitter = (k) => new THREE.Vector3(Math.sin(idx * 2.1 + k) * 3, 0, Math.cos(idx * 1.7 + k) * 3);
    if (atk) {
      if (B.state === 'planted') b.task = B.pos.clone().add(jitter(1));
      else if (B.state === 'dropped') b.task = B.pos.clone();
      else if (B.state === 'carried' && typeof B.carrier === 'string') { // 사람이 폭탄을 들었으면 그 사람을 호위
        const h = this._humans().find((x) => x.id === B.carrier);
        b.task = h ? h.ent.pos.clone().add(jitter(3)) : S[this.targetSite].clone();
      } else b.task = S[this.targetSite].clone().add(B.carrier === b ? new THREE.Vector3() : jitter(0));
      if (B.state === 'dropped' && b.pos.distanceTo(B.pos) < 1.3) { B.state = 'carried'; B.carrier = b; this._removeBomb(); }
      if (B.state === 'carried' && B.carrier === b && this.phase === 'live') {
        const site = this._siteOf(b.pos);
        const threat = b.canSee && b.target && b.target.pos.distanceTo(b.pos) < 12; // 가까운 적이 없을 때만 설치
        if (site && !threat) { b.plantT += dt; b.vel.set(0, 0, 0); if (b.plantT >= PLANT_T) { b.plantT = 0; this._plant(b.pos.clone(), b, site); } }
        else b.plantT = 0;
      }
    } else {
      if (B.state === 'planted') {
        b.task = B.pos.clone();
        const near = this.bots.filter((x) => x.alive && x.team === b.team).sort((x, y) => x.pos.distanceTo(B.pos) - y.pos.distanceTo(B.pos))[0];
        const threat = b.canSee && b.target && b.target.pos.distanceTo(b.pos) < 12;
        if (near === b && b.pos.distanceTo(B.pos) < 1.6 && !threat) { this._botDefusing = true; B.defuseT += dt; b.vel.set(0, 0, 0); if (B.defuseT >= DEFUSE_T) this._endRound(1 - this.attackers, '폭탄 해체'); }
        else if (near === b) this._botDefusing = false;
      } else {
        const site = idx % 2 ? 'A' : 'B';
        b.task = S[site].clone().add(jitter(2));
      }
    }
  }

  // ─────────── 라운드 종료 ───────────
  _endRound(winner, reason) {
    if (this.phase === 'end') return;
    this.phase = 'end'; this.t = END_T;
    this.score[winner]++;
    const loser = 1 - winner;
    this.lossStreak[winner] = 0; this.lossStreak[loser] = Math.min(2, this.lossStreak[loser] + 1);
    const lossPay = 1900 + 500 * (this.lossStreak[loser] - 1);
    for (const r of this.roster) r.credits = Math.min(9000, r.credits + (r.team === winner ? 3000 : lossPay));
    for (const b of this.bots) if (!b.alive) { b.info.gun = 'p_engraved'; b.info.armor = 0; }
    if (this.mp) this.G.net.broadcast({ t: 'bend', w: winner, r: reason, sc: this.score, lp: lossPay });
    this._roundResult(winner, reason, lossPay);
  }

  // 나의 라운드 결과 처리 (방장·참가자 공통): 상금, 장비 유지/초기화, 알림
  _roundResult(winner, reason, lossPay) {
    const G = this.G, mine = winner === this.playerTeam;
    this.phase = 'end';
    this.credits = Math.min(9000, this.credits + (mine ? 3000 : lossPay));
    if (!G.player.alive) this.playerGun = { primary: null, secondary: 'p_engraved', armor: 0 };
    else this.playerGun.armor = 0;
    G.hud.banner(mine ? '라운드 승리' : '라운드 패배', `${reason} · ${this.score[this.playerTeam]} : ${this.score[1 - this.playerTeam]}`);
    G.audio.alert(G.camera.position.clone());
  }

  _nextOrFinish() {
    const G = this.G;
    if (this.score[0] >= WIN_ROUNDS || this.score[1] >= WIN_ROUNDS) {
      this.active = false;
      const res = this._results();
      if (this.mp) G.net.broadcast({ t: 'mend', ...res });
      G.matchEnd(res);
      this._clearBots(); this._removeBomb();
      return;
    }
    this.newRound();
  }

  _results() {
    const G = this.G, win = this.score[0] >= this.score[1] ? 0 : 1;
    if (!this.mp) return { mode: 'bomb', title: `${win === 0 ? '승리' : '패배'} · ${this.score[0]} : ${this.score[1]}`, players: [{ id: 'local', name: '나', team: 0, kills: this.kills || 0, deaths: this.deaths || 0 }], ts: this.score };
    const players = G.net.players.map((p) => ({ id: p.id, name: p.name, team: G.match.teamOf(p.id), ...G.match.stat(p.id) })).sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);
    return { mode: 'bomb', title: `${TEAM_NAMES[win]} 팀 승리 · ${this.score[0]} : ${this.score[1]}`, players, ts: this.score };
  }

  // 처치 보상 (각자 자기 돈) — 방장은 원격 처치자에게 'bcred' 로 알려 줌
  rewardKill(by) {
    if (by === this.me || by === 'local') { this.kills++; this.credits = Math.min(9000, this.credits + 200); return; }
    if (this.mp && typeof by === 'string' && this.G.net.mates.has(by)) this.G.net.sendTo(by, { t: 'bcred', a: 200, k: 1 });
  }
  onPlayerKill() { this.rewardKill(this.me); }
  onPlayerDeath() { this.deaths++; }

  // ─────────── 방장 → 참가자 상태 방송 (스냅샷에 포함) ───────────
  snap() {
    const B = this.bomb;
    const carrier = B.state === 'carried' ? (typeof B.carrier === 'string' ? B.carrier : B.carrier ? B.carrier.id : null) : null;
    return [this.phase === 'buy' ? 0 : this.phase === 'live' ? 1 : 2, r2(Math.max(0, this.t)), ['carried', 'dropped', 'planted'].indexOf(B.state), carrier, [r2(B.pos.x), r2(B.pos.y), r2(B.pos.z)], r2(B.timer), this.score, this._actor, r2(this._prog), this.attackers, this.round];
  }

  // ─────────── 참가자 ───────────
  applySnap(s) {
    if (!this.client || !s) return;
    const B = this.bomb, prevState = B.state;
    this.phase = ['buy', 'live', 'end'][s[0]]; this.t = s[1];
    B.state = ['carried', 'dropped', 'planted'][s[2]]; B.carrier = s[3]; B.pos.set(...s[4]); B.timer = s[5];
    this.score = s[6]; this._actor = s[7]; this._prog = s[8]; this.attackers = s[9]; this.round = s[10];
    if (B.state === 'dropped' || B.state === 'planted') { const m = this._bombMesh(); m.position.copy(B.pos); } else this._removeBomb();
    if (prevState === 'planted' && B.state !== 'planted') this._beepT = 0;
  }

  _updateClient(dt) {
    const G = this.G, P = G.player, I = G.input, B = this.bomb;
    if (this.phase === 'buy') {
      P.vel.set(0, P.vel.y, 0);
      if (I.take('buy')) this.openBuy(document.getElementById('buy').hidden);
    } else if (!document.getElementById('buy').hidden) this.openBuy(false);
    // 작업 키 상태를 방장에게 (바뀔 때만)
    const use = !!I.use && P.alive;
    if (use !== this._sentUse) { this._sentUse = use; G.net.sendHost({ t: 'buse', on: use ? 1 : 0 }); }
    const acting = this._actor === this.me && this._prog >= 0;
    if (acting) P.vel.set(0, P.vel.y, 0);
    G.hud.setProgress(acting ? this._prog : -1, B.state === 'planted' ? '해체 중' : '설치 중');
    if (B.state === 'planted') { B.timer = Math.max(0, B.timer - dt); this._beep(dt); }
    this._hud();
  }

  // 아군 관전 대상 (봇 또는 같은 편 사람)
  spectateTarget() {
    const G = this.G;
    const allyBots = (this.client ? G.enemies.list : this.bots).filter((b) => b.alive && b.team === this.playerTeam);
    if (allyBots.length) return allyBots[0];
    if (this.mp) for (const m of G.net.mates.values()) if (m.alive && m.avatar && this.teamOfHuman(m.id) === this.playerTeam) return m.avatar;
    return null;
  }

  _hud() {
    const G = this.G, B = this.bomb;
    const t = Math.max(0, Math.ceil(this.t)), mm = Math.floor(t / 60), ss = String(t % 60).padStart(2, '0');
    const role = this.playerTeam === this.attackers ? '공격' : '수비';
    const phase = this.phase === 'buy' ? '구매' : this.phase === 'end' ? '라운드 종료' : B.state === 'planted' ? `설치됨 ${Math.ceil(B.timer)}초` : '교전';
    const carry = this._isCarrier(this.me) ? ' · 💣 폭탄 소지 (지점에서 F 누르고 있기)' : '';
    const my = this.score[this.playerTeam] || 0, th = this.score[1 - this.playerTeam] || 0;
    const line = `폭파 작전 · 라운드 ${this.round} · 우리 팀(${role}) <b class="mine">${my}</b> : <b>${th}</b> 상대 · ${phase} ${this.phase === 'live' && B.state !== 'planted' ? `${mm}:${ss}` : ''} · ₩${this.credits.toLocaleString('ko-KR')}${carry}`;
    G.hud.setModeLine(line);
  }
}
