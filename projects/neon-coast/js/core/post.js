/* NEON COAST — Pós-processamento leve (inspirado no Proper Shaders: SMAA/CAS, SimulateHDR, bloom) + resolução dinâmica.
   A cena é desenhada numa textura em escala variável (sobe e desce sozinha para manter ~60 fps) e um único passe final aplica:
   anti-aliasing (FXAA), nitidez, exposição/contraste/saturação, tom filmico suave, bloom barato (1/4 da resolução), vinheta e ruído anti-banding.
   Sem MSAA (que pesa muito em placas integradas). */
'use strict';
const POST = {
  enabled: true, scale: 1, minScale: 0.5, maxScale: 1, bloom: true, shadows: true,
  rt: null, bloomA: null, bloomB: null, cam: new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), scene: new THREE.Scene(),
  ft: 16.7, acc: 0, n: 0, cool: 0, warmup: 2.5
};
const POST_VERT = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
POST.mFinal = new THREE.ShaderMaterial({
  uniforms: { tScene: { value: null }, tBloom: { value: null }, uTexel: { value: new THREE.Vector2(1, 1) }, uNight: { value: 0 }, uBloom: { value: 0.2 }, uTime: { value: 0 }, uAim: { value: 0 } },
  vertexShader: POST_VERT,
  fragmentShader: `
    precision highp float; varying vec2 vUv; uniform sampler2D tScene, tBloom; uniform vec2 uTexel; uniform float uNight, uBloom, uTime, uAim;
    float luma(vec3 c){ return dot(c, vec3(0.299, 0.587, 0.114)); }
    vec3 aces(vec3 x){ return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
    void main(){
      vec2 uv = vUv, t = uTexel;
      vec3 rgbM = texture2D(tScene, uv).rgb, rgbNW = texture2D(tScene, uv + vec2(-1.0, -1.0) * t).rgb, rgbNE = texture2D(tScene, uv + vec2(1.0, -1.0) * t).rgb,
           rgbSW = texture2D(tScene, uv + vec2(-1.0, 1.0) * t).rgb, rgbSE = texture2D(tScene, uv + vec2(1.0, 1.0) * t).rgb;
      float lM = luma(rgbM), lNW = luma(rgbNW), lNE = luma(rgbNE), lSW = luma(rgbSW), lSE = luma(rgbSE);
      float lMin = min(lM, min(min(lNW, lNE), min(lSW, lSE))), lMax = max(lM, max(max(lNW, lNE), max(lSW, lSE)));
      vec2 dir = vec2(-((lNW + lNE) - (lSW + lSE)), ((lNW + lSW) - (lNE + lSE)));
      float dirReduce = max((lNW + lNE + lSW + lSE) * 0.03125, 1.0 / 128.0), rcp = 1.0 / (min(abs(dir.x), abs(dir.y)) + dirReduce);
      dir = clamp(dir * rcp, vec2(-8.0), vec2(8.0)) * t;
      vec3 a = 0.5 * (texture2D(tScene, uv + dir * (1.0 / 3.0 - 0.5)).rgb + texture2D(tScene, uv + dir * (2.0 / 3.0 - 0.5)).rgb);
      vec3 b = a * 0.5 + 0.25 * (texture2D(tScene, uv + dir * -0.5).rgb + texture2D(tScene, uv + dir * 0.5).rgb);
      float lB = luma(b); vec3 c = (lB < lMin || lB > lMax) ? a : b;
      // nitidez leve (CAS simplificado) com as amostras que já temos
      vec3 blur = (rgbNW + rgbNE + rgbSW + rgbSE) * 0.25; c += (c - blur) * 0.22;
      // bloom
      c += texture2D(tBloom, uv).rgb * uBloom;
      // exposição / contraste / saturação (dia e noite) e tom filmico suave
      c *= mix(1.04, 1.0, uNight); c = (c - 0.5) * mix(1.06, 1.12, uNight) + 0.5; float l = luma(c); c = mix(vec3(l), c, 1.16);
      c = mix(c, aces(max(c, 0.0) * 1.05), 0.4);
      // vinheta (mais forte ao mirar) e dithering
      vec2 q = uv - 0.5; float v = 1.0 - dot(q, q) * (0.55 + uAim * 0.5); c *= clamp(v, 0.0, 1.0);
      float n = fract(sin(dot(uv * 1000.0 + uTime, vec2(12.9898, 78.233))) * 43758.5453); c += (n - 0.5) / 255.0;
      gl_FragColor = vec4(c, 1.0);
    }`,
  depthTest: false, depthWrite: false
});
POST.mBright = new THREE.ShaderMaterial({
  uniforms: { tScene: { value: null }, uTexel: { value: new THREE.Vector2(1, 1) } }, vertexShader: POST_VERT,
  fragmentShader: `precision highp float; varying vec2 vUv; uniform sampler2D tScene; uniform vec2 uTexel;
    void main(){ vec3 c = texture2D(tScene, vUv + vec2(-1.0, -1.0) * uTexel).rgb + texture2D(tScene, vUv + vec2(1.0, -1.0) * uTexel).rgb + texture2D(tScene, vUv + vec2(-1.0, 1.0) * uTexel).rgb + texture2D(tScene, vUv + vec2(1.0, 1.0) * uTexel).rgb; c *= 0.25;
      float l = dot(c, vec3(0.299, 0.587, 0.114)); gl_FragColor = vec4(c * smoothstep(0.62, 0.95, l), 1.0); }`, depthTest: false, depthWrite: false
});
POST.mBlur = new THREE.ShaderMaterial({
  uniforms: { tScene: { value: null }, uDir: { value: new THREE.Vector2(1, 0) } }, vertexShader: POST_VERT,
  fragmentShader: `precision highp float; varying vec2 vUv; uniform sampler2D tScene; uniform vec2 uDir;
    void main(){ vec3 c = texture2D(tScene, vUv).rgb * 0.2270270270 + (texture2D(tScene, vUv + uDir * 1.3846153846).rgb + texture2D(tScene, vUv - uDir * 1.3846153846).rgb) * 0.3162162162 + (texture2D(tScene, vUv + uDir * 3.2307692308).rgb + texture2D(tScene, vUv - uDir * 3.2307692308).rgb) * 0.0702702703; gl_FragColor = vec4(c, 1.0); }`, depthTest: false, depthWrite: false
});
renderer.shadowMap.autoUpdate = false; POST.st = 0;
POST.tri = new THREE.Mesh(new THREE.BufferGeometry(), POST.mFinal); POST.tri.frustumCulled = false;
POST.tri.geometry.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3)); POST.tri.geometry.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
POST.scene.add(POST.tri);

