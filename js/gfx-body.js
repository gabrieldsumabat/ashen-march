'use strict';
// Renderer, part 6: people. A man is a skeleton of eighteen bones with his body and clothes hung on it as one skin,
// so he bends at the joints instead of being jointed like a doll; and everything he does (standing, walking, fighting,
// flinching, dying) is worked out each frame as a pose for that skeleton. The head, hands, feet, weapons and the hard
// pieces of armour are rigid things fixed to single bones. See gfx-actors.js for heads, faces and what is carried.
(function () {
  const X = G.gx, PI = Math.PI, lerp = G.lerp, clamp = G.clamp, rand = G.rand, S = G.S;
  const ss = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

  // ------------------------------------------------------------------ the skeleton
  // name, parent, and where the joint is when he stands with his arms at his sides (metres; he faces +z, his right is -x)
  const DEF = [
    ['root', null, 0, 0, 0], ['hips', 'root', 0, .94, 0], ['spine', 'hips', 0, 1.08, 0], ['chest', 'spine', 0, 1.24, 0], ['neck', 'chest', 0, 1.5, 0], ['head', 'neck', 0, 1.6, 0],
    ['armR', 'chest', -.2, 1.43, 0], ['foreR', 'armR', -.212, 1.14, 0], ['handR', 'foreR', -.222, .87, 0],
    ['armL', 'chest', .2, 1.43, 0], ['foreL', 'armL', .212, 1.14, 0], ['handL', 'foreL', .222, .87, 0],
    ['legR', 'hips', -.095, .92, 0], ['shinR', 'legR', -.095, .48, 0], ['footR', 'shinR', -.095, .08, 0],
    ['legL', 'hips', .095, .92, 0], ['shinL', 'legL', .095, .48, 0], ['footL', 'shinL', .095, .08, 0]
  ];
  const BI = {}; DEF.forEach((d, i) => { BI[d[0]] = i; });
  const ROOT = 0, HIPS = 1, SPINE = 2, CHEST = 3, NECK = 4, HEAD = 5, ARM_R = 6, FORE_R = 7, HAND_R = 8, ARM_L = 9, FORE_L = 10, HAND_L = 11, LEG_R = 12, LEG_L = 15, NB = DEF.length;
  function skeleton(g) {
    const bones = [];
    for (const [n, p, x, y, z] of DEF) { const b = new THREE.Bone(), q = p == null ? null : DEF[BI[p]]; b.name = n; if (q) { b.position.set(x - q[2], y - q[3], z - q[4]); bones[BI[p]].add(b); } else { b.position.set(x, y, z); g.add(b); } bones.push(b); }
    g.updateMatrixWorld(true); return { bones, sk: new THREE.Skeleton(bones) };
  }

  // ------------------------------------------------------------------ shapes
  // a length of body: rings from the bottom up, each [y, half width, half depth, centre x, centre z]; smooth, seam at the back
  function tube(R, seg, capTop, capBot) {
    seg = seg || 12; const n = R.length, pos = [], nor = [], uv = [], ix = []; let vl = 0;
    for (let i = 0; i < n; i++) {
      const r = R[i], a = R[Math.max(0, i - 1)], b = R[Math.min(n - 1, i + 1)], dy = (b[0] - a[0]) || 1e-4, drx = (b[1] - a[1]) / dy, drz = (b[2] - a[2]) / dy, dcx = ((b[3] || 0) - (a[3] || 0)) / dy, dcz = ((b[4] || 0) - (a[4] || 0)) / dy;
      if (i) vl += Math.hypot(r[0] - R[i - 1][0], r[1] - R[i - 1][1]);
      for (let j = 0; j <= seg; j++) {
        const an = j / seg * PI * 2 + PI, s = Math.sin(an), c = Math.cos(an), tx = r[1] * c, tz = -r[2] * s, lx = dcx + drx * s, lz = dcz + drz * c;
        const nx = -tz, ny = tz * lx - tx * lz, nz = tx, l = Math.hypot(nx, ny, nz) || 1;      // across the ring × along the length
        pos.push((r[3] || 0) + r[1] * s, r[0], (r[4] || 0) + r[2] * c); nor.push(nx / l, ny / l, nz / l); uv.push(j / seg, vl);
      }
    }
    for (let i = 0; i < n - 1; i++) for (let j = 0; j < seg; j++) { const a = i * (seg + 1) + j, b = a + 1, c = a + seg + 1, e = c + 1; ix.push(a, b, c, b, e, c); }
    const cap = (i, up) => { const r = R[i], v0 = pos.length / 3; pos.push(r[3] || 0, r[0], r[4] || 0); nor.push(0, up ? 1 : -1, 0); uv.push(.5, 0); for (let j = 0; j < seg; j++) { const a = i * (seg + 1) + j; if (up) ix.push(a, a + 1, v0); else ix.push(a + 1, a, v0); } };
    if (capTop) cap(n - 1, true); if (capBot) cap(0, false);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(ix); return g;
  }
  X.tubeE = tube;
  // Which bones move a point of the skin, by where it is on him at rest: [bone, weight, bone, weight ...]
  const W = {
    // hips, spine, chest, neck going up; below the belt, skirts that the thighs push about
    torso(x, y) {
      if (y < .93) { const k = ss(.93, .62, y) * .7, r = clamp(.5 - x * 4.5, 0, 1); return [HIPS, 1 - k, LEG_R, k * r, LEG_L, k * (1 - r)]; }
      if (y < 1.12) { const k = ss(.98, 1.12, y); return [HIPS, 1 - k, SPINE, k]; }
      if (y < 1.3) { const k = ss(1.12, 1.3, y); return [SPINE, 1 - k, CHEST, k]; }
      const k = ss(1.47, 1.56, y); return [CHEST, 1 - k, NECK, k];
    },
    neck(x, y) { if (y < 1.5) { const k = ss(1.43, 1.5, y); return [CHEST, 1 - k, NECK, k]; } const k = ss(1.52, 1.6, y); return [NECK, 1 - k, HEAD, k]; },
    arm: s => { const A = s < 0 ? ARM_R : ARM_L; return (x, y) => {
      if (y > 1.36) { const k = ss(1.51, 1.39, y) * (.5 + .5 * ss(.15, .23, Math.abs(x))); return [CHEST, 1 - k, A, k]; }
      if (y > 1.07) { const k = ss(1.2, 1.08, y); return [A, 1 - k, A + 1, k]; }
      const k = ss(.9, .85, y); return [A + 1, 1 - k, A + 2, k];
    }; },
    leg: s => { const L = s < 0 ? LEG_R : LEG_L; return (x, y) => {
      if (y > .8) { const k = ss(1, .84, y); return [HIPS, 1 - k, L, k]; }
      if (y > .4) { const k = ss(.55, .41, y); return [L, 1 - k, L + 1, k]; }
      const k = ss(.13, .07, y); return [L + 1, 1 - k, L + 2, k];
    }; }
  };
  // The skin: pieces of body and clothing, each with its rule for which bones move it. One mesh per kind of surface.
  function Skin() { this.by = {}; }
  Skin.prototype.add = function (cls, geo, col, w, o) { o = o || {}; (this.by[cls] || (this.by[cls] = [])).push({ g: geo, c: typeof col === 'number' ? X.lin(col) : col, w, us: o.uv, vs: o.uv2 }); return this; };
  Skin.prototype.build = function (parent, sk) {
    for (const cls in this.by) {
      const list = this.by[cls], geo = X.merge(list), P = geo.attributes.position, n = P.count, si = new Uint16Array(n * 4), sw = new Float32Array(n * 4); let vo = 0;
      for (const e of list) {
        const cnt = e.g.attributes.position.count;
        for (let i = vo; i < vo + cnt; i++) { const ws = e.w(P.getX(i), P.getY(i), P.getZ(i)); let tot = 0; for (let k = 0; k < ws.length && k < 8; k += 2) { si[i * 4 + k / 2] = ws[k]; sw[i * 4 + k / 2] = ws[k + 1]; tot += ws[k + 1]; } for (let k = 0; k < 4; k++) sw[i * 4 + k] /= tot || 1; }
        vo += cnt;
      }
      geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4)); geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
      geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, .9, 0), 1.9);
      const m = new THREE.SkinnedMesh(geo, X.vmat(cls, true)); m.castShadow = m.receiveShadow = true; parent.add(m); m.bind(sk);
    }
    this.by = {};
  };

  // ------------------------------------------------------------------ building a man
  // o: what human() in gfx-actors.js has decided about him: skin and hair colour, and for trunk, arms and legs what
  // they are covered in (bCls / aCls / lCls: soft, leather, mail or plate) and its colour.
  const TRUNK = [[.6, .222, .17, 0, .006], [.76, .204, .152, 0, .004], [.9, .18, .134], [.98, .166, .121], [1.05, .146, .103], [1.14, .156, .109], [1.24, .175, .121, 0, .004], [1.34, .189, .129, 0, .008], [1.42, .183, .117, 0, .004], [1.465, .136, .101], [1.5, .08, .075]];
  const LEG = [[.07, .042, .046], [.13, .039, .043], [.24, .046, .05, 0, -.006], [.36, .058, .064, 0, -.012], [.44, .054, .058], [.5, .059, .064, 0, .004], [.6, .069, .074], [.74, .083, .09], [.88, .092, .098], [.99, .088, .092]];
  const ARM = [[.865, .028, .031], [.9, .031, .034], [.98, .04, .042], [1.07, .046, .048], [1.14, .042, .045], [1.18, .044, .047], [1.27, .05, .055], [1.37, .058, .062], [1.44, .064, .068], [1.475, .05, .054], [1.492, .014, .016]];
  const armX = y => lerp(.224, .197, clamp((y - .865) / .63, 0, 1));
  const scale = (R, k, kz, x) => R.map(r => [r[0], r[1] * k, r[2] * (kz || k), (r[3] || 0) + (typeof x === 'function' ? x(r[0]) : x || 0), r[4] || 0]);
  X.body = function (f, g, m, o) {
    const sk = skeleton(g), B = m.B = {}, K = new Skin(), eq = f.eq, E = f.E, rig = {}; DEF.forEach((d, i) => { B[d[0]] = sk.bones[i]; });
    m.bones = sk.bones; m.sk = sk.sk; m.pose = new Float32Array(NB * 3); m.vf = m.vs = 0; m.rootY = 0;
    // a rigid piece fixed to one bone, given where it is on him at rest
    const fix = (bone, cls, geo, col, opt) => { const d = DEF[BI[bone]]; geo.translate(-d[2], -d[3], -d[4]); (rig[bone] || (rig[bone] = new X.Part())).add(cls, geo, col, opt); };
    const ball = (r, sx, sy, sz, x, y, z) => { const b = new THREE.SphereGeometry(r, 12, 9); b.scale(sx, sy, sz); b.translate(x, y, z); return b; };
    const pad = ({ soft: 1.05, quilt: 1.1, brig: 1.09, leather: 1.07, mail: 1.07, plate: 1.1 })[o.bCls] * (o.bodyId === 'gambeson' ? 1.06 : 1), deep = o.bCls === 'plate' ? 1.14 : o.bodyId === 'gambeson' ? 1.06 : 1, mailU = c => c === 'mail' ? { uv: 22, uv2: 40 } : null;
    // trunk, and the skirts of whatever he wears: hem, hips, waist, ribs, chest, shoulders, the root of the neck
    const hem = o.bCls === 'plate' ? .84 : .6;
    K.add(o.bCls, tube(TRUNK.filter(r => r[0] >= hem - .001).map(r => [r[0], r[1] * pad, r[2] * pad * (r[0] > 1.1 ? deep : 1), 0, r[4] || 0]), 16), o.bodyC, W.torso, mailU(o.bCls));
    if (o.bCls === 'plate') K.add('plate', tube(scale([[.7, .225, .17], [.82, .2, .15], [.96, .178, .13]], 1.08), 16), o.bodyC, W.torso);      // the fauld
    if (o.surcoat) {      // over his harness, the colours he fights under
      const sg = tube(scale(TRUNK, pad * 1.07).map((r, i) => i ? r : [.55, r[1] * 1.08, r[2] * 1.08, 0, r[4]]).slice(0, 10), 16), a = X.lin(o.liv[0]), b = X.lin(o.liv[1]), bd = o.liv[2] ? X.lin(o.liv[2]) : null;
      X.shade(sg, (x, y) => { const q = bd && y > 1.2 && y < 1.28 ? bd : x > 0 ? a : b, k = y < .72 ? .8 : 1; return [q.r * k, q.g * k, q.b * k]; }); K.add('soft', sg, 0xffffff, W.torso);
    }
    K.add('leather', tube(scale([[1, .152, .108], [1.03, .148, .105], [1.06, .15, .106]], pad * (o.surcoat ? 1.1 : 1.04)), 16), o.lea, W.torso);
    fix('hips', 'metal', new THREE.BoxGeometry(.04, .05, .014), 0x8d9399, { p: [0, 1.03, .108 * pad * (o.surcoat ? 1.1 : 1.04) + .004] });
    if (eq.belt) fix('hips', 'leather', new THREE.BoxGeometry(.09, .11, .05), 0x3a2c1e, { p: [.16, .96, .09] });
    // the neck: short, narrower than the jaw, and set back under the skull so that the chin stands out in front of it
    K.add('skin', tube([[1.44, .078, .07, 0, -.004], [1.48, .063, .062, 0, -.008], [1.52, .055, .057, 0, -.012], [1.56, .053, .054, 0, -.016], [1.6, .054, .052, 0, -.02]], 12), o.skin, W.neck);
    for (const s of [-1, 1]) {
      const side = s < 0 ? 'R' : 'L', under = o.lCls === 'plate' ? 'mail' : o.lCls, lp = o.lCls === 'soft' ? 1 : 1.06;
      // leg, boot and foot
      K.add(under, tube(scale(LEG, lp, lp, s * .095), 12), under === o.lCls ? o.legC : 0x8e9296, W.leg(s), under === 'mail' ? { uv: 10, uv2: 22 } : null);
      K.add('leather', tube(scale([[.05, .046, .05], [.12, .043, .047], [.2, .048, .052, 0, -.004], [.29, .053, .058, 0, -.01]], lp * 1.04, 0, s * .095), 10), o.boot, W.leg(s));
      fix('foot' + side, 'leather', ball(.05, .9, .7, 1.95, s * .095, .036, .07), o.boot); fix('foot' + side, 'leather', ball(.046, .92, .8, 1.05, s * .095, .04, -.012), o.boot);
      if (o.lCls === 'plate') {
        fix('leg' + side, 'plate', tube(scale([[.56, .07, .076], [.7, .086, .094], [.84, .094, .1]], 1.1, 0, s * .095), 10), o.legC);
        fix('shin' + side, 'plate', ball(.066, 1, 1, .95, s * .095, .5, .012), o.legC); fix('shin' + side, 'plate', tube(scale([[.13, .04, .044], [.24, .047, .052, 0, -.006], [.36, .06, .066, 0, -.012], [.45, .056, .06]], 1.14, 0, s * .095), 10), o.legC);
      }
      // arm, from the wrist up over the shoulder
      const ac = o.aCls === 'plate' ? 'mail' : o.aCls, bare = o.aCls === 'soft' || o.aCls === 'quilt', ap = o.aCls === 'soft' ? 1.04 : 1.1;
      K.add(ac, tube(scale(ARM, ap, ap, y => s * armX(y)), 10, true), ac === o.aCls ? o.armC : 0x8e9296, W.arm(s), ac === 'mail' ? { uv: 8, uv2: 18 } : null);
      if (o.bCls === 'plate') fix('arm' + side, 'plate', ball(.105, 1, .82, 1.06, s * .212, 1.455, 0), o.bodyC);      // pauldron
      if (o.aCls === 'plate') {
        fix('arm' + side, 'plate', tube(scale([[1.2, .046, .049], [1.28, .053, .058], [1.36, .06, .064]], 1.16, 0, y => s * armX(y)), 10), o.armC);
        fix('fore' + side, 'plate', ball(.056, 1, 1, 1, s * .212, 1.14, 0), o.armC); fix('fore' + side, 'plate', tube(scale([[.9, .033, .036], [.98, .042, .044], [1.08, .048, .05]], 1.16, 0, y => s * armX(y)), 10), o.armC);
      }
      // the hand, closed round whatever is in it
      const hc = bare ? 'skin' : 'leather', hcol = bare ? o.skin : o.lea, hx = s * .222;
      fix('hand' + side, hc, ball(.034, .62, 1.15, 1, hx, .835, 0), hcol); fix('hand' + side, hc, ball(.03, .8, .85, 1.25, hx, .8, .014), hcol);
      { const th = new THREE.CylinderGeometry(.011, .012, .05, 6); th.rotateX(1.1); th.translate(hx - s * .022, .815, .026); fix('hand' + side, hc, th, hcol); }
    }
    K.build(g, sk.sk);
    for (const k in rig) rig[k].build(B[k]);
    m.wh = new THREE.Group(); m.wh.position.set(0, -.062, .004); B.handR.add(m.wh);
    return B;
  };

  // ------------------------------------------------------------------ moving a man
  // The pose is three turns for each bone (about x, y and z). Limbs hang down, so for an arm or a leg a turn about x
  // below zero swings it forward; the spine stands up, so for it a turn about x above zero bends him forward.
  const T = new Float32Array(NB * 3), _v = new THREE.Vector3(), _u = new THREE.Vector3(), _q = new THREE.Quaternion();
  const set = (b, x, y, z) => { const k = b * 3; T[k] = x; T[k + 1] = y || 0; T[k + 2] = z || 0; };
  const add = (b, x, y, z) => { const k = b * 3; T[k] += x; T[k + 1] += y || 0; T[k + 2] += z || 0; };
  X.animate = function (f, m, dt) {
    const g = m.g, bones = m.bones, P = m.pose, time = X.uTime.value, a = f.atk, ai = f.ai, st = ai ? ai.state : 'idle', seed = m.seed, B = m.B;
    T.fill(0);
    // ---- falling and lying dead: the knees go, then the rest of him follows them down
    if (f.dead) {
      if (!m.fin) { m.fin = { dir: Math.random() < .3 ? -1 : 1, side: Math.random() < .22 ? (Math.random() < .5 ? -1 : 1) : 0, v: Array.from({ length: NB * 3 }, () => rand(-1, 1)) }; m.deadT = 0; }
      m.deadT = Math.min(1, m.deadT + dt * .95); const F = m.fin, k1 = ss(0, .34, m.deadT), k2 = ss(.2, 1, m.deadT), up = k1 * (1 - k2), fv = i => F.v[i];
      set(HIPS, .1 * up * F.dir, 0, F.side * .2 * k2); set(SPINE, (.45 * F.dir) * up + fv(2) * .18 * k2, fv(3) * .25 * k2, fv(4) * .15 * k2); set(CHEST, .3 * F.dir * up, fv(5) * .2 * k2, 0);
      set(NECK, .35 * F.dir * up + fv(6) * .2 * k2, fv(7) * .5 * k2, fv(8) * .25 * k2); set(HEAD, fv(9) * .2 * k2, fv(10) * .4 * k2, 0);
      for (const [A, s] of [[ARM_R, -1], [ARM_L, 1]]) { const o = A * 3; set(A, -.5 * up + (fv(o) * .5 - .15) * k2, 0, s * (.25 + .9 * up + (.35 + fv(o + 1) * .5 + .5) * k2 * .8)); set(A + 1, -.5 * up - (.35 + fv(o + 2) * .35) * k2); set(A + 2, fv(o + 3) * .4 * k2); }
      for (const [L, s] of [[LEG_R, -1], [LEG_L, 1]]) { const o = L * 3; set(L, -.75 * up + (fv(o) * .22 - .08) * k2, 0, s * (.05 + (fv(o + 1) * .5 + .5) * .22 * k2)); set(L + 1, 1.5 * up + (fv(o + 2) * .5 + .5) * .7 * k2); set(L + 2, .5 * k2); }
      const q = Math.min(1, dt * 9); for (let i = 0; i < NB * 3; i++) P[i] += (T[i] - P[i]) * q;
      for (let b = 1; b < NB; b++) bones[b].rotation.set(P[b * 3], P[b * 3 + 1], P[b * 3 + 2]);
      const e2 = k2 * k2 * (3 - 2 * k2); B.root.position.y = -.42 * up;
      if (F.side) { g.rotation.z = 1.5 * e2 * F.side; g.rotation.x = 0; g.position.y = .16 * e2; } else { g.rotation.x = -1.5 * e2 * F.dir; g.position.y = .11 * e2; }
      if (m.face && m.deadT < 1) X.expr(f, m, dt, 0);
      return;
    }
    g.rotation.y = PI / 2 - f.ang;
    // ---- how he is moving, as he would feel it: forward and to his right, in metres a second
    const ca = Math.cos(f.ang), sa = Math.sin(f.ang), vf = (f.mvx * ca + f.mvy * sa) * S, vr = (-f.mvx * sa + f.mvy * ca) * S, q8 = Math.min(1, dt * 8);
    m.vf += (vf - m.vf) * q8; m.vs += (vr - m.vs) * q8; const sp = Math.hypot(m.vf, m.vs), amp = Math.min(1, sp / 1.3), run = ss(2.5, 4.3, sp), fw = sp > .05 ? Math.abs(m.vf) / sp : 1, sd = sp > .05 ? m.vs / sp : 0;
    m.walk += Math.hypot(vf, vr) * dt * 3.3 * (m.vf < -.25 ? -1 : 1); const ph = m.walk, sR = Math.sin(ph), cR = Math.cos(ph), idle = 1 - amp;
    // how fast he is turning, and how hard he is getting under way or pulling up (both eased, so that one frame's jolt does not show)
    { const av = dt > 0 && m.pa !== undefined ? clamp(G.angDiff(f.ang, m.pa) / dt, -6, 6) : 0, acc = dt > 0 && m.pvf !== undefined ? clamp((vf - m.pvf) / dt, -12, 12) : 0; m.pa = f.ang; m.pvf = vf; m.av = (m.av || 0) + (av - (m.av || 0)) * Math.min(1, dt * 6); m.acc = (m.acc || 0) + (acc - (m.acc || 0)) * Math.min(1, dt * 5); }
    const fight = st === 'combat' || (!ai && (a || f.blocking)), melee = ai && ai.melee, w = a ? a.w : null, twoH = m.two, hold = !!m.wmain;
    if (m.wside) { m.wside.visible = !!melee; m.wmain.visible = !melee; }
    if (m.wh) m.wh.visible = !(f.yield || f.unarmed);
    // ---- legs: the thigh swings, the knee folds as the foot comes through, the foot pushes off and lands near level
    const A = lerp(.46, .92, run) * amp;
    for (const [L, o] of [[LEG_R, 0], [LEG_L, PI]]) {
      const s = Math.sin(ph + o), c = Math.cos(ph + o), lift = Math.max(0, c), th = -A * s * fw - lift * .16 * amp * (1 + run), kn = .04 + (Math.pow(lift, .8) * lerp(.95, 1.75, run) + Math.max(0, -s) * .14) * amp;
      set(L, th, 0, -sd * .34 * s * amp); set(L + 1, kn); set(L + 2, -(th + kn) * .75 + Math.max(0, -s - .35) * .7 * amp);
    }
    // ---- trunk: the hips turn with the leading leg and the shoulders against them; he leans into a run; he breathes
    let lean = lerp(.03, .2, run) * amp, drop = Math.pow(Math.abs(sR), 1.5) * lerp(.028, .06, run) * amp, tw = 0;
    // wind: fighting and running use it up, and it comes back slowly; a winded man breathes faster and deeper
    m.exert = clamp((m.exert || 0) + dt * (fight || run > .3 ? .2 : -.06), 0, 1); m.brPh = (m.brPh === undefined ? seed : m.brPh) + dt * (1.5 + 3 * m.exert);
    const br = Math.sin(m.brPh), sway = Math.sin(time * .43 + seed * 2) * idle;
    set(HIPS, 0, .13 * sR * amp * fw, .035 * cR * amp + sway * .035);
    set(SPINE, 0, -.1 * sR * amp * fw, -.03 * cR * amp - sway * .03); set(CHEST, br * .014 * idle, -.14 * sR * amp * fw, 0);
    add(LEG_R, 0, 0, -sway * .03 - .02); add(LEG_L, 0, 0, -sway * .03 + .02);      // standing, the weight goes onto one leg and back
    // his chest heaves when he is winded; he leans into getting under way and back against pulling up; turning as he goes he leans into the turn, and turning on the spot he steps round
    add(CHEST, br * .034 * m.exert, 0, 0); lean += clamp(m.acc * .016, -.09, .11) * Math.min(1, sp + .3); add(SPINE, 0, 0, clamp(m.av * .022, -.08, .08) * amp);
    if (sp < .35 && Math.abs(m.av) > .45) { m.turnPh = (m.turnPh || 0) + Math.abs(m.av) * dt * 2.6; const k = Math.min(1, Math.abs(m.av) / 2.2), s = Math.sin(m.turnPh); add(LEG_L + 1, Math.max(0, s) * .5 * k); add(LEG_L, -Math.max(0, s) * .2 * k); add(LEG_R + 1, Math.max(0, -s) * .5 * k); add(LEG_R, -Math.max(0, -s) * .2 * k); drop += .012 * k; }
    // ---- arms. Right: shoulder, elbow, how the weapon lies in the world, its roll. Left: shoulder (x, twist, out), elbow.
    const swing = lerp(.42, .78, run) * amp * fw, bend = lerp(-.24, -1.45, run);
    let ax = swing * sR + (hold ? -.08 : 0), ay = 0, az = -.07 - br * .008 * idle, e = bend - Math.max(0, -sR) * .3 * amp - (hold ? .12 : 0), ww = hold ? -.6 : NaN, wz = 0;
    let lx = -swing * sR, ly = 0, lz = .07 + br * .008 * idle, le = bend - Math.max(0, sR) * .3 * amp, ik = false, quick = 12, snap = false, kneel = 0;
    az -= br * .028 * m.exert; lz += br * .028 * m.exert;
    if (fight) {      // on guard: knees bent, the left foot and the shield side leading, weapon up
      ax = -.5; e = -1.2; ww = -1.3; lean += .12; drop += .055; az = -.16;
      add(LEG_L, -.3 * idle, 0, .05); add(LEG_L + 1, .42 * idle + .12); add(LEG_R, .1 * idle, 0, -.06); add(LEG_R + 1, .3 * idle + .1); add(HIPS, 0, -.16); add(CHEST, 0, .1);
      if (m.sh) { lx = -.12; ly = -1.05; lz = .14; le = -1.1; } else if (twoH) ik = true; else { lx = -.25; le = -.9; lz = .2; }
      // a guard is alive: the point of the weapon wanders, the weight rocks from foot to foot, the shoulders work
      { const gs = Math.sin(time * 2.1 + seed), gc = Math.sin(time * 1.3 + seed * 2), role = ai ? ai.role : null;
        ax += gs * .06; e += gc * .08; ww += gs * .13; lean += gc * .025; drop += (gs * .5 + .5) * .016; tw += gc * .07; add(HIPS, 0, 0, gc * .03); add(LEG_L + 1, Math.max(0, gs) * .08 * idle); add(LEG_R + 1, Math.max(0, -gs) * .08 * idle);
        if (role === 'hold') { drop += .05; lean += .07; if (m.sh) { lx = -.3; ly = -1.35; le = -1.3; } else { ax = -.75; e = -1.3; ww = -1.2; } }      // behind his guard, low, coming on a pace at a time
        else if (role === 'wait' && !a && Math.sin(time * .45 + seed * 3) > .78) { const sh2 = Math.sin(time * 13) * .08; ax = -2.3 + sh2; e = -.7; ww = -2.5; az = -.35; lean -= .06; }      // waiting his turn, he shakes his weapon at you
        else if (role === 'flank') { drop += .03; lean += .06; } }
    }
    // on edge (he has heard or half seen something): knees a little bent, weight forward, the weapon brought up to the ready
    const wary = !!ai && !fight && !a && (st === 'investigate' || ai.aware > .3) && !f.yield && !f.bound;
    if (wary) { drop += .035; lean += .08; add(LEG_L + 1, .14 * idle + .06); add(LEG_R + 1, .1 * idle + .06); if (hold) { ax = -.34; e = -.95; ww = -1.05; az = -.12; } if (m.sh) { lx = -.1; ly = -.6; le = -.9; } }
    const aiming = ai && ai.draw > 0 && !melee && f.E.archer;
    if (a) {
      const k = clamp(a.t / a.dur, 0, 1), dir = a.dir || 1; snap = true;
      // the whole body strikes, not the arm: he sinks and coils as he draws back, drives off the back foot and turns his hips through, then gathers himself
      if (!w.ranged) { if (a.phase === 'windup') { drop += .05 * k; add(HIPS, 0, -.18 * k * dir, 0); add(LEG_R + 1, .25 * k); add(LEG_L + 1, .18 * k); add(NECK, -.05 * k, 0, 0); } else if (a.phase === 'strike') { drop += .03 * (1 - k); add(HIPS, 0, .22 * k * dir, 0); add(LEG_R, .28 * k); add(LEG_R + 1, .1); add(NECK, .09 * k, 0, 0); } else add(HIPS, 0, .22 * (1 - k) * dir, 0); }
      if (w.ranged) { ax = -1.5; e = 0; ww = 0; tw = w.xbow ? 0 : -.5; lx = -1.45; le = -.2; }
      else if (w.arc < .9) {      // a thrust: drawn back at the hip, then driven out with the whole body behind it
        if (a.phase === 'windup') { ax = lerp(-.5, .4, k); e = lerp(-1.2, -1.95, k); tw = -.5 * k; lean += .02; }
        else if (a.phase === 'strike') { ax = lerp(.4, -1.4, k); e = lerp(-1.95, -.1, k); tw = lerp(-.5, .4, k); lean += .3; add(LEG_L, -.35, 0, 0); add(LEG_L + 1, .5); add(LEG_R, .3); }
        else { ax = lerp(-1.4, -.5, k); e = lerp(-.1, -1.2, k); tw = lerp(.4, 0, k); lean += .3 * (1 - k); }
        ww = 0; ik = twoH;
      } else {      // a cut: carried up and back across the body, brought down and through
        if (a.phase === 'windup') { ax = lerp(-.5, -2.5, k); e = lerp(-1.2, -1.55, k); ww = lerp(-1.3, -3.5, k); tw = -.6 * k * dir; az = lerp(-.16, -.5, k); lean -= .1 * k; }
        else if (a.phase === 'strike') { ax = lerp(-2.5, -.8, k); e = lerp(-1.55, -.2, k); ww = lerp(-3.5, -.25, k); tw = lerp(-.6, .55, k) * dir; az = lerp(-.5, .3 * dir, k); lean += .3; add(LEG_L, -.25, 0, 0); add(LEG_L + 1, .4); }
        else { ax = lerp(-.8, -.5, k); e = lerp(-.2, -1.2, k); ww = lerp(-.25, -1.3, k); tw = lerp(.55, 0, k) * dir; az = lerp(.3 * dir, -.16, k); lean += .3 * (1 - k); }
        ik = twoH;
      }
    } else if (f.blocking && !m.sh) { ax = -1.1; e = -1.3; ww = -1.25; wz = 1.15; ik = twoH; }
    else if (aiming) {      // the bow arm out straight, the other drawing to the jaw
      m.drawK = Math.min(1, (m.drawK || 0) + dt * 1.1); const d = m.drawK;
      ax = -1.5; e = 0; ww = 0; tw = m.xbow ? 0 : -.5; if (m.xbow) { lx = -1.25; le = -.5; ly = -.4; } else { lx = -1.45; lz = .1 + d * .45; le = -.2 - d * 1.75; }
    } else m.drawK = 0;
    if (f.blocking && m.sh) { lx = -.38; ly = -1.5; lz = .1; le = -1.38; lean += .05; }      // the shield brought up across him: the upper arm turned in, the forearm level
    if (f.kickT > 0) { set(LEG_R, -1.15, 0, 0); set(LEG_R + 1, .3); add(LEG_L + 1, .2); lean = -.22; lz = .5; az = -.5; }
    if (f.stagger > 0) {      // struck: thrown back off his balance, arms loose
      lean = -.36; ax = -.2; e = -.4; az = -.55; lz = .55; lx = -.2; le = -.5; ik = false; snap = false; quick = 22; drop += .05; add(LEG_R + 1, .3); add(LEG_L + 1, .36); add(LEG_R, -.15); add(LEG_L, -.1);
      const kx = (f.kx * ca + f.ky * sa), kr = (-f.kx * sa + f.ky * ca), kl = Math.hypot(kx, kr) || 1; add(SPINE, 0, 0, clamp(kr / kl, -1, 1) * .22); add(CHEST, 0, clamp(kr / kl, -1, 1) * .2, 0);
    }
    if (f.crouch || (f.busy && !ai)) { kneel = f.busy ? .9 : 1; drop += .34 * kneel; lean += .32 * kneel; add(LEG_R, -1.05 * kneel); add(LEG_R + 1, 1.75 * kneel); add(LEG_L, -.75 * kneel); add(LEG_L + 1, 1.5 * kneel); if (f.busy) { lx = -1; le = -.5; ax = -.9; e = -.6; } }
    // a man who has yielded kneels with his empty hands held up; a captive kneels with his hands roped behind him
    if (f.yield || f.bound) { drop += .43; lean += f.bound ? .16 : .04; add(LEG_R, -.2); add(LEG_R + 1, 1.95); add(LEG_L, -.2); add(LEG_L + 1, 1.95); add(LEG_R + 2, .9); add(LEG_L + 2, .9); ww = NaN; if (f.bound) { ax = .55; az = .22; e = -.55; lx = .55; lz = -.22; le = -.55; add(NECK, .32); } else { ax = -2.5; az = -.4; e = -.45; lx = -2.5; lz = .4; le = -.45; } }
    if (st === 'flee') { lean += .1; az -= .2; lz += .2; }
    // ---- hurts: a bad leg is spared (a short step on it, and he dips over it); a man hurt in the body goes bent, his free hand to the place
    if (f.hp && f.max && f.frac) {
      const hp = f.hp, mx = f.max, lame = f.frac.lleg || hp.lleg < mx.lleg * .3 ? 1 : f.frac.rleg || hp.rleg < mx.rleg * .3 ? -1 : 0, gut = Math.min(hp.thorax / mx.thorax, hp.stomach / mx.stomach);
      if (lame && amp > .05) { const L = lame > 0 ? LEG_L : LEG_R, on = Math.max(0, -Math.cos(ph + (lame > 0 ? PI : 0))); T[L * 3] *= .5; drop += .05 * on * amp; add(SPINE, 0, 0, lame * .11 * on * amp); add(CHEST, .05 * on * amp, 0, 0); }
      if (gut < .5 && !f.yield && !f.bound) { const k = ss(.5, .2, gut); lean += (fight || a ? .07 : .17) * k; if (!fight && !a && !m.sh && !ik && !aiming) { lx = lerp(lx, -.2, k); ly = lerp(ly, -1.3, k); lz = lerp(lz, 0, k); le = lerp(le, -1.25, k); } }      // the forearm laid across his belly
    }
    // ---- write it down
    add(SPINE, lean * .6, tw * .35, 0); add(CHEST, lean * .4, tw * .65, 0);
    set(ARM_R, ax, ay, az); set(FORE_R, e); set(HAND_R, isNaN(ww) ? 0 : ww - ax - e, 0, wz); set(ARM_L, lx, ly, lz); set(FORE_L, le);
    // ---- where he is looking: a man who has half noticed you turns his head your way before the rest of him follows
    const open = X.mouthOf(m, dt), say = m.say, me = G.rx.P, tg = ai && ai.tgt && !ai.tgt.dead && !ai.tgt.gone ? ai.tgt : me;
    const rel = tg && tg !== f ? G.angDiff(Math.atan2(tg.y - f.y, tg.x - f.x), f.ang) : 0, seen = ai && ai.aware > .12;
    let hy = Math.sin(time * .4 + seed) * .22 * idle, hx = -lean * .55, hz = 0;
    if (st === 'combat') { hy = clamp(-rel, -.6, .6) - tw * .8; hx += .06; }
    else if (st === 'flee') hy = Math.sin(time * 2.3 + seed) > .3 ? clamp(-rel, -1.2, 1.2) : 0;      // glancing back as he runs
    else if (st === 'investigate') { hy = Math.sin(time * 1.7 + seed) * .65; hz = .12; }
    else if (seen) hy = clamp(-rel, -1.1, 1.1) * Math.min(1, ai.aware * 2.5);
    if (f.stagger > 0) hx = -.3; else if (say) hx += say.ex === 'yawn' ? -.3 : Math.sin(say.t * 9) * .05;
    // ---- when he turns, his head goes first. And a man standing about does not stand still: he looks round, shifts
    //      his weight, rubs the back of his neck, rolls his shoulders, studies the ground
    if (!fight) hy -= clamp(m.av * .15, -.45, .45);
    if (ai && st === 'idle' && sp < .12 && !a && !wary && !say && !f.yield && !f.bound && !f.blocking) {
      if (m.fidT === undefined) m.fidT = rand(1.5, 9); m.fidT -= dt;
      if (!m.fid && m.fidT <= 0) { let k = G.pick(['look', 'look', 'weight', 'weight', 'neck', 'roll', 'down']); if (k === 'neck' && (m.sh || twoH)) k = 'look'; m.fid = { k, t: 0, dur: k === 'look' ? rand(1.4, 2.8) : rand(2.2, 3.6), s: Math.random() < .5 ? -1 : 1 }; }
      const F = m.fid;
      if (F) {
        F.t += dt; const u = clamp(F.t / F.dur, 0, 1), k = ss(0, .25, u) * ss(1, .7, u);
        if (F.k === 'look') { hy += F.s * .8 * k; hx -= .04 * k; }
        else if (F.k === 'down') { hx += .38 * k; hy += F.s * .12 * k; }
        else if (F.k === 'weight') { add(HIPS, 0, 0, F.s * .07 * k); add(SPINE, 0, 0, -F.s * .06 * k); const L = F.s > 0 ? LEG_L : LEG_R; add(L, -.17 * k); add(L + 1, .32 * k); }
        else if (F.k === 'neck') { const o = ARM_L * 3; T[o] = lerp(T[o], -2.3, k); T[o + 2] = lerp(T[o + 2], .45, k); T[FORE_L * 3] = lerp(T[FORE_L * 3], -2.3 + Math.sin(F.t * 10) * .07, k); hz += .13 * k; hy += .22 * k; hx += .1 * k; }
        else { add(CHEST, -.08 * k, 0, 0); add(ARM_R, .12 * k, 0, -.1 * k); add(ARM_L, .12 * k, 0, .1 * k); hz += Math.sin(F.t * 2.6) * .22 * k; }
        if (u >= 1) { m.fid = null; m.fidT = rand(3, 12); }
      }
    } else if (m.fid) m.fid = null;
    set(NECK, hx * .45, hy * .4, hz * .4); set(HEAD, hx * .55, hy * .6, hz * .6);
    // ---- ease toward it. A blow is not eased: its timing is the fight.
    const q = Math.min(1, dt * quick), qs = Math.min(1, dt * 34);
    const pv = m.pv || (m.pv = new Float32Array(NB * 3)), sdt = Math.min(dt, .05), om = quick * .9, kk = om * om * sdt, dd = 1 / (1 + 1.7 * om * sdt);
    for (let b = 1; b < NB; b++) {
      const k = b * 3, fast = snap && (b === ARM_R || b === FORE_R || b === HAND_R || b === SPINE || b === CHEST);
      for (let i = k; i < k + 3; i++) { if (fast) { const was = P[i]; P[i] += (T[i] - P[i]) * qs; pv[i] = sdt > 0 ? (P[i] - was) / sdt : 0; } else { pv[i] = (pv[i] + (T[i] - P[i]) * kk) * dd; P[i] += pv[i] * sdt; } }
      bones[b].rotation.set(P[k], P[k + 1], P[k + 2]);
    }
    m.rootY += (-drop - m.rootY) * Math.min(1, dt * 10); B.root.position.y = m.rootY; B.root.position.x = sway * .012;
    // ---- the other hand goes to a weapon that wants two: find where the grip is and reach for it
    if (ik && m.grip2 !== undefined) {
      g.updateMatrixWorld(true); _v.set(0, 0, m.grip2).applyMatrix4(m.wh.matrixWorld); B.chest.worldToLocal(_v); _v.x -= .2; _v.y -= .19;
      const L1 = .29, L2 = .31, d = clamp(_v.length(), .08, L1 + L2 - .004), flex = PI - Math.acos(clamp((L1 * L1 + L2 * L2 - d * d) / (2 * L1 * L2), -1, 1));
      _u.set(0, -(L1 + L2 * Math.cos(flex)), L2 * Math.sin(flex)).normalize(); _q.setFromUnitVectors(_u, _v.normalize()); B.armL.quaternion.copy(_q); B.foreL.rotation.set(-flex, 0, 0);
      const r = B.armL.rotation, k = ARM_L * 3; P[k] = r.x; P[k + 1] = r.y; P[k + 2] = r.z; P[FORE_L * 3] = -flex;
    }
    if (m.face) {
      X.expr(f, m, dt, open);
      m.face.pup.position.x = lerp(m.face.pup.position.x, (st === 'combat' || st === 'flee' || seen ? clamp(-rel - hy, -1, 1) : 0) * .007, Math.min(1, dt * 10));
    }
  };
  // ------------------------------------------------------------------ heads
  // A head starts as an egg and is pushed about like clay: the skull swelled behind, the face narrowed to the chin,
  // brow, sockets, nose, cheekbones, lips and chin raised or sunk. It is made as one fine net of points (finest round
  // the mouth), coloured (lips, the shade of the sockets, a flush, stubble), and then cut in two along the mouth so
  // that the jaw can drop. Eyes are real balls that turn, with lids that close over them. Each man's is his own:
  // the size of his jaw, nose, brow, cheekbones, chin and lips are drawn by lot.
  const g2 = (d, s) => Math.exp(-d * d / (2 * s * s)), HA = .074, HB = .118, HC = .097, MOUTH = -.0605, HINGE = [0, -.03, -.022], EYE = [.031, .013, .0705], NU = 96;
  const PHI = (() => {
    const p = [], pm = Math.acos(MOUTH / HB), run = (a, b, n) => { for (let j = 1; j <= n; j++) p.push(lerp(a, b, j / n)); };
    p.push(.001); run(.001, .36 * PI, 8); run(.36 * PI, pm - .09, 14); run(pm - .09, pm, 8); p.jm = p.length - 1; run(pm, pm + .1, 6); run(pm + .1, .83 * PI, 6); run(.83 * PI, .95 * PI, 4); run(.95 * PI, .996 * PI, 3); return p;      // the last rows close the underside of the jaw
  })();
  const TH = Array.from({ length: NU + 1 }, (_, i) => { const u = i / NU - .5; return (u * .5 + 2 * u * u * u) * 2 * PI; });      // points lie twice as thick across the face as round the back
  function sculpt(x, y, z, V, o) {
    // the skull swells behind; the jaw is a block set forward under the face (an egg's lower end would give him no chin
    // and a face that falls away under the nose), a little narrower than the cheekbones and squared off at the chin
    if (z < 0) z *= 1.07 + .07 * g2(y - .03, .05);
    if (y < .01) x *= (1 - (.24 - .35 * (V.jaw - 1)) * ss(.0, -.075, y) * (z > -.03 ? 1 : .5)) * (1 + .07 * ss(-.085, -.112, y));
    if (z > 0 && y < -.02) { const t = clamp((-.02 - y) / .098, 0, 1); z *= 1 + .1 * t + .8 * t * t * t * t; }
    const ax = Math.abs(x);
    if (y > .01 && y < .09 && z > .02) x *= 1 - .05 * g2(y - .05, .03);
    if (z > 0) {
      if (y > .04) z -= (y - .04) * .16;
      z += .0075 * V.brow * g2(y - .033, .011) * ss(.066, .04, ax);
      z -= .015 * g2(ax - EYE[0] - .001, .0145) * g2(y - EYE[1], .0105);      // narrow, so that the bone outside the eye stands forward of it
      const ny = y > -.03 ? ss(.03, -.03, y) : ss(-.046, -.03, y), nw = lerp(.0085, .0135, ss(.02, -.03, y));
      z += (.005 + .021 * V.nose * Math.pow(ny, 1.3)) * g2(x, nw) * ss(.045, .02, y) * ss(-.052, -.044, y);
      z += .003 * V.nose * g2(x, .01) * g2(y + .029, .008);      // the ball of the nose
      z += .0075 * V.nose * g2(ax - .0125, .0065) * g2(y + .033, .0065);
      z += .006 * V.cheek * g2(ax - .047, .02) * g2(y + .012, .018);
      z += .0045 * g2(x, .03) * g2(y + .061, .022);
      z += .0034 * V.lip * g2(x, .021) * g2(y + .0535, .0048) + .0038 * V.lip * g2(x, .018) * g2(y + .0672, .005);
      z -= .0042 * g2(x, .023) * g2(y - MOUTH, .002) + .003 * g2(x, .016) * g2(y + .079, .006);
      z += .006 * V.chin * g2(x, .026) * g2(y + .1, .02);
      z -= .0028 * g2(ax - .0255, .0045) * g2(y - MOUTH, .0045);      // the corners of the mouth are tucked in
      z -= .0011 * g2(x, .003) * ss(-.0435, -.046, y) * ss(-.0525, -.0495, y);      // the groove under the nose
      z += .0018 * g2(ax - .031, .011) * g2(y + .0035, .0035);      // the lower lid, and the bag under it
      z -= .0022 * V.cheek * g2(ax - .044, .013) * g2(y + .047, .016);      // the hollow under the cheekbone
      z += .002 * g2(ax - .024, .009) * g2(y + .046, .012);      // the cheek fuller beside the mouth, so that the fold from the nose shows
    }
    o[0] = x; o[1] = y; o[2] = z; return o;
  }
  // the front of the face at (x, y)
  const faceAt = (x, y, V, o) => sculpt(x, y, HC * Math.sqrt(Math.max(.02, 1 - (x / HA) * (x / HA) - (y / HB) * (y / HB))), V, o);
  const _o = [0, 0, 0];
  // ------------------------------------------------------------------ skin
  // The net of points gives a face its shape and its broad colour. What makes it a person's is finer than the net:
  // mottling and pores, the creases of the lips, the fold from nose to mouth, lines on the brow and at the eyes,
  // stubble, dirt, a scar. Those are painted into a picture laid over the net; there are six, shared out among
  // everyone by age and habit. Each point of a picture is worked out from where it lies on the head.
  const FACES = [[.1, 0, .2, 0], [.2, .9, .7, 0], [.5, .15, .3, 0], [.55, 1, .6, 1], [1, .25, .4, 0], [.9, .9, 1, 1]];      // age, stubble, dirt, scarred
  const TW = 768, TV = 512, COMP = 1 / Math.pow((232 / 255 + .055) / 1.055, 2.4), faceT = []; let BASE = null, browT = null;
  const h3 = (x, y, z) => { let n = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 1274126177); n = Math.imul(n ^ (n >>> 13), 1103515245); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; };
  const n3 = (x, y, z) => {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), fx = x - xi, fy = y - yi, fz = z - zi, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy), w = fz * fz * (3 - 2 * fz);
    const a = h3(xi, yi, zi), b = h3(xi + 1, yi, zi), c = h3(xi, yi + 1, zi), d = h3(xi + 1, yi + 1, zi), e = h3(xi, yi, zi + 1), f = h3(xi + 1, yi, zi + 1), g = h3(xi, yi + 1, zi + 1), h = h3(xi + 1, yi + 1, zi + 1);
    const ab = a + (b - a) * u, cd = c + (d - c) * u, ef = e + (f - e) * u, gh = g + (h - g) * u, p = ab + (cd - ab) * v, q = ef + (gh - ef) * v; return p + (q - p) * w;
  };
  function faceTex(kf) {
    if (faceT[kf]) return faceT[kf];
    const C = NU + 1, NV = PHI.length, o = [0, 0, 0];
    if (!BASE) { const V = { jaw: 1, nose: 1, brow: 1, cheek: 1, chin: 1, lip: 1 }; BASE = new Float32Array(C * NV * 3); for (let j = 0, k = 0; j < NV; j++) for (let i = 0; i <= NU; i++, k++) { const th = TH[i], ph = PHI[j], sp = Math.sin(ph); sculpt(HA * Math.sin(th) * sp, HB * Math.cos(ph), HC * Math.cos(th) * sp, V, o); BASE[k * 3] = o[0]; BASE[k * 3 + 1] = o[1]; BASE[k * 3 + 2] = o[2]; } }
    const B = BASE, age = FACES[kf][0], stub = FACES[kf][1], dirt = FACES[kf][2], scar = FACES[kf][3], sd = kf * 17.3 + 3, cv = document.createElement('canvas'); cv.width = TW; cv.height = TV;
    const ctx = cv.getContext('2d'), id = ctx.createImageData(TW, TV), d = id.data;
    for (let py = 0, t = 0; py < TV; py++) {
      const gv = py / (TV - 1) * (NV - 1), j0 = Math.min(NV - 2, gv | 0), fv = gv - j0;
      for (let px = 0; px < TW; px++, t += 4) {
        const gu = px / (TW - 1) * NU, i0 = Math.min(NU - 1, gu | 0), fu = gu - i0, a = (j0 * C + i0) * 3, e = a + C * 3, w0 = (1 - fu) * (1 - fv), w1 = fu * (1 - fv), w2 = (1 - fu) * fv, w3 = fu * fv;
        const x = B[a] * w0 + B[a + 3] * w1 + B[e] * w2 + B[e + 3] * w3, y = B[a + 1] * w0 + B[a + 4] * w1 + B[e + 1] * w2 + B[e + 4] * w3, z = B[a + 2] * w0 + B[a + 5] * w1 + B[e + 2] * w2 + B[e + 5] * w3, ax = Math.abs(x);
        // everywhere: skin is never one colour, and a man who sleeps in a ruin is never clean
        const mo = n3(x * 300, y * 300, z * 300 + sd) - .5, di = ss(.5, .8, n3(x * 42 + sd, y * 42, z * 42)) * dirt;
        let r = 1 + mo * .07, gg = 1 + mo * .13 - di * .02, bb = 1 + mo * .15 - di * .06, dk = di * .17;
        if (z > 0) {
          // blood near the surface on the cheeks and nose, in blotches; pores there
          const cheek = g2(ax - .043, .02) * g2(y + .02, .02) + g2(x, .013) * g2(y + .028, .012), blot = ss(.45, .8, n3(x * 120 + 7, y * 120, z * 120 + sd));
          gg -= .07 * cheek * (.5 + blot); bb -= .07 * cheek * (.5 + blot);
          dk += ss(.72, .9, n3(x * 1700, y * 1700, z * 1700)) * .06 * (cheek + .3);
          // under the eyes, and the reddened rims of them
          const bag = g2(ax - .031, .013) * g2(y + .002, .0045), er = Math.hypot((ax - EYE[0]) * .8, y - EYE[1]), rim = g2(er - .0125, .0025);
          dk += bag * (.07 + .09 * age) + rim * .05; bb += bag * .03; gg -= rim * .06; bb -= rim * .05;
          dk += .2 * g2(y - .0345 - .003 * Math.sin(clamp((ax - .011) / .046, 0, 1) * PI), .003) * ss(.006, .013, ax) * ss(.06, .046, ax);      // the shade under the brows, so that they read from far off
          // lips: creased down their length; the line where they meet, sharp; the corners; the groove under the nose
          const lip = Math.min(1, (g2(x, .021) * g2(y + .0535, .0046) + g2(x, .018) * g2(y + .0672, .005)) * 1.2);
          if (lip > .02) { dk += lip * (.1 * ss(.5, .85, n3(x * 2600, y * 260, sd)) + .03); gg -= lip * .05; bb -= lip * .04; }
          dk += .5 * g2(y - MOUTH, .0008) * ss(.03, .018, ax) + .12 * g2(ax - .0255, .003) * g2(y - MOUTH + .001, .003) + .05 * g2(x, .0028) * ss(-.0435, -.046, y) * ss(-.052, -.049, y);
          // the fold from the wing of the nose out and down past the corner of the mouth
          if (y < -.03 && y > -.074) { const tt = (-.03 - y) / .044, fx = .017 + tt * .017 + tt * tt * .004; dk += (.05 + .12 * age) * g2(ax - fx, .0016) * Math.sin(PI * tt); }
          // with years: lines across the brow, between the brows, at the corners of the eyes and under them
          if (age > .15) {
            const wob = (n3(x * 60, y * 20, sd) - .5) * .006, ex = ax - .047, ey = y - .013;
            for (const y0 of [.058, .069, .081]) dk += age * .13 * g2(y - y0 - wob, .0009) * ss(.052, .03, ax);
            if (ex > 0 && ex < .02) { const an = Math.atan2(ey, ex); dk += age * .12 * ss(.5, .95, Math.cos(an * 7)) * ss(0, .004, ex) * ss(.02, .01, ex) * ss(1, .6, Math.abs(an)); }
            dk += age * .1 * g2(ax - .0055, .001) * ss(.026, .032, y) * ss(.05, .042, y) + age * .08 * g2(y + .006 + (ax - .031) * (ax - .031) * 6, .0009) * g2(ax - .031, .012);
          }
          // stubble: each hair a dot, along the jaw, over the lip and down the throat
          if (stub) { const bm = Math.min(1, ss(-.03, -.052, y) * (1 - lip) * ss(.064, .03, ax) + g2(x, .024) * g2(y + .048, .005)); if (bm > .02) { dk += stub * bm * (.08 + .3 * ss(.55, .78, n3(x * 2900, y * 2900, z * 2900 + sd))); bb += stub * bm * .02; } }
          // an old cut, healed pale with a dark edge
          if (scar && x > 0 && y > -.03 && y < .05) { const sx = x - .036 - (y - .02) * .35, sc = g2(sx, .0011) * ss(-.03, -.02, y) * ss(.05, .04, y); r += sc * .1; gg += sc * .06; bb += sc * .06; dk += g2(sx - .0018, .0009) * .1 * ss(-.03, -.02, y) * ss(.05, .04, y); }
        }
        const k = (1 - Math.min(.85, dk)) * 232; d[t] = r * k; d[t + 1] = gg * k; d[t + 2] = bb * k; d[t + 3] = 255;
      }
    }
    ctx.putImageData(id, 0, 0); const tx = new THREE.CanvasTexture(cv); tx.encoding = THREE.sRGBEncoding; tx.flipY = false; tx.anisotropy = 4; return faceT[kf] = tx;
  }
  // skin with one of those pictures on it
  const faceMat = kf => {
    const key = 'face' + kf; if (X.VM[key]) return X.VM[key];
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .62, metalness: 0, map: faceTex(kf) }); m.userData.cls = 'skin';
    X.patch(m, 'vm-face', sh => { X.grimeS(sh, 3, .16); if (X.TX && X.TX.det && X.TX.det.skin) X.detailS(sh, { t: 'skin', s: 9, lum: .4, mix: .3, sec: 0x84483c, bump: .0006, rk: .4 }); });
    m.customProgramCacheKey = () => 'vm-face' + (X.q.low ? 'L' : 'H'); return X.VM[key] = m;
  };
  // a brow is hairs, not a bar: short strokes, thick and upright by the nose, thinning and lying flat toward the temple
  const browMat = hair => {
    const key = 'brow' + hair; if (X.VM[key]) return X.VM[key];
    if (!browT) {
      const c = document.createElement('canvas'); c.width = 128; c.height = 32; const g = c.getContext('2d'); g.lineCap = 'round';
      for (let i = 0; i < 240; i++) { const u = Math.pow(Math.random(), .8), x = 4 + u * 116, half = lerp(9, 3.5, u), y = 16 + (Math.random() * 2 - 1) * half, len = lerp(9, 6, u) * (.7 + Math.random() * .6), an = lerp(-1, -.12, Math.min(1, u * 2.2)) + (Math.random() - .5) * .35; g.strokeStyle = `rgba(255,255,255,${.55 + Math.random() * .45})`; g.lineWidth = 1.3 + Math.random() * 1.1; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(an) * len, y + Math.sin(an) * len); g.stroke(); }
      browT = new THREE.CanvasTexture(c); browT.anisotropy = 4;
    }
    const m = new THREE.MeshStandardMaterial({ map: browT, color: X.lin(hair), alphaTest: .3, roughness: .8, side: THREE.DoubleSide }); m.alphaToCoverage = true; return X.VM[key] = m;
  };
  X.headBuild = function (head, o) {
    const R = Math.random, V = { jaw: .85 + R() * .3, nose: .8 + R() * .45, brow: .8 + R() * .5, cheek: .7 + R() * .6, chin: .8 + R() * .5, lip: .8 + R() * .4 };
    const NV = PHI.length, C = NU + 1, n = C * NV, P = new Float32Array(n * 3), N = new Float32Array(n * 3), K = new Float32Array(n * 3), jm = PHI.jm, kf = o.hair === 0x6a6660 ? 4 + (R() < .5 ? 1 : 0) : R() * 4 | 0, stub = FACES[kf][1] > .5 ? .4 + R() * .4 : 0;      // kf: which skin he has (grey hair goes with a lined face)
    for (let j = 0, k = 0; j < NV; j++) for (let i = 0; i <= NU; i++, k++) {
      const th = TH[i], ph = PHI[j], sp = Math.sin(ph); sculpt(HA * Math.sin(th) * sp, HB * Math.cos(ph), HC * Math.cos(th) * sp, V, _o); const x = _o[0], y = _o[1], z = _o[2], ax = Math.abs(x);
      P[k * 3] = x; P[k * 3 + 1] = y; P[k * 3 + 2] = z; let r = 1, g = 1, b = 1;
      if (z > 0) {
        const lip = Math.min(1, (g2(x, .022) * g2(y + .0535, .005) + g2(x, .019) * g2(y + .0672, .0052)) * 1.25), sock = g2(ax - EYE[0], .017) * g2(y - EYE[1], .011), flush = g2(ax - .043, .018) * g2(y + .02, .018) * .5 + g2(x, .012) * g2(y + .028, .01) * .6;
        // shade where the light does not get: the sockets, beside and under the nose, the parting of the lips, under the lip and the chin
        const sh = 1 - Math.min(.62, .24 * sock + .2 * g2(ax - .0135, .0055) * g2(y + .014, .02) + .3 * g2(ax - .0075, .0032) * g2(y + .0425, .0026) + .1 * g2(ax - .044, .014) * g2(y + .045, .02) + .15 * g2(x, .011) * g2(y + .044, .0035) + .5 * g2(x, .022) * g2(y - MOUTH, .0017) + .16 * g2(x, .015) * g2(y + .079, .005) + .34 * ss(-.108, -.1165, y));
        r *= (1 - .08 * lip) * sh; g *= (1 - .27 * lip) * sh * (1 - .08 * flush); b *= (1 - .25 * lip) * sh * (1 - .09 * flush);
        if (stub) { const s = Math.min(1, ss(-.03, -.05, y) * (1 - lip) + g2(x, .026) * g2(y + .049, .006)) * stub; r *= 1 - .22 * s; g *= 1 - .2 * s; b *= 1 - .15 * s; }
      }
      K[k * 3] = r; K[k * 3 + 1] = g; K[k * 3 + 2] = b;
    }
    // facing: summed over every face a point belongs to; the two edges of the net meet down the back of the head
    const cells = []; for (let j = 0; j < NV - 1; j++) for (let i = 0; i < NU; i++) cells.push(j * C + i);
    const va = new THREE.Vector3(), vb = new THREE.Vector3(), vc = new THREE.Vector3(), tri = (a, b, c) => { va.fromArray(P, a * 3); vb.fromArray(P, b * 3).sub(va); vc.fromArray(P, c * 3).sub(va); vb.cross(vc); for (const q of [a, b, c]) { N[q * 3] += vb.x; N[q * 3 + 1] += vb.y; N[q * 3 + 2] += vb.z; } };
    for (const a of cells) { tri(a, a + C, a + 1); tri(a + 1, a + C, a + C + 1); }
    for (let j = 0; j < NV; j++) { const a = j * C * 3, b = (j * C + NU) * 3; for (let q = 0; q < 3; q++) N[a + q] = N[b + q] = N[a + q] + N[b + q]; }
    for (let k = 0; k < n; k++) { const l = Math.hypot(N[k * 3], N[k * 3 + 1], N[k * 3 + 2]) || 1; N[k * 3] /= l; N[k * 3 + 1] /= l; N[k * 3 + 2] /= l; }
    // light comes mostly from the sky: whatever faces down (under the brow, the nose, the lip, the jaw) is painted darker, so the face has its shape even on a grey day
    for (let k = 0; k < n; k++) { const s = lerp(.74, 1.04, clamp(.55 + N[k * 3 + 1] * .85, 0, 1)); K[k * 3] *= s; K[k * 3 + 1] *= s * .99; K[k * 3 + 2] *= s * .98; }
    // a piece of the net as a shape of its own. want(cell) picks the faces; grow(point) lifts them off the skin (hair);
    // shift moves the piece so that it can turn about a point of its own (the jaw)
    const inv = [1, 1, 1];      // skin colour over hair colour, once both are known: hair is painted the colour of the skin under it where it thins to nothing
    const piece = (want, shift, grow) => {
      const map = new Int32Array(n).fill(-1), pos = [], nor = [], col = [], uv = [], ix = [], sh = shift || [0, 0, 0];
      const use = k => { if (map[k] < 0) { map[k] = pos.length / 3; let x = P[k * 3], y = P[k * 3 + 1], z = P[k * 3 + 2]; if (grow) { const t0 = grow(k), t = t0 + .0003, l = Math.hypot(x, y * .6, z) || 1, q = ss(.0002, .0028, t0); x += x / l * t; y += y * .6 / l * t; z += z / l * t; col.push(lerp(K[k * 3] * inv[0], 1, q), lerp(K[k * 3 + 1] * inv[1], 1, q), lerp(K[k * 3 + 2] * inv[2], 1, q)); } else col.push(K[k * 3], K[k * 3 + 1], K[k * 3 + 2]); pos.push(x - sh[0], y - sh[1], z - sh[2]); nor.push(N[k * 3], N[k * 3 + 1], N[k * 3 + 2]); uv.push((k % C) / NU, (k / C | 0) / (NV - 1)); } return map[k]; };
      // want says yes to a whole cell, or names three of its corners: then only that half is taken, so that an edge
      // which runs slantwise across the net (a hairline) is cut on the slant and not in steps
      for (const a of cells) { const w = want(a); if (!w) continue; if (w === true) { const p = use(a), q = use(a + C), r = use(a + 1), s = use(a + C + 1); ix.push(p, q, r, r, q, s); } else { const c = [a, a + C, a + C + 1, a + 1].filter((_, i) => w & (1 << i)); if (c.length === 3) ix.push(use(c[0]), use(c[1]), use(c[2])); } }
      if (!ix.length) return null;
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(ix); if (grow) g.computeVertexNormals(); return g;
    };
    const cz = a => (P[a * 3 + 2] + P[(a + C + 1) * 3 + 2]) / 2, cx = a => (P[a * 3] + P[(a + C + 1) * 3]) / 2, cy = a => (P[a * 3 + 1] + P[(a + C + 1) * 3 + 1]) / 2, row = a => a / C | 0, isJaw = a => row(a) >= jm && cz(a) > -.025;
    const HP = new X.Part(), JP = new X.Part(), jaw = new THREE.Group(); jaw.position.set(HINGE[0], HINGE[1], HINGE[2]); head.add(jaw);
    // inside the mouth, and teeth: the upper row stays with the skull, the lower goes with the jaw
    { const b = new THREE.SphereGeometry(.028, 10, 8); b.scale(1.1, .75, .9); HP.add('smooth', b, 0x200c0a, { p: [0, -.064, .057] });
      const teeth = y => { const t = new THREE.TorusGeometry(.021, .004, 4, 10, PI * .7); t.rotateZ(PI * .15); t.rotateX(PI / 2); t.scale(1, 1.5, 1); t.translate(0, y, .053); return t; };
      HP.add('eye', teeth(-.059), 0xc9c2ae); const lt = teeth(-.0645); lt.translate(-HINGE[0], -HINGE[1], -HINGE[2]); JP.add('eye', lt, 0xbdb6a2); }
    // ears
    for (const s of [-1, 1]) { const e = new THREE.SphereGeometry(.02, 10, 8); e.scale(.4, 1.14, .78); X.shade(e, (x, y) => .9 + clamp(y * 8, -.12, .1)); HP.add('skin', e, o.skin, { p: [s * HA * .99, .0, -.014], r: [0, s * -.5, s * -.06] }); }
    // Hair, by one of a few cuts; under a helm only what shows below the rim; a beard goes with the jaw. Hair thins to
    // nothing at its edge, the edge wanders, and the skin beyond it is shadowed with stubble, so no hairline is a hard line.
    const xAt = k => P[k * 3], yAt = k => P[k * 3 + 1], zAt = k => P[k * 3 + 2], tuft = k => 1 + .18 * Math.sin(k * 12.9898) * Math.sin(k * .37);
    const hs = X.lin(o.hair), sk = X.lin(o.skin), tint = [hs.r / sk.r, hs.g / sk.g, hs.b / sk.b], paint = w => { inv[0] = 1 / tint[0]; inv[1] = 1 / tint[1]; inv[2] = 1 / tint[2]; for (let k = 0; k < n; k++) { const q = Math.min(.92, w(k)); if (q > .01) for (let c = 0; c < 3; c++) K[k * 3 + c] = lerp(K[k * 3 + c], tint[c], q); } };
    const shell = (t, where, shift) => piece(a => { if (where && !where(a)) return 0; const c = [a, a + C, a + C + 1, a + 1]; let m = 0, k = 0; for (let i = 0; i < 4; i++) if (t(c[i]) > .00002) { m |= 1 << i; k++; } return k === 4 ? true : k === 3 ? m : 0; }, shift, t);
    if (!o.covered) {
      const cut = R() < .12 && !o.helm ? null : G.pick([[.27, .46, .64, .007], [.33, .5, .66, .013], [.29, .6, .9, .013], [.3, .55, .78, .011], [.0, .47, .66, .008]]);
      if (cut) {
        const lim = k => { const th = Math.abs(TH[k % C]); return (lerp(lerp(cut[0], cut[1], ss(.5, 1.2, th)), cut[2], ss(1.9, 2.6, th)) + .012 * Math.sin(th * 9 + cut[3] * 400) * ss(2.3, 1.3, th)) * PI; }, under = k => o.helm && PHI[k / C | 0] < .3 * PI;
        const t = k => under(k) ? 0 : cut[3] * tuft(k) * ss(lim(k), lim(k) - .12, PHI[k / C | 0]);
        paint(k => under(k) ? 0 : ss(lim(k) + .06, lim(k) - .03, PHI[k / C | 0])); const hg = shell(t); if (hg) HP.add('hair', hg, o.hair);
      }
    }
    const beard = R() < .5 ? (R() < .5 ? .008 : .02) : 0, tache = beard || R() < .25, side = k => ss(-.034, -.012, zAt(k));
    if (beard) {      // thin under the lip and along its upper edge, thickest on the chin; up the cheeks it runs on the skull's side of the cut
      const line = k => -.012 - .05 * ss(.062, .03, Math.abs(xAt(k))), bt = k => { const x = xAt(k), y = yAt(k); return ss(line(k) + .004, line(k) - .014, y) * (1 - g2(x, .017) * ss(-.082, -.07, y) * ss(MOUTH + .012, MOUTH, y)) * side(k) * (y < -.108 ? ss(0, .035, zAt(k)) : 1); };      // (and none under the jaw behind the chin)
      const t = k => { const q = bt(k); return q * q * lerp(.0014, beard, ss(-.055, -.1, yAt(k))) * tuft(k); };      // close to the skin on the cheeks, full on the chin
      paint(k => { const y = yAt(k); return zAt(k) > -.04 ? ss(line(k) + .012, line(k) - .006, y) * (1 - g2(xAt(k), .017) * ss(-.082, -.07, y) * ss(MOUTH + .012, MOUTH, y)) * ss(-.045, -.02, zAt(k)) : 0; });
      const bj = shell(t, isJaw, HINGE), bc = shell(t, a => !isJaw(a) && row(a) >= jm - 16); if (bj) { bj.userData.grain = 1; JP.add('hair', bj, o.hair); } if (bc) { bc.userData.grain = 1; HP.add('hair', bc, o.hair); }
    }
    if (tache) { const mt = k => zAt(k) > 0 ? g2(yAt(k) + .0525, .0055) * ss(.036, .02, Math.abs(xAt(k))) * (1 - .6 * g2(xAt(k), .004)) : 0; paint(k => mt(k) * 1.4); const mg = shell(k => .0042 * tuft(k) * mt(k), a => row(a) < jm && row(a) >= jm - 10); if (mg) HP.add('hair', mg, o.hair); }
    // the skin of the skull and of the jaw: drawn with his picture on it (the colour of the net is his own skin's; the picture is the same for all who share it)
    { const fm = faceMat(kf), put = (geo, parent) => { if (!geo) return; const cA = geo.attributes.color; for (let i = 0; i < cA.count; i++) cA.setXYZ(i, cA.getX(i) * sk.r * COMP, cA.getY(i) * sk.g * COMP, cA.getZ(i) * sk.b * COMP); X.grainGeo(geo); const me = new THREE.Mesh(geo, fm); me.castShadow = me.receiveShadow = true; parent.add(me); };
      put(piece(a => !isJaw(a)), head); put(piece(isJaw, HINGE), jaw); }
    HP.build(head); JP.build(jaw);
    // eyes that turn, lids that close over them (both upper lids hinge on the one line through both eyes), and brows
    const F = { v: null, blink: rand(1, 5), shut: 0, pup: { position: { x: 0 } }, jaw, eyes: [], brow: [] }, iris = G.pick([0x3a2414, 0x3a2414, 0x4a3018, 0x46584e, 0x4a5a68, 0x5a5236]);
    // colour a ball or a cap ring by ring, from its pole outward
    const ring = (geo, cols, fn) => { const n = geo.attributes.position.count, c = new Float32Array(n * 3); for (let i = 0; i < n; i++) { const v = fn(i / (cols + 1) | 0); c[i * 3] = v[0]; c[i * 3 + 1] = v[1]; c[i * 3 + 2] = v[2]; } geo.setAttribute('color', new THREE.BufferAttribute(c, 3)); return geo; };
    // lids are in the shade of the brow, and the upper one ends in a dark line of lashes
    const lids = up => { const g = new THREE.Group(), L = new X.Part(); g.position.set(0, EYE[1], EYE[2]); head.add(g); for (const s of [-1, 1]) L.add('skin', ring(new THREE.SphereGeometry(.0139, 14, 6, 0, PI * 2, 0, 1.05), 14, r => { const k = up ? (r >= 6 ? .25 : r === 5 ? .58 : .74) : (r >= 6 ? .55 : .72); return [k, k * .96, k * .94]; }), o.skin, { p: [s * EYE[0], 0, 0] }); L.build(g, false); return g; };
    F.lidU = lids(true); F.lidL = lids(false); F.lidL.rotation.x = PI - .06;
    for (const s of [-1, 1]) {
      const e = new THREE.Group(), E = new X.Part(), z0 = Math.sqrt(.0122 * .0122 - .0058 * .0058); e.position.set(s * EYE[0], EYE[1], EYE[2]); head.add(e);
      // the white, and over it two caps facing forward: the iris and the pupil
      const cap = (r, ang) => { const c = new THREE.SphereGeometry(r, 14, 4, 0, PI * 2, 0, ang); c.rotateX(PI / 2); return c; };
      // (the white is darker above, under the lid; the iris has a black pupil, a paler ring round it and a dark rim)
      E.add('eye', ring(new THREE.SphereGeometry(.0122, 14, 10), 14, r => { const k = r < 4 ? .42 + r * .12 : r > 7 ? .8 : .94; return [k, k * .97, k * .93]; }), 0x8c867a);
      { const c = new THREE.SphereGeometry(.01236, 16, 8, 0, PI * 2, 0, .56); ring(c, 16, r => r <= 2 ? [.02, .02, .02] : r === 3 ? [1.5, 1.5, 1.45] : r >= 8 ? [.3, .3, .3] : [1.15, 1.15, 1.12]); c.rotateX(PI / 2); E.add('eye', c, iris); }
      E.build(e, false); F.eyes.push(e);
      { const cl = new THREE.Mesh(new THREE.SphereGeometry(.001, 6, 4), X.mat(0xffffff, 'b', 1.2)); cl.position.set(.0032, .0042, .0113); e.add(cl); }      // the light of the sky in his eye
      // a brow: a strip of hair lying along the ridge, thick at the nose and thinning outward
      const c = faceAt(s * .034, .0345, V, [0, 0, 0]), pos = [], nor = [], ix = [], uvb = [], b = new THREE.Group(); b.position.set(c[0], c[1], c[2] + .0028); head.add(b);
      for (let k = 0; k < 6; k++) { const x = s * (.011 + k * .0092), y = .0335 + .0035 * Math.sin(k / 5 * PI) - (k === 5 ? .002 : 0), hh = .0062, p = faceAt(x, y, V, _o); uvb.push(k / 5, 1, k / 5, 0); pos.push(p[0] - c[0], y + hh - c[1], p[2] - c[2], p[0] - c[0], y - hh - c[1], p[2] - c[2]); nor.push(x * 3, .2, 1, x * 3, -.1, 1); if (k < 5) { const a = k * 2; if (s > 0) ix.push(a, a + 1, a + 2, a + 2, a + 1, a + 3); else ix.push(a, a + 2, a + 1, a + 2, a + 3, a + 1); } }
      const bg = new THREE.BufferGeometry(); bg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); bg.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); bg.setIndex(ix); bg.normalizeNormals(); bg.setAttribute('uv', new THREE.Float32BufferAttribute(uvb, 2)); b.add(new THREE.Mesh(bg, browMat(o.hair))); F.brow.push(b); b.userData.y0 = b.position.y;
    }
    return F;
  };
})();
