// 폭파 작전 — 5대5 라운드제 (공격: 폭탄 설치 / 수비: 방어·해체), 구매·경제, 봇 AI
// 싱글 플레이: 사용자 1명 + 아군 봇 4명 vs 적 봇 5명. 7라운드 선승, 6라운드 후 공수 교대.
import * as THREE from 'three';
import { Enemy } from './enemies.js';
import { WEAPONS } from './weapons.js';

export const PRICES = {
  p_engraved: 0, p_deagle: 700, smg_mp5: 1500, smg_p90: 1700, sg_870: 1200, sg_benelli: 1800,
  rifle: 2900, ar_ar15: 2900, ar_aks: 2700, ar_ak47t: 2700, sr_m40: 4500, sr_l115: 5000, lmg_m249: 3200,
  armorL: 400, armorH: 1000, grenade: 300,
};
const BUY_T = 15, LIVE_T = 100, BOMB_T = 40, END_T = 5, PLANT_T = 4, DEFUSE_T = 7, WIN_ROUNDS = 7;
const ROLE = ['공격', '수비'];

// ── 봇: 실사 대원(Enemy 기반) + 팀 + 목표 행동 ──
class Bot extends Enemy {
  constructor(G, pos, team, info) {
    super(G, 'warden', pos, { id: info.id, variant: team === 0 ? 'swat' : 'tac_suit' });
    this.team = team; this.info = info; this.name = info.name;
    this.isBot = true; this.isLocal = false;
    this.T = { ...this.T, hp: 100, dmg: info.dmg, score: 0, name: info.name, acc: 0.38, range: 45 };
    this.hp = 100 + info.armor; this.gCool = Infinity; // 봇은 수류탄을 쓰지 않음 (아군 피해 방지)
    this.task = null; this.plantT = 0;
    if (this.visorMat) this.visorMat.color.setRGB(team === 0 ? 0.3 : 2.2, team === 0 ? 1.8 : 0.25, team === 0 ? 0.5 : 0.15); // 아군 초록 / 적 빨강 완장
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
  }

  start() {
    const G = this.G;
    this.active = true;
    this.round = 0; this.score = [0, 0]; // [아군, 적군]
    this.playerTeam = 0;                   // 아군 = 팀 0
    this.attackers = 0;                    // 공격하는 팀 번호 (6라운드 후 교대)
    this.credits = 800; this.lossStreak = [0, 0];
    this.roster = [];
    const names = [['알파-2', '알파-3', '알파-4', '알파-5'], ['적-1', '적-2', '적-3', '적-4', '적-5']];
    let id = 5000;
    for (const [team, list] of [[0, names[0]], [1, names[1]]]) for (const n of list) this.roster.push({ id: id++, team, name: n, credits: 800, gun: 'p_engraved', armor: 0, dmg: 6 });
    this.playerGun = { primary: null, secondary: 'p_engraved', armor: 0 };
    this.newRound();
  }

  stop() { this.active = false; this._clearBots(); this._removeBomb(); }

