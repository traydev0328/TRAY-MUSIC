// 절차적 PBR 텍스처 생성기 — 외부 이미지 파일 없이 알베도/노멀/ORM(AO·거칠기·금속) 맵을 만든다.
import * as THREE from 'three';

const N = 512;

// ---------- 노이즈 기초 ----------
function hash(x, y, s) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(s | 0, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

// 타일링되는(주기적) 값 노이즈 한 옥타브를 out 에 더한다
function noiseLayer(out, size, fx, fy, amp, seed) {
  const lat = new Float32Array(fx * fy);
  for (let j = 0; j < fy; j++) for (let i = 0; i < fx; i++) lat[j * fx + i] = hash(i, j, seed);
  const sxArr = new Float32Array(size), x0Arr = new Int32Array(size), x1Arr = new Int32Array(size);
  for (let x = 0; x < size; x++) {
    const f = x / size * fx, i = Math.floor(f), t = f - i;
    sxArr[x] = t * t * (3 - 2 * t); x0Arr[x] = i % fx; x1Arr[x] = (i + 1) % fx;
  }
  for (let y = 0; y < size; y++) {
    const f = y / size * fy, j = Math.floor(f), t = f - j, sy = t * t * (3 - 2 * t);
    const r0 = (j % fy) * fx, r1 = ((j + 1) % fy) * fx;
    const row = y * size;
    for (let x = 0; x < size; x++) {
      const sx = sxArr[x], a = lat[r0 + x0Arr[x]], b = lat[r0 + x1Arr[x]], c = lat[r1 + x0Arr[x]], d = lat[r1 + x1Arr[x]];
      const top = a + (b - a) * sx, bot = c + (d - c) * sx;
      out[row + x] += (top + (bot - top) * sy) * amp;
    }
  }
}

export function fbm(size, fx, fy, octaves, seed, gain = 0.5) {
  const out = new Float32Array(size * size);
  let amp = 1, total = 0;
  for (let o = 0; o < octaves; o++) {
    const ffx = Math.min(size, fx << o), ffy = Math.min(size, fy << o);
    noiseLayer(out, size, ffx, ffy, amp, seed + o * 101);
    total += amp; amp *= gain;
  }
  for (let i = 0; i < out.length; i++) out[i] /= total;
  return out;
}

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const clamp01 = (v) => v < 0 ? 0 : v > 1 ? 1 : v;

function normalFromHeight(h, size, strength) {
  const out = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    const ym = ((y - 1 + size) % size) * size, yp = ((y + 1) % size) * size, row = y * size;
    for (let x = 0; x < size; x++) {
      const xm = (x - 1 + size) % size, xp = (x + 1) % size;
      const dx = (h[row + xp] - h[row + xm]) * strength;
      const dy = (h[yp + x] - h[ym + x]) * strength;
      const inv = 1 / Math.sqrt(dx * dx + dy * dy + 1);
      const i = (row + x) * 4;
      out[i] = (-dx * inv * 0.5 + 0.5) * 255;
      out[i + 1] = (-dy * inv * 0.5 + 0.5) * 255;
      out[i + 2] = (inv * 0.5 + 0.5) * 255;
      out[i + 3] = 255;
    }
  }
  return out;
}

