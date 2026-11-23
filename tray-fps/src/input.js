// 입력 — 모바일 터치(가상 조이스틱 + 드래그 시점 + 버튼)와 PC(WASD + 마우스 포인터 락)를 하나로 묶는다.
import { settings, IS_TOUCH } from './config.js';

export class Input {
  constructor(G) {
    this.G = G;
    this.move = { x: 0, y: 0 };      // x: 오른쪽+, y: 앞+
    this.lookX = 0; this.lookY = 0;  // 이번 프레임 누적 회전(라디안)
    this.fire = false;
    this.sprint = false;
    this.ads = false;
    this.crouch = false;
    this.edges = new Set();
    this.keys = new Set();
    this.pointers = new Map();       // pointerId → {role, x, y, ox, oy}
    this.locked = false;
    this.enabled = false;
    this.mouseFire = false;
    this.touchUsed = IS_TOUCH;

    this.joyBase = document.getElementById('joy-base');
    this.joyKnob = document.getElementById('joy-knob');
    this.layer = document.getElementById('touch-layer');

    this._bind();
  }

  take(name) { if (this.edges.has(name)) { this.edges.delete(name); return true; } return false; }

  reset() {
    this.move.x = this.move.y = 0; this.fire = false; this.fireHeld = 0; this.mouseFire = false; this.sprint = false;
    this.pointers.clear(); this.keys.clear(); this.edges.clear();
    this.joyBase.classList.remove('on');
    document.querySelectorAll('[data-act].held').forEach((b) => b.classList.remove('held'));
  }

  _touchSens() { return 0.0052 * settings.sens; }
  _mouseSens() { return 0.0021 * settings.sens; }

  _bind() {
    const L = this.layer;
    // ── 터치/포인터: 화면 영역 ──
    L.addEventListener('pointerdown', (e) => {
      if (!this.enabled) return;
      if (e.pointerType === 'mouse') { this._mouseDown(e); return; }
      this.touchUsed = true;
      e.preventDefault();
      const w = window.innerWidth;
      const hasMove = [...this.pointers.values()].some((p) => p.role === 'move');
      if (e.clientX < w * 0.42 && !hasMove) {
        const bx = Math.max(70, Math.min(e.clientX, w * 0.42 - 60)), by = Math.max(70, Math.min(e.clientY, window.innerHeight - 70));
        this.pointers.set(e.pointerId, { role: 'move', ox: bx, oy: by, x: e.clientX, y: e.clientY });
        this.joyBase.style.transform = `translate(${bx - 60}px, ${by - 60}px)`;
        this.joyBase.classList.add('on');
        this._updateJoy(e.clientX, e.clientY, bx, by);
      } else {
        this.pointers.set(e.pointerId, { role: 'look', x: e.clientX, y: e.clientY });
      }
    }, { passive: false });

    // ── 버튼 ──
    document.querySelectorAll('[data-act]').forEach((btn) => {
      btn.addEventListener('pointerdown', (e) => {
        if (!this.enabled) return;
        e.preventDefault(); e.stopPropagation();
        this.touchUsed = true;
        const act = btn.dataset.act;
        btn.classList.add('held');
        this.pointers.set(e.pointerId, { role: act === 'fire' ? 'fire' : 'btn', btn, x: e.clientX, y: e.clientY });
        this._action(act, true);
        if (this.G.settings.haptics && navigator.vibrate) try { navigator.vibrate(8); } catch (err) { /* 미지원 */ }
      }, { passive: false });
    });

    window.addEventListener('pointermove', (e) => {
      if (!this.enabled) return;
      const p = this.pointers.get(e.pointerId);
      if (p) {
        if (p.role === 'move') this._updateJoy(e.clientX, e.clientY, p.ox, p.oy);
        else if (p.role === 'look' || p.role === 'fire') {
          const s = this._touchSens();
          this.lookX += (e.clientX - p.x) * s;
          this.lookY += (e.clientY - p.y) * s * (settings.invertY ? -1 : 1);
        }
        p.x = e.clientX; p.y = e.clientY;
      }
    }, { passive: true });

    const up = (e) => {
      const p = this.pointers.get(e.pointerId);
      if (!p) { if (e.pointerType === 'mouse') this._mouseUp(e); return; }
      this.pointers.delete(e.pointerId);
      if (p.role === 'move') { this.move.x = this.move.y = 0; this.sprint = false; this.joyBase.classList.remove('on'); }
      if (p.btn) { p.btn.classList.remove('held'); this._action(p.btn.dataset.act, false); }
    };
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);