function postResize() {
  const w = renderer.domElement.width, h = renderer.domElement.height; if (!w || !h) return;
  const sw = Math.max(64, Math.round(w * POST.scale)), sh = Math.max(64, Math.round(h * POST.scale)), opt = { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBAFormat, depthBuffer: true, stencilBuffer: false };
  if (POST.rt) POST.rt.dispose();
  POST.rt = new THREE.WebGLRenderTarget(sw, sh, opt);
  const bw = Math.max(32, sw >> 2), bh = Math.max(32, sh >> 2), bo = { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBAFormat, depthBuffer: false };
  if (POST.bloomA) { POST.bloomA.dispose(); POST.bloomB.dispose(); }
  POST.bloomA = new THREE.WebGLRenderTarget(bw, bh, bo); POST.bloomB = new THREE.WebGLRenderTarget(bw, bh, bo);
  POST.mFinal.uniforms.uTexel.value.set(1 / sw, 1 / sh);
}
function postPass(mat, target) { POST.tri.material = mat; renderer.setRenderTarget(target); renderer.render(POST.scene, POST.cam); }
/* substitui renderer.render(scene, camera) */
function postRender(aim) {
  if (!POST.enabled || !POST.rt) { renderer.render(scene, camera); return; }
  const u = POST.mFinal.uniforms;
  // o mapa de sombras é refeito a cada 2 quadros (metade do custo; ninguém percebe) e a cada 3 se o jogo estiver apertado
  POST.st = (POST.st + 1) % (POST.ft > 22 ? 3 : 2); renderer.shadowMap.needsUpdate = POST.st === 0;
  renderer.setRenderTarget(POST.rt); renderer.render(scene, camera);
  const doBloom = POST.bloom && POST.scale > 0.62;
  if (doBloom) {
    const bw = POST.bloomA.width, bh = POST.bloomA.height;
    POST.mBright.uniforms.tScene.value = POST.rt.texture; POST.mBright.uniforms.uTexel.value.set(1 / POST.rt.width, 1 / POST.rt.height); postPass(POST.mBright, POST.bloomA);
    POST.mBlur.uniforms.tScene.value = POST.bloomA.texture; POST.mBlur.uniforms.uDir.value.set(1 / bw, 0); postPass(POST.mBlur, POST.bloomB);
    POST.mBlur.uniforms.tScene.value = POST.bloomB.texture; POST.mBlur.uniforms.uDir.value.set(0, 1 / bh); postPass(POST.mBlur, POST.bloomA);
    u.tBloom.value = POST.bloomA.texture;
  } else u.tBloom.value = POST.rt.texture;
  u.tScene.value = POST.rt.texture; u.uBloom.value = doBloom ? lerp(0.22, 0.75, typeof nightF === 'number' ? nightF : 0) : 0; u.uNight.value = typeof nightF === 'number' ? nightF : 0;
  u.uTime.value = (performance.now() % 1000) / 1000; u.uAim.value = aim ? 1 : 0;
  postPass(POST.mFinal, null);
}
/* resolução dinâmica: mantém ~60 fps sem o jogador mexer em nada */
function adaptResolution(rawMs) {
  if (rawMs > 250 || rawMs <= 0) return;
  POST.warmup -= rawMs / 1000; if (POST.warmup > 0) return;                       // ignora o início (compilação de shaders, carregamento)
  POST.acc += rawMs; POST.n++;
  if (POST.acc < 900 || POST.n < 12) return;
  const avg = POST.acc / POST.n; POST.acc = 0; POST.n = 0; POST.ft = avg; POST.cool -= 1;
  let s = POST.scale;
  if (avg > 19.5 && s > POST.minScale) s = Math.max(POST.minScale, s - (avg > 30 ? 0.14 : 0.07));
  else if (avg < 14.2 && s < POST.maxScale && POST.cool <= 0) s = Math.min(POST.maxScale, s + 0.04);
  if (avg > 26 && s <= POST.minScale + 0.01 && POST.shadows) { POST.shadows = false; sunLight.castShadow = false; }
  if (Math.abs(s - POST.scale) > 0.001) { POST.scale = s; POST.cool = 4; postResize(); }
}
postResize();
