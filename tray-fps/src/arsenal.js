// 실사 총기 13종 데이터 (모델: Sketchfab CC-BY, assets/CREDITS.md 참조)
// len: 실총 전장(m) — 모델 단위가 제각각이라 이 값으로 축척을 맞춘다.
// 총기 이름은 실총 계열명을 그대로 쓰지 않고 게임 내 명칭으로 표기.
const base = { headMul: 2.0, pellets: 1, spreadMove: 0.025, bloomPer: 0.004, falloff: [25, 70, 0.6], adsFov: 0.75, kick: 0.035, tracerEvery: 2 };

export const GUNS = {
  // ── 권총 (보조) ──
  p_engraved: { ...base, slot: 2, cls: '권총', name: 'P-9 각인 권총', cal: '9×19mm', asset: 'p_engraved', len: 0.2, mag: 15, reserve: 60, rpm: 420, dmg: 31, spreadHip: 0.018, spreadAds: 0.004, recoilP: 0.022, recoilY: 0.006, reload: 1.5, range: 120, falloff: [15, 45, 0.55], kick: 0.05 },
  p_deagle: { ...base, slot: 2, cls: '권총', name: 'D-50 대구경 권총', cal: '.50 AE', asset: 'p_deagle', len: 0.27, mag: 7, reserve: 35, rpm: 160, dmg: 58, headMul: 2.2, spreadHip: 0.026, spreadAds: 0.003, recoilP: 0.065, recoilY: 0.014, reload: 1.9, range: 150, falloff: [20, 60, 0.6], kick: 0.09 },
  // ── 기관단총 ──
  smg_mp5: { ...base, slot: 1, cls: '기관단총', name: 'MP-5 기관단총', cal: '9×19mm', asset: 'smg_mp5', len: 0.68, mag: 30, reserve: 180, rpm: 800, dmg: 21, headMul: 1.8, spreadHip: 0.018, spreadAds: 0.005, recoilP: 0.008, recoilY: 0.004, reload: 2.0, range: 120, falloff: [15, 40, 0.55] },
  smg_p90: { ...base, slot: 1, cls: '기관단총', name: 'P-90 전술 기관단총', cal: '5.7×28mm', asset: 'smg_p90', len: 0.5, mag: 50, reserve: 200, rpm: 900, dmg: 19, headMul: 1.8, spreadHip: 0.02, spreadAds: 0.006, recoilP: 0.007, recoilY: 0.004, reload: 2.4, range: 120, falloff: [15, 40, 0.55] },
  // ── 산탄총 ──
  sg_870: { ...base, slot: 1, cls: '산탄총', name: 'M-870 펌프 산탄총', cal: '12 게이지', asset: 'sg_870', len: 1.0, mag: 7, reserve: 42, rpm: 78, dmg: 15, headMul: 1.5, pellets: 9, spreadHip: 0.062, spreadAds: 0.045, spreadMove: 0.02, bloomPer: 0, recoilP: 0.07, recoilY: 0.012, reload: 2.9, range: 70, falloff: [7, 26, 0.25], adsFov: 0.85, kick: 0.09, tracerEvery: 3, pump: true },
  sg_benelli: { ...base, slot: 1, cls: '산탄총', name: 'M-4 반자동 산탄총', cal: '12 게이지', asset: 'sg_benelli', len: 1.0, mag: 7, reserve: 42, rpm: 200, dmg: 13, headMul: 1.5, pellets: 8, spreadHip: 0.066, spreadAds: 0.05, spreadMove: 0.02, bloomPer: 0, recoilP: 0.055, recoilY: 0.014, reload: 3.1, range: 70, falloff: [7, 24, 0.25], adsFov: 0.85, kick: 0.08, tracerEvery: 3 },
  // ── 소총 ──
  ar_aks: { ...base, slot: 1, cls: '소총', name: 'AKS 접철식 소총', cal: '7.62×39mm', asset: 'ar_aks', len: 0.88, mag: 30, reserve: 180, rpm: 600, dmg: 31, headMul: 2.2, spreadHip: 0.024, spreadAds: 0.0025, recoilP: 0.014, recoilY: 0.007, reload: 2.3, range: 220, falloff: [30, 80, 0.65] },
  ar_ar15: { ...base, slot: 1, cls: '소총', name: 'AR-15 계열 소총', cal: '5.56×45mm', asset: 'ar_ar15', len: 0.89, mag: 30, reserve: 210, rpm: 720, dmg: 26, headMul: 2.3, spreadHip: 0.021, spreadAds: 0.0016, recoilP: 0.009, recoilY: 0.004, reload: 2.0, range: 220, falloff: [30, 80, 0.65] },
  ar_ak47t: { ...base, slot: 1, cls: '소총', name: 'AK 전술 개량 소총', cal: '7.62×39mm', asset: 'ar_ak47t', len: 0.88, mag: 30, reserve: 180, rpm: 650, dmg: 30, headMul: 2.2, spreadHip: 0.023, spreadAds: 0.0022, recoilP: 0.012, recoilY: 0.006, reload: 2.2, range: 220, falloff: [30, 80, 0.65] },
  // ── 저격총 (조준경 화면) ──
  sr_m40: { ...base, slot: 1, cls: '저격총', name: 'M-40 볼트액션 저격총', cal: '7.62×51mm', asset: 'sr_m40', len: 1.12, mag: 5, reserve: 25, rpm: 45, dmg: 95, headMul: 2.5, spreadHip: 0.07, spreadAds: 0.0002, spreadMove: 0.05, bloomPer: 0, recoilP: 0.08, recoilY: 0.01, reload: 3.0, range: 400, falloff: [80, 250, 0.8], adsFov: 0.22, kick: 0.1, tracerEvery: 1, scope: true },
  sr_l115: { ...base, slot: 1, cls: '저격총', name: 'L-115 장거리 저격총', cal: '.338 라푸아', asset: 'sr_l115', len: 1.3, mag: 5, reserve: 20, rpm: 38, dmg: 118, headMul: 2.5, spreadHip: 0.08, spreadAds: 0.0001, spreadMove: 0.06, bloomPer: 0, recoilP: 0.1, recoilY: 0.012, reload: 3.4, range: 500, falloff: [100, 300, 0.85], adsFov: 0.16, kick: 0.12, tracerEvery: 1, scope: true },
  // ── 경기관총 ──
  lmg_m249: { ...base, slot: 1, cls: '경기관총', name: 'M-249 분대지원화기', cal: '5.56×45mm', asset: 'lmg_m249', len: 1.04, mag: 100, reserve: 200, rpm: 820, dmg: 24, headMul: 2.0, spreadHip: 0.034, spreadAds: 0.006, recoilP: 0.01, recoilY: 0.006, reload: 4.6, range: 220, falloff: [30, 80, 0.6], kick: 0.03 },
};
export const PRIMARIES = ['rifle', 'ar_ar15', 'ar_aks', 'ar_ak47t', 'smg_mp5', 'smg_p90', 'sg_870', 'sg_benelli', 'sr_m40', 'sr_l115', 'lmg_m249'];
export const SECONDARIES = ['p_engraved', 'p_deagle'];