  // 상대 진영 전투원 목록 (사용자 + 봇)
  foesOf(team) {
    const out = [];
    const P = this.G.player;
    if (team !== this.playerTeam && P.alive) out.push(P);
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

  async newRound() {
    const G = this.G;
    this.round++;
    if (this.round === 7) { this.attackers = 1 - this.attackers; this.score.reverse ? null : null; G.hud.banner('공수 교대', '팀의 역할이 바뀝니다'); this.credits = 800; for (const r of this.roster) { r.credits = 800; r.gun = 'p_engraved'; r.armor = 0; } this.playerGun = { primary: null, secondary: 'p_engraved', armor: 0 }; }
    this.phase = 'buy'; this.t = BUY_T;
    this.bomb = { state: 'carried', carrier: null, pos: new THREE.Vector3(), plantT: 0, defuseT: 0, timer: BOMB_T, site: null };
    this._removeBomb();
    this._clearBots();
    // 봇 구매 & 생성
    G.enemies.clear(); G.enemies.dying = [];
    this.bots = [];
    let ai = 0, di = 0;
    for (const r of this.roster) {
      this._botBuy(r);
      const p = this.spawnPointFor(r.team, r.team === this.playerTeam ? ++ai : di++);
      const b = new Bot(G, p, r.team, r);
      b.yaw = r.team === this.attackers ? Math.PI : 0;
      G.enemies.list.push(b); G.enemies.byId.set(b.id, b);
      this.bots.push(b);
    }
    // 폭탄: 공격 팀 중 무작위(사용자가 공격이면 사용자가 우선)
    const atkBots = this.bots.filter((b) => b.team === this.attackers);
    if (this.attackers === this.playerTeam && Math.random() < 0.5) this.bomb.carrier = 'player';
    else this.bomb.carrier = atkBots[Math.floor(Math.random() * atkBots.length)] || 'player';
    // 공격 목표 지점, 수비 배치
    this.targetSite = Math.random() < 0.5 ? 'A' : 'B';
    // 사용자
    const P = G.player;
    P.spawn(this.spawnPointFor(this.playerTeam, 0), this.playerTeam === this.attackers ? 0 : Math.PI);
    P.maxHp = 100; P.hp = 100 + this.playerGun.armor;
    G.combat.playerGrenades = this.playerGun.grenade ? 1 : 0; this.playerGun.grenade = 0;
    await this._applyPlayerLoadout();
    G.hud.banner(`라운드 ${this.round}`, `${ROLE[this.playerTeam === this.attackers ? 0 : 1]} · 구매 단계 ${BUY_T}초 (B 키 / 구매 버튼)`);
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

  // ── 구매 메뉴 ──
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

  // ── 폭탄 ──
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

  // ── 매 프레임 ──
  update(dt) {
    if (!this.active) return;
    const G = this.G, P = G.player, I = G.input, B = this.bomb;
    this.t -= dt;
    // 봇 목표 갱신
    for (const b of this.bots) if (b.alive) this._botTask(b, dt);
    if (this.phase === 'buy') {
      // 구매 단계: 진영 밖 이동 금지
      P.vel.set(0, P.vel.y, 0);
      for (const b of this.bots) b.vel.set(0, 0, 0);
      if (I.take('buy')) this.openBuy(document.getElementById('buy').hidden);
      if (this.t <= 0) { this.phase = 'live'; this.t = LIVE_T; this.openBuy(false); G.hud.banner('교전 개시', this.playerTeam === this.attackers ? `폭탄을 ${this.targetSite === 'A' ? 'A' : 'B'} 또는 다른 지점에 설치하세요` : '폭탄 설치를 막으세요'); }
      this._hud();
      return;
    }
    if (this.phase === 'end') { if (this.t <= 0) this._nextOrFinish(); this._hud(); return; }

    // 사용자 폭탄 운반·설치·해체 (F 키 / 작업 버튼을 누르고 있기)
    const holdUse = I.use;
    let progress = -1;
    if (B.state === 'carried' && B.carrier === 'player' && P.alive) {
      const site = this._siteOf(P.pos);
      if (site && holdUse && P.grounded) { B.plantT += dt; progress = B.plantT / PLANT_T; P.vel.set(0, P.vel.y, 0); if (B.plantT >= PLANT_T) this._plant(P.pos.clone(), 'player', site); }
      else B.plantT = 0;
    }
    if (B.state === 'dropped' && this.playerTeam === this.attackers && P.alive && P.pos.distanceTo(B.pos) < 1.3) { B.state = 'carried'; B.carrier = 'player'; this._removeBomb(); G.hud.feed('폭탄 획득', 0); }
    if (B.state === 'planted' && this.playerTeam !== this.attackers && P.alive && P.pos.distanceTo(B.pos) < 1.6) {
      if (holdUse) { B.defuseT += dt; progress = B.defuseT / DEFUSE_T; P.vel.set(0, P.vel.y, 0); if (B.defuseT >= DEFUSE_T) return this._endRound(1 - this.attackers === this.playerTeam ? this.playerTeam : 1 - this.playerTeam, '폭탄 해체'); }
      else if (!this._botDefusing) B.defuseT = 0;
    }
    G.hud.setProgress(progress, B.state === 'planted' ? '해체 중' : '설치 중');
    // 운반자 사망 → 폭탄 떨어뜨림
    if (B.state === 'carried' && B.carrier !== 'player' && B.carrier && !B.carrier.alive) this._drop(B.carrier.pos);
    if (B.state === 'carried' && B.carrier === 'player' && !P.alive) this._drop(P.pos);
    // 설치된 폭탄 타이머
    if (B.state === 'planted') {
      B.timer -= dt;
      const rate = B.timer > 20 ? 1 : B.timer > 10 ? 0.5 : B.timer > 5 ? 0.25 : 0.12;
      this._beepT = (this._beepT || 0) - dt;
      if (this._beepT <= 0) { this._beepT = rate; G.audio.click(2600, 0, 0.35, 0.06, B.pos); this.ledMat.color.setRGB(6, 0.2, 0.1); setTimeout(() => this.ledMat && this.ledMat.color.setRGB(0.6, 0.02, 0.01), 80); }
      if (B.timer <= 0) { G.combat.explode(B.pos.clone().setY(0.6), { radius: 22, dmg: 600, owner: 'enemy', scale: 3 }); for (const b of this.bots) if (b.alive && b.pos.distanceTo(B.pos) < 22) b.takeDamage(600, 'body', new THREE.Vector3(0, 1, 0), b.aimPoint(), 'world'); this._removeBomb(); return this._endRound(this.attackers, '폭탄 폭발'); }
    }
    // 승패 판정
    const aliveOf = (team) => this.bots.filter((b) => b.alive && b.team === team).length + (team === this.playerTeam && P.alive ? 1 : 0);
    const atk = aliveOf(this.attackers), def = aliveOf(1 - this.attackers);
    if (def === 0) return this._endRound(this.attackers, '수비 전멸');
    if (atk === 0 && B.state !== 'planted') return this._endRound(1 - this.attackers, '공격 전멸');
    if (this.t <= 0 && B.state !== 'planted') return this._endRound(1 - this.attackers, '시간 종료');
    this._hud();
  }

  _drop(pos) {
    const B = this.bomb; B.state = 'dropped'; B.carrier = null;
    B.pos.copy(pos); B.pos.y = this.G.world.groundAt(pos.x, pos.z, 0.2, pos.y + 1);
    const m = this._bombMesh(); m.position.copy(B.pos);
    this.G.hud.feed('폭탄 떨어짐', 0);
  }

  _plant(pos, who, site) {
    const G = this.G, B = this.bomb;
    B.state = 'planted'; B.site = site; B.timer = BOMB_T; B.pos.copy(pos); B.pos.y = G.world.groundAt(pos.x, pos.z, 0.2, pos.y + 1);
    const m = this._bombMesh(); m.position.copy(B.pos);
    this.t = BOMB_T;
    if (this.attackers === this.playerTeam) this.credits += 300;
    for (const r of this.roster) if (r.team === this.attackers) r.credits += 300;
    G.hud.banner('폭탄 설치됨', `${site} 지점 · ${BOMB_T}초`);
    G.audio.alert(B.pos.clone());
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
      else b.task = S[this.targetSite].clone().add(B.carrier === b ? new THREE.Vector3() : jitter(0));
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
        // 가장 가까운 수비 봇이 해체
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

  _endRound(winner, reason) {
    if (this.phase === 'end') return;
    const G = this.G;
    this.phase = 'end'; this.t = END_T;
    const mine = winner === this.playerTeam;
    this.score[mine ? 0 : 1]++;
    // 경제
    const loser = 1 - winner;
    this.lossStreak[winner] = 0; this.lossStreak[loser] = Math.min(2, this.lossStreak[loser] + 1);
    const lossPay = 1900 + 500 * (this.lossStreak[loser] - 1);
    this.credits = Math.min(9000, this.credits + (mine ? 3000 : lossPay));
    for (const r of this.roster) r.credits = Math.min(9000, r.credits + (r.team === winner ? 3000 : lossPay));
    // 살아남은 봇은 무기 유지, 죽은 봇은 권총으로
    for (const b of this.bots) if (!b.alive) { b.info.gun = 'p_engraved'; b.info.armor = 0; }
    if (!G.player.alive) this.playerGun = { primary: null, secondary: 'p_engraved', armor: 0 };
    else this.playerGun.armor = 0;
    G.hud.banner(mine ? '라운드 승리' : '라운드 패배', `${reason} · ${this.score[0]} : ${this.score[1]}`);
    G.audio.alert(G.camera.position.clone());
  }

  _nextOrFinish() {
    const G = this.G;
    if (this.score[0] >= WIN_ROUNDS || this.score[1] >= WIN_ROUNDS) {
      this.active = false;
      const win = this.score[0] > this.score[1];
      G.matchEnd({ mode: 'bomb', title: `${win ? '승리' : '패배'} · ${this.score[0]} : ${this.score[1]}`, players: [{ id: 'local', name: '나', team: 0, kills: this.kills || 0, deaths: this.deaths || 0 }], ts: this.score });
      this._clearBots(); this._removeBomb();
      return;
    }
    this.newRound();
  }

  onPlayerKill(victim) { this.kills = (this.kills || 0) + 1; this.credits = Math.min(9000, this.credits + 200); }
  onPlayerDeath() { this.deaths = (this.deaths || 0) + 1; }

  _hud() {
    const G = this.G, B = this.bomb;
    const t = Math.max(0, Math.ceil(this.phase === 'planted' ? B.timer : this.t)), mm = Math.floor(t / 60), ss = String(t % 60).padStart(2, '0');
    const role = this.playerTeam === this.attackers ? '공격' : '수비';
    const phase = this.phase === 'buy' ? '구매' : this.phase === 'end' ? '라운드 종료' : B.state === 'planted' ? `설치됨 ${Math.ceil(B.timer)}초` : '교전';
    const carry = B.state === 'carried' && B.carrier === 'player' ? ' · 💣 폭탄 소지 (지점에서 F 누르고 있기)' : '';
    const line = `폭파 작전 · 라운드 ${this.round} · 아군(${role}) <b class="mine">${this.score[0]}</b> : <b>${this.score[1]}</b> 적군 · ${phase} ${this.phase === 'live' && B.state !== 'planted' ? `${mm}:${ss}` : ''} · ₩${this.credits.toLocaleString('ko-KR')}${carry}`;
    G.hud.setModeLine(line);
  }
}