function dataTex(data, size, srgb) {
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.flipY = false;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

function canvasTex(canvas, srgb) {
  const t = new THREE.CanvasTexture(canvas);
  t.flipY = false; // DataTexture 노멀/ORM 맵과 같은 방향(v=행 번호) 유지
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

function rgbaToCanvas(rgba, size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  img.data.set(rgba);
  ctx.putImageData(img, 0, 0);
  return c;
}

function packORM(size, ao, rough, metal) {
  const out = new Uint8Array(size * size * 4);
  for (let i = 0, n = size * size; i < n; i++) {
    out[i * 4] = clamp01(ao[i]) * 255;
    out[i * 4 + 1] = clamp01(rough[i]) * 255;
    out[i * 4 + 2] = clamp01(metal[i]) * 255;
    out[i * 4 + 3] = 255;
  }
  return out;
}

const srgbByte = (lin) => Math.round(Math.pow(clamp01(lin), 1 / 2.2) * 255);

// ---------- 재질별 생성기 ----------

// 콘크리트 (패널 이음선 옵션)
export function concrete(seed, { seams = 0, tint = [1, 1, 1], base = 0.42 } = {}) {
  const S = N;
  const big = fbm(S, 4, 4, 6, seed);
  const fine = fbm(S, 48, 48, 3, seed + 7);
  const pitN = fbm(S, 96, 96, 2, seed + 9);
  const crN = fbm(S, 6, 6, 5, seed + 3);
  const stain = fbm(S, 3, 3, 4, seed + 11);
  const streak = fbm(S, 24, 2, 3, seed + 13);
  const h = new Float32Array(S * S), rough = new Float32Array(S * S), ao = new Float32Array(S * S), metal = new Float32Array(S * S);
  const alb = new Uint8Array(S * S * 4);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = y * S + x;
    const pit = smooth(0.74, 0.82, pitN[i]);
    const ridge = 1 - Math.abs(2 * crN[i] - 1);
    const crack = smooth(0.965, 0.992, ridge);
    let seam = 0;
    if (seams > 0) {
      const sx = (x % (S / seams)), sy = (y % (S / seams));
      seam = Math.max(sx < 3 ? 1 : 0, sy < 3 ? 1 : 0);
    }
    h[i] = fine[i] * 0.5 + big[i] * 0.35 - pit * 0.35 - crack * 0.5 - seam * 0.9;
    const st = smooth(0.45, 0.75, stain[i]);
    const sk = smooth(0.5, 0.8, streak[i]) * (y / S);
    let v = base + (big[i] - 0.5) * 0.16 + (fine[i] - 0.5) * 0.1;
    v *= 1 - st * 0.38;
    v *= 1 - sk * 0.3;
    v *= 1 - crack * 0.45 - pit * 0.25 - seam * 0.5;
    alb[i * 4] = srgbByte(v * tint[0] * 0.55);
    alb[i * 4 + 1] = srgbByte(v * tint[1] * 0.54);
    alb[i * 4 + 2] = srgbByte(v * tint[2] * 0.52);
    alb[i * 4 + 3] = 255;
    rough[i] = 0.78 + fine[i] * 0.15 - st * 0.25; // 얼룩 부분은 젖어서 더 매끈
    ao[i] = 1 - crack * 0.6 - pit * 0.4 - seam * 0.5;
    metal[i] = 0;
  }
  return {
    map: dataTex(alb, S, true),
    normalMap: dataTex(normalFromHeight(h, S, 6), S, false),
    ormMap: dataTex(packORM(S, ao, rough, metal), S, false),
  };
}

// 젖은 아스팔트
export function asphalt(seed) {
  const S = N;
  const grain = fbm(S, 96, 96, 3, seed);
  const big = fbm(S, 4, 4, 5, seed + 5);
  const crN = fbm(S, 5, 5, 5, seed + 3);
  const patch = fbm(S, 3, 3, 3, seed + 21);
  const h = new Float32Array(S * S), rough = new Float32Array(S * S), ao = new Float32Array(S * S), metal = new Float32Array(S * S);
  const alb = new Uint8Array(S * S * 4);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = y * S + x;
    const sp = hash(x, y, seed) > 0.965 ? 1 : 0;
    const crack = smooth(0.975, 0.995, 1 - Math.abs(2 * crN[i] - 1));
    const pt = smooth(0.62, 0.66, patch[i]); // 보수 패치
    h[i] = grain[i] * 0.6 + sp * 0.35 - crack * 0.7;
    let v = 0.075 + grain[i] * 0.05 + sp * 0.09 + (big[i] - 0.5) * 0.035 - pt * 0.025;
    v *= 1 - crack * 0.5;
    alb[i * 4] = srgbByte(v);
    alb[i * 4 + 1] = srgbByte(v * 1.0);
    alb[i * 4 + 2] = srgbByte(v * 1.04);
    alb[i * 4 + 3] = 255;
    rough[i] = 0.55 + grain[i] * 0.25 - sp * 0.15;
    ao[i] = 1 - crack * 0.5;
    metal[i] = 0;
  }
  return {
    map: dataTex(alb, S, true),
    normalMap: dataTex(normalFromHeight(h, S, 5), S, false),
    ormMap: dataTex(packORM(S, ao, rough, metal), S, false),
  };
}

