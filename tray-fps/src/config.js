// TRAY BLACK RAIN — 설정 / 그래픽 프리셋
// 그래픽은 프리셋(낮음~울트라)으로 한 번에 고르거나, 항목별로 바꾸면 '사용자 지정'이 된다.
export const GFX_PRESETS = {
  low:    { name: '낮음',   renderScale: 0.75, shadows: 0, aa: 'fxaa', ao: false, bloom: false, aniso: 2,  viewDist: 0.7, grain: false, ca: false, vignette: true, rain: 0.25, lamps: false, detail: false },
  medium: { name: '중간',   renderScale: 1.0,  shadows: 1, aa: 'fxaa', ao: false, bloom: true,  aniso: 4,  viewDist: 0.9, grain: true,  ca: false, vignette: true, rain: 0.45, lamps: true, detail: true },
  high:   { name: '높음',   renderScale: 1.5,  shadows: 2, aa: 'fxaa', ao: false, bloom: true,  aniso: 8,  viewDist: 1.0, grain: true,  ca: true,  vignette: true, rain: 0.7,  lamps: true, detail: true },
  ultra:  { name: '울트라', renderScale: 2.0,  shadows: 3, aa: 'msaa', ao: true,  bloom: true,  aniso: 16, viewDist: 1.25, grain: true, ca: true,  vignette: true, rain: 1.0,  lamps: true, detail: true },
  max:    { name: '최대',   renderScale: 2.5,  shadows: 4, aa: 'msaa', ao: true,  bloom: true,  aniso: 16, viewDist: 1.5, grain: true,  ca: true,  vignette: true, rain: 1.0,  lamps: true, detail: true },
};
export const GFX_KEYS = ['renderScale', 'shadows', 'aa', 'ao', 'bloom', 'aniso', 'viewDist', 'grain', 'ca', 'vignette', 'rain', 'lamps', 'detail'];
export const SHADOW_LEVELS = [
  { name: '끔', size: 0 }, { name: '낮음', size: 1024 }, { name: '중간', size: 2048 }, { name: '높음', size: 4096 }, { name: '최대', size: 4096, wide: true },
];
// 하위 호환 (예전 코드가 참조)
export const PRESETS = GFX_PRESETS;

export const IS_TOUCH = (typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches) || ('ontouchstart' in window);

const KEY = 'tray-black-rain-settings-v2';
const BEST_KEY = 'tray-black-rain-best-v1';

export const settings = {
  quality: null,          // 프리셋 키 또는 'custom'
  gfx: null,              // 실제 적용 값
  map: 'town',
  sens: 1.0,
  fov: 78,
  vmFov: 54,
  fpsCap: 0,              // 0 = 제한 없음
  aimAssist: true,
  volume: 0.8,
  showFps: false,
  dynRes: true,
  invertY: false,
  haptics: true,
};

export function presetGfx(key) { const p = GFX_PRESETS[key]; const o = {}; for (const k of GFX_KEYS) o[k] = p[k]; return o; }

export function loadSettings() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (s && typeof s === 'object') Object.assign(settings, s);
  } catch (e) { /* 저장소 사용 불가 — 기본값 사용 */ }
  if (!settings.quality || (!GFX_PRESETS[settings.quality] && settings.quality !== 'custom')) settings.quality = IS_TOUCH ? 'medium' : 'high';
  if (!settings.gfx) settings.gfx = presetGfx(settings.quality === 'custom' ? 'high' : settings.quality);
  for (const k of GFX_KEYS) if (settings.gfx[k] === undefined) settings.gfx[k] = GFX_PRESETS.high[k];
  if (!['port', 'town'].includes(settings.map)) settings.map = 'town';
}

export function saveSettings() {
  try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch (e) { /* 무시 */ }
}

export function loadBest() {
  try { return JSON.parse(localStorage.getItem(BEST_KEY)) || { score: 0, wave: 0 }; } catch (e) { return { score: 0, wave: 0 }; }
}

export function saveBest(b) {
  try { localStorage.setItem(BEST_KEY, JSON.stringify(b)); } catch (e) { /* 무시 */ }
}
