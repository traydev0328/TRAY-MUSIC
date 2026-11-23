// 실사 에셋 로더 — Poly Haven CC0 스캔 텍스처/모델/HDRI. 실패하면 null 을 돌려주고 절차적 대체물을 쓴다.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

const BASE = new URL('../assets/', import.meta.url).href;

export const MODEL_LIST = [
  'concrete_road_barrier', 'Barrel_01', 'barrel_03', 'propane_tank', 'street_lamp_01',
  'wooden_military_crate', 'ammo_box', 'medical_box', 'cement_bag', 'old_tyre',
];
export const TEX_LIST = {
  asphalt_02: ['diff', 'nor', 'rough'],
  concrete_wall_006: ['diff', 'nor', 'arm'],
  concrete_slab_wall: ['diff', 'nor', 'arm'],
  container_side: ['diff', 'nor', 'arm'],
  corrugated_iron_02: ['diff', 'nor', 'arm'],
};

export class Assets {
  constructor(renderer) {
    this.renderer = renderer;
    this.models = {};
    this.tex = {};
    this.images = {};
    this.hdr = null;
    this.failed = [];
    this.maxAniso = renderer.capabilities.getMaxAnisotropy();
  }

  async loadAll(onProgress) {
    const jobs = [];
    const gltf = new GLTFLoader();
    const tl = new THREE.TextureLoader();
    const il = new THREE.ImageLoader();
    let done = 0;
    const total = MODEL_LIST.length + Object.values(TEX_LIST).reduce((a, b) => a + b.length, 0) + 1;
    const tickP = (label) => { done++; onProgress(done / total, label); };

    for (const id of MODEL_LIST) {
      jobs.push(gltf.loadAsync(`${BASE}m/${id}/${id}.json`).then((g) => { this.models[id] = this._prepModel(g.scene); tickP(`모델 ${id}`); })
        .catch((e) => { this.failed.push(id); console.warn('asset fail', id, e); tickP(); }));
    }
    for (const [set, maps] of Object.entries(TEX_LIST)) {
      this.tex[set] = {};
      for (const m of maps) {
        const url = `${BASE}textures/${set}/${m}.jpg`;
        const p = (set === 'container_side' && m === 'diff')
          ? il.loadAsync(url).then((img) => { this.images.container = img; })
          : tl.loadAsync(url).then((t) => {
            t.wrapS = t.wrapT = THREE.RepeatWrapping;
            t.anisotropy = Math.min(8, this.maxAniso);
            if (m === 'diff') t.colorSpace = THREE.SRGBColorSpace;
            this.tex[set][m] = t;
          });
        jobs.push(p.then(() => tickP(`텍스처 ${set}`)).catch((e) => { this.failed.push(`${set}/${m}`); console.warn('asset fail', url, e); tickP(); }));
      }
    }
    // HDRI 는 RGBM 으로 인코딩한 PNG (밝기 감쇠·최대값 제한을 미리 적용, 어떤 정적 호스팅에서도 제공 가능)
    jobs.push(tl.loadAsync(`${BASE}hdri/rooftop_night_rgbm.png`).then((t) => { t.colorSpace = THREE.NoColorSpace; t.generateMipmaps = false; t.minFilter = THREE.LinearFilter; this.hdr = t; tickP('HDRI 조명'); })
      .catch((e) => { this.failed.push('hdri'); console.warn('asset fail hdri', e); tickP(); }));
    await Promise.all(jobs);
    return this;
  }