// 골판 금속(컨테이너/창고 외벽). colors 마다 알베도를 만들고, 높이·ORM 은 공유
export function corrugated(seed, colors, { ridges = 10, label = null, rustAmt = 1 } = {}) {
  const S = N;
  const dent = fbm(S, 4, 4, 4, seed);
  const rustN = fbm(S, 6, 6, 5, seed + 1);
  const drip = fbm(S, 40, 3, 3, seed + 2);
  const fine = fbm(S, 64, 64, 2, seed + 4);
  const h = new Float32Array(S * S), rough = new Float32Array(S * S), ao = new Float32Array(S * S), metal = new Float32Array(S * S);
  const rustMask = new Float32Array(S * S), dirt = new Float32Array(S * S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = y * S + x;
    const u = x / S * ridges;
    const wave = Math.max(-1, Math.min(1, Math.sin(u * Math.PI * 2) * 1.8));
    const vy = 1 - y / S; // v 가 작을수록(아래쪽) 녹이 많음
    // 녹: 아래쪽 가장자리와 흘러내린 자국 위주로, 넓은 면은 깨끗하게
    const r = smooth(0.7, 0.8, rustN[i] + vy * 0.18) * rustAmt + smooth(0.7, 0.85, drip[i]) * vy * vy * 0.7 * rustAmt;
    rustMask[i] = clamp01(r);
    dirt[i] = smooth(0.3, 0.9, drip[i]) * 0.35 + vy * 0.25;
    h[i] = wave * 0.5 + (dent[i] - 0.5) * 0.25 + rustMask[i] * fine[i] * 0.3;
    rough[i] = 0.42 + fine[i] * 0.12 + rustMask[i] * 0.45;
    metal[i] = 0.55 * (1 - rustMask[i]);
    ao[i] = 0.82 + wave * 0.12 - rustMask[i] * 0.1;
  }
  const normalMap = dataTex(normalFromHeight(h, S, 3.2), S, false);
  const ormMap = dataTex(packORM(S, ao, rough, metal), S, false);
  const maps = colors.map((col, ci) => {
    const alb = new Uint8Array(S * S * 4);
    for (let i = 0; i < S * S; i++) {
      const rm = rustMask[i];
      const rv = 0.5 + fine[i] * 0.5;
      const d = 1 - dirt[i];
      const r = (col[0] * d) * (1 - rm) + 0.22 * rv * rm;
      const g = (col[1] * d) * (1 - rm) + 0.09 * rv * rm;
      const b = (col[2] * d) * (1 - rm) + 0.035 * rv * rm;
      alb[i * 4] = srgbByte(r); alb[i * 4 + 1] = srgbByte(g); alb[i * 4 + 2] = srgbByte(b); alb[i * 4 + 3] = 255;
    }
    if (!label) return dataTex(alb, S, true);
    const c = rgbaToCanvas(alb, S);
    const ctx = c.getContext('2d');
    ctx.setTransform(1, 0, 0, -1, 0, S); // flipY=false 텍스처에서 글자가 바로 보이도록 상하 반전
    ctx.globalAlpha = 0.82;
    ctx.fillStyle = '#e8e6df';
    ctx.font = 'bold 30px "Arial Narrow", Arial, sans-serif';
    const code = `TRYU ${String(100000 + Math.floor(hash(ci, seed, 7) * 899999))} ${Math.floor(hash(ci, seed, 9) * 9)}`;
    ctx.fillText(code, 40, 70);
    ctx.font = 'bold 22px Arial, sans-serif';
    ctx.fillText('22G1', 40, 100);
    ctx.font = '16px Arial, sans-serif';
    ctx.fillText('MAX GROSS 30,480 KG', 40, 130);
    ctx.fillText('TARE      2,200 KG', 40, 150);
    ctx.globalAlpha = 1;
    return canvasTex(c, true);
  });
  return { maps, normalMap, ormMap };
}

