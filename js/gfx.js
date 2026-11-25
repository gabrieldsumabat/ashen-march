'use strict';
// First-person 3D renderer, part 1: shared state, shader plumbing (fog, wind, surface grime), materials,
// geometry helpers and the static batcher. Textures are in gfx-tex.js, the image pipeline in gfx-post.js,
// the world in gfx-world.js and everything that moves in gfx-actors.js.
(function () {
  const S = G.S = 1 / 16, PI = Math.PI;
  G.RS = .62;      // reach scale: weapon reach in data is in px of the old top-down scale
  // uniforms shared by reference between every material that asks for them
  const U = {
    time: { value: 0 }, fogA: { value: new THREE.Vector4(.014, .012, .3, 1) }, sunDir: { value: new THREE.Vector3(-.6, .5, .4).normalize() }, sunCol: { value: new THREE.Color(0, 0, 0) },
    wet: { value: 0 }, wind: { value: 1 }, grime: { value: null }, rain: { value: 0 }, skyVis: { value: null }, skyScale: { value: new THREE.Vector2(1, 1) }, eye: { value: new THREE.Vector3() }
  };
  const X = G.gx = { scene: null, camera: null, renderer: null, world: null, fires: [], parts: [], lights: [], doorM: {}, U, uTime: U.time, envMats: [], q: {}, weather: { id: 'overcast', rain: .5, fog: 1, sun: 1, storm: false, hear: 1 } };
  const gfx = G.gfx = {};
  X.hex = c => new THREE.Color(c).getHex();
  const lin = X.lin = c => new THREE.Color(c).convertSRGBToLinear();

  // ------------------------------------------------------------------ shader plumbing
  // Fog: an even haze plus ground mist that thins with height, lit from the direction of the sun. It is applied
  // before tone mapping (the stock chunk runs after it), so it behaves the same with and without the image pipeline.
  const FOG_FN = X.FOG_FN = `
    uniform vec4 uFogA; uniform vec3 uSunDir; uniform vec3 uSunCol; uniform sampler2D uSkyVis; uniform vec2 uSkyScale;
    uniform vec3 uEye;      // three only gives some materials the camera position, so we carry our own
    vec4 amFog(vec3 wp, vec3 cam, vec3 fc) {
      vec3 v = wp - cam; float d = length(v); vec3 dir = v / max(d, 1e-4);
      float b = uFogA.z, y1 = max(wp.y, -2.0), dy = y1 - cam.y;
      float k = abs(dy) > .01 ? (exp(-b * cam.y) - exp(-b * y1)) / (b * dy) : exp(-b * cam.y);
      float od = (uFogA.x * uFogA.x * d * d + uFogA.y * d * k) * mix(.2, 1.0, smoothstep(.34, .6, texture2D(uSkyVis, wp.xz * uSkyScale).b));      // little of it gets indoors
      float s = max(dot(dir, uSunDir), 0.0);
      return vec4(fc + uSunCol * (pow(s, 5.0) * .5 + pow(s, 40.0) * .8), 1.0 - exp(-od));
    }`;
  const SC = THREE.ShaderChunk;
  SC.fog_pars_vertex = '#ifdef USE_FOG\n varying vec3 vFogW;\n#endif';
  SC.fog_vertex = '#ifdef USE_FOG\n #ifdef USE_INSTANCING\n  vFogW = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;\n #else\n  vFogW = (modelMatrix * vec4(transformed, 1.0)).xyz;\n #endif\n#endif';
  SC.fog_pars_fragment = '#ifdef USE_FOG\n uniform vec3 fogColor; varying vec3 vFogW;\n' + FOG_FN + '\n#endif';
  SC.fog_fragment = '';
  SC.tonemapping_fragment = '#ifdef USE_FOG\n { vec4 fg = amFog(vFogW, uEye, fogColor); gl_FragColor.rgb = mix(gl_FragColor.rgb, fg.rgb, fg.a); }\n#endif\n' + SC.tonemapping_fragment;
  // Sky light: under a roof or under trees there is less of it. One small map of the whole place says how much,
  // and every lit surface (walls, props, people, the weapon in your hand) reads it at its own position.
  SC.lights_fragment_begin += '\n#if defined( RE_IndirectDiffuse ) && defined( USE_FOG )\n float skyV = texture2D(uSkyVis, vFogW.xz * uSkyScale).b; irradiance *= skyV;\n#endif';
  SC.lights_fragment_maps += '\n#if defined( USE_ENVMAP ) && defined( RE_IndirectSpecular ) && defined( RE_IndirectDiffuse ) && defined( USE_FOG )\n radiance *= skyV; iblIrradiance *= skyV;\n#endif';
  const bind = X.bind = sh => { sh.uniforms.uFogA = U.fogA; sh.uniforms.uSunDir = U.sunDir; sh.uniforms.uSunCol = U.sunCol; sh.uniforms.uSkyVis = U.skyVis; sh.uniforms.uSkyScale = U.skyScale; sh.uniforms.uEye = U.eye; };
  THREE.Material.prototype.onBeforeCompile = function (sh) { bind(sh); };
  // every distinct patch needs its own key, or three will hand two different patches the same compiled program
  const patch = X.patch = function (m, key, fn) { m.onBeforeCompile = sh => { bind(sh); fn(sh); }; m.customProgramCacheKey = () => key; return m; };
  const ins = X.ins = (src, at, add, before) => { if (src.indexOf(at) < 0) console.warn('shader patch: no ' + at); return src.replace(at, before ? add + '\n' + at : at + '\n' + add); };

  // wind: bends foliage by its height above its own root
  const WIND = amp => `
    { float swh = max(0.0, position.y) * ${amp.toFixed(4)} * uWind;
    #ifdef USE_INSTANCING
      vec3 swp = (instanceMatrix * vec4(position, 1.0)).xyz + modelMatrix[3].xyz;
    #else
      vec3 swp = (modelMatrix * vec4(position, 1.0)).xyz;
    #endif
      float gust = .45 + .55 * sin(uTime * .6 + swp.x * .06 + swp.z * .045);
      float sw1 = sin(uTime * 1.7 + swp.x * .35 + swp.z * .27) + sin(uTime * 3.1 + swp.z * .6) * .4;
      transformed.x += sw1 * swh * gust; transformed.z += sw1 * swh * .6 * gust; }`;
  X.windV = (sh, amp) => { sh.uniforms.uTime = U.time; sh.uniforms.uWind = U.wind; sh.vertexShader = 'uniform float uTime; uniform float uWind;\n' + ins(sh.vertexShader, '#include <begin_vertex>', WIND(amp)); };
  // grime: every plain-coloured surface gets blotches, speckle and uneven gloss, mapped through space so no UVs are needed
  X.grimeS = function (sh, scale, amt) {
    sh.uniforms.uGrime = U.grime;
    sh.vertexShader = 'varying vec3 vGP; varying vec3 vGN;\n' + ins(sh.vertexShader, '#include <begin_vertex>', 'vGP = position; vGN = normal;');
    sh.fragmentShader = 'uniform sampler2D uGrime; varying vec3 vGP; varying vec3 vGN;\n' + ins(sh.fragmentShader, '#include <color_fragment>', `
      vec3 gw = abs(vGN); gw /= (gw.x + gw.y + gw.z + 1e-4);
      vec2 gr = texture2D(uGrime, vGP.yz * ${scale.toFixed(2)}).rg * gw.x + texture2D(uGrime, vGP.xz * ${scale.toFixed(2)}).rg * gw.y + texture2D(uGrime, vGP.xy * ${scale.toFixed(2)}).rg * gw.z;
      diffuseColor.rgb *= 1.0 + ((gr.r - .5) * 1.1 + (gr.g - .5) * .7) * ${amt.toFixed(2)};`);
    sh.fragmentShader = ins(sh.fragmentShader, '#include <roughnessmap_fragment>', `roughnessFactor = clamp(roughnessFactor * (1.0 + (gr.g - .5) * ${(amt * 1.2).toFixed(2)}), .05, 1.0);`);
  };

  // Close detail, laid on in "grain space". Every merged piece carries two extra attributes (see merge): where each
  // point of it is, in metres, in a frame whose x runs along the piece's own longest side, and which way it faces in
  // that frame. The texture is laid on from three sides and blended by facing, so grain runs the length of a plank,
  // cloth hangs down a sleeve and fur lies along a back, with no seams and nothing to unwrap. The texture's channels:
  // r light and dark, g how much of a second colour (rust, lichen, dirt, pale tips), b height, a gloss (for boards, the
  // gaps between them instead).
  X.detailS = function (sh, d) {
    const f = v => v.toFixed(4), c = d.sec !== undefined ? lin(d.sec) : null, sc = (X.TX.detS && X.TX.detS[d.t]) || d.s;      // a photographed surface says how big it is
    sh.uniforms.uDet = { value: X.TX.det[d.t] };
    sh.vertexShader = 'attribute vec3 gp; attribute vec3 gn; varying vec3 vTP; varying vec3 vTN;\n' + ins(sh.vertexShader, '#include <begin_vertex>', 'vTP = gp; vTN = gn;');
    sh.fragmentShader = `uniform sampler2D uDet; varying vec3 vTP; varying vec3 vTN;
      vec3 amBump(vec3 sp, vec3 sn, vec2 dh, float fd) { vec3 sx = dFdx(sp), sy = dFdy(sp), r1 = cross(sy, sn), r2 = cross(sn, sx); float dd = dot(sx, r1) * fd; return normalize(abs(dd) * sn - sign(dd) * (dh.x * r1 + dh.y * r2)); }
      ` + ins(sh.fragmentShader, '#include <color_fragment>', `
      vec3 tw = abs(vTN); tw *= tw; tw *= tw; tw /= (tw.x + tw.y + tw.z + 1e-5);
      vec4 dt = texture2D(uDet, vTP.zy * ${f(sc)} + vec2(.37, .11)) * tw.x + texture2D(uDet, vTP.xz * ${f(sc)}) * tw.y + texture2D(uDet, vTP.xy * ${f(sc)} + vec2(.5, .23)) * tw.z;
      ${d.seam ? 'dt.r *= 1.0 - dt.a * .72; dt.b -= dt.a * .5;' : ''}
      diffuseColor.rgb *= 1.0 + (dt.r * 2.0 - 1.0) * ${f(d.lum)};
      float dMix = dt.g * ${f(d.mix)};
      diffuseColor.rgb = mix(diffuseColor.rgb, ${c ? `vec3(${f(c.r)}, ${f(c.g)}, ${f(c.b)})` : `diffuseColor.rgb * ${f(d.rel)}`}, dMix);`);
    if (d.rk && !d.seam) sh.fragmentShader = ins(sh.fragmentShader, '#include <roughnessmap_fragment>', `roughnessFactor = clamp(roughnessFactor * (1.0 + (dt.a * 2.0 - 1.0) * ${f(d.rk)}), .04, 1.0);`);
    if (d.rust) sh.fragmentShader = ins(sh.fragmentShader, '#include <metalnessmap_fragment>', 'metalnessFactor *= 1.0 - dMix * .85;');      // rust is not metal
    if (!X.q.low) sh.fragmentShader = ins(sh.fragmentShader, '#include <normal_fragment_maps>', `normal = amBump(-vViewPosition, normal, vec2(dFdx(dt.b), dFdy(dt.b)) * ${f(d.bump)} * (1.0 - smoothstep(10.0, 34.0, length(vViewPosition))), faceDirection);`);
  };

  // ------------------------------------------------------------------ materials
  // What each kind of surface is. Everything built from plain-coloured pieces is drawn with one of these, its colour
  // carried per vertex. r roughness, m metalness, fs faceted, g [scale, amount] of the broad grime that needs no
  // mapping, d the close detail (see detailS): t which texture, s repeats per metre, lum how strongly its light and
  // dark show, mix how far it pulls toward the second colour (sec: that colour; rel: the surface's own colour times
  // this), bump relief in metres, rk how much it varies the gloss, seam boards with gaps, rust the second colour is
  // not metal.
  const SURF = X.SURF = {
    flat: { r: .9, fs: 1, g: [1.6, .55] }, smooth: { r: .9, g: [1.6, .55] },
    metal: { r: .5, m: .78, g: [3, .4], d: { t: 'iron', s: 2.6, lum: .5, mix: .6, sec: 0x4a2c18, bump: .0008, rk: .5, rust: 1 } },
    wood: { r: .86, g: [1.1, .3], d: { t: 'wood', s: 1.6, lum: .9, mix: .32, sec: 0x625e54, bump: .002, rk: 0, seam: 1 } },
    haft: { r: .7, g: [3, .25], d: { t: 'grain', s: 5.5, lum: .7, mix: .25, sec: 0x6e6a60, bump: .0012, rk: 0 } },
    stone: { r: .93, g: [1.1, .35], d: { t: 'stone', s: 1.4, lum: .8, mix: .6, sec: 0x53583a, bump: .004, rk: .3 } },
    rock: { r: .95, fs: 1, g: [.5, .4], d: { t: 'stone', s: .8, lum: .9, mix: .7, sec: 0x4a5232, bump: .008, rk: .3 } },
    straw: { r: 1, g: [1.5, .3], d: { t: 'strand', s: 2.2, lum: 1, mix: .4, rel: 1.5, bump: .003, rk: 0 } },
    soft: { r: .95, ds: 1, g: [2.2, .3], d: { t: 'cloth', s: 5, lum: .6, mix: .55, sec: 0x30281e, bump: .001, rk: .15 } },
    quilt: { r: .96, ds: 1, g: [2.2, .3], d: { t: 'quilt', s: 4, lum: .7, mix: .5, sec: 0x30281e, bump: .003, rk: .1 } },
    brig: { r: .8, g: [3, .3], d: { t: 'brig', s: 4, lum: .9, mix: .5, sec: 0x241a12, bump: .0015, rk: .8 } },
    leather: { r: .6, g: [4, .3], d: { t: 'leather', s: 7, lum: .7, mix: .25, rel: 1.7, bump: .001, rk: .6 } },
    skin: { r: .66, g: [3, .16], d: { t: 'skin', s: 9, lum: .4, mix: .3, sec: 0x84483c, bump: .0006, rk: .4 } },
    hair: { r: .78, g: [4, .2], d: { t: 'strand', s: 11, lum: 1, mix: .3, rel: 1.8, bump: .0005, rk: .3 } },
    fur: { r: .93, g: [2, .3], d: { t: 'strand', s: 5, lum: .65, mix: .35, rel: 1.6, bump: .001, rk: 0 } },
    mail: { r: .52, m: .62, g: [6, .45] }, eye: { r: .2, g: [1, .05] },
    plate: { r: .34, m: .9, g: [3.5, .3], d: { t: 'plate', s: 3.5, lum: .3, mix: .5, sec: 0x3a2e24, bump: .001, rk: .45 } },
    steel: { r: .28, m: .93, fs: 1, g: [6, .12], d: { t: 'steel', s: 9, lum: .16, mix: .3, sec: 0x3a2412, bump: .0003, rk: .5 } }
  };
  const VM = X.VM = {};
  // sk: for skin hung on a skeleton (the same surface, bent by bones)
  function vmat(cls, sk) {
    const key = sk ? cls + '$' : cls; if (VM[key]) return VM[key];
    const s = SURF[cls] || SURF.flat, o = { vertexColors: true, roughness: s.r, metalness: s.m || 0 }; if (sk) o.skinning = true;
    if (s.fs) o.flatShading = true; if (s.ds) o.side = THREE.DoubleSide;
    const m = new THREE.MeshStandardMaterial(o); m.userData.cls = cls;
    if (o.metalness) { X.envMats.push(m); if (X.env) m.envMap = X.env.texture; }
    if (cls === 'mail' && X.TX) { m.map = X.TX.mailT; m.normalMap = X.TX.mailN; m.normalScale.set(.9, .9); }
    patch(m, 'vm-' + key, sh => { X.grimeS(sh, s.g[0], s.g[1]); if (s.d && X.TX && X.TX.det && X.TX.det[s.d.t]) X.detailS(sh, s.d); });
    m.customProgramCacheKey = () => 'vm-' + key + (X.q.low ? 'L' : 'H');      // the Low setting goes without the relief
    return VM[key] = m;
  }
  X.vmat = vmat;
  // What a plain-coloured prop is made of, told from its colour: iron is a blue grey, stone a warm grey, timber a
  // middling brown, sacking and canvas a pale one, dyed cloth a strong red.
  const kindOf = X.kindOf = function (hex, cls) {
    if (cls === 'metal' || hex === undefined) return cls;
    const r = hex >> 16 & 255, g = hex >> 8 & 255, b = hex & 255, hi = Math.max(r, g, b), lo = Math.min(r, g, b);
    if (hi - lo < 14) return b >= r ? (hi > 40 ? 'metal' : cls) : hi > 60 && hi < 150 ? 'stone' : cls;
    if (r > g && g >= b) {
      const k = (g - b) / (r - b);
      if (r >= 36 && r <= 125 && r - b >= 16 && k > .38 && k < .64) return 'wood';
      if (r > 125 && r <= 175 && r - b > 20 && r - b < 100) return 'soft';
      if (r - b > 50 && k < .3) return 'soft';
    }
    return cls;
  };
  // kind: undefined = faceted prop, 's' = smooth, 'b' = unlit (glows; pass an intensity above 1 for things that should bloom)
  const mats = {};
  // as: say outright what it is made of (wood, stone, soft, straw, flat ...) where the colour would mislead
  const mat = X.mat = function (col, kind, glow, as) {
    const k = col + (kind || '') + (glow || '') + (as || ''); if (mats[k]) return mats[k];
    const c = lin(col); if (kind === 'b') { const m = new THREE.MeshBasicMaterial({ color: c.multiplyScalar(glow || 1) }); return mats[k] = m; }
    const r = col >> 16 & 255, g = col >> 8 & 255, b = col & 255, metal = Math.max(r, g, b) - Math.min(r, g, b) < 16 && b >= r && r > 70;   // blue-grey reads as iron
    const m = new THREE.MeshStandardMaterial({ color: c, roughness: metal ? .46 : .9, metalness: metal ? .7 : 0, flatShading: kind !== 's' });
    m.userData.cls = metal ? 'metal' : kind === 's' ? 'smooth' : 'flat'; m.userData.hex = col; if (as) m.userData.kind = as; if (metal) { X.envMats.push(m); if (X.env) m.envMap = X.env.texture; }
    return mats[k] = patch(m, 'mat-' + m.userData.cls, sh => X.grimeS(sh, metal ? 3 : 1.6, metal ? .7 : .55));
  };
  X.matList = () => Object.values(mats).concat(Object.values(VM));

  // ------------------------------------------------------------------ geometry helpers
  const M = c => typeof c === 'number' ? mat(c) : c;
  const mesh = X.mesh = (geo, col, x, y, z, parent) => { const m = new THREE.Mesh(geo, M(col)); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; parent.add(m); return m; };
  X.box = (w, h, d, col, x, y, z, parent) => mesh(new THREE.BoxGeometry(w, h, d), col, x, y, z, parent);
  X.ball = (r, col, x, y, z, parent, sx, sy, sz) => { const m = mesh(new THREE.SphereGeometry(r, 10, 8), typeof col === 'number' ? mat(col, 's') : col, x, y, z, parent); if (sx) m.scale.set(sx, sy, sz); return m; };
  const shape = X.shape = pts => { const s = new THREE.Shape(); pts.forEach((p, i) => i ? s.lineTo(p[0], p[1]) : s.moveTo(p[0], p[1])); return s; };
  X.uvScale = (g, su, sv) => { const a = g.attributes.uv; for (let i = 0; i < a.count; i++) a.setXY(i, a.getX(i) * su, a.getY(i) * sv); return g; };

  // Grain space: the frame a piece's close detail is laid on in (see detailS). Its x is the piece's own longest side
  // as it will stand in the world, in metres; a piece with no long side hangs downward. Each piece starts somewhere
  // different in the texture, so that two planks cut alike do not show the same knot.
  let gSeed = 7;
  function grainFrame(g, m) {
    if (!g.boundingBox) g.computeBoundingBox(); const b = g.boundingBox, e = m ? m.elements : null;
    const sx = e ? Math.hypot(e[0], e[1], e[2]) : 1, sy = e ? Math.hypot(e[4], e[5], e[6]) : 1, sz = e ? Math.hypot(e[8], e[9], e[10]) : 1;
    const ex = (b.max.x - b.min.x) * sx, ey = (b.max.y - b.min.y) * sy * 1.02, ez = (b.max.z - b.min.z) * sz;
    gSeed = (gSeed * 16807) % 2147483647; const o1 = gSeed % 977 / 211; gSeed = (gSeed * 16807) % 2147483647; const o2 = gSeed % 983 / 197;
    return { ax: g.userData && g.userData.grain !== undefined ? g.userData.grain : ex > ey && ex >= ez ? 0 : ez > ey ? 2 : 1, sx, sy, sz, o1, o2 };      // (a piece may say for itself which way its grain runs: a beard's hairs hang down whatever its shape)
  }
  // write a point and its facing into grain space
  function grainPut(F, gp, gn, k, px, py, pz, nx, ny, nz) {
    px *= F.sx; py *= F.sy; pz *= F.sz;
    if (F.ax === 0) { gp[k] = px; gp[k + 1] = py; gp[k + 2] = pz; gn[k] = nx; gn[k + 1] = ny; gn[k + 2] = nz; }
    else if (F.ax === 1) { gp[k] = py; gp[k + 1] = pz; gp[k + 2] = px; gn[k] = ny; gn[k + 1] = nz; gn[k + 2] = nx; }
    else { gp[k] = pz; gp[k + 1] = px; gp[k + 2] = py; gn[k] = nz; gn[k + 1] = nx; gn[k + 2] = ny; }
    gp[k] += F.o1; gp[k + 1] += F.o2; gp[k + 2] += F.o1 * .7;
  }
  // a geometry that is drawn as it is (not merged), many times over or on its own: give it its grain space in place
  X.grainGeo = function (g) {
    const P = g.attributes.position, N = g.attributes.normal, n = P.count, gp = new Float32Array(n * 3), gn = new Float32Array(n * 3), F = grainFrame(g, null); F.o1 = F.o2 = 0;
    for (let i = 0; i < n; i++) grainPut(F, gp, gn, i * 3, P.getX(i), P.getY(i), P.getZ(i), N ? N.getX(i) : 0, N ? N.getY(i) : 1, N ? N.getZ(i) : 0);
    g.setAttribute('gp', new THREE.BufferAttribute(gp, 3)); g.setAttribute('gn', new THREE.BufferAttribute(gn, 3)); return g;
  };
  // join geometries into one. list: [{ g, m: Matrix4?, c: Color?, us, vs }]. The result has position, normal, uv and
  // colour, and the two grain-space attributes.
  const _v = new THREE.Vector3(), _n3 = new THREE.Matrix3();
  const merge = X.merge = function (list) {
    let nv = 0, ni = 0;
    for (const e of list) { const n = e.g.attributes.position.count; nv += n; ni += e.g.index ? e.g.index.count : n; }
    const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), uv = new Float32Array(nv * 2), col = new Float32Array(nv * 3), gp = new Float32Array(nv * 3), gn = new Float32Array(nv * 3), idx = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
    let vo = 0, io = 0;
    for (const e of list) {
      const g = e.g, P = g.attributes.position, N = g.attributes.normal, T = g.attributes.uv, C = g.attributes.color, n = P.count, c = e.c, us = e.us || 1, vs = e.vs || us, F = grainFrame(g, e.m);
      if (e.m) _n3.getNormalMatrix(e.m);
      for (let i = 0; i < n; i++) {
        const k = (vo + i) * 3;
        grainPut(F, gp, gn, k, P.getX(i), P.getY(i), P.getZ(i), N ? N.getX(i) : 0, N ? N.getY(i) : 1, N ? N.getZ(i) : 0);
        _v.fromBufferAttribute(P, i); if (e.m) _v.applyMatrix4(e.m); pos[k] = _v.x; pos[k + 1] = _v.y; pos[k + 2] = _v.z;
        if (N) { _v.fromBufferAttribute(N, i); if (e.m) _v.applyMatrix3(_n3).normalize(); nor[k] = _v.x; nor[k + 1] = _v.y; nor[k + 2] = _v.z; } else nor[k + 1] = 1;
        if (T) { uv[(vo + i) * 2] = T.getX(i) * us; uv[(vo + i) * 2 + 1] = T.getY(i) * vs; }
        let r = 1, gg = 1, b = 1; if (C) { r = C.getX(i); gg = C.getY(i); b = C.getZ(i); } if (c) { r *= c.r; gg *= c.g; b *= c.b; }
        col[k] = r; col[k + 1] = gg; col[k + 2] = b;
      }
      if (g.index) { const ix = g.index; for (let i = 0; i < ix.count; i++) idx[io++] = ix.getX(i) + vo; } else for (let i = 0; i < n; i++) idx[io++] = vo + i;
      vo += n;
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    out.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); out.setAttribute('color', new THREE.BufferAttribute(col, 3)); out.setIndex(new THREE.BufferAttribute(idx, 1));
    out.setAttribute('gp', new THREE.BufferAttribute(gp, 3)); out.setAttribute('gn', new THREE.BufferAttribute(gn, 3));
    return out;
  };
  // paint a gradient into a geometry's vertex colours: fn(x, y, z) -> brightness (or [r, g, b])
  X.shade = function (g, fn) {
    const P = g.attributes.position, c = new Float32Array(P.count * 3);
    for (let i = 0; i < P.count; i++) { const v = fn(P.getX(i), P.getY(i), P.getZ(i)); if (v.length) { c[i * 3] = v[0]; c[i * 3 + 1] = v[1]; c[i * 3 + 2] = v[2]; } else c[i * 3] = c[i * 3 + 1] = c[i * 3 + 2] = v; }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3)); return g;
  };

  // A part is a rigid piece made of many coloured primitives that ends up as one mesh per material class.
  const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
  const colCache = {}, colOf = c => colCache[c] || (colCache[c] = lin(c));
  function Part() { this.by = {}; }
  // o: { p: [x, y, z], r: [rx, ry, rz], s: [sx, sy, sz] | n, uv: repeats per unit of UV }
  Part.prototype.add = function (cls, geo, col, o) {
    if (typeof col === 'number') {      // where the caller said no more than "flat" or "soft", the colour says what it is made of
      const r = col >> 16 & 255;
      if (cls === 'flat') { if (kindOf(col, cls) === 'wood') cls = r < 50 ? 'leather' : 'haft'; }
      else if (cls === 'soft' && r <= 60 && r > (col >> 8 & 255) && (r - (col & 255)) / r > .3) cls = 'leather';
    }
    o = o || {}; const p = o.p || [0, 0, 0], r = o.r || [0, 0, 0], s = o.s === undefined ? [1, 1, 1] : typeof o.s === 'number' ? [o.s, o.s, o.s] : o.s;
    const m = new THREE.Matrix4().compose(_p.set(p[0], p[1], p[2]), _q.setFromEuler(_e.set(r[0], r[1], r[2], o.order || 'XYZ')), _s.set(s[0], s[1], s[2]));
    (this.by[cls] || (this.by[cls] = [])).push({ g: geo, m, c: typeof col === 'number' ? colOf(col) : col, us: o.uv, vs: o.uv2 }); return this;
  };
  Part.prototype.box = function (cls, w, h, d, col, o) { return this.add(cls, new THREE.BoxGeometry(w, h, d), col, o); };
  Part.prototype.ball = function (cls, r, col, o) { return this.add(cls, new THREE.SphereGeometry(r, 12, 9), col, o); };
  // cylinder standing on y: radius at the top, at the bottom, height
  Part.prototype.cyl = function (cls, rt, rb, h, col, o, seg) { return this.add(cls, new THREE.CylinderGeometry(rt, rb, h, seg || 9), col, o); };
  // a limb hangs down from the origin
  Part.prototype.limb = function (cls, rt, rb, len, col, o, seg) { const g = new THREE.CylinderGeometry(rt, rb, len, seg || 9); g.translate(0, -len / 2, 0); return this.add(cls, g, col, o); };
  // cylinder lying along +z from z0, r1 at the near end
  Part.prototype.cylZ = function (cls, r1, r2, len, col, z0, o, seg) { const g = new THREE.CylinderGeometry(r2, r1, len, seg || 7); g.rotateX(PI / 2); g.translate(0, 0, (z0 || 0) + len / 2); return this.add(cls, g, col, o); };
  // surface of revolution about y: pts [[radius, y], ...] from the bottom up
  Part.prototype.lathe = function (cls, pts, col, o, seg) { return this.add(cls, new THREE.LatheGeometry(pts.map(p => new THREE.Vector2(p[0], p[1])), seg || 12), col, o); };
  Part.prototype.build = function (parent, shadow) {
    const out = [];
    for (const cls in this.by) { const m = new THREE.Mesh(merge(this.by[cls]), vmat(cls)); m.castShadow = shadow !== false; m.receiveShadow = true; parent.add(m); out.push(m); }
    this.by = {}; return out;
  };
  X.Part = Part;

  // Static batcher: everything that never moves is collected here and drawn as one mesh per material.
  function Batch() { this.by = new Map(); }
  Batch.prototype.add = function (root) {
    root.updateMatrixWorld(true);
    root.traverse(o => {
      if (!o.isMesh) return; const m = o.material, c0 = m.userData.cls, cls = c0 ? (m.userData.kind || (m.userData.kind = kindOf(m.userData.hex, c0))) : null, key = cls || m.uuid;
      let e = this.by.get(key); if (!e) this.by.set(key, e = { mat: cls ? vmat(cls) : m, list: [] });
      e.list.push({ g: o.geometry, m: o.matrixWorld.clone(), c: cls ? m.color : null });
    });
  };
  Batch.prototype.build = function (scene, cull) {
    for (const e of this.by.values()) { const m = new THREE.Mesh(merge(e.list), e.mat); m.castShadow = m.receiveShadow = true; m.frustumCulled = !!cull; scene.add(m); }
    this.by.clear();
  };
  X.Batch = Batch;
  // A small thing made of plain-coloured pieces that moves as one (a door, a signpost, a heap of goods): join its pieces
  // into one mesh per material, in place, so that it is drawn with the same surfaces as everything else.
  X.fuse = function (g) {
    const p = g.parent, pos = g.position.clone(), rot = g.rotation.clone(), sc = g.scale.clone(); if (p) p.remove(g);
    g.position.set(0, 0, 0); g.rotation.set(0, 0, 0); g.scale.set(1, 1, 1);
    const b = new Batch(); b.add(g); for (const k of g.children.slice()) { g.remove(k); k.traverse(o => { if (o.geometry) o.geometry.dispose(); }); }
    b.build(g, true); g.position.copy(pos); g.rotation.copy(rot); g.scale.copy(sc); if (p) p.add(g); return g;
  };

  // ------------------------------------------------------------------ renderer
  gfx.init = function (cv) {
    if (X.renderer) return;
    const r = X.renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, powerPreference: 'high-performance' });
    r.outputEncoding = THREE.sRGBEncoding; r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.05;
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
    const cam = X.camera = new THREE.PerspectiveCamera(74, 1, .05, 600); cam.rotation.order = 'YXZ';
    X.resize = () => { r.setPixelRatio(X.q.pr || 1); r.setSize(innerWidth, innerHeight, false); cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix(); if (X.post) X.post.resize(); };
    X.resize(); addEventListener('resize', X.resize);
  };
  // weather: { id, rain 0-1, fog (density multiplier), sun (multiplier), storm, hear (how well sound carries) }
  gfx.setWeather = w => { X.weather = w; };
  // quality: high = everything; medium = no image pipeline, thinner grass; low = no shadows either
  X.quality = function () {
    const lv = G.save.opts.gfx || 'high', gl2 = X.renderer.capabilities.isWebGL2, dpr = window.devicePixelRatio || 1;
    return X.q = { level: lv, low: lv === 'low', post: lv === 'high' && gl2, shadows: lv !== 'low', shadowSize: lv === 'high' ? 4096 : 2048, grass: lv === 'high' ? 22 : lv === 'medium' ? 10 : 4, pr: lv === 'low' ? 1 : Math.min(dpr, lv === 'high' ? 1.25 : 1.5), gl2 };
  };
})();
