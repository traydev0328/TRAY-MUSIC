// 후처리 — 메인 렌더 → (GTAO) → 뷰모델 → 블룸 → 톤매핑 → 시네마틱 그레이딩 → FXAA
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null }, uTime: { value: 0 }, uDamage: { value: 0 }, uLowHp: { value: 0 },
    uRes: { value: new THREE.Vector2(1, 1) }, uCA: { value: 0.0014 }, uGrain: { value: 0.045 },
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform float uTime, uDamage, uLowHp, uCA, uGrain; uniform vec2 uRes;
    varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233)) + uTime * 61.7) * 43758.5453); }
    void main(){
      vec2 c = vUv - 0.5; float r2 = dot(c, c);
      float ca = uCA * (1.0 + uDamage * 4.0);
      vec3 col;
      col.r = texture2D(tDiffuse, vUv - c * ca * 2.0).r;
      col.g = texture2D(tDiffuse, vUv).g;
      col.b = texture2D(tDiffuse, vUv + c * ca * 2.0).b;
      // 색 보정: 그림자는 청록, 밝은 곳은 따뜻하게 (스플릿 토닝)
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(col, col * vec3(0.92, 1.0, 1.06), (1.0 - smoothstep(0.0, 0.35, l)) * 0.5);
      col = mix(col, col * vec3(1.05, 1.0, 0.94), smoothstep(0.45, 1.0, l) * 0.5);
      col = mix(vec3(l), col, 1.06 - uLowHp * 0.85);              // 채도 (저체력 시 탈색)
      col = (col - 0.5) * 1.04 + 0.5;                              // 대비
      float vig = smoothstep(0.85, 0.18, r2 * 1.25);
      col *= mix(0.62, 1.0, vig);
      col = mix(col, vec3(0.55, 0.02, 0.0), (1.0 - vig) * clamp(uDamage * 0.9 + uLowHp * 0.35, 0.0, 0.85));
      col += (h(vUv * uRes) - 0.5) * uGrain;
      gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
    }`,
};

export class Post {
  constructor(G) {
    this.G = G;
    const r = G.renderer;
    this.composer = new EffectComposer(r);
    this.mainPass = new RenderPass(G.scene, G.camera);
    this.vmPass = new RenderPass(G.weapons.vmScene, G.weapons.vmCam);
    this.vmPass.clear = false; this.vmPass.clearDepth = true;
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.55, 0.55, 0.92);
    this.output = new OutputPass();
    this.grade = new ShaderPass(GradeShader);
    this.fxaa = new ShaderPass(FXAAShader);
    this.composer.addPass(this.mainPass);
    this.aoSlot = 1;
    this.composer.addPass(this.vmPass);
    this.composer.addPass(this.bloom);
    this.composer.addPass(this.output);
    this.composer.addPass(this.grade);
    this.composer.addPass(this.fxaa);
    this.gtao = null;
  }

  async setAO(on) {
    if (on && !this.gtao) {
      const { GTAOPass } = await import('three/addons/postprocessing/GTAOPass.js');
      const s = new THREE.Vector2(); this.G.renderer.getSize(s);
      this.gtao = new GTAOPass(this.G.scene, this.G.camera, s.x, s.y);
      this.gtao.blendIntensity = 0.85;
      this.gtao.updateGtaoMaterial({ radius: 0.6, distanceExponent: 1.4, thickness: 1.2, scale: 1 });
      this.composer.insertPass(this.gtao, this.aoSlot);
      this.resize();
    }
    if (this.gtao) this.gtao.enabled = on;
  }

  apply(q) {
    this.bloom.enabled = q.bloom;
    this.setAO(q.ao);
  }

  resize() {
    const r = this.G.renderer, pr = r.getPixelRatio();
    const w = window.innerWidth, h = window.innerHeight;
    this.composer.setPixelRatio(pr);
    this.composer.setSize(w, h);
    this.fxaa.material.uniforms.resolution.value.set(1 / (w * pr), 1 / (h * pr));
    this.grade.uniforms.uRes.value.set(w * pr, h * pr);
  }

  render(dt) {
    const u = this.grade.uniforms;
    u.uTime.value = (u.uTime.value + dt) % 100;
    this.composer.render(dt);
  }
}
