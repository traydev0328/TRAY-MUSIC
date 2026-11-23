// 월드 — 비 내리는 해 질 녘 항만 물류 기지. 지형, 조명, 하늘, 비, 충돌, 길찾기 격자.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import * as TX from './textures.js';
import { buildTown } from './map-town.js';

const GRID = 1;            // 길찾기 격자 셀 크기(m)

const tick = () => new Promise((r) => setTimeout(r, 0));

export class World {
  constructor(G, assets, mapId = 'port') {
    this.G = G;
    this.mapId = mapId;
    this.H = mapId === 'town' ? 75 : 60;   // 맵 반경(m)
    this.GN = (this.H * 2) / GRID;
    this.root = new THREE.Group();
    G.scene.add(this.root);
    this.A = assets;            // 실사 에셋 (없으면 절차적 대체)
    this.scene = G.scene;
    this.colliders = [];
    this.placements = {};       // 인스턴싱할 모델 배치
    this.explosives = [];
    this.buckets = new Map();   // 재질별 정적 지오메트리 (병합용)
    this.timeU = { value: 0 };
    this.flash = 0;
    this.nextLightning = 12 + Math.random() * 15;
    this.lamps = [];
    this.blinkers = [];
    this.roofRect = new THREE.Vector4(-43, -27, -17, -9); // 창고 지붕 XZ 범위 (비 차단)
    this.roofY = 8.5;
    this.spawnPoints = [];
    this.playerSpawn = new THREE.Vector3(-4, 0, 48);
  }

  // ---------------- 빌드 ----------------
  async build(progress) {
    if (this.mapId === 'town') return this._buildDay(progress, buildTown);
    const step = async (p, label) => { progress(p, label); await tick(); };
    const A = this.A;
    await step(0.05, '콘크리트 표면 준비');
    this.tex = {};
    // 실사 텍스처가 없는 항목만 절차적으로 생성
    if (!A.set('concrete_wall_006') || !A.set('concrete_slab_wall')) this.tex.wall = TX.concrete(11, { seams: 2 });
    this.tex.barrier = TX.concrete(23, { base: 0.5 });
    await step(0.15, '젖은 아스팔트 준비');
    if (!A.set('asphalt_02')) this.tex.asphalt = TX.asphalt(5);
    this.tex.puddle = TX.puddleMask(77);
    await step(0.28, '컨테이너 강판 준비');
    this.contColors = [[0.42, 0.07, 0.045], [0.05, 0.13, 0.28], [0.16, 0.32, 0.14], [0.62, 0.27, 0.04], [0.36, 0.36, 0.34]];
    this.contMaps = A.containerVariants(this.contColors);
    if (!this.contMaps) this.tex.cont = TX.corrugated(31, this.contColors.map((c) => c.map((v) => v * 0.7)), { ridges: 10, label: true, rustAmt: 0.55 });
    await step(0.4, '창고 외벽 준비');
    if (!A.set('corrugated_iron_02')) this.tex.clad = TX.corrugated(41, [[0.16, 0.19, 0.22]], { ridges: 14, rustAmt: 0.35 });
    await step(0.48, '목재 상자 생성');
    this.tex.crate = TX.crateWood(51);
    this.tex.micro = TX.microDetail(61);
    this.tex.water = TX.waterNormal(71);
    this.tex.paint = TX.wornPaint(81);
    this.tex.windows = TX.windowsTex(91);
    await step(0.58, '재질 구성');
    this._materials();
    await step(0.64, '하늘과 대기');
    this._sky();
    this._lights();
    await step(0.7, '지형 배치');
    this._ground();
    this._layout();
    await step(0.8, '정적 메시 병합');
    this._mergeStatic();
    this._finalizeProps();
    this._background();
    this._rain();
    await step(0.86, '길찾기 격자 계산');
    this._buildNavGrid();
    this._spawns();
    await step(0.9, '환경 반사광 생성');
    this._environment();
  }

  // ── 낮 맵 공통 빌드: 실사 하늘 사진 배경 + 사진 속 태양 방향과 일치하는 햇빛 + HDRI 환경광 ──
  async _buildDay(progress, layoutFn) {
    const step = async (p, label) => { progress(p, label); await tick(); };
    this.day = true;
    await step(0.05, '낮 하늘·실사 텍스처 받는 중');
    await this.A.loadDay();
    await step(0.3, '재질 준비');
    this.tex = { crate: TX.crateWood(51), micro: TX.microDetail(61), barrier: TX.concrete(23, { base: 0.5 }), water: TX.waterNormal(71), paint: TX.wornPaint(81) };
    // 하늘: 4K 실사 사진(등장방형). 톤매핑 후 사진 밝기가 유지되도록 배경 밝기 보정
    const S = this.scene;
    if (this.A.daySky) { S.background = this.A.daySky; S.backgroundIntensity = 1.0; }
    else S.background = new THREE.Color(0x9fc3e6);
    S.fog = new THREE.FogExp2(new THREE.Color().setRGB(0.62, 0.7, 0.8, THREE.LinearSRGBColorSpace), 0.0032);
    // 태양: HDRI 최대 밝기 픽셀에서 계산한 방향 (assets/hdri/day_sky.json)
    this.sunDir = new THREE.Vector3(...(this.A.daySun || [0.688, 0.264, 0.676])).normalize();
    this.sun = new THREE.DirectionalLight(0xfff0dc, 3.1);
    this.sun.castShadow = true;
    const sc = this.sun.shadow.camera; sc.left = -45; sc.right = 45; sc.top = 45; sc.bottom = -45; sc.near = 1; sc.far = 260;
    this.sun.shadow.bias = -0.0003; this.sun.shadow.normalBias = 0.04; this.sun.shadow.mapSize.set(2048, 2048);
    this.root.add(this.sun); this.root.add(this.sun.target);
    this.hemi = new THREE.HemisphereLight(0xcfe0ff, 0x8f7c66, 0.35); this.root.add(this.hemi);
    await step(0.45, '마을 건설');
    layoutFn(this);
    await step(0.7, '정적 메시 병합');
    this._mergeStatic();
    this._finalizeProps();
    await step(0.85, '길찾기 격자 계산');
    this._buildNavGrid();
    if (this._pendingSpawns) this._pendingSpawns();
    await step(0.92, '환경광 생성');
    const env = this.A.envFromRGBM(this.A.dayEnv);
    if (env) S.environment = env;
    this.bloomCfg = { strength: 0.22, radius: 0.4, threshold: 1.25 };
  }

  dispose() {
    this.root.removeFromParent();
    this.root.traverse((o) => { if (o.isMesh && !o.isInstancedMesh && o.geometry) o.geometry.dispose(); });
    for (const t of Object.values(this.tex || {})) { if (t && t.isTexture) t.dispose(); else if (t && typeof t === 'object') for (const v of Object.values(t)) if (v && v.isTexture) v.dispose(); }
    this.scene.background = null; this.scene.fog = null; this.scene.environment = null;
  }

  _std(tex, opts = {}) {
    const ns = opts.ns || 1; opts = { ...opts }; delete opts.ns;
    const m = new THREE.MeshStandardMaterial({
      map: tex.map || (tex.maps && tex.maps[0]) || null,
      normalMap: tex.normalMap || null,
      roughnessMap: tex.ormMap || null,
      metalnessMap: tex.ormMap || null,
      aoMap: tex.ormMap || null,
      aoMapIntensity: 0.8,
      roughness: 1, metalness: 1,
      ...opts,
    });
    if (m.normalMap) m.normalScale = new THREE.Vector2(1, 1).multiplyScalar(ns);
    return m;
  }

  // 실사 텍스처 세트 → 재질 (ARM: R=AO, G=거칠기, B=금속)
  _pbr(setName, fallback, ud, extra = {}) {
    const s = this.A.set(setName);
    let m;
    if (s) {
      m = new THREE.MeshStandardMaterial({
        map: s.map, normalMap: s.normalMap,
        roughnessMap: s.ormMap || s.roughMap, metalnessMap: s.ormMap || null, aoMap: s.aoMap, aoMapIntensity: 0.9,
        roughness: 1, metalness: s.ormMap ? 1 : 0, envMapIntensity: 0.8, ...extra,
      });
      ud = { ...ud, tw: ud.twAsset || ud.tw };
    } else m = this._std(fallback);
    m.userData = ud;
    return m;
  }