    // ── 마우스 (PC) ──
    document.addEventListener('mousemove', (e) => {
      if (!this.enabled) return;
      if (this.locked || this._dragLook) {
        const s = this._mouseSens();
        this.lookX += e.movementX * s;
        this.lookY += e.movementY * s * (settings.invertY ? -1 : 1);
      }
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === L;
      if (!this.locked && this.enabled && !this.touchUsed && this.G.state === 'playing') this.G.pause();
    });
    L.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('contextmenu', (e) => { if (this.enabled) e.preventDefault(); });

    // ── 키보드 ──
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      const k = e.code;
      if (k === 'Escape') { if (this.G.state === 'playing') this.G.pause(); else if (this.G.state === 'paused') this.G.resume(); return; }
      if (!this.enabled) return;
      this.keys.add(k);
      if (k === 'Space') { this.edges.add('jump'); e.preventDefault(); }
      if (k === 'KeyR') this.edges.add('reload');
      if (k === 'KeyG') this.edges.add('grenade');
      if (k === 'KeyQ' || k === 'Digit1' || k === 'Digit2') this.edges.add(k === 'Digit1' ? 'slot1' : k === 'Digit2' ? 'slot2' : 'swap');
      if (k === 'KeyC' || k === 'ControlLeft') this.crouch = !this.crouch;
      this._keysToMove();
    });
    window.addEventListener('keyup', (e) => { this.keys.delete(e.code); this._keysToMove(); });
    window.addEventListener('blur', () => { this.keys.clear(); this._keysToMove(); this.fire = false; this.mouseFire = false; });
    window.addEventListener('wheel', (e) => { if (this.enabled) this.edges.add('swap'); }, { passive: true });
  }

  _keysToMove() {
    if ([...this.pointers.values()].some((p) => p.role === 'move')) return;
    const K = this.keys;
    this.move.x = (K.has('KeyD') ? 1 : 0) - (K.has('KeyA') ? 1 : 0);
    this.move.y = (K.has('KeyW') ? 1 : 0) - (K.has('KeyS') ? 1 : 0);
    const l = Math.hypot(this.move.x, this.move.y); if (l > 1) { this.move.x /= l; this.move.y /= l; }
    this.sprint = K.has('ShiftLeft') && this.move.y > 0;
  }

  _mouseDown(e) {
    this.touchUsed = false;
    if (!this.locked) {
      const L = this.layer;
      try {
        const r = L.requestPointerLock && L.requestPointerLock();
        if (r && r.catch) r.catch(() => { this._noLock = true; });
      } catch (err) { this._noLock = true; }
      if (this._noLock && e.button === 2) this._dragLook = true;
      if (!this._noLock) return;
    }
    if (e.button === 0) { this.mouseFire = true; this.fire = true; }
    if (e.button === 2) this.ads = !this.ads;
  }

  _mouseUp(e) {
    if (e.button === 0) { this.mouseFire = false; this.fire = false; }
    if (e.button === 2) this._dragLook = false;
  }

  exitLock() { if (document.pointerLockElement) document.exitPointerLock(); }

  _updateJoy(x, y, ox, oy) {
    const R = 52;
    let dx = x - ox, dy = y - oy;
    const d = Math.hypot(dx, dy);
    if (d > R) { dx = dx / d * R; dy = dy / d * R; }
    this.joyKnob.style.transform = `translate(${dx}px, ${dy}px)`;
    const nx = dx / R, ny = -dy / R;
    const mag = Math.min(1, d / R);
    const dead = 0.12;
    const k = mag < dead ? 0 : (mag - dead) / (1 - dead) / (mag || 1);
    this.move.x = nx * k; this.move.y = ny * k;
    // 조이스틱을 위쪽 끝까지 밀면 자동 질주
    this.sprint = d > R * 1.35 && ny > 0.75;
    this.joyBase.classList.toggle('sprint', this.sprint);
  }

  _action(act, down) {
    switch (act) {
      case 'fire': this.fireHeld = Math.max(0, (this.fireHeld || 0) + (down ? 1 : -1)); this.fire = this.fireHeld > 0; break;
      case 'ads': if (down) this.ads = !this.ads; break;
      case 'crouch': if (down) this.crouch = !this.crouch; break;
      case 'jump': if (down) this.edges.add('jump'); break;
      case 'reload': if (down) this.edges.add('reload'); break;
      case 'swap': if (down) this.edges.add('swap'); break;
      case 'grenade': if (down) this.edges.add('grenade'); break;
      case 'pause': if (down) this.G.pause(); break;
    }
  }

  consumeLook() { const x = this.lookX, y = this.lookY; this.lookX = this.lookY = 0; return [x, y]; }
}
