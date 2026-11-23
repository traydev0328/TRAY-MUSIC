// TRAY BLACK RAIN — 설정 / 품질 프리셋
export const PRESETS = {
  low:    { name: '낮음',   maxPR: 0.85, shadows: false, shadowSize: 512,  bloom: false, ao: false, rain: 1200, cloudOct: 2, lamps: false },
  medium: { name: '중간',   maxPR: 1.25, shadows: true,  shadowSize: 1024, bloom: true,  ao: false, rain: 2400, cloudOct: 3, lamps: true },
  high:   { name: '높음',   maxPR: 1.75, shadows: true,  shadowSize: 2048, bloom: true,  ao: false, rain: 3600, cloudOct: 4, lamps: true },
  ultra:  { name: '울트라', maxPR: 2.25, shadows: true,  shadowSize: 4096, bloom: true,  ao: true,  rain: 5200, cloudOct: 5, lamps: true },
};

export const IS_TOUCH = (typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches) || ('ontouchstart' in window);

const KEY = 'tray-black-rain-settings-v1';
const BEST_KEY = 'tray-black-rain-best-v1';

export const settings = {
  quality: null,
  sens: 1.0,
  fov: 78,
  aimAssist: true,
  volume: 0.8,
  showFps: false,
  dynRes: true,
  invertY: false,
  haptics: true,
};

export function loadSettings() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (s && typeof s === 'object') Object.assign(settings, s);
  } catch (e) { /* 저장소 사용 불가 — 기본값 사용 */ }
  if (!PRESETS[settings.quality]) settings.quality = IS_TOUCH ? 'medium' : 'high';
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