  _materials() {
    const T = this.tex, M = this.mat = {};
    M.wall = this._pbr('concrete_wall_006', T.wall, { surface: 'concrete', tw: 4, twAsset: 3 });
    M.office = this._pbr('concrete_slab_wall', T.wall, { surface: 'concrete', tw: 4, twAsset: 3.5 });
    M.barrier = this._std(T.barrier); M.barrier.userData = { surface: 'concrete', tw: 2 };
    const cs = this.A.set('container_side');
    if (this.contMaps && cs) {
      M.cont = this.contMaps.map((map) => {
        const m = new THREE.MeshStandardMaterial({ map, normalMap: cs.normalMap, roughnessMap: cs.ormMap, metalnessMap: cs.ormMap, aoMap: cs.ormMap, roughness: 1, metalness: 1, envMapIntensity: 0.8 });
        m.userData = { surface: 'metal', tw: 2.6 }; return m;
      });
    } else {
      M.cont = T.cont.maps.map((map) => {
        const m = this._std({ map, normalMap: T.cont.normalMap, ormMap: T.cont.ormMap });
        m.userData = { surface: 'metal', tw: 2.7 }; return m;
      });
    }
    M.clad = this.A.set('corrugated_iron_02')
      ? this._pbr('corrugated_iron_02', null, { surface: 'metal', tw: 2.2 }, { color: 0x9aa4ad })
      : (() => { const m = this._std({ map: T.clad.maps[0], normalMap: T.clad.normalMap, ormMap: T.clad.ormMap }); m.userData = { surface: 'metal', tw: 3 }; return m; })();
    M.crate = this._std(T.crate); M.crate.userData = { surface: 'wood', tw: 1.2 };
    M.steel = new THREE.MeshStandardMaterial({ color: 0x2a2d31, roughness: 0.45, metalness: 0.85, normalMap: T.micro });
    M.steel.userData = { surface: 'metal', tw: 1 };
    M.yellow = new THREE.MeshStandardMaterial({ color: 0xb8860b, roughness: 0.5, metalness: 0.3, normalMap: T.micro });
    M.yellow.userData = { surface: 'metal', tw: 1 };
    M.craneRed = new THREE.MeshStandardMaterial({ color: 0x7a1a12, roughness: 0.6, metalness: 0.4 });
    M.craneRed.userData = { surface: 'metal', tw: 4 };
    M.rubber = new THREE.MeshStandardMaterial({ color: 0x0c0c0d, roughness: 0.85, metalness: 0 });
    M.rubber.userData = { surface: 'metal', tw: 1 };
    M.glass = new THREE.MeshStandardMaterial({ color: 0x0a0d12, roughness: 0.06, metalness: 0.9, emissiveMap: T.windows, emissive: 0xffffff, emissiveIntensity: 1.4 });
    M.glass.userData = { surface: 'glass', tw: 12 };
    M.cabGlass = new THREE.MeshStandardMaterial({ color: 0x05070a, roughness: 0.05, metalness: 0.9 });
    M.cabGlass.userData = { surface: 'glass', tw: 1 };
    M.drumBlue = new THREE.MeshStandardMaterial({ color: 0x0f2c52, roughness: 0.4, metalness: 0.5, normalMap: T.micro });
    M.drumBlue.userData = { surface: 'metal', tw: 1 };
    M.drumRed = new THREE.MeshStandardMaterial({ color: 0x5a0f0a, roughness: 0.4, metalness: 0.5, normalMap: T.micro });
    M.drumRed.userData = { surface: 'metal', tw: 1 };
    M.cone = new THREE.MeshStandardMaterial({ color: 0xd2480e, roughness: 0.5, metalness: 0 });
    M.cone.userData = { surface: 'wood', tw: 1 };
    M.lampHead = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.5, metalness: 0.6, emissive: 0xffa04a, emissiveIntensity: 0 });
    M.lampHead.userData = { surface: 'metal', tw: 1 };
    M.lampGlow = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.55, 0.22).multiplyScalar(9) });
    M.lampGlow.userData = { surface: 'glass', tw: 1 };
    M.panelGlow = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.85, 0.92, 1.0).multiplyScalar(5) });
    M.panelGlow.userData = { surface: 'glass', tw: 1 };
    M.paintY = new THREE.MeshStandardMaterial({ color: 0xc99a1c, roughness: 0.55, metalness: 0, alphaMap: T.paint, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    M.paintW = M.paintY.clone(); M.paintW.color.set(0xb8b8b0);
  }

  // 정적 박스 추가: 월드 크기에 맞춰 UV 를 스케일해 텍셀 밀도를 일정하게 유지
  box(x, y, z, sx, sy, sz, mat, { collide = true, surface, cast = true, uvOff = true, rotY = 0 } = {}) {
    const g = new THREE.BoxGeometry(sx, sy, sz);
    const tw = (mat.userData && mat.userData.tw) || 2;
    const uv = g.attributes.uv;
    const dims = [[sz, sy], [sz, sy], [sx, sz], [sx, sz], [sx, sy], [sx, sy]];
    const ox = uvOff ? Math.random() : 0, oy = uvOff ? Math.random() * 0.2 : 0;
    for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) {
      const i = f * 4 + k;
      uv.setXY(i, uv.getX(i) * dims[f][0] / tw + ox, uv.getY(i) * dims[f][1] / tw + oy);
    }
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y + sy / 2, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY), new THREE.Vector3(1, 1, 1));
    g.applyMatrix4(m);
    this._addGeo(g, mat, cast);
    if (collide) {
      const rx = rotY ? Math.abs(Math.cos(rotY)) * sx + Math.abs(Math.sin(rotY)) * sz : sx;
      const rz = rotY ? Math.abs(Math.sin(rotY)) * sx + Math.abs(Math.cos(rotY)) * sz : sz;
      this.colliders.push({ minX: x - rx / 2, maxX: x + rx / 2, minY: y, maxY: y + sy, minZ: z - rz / 2, maxZ: z + rz / 2, surface: surface || mat.userData.surface });
    }
  }

  geo(g, mat, cast = true) { this._addGeo(g, mat, cast); }

  _addGeo(g, mat, cast) {
    if (g.index) g = g.toNonIndexed();
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    const key = mat.uuid + (cast ? 'c' : 'n');
    if (!this.buckets.has(key)) this.buckets.set(key, { mat, cast, geos: [] });
    this.buckets.get(key).geos.push(g);
  }

  collider(minX, minY, minZ, maxX, maxY, maxZ, surface = 'concrete') {
    this.colliders.push({ minX, minY, minZ, maxX, maxY, maxZ, surface });
  }

  _mergeStatic() {
    this.staticMeshes = [];
    for (const { mat, cast, geos } of this.buckets.values()) {
      const merged = mergeGeometries(geos, false);
      geos.forEach((g) => g.dispose());
      const mesh = new THREE.Mesh(merged, mat);
      mesh.castShadow = cast; mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false; mesh.updateMatrix();
      this.root.add(mesh);
      this.staticMeshes.push(mesh);
    }
    this.buckets.clear();
  }

  // ---------------- 하늘 ----------------
  _skyMaterial(octaves) {
    return new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: {
        uTime: this.timeU, uFlash: { value: 0 }, uOct: { value: octaves },
        uSunDir: { value: new THREE.Vector3(-0.75, 0.12, 0.62).normalize() },
      },
      vertexShader: /* glsl */`
        varying vec3 vDir;
        void main(){ vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }`,
      fragmentShader: /* glsl */`
        varying vec3 vDir; uniform float uTime, uFlash; uniform int uOct; uniform vec3 uSunDir;
        float h21(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p,p+45.32); return fract(p.x*p.y); }
        float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
          return mix(mix(h21(i),h21(i+vec2(1,0)),f.x), mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x), f.y); }
        float fbm(vec2 p){ float a=0.5, s=0.0, n=0.0; for(int i=0;i<6;i++){ if(i>=uOct) break; s+=a*vnoise(p); n+=a; p*=2.03; a*=0.5; } return s/n; }
        void main(){
          vec3 d = normalize(vDir); float h = d.y;
          vec3 zenith = vec3(0.014,0.018,0.026);
          vec3 horizon = vec3(0.15,0.105,0.085);
          vec3 col = mix(horizon, zenith, pow(clamp(h,0.0,1.0),0.42));
          float sunAmt = pow(max(dot(d,uSunDir),0.0), 5.0);
          col += vec3(0.42,0.17,0.05) * sunAmt * 0.9;
          if (h > -0.02) {
            vec2 uv = d.xz / (h + 0.12) * 0.55 + uTime * vec2(0.010, 0.004);
            float c = fbm(uv); float c2 = fbm(uv * 2.7 + 3.1 - uTime*0.01);
            float cov = smoothstep(0.32, 0.72, c * 0.72 + c2 * 0.28);
            vec3 cloud = mix(vec3(0.03,0.033,0.04), vec3(0.2,0.11,0.065), clamp(sunAmt*1.4 + (1.0-h)*0.35, 0.0, 1.0));
            cloud *= 0.75 + c2 * 0.5;
            cloud += uFlash * vec3(0.55,0.6,0.85) * (0.35 + c * 1.2);
            col = mix(col, cloud, cov * smoothstep(-0.02, 0.18, h));
          }
          col += uFlash * 0.12 * vec3(0.5,0.55,0.75);
          col = mix(col, horizon * 0.55, smoothstep(0.0, -0.25, h));
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
  }

  _sky() {
    const q = this.G.preset;
    this.skyMat = this._skyMaterial(q.cloudOct);
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), this.skyMat);
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -10;
    this.root.add(this.sky);
    const fogC = new THREE.Color().setRGB(0.062, 0.058, 0.06, THREE.LinearSRGBColorSpace);
    this.scene.fog = new THREE.FogExp2(fogC, 0.0135);
    this.scene.background = null;
  }

  _environment() {
    // 1순위: 실사 HDRI(Poly Haven rooftop_night) 로 반사광 생성
    const env = this.A.envFromHDR();
    if (env) { this.scene.environment = env; return; }
    // 대체: 같은 하늘 + 도시 불빛 패널 → 물웅덩이/금속에 반사될 빛
    const r = this.G.renderer;
    const envScene = new THREE.Scene();
    const sm = this._skyMaterial(4);
    sm.uniforms.uTime = { value: 3 };
    envScene.add(new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), sm));
    const glow = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.5, 0.2).multiplyScalar(3), side: THREE.DoubleSide });
    const cool = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.5, 0.7, 1.0).multiplyScalar(1.5), side: THREE.DoubleSide });
    for (let i = 0; i < 14; i++) {
      const a = i / 14 * Math.PI * 2;
      const p = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 1.2), i % 3 ? glow : cool);
      p.position.set(Math.cos(a) * 30, 3 + Math.random() * 6, Math.sin(a) * 30);
      p.lookAt(0, 4, 0);
      envScene.add(p);
    }
    const pm = new THREE.PMREMGenerator(r);
    this.envRT = pm.fromScene(envScene, 0.02);
    this.scene.environment = this.envRT.texture;
    pm.dispose();
    envScene.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
  }

  // ---------------- 조명 ----------------
  _lights() {
    const S = this.scene;
    this.hemi = new THREE.HemisphereLight(0x8496b0, 0x2a2420, 0.55);
    S.add(this.hemi);
    this.sunDir = new THREE.Vector3(-0.75, 0.42, 0.52).normalize();
    this.sun = new THREE.DirectionalLight(0xffa36a, 1.35);
    this.sun.castShadow = true;
    const sc = this.sun.shadow.camera;
    sc.left = -38; sc.right = 38; sc.top = 38; sc.bottom = -38; sc.near = 1; sc.far = 220;
    this.sun.shadow.bias = -0.0004; this.sun.shadow.normalBias = 0.035;
    this.sun.shadow.mapSize.set(2048, 2048);
    S.add(this.sun); S.add(this.sun.target);
    // 번개용 차가운 보조광
    this.boltLight = new THREE.DirectionalLight(0xbcd0ff, 0);
    this.boltLight.position.set(30, 80, -40);
    S.add(this.boltLight);
  }

  applyQuality(q) {
    const r = this.G.renderer;
    r.shadowMap.enabled = q.shadows;
    if (this.sun.shadow.mapSize.x !== q.shadowSize) {
      this.sun.shadow.mapSize.set(q.shadowSize, q.shadowSize);
      if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; }
    }
    if (this.skyMat) this.skyMat.uniforms.uOct.value = q.cloudOct;
    if (this.rainMesh) this.rainMesh.geometry.setDrawRange(0, q.rain * 2);
    for (const l of this.lamps) if (l.light) l.light.visible = q.lamps;
    this.scene.traverse((o) => { if (o.material) [].concat(o.material).forEach((m) => { m.needsUpdate = true; }); });
  }

  // ---------------- 지면 ----------------
  _ground() {
    const T = this.tex;
    const SIZE = 150;
    const g = new THREE.PlaneGeometry(SIZE, SIZE, 1, 1);
    g.rotateX(-Math.PI / 2);
    const uv = g.attributes.uv;
    const as = this.A.set('asphalt_02');
    const tile = as ? 3.2 : 7; // 실사 아스팔트 1장 ≈ 3.2m
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * SIZE / tile, uv.getY(i) * SIZE / tile);
    const mat = as
      ? new THREE.MeshStandardMaterial({ map: as.map, normalMap: as.normalMap, roughnessMap: as.roughMap, roughness: 0.85, metalness: 0, envMapIntensity: 0.9, color: 0x8a8a8a })
      : this._std(T.asphalt, { ns: 0.9 });
    mat.userData = { surface: 'ground' };
    const puddle = T.puddle;
    const timeU = this.timeU;
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uPuddle = { value: puddle };
      sh.uniforms.uTime = timeU;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
        .replace('#include <project_vertex>', '#include <project_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>
          varying vec3 vWPos; uniform sampler2D uPuddle; uniform float uTime;
          float rh(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
          vec2 ripples(vec2 p, float t){
            vec2 n = vec2(0.0);
            for (int k = 0; k < 3; k++) {
              vec2 q = p * (2.2 + float(k) * 0.9) + float(k) * 17.3;
              vec2 c = floor(q); vec2 f = fract(q) - 0.5;
              float h = rh(c + float(k));
              vec2 off = (vec2(rh(c + 3.1), rh(c + 7.7)) - 0.5) * 0.5;
              vec2 d = f - off; float r = length(d);
              float ph = fract(t * (0.8 + h * 0.6) + h);
              float x = (r - ph * 0.42) * 34.0;
              float w = exp(-x * x) * (1.0 - ph);
              n += (d / max(r, 1e-3)) * w * (-2.0 * x) * 0.09;
            }
            return n;
          }`)
        .replace('#include <map_fragment>', `#include <map_fragment>
          vec2 pm = texture2D(uPuddle, vWPos.xz / 140.0 + 0.5).rg;
          float puddle = pm.r; float damp = pm.g;
          diffuseColor.rgb *= mix(1.0, 0.38, max(puddle, damp * 0.55));`)
        .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
          roughnessFactor = mix(roughnessFactor, 0.22, damp * 0.7);
          roughnessFactor = mix(roughnessFactor, 0.015, puddle);`)
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
          {
            vec2 rp = ripples(vWPos.xz, uTime);
            vec3 vn = normalize((viewMatrix * vec4(normalize(vec3(rp.x, 1.0, rp.y)), 0.0)).xyz);
            normal = normalize(mix(normal, vn, puddle));
          }`);
    };
    mat.customProgramCacheKey = () => 'wet-ground-v1';
    const mesh = new THREE.Mesh(g, mat);
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false; mesh.updateMatrix();
    this.root.add(mesh);
    this.groundMesh = mesh;

    // 바다(북쪽 부두 너머)
    const wg = new THREE.PlaneGeometry(900, 400); wg.rotateX(-Math.PI / 2);
    const wm = new THREE.MeshStandardMaterial({ color: 0x05080b, roughness: 0.05, metalness: 0.1, normalMap: T.water, normalScale: new THREE.Vector2(0.35, 0.35) });
    T.water.repeat.set(60, 30);
    const water = new THREE.Mesh(wg, wm); water.position.set(0, -2.2, -60 - 200);
    this.root.add(water); this.water = water;

    // 도로 도색
    const strip = (x, z, w, l, mat, rot = 0) => {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(w, l), mat);
      p.rotation.x = -Math.PI / 2; p.rotation.z = rot; p.position.set(x, 0.012, z); p.receiveShadow = true;
      this.root.add(p);
    };
    const PY = this.mat.paintY, PW = this.mat.paintW;
    strip(-12, 15, 0.15, 80, PY); strip(-11.7, 15, 0.15, 80, PY);
    strip(10, -42, 90, 0.18, PW);
    for (let i = 0; i < 8; i++) strip(-30 + i * 1.2 - 4, -4.5, 0.4, 4, PY, 0.6);
    for (let i = 0; i < 6; i++) strip(4 + i * 3, 46, 0.14, 5.5, PW);
  }

  // ---------------- 레벨 배치 ----------------
  _layout() {
    const M = this.mat;
    const B = (...a) => this.box(...a);

    // 외곽 담장 (남/동/서) — 높이 5m, 이음선 있는 콘크리트 패널
    B(0, 0, this.H + 0.4, this.H * 2 + 1.6, 5, 0.8, M.wall);
    B(this.H + 0.4, 0, 0, 0.8, 5, this.H * 2, M.wall);
    B(-this.H - 0.4, 0, 0, 0.8, 5, this.H * 2, M.wall);
    // 북쪽 부두: 낮은 방호벽 + 보이지 않는 추락 방지 벽
    if (this.A.models.concrete_road_barrier) for (let x = -this.H + 1; x < this.H; x += 1.56) this.prop('concrete_road_barrier', x, 0, -this.H + 0.5, 0, 1, { group: 'quay', cast: false, surface: 'concrete' });
    else for (let x = -this.H + 1; x < this.H; x += 2.05) this._jersey(x, -this.H + 0.5, 0);
    this.collider(-this.H, 0, -this.H - 1, this.H, 6, -this.H + 0.2, 'invisible');
    // 부두 가장자리 콘크리트
    B(0, -2.2, -this.H - 1.5, this.H * 2, 2.2, 3, M.barrier, { collide: false });

    // ── 창고 (진입 가능) ──
    this._warehouse(-30, -18, 26, 18, 8.5);

    // ── 사무동 (진입 불가, 유리창) ──
    const ox = 34, oz = -40, ow = 22, od = 14, oh = 14;
    B(ox, 0, oz, ow, oh, od, M.office);
    for (let f = 0; f < 4; f++) {
      const y = 1.6 + f * 3.2;
      B(ox, y, oz + od / 2 + 0.03, ow - 1.5, 1.6, 0.08, M.glass, { collide: false, uvOff: true });
      B(ox - ow / 2 - 0.03, y, oz, 0.08, 1.6, od - 1.5, M.glass, { collide: false });
    }
    B(ox, oh, oz, ow + 0.4, 0.6, od + 0.4, M.steel);

    // ── 컨테이너 야드 ──
    const L40 = 12.19, W = 2.44, H = 2.59, L20 = 6.06;
    let ci = 0;
    const cont = (x, y, z, alongX, len = L40) => {
      const mat = M.cont[(ci++ * 7 + 3) % M.cont.length];
      if (alongX) B(x, y, z, len, H, W, mat); else B(x, y, z, W, H, len, mat);
      // 상단 코너 캐스팅
    };
    const rows = [-14, -2, 10, 22, 34];
    const cols = [14, 30, 46];
    let seed = 7;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (const z of rows) for (const x of cols) {
      if ((x === 30 && z === 10) || (x === 14 && z === 34)) continue; // 열린 공간
      const pair = rnd() > 0.35;
      cont(x, 0, z, true);
      if (pair) cont(x, 0, z + W + 0.05, true);
      if (rnd() > 0.45) cont(x + (rnd() - 0.5) * 0.6, H, z, true);
      if (pair && rnd() > 0.7) cont(x, H, z + W + 0.05, true);
    }
    // 서쪽 열린 마당의 20ft 컨테이너
    cont(-30, 0, 18, false, L20); cont(-26.5, 0, 26, true, L20); cont(-44, 0, 34, false, L20); cont(-44, H, 34, false, L20);
    cont(-6, 0, -22, true, L20); cont(-2, 0, 30, false, L20);

    // ── 트럭 ──
    this._truck(0, 8, Math.PI / 2);
    // ── 방호벽 / 상자 / 드럼 / 프로판 / 모래(시멘트) 포대 엄폐물 ──
    const hasM = (n) => !!this.A.models[n];
    const jerseys = [[-18, 40, 0], [-16.4, 40, 0], [-20, 30, Math.PI / 2], [6, 20, 0], [7.6, 20, 0], [-8, -10, Math.PI / 2], [-8, -11.6, Math.PI / 2], [22, 46, 0], [40, 52, Math.PI / 2], [-40, 8, 0], [-38.4, 8, 0], [52, -20, Math.PI / 2], [-2, -40, 0], [-0.4, -40, 0], [12, 38, 0], [13.6, 38, 0], [-28, -2, Math.PI / 2]];
    for (const [x, z, r] of jerseys) {
      // 기존 r=0 은 z 방향으로 긴 배치 → 모델(긴 축 x)은 90° 돌린다
      if (hasM('concrete_road_barrier')) this.prop('concrete_road_barrier', x, 0, z, r + Math.PI / 2, 1, { surface: 'concrete' });
      else this._jersey(x, z, r);
    }
    const crates = [[-16, 22, 3], [-16, 23.6, 2], [-5, 36, 2], [-35, 2, 3], [-33.6, 2.2, 1], [24, 3, 2], [38, -24, 3], [38, -22.8, 2], [-50, -45, 3], [5, -30, 2], [48, 28, 3], [-22, 48, 2], [-3, 22, 3]];
    for (const [x, z, h] of crates) {
      if (hasM('wooden_military_crate')) this.crateStack(x, z, h);
      else this.box(x, 0, z, 1.2, 1.2, 1.2, M.crate);
    }
    const drums = [[-14, 26, 0], [-13.4, 26.6, 1], [26, 4.5, 1], [-36, 4, 0], [10, 28, 0], [10.7, 28.4, 1], [-52, 20, 0], [42, -26, 1], [-6.5, 30.5, 1], [30, 22.2, 1], [-24, -6, 1]];
    for (const [x, z, c] of drums) {
      const name = c ? 'Barrel_01' : 'barrel_03';
      if (hasM(name)) this.prop(name, x, 0, z, Math.random() * 6.28, 1, { surface: 'metal', explosive: c ? { hp: 40, radius: 6.5, dmg: 190 } : null });
      else this._drum(x, z, c ? M.drumRed : M.drumBlue);
    }
    if (hasM('propane_tank')) for (const [x, z] of [[-12.6, 25], [27.2, 5.4], [-37, 5.2], [11.6, 29.4], [-25, -7]]) {
      for (let k = 0; k < 3; k++) this.prop('propane_tank', x + (k % 2) * 0.38, 0, z + k * 0.36, Math.random() * 6.28, 1, { surface: 'metal', explosive: { hp: 22, radius: 5.5, dmg: 160 } });
    }
    if (hasM('old_tyre')) for (const [x, z] of [[-11, 46], [33, 47], [-47, 30], [17, -33]]) this.tyreStack(x, z, 3 + Math.floor(Math.random() * 2));
    if (hasM('cement_bag')) {
      // 허리 높이(약 1.1m) 포대 벽 — 앉으면 완전히 숨고, 앉은 채 조준하면 고개를 내밀어 사격
      for (const [x, z, alongX, n] of [[-9, 34, true, 5], [5, 32, true, 4], [-25, 12, false, 5], [18, 50, true, 4], [41, 6, false, 5], [-3, -14, true, 5], [-46, 44, true, 4], [26, -28, false, 4], [-31, 36, true, 4]]) this.bagWall(x, z, alongX, n);
    }
    for (const [x, z] of [[-10, 44], [16, -30], [-46, -2], [36, 46]]) { this.box(x, 0, z, 1.2, 0.15, 1.0, M.crate); this.box(x, 0.15, z, 1.1, 0.9, 0.95, M.crate); }
    for (const [x, z] of [[-12.5, 2], [-12.5, 6], [-12.5, 10], [4, 44], [8, 44]]) this._cone(x, z);

    // ── 가로등 ──
    const lampPos = [[-9, 18, 0], [-9, 40, 0], [2, -28, Math.PI], [22, 48, Math.PI], [-38, 26, -Math.PI / 2], [38, 16, Math.PI / 2], [-14, -42, 0]];
    for (const [x, z, r] of lampPos) { if (hasM('street_lamp_01')) this._lampModel(x, z); else this._lamp(x, z, r); }

    // ── 갠트리 크레인 (부두) ──
    this._crane(-22, -52);
    this._crane(26, -52);
  }

  // ---------------- 모델 배치 (인스턴싱) ----------------
  prop(name, x, y, z, rotY = 0, scale = 1, o = {}) {
    const M = this.A.models[name];
    if (!M) return null;
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(o.rx || 0, rotY, 0, 'YXZ'));
    const mat = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(scale, scale, scale));
    const key = name + (o.group || '');
    if (!this.placements[key]) this.placements[key] = { name, list: [], cast: o.cast !== false };
    const rec = { name, mat, refs: [], pos: new THREE.Vector3(x, y, z), collider: null, explosive: null };
    if (o.collide !== false) {
      const b = M.box.clone().applyMatrix4(mat);
      const pad = o.pad || 0;
      rec.collider = { minX: b.min.x - pad, maxX: b.max.x + pad, minY: Math.max(0, b.min.y), maxY: b.max.y, minZ: b.min.z - pad, maxZ: b.max.z + pad, surface: o.surface || 'metal' };
      this.colliders.push(rec.collider);
    }
    if (o.explosive) {
      rec.explosive = { ...o.explosive, alive: true, center: M.box.getCenter(new THREE.Vector3()).applyMatrix4(mat) };
      rec.collider.ref = rec;
      this.explosives.push(rec);
    }
    this.placements[key].list.push(rec);
    return rec;
  }

  _finalizeProps() {
    for (const [key, P] of Object.entries(this.placements)) {
      const M = this.A.models[P.name];
      for (const part of M.parts) {
        const inst = new THREE.InstancedMesh(part.geometry, part.material, P.list.length);
        const m = new THREE.Matrix4();
        P.list.forEach((rec, i) => { inst.setMatrixAt(i, m.multiplyMatrices(rec.mat, part.matrix)); rec.refs.push([inst, i]); });
        inst.castShadow = P.cast; inst.receiveShadow = true;
        inst.instanceMatrix.needsUpdate = true;
        inst.computeBoundingSphere();
        inst.name = key;
        this.root.add(inst);
      }
    }
  }

  // 폭발물 제거: 인스턴스를 0 크기로, 충돌체 삭제, 길찾기 갱신
  destroyProp(rec) {
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (const [inst, i] of rec.refs) { inst.setMatrixAt(i, zero); inst.instanceMatrix.needsUpdate = true; }
    if (rec.collider) this.colliders = this.colliders.filter((c) => c !== rec.collider);
    if (rec.explosive) rec.explosive.alive = false;
    this._buildNavGrid();
  }

  crateStack(x, z, h) {
    const r0 = (Math.random() > 0.5 ? 0 : Math.PI / 2);
    for (let k = 0; k < h; k++) this.prop('wooden_military_crate', x + (Math.random() - 0.5) * 0.06, 0.03 + k * 0.42, z, r0 + (k % 2 ? Math.PI : 0) + (Math.random() - 0.5) * 0.06, 1, { surface: 'wood', collide: false });
    const M = this.A.models.wooden_military_crate.size;
    const lx = r0 ? M.z : M.x, lz = r0 ? M.x : M.z;
    this.collider(x - lx / 2, 0, z - lz / 2, x + lx / 2, 0.03 + h * 0.42, z + lz / 2, 'wood');
  }

  tyreStack(x, z, n) {
    for (let k = 0; k < n; k++) this.prop('old_tyre', x + (Math.random() - 0.5) * 0.08, 0.08 + k * 0.16, z + (Math.random() - 0.5) * 0.08, Math.random() * 6.28, 1, { rx: Math.PI / 2, collide: false });
    this.collider(x - 0.32, 0, z - 0.32, x + 0.32, n * 0.16, z + 0.32, 'wood');
  }

  bagWall(x, z, alongX, n) {
    // 포대 0.46×0.18×0.70 m — 긴 변을 벽 방향으로, 6단을 엇갈려 쌓는다
    const L = 0.66, rows = 6, H = 0.18;
    for (let r = 0; r < rows; r++) {
      const off = (r % 2) * L * 0.5;
      const cnt = n - (r % 2);
      for (let i = 0; i < cnt; i++) {
        const d = -((n - 1) * L) / 2 + i * L + off;
        const px = alongX ? x + d : x, pz = alongX ? z : z + d;
        this.prop('cement_bag', px + (Math.random() - 0.5) * 0.03, r * H * 0.95, pz + (Math.random() - 0.5) * 0.03, (alongX ? Math.PI / 2 : 0) + (Math.random() - 0.5) * 0.12, 1, { collide: false });
      }
    }
    const half = (n * L) / 2, th = 0.26;
    if (alongX) this.collider(x - half, 0, z - th, x + half, rows * H * 0.95 + 0.05, z + th, 'concrete');
    else this.collider(x - th, 0, z - half, x + th, rows * H * 0.95 + 0.05, z + half, 'concrete');
  }

  _lampModel(x, z) {
    const S = 1.6;
    this.prop('street_lamp_01', x, 0, z, Math.random() * 6.28, S, { pad: -0.15, surface: 'metal' });
    // 등 유리 발광
    const M = this.A.models.street_lamp_01;
    for (const p of M.parts) for (const m of [].concat(p.material)) if (/glass/i.test(m.name) && !m.userData.lit) {
      m.userData.lit = true; m.emissive = new THREE.Color(1.0, 0.55, 0.22); m.emissiveIntensity = 3.5; m.opacity = Math.max(m.opacity, 0.85);
    }
    const ly = 3.32 * S;
    const light = new THREE.PointLight(0xff9340, 42, 22, 2);
    light.position.set(x, ly - 0.15, z);
    this.root.add(light);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(2.9, ly - 0.3, 32, 1, true), this._beamMat());
    cone.position.set(x, (ly - 0.3) / 2, z);
    cone.renderOrder = 5;
    this.root.add(cone);
    this.lamps.push({ light, cone, pos: new THREE.Vector3(x, ly, z) });
  }

  _jersey(x, z, rot) {
    const shape = new THREE.Shape();
    shape.moveTo(-0.3, 0); shape.lineTo(0.3, 0); shape.lineTo(0.3, 0.075); shape.lineTo(0.13, 0.33); shape.lineTo(0.08, 0.81);
    shape.lineTo(-0.08, 0.81); shape.lineTo(-0.13, 0.33); shape.lineTo(-0.3, 0.075); shape.closePath();
    const g = new THREE.ExtrudeGeometry(shape, { depth: 2.0, bevelEnabled: false });
    g.translate(0, 0, -1.0);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 0.5 + Math.random() * 0.01, uv.getY(i) * 0.5);
    g.rotateY(rot); g.translate(x, 0, z);
    this.geo(g, this.mat.barrier);
    const along = Math.abs(Math.sin(rot)) > 0.5; // rot=90° 이면 x 방향으로 길다
    const hx = along ? 1.0 : 0.3, hz = along ? 0.3 : 1.0;
    this.collider(x - hx, 0, z - hz, x + hx, 0.81, z + hz, 'concrete');
  }

  _drum(x, z, mat) {
    const g = new THREE.CylinderGeometry(0.286, 0.286, 0.88, 20); g.translate(x, 0.44, z);
    this.geo(g, mat);
    for (const y of [0.29, 0.59]) { const r = new THREE.CylinderGeometry(0.296, 0.296, 0.03, 20); r.translate(x, y, z); this.geo(r, mat); }
    this.collider(x - 0.29, 0, z - 0.29, x + 0.29, 0.88, z + 0.29, 'metal');
  }

  _cone(x, z) {
    const g = new THREE.ConeGeometry(0.17, 0.7, 16); g.translate(x, 0.38, z); this.geo(g, this.mat.cone);
    const b = new THREE.BoxGeometry(0.38, 0.04, 0.38); b.translate(x, 0.02, z); this.geo(b, this.mat.rubber);
  }

  _truck(x, z, rot) {
    const M = this.mat;
    // 트럭은 z 축 방향(rot=π/2 이면 x 방향)으로 배치. 단순화를 위해 x 축 정렬만 사용
    const along = Math.abs(Math.sin(rot)) > 0.5;
    const P = (dx, dz) => along ? [x + dz, z + dx] : [x + dx, z + dz];
    const B = (dx, y, dz, sx, sy, sz, mat, o) => { const [px, pz] = P(dx, dz); this.box(px, y, pz, along ? sz : sx, sy, along ? sx : sz, mat, o); };
    B(0, 1.0, -8.2, 2.45, 2.1, 2.3, M.cont[0], {}); // 캡 (빨강)
    B(0, 2.05, -7.0, 2.3, 0.9, 0.06, M.cabGlass, { collide: false });
    B(0, 0.95, 0, 2.4, 0.3, 14, M.steel);              // 섀시
    B(0, 1.25, 0.6, 2.44, 2.59, 12.19, M.cont[2]);      // 적재 컨테이너
    for (const dz of [-8.6, -5.2, 3.8, 5.2, 6.6]) for (const s of [-1, 1]) {
      const [px, pz] = P(s * 1.05, dz);
      const w = new THREE.CylinderGeometry(0.5, 0.5, 0.35, 20);
      w.rotateZ(Math.PI / 2); if (along) w.rotateY(Math.PI / 2);
      w.translate(px, 0.5, pz);
      this.geo(w, M.rubber);
    }
    const [a, b] = P(0, -1);
    this.collider(a - (along ? 8.5 : 1.25), 0, b - (along ? 1.25 : 8.5), a + (along ? 8.5 : 1.25), 1.0, b + (along ? 1.25 : 8.5), 'metal');
  }

  _lamp(x, z, rot) {
    const M = this.mat;
    const pole = new THREE.CylinderGeometry(0.08, 0.13, 7.5, 12); pole.translate(x, 3.75, z); this.geo(pole, M.steel);
    const base = new THREE.CylinderGeometry(0.25, 0.3, 0.5, 12); base.translate(x, 0.25, z); this.geo(base, M.barrier);
    this.collider(x - 0.3, 0, z - 0.3, x + 0.3, 7.5, z + 0.3, 'metal');
    const dx = Math.sin(rot) * 1.4, dz = Math.cos(rot) * 1.4;
    const arm = new THREE.BoxGeometry(0.08, 0.08, 1.6); arm.rotateY(rot); arm.translate(x + dx / 2, 7.4, z + dz / 2); this.geo(arm, M.steel);
    const head = new RoundedBoxGeometry(0.55, 0.16, 0.8, 2, 0.05); head.rotateY(rot); head.translate(x + dx, 7.35, z + dz); this.geo(head, M.steel);
    const glow = new THREE.PlaneGeometry(0.42, 0.6); glow.rotateX(Math.PI / 2); glow.rotateY(rot); glow.translate(x + dx, 7.26, z + dz); this.geo(glow, M.lampGlow, false);
    const lx = x + dx, lz = z + dz;
    const light = new THREE.PointLight(0xff9340, 90, 24, 2);
    light.position.set(lx, 7.0, lz);
    this.root.add(light);
    // 빗속 빛줄기(가짜 볼류메트릭)
    const cone = new THREE.Mesh(new THREE.ConeGeometry(3.4, 7.0, 32, 1, true), this._beamMat());
    cone.position.set(lx, 3.6, lz);
    cone.renderOrder = 5;
    this.root.add(cone);
    this.lamps.push({ light, cone, pos: new THREE.Vector3(lx, 7, lz) });
  }

  _beamMat() {
    if (this._beam) return this._beam;
    this._beam = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
      uniforms: { uFlash: { value: 0 } },
      vertexShader: /* glsl */`
        varying float vH; varying vec3 vN; varying vec3 vV; varying float vDist;
        void main(){ vH = uv.y; vec4 mv = modelViewMatrix * vec4(position,1.0);
          vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); vDist = length(mv.xyz);
          gl_Position = projectionMatrix * mv; }`,
      fragmentShader: /* glsl */`
        varying float vH; varying vec3 vN; varying vec3 vV; varying float vDist;
        void main(){
          float edge = pow(abs(dot(vN, vV)), 2.0);
          float a = pow(vH, 1.6) * edge * 0.085 * smoothstep(0.0, 4.0, vDist) * exp(-vDist * 0.012);
          gl_FragColor = vec4(vec3(1.0, 0.56, 0.24) * a, 1.0);
        }`,
    });
    return this._beam;
  }

  _warehouse(cx, cz, w, d, h) {
    const M = this.mat, t = 0.4;
    const x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2;
    const B = (...a) => this.box(...a);
    // 북벽, 서벽
    B(cx, 0, z0, w, h, t, M.clad);
    B(x0, 0, cz, t, h, d, M.clad);
    // 남벽 (대형 셔터 개구부 7m × 5.5m)
    const doorW = 7, doorH = 5.5, dcx = cx + 2;
    const leftW = (dcx - doorW / 2) - x0, rightW = x1 - (dcx + doorW / 2);
    B(x0 + leftW / 2, 0, z1, leftW, h, t, M.clad);
    B(x1 - rightW / 2, 0, z1, rightW, h, t, M.clad);
    B(dcx, doorH, z1, doorW, h - doorH, t, M.clad);
    // 동벽 (출입구 5m × 4.5m)
    const eW = 5, eH = 4.5, ecz = cz - 2;
    const nW = (ecz - eW / 2) - z0, sW = z1 - (ecz + eW / 2);
    B(x1, 0, z0 + nW / 2, t, h, nW, M.clad);
    B(x1, 0, z1 - sW / 2, t, h, sW, M.clad);
    B(x1, eH, ecz, t, h - eH, eW, M.clad);
    // 지붕 + 처마
    B(cx, h, cz, w + 1.2, 0.35, d + 1.2, M.clad);
    // 문틀
    B(dcx - doorW / 2 - 0.15, 0, z1 + 0.25, 0.3, doorH, 0.15, M.yellow, { collide: false });
    B(dcx + doorW / 2 + 0.15, 0, z1 + 0.25, 0.3, doorH, 0.15, M.yellow, { collide: false });
    // 내부 랙 + 상자
    for (const rz of [cz - 4.5, cz + 0.5]) {
      for (let i = 0; i < 3; i++) {
        const rx = x0 + 4 + i * 6;
        for (const px of [-2.4, 2.4]) for (const pz of [-0.55, 0.55]) this.box(rx + px, 0, rz + pz, 0.1, 4.2, 0.1, M.yellow, { collide: false });
        for (const sy of [1.4, 2.8, 4.1]) this.box(rx, sy - 0.1, rz, 5, 0.1, 1.2, M.steel, { collide: false });
        this.collider(rx - 2.5, 0, rz - 0.65, rx + 2.5, 4.2, rz + 0.65, 'metal');
        for (const sy of [0, 1.4, 2.8]) for (const k of [-1.6, 0, 1.6]) if (Math.random() > 0.3) this.box(rx + k, sy, rz, 1.15, 1.15, 1.1, M.crate, { collide: false });
      }
    }
    // 지게차
    this.box(cx + 6, 0.3, cz + 4, 1.2, 1.3, 2.2, M.yellow);
    this.box(cx + 6, 0.3, cz + 2.7, 1.0, 2.6, 0.12, M.steel, { collide: false });
    // 천장 조명
    for (const lx of [cx - 6, cx + 6]) {
      const g = new THREE.BoxGeometry(2.4, 0.08, 0.5); g.translate(lx, h - 0.6, cz); this.geo(g, M.panelGlow, false);
    }
    const inner = new THREE.PointLight(0xcfe0ff, 55, 22, 2);
    inner.position.set(cx, h - 1.2, cz);
    this.root.add(inner);
    this.lamps.push({ light: inner });
  }

  _crane(x, z) {
    const M = this.mat;
    const legH = 42, span = 16;
    for (const dx of [-7, 7]) for (const dz of [0, -span]) {
      const g = new THREE.BoxGeometry(1.4, legH, 1.4); g.translate(x + dx, legH / 2, z + dz); this.geo(g, M.craneRed, false);
      if (dz === 0) this.collider(x + dx - 0.7, 0, z + dz - 0.7, x + dx + 0.7, legH, z + dz + 0.7, 'metal');
    }
    for (const dz of [0, -span]) { const g = new THREE.BoxGeometry(16, 1.6, 1.6); g.translate(x, legH, z + dz); this.geo(g, M.craneRed, false); }
    for (const dx of [-7, 7]) { const g = new THREE.BoxGeometry(1.2, 1.2, span); g.translate(x + dx, 14, z - span / 2); this.geo(g, M.craneRed, false); }
    // 붐(바다 쪽으로 뻗음) + 후방 거더
    const boom = new THREE.BoxGeometry(3, 2.4, 95); boom.translate(x, legH + 2.5, z - 30); this.geo(boom, M.steel, false);
    const cab = new THREE.BoxGeometry(3.4, 3, 3.4); cab.translate(x, legH - 1.5, z - 22); this.geo(cab, M.steel, false);
    for (const dz of [-70, 12]) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.35, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.05, 0.02).multiplyScalar(12) }));
      m.position.set(x, legH + 4, z + dz); this.root.add(m); this.blinkers.push(m);
    }
  }

  _background() {
    // 원경 도시 스카이라인 (인스턴싱)
    const count = 70;
    const g = new THREE.BoxGeometry(1, 1, 1); g.translate(0, 0.5, 0);
    const m = new THREE.MeshBasicMaterial({ map: this.tex.windows, color: 0xb0b0b0, fog: false });
    const inst = new THREE.InstancedMesh(g, m, count);
    const mat = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    let n = 0;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + Math.random() * 0.05;
      if (Math.sin(a) < -0.2 && Math.random() < 0.7) continue; // 북쪽(바다)은 드문드문
      const r = 220 + Math.random() * 160;
      p.set(Math.cos(a) * r, -2, Math.sin(a) * r);
      s.set(14 + Math.random() * 26, 25 + Math.random() * 110, 14 + Math.random() * 26);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.random() * Math.PI);
      inst.setMatrixAt(n++, mat.compose(p, q, s));
    }
    inst.count = n;
    this.root.add(inst);
    // 원경 안개 그라데이션(스카이라인 하단을 흐리게)
    const hz = new THREE.Mesh(new THREE.CylinderGeometry(200, 200, 60, 48, 1, true), new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.BackSide, fog: false,
      vertexShader: 'varying float vY; void main(){ vY = uv.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'varying float vY; void main(){ gl_FragColor = vec4(0.11,0.085,0.075, (1.0 - vY) * 0.85); }',
    }));
    hz.position.y = 25; hz.renderOrder = -5;
    this.root.add(hz); this.horizonRing = hz;
  }

  // ---------------- 비 ----------------
  _rain() {
    const MAX = 5200;
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(MAX * 2 * 3), seed = new Float32Array(MAX * 2 * 3), end = new Float32Array(MAX * 2);
    for (let i = 0; i < MAX; i++) {
      const s = [Math.random(), Math.random(), Math.random()];
      for (let k = 0; k < 2; k++) { seed.set(s, (i * 2 + k) * 3); end[i * 2 + k] = k; }
    }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 3));
    g.setAttribute('aEnd', new THREE.BufferAttribute(end, 1));
    g.setDrawRange(0, this.G.preset.rain * 2);
    this.rainU = { uTime: this.timeU, uCam: { value: new THREE.Vector3() }, uRoof: { value: this.roofRect }, uRoofY: { value: this.roofY }, uFlash: { value: 0 } };
    const m = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, fog: false, uniforms: this.rainU,
      vertexShader: /* glsl */`
        attribute vec3 aSeed; attribute float aEnd;
        uniform float uTime; uniform vec3 uCam; uniform vec4 uRoof; uniform float uRoofY;
        varying float vA;
        void main(){
          vec3 box = vec3(34.0, 20.0, 34.0);
          float speed = 14.0 + aSeed.y * 5.0;
          vec3 p;
          p.x = uCam.x + (fract(aSeed.x - uCam.x / box.x) - 0.5) * box.x;
          p.z = uCam.z + (fract(aSeed.z - uCam.z / box.z) - 0.5) * box.z;
          p.y = uCam.y + (fract(aSeed.y * 7.13 - uTime * speed / box.y - uCam.y / box.y) - 0.5) * box.y;
          p.x += (p.y - uCam.y) * 0.09;
          vec3 dir = normalize(vec3(0.09, 1.0, 0.02));
          p += dir * aEnd * (0.38 + aSeed.z * 0.25);
          float d = length(p.xz - uCam.xz);
          vA = (0.22 + aSeed.x * 0.18) * (1.0 - smoothstep(10.0, 17.0, d)) * smoothstep(0.6, 2.0, d);
          if (p.y < 0.0) vA = 0.0;
          if (p.x > uRoof.x && p.x < uRoof.z && p.z > uRoof.y && p.z < uRoof.w && p.y < uRoofY + 0.5) vA = 0.0;
          gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: /* glsl */`
        varying float vA; uniform float uFlash;
        void main(){ if (vA <= 0.001) discard; gl_FragColor = vec4(vec3(0.55,0.58,0.62) * (1.0 + uFlash * 3.0), vA); }`,
    });
    this.rainMesh = new THREE.LineSegments(g, m);
    this.rainMesh.frustumCulled = false;
    this.rainMesh.renderOrder = 6;
    this.root.add(this.rainMesh);

    // 지면 물방울 튀김
    const SP = 500;
    const sg = new THREE.BufferGeometry();
    const sp = new Float32Array(SP * 3), ss = new Float32Array(SP * 2);
    for (let i = 0; i < SP; i++) { ss[i * 2] = Math.random(); ss[i * 2 + 1] = Math.random(); }
    sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    sg.setAttribute('aSeed', new THREE.BufferAttribute(ss, 2));
    const sm = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, fog: false, uniforms: { uTime: this.timeU, uCam: this.rainU.uCam, uRoof: this.rainU.uRoof, uPx: { value: 800 } },
      vertexShader: /* glsl */`
        attribute vec2 aSeed; uniform float uTime; uniform vec3 uCam; uniform vec4 uRoof; uniform float uPx;
        varying float vA; varying float vPh;
        float h(float n){ return fract(sin(n) * 43758.5453); }
        void main(){
          float rate = 2.2 + aSeed.y;
          float t = uTime * rate + aSeed.x * 10.0;
          float cyc = floor(t); float ph = fract(t);
          vec3 p = vec3(uCam.x + (h(cyc * 1.7 + aSeed.x * 91.0) - 0.5) * 30.0, 0.03, uCam.z + (h(cyc * 2.3 + aSeed.y * 57.0) - 0.5) * 30.0);
          vA = (1.0 - ph) * 0.5; vPh = ph;
          if (p.x > uRoof.x && p.x < uRoof.z && p.z > uRoof.y && p.z < uRoof.w) vA = 0.0;
          vec4 mv = viewMatrix * vec4(p, 1.0);
          gl_PointSize = (0.05 + ph * 0.12) * uPx / -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */`
        varying float vA; varying float vPh;
        void main(){ vec2 c = gl_PointCoord - 0.5; float r = length(c) * 2.0;
          float ring = smoothstep(0.55, 0.8, r) * (1.0 - smoothstep(0.85, 1.0, r));
          float a = (ring + (1.0 - vPh) * (1.0 - r) * 0.6) * vA; if (a < 0.01) discard;
          gl_FragColor = vec4(vec3(0.6,0.63,0.68), a); }`,
    });
    this.splash = new THREE.Points(sg, sm);
    this.splash.frustumCulled = false;
    this.splash.renderOrder = 6;
    this.root.add(this.splash);
  }

  // ---------------- 충돌/레이캐스트 ----------------
  // 수평 원(반지름 r, 높이 y0~y1)을 박스 밖으로 밀어낸다. 반환: 접촉 여부
  collideCircle(pos, r, y0, y1) {
    let hit = false;
    for (const b of this.colliders) {
      if (y1 <= b.minY || y0 >= b.maxY) continue;
      const cx = Math.max(b.minX, Math.min(pos.x, b.maxX));
      const cz = Math.max(b.minZ, Math.min(pos.z, b.maxZ));
      let dx = pos.x - cx, dz = pos.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      hit = true;
      if (d2 > 1e-8) {
        const d = Math.sqrt(d2), push = r - d;
        pos.x += dx / d * push; pos.z += dz / d * push;
      } else {
        // 중심이 박스 안: 가장 얕은 축으로 밀기
        const pl = pos.x - b.minX + r, pr = b.maxX - pos.x + r, pb = pos.z - b.minZ + r, pf = b.maxZ - pos.z + r;
        const m = Math.min(pl, pr, pb, pf);
        if (m === pl) pos.x = b.minX - r; else if (m === pr) pos.x = b.maxX + r; else if (m === pb) pos.z = b.minZ - r; else pos.z = b.maxZ + r;
      }
    }
    return hit;
  }

  // (x,z) 원 아래에서 maxY 이하인 가장 높은 표면
  groundAt(x, z, r, maxY) {
    let g = 0;
    for (const b of this.colliders) {
      if (b.maxY > maxY || b.maxY <= g) continue;
      if (x + r <= b.minX || x - r >= b.maxX || z + r <= b.minZ || z - r >= b.maxZ) continue;
      g = b.maxY;
    }
    return g;
  }

  ceilingAt(x, z, r, y0, y1) {
    let c = Infinity;
    for (const b of this.colliders) {
      if (b.minY < y0 - 0.01 || b.minY > y1) continue;
      if (x + r <= b.minX || x - r >= b.maxX || z + r <= b.minZ || z - r >= b.maxZ) continue;
      c = Math.min(c, b.minY);
    }
    return c;
  }

  // 레이 vs AABB 목록 + 지면. 반환 {t, normal, surface} 또는 null
  raycast(o, d, maxT = 300) {
    let best = maxT, bn = null, bs = null, br = null;
    if (d.y < -1e-6) {
      const t = -o.y / d.y;
      if (t > 0 && t < best) { best = t; bn = [0, 1, 0]; bs = 'ground'; }
    }
    const ix = 1 / d.x, iy = 1 / d.y, iz = 1 / d.z;
    for (const b of this.colliders) {
      if (b.surface === 'invisible') continue;
      let t1 = (b.minX - o.x) * ix, t2 = (b.maxX - o.x) * ix;
      let tmin = Math.min(t1, t2), tmax = Math.max(t1, t2), ax = 0;
      t1 = (b.minY - o.y) * iy; t2 = (b.maxY - o.y) * iy;
      let ymin = Math.min(t1, t2), ymax = Math.max(t1, t2);
      if (ymin > tmin) { tmin = ymin; ax = 1; }
      tmax = Math.min(tmax, ymax);
      t1 = (b.minZ - o.z) * iz; t2 = (b.maxZ - o.z) * iz;
      const zmin = Math.min(t1, t2), zmax = Math.max(t1, t2);
      if (zmin > tmin) { tmin = zmin; ax = 2; }
      tmax = Math.min(tmax, zmax);
      if (tmax < Math.max(tmin, 0) || tmin >= best || tmin < 0) continue;
      best = tmin;
      bn = [0, 0, 0]; bn[ax] = ax === 0 ? -Math.sign(d.x) : ax === 1 ? -Math.sign(d.y) : -Math.sign(d.z);
      bs = b.surface; br = b.ref;
    }
    if (!bn) return null;
    return { t: best, normal: new THREE.Vector3(bn[0], bn[1], bn[2]), surface: bs, ref: br || null };
  }

  lineOfSight(a, b) {
    const d = new THREE.Vector3().subVectors(b, a);
    const len = d.length(); d.divideScalar(len);
    const h = this.raycast(a, d, len);
    return !h || h.t >= len - 0.05;
  }

  // ---------------- 길찾기 격자 (A*) ----------------
  _buildNavGrid() {
    const blocked = this.blocked = new Uint8Array(this.GN * this.GN);
    const pad = 0.45;
    for (const b of this.colliders) {
      if (b.minY > 1.6 || b.maxY < 0.3) continue;
      const i0 = Math.max(0, Math.floor((b.minX - pad + this.H) / GRID)), i1 = Math.min(this.GN - 1, Math.floor((b.maxX + pad + this.H) / GRID));
      const j0 = Math.max(0, Math.floor((b.minZ - pad + this.H) / GRID)), j1 = Math.min(this.GN - 1, Math.floor((b.maxZ + pad + this.H) / GRID));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) blocked[j * this.GN + i] = 1;
    }
    for (let k = 0; k < this.GN; k++) { blocked[k] = blocked[(this.GN - 1) * this.GN + k] = blocked[k * this.GN] = blocked[k * this.GN + this.GN - 1] = 1; }
    this._g = new Float32Array(this.GN * this.GN); this._from = new Int32Array(this.GN * this.GN); this._stamp = new Uint32Array(this.GN * this.GN); this._closed = new Uint32Array(this.GN * this.GN);
    this._run = 0;
  }

  cellOf(x, z) { return [Math.max(0, Math.min(this.GN - 1, Math.floor((x + this.H) / GRID))), Math.max(0, Math.min(this.GN - 1, Math.floor((z + this.H) / GRID)))]; }
  cellCenter(i, j) { return new THREE.Vector3(i * GRID - this.H + GRID / 2, 0, j * GRID - this.H + GRID / 2); }
  walkable(i, j) { return i >= 0 && j >= 0 && i < this.GN && j < this.GN && !this.blocked[j * this.GN + i]; }

  nearestWalkable(i, j) {
    if (this.walkable(i, j)) return [i, j];
    for (let r = 1; r < 12; r++) for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
      if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
      if (this.walkable(i + di, j + dj)) return [i + di, j + dj];
    }
    return [i, j];
  }

  findPath(from, to) {
    let [si, sj] = this.nearestWalkable(...this.cellOf(from.x, from.z));
    let [ti, tj] = this.nearestWalkable(...this.cellOf(to.x, to.z));
    const run = ++this._run;
    const g = this._g, fromA = this._from, stamp = this._stamp, closed = this._closed, B = this.blocked;
    const start = sj * this.GN + si, goal = tj * this.GN + ti;
    const heap = [], hf = [];
    const push = (n, f) => { heap.push(n); hf.push(f); let c = heap.length - 1; while (c > 0) { const p = (c - 1) >> 1; if (hf[p] <= hf[c]) break; [heap[p], heap[c]] = [heap[c], heap[p]]; [hf[p], hf[c]] = [hf[c], hf[p]]; c = p; } };
    const pop = () => { const top = heap[0]; const ln = heap.pop(), lf = hf.pop(); if (heap.length) { heap[0] = ln; hf[0] = lf; let c = 0; for (;;) { const l = c * 2 + 1, r = l + 1; let m = c; if (l < heap.length && hf[l] < hf[m]) m = l; if (r < heap.length && hf[r] < hf[m]) m = r; if (m === c) break; [heap[m], heap[c]] = [heap[c], heap[m]]; [hf[m], hf[c]] = [hf[c], hf[m]]; c = m; } } return top; };
    const hcost = (n) => { const dx = Math.abs((n % this.GN) - ti), dz = Math.abs(((n / this.GN) | 0) - tj); return Math.max(dx, dz) + 0.414 * Math.min(dx, dz); };
    g[start] = 0; stamp[start] = run; fromA[start] = -1; push(start, hcost(start));
    let found = false, iter = 0;
    while (heap.length && iter++ < 9000) {
      const n = pop();
      if (closed[n] === run) continue;
      closed[n] = run;
      if (n === goal) { found = true; break; }
      const ni = n % this.GN, nj = (n / this.GN) | 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const ai = ni + di, aj = nj + dj;
        if (ai < 0 || aj < 0 || ai >= this.GN || aj >= this.GN) continue;
        const a = aj * this.GN + ai;
        if (B[a] || closed[a] === run) continue;
        if (di && dj && (B[nj * this.GN + ai] || B[aj * this.GN + ni])) continue; // 모서리 끼임 방지
        const ng = g[n] + (di && dj ? 1.414 : 1);
        if (stamp[a] !== run || ng < g[a]) { stamp[a] = run; g[a] = ng; fromA[a] = n; push(a, ng + hcost(a)); }
      }
    }
    if (!found) return null;
    const cells = [];
    for (let n = goal; n !== -1; n = fromA[n]) cells.push(n);
    cells.reverse();
    // 경로 단순화: 직선으로 걸어갈 수 있으면 중간점 생략
    const pts = cells.map((n) => this.cellCenter(n % this.GN, (n / this.GN) | 0));
    const out = [];
    let k = 0;
    while (k < pts.length - 1) {
      let far = k + 1;
      for (let m = Math.min(pts.length - 1, k + 14); m > k + 1; m--) if (this._gridLine(pts[k], pts[m])) { far = m; break; }
      out.push(pts[far]); k = far;
    }
    return out;
  }

  _gridLine(a, b) {
    const d = a.distanceTo(b), n = Math.ceil(d / (GRID * 0.5));
    for (let s = 1; s < n; s++) {
      const t = s / n; const [i, j] = this.cellOf(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t);
      if (this.blocked[j * this.GN + i]) return false;
    }
    return true;
  }

  _spawns() {
    const cand = [[52, -52], [55, 0], [55, 54], [22, -54], [-54, 54], [-54, 14], [-52, -54], [0, -52], [40, 28], [-20, 54], [5, -15]];
    const snap = ([x, z]) => { const [i, j] = this.nearestWalkable(...this.cellOf(x, z)); return this.cellCenter(i, j); };
    this.spawnPoints = cand.map(snap);
    // 대전용: 팀 대전은 남쪽(알파)·북쪽(브라보) 진영, 개인전은 맵 전역
    this.teamSpawns = [
      [[-14, 51], [-4, 53], [6, 52], [16, 50], [-24, 52]].map(snap),
      [[-12, -46], [-2, -47], [8, -49], [14, -45], [-8, -54]].map(snap),
    ];
    this.ffaSpawns = [...this.spawnPoints, ...this.teamSpawns[0], ...this.teamSpawns[1], snap([-30, -18]), snap([20, 16])];
  }

  randomWalkableNear(p, radius) {
    for (let k = 0; k < 20; k++) {
      const x = p.x + (Math.random() - 0.5) * 2 * radius, z = p.z + (Math.random() - 0.5) * 2 * radius;
      const [i, j] = this.cellOf(x, z);
      if (this.walkable(i, j)) return this.cellCenter(i, j);
    }
    return p.clone();
  }

  // ---------------- 프레임 업데이트 ----------------
  // 그림자 카메라를 플레이어 주변으로 (텍셀 단위로 스냅해 떨림 방지)
  _followShadow(focus) {
    const sz = this.sun.shadow.mapSize.x || 2048;
    const span = this.sun.shadow.camera.right - this.sun.shadow.camera.left;
    const texel = span / sz;
    const fx = Math.round(focus.x / texel) * texel, fz = Math.round(focus.z / texel) * texel;
    this.sun.target.position.set(fx, 0, fz);
    this.sun.position.set(fx + this.sunDir.x * 110, this.sunDir.y * 110, fz + this.sunDir.z * 110);
  }

  update(dt, cam, focus) {
    this.timeU.value += dt;
    const t = this.timeU.value;
    if (this.tex.water) this.tex.water.offset.set(t * 0.004, t * 0.009);
    if (this.day) { this._followShadow(focus); return; }
    this.sky.position.copy(cam.position);
    this.horizonRing.position.x = cam.position.x; this.horizonRing.position.z = cam.position.z;
    this.rainU.uCam.value.copy(cam.position);

    this._followShadow(focus);

    // 번개
    this.nextLightning -= dt;
    if (this.nextLightning <= 0) {
      this.nextLightning = 14 + Math.random() * 26;
      this.flash = 1;
      this._flashSeq = [0, 0.09, 0.2];
      const dist = Math.random();
      this.G.audio.thunder(0.6 + dist * 2.4, 1.1 - dist * 0.5);
    }
    let f = 0;
    if (this.flash > 0) {
      this.flash = Math.max(0, this.flash - dt * 1.6);
      const flick = (Math.sin(t * 60) > 0.2 ? 1 : 0.35);
      f = this.flash * flick;
    }
    this.skyMat.uniforms.uFlash.value = f;
    this.rainU.uFlash.value = f;
    this.boltLight.intensity = f * 2.6;
    this.hemi.intensity = 0.55 + f * 1.6;

    // 항공 장애등 깜빡임
    const on = (t % 1.6) < 0.25;
    for (const b of this.blinkers) b.visible = on;
  }
}
