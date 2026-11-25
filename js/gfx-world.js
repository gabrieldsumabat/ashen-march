'use strict';
// Renderer, part 4: the world — sky and light, ground, walls, roofs, plants, water, props, fire and smoke.
(function () {
  const X = G.gx, gfx = G.gfx, S = G.S, TL = G.TILE, PI = Math.PI, rand = G.rand, lerp = G.lerp, U = X.U;
  const { mat, mesh, box, ball, shape, patch, ins, merge, lin, uvScale, shade } = X;
  const COVER = { clear: .42, overcast: .86, rain: .95, storm: 1, fog: .9 }, SKYB = { clear: 1.15, overcast: 1, rain: .8, storm: .52, fog: .95 };
  // under cloud the light comes from the whole sky, not from the sun: weak shadows, no hard glints
  const SUNI = { clear: 1.9, overcast: .34, rain: .22, storm: .12, fog: .16 }, HEMI = { clear: .7, overcast: 1.5, rain: 1.4, storm: 1.05, fog: 1.4 };
  const TREES = { dunmere: [.45, .4, .15], abbey: [.12, .64, .24], hold: [.72, .2, .08] };
  const RIPPLE = `
    float gHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    vec2 gRipple(vec2 p, float t) {
      vec2 c = floor(p), f = p - c - .5; float h = gHash(c), ph = fract(t * (.7 + h * .5) + h * 9.0);
      vec2 d = f - (vec2(gHash(c + 3.1), gHash(c + 7.7)) - .5) * .5; float r = length(d) + 1e-4, rr = ph * .42;
      return d / r * sin((r - rr) * 44.0) * smoothstep(.07, 0.0, abs(r - rr)) * (1.0 - ph);
    }`;
  const OUT = '\n#include <tonemapping_fragment>\n#include <encodings_fragment>\n';

  // ------------------------------------------------------------------ sky
  function makeSky(tx) {
    const m = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { uTop: { value: new THREE.Color() }, uHor: { value: new THREE.Color() }, uGlow: { value: new THREE.Color() }, uSunDir: U.sunDir, uSunCol: U.sunCol, uCloud: { value: tx.cloud }, uTime: U.time, uCover: { value: .8 }, uDark: { value: .55 }, uFlash: { value: 0 } },
      vertexShader: 'varying vec3 vDir; void main() { vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `
        uniform vec3 uTop, uHor, uGlow, uSunDir, uSunCol; uniform sampler2D uCloud; uniform float uTime, uCover, uDark, uFlash; varying vec3 vDir;
        void main() {
          vec3 d = normalize(vDir); float e = max(d.y, 0.0), s = max(dot(d, uSunDir), 0.0);
          vec2 p = d.xz / (e + .09), wv = vec2(uTime * .006, uTime * .0035);
          float n = texture2D(uCloud, p * .035 + wv).r * .55 + texture2D(uCloud, p * .09 + wv * 1.7).g * .3 + texture2D(uCloud, p * .23 + wv * 2.6).b * .15;
          float cl = smoothstep(.64 - uCover * .44, .84 - uCover * .44, n), dn = smoothstep(.3, .78, n);
          vec3 cloud = mix(uHor * 1.2, uTop * uDark, dn) + uGlow * pow(s, 6.0) * (1.0 - dn * .8);
          vec3 col = mix(mix(uHor, uTop, pow(e, .45)), cloud, cl);
          col += uGlow * (pow(s, 400.0) * 8.0 + pow(s, 30.0) * .5) * (1.0 - cl);
          vec3 hz = uHor + uSunCol * (pow(s, 5.0) * .5 + pow(s, 40.0) * .8);
          col = mix(col, hz, exp(-e * 7.0)) + uFlash * (.25 + n * .75);
          gl_FragColor = vec4(d.y < 0.0 ? hz : col, 1.0);${OUT}
        }`
    });
    const s = new THREE.Mesh(new THREE.SphereGeometry(440, 32, 16), m); s.frustumCulled = false; s.renderOrder = -10; return s;
  }
  // a small blurred copy of the sky that polished and wet things reflect
  function makeEnv(sky, tx) {
    const pm = new THREE.PMREMGenerator(X.renderer), sc = new THREE.Scene(), sm = sky.material.clone(); sm.uniforms.uCloud.value = tx.cloud;
    const a = new THREE.Mesh(new THREE.SphereGeometry(80, 24, 12), sm), b = new THREE.Mesh(new THREE.CircleGeometry(79, 16), new THREE.MeshBasicMaterial({ color: new THREE.Color(.02, .02, .016), side: THREE.DoubleSide, fog: false }));
    b.rotation.x = -PI / 2; b.position.y = -4; sc.add(a); sc.add(b);
    const rt = pm.fromScene(sc, 0, .1, 200); pm.dispose(); a.geometry.dispose(); b.geometry.dispose(); sm.dispose(); b.material.dispose();
    return rt;
  }
  // light and air for this moment: k = how far dusk has come (0-1), flash = lightning, sv = how much sky the player stands under (0-1)
  const _c = new THREE.Color();
  X.atmo = function (k, flash, sv, dt) {
    const wx = X.weather, env = X.world.meta.env, cover = COVER[wx.id] === undefined ? .85 : COVER[wx.id], skb = SKYB[wx.id] || 1;
    const dim = lerp(1, .05, k) * skb, warm = Math.pow(Math.sin(Math.min(1, k * 1.25) * PI), 2) * .5 * Math.min(1.2, wx.sun), sI = lerp(SUNI[wx.id] || .6, 0, Math.min(1, k * 1.4));
    X.sunOff.set(-58 - k * 22, 52 - k * 40, 34); U.sunDir.value.copy(X.sunOff).normalize();
    X.sun.intensity = sI; X.sun.color.setRGB(1, lerp(.91, .6, warm * 2), lerp(.78, .34, warm * 2));
    X.hemi.intensity = lerp(HEMI[wx.id] || 1.2, .17, k) + flash * 1.6; X.eyeLight.intensity = k * 1.3;
    const hor = X.scene.fog.color.copy(X.FOGC).multiplyScalar(.56 * dim + flash * .5); hor.r *= 1 + warm * .7; hor.b *= 1 - warm * .5;
    if (X.hillM) X.hillM.color.copy(hor);      // the far hills are all haze: they take the colour of the horizon, a shade darker
    const su = X.sky.material.uniforms; su.uHor.value.copy(hor);
    su.uTop.value.copy(hor).multiplyScalar(.6).lerp(_c.setRGB(.13 * dim * (1 + warm), .21 * dim, .38 * dim), (1 - cover) * .9);
    su.uCover.value = cover; su.uDark.value = wx.storm ? .34 : .58; su.uFlash.value = flash * .6;
    su.uGlow.value.copy(X.sun.color).multiplyScalar(sI * .3 * (1.15 - cover));
    U.sunCol.value.copy(X.sun.color).multiplyScalar(sI * .075 * (1.1 - cover * .7) * (.5 + warm));
    const dens = lerp(env.dens * .82, .05, k) * wx.fog, mist = (env.mist === undefined ? .007 : env.mist) * wx.fog * wx.fog * lerp(1, 1.8, k);
    U.fogA.value.set(dens, mist, .3, 0); X.scene.fog.density = dens;
    const q = Math.min(1, (dt || 1) * .8);
    U.wet.value = lerp(U.wet.value, Math.max(env.damp === undefined ? .14 : env.damp, wx.rain), q); U.rain.value = wx.rain; U.wind.value = .7 + wx.rain * .8 + (wx.storm ? .9 : 0);
    X.expo = lerp(X.expo || 1.35, 1.35 * Math.pow(Math.max(.2, sv), -.5) * lerp(1, 1.5, k), Math.min(1, (dt || 1) * 1.4));      // eyes open up in the dark
    const ei = dim * 1.1; for (const m of X.envMats) m.envMapIntensity = ei * (m.userData.env || 1);
    X.smokeCol.value.copy(hor).multiplyScalar(1.1); X.rainM.color.copy(hor).multiplyScalar(2.6);
    return { fogD: dens, dim };
  };
  // show only the plants near enough to be seen through the air
  X.cull = function (cx, cz) {
    const far = Math.min(170, 2.15 / Math.max(.004, U.fogA.value.x));
    for (const c of X.chunks) { const d = Math.hypot(c.x - cx, c.z - cz) - c.rad; c.m.visible = d < Math.min(far, c.r) && d >= c.min; }      // min: a plainer stand-in, drawn only from further off
  };

  function clearScene() {
    if (!X.scene) return;
    const keep = new Set(X.matList()); X.scene.remove(X.camera);
    X.scene.traverse(o => { if (o.geometry) o.geometry.dispose(); const m = o.material; if (m && !keep.has(m)) m.dispose(); if (o.customDepthMaterial) o.customDepthMaterial.dispose(); });
    for (const t of X.trash || []) t.dispose();
  }

  // ------------------------------------------------------------------ world
  gfx.build = function (w) {
    const env = w.meta.env, cam = X.camera, r = X.renderer, q = X.quality();
    clearScene(); X.trash = []; X.resize(); r.shadowMap.enabled = q.shadows;
    if (q.post) X.post.setup(); else X.post.off();
    const tx = X.textures();
    if (X.qWas !== q.level + X.post.on) { for (const m of X.matList()) m.needsUpdate = true; X.qWas = q.level + X.post.on; }
    X.world = w; X.fires = []; X.parts = []; X.doorM = {}; X.chunks = []; X.envMats = X.envMats.filter(m => m.userData.cls);
    X.FOGC = lin(env.fog);
    const scene = X.scene = new THREE.Scene(); scene.add(cam);
    scene.fog = new THREE.FogExp2(0, env.dens); scene.background = new THREE.Color(0);
    X.hemi = new THREE.HemisphereLight(0xaebccb, 0x514b3e, .7); scene.add(X.hemi);
    const sun = X.sun = new THREE.DirectionalLight(0xffe9c8, 1.5); scene.add(sun); scene.add(sun.target); X.sunOff = new THREE.Vector3();
    sun.castShadow = q.shadows; sun.shadow.mapSize.set(q.shadowSize, q.shadowSize); sun.shadow.bias = -.0005; sun.shadow.normalBias = .04;
    const sc = sun.shadow.camera; sc.left = sc.bottom = -46; sc.right = sc.top = 46; sc.near = 1; sc.far = 220; sc.updateProjectionMatrix();
    if (X.eyeLight) cam.remove(X.eyeLight);
    X.eyeLight = new THREE.PointLight(0x8794ac, 0, 15); cam.add(X.eyeLight);
    X.lights = []; for (let i = 0; i < 5; i++) { const l = new THREE.PointLight(0xff8a3a, 0, 24, 1.6); scene.add(l); X.lights.push(l); }
    X.sky = makeSky(tx); scene.add(X.sky);
    X.smokeCol = { value: new THREE.Color() };
    const RN = q.low ? 900 : 2200, rp = X.rainPos = new Float32Array(RN * 6);
    for (let i = 0; i < RN; i++) { const x = rand(-16, 16), y = rand(0, 14), z = rand(-16, 16); rp.set([x, y, z, x + .04, y - .7, z], i * 6); }
    const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.BufferAttribute(rp, 3));
    X.rainM = new THREE.LineBasicMaterial({ transparent: true, opacity: .2, depthWrite: false }); X.rain = new THREE.LineSegments(rg, X.rainM); X.rain.frustumCulled = false; scene.add(X.rain);
    X.atmo(0, 0, 1, 1); U.wet.value = Math.max(env.damp === undefined ? .14 : env.damp, X.weather.rain);
    X.env = makeEnv(X.sky, tx); X.trash.push(X.env);
    for (const m of X.envMats) m.envMap = X.env.texture;
    const envOn = (m, k) => { m.envMap = X.env.texture; m.userData.env = k || 1; X.envMats.push(m); return m; };

    const W = w.w, H = w.h, t = w.t, at = (x, y) => (x < 0 || y < 0 || x >= W || y >= H) ? TL.TREE : t[x + y * W];
    const roofed = new Uint8Array(W * H), wallH = new Float32Array(W * H);
    for (const b of w.buildings) if (b.roof === 'thatch' || b.roof === 'slab') for (let y = b.y; y < b.y + b.h; y++) for (let x = b.x; x < b.x + b.w; x++) { roofed[x + y * W] = 1; wallH[x + y * W] = b.wallH; }
    X.roofed = roofed;
    const wallish = v => v === TL.SWALL || v === TL.WWALL || v === TL.LOW || v === TL.DOOR, built = v => v === TL.WOOD || v === TL.STONE || v === TL.COBBLE || wallish(v);

    // ---- one small map of the whole place: r = how natural the ground is, g = open to the rain, b = how much sky light reaches it
    {
      const c1 = document.createElement('canvas'); c1.width = W; c1.height = H; const g1 = c1.getContext('2d'), id = g1.createImageData(W, H), d = id.data;
      const sa = X.skyArr = new Float32Array(W * H);
      for (let i = 0; i < W * H; i++) { const v = t[i]; sa[i] = roofed[i] ? .31 : v === TL.TREE ? .78 : 1; d[i * 4] = built(v) ? 0 : 255; d[i * 4 + 1] = roofed[i] ? 0 : 255; d[i * 4 + 2] = roofed[i] ? 80 : v === TL.TREE ? 200 : v === TL.BUSH ? 230 : 255; d[i * 4 + 3] = 255; }
      g1.putImageData(id, 0, 0);
      const c2 = document.createElement('canvas'); c2.width = W * 2; c2.height = H * 2; const g2 = c2.getContext('2d'); g2.filter = 'blur(1.6px)'; g2.drawImage(c1, 0, 0, W * 2, H * 2); g2.filter = 'none';
      const mt = X.maskTex = new THREE.CanvasTexture(c2); mt.flipY = false; mt.generateMipmaps = false; mt.minFilter = mt.magFilter = THREE.LinearFilter; X.trash.push(mt);
      U.skyVis.value = mt; U.skyScale.value.set(1 / (W * 2), 1 / (H * 2));
    }

    // ---- ground. A multiply map (16 px per tile) carries broad tone, the shade at the foot of walls, firelight and blood;
    //      the surface itself comes from the layer textures, chosen per tile and blended by height.
    const P = 16, gc = X.groundC = document.createElement('canvas'); gc.width = W * P; gc.height = H * P; const gx = X.groundX = gc.getContext('2d');
    gx.fillStyle = '#808080'; gx.fillRect(0, 0, W * P, H * P);
    for (let i = 0; i < W * H / 5; i++) { const a = .05 + Math.random() * .1; gx.fillStyle = Math.random() < .55 ? `rgba(62,58,50,${a})` : `rgba(186,180,160,${a})`; gx.beginPath(); gx.ellipse(Math.random() * W * P, Math.random() * H * P, 10 + Math.random() * 60, 8 + Math.random() * 36, Math.random() * 3, 0, 7); gx.fill(); }
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const v = t[x + y * W];
      if (v === TL.DEEP) { gx.fillStyle = 'rgba(44,56,58,.85)'; gx.fillRect(x * P, y * P, P, P); } else if (v === TL.WATER) { gx.fillStyle = 'rgba(96,106,98,.6)'; gx.fillRect(x * P, y * P, P, P); }
      else if (v === TL.TREE) { gx.fillStyle = 'rgba(50,46,38,.5)'; gx.beginPath(); gx.arc(x * P + 8, y * P + 8, 14, 0, 7); gx.fill(); }
    }
    const soft = document.createElement('canvas'); soft.width = gc.width; soft.height = gc.height; soft.getContext('2d').drawImage(gc, 0, 0);
    gx.filter = 'blur(6px)'; gx.drawImage(soft, 0, 0); gx.filter = 'none';
    gx.shadowColor = 'rgba(0,0,0,.5)'; gx.shadowBlur = 8; gx.fillStyle = '#44423e';
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const v = t[x + y * W]; if (v === TL.SWALL || v === TL.WWALL || v === TL.DOOR) gx.fillRect(x * P, y * P, P, P); else if (v === TL.LOW) gx.fillRect(x * P + 5, y * P + 5, 6, 6); }
    gx.shadowBlur = 0; gx.shadowColor = 'transparent';
    for (const f of w.fires) { const g = gx.createRadialGradient(f.x / 2, f.y / 2, 2, f.x / 2, f.y / 2, f.kind === 'candle' ? 30 : 46); g.addColorStop(0, 'rgba(255,196,128,.34)'); g.addColorStop(1, 'rgba(255,170,90,0)'); gx.fillStyle = g; gx.fillRect(f.x / 2 - 50, f.y / 2 - 50, 100, 100); }
    const gt = X.groundTex = new THREE.CanvasTexture(gc); gt.anisotropy = 4; gt.encoding = THREE.sRGBEncoding; X.groundDirty = false; X.groundT = 0; X.trash.push(gt);
    // which layer lies on each tile; ground under a wall takes the floor beside it, so floors run cleanly up to the wall
    const LAY = []; LAY[TL.GRASS] = 0; LAY[TL.DIRT] = 1; LAY[TL.WOOD] = 5; LAY[TL.STONE] = 4; LAY[TL.TREE] = 6; LAY[TL.WATER] = 7; LAY[TL.BUSH] = 0; LAY[TL.DEEP] = 7; LAY[TL.LOW] = 0; LAY[TL.MUD] = 2; LAY[TL.COBBLE] = 3; LAY[TL.DOOR] = 4; LAY[TL.REED] = 2; LAY[TL.ROCK] = 1;
    const idx = new Uint8Array(W * H * 4);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const v = t[x + y * W]; let l = LAY[v];
      if (v === TL.SWALL || v === TL.WWALL || v === TL.DOOR) { l = 1; for (const [ax, ay] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const n = at(x + ax, y + ay); if (n === TL.WOOD || n === TL.STONE || n === TL.COBBLE) { l = LAY[n]; break; } } }
      idx[(x + y * W) * 4] = l; idx[(x + y * W) * 4 + 3] = 255;
    }
    const it = new THREE.DataTexture(idx, W, H, THREE.RGBAFormat); it.needsUpdate = true; X.trash.push(it);
    const gmat = envOn(new THREE.MeshStandardMaterial({ map: gt, roughness: .86, metalness: 0 }), 1.1);
    if (q.gl2) patch(gmat, 'ground', sh => {
      Object.assign(sh.uniforms, { uGA: { value: tx.gA }, uGN: { value: tx.gN }, uIdx: { value: it }, uMask: U.skyVis, uGrime: U.grime, uMapSize: { value: new THREE.Vector2(W, H) }, uWet: U.wet, uRain: U.rain, uTime: U.time });
      sh.fragmentShader = `precision highp sampler2DArray;
        uniform sampler2DArray uGA; uniform sampler2DArray uGN; uniform sampler2D uIdx; uniform sampler2D uMask; uniform sampler2D uGrime; uniform vec2 uMapSize; uniform float uWet, uRain, uTime;
        vec3 gNrm; float gRough;
        const float LR[8] = float[8](.93, .88, .64, .74, .68, .78, .96, .55);      // roughness of each layer
        const float LP[8] = float[8](.3, 1.0, 1.0, .75, .0, .0, .25, .0);          // how readily each holds a puddle
        const float LF[8] = float[8](1.0, 1.0, 1.0, .0, .0, .0, 1.0, 1.0);          // natural ground can take a second, larger scale; laid stone and boards cannot
        float gLayer(ivec2 p) { return floor(texelFetch(uIdx, clamp(p, ivec2(0), ivec2(uMapSize) - 1), 0).r * 255.0 + .5); }
        ${RIPPLE}
        ` + sh.fragmentShader.replace('#include <map_fragment>', `
        vec2 wxz = vFogW.xz; float gDist = length(vFogW - cameraPosition);
        vec3 mk = texture2D(uMask, wxz / (uMapSize * 2.0)).rgb;
        vec2 tp = wxz * .5 - .5 + (texture2D(uGrime, wxz * .041).gb - .5) * 1.5 * mk.r;
        vec2 ti = floor(tp), tf = tp - ti, sw = tf * tf * (3.0 - 2.0 * tf); ivec2 i0 = ivec2(ti);
        float l0 = gLayer(i0), l1 = gLayer(i0 + ivec2(1, 0)), l2 = gLayer(i0 + ivec2(0, 1)), l3 = gLayer(i0 + ivec2(1, 1));
        vec2 duv = wxz / 3.0;
        vec4 a0 = texture(uGA, vec3(duv, l0)), a1 = texture(uGA, vec3(duv, l1)), a2 = texture(uGA, vec3(duv, l2)), a3 = texture(uGA, vec3(duv, l3));
        vec4 n0 = texture(uGN, vec3(duv, l0)), n1 = texture(uGN, vec3(duv, l1)), n2 = texture(uGN, vec3(duv, l2)), n3 = texture(uGN, vec3(duv, l3));
        vec4 hw = vec4(n0.a, n1.a, n2.a, n3.a) + vec4((1.0 - sw.x) * (1.0 - sw.y), sw.x * (1.0 - sw.y), (1.0 - sw.x) * sw.y, sw.x * sw.y) * mix(10.0, 3.5, mk.r);
        vec4 bw = max(hw - (max(max(hw.x, hw.y), max(hw.z, hw.w)) - .22), 0.0); bw /= bw.x + bw.y + bw.z + bw.w;
        vec3 alb = a0.rgb * bw.x + a1.rgb * bw.y + a2.rgb * bw.z + a3.rgb * bw.w; vec4 nh = n0 * bw.x + n1 * bw.y + n2 * bw.z + n3 * bw.w;
        float ld = bw.x > .5 ? l0 : bw.y > .5 ? l1 : bw.z > .5 ? l2 : bw.w > .5 ? l3 : l0;
        alb = mix(alb, texture(uGA, vec3(duv.yx * .29 + .37, ld)).rgb, smoothstep(5.0, 28.0, gDist) * .6 * LF[int(ld)]);      // a second scale hides the repeat at a distance
        alb = pow(alb, vec3(2.2));
        float rough = LR[int(l0)] * bw.x + LR[int(l1)] * bw.y + LR[int(l2)] * bw.z + LR[int(l3)] * bw.w, hold = LP[int(l0)] * bw.x + LP[int(l1)] * bw.y + LP[int(l2)] * bw.z + LP[int(l3)] * bw.w;
        float wet = uWet * mk.g, pn = texture2D(uGrime, wxz * .037 + .3).g * .7 + texture2D(uGrime, wxz * .13).g * .3;
        float pud = smoothstep(0.0, .1, (pn - (.86 - uWet * .32)) * 2.5 - (nh.a - .4) * .5) * hold * mk.g * step(.02, uWet);
        alb *= mix(1.0, .6, wet * .8); alb = mix(alb, alb * .4 + vec3(.004, .005, .005), pud);
        gRough = mix(mix(rough, rough * .5, wet), .07, pud);
        vec2 gn = (nh.xy * 2.0 - 1.0) * mix(1.0, .45, smoothstep(12.0, 70.0, gDist)) * (1.0 - pud);
        if (uRain > .05) gn += gRipple(wxz * 2.3, uTime) * pud * uRain * .5;
        gNrm = normalize(vec3(gn.x, nh.z * 2.0 - 1.0, gn.y));
        diffuseColor.rgb = alb * mapTexelToLinear(texture2D(map, vUv)).rgb * 4.63;`);
      sh.fragmentShader = ins(sh.fragmentShader, '#include <roughnessmap_fragment>', 'roughnessFactor = gRough;');
      sh.fragmentShader = ins(sh.fragmentShader, '#include <normal_fragment_maps>', 'normal = normalize((viewMatrix * vec4(gNrm, 0.0)).xyz);');
    });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(W * 2, H * 2), gmat); ground.receiveShadow = true; ground.rotation.x = -PI / 2; ground.position.set(W, 0, H); scene.add(ground);

    // ---- walls. Their textures are laid on in world space, so a long wall is one continuous piece of masonry.
    const wallMat = (map, nmap, su, sv, o) => patch(new THREE.MeshStandardMaterial({ map, normalMap: nmap, roughness: o.rough || .94, color: o.tint ? new THREE.Color(o.tint[0], o.tint[1], o.tint[2]) : 0xffffff }), 'wall' + su + sv + (o.moss ? 'm' : '') + (o.char ? 'c' : '') + (o.det || '') + (o.key || ''), sh => {
      sh.uniforms.uGrime = U.grime; sh.uniforms.uWet = U.wet; sh.uniforms.uDetW = { value: tx.det.stone };
      sh.vertexShader = 'varying float vWTop; varying float vWY;\n' + ins(sh.vertexShader, '#include <uv_vertex>', `
        #ifdef USE_INSTANCING
          vec4 wuP = modelMatrix * instanceMatrix * vec4(position, 1.0); vec3 wuN = abs(mat3(modelMatrix) * mat3(instanceMatrix) * normal); vWTop = (1.0 - position.y) * length(instanceMatrix[1].xyz);
        #else
          vec4 wuP = modelMatrix * vec4(position, 1.0); vec3 wuN = abs(mat3(modelMatrix) * normal); vWTop = 9.0;
        #endif
        vUv = wuN.y > max(wuN.x, wuN.z) ? wuP.xz * ${su.toFixed(3)} : (wuN.x > wuN.z ? vec2(wuP.z * ${su.toFixed(3)}, wuP.y * ${sv.toFixed(3)}) : vec2(wuP.x * ${su.toFixed(3)}, wuP.y * ${sv.toFixed(3)}));
        vWY = wuP.y;`);
      sh.fragmentShader = 'uniform sampler2D uGrime; uniform sampler2D uDetW; uniform float uWet; varying float vWTop; varying float vWY;\n' + ins(sh.fragmentShader, '#include <map_fragment>', `
        float wn1 = texture2D(uGrime, vec2(vUv.x * 1.7, vWY * .11)).g;
        ${o.det ? `{ vec4 wd = texture2D(uDetW, vUv * 4.7); diffuseColor.rgb *= 1.0 + (wd.r * 2.0 - 1.0) * ${o.det.toFixed(2)}; }      // the grain of the stone itself, for when you stand close` : ''}
        diffuseColor.rgb *= .78 + .44 * texture2D(uGrime, vUv * .13 + vWY * .02).g;      // broad staining, so the repeat of the masonry does not show
        ${o.moss ? `diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.03, .042, .015), smoothstep(1.2, 0.0, vWY) * smoothstep(.2, .7, wn1 + (1.0 - vWY) * .3) * .8);
        diffuseColor.rgb *= 1.0 - smoothstep(1.8, 0.0, vWTop) * texture2D(uGrime, vec2(vUv.x * 2.3, .5)).b * .6;` : ''}
        ${o.char ? 'diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.007, .006, .005), smoothstep(1.1, 0.0, vWTop + (wn1 - .5) * .9) * .94);' : ''}
        diffuseColor.rgb *= 1.0 - uWet * .22;`);
    });
    const tint = env.stone || [1, .97, .92];
    // rubble for field walls and wells everywhere; the walls of buildings are rubble in a village and dressed stone in an abbey or a hold
    const ash = env.masonry === 'ashlar', rs = tx.stoneS || .25, as = tx.ashlarS || .25, rubbleM = wallMat(tx.stoneT, tx.stoneN, rs, rs, { tint, moss: true, det: .5 }); X.wellM = wallMat(tx.stoneT, tx.stoneN, rs, rs, { tint, det: .5, key: 'w' });
    const stoneM = ash ? wallMat(tx.ashlarT, tx.ashlarN, as, as, { tint, moss: true, det: .45, key: 'a' }) : rubbleM, daubM = wallMat(tx.daubT, tx.daubN, .5, .25, { det: .3 }), burntM = wallMat(tx.daubT, tx.daubN, .5, .25, { char: true, det: .3 });
    const slabM = wallMat(ash ? tx.ashlarT : tx.stoneT, ash ? tx.ashlarN : tx.stoneN, ash ? as : rs, ash ? as : rs, { tint: [tint[0] * .7, tint[1] * .7, tint[2] * .7], det: .4, key: ash ? 'a' : '' });
    const thatchM = new THREE.MeshStandardMaterial({ map: tx.thatchT, normalMap: tx.thatchN, roughness: 1, side: THREE.DoubleSide });
    const L = { sw: [], ww: [], wr: [], tree: [], bush: [], rock: [], reed: [], water: [], lowx: [], lowz: [] };
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const k = x + y * W, v = t[k];
      if (v === TL.SWALL) L.sw.push([x, y, w.hgt[k] || wallH[k] || 3.9 + Math.random() * .9]);
      else if (v === TL.WWALL) (roofed[k] ? L.ww : L.wr).push([x, y, w.hgt[k] || wallH[k] || 2.1 + Math.random() * 1.3]);
      else if (v === TL.TREE) L.tree.push([x, y]); else if (v === TL.BUSH) L.bush.push([x, y]); else if (v === TL.ROCK) L.rock.push([x, y]); else if (v === TL.REED) L.reed.push([x, y]);
      else if (v === TL.WATER || v === TL.DEEP) L.water.push([x, y, v === TL.DEEP]);
      else if (v === TL.LOW) { const hx = wallish(at(x - 1, y)) || wallish(at(x + 1, y)), hz = wallish(at(x, y - 1)) || wallish(at(x, y + 1)); if (hx || !hz) L.lowx.push([x, y]); if (hz) L.lowz.push([x, y]); }
    }
    const d = new THREE.Object3D(), col = new THREE.Color();
    function inst(geo, material, list, fn, noShadow) {
      if (!list.length) return null;
      const m = new THREE.InstancedMesh(geo, material, list.length); m.frustumCulled = false; m.castShadow = !noShadow; m.receiveShadow = true;
      list.forEach((p, i) => { d.position.set(p[0] * 2 + 1, 0, p[1] * 2 + 1); d.rotation.set(0, 0, 0); d.scale.set(1, 1, 1); if (fn) fn(d, p, i, m); d.updateMatrix(); m.setMatrixAt(i, d.matrix); });
      scene.add(m); return m;
    }
    const wallG = new THREE.BoxGeometry(2, 1, 2); wallG.translate(0, .5, 0);
    inst(wallG, stoneM, L.sw, (o, p) => { o.scale.y = p[2]; }); inst(wallG, daubM, L.ww, (o, p) => { o.scale.y = p[2]; }); inst(wallG, burntM, L.wr, (o, p) => { o.scale.y = p[2]; });
    inst(wallG, rubbleM, L.lowx, o => { o.scale.set(1, 1.05, .24); }); inst(wallG, rubbleM, L.lowz, o => { o.scale.set(.24, 1.05, 1); });

    // battlements: a merlon on every other yard of the open walls of a hold
    if (env.battlements) inst(wallG, stoneM, L.sw.filter(p => !roofed[p[0] + p[1] * W]), (o, p) => { o.position.y = p[2]; o.scale.set(.5, .75, .5); });
    // far hills beyond the trees, two ridges of them, to give the place a horizon
    {
      const R0 = Math.max(W, H) + 140, seg = 120, pos = [], col = [], ix = [], prof = (a, k) => 34 + 60 * k * (.5 + .5 * Math.sin(a * 3 + k * 9)) * (.6 + .4 * Math.sin(a * 7.3 + k * 4)) + 12 * Math.sin(a * 17 + k) + 5 * Math.sin(a * 41 + k * 3);
      for (let ring = 0; ring < 2; ring++) for (let i = 0; i <= seg; i++) {
        const a = i / seg * PI * 2, r0 = R0 + ring * 120, h = prof(a, 1 + ring * .8), v0 = pos.length / 3, k = ring ? .97 : .8;      // the nearer ridge is the darker
        pos.push(W + Math.cos(a) * r0, -3, H + Math.sin(a) * r0, W + Math.cos(a) * (r0 + 60), h, H + Math.sin(a) * (r0 + 60)); col.push(k * .93, k * .96, k * .9, k, k, k);
        if (i < seg) ix.push(v0, v0 + 1, v0 + 2, v0 + 2, v0 + 1, v0 + 3);
      }
      const hg = new THREE.BufferGeometry(); hg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); hg.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); hg.setIndex(ix);
      const hm = new THREE.Mesh(hg, X.hillM = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, side: THREE.DoubleSide })); hm.frustumCulled = false; hm.renderOrder = -1; scene.add(hm);
    }

    // ---- water: ripples, the sky in it at a low angle, rain rings
    if (L.water.length) {
      const flat = new THREE.PlaneGeometry(2, 2); flat.rotateX(-PI / 2);
      const wm = envOn(patch(new THREE.MeshStandardMaterial({ roughness: .06, metalness: 0, transparent: true, opacity: .85, depthWrite: false }), 'water', sh => {
        Object.assign(sh.uniforms, { uTime: U.time, uCloud: { value: tx.cloud }, uRain: U.rain });
        sh.fragmentShader = 'uniform float uTime; uniform float uRain; uniform sampler2D uCloud;\n' + RIPPLE + '\nfloat wH(vec2 p) { return texture2D(uCloud, p * .11 + uTime * vec2(.012, .007)).g + texture2D(uCloud, p * .29 - uTime * vec2(.01, .016)).b * .5; }\n' + ins(sh.fragmentShader, '#include <normal_fragment_maps>', `
          { vec2 wp = vFogW.xz; float h0 = wH(wp); vec3 wn = vec3((h0 - wH(wp + vec2(.12, 0.0))) * 1.5, 1.0, (h0 - wH(wp + vec2(0.0, .12))) * 1.5);
            wn.xz += gRipple(wp * 2.4, uTime) * uRain * .45; normal = normalize((viewMatrix * vec4(normalize(wn), 0.0)).xyz); }`);
        sh.fragmentShader = ins(sh.fragmentShader, 'gl_FragColor = vec4( outgoingLight, diffuseColor.a );', 'gl_FragColor.a = mix(.6, .97, pow(1.0 - max(dot(normal, normalize(vViewPosition)), 0.0), 3.0));');
      }), 1.5);
      const m = inst(flat, wm, L.water, (o, p) => { o.position.y = p[2] ? .06 : .05; }, true);
      L.water.forEach((p, i) => m.setColorAt(i, p[2] ? col.setRGB(.012, .022, .024) : col.setRGB(.03, .045, .036)));
    }

    // ---- plants, in chunks so that only those near enough to see are drawn
    // list rows: [x, z, rot, sx, sy, sz, r, g, b]
    function scatter(geo, material, list, o) {
      const CH = o.ch * 2, by = new Map();
      for (const e of list) { const k = Math.floor(e[0] / CH) + Math.floor(e[1] / CH) * 1000; let a = by.get(k); if (!a) by.set(k, a = []); a.push(e); }
      geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, o.h || 2, 0), CH * .71 + (o.h || 2) + 3);
      for (const [k, arr] of by) {
        const cx = ((k % 1000) + .5) * CH, cz = (Math.floor(k / 1000) + .5) * CH, m = new THREE.InstancedMesh(geo, material, arr.length);
        m.position.set(cx, 0, cz);
        arr.forEach((e, i) => { d.position.set(e[0] - cx, 0, e[1] - cz); d.rotation.set(0, e[2], 0); d.scale.set(e[3], e[4], e[5]); d.updateMatrix(); m.setMatrixAt(i, d.matrix); m.setColorAt(i, col.setRGB(e[6], e[7], e[8])); });
        m.castShadow = !!o.shadow; m.receiveShadow = true; if (o.depth) m.customDepthMaterial = o.depth;
        scene.add(m); X.chunks.push({ m, x: cx, z: cz, r: o.range || 999, min: o.min || -1e9, rad: CH * .71 });
      }
    }
    const R = Math.random;
    // leaves are cards with see-through gaps; in a crown their normals point out from the middle, so the crown shades as one soft mass
    const leafy = (map, key, amp, round) => { const m = patch(new THREE.MeshStandardMaterial({ map, alphaTest: .36, side: THREE.DoubleSide, vertexColors: true, roughness: 1 }), key, sh => { X.windV(sh, amp); if (round) sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', 'float faceDirection = 1.0; vec3 normal = normalize(vNormal); vec3 geometryNormal = normal;'); }); m.alphaToCoverage = true; return m; };
    const depthOf = map => new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map, alphaTest: .36 });
    const barkM = new THREE.MeshStandardMaterial({ map: tx.barkT, normalMap: tx.barkN, roughness: 1 });
    const firM = leafy(tx.firT, 'fir', .006), leafM = leafy(tx.clumpT, 'leaf', .013, true), bushM = leafy(tx.clumpT, 'bush', .035, true), firD = depthOf(tx.firT), leafD = depthOf(tx.clumpT);
    const stick = (list, len, r0, r1, bx, by, bz, tilt, yaw, seg) => { const g = new THREE.CylinderGeometry(r1, r0, len, seg || 5); g.translate(0, len / 2, 0); g.rotateZ(tilt); g.rotateY(yaw); g.translate(bx, by, bz); uvScale(g, 1, len / 2); list.push({ g }); };
    function firGeo(tall) {
      const tl = [], lf = [], Ht = tall ? 10.5 : 8, n = tall ? 8 : 6;
      const tg = new THREE.CylinderGeometry(.05, .2 + R() * .07, Ht, 7); tg.translate(0, Ht / 2, 0); uvScale(tg, 2, Ht / 2); tl.push({ g: tg });
      for (let i = 0; i < 7; i++) stick(tl, .5 + R() * .8, .03, .01, 0, .9 + R() * 1.9, 0, 1.2 + R() * .3, R() * 6.28);
      for (let i = 0; i < n; i++) {
        const tt = i / (n - 1), y0 = lerp(2.5, Ht - 1.6, tt), rr = lerp(2.0, .5, Math.pow(tt, .85)) * (.88 + R() * .24), hh = lerp(2.0, 1.3, tt), seg = 11;
        const g = new THREE.CylinderGeometry(rr * .06, rr, hh, seg, 1, true), Pp = g.attributes.position, jr = [], jy = [];
        for (let j = 0; j < seg; j++) { jr.push(.78 + R() * .4); jy.push((R() - .6) * .5); }
        for (let j = 0; j <= seg; j++) { const v = seg + 1 + j, a = j % seg; Pp.setXYZ(v, Pp.getX(v) * jr[a], Pp.getY(v) + jy[a], Pp.getZ(v) * jr[a]); }
        const dk = lerp(.74, 1, tt); shade(g, (x, y) => (y > 0 ? .62 : 1) * dk);
        g.translate(0, y0 + hh / 2, 0); g.rotateY(R() * 6); uvScale(g, Math.max(1, Math.round(rr * 1.5)), 1); lf.push({ g });
      }
      const tip = new THREE.ConeGeometry(.3, 1.3, 7, 1, true); shade(tip, () => .95); tip.translate(0, Ht - .2, 0); lf.push({ g: tip });
      return { trunk: merge(tl), leaf: merge(lf), h: Ht };
    }
    // n leaf cards scattered through an ellipsoid, most of them near its surface and turned roughly outward
    const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _f = new THREE.Vector3(), _u = new THREE.Vector3(0, 1, 0);
    function crown(list, n, cx, cy, cz, rx, ry, rz, size, dark) {
      const pos = [], nor = [], uv = [], cl = [], ix = [];
      for (let i = 0; i < n; i++) {
        let x, y, z, l; do { x = R() * 2 - 1; y = R() * 2 - 1; z = R() * 2 - 1; l = x * x + y * y + z * z; } while (l > 1 || l < .1);
        l = Math.sqrt(l); const k = Math.pow(l, .45) / l; x *= k; y *= k; z *= k;
        _f.set(x + (R() - .5) * .9, y * .6 + (R() - .5) * .9, z + (R() - .5) * .9).normalize(); _a.crossVectors(_u, _f); if (_a.lengthSq() < .01) _a.set(1, 0, 0); _a.normalize(); _b.crossVectors(_f, _a);
        const rot = R() * 6.28, c = Math.cos(rot), s2 = Math.sin(rot), sz = size * (.75 + R() * .6) / 2;
        const ax = (_a.x * c + _b.x * s2) * sz, ay = (_a.y * c + _b.y * s2) * sz, az = (_a.z * c + _b.z * s2) * sz, bx = (_b.x * c - _a.x * s2) * sz, by = (_b.y * c - _a.y * s2) * sz, bz = (_b.z * c - _a.z * s2) * sz;
        const px = cx + x * rx, py = cy + y * ry, pz = cz + z * rz, v0 = pos.length / 3, sh = lerp(.42, 1.08, (y + 1) / 2) * dark * (.85 + R() * .3), nl = Math.hypot(x, y + .55, z) || 1;
        pos.push(px - ax - bx, py - ay - by, pz - az - bz, px + ax - bx, py + ay - by, pz + az - bz, px + ax + bx, py + ay + by, pz + az + bz, px - ax + bx, py - ay + by, pz - az + bz);
        for (let q = 0; q < 4; q++) { nor.push(x / nl, (y + .55) / nl, z / nl); cl.push(sh, sh, sh); }
        uv.push(0, 0, 1, 0, 1, 1, 0, 1); ix.push(v0, v0 + 1, v0 + 2, v0, v0 + 2, v0 + 3);
      }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(cl, 3)); g.setIndex(ix); list.push({ g });
    }
    function oakGeo(tall) {
      const tl = [], lf = [], th = tall ? 4.4 : 3.3, tg = new THREE.CylinderGeometry(.13, .3 + R() * .08, th, 7); tg.translate(0, th / 2, 0); uvScale(tg, 2, th / 2); tl.push({ g: tg });
      for (let i = 0; i < 4; i++) stick(tl, 2 + R(), .11, .04, 0, th - .7 + R() * .4, 0, .55 + R() * .45, i * 1.57 + R(), 6);
      if (tall) { crown(lf, 34, 0, th + 2.3, 0, 1.7, 2.4, 1.7, 2.1, .92); crown(lf, 10, .5, th + .6, .3, 1.3, .8, 1.3, 1.8, .74); }
      else { crown(lf, 36, 0, th + 1.5, 0, 2.6, 1.5, 2.6, 2.3, .92); for (let i = 0; i < 3; i++) { const a = i * 2.1 + R(); crown(lf, 9, Math.cos(a) * 1.9, th + .5 + R() * .6, Math.sin(a) * 1.9, 1.2, .9, 1.2, 1.9, .78); } }
      return { trunk: merge(tl), leaf: merge(lf), h: th + 3 };
    }
    function deadGeo() {
      const tl = [], Ht = 4.6 + R() * 1.6, tg = new THREE.CylinderGeometry(.05, .24, Ht, 6); tg.translate(0, Ht / 2, 0); uvScale(tg, 2, Ht / 2); tl.push({ g: tg });
      for (let i = 0; i < 7; i++) { const y = 1.8 + R() * (Ht - 2.2), yaw = R() * 6.28, tilt = .5 + R() * .7, len = 1 + R() * 1.6; stick(tl, len, .07, .02, 0, y, 0, tilt, yaw); const ex = -Math.sin(tilt) * len * .6, ey = Math.cos(tilt) * len * .6; stick(tl, len * .6, .03, .008, ex * Math.cos(yaw), y + ey, -ex * Math.sin(yaw), tilt + (R() - .5) * 1.2, yaw + (R() - .5) * 1.4, 4); }
      return { trunk: merge(tl), h: Ht };
    }
    {
      const kinds = [firGeo(true), firGeo(false), oakGeo(false), oakGeo(true), deadGeo()], lists = kinds.map(() => [[], []]), wts = env.trees || TREES[w.id] || TREES.dunmere;
      const ruins = w.buildings.filter(b => b.roof === 'rafters' || (b.wall && !b.roof));
      for (const p of L.tree) {
        let dead = wts[2]; for (const b of ruins) if (p[0] > b.x - 5 && p[0] < b.x + b.w + 5 && p[1] > b.y - 5 && p[1] < b.y + b.h + 5) { dead += .4; break; }
        const u = R(), k = u < dead ? 4 : R() < wts[0] / (wts[0] + wts[1]) ? (R() < .6 ? 0 : 1) : (R() < .6 ? 2 : 3), s = .8 + R() * .5, x = p[0] * 2 + 1 + rand(-.35, .35), z = p[1] * 2 + 1 + rand(-.35, .35), ry = R() * 6.28;
        const autumn = k >= 2 && R() < .3, v = .62 + R() * .36;
        lists[k][0].push([x, z, ry, s, s, s, k === 4 ? .5 : .9 + R() * .3, k === 4 ? .46 : .9 + R() * .3, k === 4 ? .42 : .9 + R() * .3]);
        if (kinds[k].leaf) lists[k][1].push([x, z, ry, s, s, s, autumn ? v * 1.3 : v * (k < 2 ? 1.1 : .95), autumn ? v * 1.02 : v * (k < 2 ? 1.2 : 1), autumn ? v * .5 : v * (k < 2 ? 1.15 : .75)]);
      }
      kinds.forEach((kd, k) => {
        scatter(kd.trunk, barkM, lists[k][0], { ch: 24, shadow: true, h: kd.h / 2 });
        if (kd.leaf) scatter(kd.leaf, k < 2 ? firM : leafM, lists[k][1], { ch: 24, shadow: true, h: kd.h / 2, depth: k < 2 ? firD : leafD });
      });
      const bl = []; crown(bl, 13, 0, .62, 0, .78, .5, .78, 1.2, .92);
      scatter(merge(bl), bushM, L.bush.map(p => { const s = .9 + R() * .5, v = .6 + R() * .3, br = R() < .3; return [p[0] * 2 + 1, p[1] * 2 + 1, R() * 6, s, s * (.8 + R() * .4), s, br ? v * 1.3 : v, v, br ? v * .5 : v * .75]; }), { ch: 24, shadow: true, h: 1, depth: leafD });
    }
    // undergrowth from photographs, where fetched: ferns under the trees, and clumps of grass in the open
    if (tx.md) {
      const cut = (M, key, amp) => { if (!M.leaf) M.leaf = leafy(M.map, key, amp, false); return M; };
      if (tx.md.fern) {
        // the two fullest ferns are the costliest to draw, so there are fewer of them (and none at the lowest setting)
        const M = cut(tx.md.fern, 'fern', .02), lists = M.geos.map(() => []), light = M.geos.map((g, i) => i).sort((a, b) => M.geos[a].index.count - M.geos[b].index.count);
        for (const p of L.tree) if (R() < .8) for (let k = R() < .5 ? 2 : 1; k--;) { const s = 1.4 + R() * 1.2, v = .42 + R() * .26, i = light[q.low || R() < .7 ? R() * 2 | 0 : 2 + (R() * (light.length - 2) | 0)]; lists[i].push([p[0] * 2 + 1 + rand(-.9, .9), p[1] * 2 + 1 + rand(-.9, .9), R() * 6.28, s, s * (.8 + R() * .4), s, v, v * 1.05, v * .78]); }
        M.geos.forEach((geo, i) => scatter(geo, M.leaf, lists[i], { ch: 12, h: .5, range: q.low ? 26 : 38 }));
      }
      if (tx.md.grass && !q.low) {
        // the three lightest clumps only: there are a great many of these, and only those nearby are drawn
        const M = cut(tx.md.grass, 'gclump', .05), lists = M.geos.map(() => []), light = M.geos.map((g, i) => i).sort((a, b) => M.geos[a].index.count - M.geos[b].index.count).slice(0, 3);
        for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) if (t[x + y * W] === TL.GRASS) for (let k = R() < .6 ? 2 : 1; k--;) { const s = 2 + R() * 1.6, v = .36 + R() * .2; lists[light[R() * light.length | 0]].push([x * 2 + R() * 2, y * 2 + R() * 2, R() * 6.28, s, s * (.8 + R() * .5), s, v * .82, v, v * .6]); }
        M.geos.forEach((geo, i) => scatter(geo, M.leaf, lists[i], { ch: 8, h: .4, range: 26 }));
      }
    }
    // rocks: boulders on rock tiles, and loose stones everywhere
    {
      const g = new THREE.IcosahedronGeometry(1, 1), Pp = g.attributes.position;
      for (let i = 0; i < Pp.count; i++) { const x = Pp.getX(i), y = Pp.getY(i), z = Pp.getZ(i), f = 1 + Math.sin(Math.round(x * 40) * 3.1 + Math.round(y * 40) * 5.7 + Math.round(z * 40) * 1.3) * .2; Pp.setXYZ(i, x * f, y * f * .72, z * f); }
      shade(g, (x, y) => y > .35 ? [.7, .76, .56] : [1, 1, 1]); g.translate(0, .45, 0); X.grainGeo(g);
      const rm = X.vmat('rock'), grey = () => { const v = .05 + R() * .05; return [v * 1.06, v, v * .9]; };
      // boulders: photographed ones where they have been fetched, two shapes turned and stretched every which way
      // (each is some thirteen thousand triangles, so from further off the plain shape below stands in for it)
      const b1 = tx.md && tx.md.boulder, b2 = tx.md && tx.md.stone, bmat = M => M.mat || (M.mat = new THREE.MeshStandardMaterial({ map: M.map, normalMap: M.nmap, normalScale: new THREE.Vector2(1, -1), roughness: .95, metalness: 0 }));
      const plain = L.rock.map(p => { const c = grey(); return [p[0] * 2 + 1, p[1] * 2 + 1, R() * 6, rand(1.1, 1.5), rand(.9, 1.7), rand(1.1, 1.5), c[0], c[1], c[2]]; }), NEAR = q.low ? 0 : 42;
      if (b1 && NEAR) {
        for (const M of [b1, b2]) if (M && !M.sunk) { const gm = M.geos[0]; gm.computeBoundingBox(); const bb = gm.boundingBox; gm.translate(0, -bb.min.y - (bb.max.y - bb.min.y) * .16, 0); M.sunk = true; }      // bedded in the earth, not set down on it
        const rows = plain.map(r => { const s = rand(6.5, 9), v = .62 + R() * .3; return [r[0], r[1], r[2], s, s * rand(.9, 1.25), s, v, v * .97, v * .92]; });
        scatter(b1.geos[0], bmat(b1), b2 ? rows.filter((_, i) => i % 2) : rows, { ch: 12, shadow: true, h: 1, range: NEAR });
        if (b2) scatter(b2.geos[0], bmat(b2), rows.filter((_, i) => !(i % 2)).map(r => [r[0], r[1], r[2], r[3] * 2, r[4] * 2.6, r[5] * 2, r[6], r[7], r[8]]), { ch: 12, shadow: true, h: 1, range: NEAR });
      }
      scatter(g, rm, plain, { ch: 12, shadow: true, h: 1, min: b1 && NEAR ? NEAR : 0 });
      const sp = []; for (let i = 0; i < (q.low ? 700 : 2600); i++) { const x = 2 + R() * (W - 4), y = 2 + R() * (H - 4), v = t[(x | 0) + (y | 0) * W]; if (v === TL.GRASS || v === TL.DIRT || v === TL.MUD) { const s = .05 + R() * R() * .28, c = grey(); sp.push([x * 2, y * 2, R() * 6, s * (1 + R()), s, s, c[0], c[1], c[2]]); } }
      const g2 = g.clone(); g2.translate(0, -.3, 0); scatter(g2, rm, sp, { ch: 24, shadow: true, h: .3, range: 70 });
    }
    // grass, weeds and reeds
    {
      const tuft = (n, wd, ht, lean, heads) => {
        const pos = [], nor = [], cl = [], ix = [];
        for (let b = 0; b < n; b++) {
          const a = b * 2.4 + R() * .8, ca = Math.cos(a), sa = Math.sin(a), hh = ht * (.55 + R() * .65), l = lean * (.4 + R()), w2 = wd * (.7 + R() * .6), ox = ca * R() * .1, oz = sa * R() * .1, v0 = pos.length / 3, px = -sa * w2, pz = ca * w2;
          pos.push(ox - px, 0, oz - pz, ox + px, 0, oz + pz, ox + ca * l * .35 - px * .7, hh * .55, oz + sa * l * .35 - pz * .7, ox + ca * l * .35 + px * .7, hh * .55, oz + sa * l * .35 + pz * .7, ox + ca * l, hh, oz + sa * l);
          for (let k = 0; k < 5; k++) nor.push(ca * .3, 1, sa * .3);
          const hd = heads && b % 3 === 0; cl.push(.34, .34, .34, .34, .34, .34, .68, .68, .68, .68, .68, .68, hd ? .5 : 1, hd ? .3 : 1, hd ? .12 : 1);
          ix.push(v0, v0 + 1, v0 + 2, v0 + 1, v0 + 3, v0 + 2, v0 + 2, v0 + 3, v0 + 4);
        }
        const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(cl, 3)); g.setIndex(ix); return g;
      };
      const range = q.low ? 34 : 50;
      const grassM = (key, amp) => patch(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .95, side: THREE.DoubleSide }), key + range, sh => {
        X.windV(sh, amp);
        sh.vertexShader = ins(sh.vertexShader, '#include <begin_vertex>', `{ vec3 gp = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz; transformed *= 1.0 - smoothstep(${(range * .66).toFixed(1)}, ${range.toFixed(1)}, distance(gp.xz, cameraPosition.xz)); }`);
        sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', 'float faceDirection = 1.0; vec3 normal = normalize(vNormal); vec3 geometryNormal = normal;');
      });
      const eg = env.grass, gl = [], rl = [], ml = [];
      for (let y = 2; y < H - 2; y++) for (let x = 2; x < W - 2; x++) {
        const v = t[x + y * W];
        if (v === TL.GRASS) for (let i = 0; i < q.grass; i++) { if (R() < .22) continue; const g = .05 + R() * .05, dry = R() < .12, s = .55 + R() * .75; gl.push([x * 2 + R() * 2, y * 2 + R() * 2, R() * 6, s, s * (.6 + R() * .9), s, dry ? g * 1.35 : g * eg[0], dry ? g * 1.15 : g * eg[1], dry ? g * .5 : g * eg[2]]); }
        else if (v === TL.REED) for (let i = 0; i < (q.low ? 6 : 17); i++) { const g = .055 + R() * .05, s = .8 + R() * .5; rl.push([x * 2 + R() * 2, y * 2 + R() * 2, R() * 6, s, s, s, g * 1.15, g * 1.05, g * .5]); }
        else if (v === TL.MUD || v === TL.DIRT) { if (R() < (v === TL.MUD ? .5 : .16)) { const g = .09 + R() * .08, s = .5 + R() * .5; ml.push([x * 2 + R() * 2, y * 2 + R() * 2, R() * 6, s, s, s, g * .95, g * .9, g * .4]); } }
      }
      scatter(tuft(10, .012, .44, .24), grassM('grass', .24), gl, { ch: 8, h: .3, range });
      scatter(tuft(9, .009, 1.7, .24, true), grassM('reed', .07), rl, { ch: 8, h: 1, range: range + 20 });
      scatter(tuft(5, .012, .5, .24), grassM('grass', .24), ml, { ch: 8, h: .3, range });
    }

    // ---- everything that never moves is gathered into one mesh per material
    const batch = new X.Batch(), flames = [], smokes = [];
    const fireAt = (x, y, z, size, intensity) => { flames.push(x, y, z, size); X.fires.push({ x, y: y + .35 * size, z, int: intensity, col: 0xff8a3a, ph: Math.random() * 9 }); };
    // roofs: thatch or a stone vault where a building stands whole, burnt rafters where it does not
    for (const b of w.buildings) {
      if (!b.wall) continue;
      const wood = b.wall === TL.WWALL, hW = b.wallH, alongX = b.w >= b.h, wm = wood ? daubM : stoneM, dk = 0x2a2018;
      const len = (alongX ? b.w : b.h) * 2 + .9, span = (alongX ? b.h : b.w) * 2 + .5, rise = span * .42, sl = Math.hypot(span / 2, rise), th = Math.atan2(rise, span / 2), ov = .5;
      const grp = new THREE.Group(); grp.position.set((b.x + b.w / 2) * 2, b.roof ? hW : 2.2, (b.y + b.h / 2) * 2); if (!alongX) grp.rotation.y = PI / 2;
      if (b.roof === 'thatch') {
        for (const sg of [-1, 1]) {
          const g = uvScale(new THREE.BoxGeometry(len, .3, sl + ov), len / 2.6, (sl + ov) / 2.6), m = mesh(g, thatchM, 0, rise / 2 - Math.sin(th) * ov / 2, sg * (span / 4 + Math.cos(th) * ov / 2), grp); m.rotation.x = sg * th;
        }
        mesh(uvScale(new THREE.BoxGeometry(len + .1, .26, .7), len / 2.6, .3), thatchM, 0, rise + .08, 0, grp);
        for (const sg of [-1, 1]) { const g = new THREE.ExtrudeGeometry(shape([[-span / 2 + .3, 0], [span / 2 - .3, 0], [0, rise - .2]]), { depth: .3, bevelEnabled: false }); const m = mesh(g, wm, sg * (len / 2 - .75), 0, 0, grp); m.rotation.y = PI / 2; }
        box(len - .6, .16, .16, dk, 0, rise - .22, 0, grp);
        const nb = Math.max(1, Math.round(len / 3.2));
        for (let i = 0; i < nb; i++) { const x = -len / 2 + (i + .5) * len / nb; box(.18, .18, span - .5, dk, x, .02, 0, grp); box(.14, rise - .3, .14, dk, x, rise / 2 - .1, 0, grp); for (const sg of [-1, 1]) { const m = box(.12, .12, sl - .3, dk, x, rise / 2 - .14, sg * span / 4, grp); m.rotation.x = sg * th; } }
      } else if (b.roof === 'slab') {
        grp.rotation.y = 0; box(b.w * 2 + .1, .4, b.h * 2 + .1, slabM, 0, .2, 0, grp);
        const ax = b.w < b.h, n = Math.round((ax ? b.h : b.w) / 1.5); for (let i = 1; i < n; i++) { const o = -(ax ? b.h : b.w) + i * (ax ? b.h : b.w) * 2 / n; box(ax ? b.w * 2 - 3.8 : .22, .24, ax ? .22 : b.h * 2 - 3.8, dk, ax ? 0 : o, -.12, ax ? o : 0, grp); }
      } else if (b.roof === 'rafters') {
        const n = Math.floor(len / 2.2);
        for (let i = 0; i < n; i++) { if (Math.random() < .3) continue; const x = -len / 2 + 1 + i * 2.2; for (const sg of [-1, 1]) { if (Math.random() < .25) continue; const m = box(.15, .15, sl, 0x14100c, x, rise / 2, sg * span / 4, grp); m.rotation.x = sg * th; } }
        if (Math.random() < (w.tier === 1 ? .55 : .3)) smokes.push([(b.x + 1 + Math.random() * (b.w - 2)) * 2, .3, (b.y + 1 + Math.random() * (b.h - 2)) * 2, 3, 30, .9]);
      }
      batch.add(grp);
      const whole = b.roof === 'thatch' || b.roof === 'slab', st2 = 0x6a6862;
      // windows in whole houses: shuttered in timber walls, narrow lights in stone ones, on some of the outer wall tiles
      if (whole && hW >= 2.6) {
        const wg = new THREE.Group(), fr = 0x2e2218, dark = mat(0x070605, undefined, undefined, 'flat');
        const put = (tx, ty, nx, nz) => {
          const v = at(tx, ty); if ((v !== TL.WWALL && v !== TL.SWALL) || Math.random() > (wood ? .5 : .34)) return; if (b.doors.some(dr => (dr.tx === tx && dr.ty === ty) || (dr.t2 && dr.t2[0] === tx && dr.t2[1] === ty))) return;
          for (const sgn of [1, -1]) {      // the outside of the wall, and the inside
            const o = new THREE.Group(); o.position.set(tx * 2 + 1 + nx * sgn * 1.012, 0, ty * 2 + 1 + nz * sgn * 1.012); o.rotation.y = Math.atan2(nx * sgn, nz * sgn); wg.add(o);
            if (wood) {
              box(.74, .8, .03, dark, 0, 1.6, 0, o); box(.86, .07, .07, fr, 0, 2.04, .02, o); box(.9, .08, .1, fr, 0, 1.17, .03, o); for (const s of [-1, 1]) box(.07, .86, .07, fr, s * .4, 1.6, .02, o); box(.04, .8, .04, fr, 0, 1.6, .02, o); box(.74, .04, .04, fr, 0, 1.6, .02, o);
              if (sgn > 0) for (const s of [-1, 1]) { const sh = box(.36, .8, .035, 0x4a3822, s * .6, 1.6, .06, o); sh.rotation.y = s * (.35 + Math.random() * .7); for (const y of [1.36, 1.84]) box(.34, .04, .045, 0x33363a, s * .6, y, .07, o).rotation.y = sh.rotation.y; }
            } else { box(.2, 1.0, .03, dark, 0, 1.75, 0, o); if (sgn > 0) { box(.34, .08, .08, st2, 0, 1.2, .03, o); box(.34, .08, .08, st2, 0, 2.3, .03, o); } }
          }
        };
        for (let x = b.x + 1; x < b.x + b.w - 1; x++) { put(x, b.y, 0, -1); put(x, b.y + b.h - 1, 0, 1); }
        for (let y = b.y + 1; y < b.y + b.h - 1; y++) { put(b.x, y, -1, 0); put(b.x + b.w - 1, y, 1, 0); }
        batch.add(wg);
      }
      for (const dr of b.doors) {
        if (dr.tx === undefined) continue;
        if (whole && hW >= 2.9) for (const p of [[dr.tx, dr.ty], dr.t2].filter(Boolean)) { const g = new THREE.Group(); box(2, hW - 2.5, 2, wm, p[0] * 2 + 1, 2.5 + (hW - 2.5) / 2, p[1] * 2 + 1, g); batch.add(g); }
        if (dr.t2 || Math.random() < .25) continue;
        // the door itself: thrown back against the wall where the house still stands, lying in the dirt where it does not
        const g = new THREE.Group(), ox = Math.sign(dr.x - dr.tx), oz = Math.sign(dr.y - dr.ty);
        box(.94, 1.96, .07, 0x3a2c1e, 0, .98, 0, g); for (const y of [.45, 1.5]) box(.9, .08, .1, 0x33363a, 0, y, 0, g); box(.08, .1, .12, 0x4b4f54, .36, 1, 0, g);
        if (whole) { g.position.set(dr.tx * 2 + 1 + (oz ? 1.5 : ox * 1.06), 0, dr.ty * 2 + 1 + (ox ? 1.5 : oz * 1.06)); g.rotation.y = oz ? 0 : PI / 2; }
        else { g.position.set(dr.x * S + rand(-1, 1), .06, dr.y * S + rand(-1, 1)); g.rotation.set(-PI / 2, 0, Math.random() * 6); }
        batch.add(g);
      }
    }
    // ---- locked doors (these swing, so they stay their own objects)
    for (const dr of w.doors) {
      const g = new THREE.Group(); g.position.set(dr.tx * 2 + 1, 0, dr.ty * 2 + 1); scene.add(g);
      const ew = wallish(at(dr.tx - 1, dr.ty)) && wallish(at(dr.tx + 1, dr.ty)); if (!ew) g.rotation.y = PI / 2;
      let hh = 4.3; for (const [ax, ay] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const k = dr.tx + ax + (dr.ty + ay) * W; if (t[k] === TL.SWALL || t[k] === TL.WWALL) { hh = w.hgt[k] || wallH[k] || 4.3; break; } }
      box(2, hh - 2.5, 2, stoneM, 0, 2.5 + (hh - 2.5) / 2, 0, g);
      const slab = new THREE.Group(); g.add(slab);
      box(1.96, 2.5, .2, 0x33261a, 0, 1.25, 0, slab); for (const y of [.5, 1.25, 2]) box(1.98, .1, .24, 0x4b4f54, 0, y, 0, slab); box(.1, .16, .3, 0x8d9399, .7, 1.2, 0, slab);
      for (const px of [-.6, 0, .6]) for (const y of [.5, 1.25, 2]) box(.06, .06, .28, 0x8d9399, px, y, 0, slab);
      X.fuse(slab); X.doorM[dr.tx + ',' + dr.ty] = slab;
    }
    const P2 = { fireAt, smokes };
    for (const c of w.containers) batch.add(prop(c.kind, c.x, c.y, undefined, P2));
    for (const p of w.props) batch.add(prop(p.type, p.x, p.y, p.rot, P2));
    for (const f of w.fires) batch.add(prop(f.kind, f.x, f.y, undefined, P2));
    batch.build(scene);
    for (const e of w.extracts) {
      const g = new THREE.Group(); g.position.set(e.x * S, 0, e.y * S);
      box(.16, 3.2, .16, 0x2e241a, 0, 1.6, 0, g); box(1, .1, .1, 0x2e241a, .4, 3, 0, g);
      box(.5, .9, .03, e.cost ? 0x8a6a1c : e.late ? 0x24405a : 0x7a1c14, .55, 2.5, 0, g);
      box(.16, .22, .16, mat(0xffc878, 'b', 5), .85, 2.75, 0, g); box(.2, .03, .2, 0x33363a, .85, 2.88, 0, g); box(.2, .03, .2, 0x33363a, .85, 2.63, 0, g);
      if (e.cost) { box(2.6, .4, 1, 0x3c2c1c, 1.6, .2, 1.2, g); box(2.4, .1, .8, 0x241a10, 1.6, .42, 1.2, g); }
      X.fuse(g); scene.add(g); e.m = g; g.visible = !e.late;
      X.fires.push({ x: e.x * S + .85, y: 2.7, z: e.y * S, int: .9, col: 0xffc870, ext: e, ph: Math.random() * 9 });
    }

    // ---- fire, sparks and smoke: three meshes for the whole map, animated on the graphics card
    const quad = new THREE.PlaneGeometry(1, 1);
    const instanced = (attrs, n) => { const g = new THREE.InstancedBufferGeometry(); g.index = quad.index; g.setAttribute('position', quad.attributes.position); g.setAttribute('uv', quad.attributes.uv); for (const k in attrs) g.setAttribute(k, new THREE.InstancedBufferAttribute(new Float32Array(attrs[k]), 4)); g.instanceCount = n; return g; };
    if (flames.length) {
      const fm = new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, side: THREE.DoubleSide, uniforms: { uTime: U.time, uCloud: { value: tx.cloud } },
        vertexShader: `attribute vec4 aPos; varying vec2 vUv; varying float vS;
          void main() { vec3 c = aPos.xyz, toC = cameraPosition - c, right = normalize(vec3(toC.z, 0.0, -toC.x));
            gl_Position = projectionMatrix * viewMatrix * vec4(c + right * position.x * aPos.w * .95 + vec3(0.0, (position.y + .5) * aPos.w * 1.5, 0.0), 1.0); vUv = uv; vS = fract(c.x * .37 + c.z * .73); }`,
        fragmentShader: `uniform float uTime; uniform sampler2D uCloud; varying vec2 vUv; varying float vS;
          void main() { float t = uTime * 1.5 + vS * 10.0;
            float n = texture2D(uCloud, vec2(vUv.x * .45 + vS, vUv.y * .5 - t * .42)).r * .6 + texture2D(uCloud, vec2(vUv.x * 1.1 - vS, vUv.y * 1.1 - t * .8)).g * .4;
            float shape = (1.0 - vUv.y) * (1.0 - pow(abs(vUv.x - .5) * 2.0, 1.6)), f = smoothstep(.3, .62, shape * .95 + n * .6 - vUv.y * .4);
            gl_FragColor = vec4(mix(vec3(1.0, .2, .02), vec3(1.0, .72, .22), smoothstep(.25, .8, f * shape * 2.2)) * f * 4.5, 1.0);${OUT} }`
      });
      const m = new THREE.Mesh(instanced({ aPos: flames }, flames.length / 4), fm); m.frustumCulled = false; scene.add(m);
      const ep = [], es = []; for (let i = 0; i < flames.length; i += 4) if (flames[i + 3] > .6) for (let k = 0; k < 12; k++) { ep.push(flames[i], flames[i + 1], flames[i + 2]); es.push(Math.random()); }
      const eg = new THREE.BufferGeometry(); eg.setAttribute('position', new THREE.Float32BufferAttribute(ep, 3)); eg.setAttribute('aSeed', new THREE.Float32BufferAttribute(es, 1));
      const em = new THREE.Points(eg, new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, uniforms: { uTime: U.time },
        vertexShader: `attribute float aSeed; uniform float uTime; varying float vA;
          void main() { float ph = fract(uTime * (.22 + aSeed * .2) + aSeed * 7.0);
            vec3 p = position + vec3(sin(ph * 9.0 + aSeed * 40.0) * .3 * ph, .3 + ph * (1.4 + aSeed * 1.4), cos(ph * 7.0 + aSeed * 33.0) * .3 * ph);
            vec4 mv = viewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = clamp(26.0 * (1.0 - ph) / -mv.z, 1.0, 4.0); vA = (1.0 - ph) * step(.35, aSeed + ph * .3); }`,
        fragmentShader: `varying float vA; void main() { gl_FragColor = vec4(vec3(1.0, .42, .08) * vA * 2.4, 1.0);${OUT} }`
      })); em.frustumCulled = false; scene.add(em);
    }
    for (let i = 0; i < flames.length; i += 4) if (flames[i + 3] > .6) smokes.push([flames[i], flames[i + 1] + .8, flames[i + 2], .55, 5, .5]);
    if (smokes.length) {
      const pos = [], seed = [], per = 14;
      for (const s of smokes) for (let k = 0; k < per; k++) { pos.push(s[0], s[1], s[2], s[3]); seed.push(k / per + Math.random() * .08, (.045 + Math.random() * .02) * (s[4] > 10 ? .55 : 1.6), s[4], s[5]); }
      const sm = new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, fog: false, uniforms: { uTime: U.time, uWind: U.wind, uTex: { value: tx.smoke }, uCloud: { value: tx.cloud }, uCol: X.smokeCol, uFogC: { value: scene.fog.color } },
        vertexShader: `attribute vec4 aPos; attribute vec4 aSeed; uniform float uTime, uWind; varying vec2 vUv; varying float vA; varying vec3 vW; varying float vD;
          void main() { float ph = fract(uTime * aSeed.y + aSeed.x);
            vec3 c = aPos.xyz + vec3(ph * ph * aSeed.z * .45 * uWind + sin(ph * 6.0 + aSeed.x * 20.0) * .35 * ph, ph * aSeed.z, ph * ph * aSeed.z * .2 * uWind + cos(ph * 5.0 + aSeed.x * 31.0) * .35 * ph);
            vec4 mv = viewMatrix * vec4(c, 1.0); mv.xy += position.xy * aPos.w * (.6 + ph * 2.6);
            gl_Position = projectionMatrix * mv; vUv = uv; vA = smoothstep(0.0, .1, ph) * pow(1.0 - ph, 1.3); vW = c; vD = aSeed.w; }`,
        fragmentShader: `uniform sampler2D uTex, uCloud; uniform vec3 uCol, uFogC; varying vec2 vUv; varying float vA; varying vec3 vW; varying float vD;\n${X.FOG_FN}
          void main() { float n = texture2D(uCloud, vUv * .55 + vD + vW.y * .03).r, a = texture2D(uTex, vUv).a * vA * (.3 + n);
            vec3 col = uCol * mix(1.0, .2, vD) * (.6 + n * .6); vec4 fg = amFog(vW, uEye, uFogC);
            gl_FragColor = vec4(mix(col, fg.rgb, fg.a), min(a, 1.0) * (1.0 - fg.a * .45) * .9);${OUT} }`
      });
      const m = new THREE.Mesh(instanced({ aPos: pos, aSeed: seed }, pos.length / 4), sm); m.frustumCulled = false; m.renderOrder = 5; scene.add(m);
    }
    // blood and sparks
    const pm = [mat(0x5a0808, 'b'), mat(0xffc860, 'b', 6)], pg = new THREE.BoxGeometry(.03, .03, .03);
    for (let i = 0; i < 120; i++) { const m = new THREE.Mesh(pg, pm[0]); m.visible = false; scene.add(m); X.parts.push({ m, life: 0, vx: 0, vy: 0, vz: 0, blood: true, pm }); }
    X.cull(w.start.x * S, w.start.y * S);
  };

  function prop(kind, x, y, rot, o) {
    const g = new THREE.Group(); g.position.set(x * S, 0, y * S); g.rotation.y = rot === undefined ? Math.random() * 6.28 : rot;
    const wd = 0x3c2c1c, st = 0x6a6862, iron = 0x4b4f54, cyl = (r1, r2, h, c, px, py, pz, seg) => mesh(new THREE.CylinderGeometry(r1, r2, h, seg || 10), c, px, py, pz, g);
    const flame = (yy, size, intensity) => o && o.fireAt(g.position.x, yy, g.position.z, size, intensity);
    // a photographed model in place of a thing built from boxes, where one has been fetched (assets.js)
    // tone: these were photographed clean and new; here they have stood out in the wet for years
    const md = (name, k, tone) => { const M = X.TX && X.TX.md && X.TX.md[name]; if (!M) return false; if (!M.mat) { M.mat = new THREE.MeshStandardMaterial({ map: M.map, normalMap: M.nmap, normalScale: new THREE.Vector2(1, -1), roughness: .9, metalness: 0 }); M.mat.color.setRGB(tone[0], tone[1], tone[2]); } for (const geo of M.geos) { const m = new THREE.Mesh(geo, M.mat); m.scale.setScalar(k); m.castShadow = m.receiveShadow = true; g.add(m); } return true; };
    switch (kind) {
      case 'chest': box(.85, .45, .5, 0x4a3320, 0, .225, 0, g); { const m = cyl(.25, .25, .86, 0x3c2a1c, 0, .45, 0, 10); m.rotation.z = PI / 2; m.scale.set(.5, 1, 1); } box(.06, .62, .54, iron, -.28, .3, 0, g); box(.06, .62, .54, iron, .28, .3, 0, g); box(.08, .1, .03, 0x8d9399, 0, .4, .27, g); box(.9, .04, .54, iron, 0, .02, 0, g); break;
      case 'coffer': box(.7, .42, .46, 0x2a2018, 0, .21, 0, g); box(.74, .08, .5, iron, 0, .44, 0, g); for (const px of [-.25, 0, .25]) box(.05, .46, .5, iron, px, .23, 0, g); box(.1, .12, .04, 0x8d9399, 0, .3, .25, g); break;
      case 'crate': if (md('crate', 1.45, [.56, .5, .44])) break; box(.7, .7, .7, 0x6a5032, 0, .35, 0, g); box(.74, .08, .74, 0x4a3822, 0, .66, 0, g); box(.74, .08, .74, 0x4a3822, 0, .06, 0, g); for (const s of [-1, 1]) { box(.08, .7, .74, 0x4a3822, s * .33, .35, 0, g); box(.74, .7, .08, 0x4a3822, 0, .35, s * .33, g); } break;
      case 'armoury': box(1.5, .42, .5, 0x4a3822, 0, .21, 0, g); box(1.54, .07, .54, 0x2a2018, 0, .45, 0, g); for (const px of [-.6, 0, .6]) box(.06, .46, .56, iron, px, .23, 0, g); break;
      case 'toolbox': box(.7, .3, .36, 0x4a3822, 0, .15, 0, g); box(.6, .04, .04, wd, 0, .44, 0, g); box(.04, .16, .04, wd, -.28, .37, 0, g); box(.04, .16, .04, wd, .28, .37, 0, g); box(.3, .04, .06, 0x8d9399, .1, .32, .05, g); break;
      case 'sack': case 'pile': { const m = mesh(new THREE.IcosahedronGeometry(.36, 1), mat(0x8f7e5c, 's'), 0, .27, 0, g); m.scale.set(1, .8, 1); box(.1, .14, .1, 0x6f6146, 0, .58, 0, g); if (kind === 'sack') { const m2 = mesh(new THREE.IcosahedronGeometry(.3, 1), mat(0x7f7052, 's'), .42, .16, .15, g); m2.scale.set(1.2, .55, 1); } break; }
      case 'barrel': if (md('barrel', 1, [.5, .45, .41])) break; cyl(.27, .27, .2, 0x5a4026, 0, .1, 0, 12); cyl(.31, .27, .2, 0x5a4026, 0, .3, 0, 12); cyl(.31, .31, .2, 0x5e4428, 0, .5, 0, 12); cyl(.27, .31, .2, 0x5a4026, 0, .7, 0, 12); cyl(.315, .315, .05, iron, 0, .58, 0, 12); cyl(.3, .3, .05, iron, 0, .2, 0, 12); cyl(.25, .25, .02, 0x3a2a1a, 0, .79, 0, 12); break;
      case 'rack': box(.08, 1.3, .08, wd, -.6, .65, 0, g); box(.08, 1.3, .08, wd, .6, .65, 0, g); box(1.3, .07, .07, wd, 0, 1.15, 0, g); box(1.3, .07, .07, wd, 0, .3, 0, g); for (let i = -1; i <= 1; i++) box(.04, 1.25, .04, i ? 0x6b4a2b : 0x8d9399, i * .3, .62, .1, g).rotation.x = -.2; break;
      case 'desk': box(1, .06, .6, 0x4a3320, 0, .82, 0, g).rotation.x = .12; for (const [px, pz] of [[-.44, -.25], [.44, -.25], [-.44, .25], [.44, .25]]) box(.06, .8, .06, wd, px, .4, pz, g); box(.3, .02, .22, 0xd8cfae, .1, .87, 0, g).rotation.x = .12; box(.9, .5, .04, 0x3a2a1c, 0, .5, -.28, g); break;
      case 'medchest': box(.7, .4, .42, 0x8a8068, 0, .2, 0, g); box(.72, .06, .44, 0x6a6250, 0, .43, 0, g); box(.2, .06, .01, 0x7a1c14, 0, .22, .215, g); box(.06, .2, .01, 0x7a1c14, 0, .22, .215, g); break;
      case 'dispensary': box(1.3, 1.7, .3, 0x3a2a1c, 0, .85, 0, g); for (const py of [.5, .95, 1.4]) { box(1.2, .04, .32, 0x5a4026, 0, py, .02, g); for (let i = 0; i < 4; i++) cyl(.06, .06, .16, [0x7a5a3c, 0x4f6a3a, 0x8a8068, 0x5a7a8a][i], -.42 + i * .28, py + .1, .04, 6); } break;
      case 'altar': box(1.5, .95, .7, st, 0, .475, 0, g); box(1.6, .04, .8, 0x8a2a2a, 0, .97, 0, g); for (const px of [-.5, .5]) { cyl(.03, .05, .3, 0xb89a3e, px, 1.14, 0, 6); } box(.06, .4, .04, 0xb89a3e, 0, 1.2, 0, g); box(.24, .05, .04, 0xb89a3e, 0, 1.28, 0, g); break;
      case 'cache': { const m = mesh(new THREE.IcosahedronGeometry(.5, 1), mat(0x4a3c28, undefined, undefined, 'flat'), 0, .02, 0, g); m.scale.set(1.2, .28, 1); box(.5, .03, .06, wd, .3, .2, .1, g).rotation.y = .6; break; }
      case 'courier': box(.42, .2, 1.5, mat(0x4a3a2c, undefined, undefined, 'soft'), 0, .1, 0, g); ball(.1, 0xa08468, 0, .13, -.86, g); box(.4, .26, .3, 0x6b4a2b, .34, .13, .1, g); box(.5, .03, .9, 0x2a1512, 0, .02, .1, g); break;
      case 'remains': box(.5, .04, .9, 0x2a1512, 0, .02, 0, g); ball(.09, 0xb8b09a, 0, .09, -.5, g); for (let i = 0; i < 5; i++) box(.4, .04, .05, 0xb8b09a, rand(-.1, .1), .05, -.25 + i * .14, g); break;
      case 'woodpile': for (let i = 0; i < 6; i++) { const m = cyl(.09, .09, 1.1, i % 2 ? 0x5a4026 : 0x6b4a2b, 0, .09 + (i > 2 ? .17 : 0), (i % 3 - 1) * .19 + (i > 2 ? .09 : 0), 7); m.rotation.z = PI / 2; } break;
      case 'herbpatch': for (let i = 0; i < 7; i++) { const a = i * .9, r = .1 + (i % 3) * .14; mesh(new THREE.ConeGeometry(.05, .32, 4), 0x4f6a34, Math.cos(a) * r, .16, Math.sin(a) * r, g); ball(.035, 0xd8d4c0, Math.cos(a) * r, .33, Math.sin(a) * r, g); } break;
      case 'well': { const wg = new THREE.CylinderGeometry(.95, 1, .8, 14).toNonIndexed(); wg.computeVertexNormals(); mesh(wg, X.wellM || mat(st), 0, .4, 0, g); } cyl(.75, .75, .82, 0x0c0c0c, 0, .4, 0, 14); box(.14, 2, .14, wd, -.9, 1, 0, g); box(.14, 2, .14, wd, .9, 1, 0, g); box(2.1, .12, .12, wd, 0, 1.95, 0, g); box(.02, .9, .02, 0xa08a58, 0, 1.45, 0, g); cyl(.14, .11, .22, 0x4a3822, 0, .95, 0, 8); break;
      case 'gallows': box(2.2, .25, 1.6, wd, 0, .125, 0, g); box(.16, 3.4, .16, wd, -.9, 1.7, 0, g); box(1.9, .14, .14, wd, -.05, 3.3, 0, g); box(.1, .9, .1, wd, -.6, 2.9, 0, g).rotation.z = .8; box(.03, 1.1, .03, 0xa08a58, .6, 2.7, 0, g); ball(.08, 0xa08a58, .6, 2.15, 0, g); break;
      case 'grave': if (Math.random() < .5) { box(.1, .9, .08, st, 0, .45, 0, g); box(.5, .1, .08, st, 0, .65, 0, g); } else box(.5, .75, .12, st, 0, .37, 0, g); g.rotation.z = rand(-.12, .12); box(.7, .06, 1.7, mat(0x3a2e22, undefined, undefined, 'flat'), 0, .03, .95, g); break;
      case 'cross': box(1.4, .3, 1.4, st, 0, .15, 0, g); box(1, .3, 1, st, 0, .45, 0, g); box(.22, 2.4, .22, st, 0, 1.8, 0, g); box(.9, .2, .2, st, 0, 2.5, 0, g); break;
      case 'cart': box(1.8, .1, 1, 0x5a4026, 0, .62, 0, g); box(1.8, .3, .06, 0x4a3822, 0, .8, .5, g); box(1.8, .3, .06, 0x4a3822, 0, .8, -.5, g); for (const s of [-1, 1]) {      // spoked wheels: felloes, an iron tyre, eight spokes and a nave
        const wz = s * .6; mesh(new THREE.TorusGeometry(.41, .05, 6, 20), 0x33271c, .1, .46, wz, g); mesh(new THREE.TorusGeometry(.458, .014, 4, 20), iron, .1, .46, wz, g);
        for (let i = 0; i < 8; i++) { const a = i * PI / 4; box(.036, .37, .036, wd, .1 - Math.sin(a) * .2, .46 + Math.cos(a) * .2, wz, g).rotation.z = a; }
        cyl(.085, .085, .17, 0x33271c, .1, .46, wz, 8).rotation.x = PI / 2; cyl(.03, .03, 1.3, wd, .1, .46, 0, 6).rotation.x = PI / 2;
      } box(1.4, .07, .07, wd, 1.5, .5, .4, g).rotation.z = -.25; box(1.4, .07, .07, wd, 1.5, .5, -.4, g).rotation.z = -.25; g.rotation.z = rand(-.03, .06); break;
      case 'hay': { const m = mesh(new THREE.IcosahedronGeometry(.8, 1), mat(0x9a8548, 's', undefined, 'straw'), 0, .55, 0, g); m.scale.set(1, .75, 1); break; }
      case 'stall': for (const [px, pz] of [[-.9, -.5], [.9, -.5], [-.9, .5], [.9, .5]]) box(.09, 2, .09, wd, px, 1, pz, g); box(2.1, .05, 1.3, 0x6a3a2c, 0, 2.02, 0, g).rotation.x = .18; box(1.9, .08, .7, 0x5a4026, 0, .85, .1, g); break;
      case 'tent': {      // a ridge tent: canvas over a pole between two uprights, pegged out at the corners
        const tg = new THREE.ExtrudeGeometry(shape([[-1.25, 0], [1.25, 0], [0, 1.65]]), { depth: 2.5, bevelEnabled: false }); tg.translate(0, 0, -1.25); mesh(tg, mat(0x8a7d62, 's'), 0, 0, 0, g);
        box(.06, .06, 2.8, wd, 0, 1.68, 0, g); for (const s of [-1, 1]) { box(.07, 1.75, .07, wd, 0, .875, s * 1.3, g); for (const t of [-1, 1]) { box(.04, .22, .04, wd, t * 1.5, .1, s * 1.1, g).rotation.z = t * .5; box(.012, .012, .5, 0xa08a58, t * 1.38, .14, s * 1.1, g).rotation.set(0, PI / 2, 0); } }
        break; }
      case 'pew': box(2.6, .08, .4, 0x3a2a1c, 0, .45, 0, g); box(2.6, .5, .06, 0x3a2a1c, 0, .7, -.2, g); for (const px of [-1.2, 0, 1.2]) box(.08, .45, .4, wd, px, .22, 0, g); break;
      case 'bed': box(.9, .12, 1.9, wd, 0, .3, 0, g); box(.86, .12, 1.8, 0x9a8a64, 0, .42, 0, g); box(.86, .06, 1.1, 0x5a4a44, 0, .5, .3, g); for (const [px, pz] of [[-.4, -.9], [.4, -.9], [-.4, .9], [.4, .9]]) box(.08, .3, .08, wd, px, .15, pz, g); break;
      case 'table': if (md('table', 1.35, [.55, .5, .46])) break; box(2.4, .08, .8, 0x4a3320, 0, .78, 0, g); for (const px of [-1, 1]) box(.1, .76, .7, wd, px, .38, 0, g); for (const pz of [-.7, .7]) { box(2.2, .06, .26, 0x3a2a1c, 0, .44, pz, g); } break;
      case 'anvil': box(.5, .55, .5, 0x3c2c1c, 0, .275, 0, g); box(.6, .16, .22, 0x33363a, 0, .63, 0, g); box(.2, .1, .2, 0x33363a, .36, .64, 0, g); break;
      case 'pell': box(.2, 1.9, .2, wd, 0, .95, 0, g); box(.9, .12, .12, wd, 0, 1.45, 0, g); break;
      case 'trebuchet': for (const pz of [-.9, .9]) { box(.2, 3.2, .2, wd, -.5, 1.5, pz, g).rotation.z = .3; box(.2, 3.2, .2, wd, .5, 1.5, pz, g).rotation.z = -.3; box(3.6, .2, .2, wd, 0, .1, pz, g); } box(.16, .16, 2, wd, 0, 2.9, 0, g); { const m = box(5.2, .18, .18, wd, .7, 2.3, 0, g); m.rotation.z = -.5; } box(.8, .8, .8, 0x3a3228, -1.3, 2.9, 0, g); break;
      case 'brazier': cyl(.3, .16, .3, 0x33363a, 0, 1, 0, 8); box(.06, .9, .06, 0x33363a, 0, .45, 0, g); cyl(.25, .3, .06, 0x33363a, 0, .03, 0, 8); for (let i = 0; i < 5; i++) ball(.07, 0x1a1512, Math.cos(i * 1.3) * .14, 1.14, Math.sin(i * 1.3) * .14, g); flame(1.12, .62, 1.5); break;
      case 'candle': box(.05, 1.3, .05, 0x33363a, 0, .65, 0, g); cyl(.2, .2, .03, 0x33363a, 0, .02, 0, 8); box(.5, .03, .03, 0x33363a, 0, 1.25, 0, g); for (const px of [-.22, 0, .22]) cyl(.02, .02, .14, 0xd8cfae, px, 1.34, 0, 5); flame(1.4, .2, 1.0); break;
      case 'fire': box(.9, .12, .14, 0x2a1d12, 0, .08, 0, g).rotation.y = .6; box(.9, .12, .14, 0x2a1d12, 0, .1, 0, g).rotation.y = -.7; box(.8, .1, .12, 0x1a120c, 0, .14, 0, g).rotation.y = 1.8; for (let i = 0; i < 7; i++) ball(.1, 0x4a4a48, Math.cos(i * .9) * .55, .05, Math.sin(i * .9) * .55, g); flame(.12, .8, 1.5); break;
    }
    return g;
  }
  gfx.addPile = (x, y) => { const g = X.fuse(prop('pile', x, y)); X.scene.add(g); return g; };
  gfx.openDoor = d => { const m = X.doorM[d.tx + ',' + d.ty]; if (m) { m.rotation.y = 1.45; m.position.set(-.85, 0, .9); } };
  gfx.decal = function (x, y, s) {
    const gx = X.groundX; if (!gx) return;
    gx.fillStyle = `rgba(${52 + Math.random() * 22 | 0},4,4,.7)`;
    for (let i = 0; i < 4; i++) { gx.beginPath(); gx.arc((x + rand(-s, s)) / 2, (y + rand(-s, s)) / 2, rand(s * .15, s * .4) + .6, 0, 7); gx.fill(); }
    X.groundDirty = true;
  };
})();