// 도장된 군용 나무 상자
export function crateWood(seed) {
  const S = N;
  const grain = fbm(S, 3, 48, 4, seed);
  const wear = fbm(S, 8, 8, 5, seed + 3);
  const h = new Float32Array(S * S), rough = new Float32Array(S * S), ao = new Float32Array(S * S), metal = new Float32Array(S * S);
  const alb = new Uint8Array(S * S * 4);
  const planks = 6;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = y * S + x;
    const py = y % (S / planks);
    const gap = py < 4 ? 1 : 0;
    const frame = (x < 28 || x > S - 28) ? 1 : 0;
    const w = smooth(0.62, 0.72, wear[i]);
    const g = grain[i];
    h[i] = g * 0.3 - gap * 1.0 + frame * 0.4;
    // 올리브 드랍 도장 vs 드러난 나무
    const pr = 0.085 + g * 0.02, pg = 0.095 + g * 0.02, pb = 0.05;
    const wr = 0.32 + g * 0.18, wg = 0.2 + g * 0.1, wb = 0.1;
    let r = pr * (1 - w) + wr * w, gg = pg * (1 - w) + wg * w, b = pb * (1 - w) + wb * w;
    const s = 1 - gap * 0.7;
    alb[i * 4] = srgbByte(r * s); alb[i * 4 + 1] = srgbByte(gg * s); alb[i * 4 + 2] = srgbByte(b * s); alb[i * 4 + 3] = 255;
    rough[i] = 0.7 + w * 0.2;
    ao[i] = 1 - gap * 0.6;
    metal[i] = 0;
  }
  const c = rgbaToCanvas(alb, S);
  const ctx = c.getContext('2d');
  ctx.setTransform(1, 0, 0, -1, 0, S);
  ctx.globalAlpha = 0.75;
  ctx.fillStyle = '#d9d2b8';
  ctx.font = 'bold 54px Arial, sans-serif';
  ctx.fillText('TRAY ARMS', 90, 230);
  ctx.font = 'bold 30px Arial, sans-serif';
  ctx.fillText('CTG 5.56MM  1680 RDS', 90, 280);
  ctx.fillText('LOT TR-26-0328', 90, 320);
  ctx.globalAlpha = 1;
  return {
    map: canvasTex(c, true),
    normalMap: dataTex(normalFromHeight(h, S, 4), S, false),
    ormMap: dataTex(packORM(S, ao, rough, metal), S, false),
  };
}

// 작은 디테일 노멀 (무기/로봇 표면 미세 질감)
export function microDetail(seed) {
  const S = 256;
  const n = fbm(S, 32, 32, 3, seed);
  const scr = fbm(S, 2, 64, 2, seed + 4);
  const h = new Float32Array(S * S);
  for (let i = 0; i < S * S; i++) h[i] = n[i] * 0.4 + smooth(0.8, 0.9, scr[i]) * 0.3;
  return dataTex(normalFromHeight(h, S, 2.5), S, false);
}

