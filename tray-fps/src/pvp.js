// 대전 규칙 — 협동(coop) / 팀 대전(tdm) / 개인전(ffa)
// 점수·승패·제한 시간은 방장이 판정하고, 각 플레이어는 자기 체력과 재투입을 직접 처리한다.
import * as THREE from 'three';

export const MODES = {
  coop: { name: '협동 웨이브' },
  tdm: { name: '팀 대전', limit: 30, time: 480 },
  ffa: { name: '개인전', limit: 15, time: 480 },
  bomb: { name: '폭파 작전' },
};
export const TEAM_NAMES = ['알파', '브라보'];
const RESPAWN_DELAY = 4;
const PROTECT = 2;
// 고정 보급품 위치 (가져가면 25초 후 다시 생김)
const PICKUP_SPOTS = [[-12, 30, 'med'], [20, 6, 'ammo'], [-31, 4, 'ammo'], [6, -30, 'med'], [40, 30, 'med'], [-46, 40, 'ammo'], [0, 8, 'ammo'], [26, -24, 'med']];

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export class Match {
  constructor(G) { this.G = G; this.reset('coop'); }

  get pvp() { return this.mode !== 'coop'; }
  get me() { return this.G.net.active ? this.G.net.myId : 'local'; }

  reset(mode, teams) {
    this.mode = MODES[mode] ? mode : 'coop';
    this.teams = new Map(teams || []);
    this.stats = new Map();
    this.teamScore = [0, 0];
    this.timeLeft = MODES[this.mode].time || 0;
    this.over = false;
    this.respawnT = -1;
    this.spots = PICKUP_SPOTS.map(([x, z, k]) => ({ x, z, k, id: null, t: 0.5 }));
  }

  teamOf(id) { return this.teams.get(id) ?? 0; }
  isEnemy(id) {
    if (!this.pvp || id === this.me) return false;
    if (this.mode === 'ffa') return true;
    return this.teamOf(id) !== this.teamOf(this.me);
  }
  friendlyFire(owner) { return (this.mode === 'tdm' || this.mode === 'bomb') && owner !== this.me && this.teams.has(owner) && this.teamOf(owner) === this.teamOf(this.me); }
  stat(id) { let s = this.stats.get(id); if (!s) { s = { kills: 0, deaths: 0 }; this.stats.set(id, s); } return s; }

  // ── 방장: 처치 기록 ──
  recordKill(victim, killer) {
    const G = this.G;
    if (this.over) return;
    this.stat(victim).deaths++;
    const valid = killer && killer !== victim && killer !== 'world' && killer !== 'enemy';
    if (valid) { this.stat(killer).kills++; if (this.mode === 'tdm') this.teamScore[this.teamOf(killer)]++; }
    if (this.mode === 'bomb') { const txt = `${valid ? (G.nameOf(killer) === '대원' && G.enemies.byId.get(killer) ? G.enemies.byId.get(killer).name : G.nameOf(killer)) : '폭발'} ▸ ${G.nameOf(victim)}`; G.hud.feed(txt, 0); G.net.broadcast({ t: 'feed', txt, pts: 0 }); this.broadcastScore(); return; }
    const txt = valid ? `${G.nameOf(killer)} ▸ ${G.nameOf(victim)}` : `${G.nameOf(victim)} 자폭`;
    G.hud.feed(txt, 0);
    G.net.broadcast({ t: 'feed', txt, pts: 0 });
    this.broadcastScore();
    const limit = MODES[this.mode].limit;
    if (this.mode === 'tdm' && Math.max(...this.teamScore) >= limit) this.end();
    if (this.mode === 'ffa' && valid && this.stat(killer).kills >= limit) this.end();
  }

  broadcastScore() {
    if (!this.G.net.isHost) return;
    this.G.net.broadcast({ t: 'pscore', st: [...this.stats], ts: this.teamScore });
  }
  applyScore(m) { this.stats = new Map(m.st); this.teamScore = m.ts; }

  // ── 재투입 지점: 적과 멀고 적에게 보이지 않는 곳 ──
  spawnPoint() {
    const G = this.G, W = G.world;
    const cands = this.mode === 'tdm' ? W.teamSpawns[this.teamOf(this.me)] : W.ffaSpawns;
    const foes = [...G.net.mates.values()].filter((m) => m.alive && this.isEnemy(m.id));
    let best = cands[0], bs = -Infinity;
    for (const c of cands) {
      let s = Math.random() * 4;
      for (const f of foes) {
        const d = c.distanceTo(f.pos);
        s += Math.min(d, 40);
        if (d < 45 && W.lineOfSight(new THREE.Vector3(c.x, 1.6, c.z), f.eye)) s -= 35;
      }
      if (s > bs) { bs = s; best = c; }
    }
    return W.randomWalkableNear(best, 1.5);
  }

  respawn() {
    const G = this.G, P = G.player;
    const p = this.spawnPoint();
    const yaw = Math.atan2(p.x, p.z); // 맵 중앙을 바라봄
    P.spawn(p, yaw);
    P.protectT = PROTECT;
    G.weapons.reset();
    G.combat.playerGrenades = 2;
    this.respawnT = -1;
  }

  onLocalDeath() { this.respawnT = RESPAWN_DELAY; }

  update(dt) {
    const G = this.G;
    if (!this.pvp || G.state !== 'playing') return;
    // 재투입 카운트다운
    if (!G.player.alive && this.respawnT >= 0) {
      this.respawnT -= dt;
      G.hud.setDown(`${Math.max(1, Math.ceil(this.respawnT))}초 후 재투입`);
      if (this.respawnT <= 0) this.respawn();
    }
    if (!G.net.isHost || this.mode === 'bomb') return; // 폭파 작전은 라운드·시간을 BombMode 가 관리
    if (!this.over) { this.timeLeft -= dt; if (this.timeLeft <= 0) { this.timeLeft = 0; this.end(); } }
    // 고정 보급품 재생성
    for (const s of this.spots) {
      if (s.id !== null && !G.pickups.list.some((p) => p.id === s.id)) { s.id = null; s.t = 25; }
      if (s.id === null) { s.t -= dt; if (s.t <= 0) s.id = G.pickups.spawnFixed(s.k, new THREE.Vector3(s.x, 0, s.z)); }
    }
  }

  // ── 경기 종료 (방장) ──
  end() {
    if (this.over) return;
    this.over = true;
    const res = this.results();
    this.G.net.broadcast({ t: 'mend', ...res });
    this.G.matchEnd(res);
  }

  results() {
    const G = this.G;
    const players = G.net.players.map((p) => ({ id: p.id, name: p.name, team: this.teamOf(p.id), ...this.stat(p.id) }))
      .sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);
    let title;
    if (this.mode === 'tdm') {
      const [a, b] = this.teamScore;
      title = a === b ? `무승부 · ${a} : ${b}` : `${TEAM_NAMES[a > b ? 0 : 1]} 팀 승리 · ${a} : ${b}`;
    } else title = players.length ? `1위 · ${players[0].name} (${players[0].kills}킬)` : '경기 종료';
    return { mode: this.mode, title, players, ts: this.teamScore };
  }

  hudLine() {
    const t = Math.max(0, Math.ceil(this.timeLeft)), mm = Math.floor(t / 60), ss = String(t % 60).padStart(2, '0');
    if (this.mode === 'tdm') {
      const my = this.teamOf(this.me);
      return `${MODES.tdm.name} · <b class="${my === 0 ? 'mine' : ''}">${TEAM_NAMES[0]} ${this.teamScore[0]}</b> : <b class="${my === 1 ? 'mine' : ''}">${this.teamScore[1]} ${TEAM_NAMES[1]}</b> · ${mm}:${ss} · 목표 ${MODES.tdm.limit}`;
    }
    const arr = [...this.stats].sort((a, b) => b[1].kills - a[1].kills);
    const top = arr[0];
    const mine = this.stat(this.me).kills;
    return `${MODES.ffa.name} · 1위 <b>${top && top[1].kills > 0 ? esc(this.G.nameOf(top[0])) + ' ' + top[1].kills : '-'}</b> · 나 <b class="mine">${mine}</b> · ${mm}:${ss} · 목표 ${MODES.ffa.limit}`;
  }
}
