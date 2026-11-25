'use strict';
// Renderer, part 5: weapons, bodies and their animation, the first-person hands, blood and sparks,
// projectiles, and the per-frame render (camera, light, weather).
(function () {
  const X = G.gx, gfx = G.gfx, S = G.S, RS = G.RS, I = G.ITEMS, PI = Math.PI;
  const lerp = G.lerp, clamp = G.clamp, rand = G.rand;
  const { mat, mesh, box, ball, shape, shade, Part } = X, hex = X.hex;
  let vm = null, eyeY = 1.62, bobT = 0, flash = 0, lastAng = 0, swayX = 0, punch = 0, leanV = 0, lightT = 0, cullT = 0;
  const STEEL = 0xa9aeb3, DARK = 0x5a6066, WOOD = 0x5e4a36, GRIP = 0x2c2018, BRASS = 0x9a7a3a, CORD = 0xcfc8b0;

  // ------------------------------------------------------------------ shapes
  // a tube about y from a profile [[radius, y], ...] going up; smooth, seam at the back
  function tube(prof, seg, capTop) {
    seg = seg || 10; const pos = [], nor = [], uv = [], ix = [], n = prof.length; let vlen = 0;
    for (let i = 0; i < n; i++) {
      const a = prof[Math.max(0, i - 1)], b = prof[Math.min(n - 1, i + 1)], dr = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dr, dy) || 1, nr = dy / l, ny = -dr / l;
      if (i) vlen += Math.hypot(prof[i][0] - prof[i - 1][0], prof[i][1] - prof[i - 1][1]);
      for (let j = 0; j <= seg; j++) { const an = j / seg * PI * 2 + PI, s = Math.sin(an), c = Math.cos(an); pos.push(prof[i][0] * s, prof[i][1], prof[i][0] * c); nor.push(s * nr, ny, c * nr); uv.push(j / seg, vlen); }
    }
    for (let i = 0; i < n - 1; i++) for (let j = 0; j < seg; j++) { const a = i * (seg + 1) + j, b = a + 1, c = a + seg + 1, e = c + 1; ix.push(a, b, c, b, e, c); }
    if (capTop) { const t = prof[n - 1], v0 = pos.length / 3; pos.push(0, t[1], 0); nor.push(0, 1, 0); uv.push(.5, vlen); for (let j = 0; j < seg; j++) { const a = (n - 1) * (seg + 1) + j; ix.push(a, a + 1, v0); } }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(ix); return g;
  }
  // a blade along +z from stations [[half width, z, half thickness], ...]; a flat down the middle if fuller > 0
  function bladeGeo(st, fuller) {
    const pos = [], f = fuller || 0, ring = s => [[-s[0], 0], [-s[0] * f, s[2]], [s[0] * f, s[2]], [s[0], 0], [s[0] * f, -s[2]], [-s[0] * f, -s[2]]];
    for (let i = 0; i < st.length - 1; i++) {
      const a = ring(st[i]), b = ring(st[i + 1]), za = st[i][1], zb = st[i + 1][1];
      for (let k = 0; k < 6; k++) { const k2 = (k + 1) % 6; pos.push(a[k][0], a[k][1], za, b[k][0], b[k][1], zb, a[k2][0], a[k2][1], za, a[k2][0], a[k2][1], za, b[k][0], b[k][1], zb, b[k2][0], b[k2][1], zb); }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals(); return g;
  }
  // flat piece lying along +z (pts are [width, length]); plate standing in the y/z plane (pts are [z, y])
  const flatGeo = (pts, thick, z) => { const g = new THREE.ExtrudeGeometry(shape(pts), { depth: thick, bevelEnabled: true, bevelThickness: thick * .45, bevelSize: .006, bevelSegments: 1 }); g.translate(0, 0, -thick / 2); g.rotateX(PI / 2); g.translate(0, 0, z || 0); return g; };
  const plateGeo = (pts, thick, z) => { const g = new THREE.ExtrudeGeometry(shape(pts), { depth: thick, bevelEnabled: true, bevelThickness: thick * .45, bevelSize: .007, bevelSegments: 1 }); g.translate(0, 0, -thick / 2); g.rotateY(-PI / 2); g.translate(0, 0, z || 0); return g; };

  // ------------------------------------------------------------------ weapons (built lying along +z from the grip)
  function weaponMesh(d, dur) {
    const g = new THREE.Group(), p = new Part(), len = d.reach * RS * S, rust = dur === undefined ? 0 : clamp(1 - dur, 0, 1) * .6;
    const steel = new THREE.Color(d.col ? d.col : STEEL).lerp(new THREE.Color(STEEL), .7).convertSRGBToLinear().lerp(new THREE.Color(.11, .055, .03), rust), dark = new THREE.Color(DARK).convertSRGBToLinear().lerp(new THREE.Color(.07, .04, .025), rust);
    const shaft = (L, z0, r) => p.cylZ('flat', r || .019, (r || .019) * .9, L, WOOD, z0, null, 8);
    switch (d.icon) {
      case 'sword': {
        const L = clamp((len - .85) * .9, .2, 1.15), thin = d.bw && d.bw < .08, gl = d.twoH ? .26 : .15;
        p.cylZ('flat', .017, .015, gl, GRIP, -gl + .06, null, 8); for (let i = 0; i < 4; i++) p.cylZ('flat', .0185, .0185, .008, 0x1c140e, -gl + .08 + i * gl / 4.6, null, 8);
        p.ball('metal', .026, dark, { p: [0, 0, -gl + .045], s: [1, 1, .7] });
        if (L > .4) { p.box('metal', .21, .02, .026, dark, { p: [0, 0, .075] }); for (const s of [-1, 1]) p.ball('metal', .016, dark, { p: [s * .105, 0, .075] }); } else p.box('metal', .09, .02, .022, dark, { p: [0, 0, .075] });
        if (d.bw && !thin) p.add('steel', flatGeo([[-.026, 0], [-.032, L * .6], [-.012, L], [.048, L * .8], [.034, 0]], .009, .088), steel);
        else if (thin) p.add('steel', bladeGeo([[.014, .088, .0065], [.011, .088 + L * .6, .005], [.0015, .088 + L, .001]], 0), steel);
        else p.add('steel', bladeGeo([[.028, .088, .0052], [.026, .088 + L * .5, .0046], [.021, .088 + L * .86, .0036], [.002, .088 + L, .001]], .34), steel);
        break;
      }
      case 'axe': { const L = Math.max(.45, len - .8); shaft(L, -.1); p.add('steel', plateGeo([[-.04, .035], [.04, .035], [.085, -.16], [0, -.175], [-.085, -.16]], .013, L - .2), steel); p.box('metal', .04, .05, .07, dark, { p: [0, .02, L - .2] }); break; }
      case 'mace': shaft(.6, -.1); p.ball('metal', .045, dark, { p: [0, 0, .52] }); for (let i = 0; i < 6; i++) p.add('metal', plateGeo([[-.05, .035], [.05, .035], [.03, .075], [-.03, .075]], .012, .52), dark, { r: [0, 0, i * PI / 3] }); p.ball('metal', .02, dark, { p: [0, 0, .585] }); break;
      case 'hammer': shaft(.72, -.1); p.box('metal', .06, .12, .07, dark, { p: [0, -.01, .58] }); p.add('steel', plateGeo([[-.02, .05], [.02, .05], [0, .19]], .028, .58), steel); p.add('steel', bladeGeo([[.012, .62, .012], [.001, .78, .001]], 0), steel); break;
      case 'club': p.cylZ('flat', .02, .046, .75, WOOD, -.12, null, 9); p.cylZ('metal', .046, .047, .03, dark, .5, null, 9); break;
      case 'bow': {
        const arc = PI * .8, r = d.id === 'longbow' ? .78 : .62, tg = new THREE.TorusGeometry(r, .014, 5, 16, arc); tg.rotateZ(-arc / 2); tg.rotateY(-PI / 2);
        p.add('flat', tg, 0x5a3c22, { p: [0, 0, -.25] }); p.box('flat', .005, 2 * r * Math.sin(arc / 2), .005, CORD, { p: [0, 0, r * Math.cos(arc / 2) - .25] }); p.box('flat', .036, .13, .036, GRIP, { p: [0, 0, r - .25] }); break;
      }
      case 'xbow': p.box('flat', .055, .065, .75, WOOD, { p: [0, -.02, .2] }); p.box('steel', .78, .026, .045, dark, { p: [0, 0, .52] }); p.box('flat', .74, .006, .006, CORD, { p: [0, 0, .44] }); p.box('metal', .03, .1, .05, dark, { p: [0, -.08, .05] }); p.cylZ('flat', .008, .008, .34, WOOD, .17, { p: [0, .03, 0] }, 5); p.add('metal', new THREE.TorusGeometry(.05, .008, 4, 10), dark, { p: [0, 0, .6], r: [PI / 2, 0, 0] }); break;
      default: {   // staves and polearms, gripped a third of the way up
        const L = Math.max(1.4, len * .9), z0 = -.5, e = z0 + L; shaft(L, z0, .021);
        if (d.icon === 'spear') { p.add('steel', bladeGeo([[.014, e - .03, .009], [.032, e + .06, .006], [.002, e + .27, .001]], 0), steel); p.cylZ('metal', .024, .02, .09, dark, e - .1, null, 8); }
        else if (d.icon === 'fork') { p.box('metal', .14, .015, .015, dark, { p: [0, 0, e] }); for (const s of [-1, 1]) p.cylZ('metal', .008, .004, .28, dark, e, { p: [s * .065, 0, 0] }, 5); }
        else if (d.icon === 'poleaxe') { p.add('steel', plateGeo([[-.04, .02], [.04, .02], [.075, -.17], [-.075, -.17]], .014, e - .12), steel); p.box('metal', .05, .07, .055, dark, { p: [0, .06, e - .12] }); p.add('steel', bladeGeo([[.012, e - .02, .012], [.001, e + .3, .001]], 0), steel); p.cylZ('metal', .026, .026, .22, dark, e - .32, null, 8); }
        else if (d.icon === 'halberd') { p.add('steel', plateGeo([[-.07, .02], [.07, .02], [.11, -.19], [0, -.15], [-.11, -.19]], .012, e - .16), steel); p.add('steel', plateGeo([[-.025, .02], [.025, .02], [0, .13]], .012, e - .16), steel); p.add('steel', bladeGeo([[.013, e - .04, .009], [.016, e + .1, .006], [.001, e + .36, .001]], 0), steel); p.cylZ('metal', .026, .026, .3, dark, e - .4, null, 8); }
        else if (d.icon === 'bill') { p.add('steel', plateGeo([[-.22, .02], [.1, .02], [.15, -.05], [.1, -.15], [.045, -.09], [0, -.06], [-.22, -.04]], .011, e - .1), steel); p.cylZ('metal', .026, .026, .16, dark, e - .3, null, 8); }
        else p.cylZ('metal', .024, .024, .05, dark, e - .05, null, 8);
      }
    }
    p.build(g); return g;
  }
  function shieldMesh(d) {
    const g = new THREE.Group(), p = new Part(), c = hex(d.col);
    if (d.icon === 'shieldH') {
      const k = d.id === 'kite_shield' ? 1.25 : 1, pts = [[-.26, .34 * k], [.26, .34 * k], [.27, .04], [0, -.42 * k], [-.27, .04]];
      p.add('wood', new THREE.ExtrudeGeometry(shape(pts), { depth: .03, bevelEnabled: true, bevelThickness: .008, bevelSize: .012, bevelSegments: 1 }), c, { p: [0, 0, -.015] });
      p.box('metal', .05, .64 * k, .008, DARK, { p: [0, -.02, .026] }); p.box('metal', .46, .05, .008, DARK, { p: [0, .14, .026] }); for (const [x, y] of [[-.2, .28], [.2, .28], [0, -.3]]) p.ball('metal', .014, STEEL, { p: [x, y * k, .026] });
      p.add('flat', new THREE.ExtrudeGeometry(shape(pts.map(q => [q[0] * .96, q[1] * .96])), { depth: .006, bevelEnabled: false }), 0x6a5236, { p: [0, 0, -.03] });      // the bare boards of the back
      p.box('flat', .04, .3, .03, GRIP, { p: [0, .05, -.05] }); for (const y of [.18, -.08]) p.box('flat', .3, .035, .012, GRIP, { p: [0, y * k, -.036] });
    } else {
      const r = d.id === 'buckler' ? .2 : .4, geo = new THREE.CylinderGeometry(r, r, .03, 18); geo.rotateX(PI / 2);
      p.add('wood', geo, c); for (let i = 0; i < 6; i++) p.box('flat', .008, r * 2 - .04, .004, 0x1a140e, { p: [0, 0, .017], r: [0, 0, i * PI / 6] });
      p.ball('metal', .075, STEEL, { p: [0, 0, .025], s: [1, 1, .6] }); p.add('metal', new THREE.TorusGeometry(r, .013, 5, 20), DARK); p.box('flat', .04, .24, .03, GRIP, { p: [0, 0, -.045] });
      { const bk = new THREE.CylinderGeometry(r * .97, r * .97, .006, 18); bk.rotateX(PI / 2); p.add('flat', bk, 0x6a5236, { p: [0, 0, -.02] }); for (let i = 0; i < 5; i++) p.box('flat', .006, r * 1.9, .003, 0x3a2c1c, { p: [(i - 2) * r * .36, 0, -.024] }); }
    }
    p.build(g); return g;
  }

  // ------------------------------------------------------------------ bodies
  const HAIR = [0x2b2018, 0x3a2a1a, 0x5a4630, 0x6a6660, 0x1a1512, 0x4a3018], SKIN = [0xb39178, 0xa98569, 0xc2a28a, 0x9c7a62];
  const CLOTH = [0x8a7a5e, 0x6e5f48, 0x7a6a4c, 0x5c5a4a, 0x74503a, 0x4e5a4a, 0x6a6258, 0x8c8068, 0x5a4a38];
  // what the Duke's men wear over their armour, by place: [left half, right half, band]
  const LIVERY = { dunmere: [0x8a3228, 0x8a3228, 0], abbey: [0x24211f, 0x24211f, 0xc8c0a8], hold: [0x7a2420, 0x1e1a16, 0] };
  const clsOf = id => id === 'leather_jack' ? 'leather' : id === 'gambeson' || id === 'padded_chausses' ? 'quilt' : id === 'brigandine' ? 'brig' : id === 'mail_hauberk' || id === 'mail_chausses' || id === 'coif' ? 'mail' : id === 'plate_harness' || id === 'plate_greaves' ? 'plate' : 'soft';

  // ------------------------------------------------------------------ faces
  // Brows, lids, pupils, mouth and jaw are small pieces of their own, so that they can move. What a face is doing is
  // six numbers: brow height, brow slant (above 0 a scowl, below it worry), lids (0 open, 1 shut, below 0 wide), how far
  // the mouth is open, how wide it is, and how much tooth shows. A man's state picks the look; a voice can override it.
  const EX = {
    calm: [0, -.1, .05, 0, 1, 0], bored: [-.002, -.14, .4, 0, 1, 0], notice: [.008, -.08, -.3, .12, .85, 0], wary: [-.002, .28, .42, 0, .9, 0],
    anger: [-.006, .5, .25, .1, 1.12, .7], strain: [-.006, .45, .55, .1, 1.25, 1], shout: [-.002, .38, .1, 1, 1.05, .5], pain: [.004, -.5, .9, .7, 1.2, .8],
    fear: [.01, -.45, -.35, .45, .9, 0], dead: [0, -.15, .72, .35, .9, 0], laugh: [.004, -.2, .6, .5, 1.35, 1], yawn: [.008, -.3, 1, 1, .85, 0], purse: [.002, -.1, .2, .25, .45, 0]
  };
  // a hood or a coif: a ball round the head with the face left open (a crown, the sides and back, and a piece under the chin)
  function cowl(P, cls, r, col, p, s, uv) {
    const o = { p, s, uv };
    P.add(cls, new THREE.SphereGeometry(r, 14, 4, 0, PI * 2, 0, 1.2), col, o);
    P.add(cls, new THREE.SphereGeometry(r, 14, 5, PI / 2 + .8, PI * 2 - 1.6, 1.2, 1.25), col, o);
    P.add(cls, new THREE.SphereGeometry(r, 14, 3, 0, PI * 2, 2.45, PI - 2.45), col, o);
  }
  // the mouth follows the sound: how far open it is now, from when each syllable falls
  function mouthOf(m, dt) {
    const say = m.say; if (!say) return 0; say.t += dt; if (say.t > say.dur + .15) { m.say = null; return 0; }
    for (const s of say.syl) if (say.t >= s[0] && say.t <= s[1]) return s[2] * Math.sqrt(Math.sin(PI * clamp((say.t - s[0]) / (s[1] - s[0]), 0, 1)));
    return 0;
  }
  function expr(f, m, dt, open) {
    const F = m.face, a = f.ai, st = a ? a.state : 'idle', say = m.say, time = X.uTime.value; let k = 'calm', quick = 9; if (!F.v) F.v = EX.calm.slice();
    if (f.dead) { k = 'dead'; quick = 3; open = 0; }
    else if (say && say.ex && EX[say.ex]) { k = say.ex; quick = 22; }
    else if (f.stagger > 0) { k = 'pain'; quick = 25; }
    else if (f.atk) k = f.atk.phase === 'strike' ? 'shout' : f.atk.phase === 'windup' ? 'strain' : 'anger';
    else if (st === 'flee' || st === 'yield' || st === 'gone' || f.bound) k = 'fear';
    else if (st === 'combat' || f.blocking) k = 'anger';
    else if (st === 'investigate') k = 'wary';
    else if (a && a.aware > .12) k = 'notice';
    else if (a && Math.sin(time * .13 + m.seed * 3) > .55) k = 'bored';
    const tg = EX[k], v = F.v, q = Math.min(1, dt * quick); for (let i = 0; i < 6; i++) v[i] += (tg[i] - v[i]) * q;
    let lid = v[2]; if (!f.dead) { F.blink -= dt; if (F.blink <= 0) { F.blink = rand(1.6, 5.5); F.shut = .13; } if (F.shut > 0) { F.shut -= dt; lid = 1; } }
    let op = Math.max(open, v[3], v[5] * .18); const wary = k === 'wary';
    // a frightened jaw trembles; a winded man breathes through his open mouth
    if (!f.dead) { if (k === 'fear') op += .014 + Math.sin(time * 37 + m.seed) * .009; if (m.exert > .35) op = Math.max(op, (m.exert - .3) * (.08 + .05 * Math.sin(m.brPh || 0))); }
    for (let i = 0; i < 2; i++) { const b = F.brow[i], up = wary && i; b.position.y = b.userData.y0 + v[0] * .8 + (up ? .005 : 0) + open * .0016 + Math.sin(time * .9 + m.seed * 5 + i) * .0003; b.rotation.z = (i ? 1 : -1) * v[1] * .7 * (up ? .3 : 1); }      // a wary man cocks one brow
    // the upper lids come down over the eye, the lower rise a little in a squint or a laugh; the jaw drops; the eyes turn
    F.lidU.rotation.x = lerp(-.04, .9, clamp((lid + .3) / 1.3, 0, 1)); F.lidL.rotation.x = PI - lerp(.06, .42, clamp((lid - .3) / .7, 0, 1));      // at rest the upper lid lies over the top of the iris and the lower touches the bottom of it
    F.jaw.rotation.x = op * .3;
    // Eyes do not glide: they jump, rest, and jump again. A man with someone to watch holds on him, with small jumps
    // about the face; one with nothing to watch looks about. A long jump often comes with a blink, and the lids follow the eye up and down.
    const lock = st === 'combat' || st === 'flee' || st === 'yield' || (a && a.aware > .12);
    if (!f.dead) { F.sacT = (F.sacT || 0) - dt; if (F.sacT <= 0) { F.sacT = lock ? rand(.35, 1.4) : rand(.5, 2.8); const nx = rand(-1, 1) * (lock ? .05 : .32), ny = lock ? rand(-.03, .03) : rand(-.16, .1); if (Math.abs(nx - (F.sx || 0)) > .3 && Math.random() < .6 && F.shut <= 0) F.shut = .11; F.sx = nx; F.sy = ny; } }
    const q2 = Math.min(1, dt * 32), ty = f.dead ? 0 : F.pup.position.x / .007 * .5 + (F.sx || 0), tp = f.dead ? .08 : (F.sy || 0); F.gx = (F.gx || 0) + (ty - (F.gx || 0)) * q2; F.gy = (F.gy || 0) + (tp - (F.gy || 0)) * q2;
    for (const e of F.eyes) e.rotation.set(-F.gy, F.gx, 0); F.lidU.rotation.x -= F.gy * .55;
  }
  function human(f, g, m) {
    const eq = f.eq, E = f.E, c = (it, dflt) => it && I[it.id].col ? hex(I[it.id].col) : dflt, pick = a => a[Math.random() * a.length | 0];
    const skin = pick(SKIN), hair = pick(HAIR), under = pick(CLOTH), bodyId = eq.body ? eq.body.id : null, bCls = bodyId ? clsOf(bodyId) : 'soft', bodyC = bCls === 'mail' ? 0xa0a4a8 : bCls === 'plate' ? 0xb4b8bc : c(eq.body, under);
    const legId = eq.legs ? eq.legs.id : null, lCls = legId ? clsOf(legId) : 'soft', legC = lCls === 'mail' ? 0x9a9ea2 : lCls === 'plate' ? 0xb0b4b8 : c(eq.legs, pick([0x4e4234, 0x5a4e3c, 0x3e3a32, 0x4a4a40]));
    const sleeves = eq.body && I[eq.body.id].arms, aCls = sleeves ? bCls : 'soft', armC = sleeves ? bodyC : under, lea = 0x2a2018, boot = 0x1c1712;
    const world = X.world ? X.world.id : 'dunmere', liv = LIVERY[world] || LIVERY.dunmere, armoured = eq.body && I[eq.body.id].cls >= 2;
    const surcoat = E.faction === 'raider' && bCls !== 'plate' && (armoured || E.boss) && (E.boss || E.kicks || Math.random() < .7);
    // the body itself and what covers it, hung on a skeleton (gfx-body.js)
    const B = X.body(f, g, m, { skin, hair, bodyId, bCls, bodyC, lCls, legC, aCls, armC, lea, boot, liv, surcoat });
    // what hangs from his shoulders: a pack, a quiver, a captain's cloak
    const T = new Part(), back = new THREE.Group(); back.position.y = -.32; B.chest.add(back);
    if (eq.pack) { const pc = hex(I[eq.pack.id].col); T.ball('soft', .2, pc, { p: [0, .3, -.2], s: [.95, 1.05, .6] }); T.box('soft', .3, .1, .05, pc, { p: [0, .46, -.26], r: [.4, 0, 0] }); for (const s of [-1, 1]) T.box('soft', .03, .46, .02, lea, { p: [s * .12, .34, .128], r: [.06, 0, 0] }); }
    if (E.archer) { T.cyl('soft', .045, .04, .46, 0x3a2c1e, { p: [.1, .3, -.16], r: [.25, 0, -.35] }, 8); for (let i = 0; i < 4; i++) T.cyl('flat', .004, .004, .2, 0xb8a888, { p: [.17 + i * .012, .58, -.2 + (i % 2) * .016], r: [.25, 0, -.35] }, 4); }
    if (E.boss) { const cl = new THREE.CylinderGeometry(.2, .36, 1.0, 9, 1, true, PI * .5, PI); shade(cl, (x, y) => .75 + y * .25); T.add('soft', cl, E.faction === 'bandit' ? 0x2e2a22 : liv[0], { p: [0, .06, -.03], s: [1.05, 1, .8] }); if (E.faction === 'bandit') for (const s of [-1, 0, 1]) T.ball('soft', .1, 0x4a443a, { p: [s * .17, .56, -.06], s: [1.1, .7, 1.1] }); }
    T.build(back);
    // head. The parts of the face that stay still are built in; the parts that move are added by face().
    const head = m.head = new THREE.Group(); head.position.y = .062; head.scale.setScalar(1.07); B.head.add(head);      // (the head bone is at the top of the neck: the head's middle is a little above it)
    const Hd = new Part(), hid = eq.head ? eq.head.id : null, hc = c(eq.head, 0x9a9ea2), closed = hid === 'great_helm' || hid === 'bascinet';
    const hood = !hid && E.faction === 'bandit' && Math.random() < .4;
    // the head itself is sculpted in gfx-body.js; what is worn on it is made here, to the old measure, and drawn in to fit
    m.face = closed ? null : X.headBuild(head, { skin, hair, covered: hood || hid === 'coif', helm: !!hid && hid !== 'coif' });
    if (closed) Hd.ball('skin', .08, skin, { s: [.95, 1.3, 1.1] });
    if (hood) { const hc2 = pick(CLOTH); cowl(Hd, 'soft', .126, hc2, [0, .02, -.022], [1, 1.16, 1.12]); Hd.cyl('soft', .13, .215, .13, hc2, { p: [0, -.15, -.01], s: [1.1, 1, .8] }, 10); }
    if (hid === 'coif') { cowl(Hd, 'mail', .123, 0xa0a4a8, [0, .012, -.018], [1, 1.16, 1.04], 26); Hd.cyl('mail', .125, .215, .13, 0xa0a4a8, { p: [0, -.15, -.005], s: [1.1, 1, .8], uv: 20 }, 10); }
    else if (hid === 'great_helm') { Hd.cyl('plate', .136, .142, .3, hc, { p: [0, .02, 0] }, 14); Hd.cyl('plate', .11, .136, .045, hc, { p: [0, .192, 0] }, 14); Hd.cyl('plate', .11, .11, .004, hc, { p: [0, .216, 0] }, 14); for (const s of [-1, 1]) Hd.box('soft', .072, .013, .01, 0x050505, { p: [s * .05, .034, .139] }); Hd.box('plate', .014, .22, .012, hc, { p: [0, .0, .142] }); Hd.box('plate', .2, .014, .012, hc, { p: [0, .052, .136] }); for (let i = 0; i < 6; i++) Hd.box('soft', .008, .008, .01, 0x050505, { p: [.03 + (i % 3) * .022, -.05 - (i / 3 | 0) * .024, .14] }); }
    else if (hid) {
      const dome = new THREE.SphereGeometry(.129, 12, 7, 0, PI * 2, 0, PI / 2);
      if (hid === 'kettle_helm') { Hd.add('plate', dome, hc, { p: [0, .06, 0], s: [1, 1.05, 1] }); Hd.cyl('plate', .19, .24, .03, hc, { p: [0, .06, 0] }, 14); }
      else if (hid === 'nasal_helm') { Hd.add('plate', dome, hc, { p: [0, .05, 0], s: [1, 1.3, 1] }); Hd.box('plate', .026, .13, .016, hc, { p: [0, .0, .124] }); Hd.cyl('plate', .131, .131, .03, hc, { p: [0, .055, 0] }, 12); }
      else { Hd.ball('plate', .13, hc, { p: [0, .012, -.008], s: [1, 1.26, 1.04] }); const sn = new THREE.ConeGeometry(.085, .16, 8); sn.rotateX(PI / 2); Hd.add('plate', sn, hc, { p: [0, -.03, .13], s: [1, .9, 1] }); Hd.box('soft', .12, .012, .01, 0x050505, { p: [0, .024, .126] }); Hd.cyl('mail', .125, .2, .12, 0xa0a4a8, { p: [0, -.15, 0], s: [1.1, 1, .8], uv: 20 }, 10); }
    }
    { const hg = new THREE.Group(); hg.scale.set(.84, .98, .98); head.add(hg); Hd.build(hg); }
    // what he carries: the weapon lies in his right hand, a shield is strapped to his left forearm
    const wdef = eq.weapon ? I[eq.weapon.id] : null;
    if (wdef) { m.wmain = weaponMesh(wdef); m.wh.add(m.wmain); m.xbow = !!wdef.xbow; m.two = !!wdef.twoH && !wdef.ranged; if (m.two) m.grip2 = wdef.icon === 'sword' ? -.12 : .36; }
    if (eq.side && E.archer) { m.wside = weaponMesh(I[eq.side.id]); m.wside.visible = false; m.wh.add(m.wside); }
    if (eq.off && !(wdef && wdef.twoH)) { m.sh = shieldMesh(I[eq.off.id]); m.sh.position.set(.065, -.13, 0); m.sh.rotation.y = PI / 2; B.foreL.add(m.sh); }
    g.scale.setScalar(rand(.97, 1.05) * (E.boss ? 1.07 : 1));
  }
  function beast(f, g, m) {
    const q = f.E.quad, c = new THREE.Color(q.col).convertSRGBToLinear(), col = k => new THREE.Color(c.r * k, c.g * k, c.b * k), L = q.len, B = new Part(); m.quad = true;
    // body: a tube laid along z, darker along the spine, paler under
    const bg = tube([[.07, -L * .52], [.15, -L * .44], [.19, -L * .2], [.2, L * .05], [.22, L * .28], [.17, L * .42], [.11, L * .52]], 10); bg.rotateX(PI / 2);
    shade(bg, (x, y) => y > .1 ? .72 : y < -.1 ? 1.2 : 1); B.add('fur', bg, col(1), { p: [0, q.h, 0], s: [q.fat, 1, 1], uv: 6 });
    const neck = q.antler ? .34 : .12;
    { const ng = tube([[.12, 0], [.1, neck * .6], [.085, neck + .06]], 8); B.add('fur', ng, col(.95), { p: [0, q.h + .04, L * .46], r: [q.antler ? .5 : 1.0, 0, 0], s: [q.fat * .9, 1, 1] }); }
    { const TP = new Part(); m.tail = new THREE.Group(); m.tail.position.set(0, q.h + .06, -L * .5); m.tail.rotation.x = m.tailR = q.antler ? -2.5 : -2.25; g.add(m.tail); TP.add('fur', tube([[.012, 0], [.028, q.antler ? .1 : .3], [.03, q.antler ? .13 : .4]], 6), col(.85)); TP.build(m.tail, false); }
    B.build(g);
    m.head = new THREE.Group(); m.head.position.set(0, q.h + .1 + neck * (q.antler ? .9 : .5), L * (q.antler ? .62 : .6)); g.add(m.head);
    const Hd = new Part(), dk = col(.8), ivory = 0xd8d0b8;
    Hd.ball('fur', .105, dk, { s: [q.fat * .95, 1, 1.2] });
    { const sn = new THREE.CylinderGeometry(.036, .07, .2, 8); sn.rotateX(PI / 2); Hd.add('fur', sn, dk, { p: [0, -.03, .17], s: [q.fat, .9, 1] }); Hd.ball('eye', .028, 0x16110e, { p: [0, -.02, .275] }); }
    // ears and the lower jaw are pieces of their own: they are most of what a beast's face can say
    m.ears = [];
    { const J = new Part(), jw = q.fat * (q.tusk ? 1.1 : 1); m.jaw = new THREE.Group(); m.jaw.position.set(0, -.072, .07); m.head.add(m.jaw);
      const jg = new THREE.CylinderGeometry(.022, .046, .19, 6); jg.rotateX(PI / 2); J.add('fur', jg, col(.66), { p: [0, 0, .095], s: [jw, .5, 1] }); J.box('smooth', .036 * jw, .004, .14, 0x4a1a18, { p: [0, .012, .1] });
      if (!q.antler) for (const s of [-1, 1]) J.cyl('smooth', .002, .007, .026, ivory, { p: [s * .016 * jw, .02, .17] }, 4);
      J.build(m.jaw, false); }
    if (!q.antler && !q.tusk) for (const s of [-1, 1]) Hd.cyl('smooth', .007, .002, .03, ivory, { p: [s * .022, -.07, .25] }, 4);
    for (const s of [-1, 1]) {
      { const eg = new THREE.ConeGeometry(.03, q.antler ? .11 : .09, 5); eg.translate(0, .04, 0); const E = new Part(), e = new THREE.Group(); e.position.set(s * .065 * q.fat, .065, -.03); e.rotation.set(-.2, 0, -s * (q.antler ? .9 : .3)); m.head.add(e); E.add('fur', eg, dk); E.build(e, false); m.ears.push(e); }
      Hd.ball('eye', .012, 0x0a0806, { p: [s * .06 * q.fat, .03, .08] });
      if (q.tusk) Hd.cyl('smooth', .004, .014, .09, ivory, { p: [s * .055, -.03, .2], r: [-.6, 0, -s * .3] }, 5);
      if (q.antler) { Hd.cyl('smooth', .008, .016, .34, 0xb8a888, { p: [s * .1, .26, -.05], r: [-.2, 0, -s * .4] }, 5); Hd.cyl('smooth', .005, .01, .16, 0xb8a888, { p: [s * .17, .34, .02], r: [.7, 0, -s * .2] }, 5); Hd.cyl('smooth', .005, .009, .14, 0xb8a888, { p: [s * .2, .42, -.1], r: [-.6, 0, -s * .5] }, 5); }
    }
    // legs in two lengths, jointed half way down: right fore, left fore, right hind, left hind
    Hd.build(m.head); m.legs = []; m.shins = [];
    for (const [x, z] of [[-.1, .36], [.1, .36], [-.1, -.36], [.1, -.36]]) {
      const p = new THREE.Group(), kn = new THREE.Group(), Lg = new Part(), Sh = new Part(), h2 = q.h * .5; p.position.set(x * q.fat, q.h, z * L); g.add(p); kn.position.y = -h2; p.add(kn);
      Lg.add('fur', tube([[.036, -h2 - .012], [.05, -q.h * .15], [.058, .04]], 7), col(.82));
      Sh.add('fur', tube([[.024, -h2 + .03], [.028, -h2 * .4], [.036, .016]], 7), col(.8)); Sh.box('smooth', .05, .035, .07, col(.6), { p: [0, -h2 + .018, .012] });
      Lg.build(p); Sh.build(kn); m.legs.push(p); m.shins.push(kn);
    }
  }
  gfx.addFighter = function (f) {
    const g = new THREE.Group(); g.rotation.order = 'YXZ'; const m = f.m = { g, walk: Math.random() * 6, deadT: 0, seed: Math.random() * 6, fall: Math.random() < .35 ? -1 : 1 };
    if (f.E.quad) beast(f, g, m); else human(f, g, m);
    // a soft dark patch under the feet: under cloud the sun casts almost nothing, and without this people float
    if (X.blobScene !== X.scene) { X.blobG = new THREE.CircleGeometry(1, 18); X.blobG.rotateX(-PI / 2); X.blobM = new THREE.MeshBasicMaterial({ map: X.TX.smoke, color: 0, transparent: true, opacity: .62, depthWrite: false }); X.blobScene = X.scene; }
    m.shd = new THREE.Mesh(X.blobG, X.blobM); m.shd.scale.setScalar(f.E.quad ? f.E.quad.len * .75 : .62); m.shd.renderOrder = 1; X.scene.add(m.shd);
    X.scene.add(g); gfx.updFighter(f, 0);
  };

  gfx.updFighter = function (f, dt) {
    const m = f.m; if (!m) return; const g = m.g;
    g.position.x = f.x * S; g.position.z = f.y * S; m.shd.position.set(g.position.x, .035, g.position.z);
    const cp = X.camera.position, far = X.far || 150; g.visible = (g.position.x - cp.x) * (g.position.x - cp.x) + (g.position.z - cp.z) * (g.position.z - cp.z) < far * far; m.shd.visible = g.visible; if (!g.visible) return;
    if (!m.quad) return X.animate(f, m, dt);      // people are posed on their skeletons (gfx-body.js)
    if (f.dead) { m.deadT = Math.min(1, m.deadT + dt * 2.3); const k = m.deadT * m.deadT; g.rotation.z = 1.5 * k; g.position.y = .1 * k; if (m.jaw) m.jaw.rotation.x = lerp(m.jaw.rotation.x, .3, Math.min(1, dt * 4)); return; }
    g.rotation.y = PI / 2 - f.ang;
    const sp = Math.hypot(f.mvx, f.mvy), amp = Math.min(1, sp / 30); m.walk += sp * S * dt * 3.3;
    const a = f.atk, k = a ? clamp(a.t / a.dur, 0, 1) : 0, ph = m.walk, time = X.uTime.value;
    if (m.quad) {
      // Gait. At a walk the feet go down one at a time; at a trot the diagonal pairs go together; at a run the fore
      // pair and the hind pair. Each row: when in the stride that leg leads, at a walk, a trot and a run.
      const v = sp * S, trot = clamp((v - 1.3) / 1.2, 0, 1), gal = clamp((v - 4.2) / 1.5, 0, 1), cyc = ph * 1.4, A = (.34 + .3 * trot + .26 * gal) * amp, GAIT = [[.75, 0, 0], [.25, .5, .08], [.5, .5, .5], [0, 0, .58]];
      for (let i = 0; i < 4; i++) {
        const o = GAIT[i], at = cyc + lerp(lerp(o[0], o[1], trot), o[2], gal) * PI * 2, lift = Math.max(0, Math.cos(at));
        m.legs[i].rotation.x = -A * Math.sin(at) - lift * .2 * amp; m.shins[i].rotation.x = (i < 2 ? 1 : .7) * lift * (.9 + .6 * gal) * amp + (i < 2 ? .04 : -.12);
      }
      g.position.y = -Math.abs(Math.sin(cyc)) * .014 * amp;
      g.rotation.x = (a ? (a.phase === 'windup' ? .22 * k : a.phase === 'strike' ? -.3 : 0) : 0) + Math.sin(cyc) * .06 * gal * amp;      // a running beast rocks from its fore feet to its hind
      if (m.tail) { const stt = f.ai ? f.ai.state : 'idle'; m.tail.rotation.x = lerp(m.tail.rotation.x, m.tailR + (stt === 'combat' ? .55 : stt === 'flee' ? -.35 : 0) + Math.sin(time * 3 + m.seed) * .05, Math.min(1, dt * 6)); m.tail.rotation.z = Math.sin(time * 2.2 + m.seed) * (.06 + .14 * (1 - amp)); }
      // jaw, ears and the set of the head say what a beast means: ears flat and teeth showing, or ears up and listening
      const st = f.ai ? f.ai.state : 'idle', say = m.say, q = Math.min(1, dt * 10); let jaw = mouthOf(m, dt), ear = 0, hp = Math.sin(time * 1.3 + m.seed) * .08 + (st === 'idle' && f.E.passive ? .5 : 0);
      if (st === 'combat') { jaw = Math.max(jaw, .16); ear = -.8; hp += .12; } else if (st === 'flee') ear = -1; else if (st === 'investigate' || (f.ai && f.ai.aware > .12)) { ear = .3; hp -= .2; }
      if (a) jaw = Math.max(jaw, a.phase === 'windup' ? .5 : a.phase === 'strike' ? .95 : .3);
      if (say && say.ex === 'howl') { hp = -.85; ear = -.5; }
      if (f.stagger > 0) ear = -1;
      m.head.rotation.x = lerp(m.head.rotation.x, hp, Math.min(1, dt * 7));
      if (m.jaw) m.jaw.rotation.x = lerp(m.jaw.rotation.x, -.04 + jaw * .62, q);
      if (m.ears) for (const e of m.ears) e.rotation.x = lerp(e.rotation.x, -.2 + ear * .75 + Math.max(0, Math.sin(time * 2.3 + m.seed + e.position.x * 40) - .93) * 4, q);
      return;
    }
  };
  // his mouth is to move with a sound he is making. plan (from G.voice): how long, when each syllable falls and how
  // wide, and the look that goes with it.
  gfx.say = function (f, plan) { if (f.m) f.m.say = { t: 0, dur: plan.dur, syl: plan.syl, ex: plan.ex }; };
  const dispose = o => o.traverse(c => { if (c.geometry) c.geometry.dispose(); });
  gfx.removeFighter = f => { if (f.m) { X.scene.remove(f.m.g); X.scene.remove(f.m.shd); dispose(f.m.g); if (f.m.sk) f.m.sk.dispose(); } };
  X.expr = expr; X.mouthOf = mouthOf;
  // where a point in the world (px on the ground, metres up) falls on the page, or null if it is behind you
  const _sp = new THREE.Vector3();
  gfx.screen = function (x, y, up) { _sp.set(x * S, up, y * S).project(X.camera); return _sp.z > 1 || _sp.z < -1 ? null : { x: (_sp.x * .5 + .5) * innerWidth, y: (.5 - _sp.y * .5) * innerHeight }; };

  // ------------------------------------------------------------------ first-person hands
  gfx.setView = function (eq) {
    const cam = X.camera; if (vm) { cam.remove(vm); dispose(vm); }
    vm = new THREE.Group(); cam.add(vm);
    const d = eq.weapon ? I[eq.weapon.id] : null, body = eq.body ? I[eq.body.id] : null, cls = body && body.arms ? clsOf(eq.body.id) : 'soft', sleeve = cls === 'mail' ? 0xa0a4a8 : cls === 'plate' ? 0xb4b8bc : body && body.arms ? hex(body.col) : 0x57493a, skin = 0xb08a68, glove = cls === 'soft' ? skin : 0x4e3e2c;
    // a fist closed round a grip that lies along z, and the forearm running back from it
    const arm = (parent, left, across) => {      // across: the off hand on a long grip, its forearm coming in from the left
      const p = new Part(), s = left ? -1 : 1, hc = cls === 'soft' ? 'skin' : 'leather', yaw = across ? -.4 : s * .1, dip = across ? .32 : .14;
      // (the back of the hand and the heel of the palm; four fingers, each bent round the grip and ending in its tip; the thumb laid along the top)
      p.ball(hc, .035, glove, { p: [s * .028, .002, -.003], s: [.58, 1, 1.26] });
      for (let i = 0; i < 4; i++) { const z = -.033 + i * .0203, tr = .0097 - (i === 3 ? .0015 : 0), ring = .0212 - (i === 3 ? .0014 : 0), a0 = s > 0 ? PI - 2.3 : -2.3, g = new THREE.TorusGeometry(ring, tr, 7, 12, 4.6); g.rotateZ(a0); shade(g, (x, y) => .82 + clamp(y * 6, -.12, .16)); p.add(hc, g, glove, { p: [0, 0, z] }); const te = s > 0 ? a0 + 4.6 : a0; p.ball(hc, tr * 1.03, glove, { p: [Math.cos(te) * ring, Math.sin(te) * ring, z] }); p.ball(hc, tr * 1.12, glove, { p: [s * .014, .0235, z] }); }
      p.cyl(hc, .0108, .0096, .046, glove, { p: [s * .004, .036, -.03], r: [PI / 2 - .12, 0, s * .22] }, 8); p.ball(hc, .0098, glove, { p: [-s * .001, .039, -.054] });
      const fg = tube([[.031, 0], [.037, .12], [.045, .5]], 10); fg.rotateX(PI / 2); p.add(cls, fg, sleeve, { p: [s * .03, -.03, .05], r: [dip, yaw, 0], uv: 8, uv2: 16 });
      if (cls !== 'soft') { const cf = tube([[.04, 0], [.044, .1]], 10); cf.rotateX(PI / 2); p.add(cls === 'plate' ? 'plate' : 'soft', cf, cls === 'plate' ? sleeve : 0x2a2018, { p: [s * .03, -.03, .05], r: [dip, yaw, 0] }); }
      else { const cf = tube([[.037, 0], [.039, .03]], 10); cf.rotateX(PI / 2); p.add('soft', cf, 0x2a2018, { p: [s * .03, -.03, .09], r: [dip, yaw, 0] }); }
      p.build(parent, false);
    };
    const R = vm.R = new THREE.Group(); R.rotation.order = 'ZXY'; vm.add(R); arm(R, false);
    if (d) { const w = weaponMesh(d, eq.weapon.dur); w.rotation.y = PI; R.add(w); }
    vm.def = d; vm.thrust = !!d && d.arc < .9 && !d.ranged; vm.ranged = !!d && !!d.ranged; vm.xbow = !!d && !!d.xbow; vm.L = null;
    if (eq.off && !(d && d.twoH)) { const L = vm.L = new THREE.Group(); vm.add(L); const s = shieldMesh(I[eq.off.id]); s.rotation.y = PI; L.add(s); const h = new THREE.Group(); h.position.set(0, 0, .05); h.rotation.x = PI / 2; L.add(h); arm(h, true); L.position.set(-.5, -.66, -.5); }
    else if (d && d.twoH && !d.ranged) { const L = new THREE.Group(); R.add(L); L.position.set(0, 0, -.32); arm(L, true, true); }
    vm.traverse(o => { o.castShadow = false; o.frustumCulled = false; });
    vm.p = { x: .3, y: -.6, z: -.5, rx: .9, rz: -.2 };
  };
  function viewPose(P) {
    const a = P.atk, k = a ? clamp(a.t / a.dur, 0, 1) : 0, th = a && !a.w.ranged ? a.w.arc < .9 : vm.thrust;
    let p = th ? { x: .27, y: -.25, z: -.32, rx: .1, rz: 0 } : { x: .3, y: -.3, z: -.5, rx: .95, rz: -.2 }, fast = false;
    if (vm.ranged) p = vm.xbow ? { x: .16, y: -.25, z: -.4, rx: .03, rz: 0 } : { x: .22, y: -.3, z: -.5, rx: 0, rz: -.5 };
    if (!vm.def) p = { x: .3, y: -.36, z: -.42, rx: .5, rz: 0 };
    if (P.sprint) p = { x: .34, y: -.42, z: -.42, rx: th || vm.xbow ? .25 : .5, rz: -.5 };
    if (a) {
      const c = a.charge * .012;
      if (vm.xbow) { p = a.phase === 'windup' ? { x: .05, y: -.19, z: -.38, rx: .01, rz: 0 } : { x: .2, y: -.44, z: -.38, rx: .95, rz: .35 }; }
      else if (vm.ranged) { if (a.phase === 'windup') p = { x: lerp(.22, .08, k), y: -.16, z: -.5, rx: 0, rz: lerp(-.5, -.08, k) }; }
      else if (th || !vm.def) {
        if (a.phase === 'windup') p = { x: .3, y: -.2, z: lerp(-.32, -.08, k), rx: .08, rz: 0 };
        else if (a.phase === 'strike') { p = { x: .2, y: -.2, z: lerp(-.08, -.95, k), rx: .04, rz: 0 }; fast = true; }
        else p = { x: .25, y: -.24, z: lerp(-.95, -.32, k), rx: .1, rz: 0 };
      } else {
        if (a.phase === 'windup') p = { x: lerp(.3, .52, k), y: lerp(-.3, -.04, k), z: -.42, rx: lerp(.95, 1.5, k), rz: lerp(-.2, -1.05, k) };
        else if (a.phase === 'strike') { p = { x: lerp(.52, -.42, k), y: lerp(-.04, -.34, k), z: -.58, rx: lerp(1.0, .3, k), rz: lerp(-1.05, 1.35, k) }; fast = true; }
        else p = { x: lerp(-.42, .3, k), y: lerp(-.34, -.3, k), z: -.5, rx: lerp(.3, .95, k), rz: lerp(1.35, -.2, k) };
        if (a.dir < 0 && a.phase !== 'recover') { p.x = .1 - p.x; p.rz = -p.rz; }     // the return cut comes back the other way
      }
      p.x += rand(-c, c); p.y += rand(-c, c);
    } else if (P.blocking && !vm.L) p = { x: .04, y: -.15, z: -.5, rx: .95, rz: 1.15 };
    if (P.use || P.busy) p.y -= .55;
    if (P.stagger > 0) { p.y -= .22; p.rz += .5; }
    p.fast = fast; return p;
  }

  // ------------------------------------------------------------------ effects
  gfx.burst = function (x, y, h, kind, n, dir) {
    for (const p of X.parts) {
      if (n <= 0) break; if (p.life > 0) continue;
      const a = dir + rand(-.9, .9), s = kind ? rand(1.5, 5) : rand(.5, 3.2);
      p.life = kind ? rand(.12, .3) : rand(.4, .8); p.blood = !kind; p.m.material = p.pm[kind ? 1 : 0]; p.m.scale.setScalar(kind ? .6 : rand(.7, 1.6));
      p.vx = Math.cos(a) * s; p.vz = Math.sin(a) * s; p.vy = rand(.5, 3.2);
      p.m.position.set(x * S, h, y * S); p.m.visible = true; n--;
    }
  };
  // a: { x, y, z (height, m), ang, kind: 'arrow' | 'bolt' | 'stone' }
  gfx.arrowAdd = a => {
    const g = a.m = new THREE.Group();
    if (a.kind === 'stone') ball(.04, 0x6a6862, 0, 0, 0, g);
    else {
      const p = new Part(), L = a.kind === 'bolt' ? .4 : .75;
      p.cylZ('flat', .006, .006, L, 0x8a7350, -L / 2, null, 5); p.add('steel', bladeGeo([[.011, L / 2 - .01, .004], [.001, L / 2 + .05, .001]], 0), STEEL);
      for (let i = 0; i < 3; i++) p.box('flat', .001, .022, .07, 0xc8c2b0, { p: [0, 0, -L / 2 + .06], r: [0, 0, i * PI / 3] });
      p.build(g, false); g.rotation.order = 'YXZ'; g.rotation.y = PI / 2 - a.ang;
    }
    g.traverse(o => { o.castShadow = false; }); X.scene.add(g);
  };
  gfx.arrowDel = a => { if (a.m) { X.scene.remove(a.m); dispose(a.m); } };
  gfx.flash = () => { flash = 1; };
  gfx.punch = v => { punch = v; };

  const _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3(), _t = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
  gfx.render = function (P, R, dt) {
    const k = R.dusk, mv = Math.hypot(P.mvx, P.mvy), o = G.save.opts, cam = X.camera, wx = X.weather, scene = X.scene;
    X.uTime.value += dt; bobT += mv * S * dt * 3.6;
    const tgt = P.dead ? .28 : P.crouch ? 1.08 : 1.62; eyeY = lerp(eyeY, tgt, Math.min(1, dt * (P.dead ? 3 : 10)));
    const bob = Math.sin(bobT * 2) * .03 * Math.min(1, mv / 50) - (P.limp ? Math.pow(Math.max(0, Math.sin(bobT)), 2) * .1 * Math.min(1, mv / 30) : 0);      // lame: he drops onto the bad leg every other step
    punch = Math.max(0, punch - dt * 5); leanV = lerp(leanV, P.lean || 0, Math.min(1, dt * 9));
    const rx = -Math.sin(P.ang), rz = Math.cos(P.ang);     // the player's right-hand direction on the ground
    cam.position.set(P.x * S + rx * leanV * .4 + rand(-1, 1) * R.shake * .01, eyeY + bob - Math.abs(leanV) * .06, P.y * S + rz * leanV * .4 + rand(-1, 1) * R.shake * .01);
    cam.rotation.y = -P.ang - PI / 2; cam.rotation.x = P.pitch + (P.stagger > 0 ? -.06 : 0) - punch * .08;
    cam.rotation.z = lerp(cam.rotation.z, P.dead ? 1.1 : -leanV * .16 + rand(-1, 1) * R.shake * .004 + Math.cos(bobT) * .004 * Math.min(1, mv / 50) + (P.pain ? Math.sin(X.uTime.value * 2.3) * .012 : 0), Math.min(1, dt * (P.dead ? 2.5 : 30)));
    const fov = (o.fov || 74) + (P.sprint ? 6 : 0) - (P.atk && P.atk.phase === 'windup' ? P.atk.charge * 3 : 0);
    if (Math.abs(cam.fov - fov) > .05) { cam.fov = lerp(cam.fov, fov, Math.min(1, dt * 6)); cam.updateProjectionMatrix(); }

    // light: a grey day, a rust-coloured hour before dusk, then dark; lightning in a storm
    flash = Math.min(1, Math.max(0, flash - dt * 4));
    const cx = cam.position.x, cz = cam.position.z, under = X.roofed[Math.floor(P.x / G.T) + Math.floor(P.y / G.T) * X.world.w] === 1;
    let sv = 0; { const sa = X.skyArr, W = X.world.w, H = X.world.h, tx = Math.floor(P.x / G.T), ty = Math.floor(P.y / G.T); for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) { const x = tx + i, y = ty + j; sv += x < 0 || y < 0 || x >= W || y >= H ? 1 : sa[x + y * W]; } sv = under ? Math.min(.31, sv / 9) : sv / 9; }
    const at = X.atmo(k, flash, sv, dt); X.U.eye.value.copy(cam.position);
    X.sky.position.set(cx, 0, cz);
    // the shadow map follows the player in whole texels, so shadow edges do not crawl as you walk
    _z.copy(X.sunOff).normalize(); _x.crossVectors(UP, _z).normalize(); _y.crossVectors(_z, _x); _t.set(cx, 0, cz);
    const tex = 92 / X.q.shadowSize, ax = _t.dot(_x), ay = _t.dot(_y);
    _t.addScaledVector(_x, Math.round(ax / tex) * tex - ax).addScaledVector(_y, Math.round(ay / tex) * tex - ay);
    X.sun.target.position.copy(_t); X.sun.position.copy(_t).add(X.sunOff);
    const rp = X.rainPos; X.rain.visible = wx.rain > .02 && !under; X.rain.position.set(cx, 0, cz); X.rainM.opacity = lerp(.3, .14, k) * wx.rain;
    if (X.rain.visible) { for (let i = 0; i < rp.length; i += 6) { let y = rp[i + 1] - 17 * dt; if (y < 0) y += 14; rp[i + 1] = y; rp[i + 4] = y - .7; } X.rain.geometry.attributes.position.needsUpdate = true; }
    // fires: only the nearest few get a real light
    for (const f of X.fires) if (f.ext) f.ext.m.visible = !f.ext.late || R.time >= R.total - f.ext.late * 60;
    lightT -= dt; cullT -= dt;
    if (lightT <= 0) { lightT = .25; for (const f of X.fires) f.d = (f.ext && !f.ext.m.visible) ? 1e9 : (f.x - cx) * (f.x - cx) + (f.z - cz) * (f.z - cz); X.fires.sort((a, b) => a.d - b.d); }
    if (cullT <= 0) { cullT = .2; X.far = Math.min(170, 2.15 / Math.max(.004, at.fogD)) + 6; X.cull(cx, cz); }
    const tm = X.uTime.value;
    X.lights.forEach((l, i) => { const f = X.fires[i]; if (!f || f.d > 2800) { l.intensity = 0; return; } l.position.set(f.x, f.y, f.z); l.color.setHex(f.col); l.intensity = f.int * (.84 + .1 * Math.sin(tm * 9 + f.ph) + .07 * Math.sin(tm * 23.7 + f.ph * 2)) * lerp(.85, 1.3, k) * 1.25; });

    if (vm) {
      vm.visible = !P.dead;
      // the weapon lags a little behind the turn of the head
      const dy = G.angDiff(P.ang, lastAng); lastAng = P.ang; swayX = lerp(swayX, clamp(dy * 1.2, -.07, .07), Math.min(1, dt * 9));
      const t = viewPose(P), p = vm.p, r = Math.min(1, dt * (t.fast ? 70 : 15));
      for (const q of ['x', 'y', 'z', 'rx', 'rz']) p[q] = lerp(p[q], t[q], r);
      const tr = P.pain ? Math.sin(X.uTime.value * 17) * .004 : 0;
      vm.R.position.set(p.x - swayX + tr + Math.cos(bobT) * .012 * Math.min(1, mv / 50), p.y + bob * .5 + Math.sin(X.uTime.value * 1.5) * .003, p.z); vm.R.rotation.x = p.rx; vm.R.rotation.z = p.rz + swayX * 1.5;
      if (vm.L) {
        const b = P.blocking, q = Math.min(1, dt * 18), L = vm.L.position;
        // raised, the shield fills the lower left and leaves your eyes clear of its rim
        L.x = lerp(L.x, (b ? -.33 : -.5) - swayX, q); L.y = lerp(L.y, (b ? -.4 : -.66) + bob * .5 - (P.use || P.busy ? .4 : 0), q); L.z = -.5 - punch * .3;
        vm.L.rotation.z = lerp(vm.L.rotation.z, b ? -.08 : -.3, q);
      }
    }
    for (const p of X.parts) {
      if (p.life <= 0) continue;
      p.life -= dt; p.vy -= 9.8 * dt; const m = p.m.position; m.x += p.vx * dt; m.y += p.vy * dt; m.z += p.vz * dt;
      if (p.life <= 0 || m.y < .02) { p.life = 0; p.m.visible = false; if (p.blood && Math.random() < .5) gfx.decal(m.x / S, m.z / S, 3); }
    }
    for (const a of R.shots) if (a.m) { a.m.position.set(a.x * S, a.z, a.y * S); if (a.kind !== 'stone') a.m.rotation.x = -Math.atan2(a.vz, Math.hypot(a.vx, a.vy) * S); }
    X.groundT -= dt; if (X.groundDirty && X.groundT <= 0) { X.groundTex.needsUpdate = true; X.groundDirty = false; X.groundT = .3; }
    const bright = G.save.opts.bright || 1;      // the player's own setting, for their screen and their room
    if (X.post.on) X.post.render(scene, cam, { exposure: X.expo * bright, sat: P.pain ? .42 : .88, contrast: P.pain ? 1.14 : 1.07, fogD: at.fogD });
    else { X.renderer.toneMappingExposure = X.expo * bright * 1.12; X.renderer.render(scene, cam); }      // the plain path has no shadow gamma, so it is given a little more light instead
  };
})();