// 물웅덩이 마스크(월드 스케일)
export function puddleMask(seed) {
  const S = 256;
  const n = fbm(S, 5, 5, 5, seed);
  const out = new Uint8Array(S * S * 4);
  for (let i = 0; i < S * S; i++) {
    const p = smooth(0.56, 0.64, n[i]);
    out[i * 4] = p * 255; out[i * 4 + 1] = smooth(0.48, 0.6, n[i]) * 255; out[i * 4 + 2] = 0; out[i * 4 + 3] = 255;
  }
  const t = dataTex(out, S, false);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

// 물 표면 노멀
export function waterNormal(seed) {
  const S = 256;
  const a = fbm(S, 8, 8, 4, seed), b = fbm(S, 16, 4, 3, seed + 3);
  const h = new Float32Array(S * S);
  for (let i = 0; i < S * S; i++) h[i] = a[i] * 0.6 + b[i] * 0.4;
  return dataTex(normalFromHeight(h, S, 4), S, false);
}

// 낡은 도로 페인트 알파
export function wornPaint(seed) {
  const S = 256;
  const n = fbm(S, 16, 16, 4, seed);
  const out = new Uint8Array(S * S * 4);
  for (let i = 0; i < S * S; i++) {
    const a = smooth(0.32, 0.5, n[i]);
    out[i * 4] = out[i * 4 + 1] = out[i * 4 + 2] = 255; out[i * 4 + 3] = a * 255;
  }
  return dataTex(out, S, false);
}

// 원경 빌딩 창문
export function windowsTex(seed) {
  const W = 256, H = 512;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  const cols = 8, rows = 24;
  for (let r = 0; r < rows; r++) for (let q = 0; q < cols; q++) {
    const v = hash(q, r, seed);
    if (v < 0.62) continue;
    const warm = hash(q, r, seed + 1) > 0.35;
    const k = 0.4 + hash(q, r, seed + 2) * 0.6;
    ctx.fillStyle = warm ? `rgba(255,${170 + k * 40 | 0},${90 + k * 40 | 0},${k})` : `rgba(150,${200 + k * 30 | 0},255,${k})`;
    ctx.fillRect(q * (W / cols) + 6, r * (H / rows) + 5, W / cols - 12, H / rows - 9);
  }
  const t = canvasTex(c, true);
  return t;
}

// ---------- 스프라이트/데칼 ----------
export function radialSprite(size, stops) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  stops.forEach(([o, col]) => g.addColorStop(o, col));
  ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function smokeSprite(seed) {
  const S = 128;
  const n = fbm(S, 4, 4, 4, seed);
  const c = document.createElement('canvas'); c.width = c.height = S;
  const ctx = c.getContext('2d'); const img = ctx.createImageData(S, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = y * S + x;
    const dx = x / S - 0.5, dy = y / S - 0.5, r = Math.sqrt(dx * dx + dy * dy) * 2;
    const a = clamp01(1 - r) ** 1.5 * (0.45 + n[i] * 0.8);
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = 255; img.data[i * 4 + 3] = clamp01(a) * 255;
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); return t;
}

export function flashSprite() {
  const S = 128;
  const c = document.createElement('canvas'); c.width = c.height = S;
  const ctx = c.getContext('2d');
  ctx.translate(S / 2, S / 2);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, S / 2);
  g.addColorStop(0, 'rgba(255,255,240,1)'); g.addColorStop(0.15, 'rgba(255,210,120,0.95)'); g.addColorStop(0.45, 'rgba(255,120,30,0.35)'); g.addColorStop(1, 'rgba(255,80,0,0)');
  ctx.fillStyle = g;
  for (let k = 0; k < 6; k++) {
    ctx.rotate(Math.PI / 3);
    ctx.beginPath(); ctx.moveTo(0, -5); ctx.lineTo(S * 0.48, 0); ctx.lineTo(0, 5); ctx.fill();
  }
  ctx.beginPath(); ctx.arc(0, 0, S * 0.22, 0, Math.PI * 2); ctx.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function bulletHole() {
  const S = 64;
  const c = document.createElement('canvas'); c.width = c.height = S;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(5,5,5,1)'); g.addColorStop(0.18, 'rgba(10,10,10,0.95)'); g.addColorStop(0.3, 'rgba(40,38,35,0.6)'); g.addColorStop(0.7, 'rgba(60,55,50,0.15)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);
  ctx.strokeStyle = 'rgba(20,20,20,0.6)'; ctx.lineWidth = 1;
  for (let k = 0; k < 7; k++) {
    const a = k / 7 * Math.PI * 2 + hash(k, 1, 3);
    ctx.beginPath(); ctx.moveTo(S / 2, S / 2); ctx.lineTo(S / 2 + Math.cos(a) * S * 0.36, S / 2 + Math.sin(a) * S * 0.36); ctx.stroke();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
