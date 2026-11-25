'use strict';
// Renderer, part 3: the image pipeline. The scene is drawn in linear light to an anti-aliased floating-point
// target, then gets contact shadowing from the depth buffer, glow round bright things, film tone mapping,
// a colour grade, vignette and grain. Used on the High setting only.
(function () {
  const X = G.gx;
  const VS = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
  const DEPTH = `uniform sampler2D tDepth; uniform vec4 uProj;
    float viewZ(vec2 uv) { float z = textureLod(tDepth, uv, 0.0).x * 2.0 - 1.0; return 2.0 * uProj.z * uProj.w / (uProj.w + uProj.z - z * (uProj.w - uProj.z)); }
    vec3 viewP(vec2 uv) { float z = viewZ(uv); return vec3((uv * 2.0 - 1.0) * uProj.xy * z, z); }`;
  const F = {
    // ambient occlusion: how much of the hemisphere above each point is blocked by nearby geometry
    ao: DEPTH + `
      uniform vec2 uTexel; uniform float uRad, uInt; varying vec2 vUv;
      void main() {
        vec3 P = viewP(vUv); if (P.z > 140.0) { gl_FragColor = vec4(1.0); return; }
        vec3 Pr = viewP(vUv + vec2(uTexel.x, 0.0)), Pl = viewP(vUv - vec2(uTexel.x, 0.0)), Pu = viewP(vUv + vec2(0.0, uTexel.y)), Pd = viewP(vUv - vec2(0.0, uTexel.y));
        vec3 dx = abs(Pr.z - P.z) < abs(P.z - Pl.z) ? Pr - P : P - Pl, dy = abs(Pu.z - P.z) < abs(P.z - Pd.z) ? Pu - P : P - Pd;
        vec3 N = normalize(cross(dy, dx));
        float n = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(.06711056, .00583715))));
        vec2 rs = min(uRad / P.z, .5) / (2.0 * uProj.xy); float occ = 0.0;
        for (int i = 0; i < 14; i++) {
          float th = (float(i) + n) * 2.399963, r = sqrt((float(i) + .5) / 14.0);
          vec3 v = viewP(vUv + vec2(cos(th), sin(th)) * r * rs) - P; float vv = dot(v, v);
          occ += max(0.0, dot(v, N) - .01 * P.z - .012) / (vv + .004) * max(0.0, 1.0 - vv / (uRad * uRad));
        }
        gl_FragColor = vec4(vec3(clamp(1.0 - occ * uInt / 14.0, 0.0, 1.0)), 1.0);
      }`,
    blur: DEPTH + `
      uniform sampler2D tSrc; uniform vec2 uTexel; varying vec2 vUv;
      void main() {
        float c = viewZ(vUv), s = 0.0, w = 0.0;
        for (int y = -2; y < 2; y++) for (int x = -2; x < 2; x++) { vec2 uv = vUv + (vec2(float(x), float(y)) + .5) * uTexel; float k = max(0.0, 1.0 - abs(viewZ(uv) - c) / (.06 * c + .03)) + .001; s += textureLod(tSrc, uv, 0.0).r * k; w += k; }
        gl_FragColor = vec4(vec3(s / w), 1.0);
      }`,
    down: `
      uniform sampler2D tSrc; uniform vec2 uTexel; uniform float uThr; varying vec2 vUv;
      float lum(vec3 c) { return dot(c, vec3(.2126, .7152, .0722)); }
      void main() {
        vec3 a = texture2D(tSrc, vUv + vec2(-1.0, -1.0) * uTexel).rgb, b = texture2D(tSrc, vUv + vec2(1.0, -1.0) * uTexel).rgb, c = texture2D(tSrc, vUv + vec2(-1.0, 1.0) * uTexel).rgb, d = texture2D(tSrc, vUv + vec2(1.0, 1.0) * uTexel).rgb;
        #ifdef FIRST
          float wa = 1.0 / (1.0 + lum(a)), wb = 1.0 / (1.0 + lum(b)), wc = 1.0 / (1.0 + lum(c)), wd = 1.0 / (1.0 + lum(d));
          vec3 col = (a * wa + b * wb + c * wc + d * wd) / (wa + wb + wc + wd); float l = lum(col);
          col *= max(l - uThr, 0.0) / max(l, 1e-4);
        #else
          vec3 col = (texture2D(tSrc, vUv).rgb * 4.0 + a + b + c + d) / 8.0;
        #endif
        gl_FragColor = vec4(min(col, vec3(40.0)), 1.0);
      }`,
    up: `
      uniform sampler2D tLow, tHigh; uniform vec2 uTexel; varying vec2 vUv;
      void main() {
        vec3 s = texture2D(tLow, vUv).rgb * 4.0;
        s += (texture2D(tLow, vUv + vec2(uTexel.x, 0.0)).rgb + texture2D(tLow, vUv - vec2(uTexel.x, 0.0)).rgb + texture2D(tLow, vUv + vec2(0.0, uTexel.y)).rgb + texture2D(tLow, vUv - vec2(0.0, uTexel.y)).rgb) * 2.0;
        s += texture2D(tLow, vUv + uTexel).rgb + texture2D(tLow, vUv - uTexel).rgb + texture2D(tLow, vUv + vec2(uTexel.x, -uTexel.y)).rgb + texture2D(tLow, vUv + vec2(-uTexel.x, uTexel.y)).rgb;
        gl_FragColor = vec4(texture2D(tHigh, vUv).rgb + s / 16.0, 1.0);
      }`,
    final: DEPTH + `
      uniform sampler2D tScene, tAO, tBloom; uniform float uExp, uBloom, uAO, uFogD, uTime, uSat, uCon, uVig, uGrain, uHurt, uGam; varying vec2 vUv;
      vec3 fit(vec3 v) { vec3 a = v * (v + .0245786) - .000090537, b = v * (.983729 * v + .4329510) + .238081; return a / b; }
      vec3 aces(vec3 c) {
        c = mat3(.59719, .07600, .02840, .35458, .90834, .13383, .04823, .01566, .83777) * (c / .6);
        return clamp(mat3(1.60475, -.10208, -.00327, -.53108, 1.10813, -.07276, -.07367, -.00605, 1.07602) * fit(c), 0.0, 1.0);
      }
      void main() {
        vec2 cc = vUv - .5; float r2 = dot(cc, cc); vec2 ca = cc * r2 * .007;
        vec3 col = vec3(texture2D(tScene, vUv - ca).r, texture2D(tScene, vUv).g, texture2D(tScene, vUv + ca).b);
        float z = viewZ(vUv), fogged = 1.0 - exp(-uFogD * uFogD * z * z);
        col *= mix(1.0, texture2D(tAO, vUv).r, uAO * (1.0 - fogged));
        col += texture2D(tBloom, vUv).rgb * uBloom;
        col = pow(aces(col * uExp), vec3(uGam));      // the gamma opens the shadows up without burning the sky
        float l = dot(col, vec3(.2126, .7152, .0722));
        col = mix(vec3(l), col, uSat);
        col += vec3(-.010, .002, .014) * (1.0 - l) * smoothstep(0.0, .05, l) + vec3(.014, .005, -.012) * l;      // cold shadows, warm lights
        col = pow(max(col, 0.0) / .18, vec3(uCon)) * .18;      // contrast about mid grey; a straight line here would cut everything in shadow to black
        col *= 1.0 - smoothstep(.1, .7, r2) * uVig;
        col = mix(col, vec3(l * .5 + .12, 0.0, 0.0), uHurt * smoothstep(.05, .5, r2));
        col = max(col, 0.0); col = mix(col * 12.92, 1.055 * pow(col, vec3(1.0 / 2.4)) - .055, step(.0031308, col));
        float g = fract(sin(dot(gl_FragCoord.xy + fract(uTime) * 61.0, vec2(12.9898, 78.233))) * 43758.5453) - .5;
        gl_FragColor = vec4(col + g * uGrain * (1.0 - l * .5), 1.0);
      }`
  };

  const post = X.post = { on: false, levels: 5 };
  let M = null, quad = null, fsScene = null, fsCam = null;
  function init() {
    const mk = (fs, uni, defines) => new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: fs, uniforms: uni, defines: defines || {}, depthTest: false, depthWrite: false });
    const proj = { value: new THREE.Vector4() };
    M = {
      proj,
      ao: mk(F.ao, { tDepth: { value: null }, uProj: proj, uTexel: { value: new THREE.Vector2() }, uRad: { value: .75 }, uInt: { value: .55 } }),
      blur: mk(F.blur, { tDepth: { value: null }, uProj: proj, tSrc: { value: null }, uTexel: { value: new THREE.Vector2() } }),
      first: mk(F.down, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uThr: { value: 1.1 } }, { FIRST: 1 }),
      down: mk(F.down, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uThr: { value: 0 } }),
      up: mk(F.up, { tLow: { value: null }, tHigh: { value: null }, uTexel: { value: new THREE.Vector2() } }),
      final: mk(F.final, { tDepth: { value: null }, uProj: proj, tScene: { value: null }, tAO: { value: null }, tBloom: { value: null }, uExp: { value: 1.05 }, uBloom: { value: .1 }, uAO: { value: 1 }, uFogD: { value: .016 }, uTime: X.U.time, uSat: { value: .85 }, uCon: { value: 1.06 }, uVig: { value: .5 }, uGrain: { value: .035 }, uHurt: { value: 0 }, uGam: { value: .9 } })
    };
    fsScene = new THREE.Scene(); fsCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), M.final); quad.frustumCulled = false; fsScene.add(quad);
  }
  post.dispose = function () {
    for (const t of post.all || []) { if (t.depthTexture) t.depthTexture.dispose(); t.dispose(); }
    post.all = [];
  };
  // returns false if this machine cannot do it, in which case the plain path is used
  post.setup = function () {
    const r = X.renderer; post.dispose(); if (!M) init();
    const size = r.getDrawingBufferSize(new THREE.Vector2()), w = size.x, h = size.y, all = post.all = [];
    const tgt = (tw, th, type) => { const t = new THREE.WebGLRenderTarget(Math.max(1, tw | 0), Math.max(1, th | 0), { type, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false, stencilBuffer: false }); t.texture.generateMipmaps = false; all.push(t); return t; };
    const rt = post.rt = new THREE.WebGLMultisampleRenderTarget(w, h, { type: THREE.HalfFloatType, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: true, stencilBuffer: false });
    rt.samples = 4; rt.texture.generateMipmaps = false; rt.depthTexture = new THREE.DepthTexture(w, h, THREE.UnsignedIntType); all.push(rt);
    post.ao1 = tgt(w / 2, h / 2, THREE.UnsignedByteType); post.ao2 = tgt(w / 2, h / 2, THREE.UnsignedByteType);
    post.b = []; post.u = []; for (let i = 0; i < post.levels; i++) { const k = 2 << i; post.b.push(tgt(w / k, h / k, THREE.HalfFloatType)); post.u.push(tgt(w / k, h / k, THREE.HalfFloatType)); }
    // make sure the target is really usable before trusting it
    r.setRenderTarget(rt); const gl = r.getContext(), ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE; r.setRenderTarget(null);
    post.on = ok; if (!ok) post.dispose();
    r.toneMapping = ok ? THREE.NoToneMapping : THREE.ACESFilmicToneMapping;
    return ok;
  };
  post.off = function () { post.on = false; post.dispose(); if (X.renderer) X.renderer.toneMapping = THREE.ACESFilmicToneMapping; };
  post.resize = function () { if (post.on) post.setup(); };
  const pass = (m, target) => { quad.material = m; X.renderer.setRenderTarget(target); X.renderer.render(fsScene, fsCam); };
  // o: { exposure, sat, contrast, hurt, fogD, ao, bloom, gamma }
  post.render = function (scene, cam, o) {
    if (post.ov) o = Object.assign({}, o, post.ov);      // tuning hook
    const r = X.renderer, rt = post.rt, t = Math.tan(cam.fov * Math.PI / 360);
    M.proj.value.set(t * cam.aspect, t, cam.near, cam.far);
    r.setRenderTarget(rt); r.render(scene, cam);
    const dt = rt.depthTexture;
    M.ao.uniforms.tDepth.value = dt; M.ao.uniforms.uTexel.value.set(1 / post.ao1.width, 1 / post.ao1.height); pass(M.ao, post.ao1);
    M.blur.uniforms.tDepth.value = dt; M.blur.uniforms.tSrc.value = post.ao1.texture; M.blur.uniforms.uTexel.value.set(1 / post.ao1.width, 1 / post.ao1.height); pass(M.blur, post.ao2);
    const b = post.b, u = post.u, n = post.levels;
    M.first.uniforms.tSrc.value = rt.texture; M.first.uniforms.uTexel.value.set(1 / rt.width, 1 / rt.height); pass(M.first, b[0]);
    for (let i = 1; i < n; i++) { M.down.uniforms.tSrc.value = b[i - 1].texture; M.down.uniforms.uTexel.value.set(1 / b[i - 1].width, 1 / b[i - 1].height); pass(M.down, b[i]); }
    for (let i = n - 2; i >= 0; i--) { const low = i === n - 2 ? b[n - 1] : u[i + 1]; M.up.uniforms.tLow.value = low.texture; M.up.uniforms.tHigh.value = b[i].texture; M.up.uniforms.uTexel.value.set(1 / low.width, 1 / low.height); pass(M.up, u[i]); }
    const f = M.final.uniforms; f.tDepth.value = dt; f.tScene.value = rt.texture; f.tAO.value = post.ao2.texture; f.tBloom.value = u[0].texture;
    f.uExp.value = o.exposure; f.uSat.value = o.sat; f.uCon.value = o.contrast; f.uHurt.value = o.hurt || 0; f.uFogD.value = o.fogD; f.uAO.value = o.ao === undefined ? 1 : o.ao; f.uBloom.value = o.bloom === undefined ? .1 : o.bloom; f.uGam.value = o.gamma === undefined ? .9 : o.gamma;
    pass(M.final, null);
  };
})();
