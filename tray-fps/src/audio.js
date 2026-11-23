// WebAudio 실시간 합성 사운드 — 음원 파일 없이 총성/잔향/빗소리/천둥을 만든다.
export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.ready = false;
    this.volume = 0.8;
  }

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain();
    this.master.gain.value = this.volume;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4; comp.attack.value = 0.003; comp.release.value = 0.2;
    this.master.connect(comp); comp.connect(ctx.destination);

    // 공용 노이즈 버퍼
    const len = ctx.sampleRate * 2;
    this.white = ctx.createBuffer(1, len, ctx.sampleRate);
    const w = this.white.getChannelData(0);
    for (let i = 0; i < len; i++) w[i] = Math.random() * 2 - 1;
    this.brown = ctx.createBuffer(1, len, ctx.sampleRate);
    const b = this.brown.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; b[i] = last * 3.5; }

    // 야외 잔향(컨볼루션) — 지수 감쇠 노이즈 임펄스 응답
    this.reverb = ctx.createConvolver();
    const irLen = ctx.sampleRate * 2.2;
    const ir = ctx.createBuffer(2, irLen, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c);
      for (let i = 0; i < irLen; i++) {
        const t = i / ctx.sampleRate;
        const early = (t > 0.03 && t < 0.035) || (t > 0.11 && t < 0.115) ? 0.6 : 0;
        d[i] = ((Math.random() * 2 - 1) * Math.exp(-t * 2.6) + early * (Math.random() - 0.5)) * 0.6;
      }
    }
    this.reverb.buffer = ir;
    this.reverbGain = ctx.createGain(); this.reverbGain.gain.value = 0.32;
    this.reverb.connect(this.reverbGain); this.reverbGain.connect(this.master);

    this.listener = ctx.listener;
    this._startAmbience();
    this.ready = true;
  }

  setVolume(v) { this.volume = v; if (this.master) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05); }

  updateListener(cam) {
    if (!this.ready) return;
    const l = this.listener, p = cam.position;
    const f = cam.getWorldDirection(this._f || (this._f = cam.position.clone()));
    const t = this.ctx.currentTime;
    if (l.positionX) {
      l.positionX.setTargetAtTime(p.x, t, 0.02); l.positionY.setTargetAtTime(p.y, t, 0.02); l.positionZ.setTargetAtTime(p.z, t, 0.02);
      l.forwardX.setTargetAtTime(f.x, t, 0.02); l.forwardY.setTargetAtTime(f.y, t, 0.02); l.forwardZ.setTargetAtTime(f.z, t, 0.02);
      l.upX.value = 0; l.upY.value = 1; l.upZ.value = 0;
    } else if (l.setPosition) {
      l.setPosition(p.x, p.y, p.z); l.setOrientation(f.x, f.y, f.z, 0, 1, 0);
    }
  }

  _noise(buf = this.white, offset = Math.random() * 1.5) {
    const s = this.ctx.createBufferSource(); s.buffer = buf; s._off = offset; return s;
  }

  _panner(pos) {
    const p = this.ctx.createPanner();
    p.panningModel = 'HRTF'; p.distanceModel = 'inverse'; p.refDistance = 4; p.maxDistance = 200; p.rolloffFactor = 1.1;
    if (p.positionX) { p.positionX.value = pos.x; p.positionY.value = pos.y; p.positionZ.value = pos.z; } else p.setPosition(pos.x, pos.y, pos.z);
    return p;
  }

  // 출력 노드: pos 가 있으면 3D 패너, 없으면 마스터 직결. 잔향 send 포함
  _out(pos, wet = 0.5) {
    const g = this.ctx.createGain();
    let head = g;
    if (pos) { const p = this._panner(pos); g.connect(p); p.connect(this.master); const s = this.ctx.createGain(); s.gain.value = wet; p.connect(s); s.connect(this.reverb); }
    else { g.connect(this.master); const s = this.ctx.createGain(); s.gain.value = wet; g.connect(s); s.connect(this.reverb); }
    return head;
  }

  gunshot(kind = 'rifle', pos = null, gainMul = 1) {
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const heavy = kind === 'shotgun' || kind === 'heavy';
    const out = this._out(pos, kind === 'enemy' || kind === 'heavy' ? 0.7 : 0.55);
    out.gain.value = gainMul * (pos ? 1.6 : 1);

    // 1) 날카로운 크랙
    const n1 = this._noise(); const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = kind === 'enemy' ? 1800 : 2500;
    const g1 = ctx.createGain(); g1.gain.setValueAtTime(heavy ? 0.9 : 0.75, t); g1.gain.exponentialRampToValueAtTime(0.001, t + (heavy ? 0.07 : 0.045));
    n1.connect(hp); hp.connect(g1); g1.connect(out); n1.start(t, n1._off, 0.12);

    // 2) 몸통 (저역 노이즈)
    const n2 = this._noise(); const lp = ctx.createBiquadFilter(); lp.type = 'lowpass';
    lp.frequency.setValueAtTime(heavy ? 2200 : 3200, t); lp.frequency.exponentialRampToValueAtTime(300, t + 0.25);
    const g2 = ctx.createGain(); g2.gain.setValueAtTime(heavy ? 1.2 : 0.9, t); g2.gain.exponentialRampToValueAtTime(0.001, t + (heavy ? 0.45 : 0.26));
    n2.connect(lp); lp.connect(g2); g2.connect(out); n2.start(t, n2._off, 0.6);

    // 3) 서브 저음 펀치
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(heavy ? 95 : 130, t); o.frequency.exponentialRampToValueAtTime(38, t + 0.16);
    const g3 = ctx.createGain(); g3.gain.setValueAtTime(heavy ? 1.1 : 0.8, t); g3.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    o.connect(g3); g3.connect(out); o.start(t); o.stop(t + 0.22);

    // 4) 기계음 (볼트)
    if (!pos) {
      const n4 = this._noise(); const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 4200; bp.Q.value = 6;
      const g4 = ctx.createGain(); g4.gain.setValueAtTime(0.0001, t + 0.035); g4.gain.linearRampToValueAtTime(0.18, t + 0.04); g4.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
      n4.connect(bp); bp.connect(g4); g4.connect(out); n4.start(t, n4._off, 0.1);
    }
  }

  click(freq = 3000, when = 0, vol = 0.25, dur = 0.03, pos = null) {
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime + when;
    const out = this._out(pos, 0.15);
    const n = this._noise(); const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = freq; bp.Q.value = 3;
    const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    n.connect(bp); bp.connect(g); g.connect(out); n.start(t, n._off, dur + 0.02);
  }

  reload(kind) {
    if (kind === 'shotgun') {
      for (let i = 0; i < 4; i++) { this.click(2200, 0.35 + i * 0.45, 0.25, 0.05); this.click(900, 0.4 + i * 0.45, 0.2, 0.06); }
      this.click(1500, 2.35, 0.35, 0.08); this.click(800, 2.5, 0.35, 0.08);
    } else {
      this.click(1400, 0.45, 0.3, 0.06);  // 탄창 분리
      this.click(700, 0.5, 0.2, 0.08);
      this.click(1800, 1.25, 0.35, 0.05); // 탄창 삽입
      this.click(900, 1.28, 0.3, 0.07);
      this.click(3200, 1.75, 0.3, 0.04);  // 장전 손잡이
      this.click(1200, 1.82, 0.3, 0.06);
    }
  }

  dryFire() { this.click(3800, 0, 0.3, 0.025); }
  swap() { this.click(1600, 0.05, 0.2, 0.05); this.click(900, 0.25, 0.2, 0.06); }

  hitmarker(kill = false, head = false) {
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = head ? 2400 : kill ? 1300 : 1900;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.12, t); g.gain.exponentialRampToValueAtTime(0.001, t + (kill ? 0.18 : 0.06));
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + 0.2);
  }

  impact(pos, surface) {
    if (!this.ready) return;
    const metal = surface === 'metal';
    this.click(metal ? 4200 + Math.random() * 1500 : 1500 + Math.random() * 600, 0, metal ? 0.35 : 0.25, metal ? 0.12 : 0.05, pos);
  }

  ricochetNear() { this.click(5200, 0, 0.18, 0.12); }

  playerHit() {
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.25);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.7, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + 0.32);
    const n = this._noise(); const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 600;
    const g2 = ctx.createGain(); g2.gain.setValueAtTime(0.4, t); g2.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    n.connect(lp); lp.connect(g2); g2.connect(this.master); n.start(t, n._off, 0.2);
  }

  heartbeat() {
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime;
    for (const d of [0, 0.22]) {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(60, t + d); o.frequency.exponentialRampToValueAtTime(35, t + d + 0.12);
      const g = ctx.createGain(); g.gain.setValueAtTime(0.5, t + d); g.gain.exponentialRampToValueAtTime(0.001, t + d + 0.15);
      o.connect(g); g.connect(this.master); o.start(t + d); o.stop(t + d + 0.16);
    }
  }

  footstep(run) {
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const n = this._noise(); const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 500 + Math.random() * 300; bp.Q.value = 1.2;
    const g = ctx.createGain(); g.gain.setValueAtTime(run ? 0.22 : 0.14, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
    n.connect(bp); bp.connect(g); g.connect(this.master); n.start(t, n._off, 0.1);
    // 젖은 바닥 물 튀김
    const n2 = this._noise(); const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 3500;
    const g2 = ctx.createGain(); g2.gain.setValueAtTime(0.0001, t); g2.gain.linearRampToValueAtTime(run ? 0.09 : 0.05, t + 0.02); g2.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    n2.connect(hp); hp.connect(g2); g2.connect(this.master); n2.start(t, n2._off, 0.18);
  }

  land() { this.click(300, 0, 0.5, 0.12); this.footstep(true); }

  explosion(pos) {
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const out = this._out(pos, 0.9); out.gain.value = 2.2;
    const n = this._noise(this.brown); const lp = ctx.createBiquadFilter(); lp.type = 'lowpass';
    lp.frequency.setValueAtTime(3000, t); lp.frequency.exponentialRampToValueAtTime(120, t + 1.2);
    const g = ctx.createGain(); g.gain.setValueAtTime(1.4, t); g.gain.exponentialRampToValueAtTime(0.001, t + 1.5);
    n.connect(lp); lp.connect(g); g.connect(out); n.start(t, n._off, 1.6);
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(70, t); o.frequency.exponentialRampToValueAtTime(25, t + 0.6);
    const g2 = ctx.createGain(); g2.gain.setValueAtTime(1.2, t); g2.gain.exponentialRampToValueAtTime(0.001, t + 0.7);
    o.connect(g2); g2.connect(out); o.start(t); o.stop(t + 0.72);
  }

  alert(pos) { // 적 발견 신호음
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const out = this._out(pos, 0.3); out.gain.value = 0.6;
    for (const [d, f] of [[0, 1400], [0.09, 1900]]) {
      const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = f;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2500;
      const g = ctx.createGain(); g.gain.setValueAtTime(0.08, t + d); g.gain.exponentialRampToValueAtTime(0.001, t + d + 0.08);
      o.connect(lp); lp.connect(g); g.connect(out); o.start(t + d); o.stop(t + d + 0.09);
    }
  }

  pickup() {
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime;
    [880, 1320].forEach((f, k) => {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
      const g = ctx.createGain(); g.gain.setValueAtTime(0.12, t + k * 0.07); g.gain.exponentialRampToValueAtTime(0.001, t + k * 0.07 + 0.15);
      o.connect(g); g.connect(this.master); o.start(t + k * 0.07); o.stop(t + k * 0.07 + 0.16);
    });
  }

  // 드론 로터 소리(지속)
  droneLoop(pos) {
    if (!this.ready) return null;
    const ctx = this.ctx;
    const p = this._panner(pos); p.refDistance = 3;
    const g = ctx.createGain(); g.gain.value = 0.0;
    const o1 = ctx.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = 118;
    const o2 = ctx.createOscillator(); o2.type = 'sawtooth'; o2.frequency.value = 123;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
    o1.connect(lp); o2.connect(lp); lp.connect(g); g.connect(p); p.connect(this.master);
    o1.start(); o2.start();
    g.gain.setTargetAtTime(0.06, ctx.currentTime, 0.3);
    return {
      update(pp) { if (p.positionX) { p.positionX.value = pp.x; p.positionY.value = pp.y; p.positionZ.value = pp.z; } else p.setPosition(pp.x, pp.y, pp.z); },
      stop() { try { g.gain.setTargetAtTime(0, ctx.currentTime, 0.05); o1.stop(ctx.currentTime + 0.3); o2.stop(ctx.currentTime + 0.3); } catch (e) { /* 이미 정지 */ } },
    };
  }

  _startAmbience() {
    const ctx = this.ctx;
    // 빗소리: 핑크톤 노이즈 두 겹
    const rain = this._noise(); rain.loop = true;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 900;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 7000;
    const g = ctx.createGain(); g.gain.value = 0.11;
    rain.connect(hp); hp.connect(lp); lp.connect(g); g.connect(this.master); rain.start();
    const rumble = this._noise(this.brown); rumble.loop = true;
    const lp2 = ctx.createBiquadFilter(); lp2.type = 'lowpass'; lp2.frequency.value = 400;
    const g2 = ctx.createGain(); g2.gain.value = 0.12;
    rumble.connect(lp2); lp2.connect(g2); g2.connect(this.master); rumble.start();
    this.rainGain = g;
  }

  thunder(delay = 1.5, power = 1) {
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime + delay;
    const n = this._noise(this.brown); const lp = ctx.createBiquadFilter(); lp.type = 'lowpass';
    lp.frequency.setValueAtTime(900, t); lp.frequency.exponentialRampToValueAtTime(80, t + 4);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(1.2 * power, t + 0.15);
    g.gain.exponentialRampToValueAtTime(0.4 * power, t + 1.2); g.gain.exponentialRampToValueAtTime(0.001, t + 4.5);
    n.connect(lp); lp.connect(g); g.connect(this.master);
    const s = ctx.createGain(); s.gain.value = 0.5; g.connect(s); s.connect(this.reverb);
    n.loop = true; // 2초 버퍼를 반복해 4.6초 길이로 사용
    n.start(t, Math.random()); n.stop(t + 4.6);
  }
}