  // glTF 씬을 (geometry, material, 로컬 행렬) 목록으로 평탄화 → 인스턴싱에 사용
  _prepModel(scene) {
    scene.updateMatrixWorld(true);
    const parts = [];
    const box = new THREE.Box3();
    scene.traverse((o) => {
      if (!o.isMesh) return;
      const mats = [].concat(o.material);
      mats.forEach((m) => { m.envMapIntensity = 0.75; if (m.map) m.map.anisotropy = Math.min(8, this.maxAniso); });
      parts.push({ geometry: o.geometry, material: o.material, matrix: o.matrixWorld.clone() });
      o.geometry.computeBoundingBox();
      box.union(o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld));
    });
    return { parts, box, size: box.getSize(new THREE.Vector3()) };
  }

  // 낮 맵 전용 에셋 (필요할 때만 받기): 실사 하늘 사진 4K, 환경광 RGBM, 지중해 텍스처 6종
  async loadDay() {
    if (this._dayLoaded) return;
    const tl = new THREE.TextureLoader();
    const jobs = [];
    for (const set of ['white_stucco', 'beige_wall_001', 'plastered_stone_wall', 'clay_roof_tiles', 'cobblestone_floor_001', 'blue_painted_planks']) {
      this.tex[set] = {};
      for (const m of ['diff', 'nor', 'arm']) jobs.push(tl.loadAsync(`${BASE}textures/${set}/${m}.jpg`).then((t) => {
        t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = Math.min(8, this.maxAniso);
        if (m === 'diff') t.colorSpace = THREE.SRGBColorSpace;
        this.tex[set][m] = t;
      }).catch((e) => { this.failed.push(`${set}/${m}`); console.warn('asset fail', set, m, e); }));
    }
    jobs.push(tl.loadAsync(`${BASE}hdri/day_sky.jpg`).then((t) => { t.colorSpace = THREE.SRGBColorSpace; t.mapping = THREE.EquirectangularReflectionMapping; this.daySky = t; }).catch(() => this.failed.push('sky')));
    jobs.push(tl.loadAsync(`${BASE}hdri/day_rgbm.png`).then((t) => { t.colorSpace = THREE.NoColorSpace; t.generateMipmaps = false; t.minFilter = THREE.LinearFilter; this.dayEnv = t; }).catch(() => this.failed.push('dayEnv')));
    // 태양 방향 (HDRI 최대 밝기 픽셀에서 미리 계산해 둔 값)
    jobs.push(fetch(`${BASE}hdri/day_sky.json`).then((r) => r.json()).then((j) => { this.daySun = j.sun; }).catch(() => {}));
    await Promise.all(jobs);
    this._dayLoaded = true;
  }

  // 실사 캐릭터·총기 (Sketchfab CC-BY, meshopt 무손실 압축 + WebP). 원본 씬과 애니메이션을 그대로 보관
  async loadReal(ids = ['swat', 'fsb', 'm16']) {
    this.real = this.real || {};
    const gl = new GLTFLoader(); gl.setMeshoptDecoder(MeshoptDecoder);
    await Promise.all(ids.filter((id) => !this.real[id]).map((id) => gl.loadAsync(`${BASE}real/${id}/${id}.json`).then((g) => {
      g.scene.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = !o.isSkinnedMesh; [].concat(o.material).forEach((m) => { if (m.map) m.map.anisotropy = Math.min(8, this.maxAniso); }); } });
      this.real[id] = { scene: g.scene, animations: g.animations };
    }).catch((e) => { this.failed.push(`real/${id}`); console.warn('real asset fail', id, e); })));
    return this.real;
  }

  // 텍스처 세트 → MeshStandardMaterial 옵션
  // ARM 의 R(AO) 채널이 거의 비어 있으면(일부 Poly Haven 텍스처) AO 로 쓰면 간접광이 꺼져 새까맣게 된다
  aoUsable(tex) {
    if (!tex || !tex.image) return false;
    if (tex.userData.aoOk !== undefined) return tex.userData.aoOk;
    try {
      const c = document.createElement('canvas'); c.width = c.height = 16;
      const x = c.getContext('2d'); x.drawImage(tex.image, 0, 0, 16, 16);
      const d = x.getImageData(0, 0, 16, 16).data; let sum = 0;
      for (let i = 0; i < d.length; i += 4) sum += d[i];
      tex.userData.aoOk = sum / 256 > 40;
    } catch (e) { tex.userData.aoOk = true; }
    return tex.userData.aoOk;
  }

  set(name) {
    const s = this.tex[name];
    // 컨테이너는 알베도를 캔버스로 재가공하므로 diff 없이 노멀만 있어도 유효
    if (!s || !s.nor || (!s.diff && name !== 'container_side')) return null;
    return { aoMap: this.aoUsable(s.arm) ? s.arm : null, map: s.diff || null, normalMap: s.nor, ormMap: s.arm || null, roughMap: s.rough || null };
  }

  // 컨테이너 도색 변형: 원본(녹색) 이미지를 색조 회전 + 레이블/때 추가
  containerVariants(colors) {
    const img = this.images.container;
    if (!img) return null;
    const S = 1024;
    const base = document.createElement('canvas'); base.width = base.height = S;
    const bctx = base.getContext('2d'); bctx.drawImage(img, 0, 0, S, S);
    const src = bctx.getImageData(0, 0, S, S).data;
    return colors.map((c, ci) => {
      const cv = document.createElement('canvas'); cv.width = cv.height = S;
      const ctx = cv.getContext('2d');
      const out = ctx.createImageData(S, S); const d = out.data;
      for (let i = 0; i < S * S * 4; i += 4) {
        // 원본 휘도 × 목표 색 (녹색 기준 질감 유지)
        const l = (src[i] * 0.3 + src[i + 1] * 0.59 + src[i + 2] * 0.11) / 255;
        const k = Math.pow(l / 0.42, 1.05);
        d[i] = Math.min(255, c[0] * k * 255); d[i + 1] = Math.min(255, c[1] * k * 255); d[i + 2] = Math.min(255, c[2] * k * 255); d[i + 3] = 255;
      }
      ctx.putImageData(out, 0, 0);
      // 아래쪽 흙탕물 얼룩, 녹물 자국
      const g = ctx.createLinearGradient(0, S, 0, S * 0.6);
      g.addColorStop(0, 'rgba(45,32,20,0.55)'); g.addColorStop(1, 'rgba(45,32,20,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);
      for (let k = 0; k < 14; k++) {
        const x = (Math.sin(ci * 13.1 + k * 7.7) * 0.5 + 0.5) * S, w = 3 + (k % 4) * 3;
        const gg = ctx.createLinearGradient(0, 0, 0, S * (0.3 + (k % 5) * 0.12));
        gg.addColorStop(0, 'rgba(90,45,20,0.35)'); gg.addColorStop(1, 'rgba(90,45,20,0)');
        ctx.fillStyle = gg; ctx.fillRect(x, 0, w, S);
      }
      ctx.globalAlpha = 0.85; ctx.fillStyle = '#e9e7e0';
      ctx.font = 'bold 58px Arial, sans-serif';
      ctx.fillText(`TRYU ${String(318402 + ci * 91711).slice(0, 6)} ${ci + 2}`, 70, 130);
      ctx.font = 'bold 40px Arial, sans-serif'; ctx.fillText('45G1', 70, 185);
      ctx.font = '28px Arial, sans-serif'; ctx.fillText('MAX GROSS 32,500 KG', 70, 240); ctx.fillText('TARE        3,800 KG', 70, 275);
      ctx.globalAlpha = 1;
      const t = new THREE.CanvasTexture(cv);
      t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = Math.min(8, this.maxAniso);
      return t;
    });
  }

  // RGBM PNG(rgb × a × 3)를 구 안쪽에 그려 PMREM 환경광으로 굽는다
  envFromHDR() { return this.envFromRGBM(this.hdr); }

  envFromRGBM(tex) {
    if (!tex) return null;
    const scene = new THREE.Scene();
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false,
      uniforms: { map: { value: tex } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform sampler2D map; varying vec2 vUv; void main(){ vec4 t = texture2D(map, vUv); gl_FragColor = vec4(t.rgb * t.a * 3.0, 1.0); }',
    });
    const sphere = new THREE.Mesh(new THREE.SphereGeometry(10, 64, 32), mat);
    sphere.scale.x = -1; // 안쪽에서 볼 때 좌우가 뒤집히지 않도록
    sphere.rotation.y = Math.PI; // three.js 등장방형 규약(scene.background)과 방향 일치
    scene.add(sphere);
    const pm = new THREE.PMREMGenerator(this.renderer);
    const rt = pm.fromScene(scene, 0.01);
    pm.dispose(); sphere.geometry.dispose(); mat.dispose();
    return rt.texture;
  }
}
