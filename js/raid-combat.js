'use strict';
// The raid, part 1: fighters, the body (seven parts, bleeding, fractures, ruined limbs), blows and how they land,
// arrows and thrown stones, and treating wounds. Shared between player and enemies. See raid-ai.js and raid.js.
//
// G.rx holds the live raid: R (state), P (the player's fighter), W (the world), plus the functions other raid files use.
(function () {
  const X = G.rx = { R: null, P: null, W: null };
  const I = G.ITEMS, RS = G.RS, S = G.S, rand = G.rand, clamp = G.clamp, angDiff = G.angDiff;
  const ZN = G.ZONES, BASE = G.BASEHP, ZNAME = G.ZNAME, LIMBS = ['larm', 'rarm', 'lleg', 'rleg'];
  X.WALK = 52;
  const NAT = {
    fists: { name: 'fists', skill: 'hafted', dmg: 6, type: 'blunt', reach: 36, windup: .2, strike: .1, recover: .25, arc: .8, stam: 7, block: 1.6, pen: 0 },
    bite: { name: 'jaws', dmg: 15, type: 'cut', reach: 34, windup: .3, strike: .1, recover: .55, arc: 1, stam: 10, block: 2, pen: 0 },
    tusk: { name: 'tusks', dmg: 21, type: 'blunt', reach: 36, windup: .34, strike: .1, recover: .7, arc: .9, stam: 12, block: 2, pen: .1 }
  };
  const VERB = { cut: ['slash', 'slashes'], pierce: ['stab', 'stabs'], blunt: ['strike', 'strikes'] };
  const witem = X.witem = f => f.E.natural ? null : ((f.ai && f.ai.melee) ? f.eq.side : f.eq.weapon);
  const wd = X.wd = f => { if (f.E.natural) return NAT[f.E.natural]; const it = witem(f); return it ? I[it.id] : NAT.fists; };
  const shield = X.shield = f => { const w = f.eq.weapon && I[f.eq.weapon.id]; if ((w && w.twoH) || !f.eq.off) return null; return I[f.eq.off.id]; };
  const nm = X.nm = (f, cap) => f.E.proper ? f.name : (cap ? 'The ' : 'the ') + f.name;
  const sk = X.sk = k => G.me === G.save ? G.skillLvl(k) : 0;                 // the player's skill (a gleaner has none)
  const msg = X.msg = function (text, cls, dedupe, ttl) {
    const R = X.R; if (!R) return;
    if (dedupe) { const m = R.msgs[R.msgs.length - 1]; if (m && m.text === text && m.t > 6 - dedupe) return; }
    R.msgs.push({ text, cls: cls || '', t: ttl || 6 }); if (R.msgs.length > 8) R.msgs.shift();
  };
  // How a thing at f reaches your ears from where you stand: v how loud (nothing past range, and less through a closed
  // helm), pan to which side, d how far as a share of range, occ a wall between, back how far behind you.
  const spot = X.spot = function (f, range) {
    const P = X.P, dx = f.x - P.x, dy = f.y - P.y, d = Math.hypot(dx, dy), k = clamp(1 - d / range, 0, 1), rel = d > 6 ? angDiff(Math.atan2(dy, dx), P.ang) : 0;
    const occ = k > 0 && d > 40 && !X.W.los(P.x, P.y, f.x, f.y) ? 1 : 0;
    return { v: k * Math.sqrt(k) * P.hearMul * (occ ? .65 : 1), pan: Math.sin(rel) * .85, d: 1 - k, occ, back: d > 6 ? Math.max(0, -Math.cos(rel)) : 0 };
  };
  // a sound somewhere in the world
  // local: a sound every machine makes for itself (footfalls, the swish of a blow it is playing out), so it is not passed on
  // extra: what the sound itself wants to know (the ground underfoot, the harness a man wears, the weight of a weapon)
  const sfxAt = X.sfxAt = function (name, f, vol, local, extra) {
    const P = X.P, R = X.R;
    if (!R.ghost) { if (f === P) G.sfx(name, vol, 0, extra); else { const o = spot(f, name === 'step' ? 950 : 700); if (name === 'step') { o.v = Math.pow(Math.max(0, 1 - o.d), .9) * P.hearMul * (o.occ ? .75 : 1); o.d *= .6; }      // footfalls carry: they are how you know where a man is before you see him
      if (o.v * vol > .012) G.sfx(name, vol * o.v, o.pan, extra ? Object.assign(o, extra) : o); } }
    if (!local && R.net === 'host') G.net.fx(['sf', name, Math.round(f.x), Math.round(f.y), +vol.toFixed(2)]);
  };
  // Voices. Men and beasts have no words here, only the sound of them: a shout, a grunt, talk too far off to follow.
  // Each has a voice of his own, got from his number, so he sounds the same on every machine; and his mouth moves
  // with it (see gfx-actors.js). kind: what is meant (alert, pain, death, huh, mutter ...); audio.js turns that into
  // whatever this sort of creature does. local: every machine works this one out for itself, so it is not passed on.
  const VRANGE = { mutter: 340, hum: 320, whistle: 520, cough: 440, sniff: 220, yawn: 300, laugh: 460, sigh: 260, huh: 440, hmph: 320, idle: 380, effort: 480, oof: 480, taunt: 650, pain: 720, death: 760, alert: 950, roar: 1100, call: 950, fear: 800, howl: 2600 };
  X.vtype = f => f.E.quad ? f.type : f.E.boss ? 'boss' : 'man';
  const VPRIO = { death: 9, pain: 6, alert: 5, roar: 5, fear: 5, call: 5, oof: 4, effort: 3, taunt: 3, huh: 2, hmph: 2 };
  X.say = function (f, kind, vol, local) {
    const R = X.R, P = X.P; if (!R || !f || (f.dead && kind !== 'death') || f.gone) return null;
    if (vol === undefined) vol = 1;
    // one mouth, one sound at a time: a cry of pain will cut across a mutter, but not the other way about
    const pr = VPRIO[kind] || 1; if (R.time < (f.voT || 0) && pr <= (f.voP || 0)) return null; f.voT = R.time + .5; f.voP = pr;
    if (!local && R.net === 'host' && f.id != null) G.net.fx(['vo', f.id, kind, +vol.toFixed(2)]);
    if (R.ghost) return null;
    const me = f === P, o = me ? { v: .5, pan: 0, rev: .06 } : spot(f, VRANGE[kind] || 700), h = f.eq && f.eq.head && I[f.eq.head.id];
    o.type = X.vtype(f); o.seed = f.vs || 0; o.helm = h && h.closed ? 1 : 0;
    const plan = G.voice(kind, vol * o.v, o.pan, o); if (!plan) return null;
    f.voT = R.time + plan.dur * .85; if (f.m) G.gfx.say(f, plan);
    if (kind === 'death') sfxAt('bodyfall', f, me ? .6 : .8, true, { at: .5, kit: f.rattle });      // and then the weight of him going down
    return plan;
  };
  // what a harness adds to the sound of a man moving: the whisper of mail, the knock of plate
  X.rattleOf = eq => { const b = eq && eq.body && eq.body.id; return b === 'mail_hauberk' ? 'mail' : b === 'plate_harness' || b === 'brigandine' ? 'plate' : null; };
  // what a piece of armour is made of, as a blow on it sounds
  const armKind = id => /mail|coif/.test(id) ? 'mail' : /plate|helm|bascinet|brigandine/.test(id) ? 'plate' : null;
  // the ground at a place, as it sounds underfoot
  const TLs = G.TILE, SURF = { [TLs.GRASS]: 'grass', [TLs.BUSH]: 'grass', [TLs.REED]: 'grass', [TLs.DIRT]: 'dirt', [TLs.WOOD]: 'wood', [TLs.STONE]: 'stone', [TLs.COBBLE]: 'stone', [TLs.DOOR]: 'stone', [TLs.MUD]: 'mud', [TLs.WATER]: 'water', [TLs.DEEP]: 'water' };
  X.surfAt = (x, y) => SURF[X.W.tileAt(x, y)] || 'dirt';

  // ------------------------------------------------------------------ going up with friends (see net.js)
  // R.net is 'host' on the machine that moves the enemies and 'client' on the others; it is null when you go up alone.
  // A fighter marked .remote is another player, moved from their own machine; one marked .pup is an enemy the host
  // moves. Each machine settles for itself what happens to its own player, and the host settles what happens to
  // enemies, so every blow is resolved exactly once: on the machine that owns whoever was struck.
  const isP = X.isP = f => f === X.P || !!(f && f.remote);
  // something only the one who did it should be told, or learn from: said here if that is you, sent to them if not
  const tell = X.tell = (f, text, cls, dedupe) => { if (f === X.P) msg(text, cls, dedupe); else if (f && f.remote) G.net.toPlayer(f, ['m', text, cls || '', dedupe || 0]); };
  const gain = X.gain = (f, k, n) => { if (f === X.P) G.addSkill(k, n); else if (f && f.remote) G.net.toPlayer(f, ['k', k, +n.toFixed(2)]); };
  const jolt = (f, shake, slow) => { const R = X.R; if (f === X.P) { R.shake = shake; if (slow && !R.net) R.slow = slow; } else if (f && f.remote) G.net.toPlayer(f, ['j', shake]); };
  // said to everyone who is up there
  X.all = (text, cls) => { msg(text, cls); if (X.R && X.R.net === 'host') G.net.cast(['m', text, cls || '', 0]); };
  // blood, sparks and stains: everyone should see them
  const burst = (x, y, h, kind, n, dir) => { G.gfx.burst(x, y, h, kind, n, dir); if (X.R.net === 'host') G.net.fx(['b', Math.round(x), Math.round(y), h, kind, Math.round(n), +dir.toFixed(2)]); };
  const decal = (x, y, r) => { G.gfx.decal(x, y, r); if (X.R.net === 'host') G.net.fx(['d', Math.round(x), Math.round(y), +r.toFixed(1)]); };
  // a thing to search that has come into the world part-way through: a body, or goods put down
  X.addLoot = function (l) { const R = X.R; l.id = R.lootSeq++; R.loot.push(l); if (l.kind === 'pile') l.m = G.gfx.addPile(l.x, l.y); if (R.net === 'host') G.net.cast(['la', l.id, l.kind, Math.round(l.x), Math.round(l.y), l.name]); return l; };
  const AIMTIP = 'A blow lands where you are looking: level for the head, lower for chest and belly, down for the legs. Armour protects only what it covers. With a sword, the middle mouse button or T thrusts for the gaps.';
  const spend = X.spend = (f, n) => { f.stam = Math.max(0, f.stam - n); f.stamDelay = .7; };
  // said once per save, the first time something happens to you
  X.tip = function (key, text) { const s = G.save; if (G.me !== s || s.flags['tip_' + key]) return; s.flags['tip_' + key] = 1; msg(text, 'tip', 0, 11); };

  X.mkF = function (E, x, y) {
    const f = { E, name: E.name, x, y, r: E.r || 6, ang: rand(0, 6.28), hp: {}, max: {}, lb: {}, hb: {}, frac: {}, stam: 100, maxStam: 100, stamDelay: 0, eq: {}, atk: null, blocking: false, blockT: 9, blockDown: 9, stagger: 0, iframes: 0, dodgeCd: 0, kickT: 0, numb: 0, ale: 0, dead: false, kx: 0, ky: 0, mvx: 0, mvy: 0, lf: 1, stepD: 0, dripT: 0 };
    for (const z of ZN) { f.hp[z] = f.max[z] = BASE[z] * (E.hp || 1); f.lb[z] = 0; f.hb[z] = false; }
    return f;
  };

  // ------------------------------------------------------------------ the body
  const isNumb = f => f.numb > 0;
  X.armsBad = f => isNumb(f) ? 0 : (f.hp.larm <= 0 || f.frac.larm ? 1 : 0) + (f.hp.rarm <= 0 || f.frac.rarm ? 1 : 0);
  X.legsBad = f => isNumb(f) ? 0 : (f.hp.lleg <= 0 || f.frac.lleg ? 1 : 0) + (f.hp.rleg <= 0 || f.frac.rleg ? 1 : 0);
  X.bleeds = f => { let l = 0, h = 0; for (const z of ZN) { l += f.lb[z]; if (f.hb[z]) h++; } return [l, h]; };
  X.inPain = f => !isNumb(f) && (LIMBS.some(z => f.frac[z] || f.hp[z] <= 0) || f.hp.stomach <= 0);
  function spread(f, from, amt) { const zs = ZN.filter(k => k !== from && f.hp[k] > 0); for (const k of zs) f.hp[k] = Math.max(0, f.hp[k] - amt / zs.length); }
  // take health from one part; a ruined part passes its hurt on to the rest
  const hurt = X.hurt = function (f, z, amt) {
    if (f.hp[z] <= 0) { if (z !== 'head' && z !== 'thorax') spread(f, z, amt * (z === 'stomach' ? 1.5 : .7)); return; }
    f.hp[z] -= amt;
    if (f.hp[z] <= 0) {
      const over = -f.hp[z]; f.hp[z] = 0;
      if (z !== 'head' && z !== 'thorax') { spread(f, z, over * .7); if (f === X.P) msg(`Your ${ZNAME[z]} is ruined.`, 'bad'); }
    }
  };
  const fallen = f => f.hp.head <= 0 || f.hp.thorax <= 0;

  // ------------------------------------------------------------------ blows
  // alt: a thrust with a sword-type weapon. Less hurt than a cut, but it finds the gaps in armour.
  X.startAttack = function (f, alt) {
    const R = X.R, P = X.P;
    if (f.atk || f.stagger > 0 || f.dead) return false;
    let w = wd(f); const me = f === P;
    if (alt && me && w.skill === 'blades' && w.arc >= .9 && !w.ranged) w = Object.assign({}, w, { type: 'pierce', dmg: w.dmg * .8, arc: .5, pen: Math.min(.7, (w.pen || 0) + .2), reach: w.reach + 5, windup: w.windup * .92 });
    if (f.stam < w.stam * .5) { if (me) msg('You are too winded to strike.', 'dim', 2); return false; }
    if (w.ranged && me && !X.ammoFor(w)) { msg(w.ammo === 'bolt' ? 'You have no quarrels.' : 'You have no arrows.', 'dim', 2); return false; }
    f.blocking = false; f.use = null; f.busy = null;
    let sp = 1 + (!(f.numb > 0) && (f.hp.rarm <= 0 || f.frac.rarm) ? .2 : 0), bonus = 1;      // a ruined right arm strikes a fifth slower
    if (me) {      // blows flow into one another: a follow-up cut comes back the other way and faster; a parry buys a quick answer
      sp *= 1 - .012 * sk(w.skill);
      if (P.comboT > 0 && !w.ranged) { sp *= .78; P.swing = -P.swing; } else P.swing = 1;
      if (P.riposte > 0 && !w.ranged) { sp *= .55; bonus = 1.25; P.riposte = 0; }
    }
    f.atk = { phase: 'windup', t: 0, dur: w.windup * sp, charge: w.xbow ? 1 : 0, done: false, w, dir: me ? P.swing : (Math.random() < .5 ? 1 : -1), bonus };
    if (me && w.ranged && !w.xbow) G.sfx('draw', .5);
    return true;
  };
  X.updAttack = function (f, dt) {
    const a = f.atk; if (!a) return; const w = a.w, R = X.R, P = X.P, me = f === P; a.t += dt;
    if (a.phase === 'windup') {
      if (a.t < a.dur) return;
      const over = a.t - a.dur, hold = me ? (R.held && !R.ui) : over < f.ai.hold;
      if (!w.xbow) a.charge = clamp(over / .6, 0, 1);
      if (hold && over < (w.ranged ? 4 : 1.5)) { if (me && w.ranged && over > 1.2) spend(f, 6 * dt); return; }
      const cost = w.stam * (1 + .7 * a.charge) * (2 - f.lf) * (me ? 1 - .012 * sk(w.skill) : 1);
      spend(f, cost); if (me) G.addSkill('vigor', cost * .02);
      if (w.ranged) { X.fire(f, a.charge, w); a.phase = 'recover'; a.t = 0; a.dur = w.recover * (me ? 1 - .012 * sk('archery') : 1); return; }
      a.phase = 'strike'; a.t = 0; a.dur = w.strike;
      const l = (w.arc < .9 ? 70 : 45) * (f.E.lunge || 1); f.kx += Math.cos(f.ang) * l; f.ky += Math.sin(f.ang) * l;
      sfxAt('swing', f, .5, true, { w: w.twoH ? 1.5 : w.arc < .9 ? .6 : 1 }); if (!f.pup) X.noise(f.x, f.y, 110);
      // the grunt that goes into a blow: nearly always behind a heavy one, now and then behind a light one
      if (!f.E.natural && Math.random() < (me ? (a.charge > .5 || w.twoH ? .7 : .15) : w.twoH ? .8 : .45)) X.say(f, 'effort', me ? .6 : .8, true);
    } else if (a.phase === 'strike') {
      if (!a.done && a.t >= a.dur * .5) { a.done = true; doHit(f, a); }
      if (a.t >= a.dur && f.atk === a) { a.phase = 'recover'; a.t = 0; a.dur = w.recover * (1 + .15 * X.armsBad(f)); }
    } else if (a.t >= a.dur) { f.atk = null; if (me) P.comboT = .55; }
  };
  function doHit(f, a) {
    // you strike at enemies, never at a friend; an enemy's blow is settled here only where it falls on you
    const R = X.R, P = X.P, W = X.W, w = a.w, reach = w.reach * RS, targets = f === P ? R.fighters : f.ai && f.ai.foe ? [f.ai.foe] : (P.dead || P.gone ? [] : [P]), hits = []; let best = null, bd = 1e9;
    for (const o of targets) {
      if (o === f || o.dead || o.remote) continue;
      const dx = o.x - f.x, dy = o.y - f.y, d = Math.hypot(dx, dy) - o.r;
      if (d > reach) continue;
      if (Math.abs(angDiff(Math.atan2(dy, dx), f.ang)) > w.arc / 2 + (d < 8 ? .5 : .12)) continue;
      if (!W.los(f.x, f.y, o.x, o.y)) continue;
      hits.push(o); if (d < bd) { bd = d; best = o; }
    }
    if (!hits.length) return;
    const it = witem(f), cond = it && it.dur != null && it.dur < .35 ? .68 + it.dur * .9 : 1, thrust = w.arc < .9;
    const dmg = w.dmg * (1 + .6 * a.charge) * (1 - .15 * X.armsBad(f)) * (a.bonus || 1) * cond * (f === P ? 1 + .012 * sk('might') : 1);
    for (const o of thrust ? [best] : hits) {
      const zone = f === P ? aimZone(o, thrust ? .06 : .2) : aiZone(f, o);
      X.resolve(f, o, dmg, w.type, Math.atan2(f.y - o.y, f.x - o.x), { zone, pen: w.pen || 0, skill: w.skill });
      if (f.atk !== a) break;
    }
  }
  // where the player's blow lands: where you are looking. Height from the pitch of your gaze, side from how far off-centre.
  function aimZone(o, jitter) {
    const P = X.P, dx = o.x - P.x, dy = o.y - P.y, dm = Math.max(.3, Math.hypot(dx, dy) * S - .25);
    if (o.E.quad) { const r = Math.random(); return r < .22 ? 'head' : r < .72 ? 'thorax' : 'stomach'; }
    const j = jitter * (1 - .02 * sk(wd(P).skill)), h = (P.crouch ? 1.08 : 1.62) + Math.tan(P.pitch) * dm + rand(-j, j);
    // where the line of your gaze crosses the target, measured along the target's own right-hand side
    const hx = P.x + Math.cos(P.ang) * Math.hypot(dx, dy) - o.x, hy = P.y + Math.sin(P.ang) * Math.hypot(dx, dy) - o.y;
    const lat = (hx * -Math.sin(o.ang) + hy * Math.cos(o.ang)) * S + rand(-j, j) * .5, side = lat >= 0 ? 'r' : 'l';
    if (h >= 1.47) return 'head';
    if (h >= 1.08) return Math.abs(lat) > .17 ? side + 'arm' : 'thorax';
    if (h >= .82) return Math.abs(lat) > .2 ? side + 'arm' : 'stomach';
    return side + 'leg';
  }
  function aiZone(f) {
    const s = f.E.skill, r = Math.random(), head = .07 + .1 * s;
    if (r < head) return 'head'; if (r < head + .4) return 'thorax'; if (r < head + .55) return 'stomach';
    const q = Math.random(); return q < .24 ? 'larm' : q < .48 ? 'rarm' : q < .74 ? 'lleg' : 'rleg';
  }
  function wear(f, amt) { const it = witem(f); if (it && it.dur != null) it.dur = Math.max(.02, it.dur - amt); }
  function armourAt(o, zone) {
    const slot = zone === 'head' ? 'head' : (zone === 'lleg' || zone === 'rleg') ? 'legs' : 'body', it = o.eq[slot]; if (!it) return null;
    const d = I[it.id]; if (!d.prot || (slot === 'body' && (zone === 'larm' || zone === 'rarm') && !d.arms)) return null;
    return it;
  }
  // from = direction (radians) from the target toward the source of the blow. opt: { zone, pen, skill, arrow, bleed }
  X.resolve = function (a, o, dmg, type, from, opt) {
    const R = X.R, P = X.P, me = o === P, mine = isP(a), arrow = !!opt.arrow;
    // your blow on an enemy the host moves: the host has his guard, his armour and his life, so the host settles it
    if (R.net === 'client' && o.pup) {
      if (a === P) { G.net.send(['h', o.id, +dmg.toFixed(1), type, +from.toFixed(3), opt.zone || 'thorax', +(opt.pen || 0).toFixed(2), opt.skill || '', arrow ? (opt.bolt ? 2 : 1) : 0, +(opt.bleed || 1).toFixed(2)]); if (!arrow) wear(a, .004); X.tip('aim', AIMTIP); }
      return;
    }
    if (o.iframes > 0) { if (me) msg('You slip the blow.', 'dim', 1); return; }
    const rel = Math.abs(angDiff(from, o.ang)), sh = shield(o);
    if (o.blocking && rel < 1.15 && (!arrow || (sh && sh.arrows))) {
      const gl = me ? sk('guard') : 0, parry = !arrow && (me ? o.blockT < .2 + gl * .005 : o.ai.parry);
      if (parry) {
        a.atk = null; a.stagger = Math.max(a.stagger, me ? .95 : .6); spend(o, 3); sfxAt('parry', o, 1);
        burst((a.x + o.x) / 2, (a.y + o.y) / 2, 1.3, 1, 8, from); if (me) R.shake = 5; else jolt(a, 5); X.noise(o.x, o.y, 380);
        if (me) msg(`You turn ${nm(a)}'s blow aside. He is open.`, 'good'); else tell(a, `${nm(o, 1)} parries and knocks your weapon wide.`, 'bad');
        if (me) { P.riposte = 1.3; G.addSkill('guard', 4); if (a.pup) G.net.send(['pr', a.id]); }      // the host must know its man was turned
        else { o.ai.parry = false; if (a.remote) G.net.toPlayer(a, ['pd', .6]); }                     // and a friend that theirs was
        return;
      }
      const eff = sh ? sh.block : (wd(o).block || 1);
      spend(o, dmg * eff * (arrow ? .4 : .85) * (1 + .25 * X.armsBad(o)) * (1 - .02 * gl)); sfxAt(sh ? 'thud' : 'clang', o, 1); if (sh) sfxAt('clang', o, .55); X.noise(o.x, o.y, 380);
      if (!sh) burst((a.x + o.x) / 2, (a.y + o.y) / 2, 1.3, 1, 4, from);
      o.kx -= Math.cos(from) * 30; o.ky -= Math.sin(from) * 30; if (me) { R.shake = 4; G.addSkill('guard', 1); }
      if (sh && o.eq.off && o.eq.off.dur != null) {
        o.eq.off.dur = Math.max(0, o.eq.off.dur - dmg * .0016);
        if (o.eq.off.dur <= 0) { o.eq.off = null; sfxAt('crack', o, 1); if (me) { msg('Your shield splits and falls away.', 'bad'); G.raid.gearChanged(); } else { tell(a, `${nm(o, 1)}'s shield splits.`, 'good'); if (o.m && o.m.sh) { o.m.sh.visible = false; o.m.sh = null; } } }
      } else wear(o, .005);
      if (!arrow) wear(a, .004);
      if (o.stam <= 0) { o.stagger = 1; o.blocking = false; o.atk = null; if (me) msg('Your guard is beaten down!', 'bad'); else tell(a, `You batter through ${nm(o)}'s guard!`, 'good'); }
      return;
    }
    const zone = opt.zone || 'thorax'; let mult = rand(.88, 1.12), back = false;
    if (o.ai && !o.E.quad && (o.ai.state !== 'combat' || rel > 2.3)) { mult *= o.ai.state === 'idle' ? 2.8 : 1.8; back = true; }      // a man wholly unaware takes it worst of all
    dmg *= mult;
    const arm = armourAt(o, zone); let prot = 0;
    if (arm) { const d = I[arm.id], du = arm.dur == null ? 1 : arm.dur; prot = d.prot[type] * (.35 + .65 * du) * (zone === 'larm' || zone === 'rarm' ? .8 : 1) * (1 - (opt.pen || 0)); arm.dur = Math.max(0, du - dmg * .0022 * (type === 'blunt' ? .6 : 1)); }
    const thr = dmg * (1 - prot), limb = LIMBS.includes(zone);
    hurt(o, zone, thr); if (mine) { o.hitBy = a; if (o.grp) o.grp.prov = true; }
    let extra = '';
    if (type !== 'blunt') {
      const bm = opt.bleed || 1;
      if (thr > 18 && Math.random() < (thr - 14) / 55 * bm && !o.hb[zone]) { o.hb[zone] = true; extra = me ? ' Blood is pouring from it.' : ' It bleeds heavily.'; }
      else if (thr > 6 && Math.random() < thr / 48 * bm && o.lb[zone] < 2) { o.lb[zone]++; if (me) extra = ' You are bleeding.'; }
    } else if (limb && thr > 12 && Math.random() < .36 && !o.frac[zone]) { o.frac[zone] = true; extra = me ? ` Something in your ${zone.endsWith('arm') ? 'arm' : 'leg'} breaks.` : ' Bone cracks.'; sfxAt('crack', o, .8); }
    if (me) {
      if (o.hb[zone]) X.tip('heavy', 'A heavy bleed will kill you inside a minute. Press 2 for a ligature (a bandage only slows it), or H to treat your worst hurt.');
      else if (o.lb[zone]) X.tip('bleed', 'You are bleeding. Press 1 for a bandage, or H to treat your worst hurt with whatever you carry.');
      if (o.frac[zone]) X.tip('frac', 'A broken limb slows your legs or your blows. Press 4 for a splint. Willow bark or poppy (6) lets you ignore it for a while.');
    } else if (a === P) X.tip('aim', AIMTIP);
    if (thr > 11) { o.stagger = Math.max(o.stagger, thr > 22 ? .45 : .22); o.atk = null; o.use = null; o.busy = null; }
    o.kx -= Math.cos(from) * 40; o.ky -= Math.sin(from) * 40;
    const hh = zone === 'head' ? 1.6 : limb && zone.endsWith('leg') ? .6 : 1.2;
    if (thr > 3) { burst(o.x, o.y, hh, 0, 3 + thr / 3, from + Math.PI); decal(o.x, o.y, 3 + thr / 4); }
    if (prot > .55) burst(o.x, o.y, hh, 1, 5, from);
    { const ak = arm && prot > .3 ? armKind(arm.id) : null; sfxAt(ak === 'plate' ? 'clang' : ak === 'mail' ? 'mail' : type === 'blunt' ? 'hitb' : 'hit', o, 1); } X.noise(o.x, o.y, 330);
    if (!arrow) wear(a, prot > .5 ? .008 : .003);
    if (me) { R.shake = 6 + thr * .4; R.hurt = Math.min(1, .35 + thr / 40); if (!R.net) R.slow = .06; G.addSkill('hardiness', thr * .08); R.hits.push({ a: from, t: 1.4 }); if (R.hits.length > 6) R.hits.shift(); }
    else if (mine) { jolt(a, 3, .05); gain(a, opt.skill || 'hafted', zone === 'head' ? 3 : 1.5); gain(a, 'might', thr * .04); if (back) gain(a, 'fieldcraft', 6); }
    const v = VERB[type], tail = prot > .6 ? (zone === 'head' ? ' It glances off the helm.' : ' The armour turns it.') : thr > 24 ? ' A grievous wound.' : '';
    if (me) msg(`${arrow ? (opt.bolt ? 'A quarrel' : 'An arrow') : nm(a, 1)} ${arrow ? 'strikes' : v[1]} your ${ZNAME[zone]}.${tail}${extra}`, 'bad');
    else if (mine) tell(a, `${back ? 'Unseen, you' : 'You'} ${arrow ? 'shoot' : v[0]} ${nm(o)} in the ${ZNAME[zone]}.${tail}${extra}`);
    if (a === P && o.ai && X.neutral(o)) { R.banditsHostile = true; msg('The hill-folk saw that. They will not leave a gleaner alone now.', 'bad'); }
    if (fallen(o)) { X.die(o, a, { zone, skill: opt.skill }); return; }
    X.say(o, thr > 11 ? 'pain' : 'oof', thr > 11 ? 1 : .8);
    if (o.ai) {
      if (a && a.ai) { o.byBand = true; if (!o.E.captive && !o.E.passive && (!o.ai.foe || o.ai.foe.dead)) o.ai.foe = a; if (o.E.passive) { o.ai.state = 'flee'; o.ai.fleeT = rand(7, 11); } else if (o.ai.state === 'idle' || o.ai.state === 'investigate') { o.ai.state = 'combat'; o.ai.aware = 1; } }      // struck by another band's man: he turns on him
      else if (o.ai.state !== 'combat') X.alert(o, false, mine ? a : null);
      if (!o.ai.fled && !o.E.captive && !(o.grp && o.grp.ag >= 3) && o.E.courage < 1 && (o.hp.thorax < o.max.thorax * .45 || o.hp.head < o.max.head * .45) && Math.random() < 1 - o.E.courage) {
        o.ai.fled = true;      // his nerve goes: he runs, or (a man on his feet with a blade at him) he throws down what he holds
        if (mine && !arrow && !o.E.quad && !o.E.boss && !o.E.archer && Math.random() < .4) X.yielded(o, a);
        else { o.ai.state = 'flee'; o.ai.fleeT = rand(6, 10); X.say(o, 'fear', 1); if (mine) tell(a, `${nm(o, 1)} breaks and runs.`); }
      }
    }
  };
  // ---- mercy. A man whose nerve breaks at sword's length may yield; a captive may be cut loose. Either way he leaves alive.
  X.yielded = function (o, a) {
    const ai = o.ai, wn = o.eq.weapon ? I[o.eq.weapon.id].name.toLowerCase() : 'knife';
    ai.state = 'yield'; ai.yieldT = 0; o.yield = true; o.atk = null; o.blocking = false; o.mvx = o.mvy = 0; X.say(o, 'fear', 1);
    tell(a, G.pick([`${nm(o, 1)} throws down his ${wn} and drops to his knees. "Mercy!"`, `${nm(o, 1)} lets his ${wn} fall. "No more. I yield."`, `${nm(o, 1)} is on his knees with his hands up. "Not like this. Please."`]) + ' [F] sends him off, and he leaves what he carries.', 'good');
  };
  const DIRS = ['east', 'south-east', 'south', 'south-west', 'west', 'north-west', 'north', 'north-east'];
  // by: the player who did it. It is settled on the host, like everything else about the men up there.
  X.freeMan = function (f, by) {
    const R = X.R, W = X.W; if (!f.ai || f.dead || f.left) return;
    if (f.E.captive) { if (!f.bound) return; X.runOff(f); X.say(f, 'huh', .9); X.all(`${f.pname} is cut loose, and runs for the way out.`, 'good'); X.credit('free', ''); return; }
    if (f.ai.state !== 'yield') return;
    // he leaves what he has in the mud, and sometimes buys his life with what he knows
    for (const s of ['weapon', 'side', 'off']) if (f.eq[s]) { G.raid.putDown(f.x, f.y, f.eq[s], f.x, f.y); f.eq[s] = null; }
    for (const it of f.loot) G.raid.putDown(f.x, f.y, it, f.x, f.y); f.loot = []; f.unarmed = true;
    const c = Math.random() < .6 ? R.loot.filter(l => !l.searched && /chest|coffer|cache|armoury|strongbox|altar/.test(l.kind || '') && Math.hypot(l.x - f.x, l.y - f.y) > 160).sort((p, q) => Math.hypot(p.x - f.x, p.y - f.y) - Math.hypot(q.x - f.x, q.y - f.y))[0] : null;
    if (c) { const z = W.zoneAt(c.x, c.y), dir = DIRS[Math.round(Math.atan2(c.y - f.y, c.x - f.x) / (Math.PI / 4)) & 7]; tell(by, `He leaves what he has and points ${dir}. "${z && z.name ? z.name + '. ' : ''}${G.cap(c.name)}. Nobody has been at it."`, 'good'); }
    else tell(by, G.pick(['He leaves what he carried in the mud and goes.', 'He sets down all he has, backs away, and runs.']), 'good');
    X.credit('spare', f.type); X.runOff(f);
  };
  // what it is worth, to everyone who is up there
  X.credit = function (k, type) { if (X.R.net === 'host') G.net.cast(['cr', k, type || '']); X.credited(k, type); };
  X.credited = function (k, type) {
    const R = X.R;
    if (k === 'free') { R.freed++; R.pop.push({ text: `+${150 * X.W.tier}  one of ours cut loose`, t: 3 }); }
    else { const E = G.ENEMIES[type] || G.ENEMIES.bandit, xp = Math.round(E.xp * .7); R.spared++; R.xp.kill += xp; R.pop.push({ text: `+${xp}  ${E.name} spared`, t: 3 }); }
  };
  X.die = function (o, a, info) {
    const R = X.R, P = X.P; info = info || {};
    o.dead = true; o.atk = null; o.blocking = false; o.mvx = o.mvy = 0; X.say(o, 'death', 1); decal(o.x, o.y, 16);
    if (o === P) {
      R.deathT = 2.8; R.killer = a || null; R.cause = a ? `Killed by ${nm(a)}${info.zone ? ' — ' + ZNAME[info.zone] : ''}.` : (P.energy <= 0 || P.hydr <= 0 ? 'You lay down in the mud and did not get up.' : 'You bled out in the mud.'); R.hurt = 1;
      if (R.net) G.net.fell();      // the others are told, and what you carried lies where you fell for them to find
      return;
    }
    const c = { w: 5, h: 8, items: [] };
    for (const s of ['weapon', 'side', 'off', 'head', 'body', 'legs', 'belt', 'pack']) if (o.eq[s]) G.inv.add(c, o.eq[s]);
    for (const it of o.loot) if (G.inv.add(c, it)) { const e = c.items.find(e => e.it === it); if (e) e.hid = true; }
    X.addLoot({ x: o.x, y: o.y, c, name: o.E.quad ? `${G.cap(o.name)} carcass` : o.E.proper ? `Body of ${o.name}` : `Body of ${o.pname}, a ${o.name}`, kind: 'corpse', searched: false });
    if (!(!o.hitBy && ((a && a.ai) || o.byBand)) || Math.hypot(o.x - P.x, o.y - P.y) < 520) X.all(o.E.captive ? `${o.pname} is dead: one of your own.` : o.E.boss ? `${o.name} is dead.` : `${nm(o, 1)} ${a ? 'falls' : 'bleeds out'}.`, o.E.captive ? 'bad' : 'good');
    // the kill belongs to whoever struck him down, or last drew his blood; friends who were there have a share of it
    const by = a && isP(a) ? a : o.hitBy || null, k = { type: o.type, head: info.zone === 'head', skill: info.skill || '', x: Math.round(o.x), y: Math.round(o.y) };
    // a man killed by another band, whom none of you had touched, is nobody's kill
    if (!(!o.hitBy && ((a && a.ai) || o.byBand))) { if (R.net === 'host') G.net.kill(k, by); if (!R.net || !R.ghost) X.killed(k, !R.net || by === P); }
    // what a death does to those who see it. The Duke's men hold while their sergeant or captain stands, and lose heart
    // when he falls. Bandits are a rabble: when one of theirs goes down, the fainter hearts near him may run at once.
    if (X.dirAlarm && o.E.faction === 'raider' && !o.E.quad && a && isP(a)) X.dirAlarm(a.x, a.y);      // the Duke's men will want to know who did it
    if (a && isP(a) && R.dir) for (const g of R.dir.groups) { if (g.done || g.fac !== (o.E.quad ? 'wolf' : o.E.faction) || (o.band !== undefined && g.band !== o.band)) continue; const L = g.m.find(c => !c.dead && !c.left); if (L && Math.hypot(L.x - o.x, L.y - o.y) < 650) { g.prov = true; g.ag = Math.min(3, g.ag + 1); } }
    if (!o.E.quad && !o.E.captive) for (const c of R.fighters) {
      if (c === o || !c.ai || c.dead || c.E.faction !== o.E.faction || c.E.quad || c.E.boss || Math.hypot(c.x - o.x, c.y - o.y) > 420) continue;
      if (o.E.faction === 'raider' && (o.E.boss || o.E.kicks)) { c.E.courage *= .5; if (Math.random() < .5) X.say(c, 'fear', .8); }
      else if (o.E.faction === 'bandit' && c.ai.state === 'combat' && !c.ai.fled && Math.random() < (1 - c.E.courage) * .5) { c.ai.fled = true; c.ai.state = 'flee'; c.ai.fleeT = rand(6, 10); c.ai.foe = null; X.say(c, 'fear', 1); }
    }
  };
  // a kill as it counts for you: yours outright, or a friend's that you were there for
  X.killed = function (k, mine) {
    const R = X.R, E = G.ENEMIES[k.type], st = G.save.stats.kills, xp = Math.round(E.xp * 1.4 * (k.head ? 1.2 : 1) * (mine ? 1 : .5));      // fewer men, each worth more
    if (mine) { if (G.me === G.save) st[k.type] = (st[k.type] || 0) + 1; R.kills.push(E.name); }
    if (k.x != null && R.marks.length < 300) R.marks.push([k.x, k.y, mine ? 1 : 0]);      // marked on the map of your route afterwards

    R.xp.kill += xp; R.pop.push({ text: `+${xp}  ${E.name}${k.head ? ' (head)' : ''}${mine ? '' : ' — a friend\'s'}`, t: 3 });
    for (const l of G.taskEvent('kill', { type: k.type, map: X.W.id, skill: mine ? k.skill : undefined })) msg(l, 'good');
  };

  // ------------------------------------------------------------------ arrows, quarrels, stones
  X.ammoFor = w => G.findCarried((it, d) => d.cat === 'ammo' && d.ammo === w.ammo);
  X.fire = function (f, charge, w) {
    const R = X.R, me = f === X.P, P = me ? X.P : (f.ai && (f.ai.foe || f.ai.tgt)) || X.P; let ad = I[w.ammo === 'bolt' ? 'bolt' : 'arrow'];      // an enemy looses at whoever he has marked
    if (me) { const am = X.ammoFor(w); if (!am) return; ad = I[am.it.id]; G.useUp(am.it, am.c); G.addSkill('archery', 2); }
    const sp = me ? .035 * (1 - .03 * sk('archery')) * (P.pain ? 2 : 1) : (1 - f.E.skill) * .15, ang = f.ang + rand(-sp, sp), v = w.speed * (.72 + .28 * charge);
    const s = { kind: w.xbow ? 'bolt' : 'arrow', x: f.x + Math.cos(ang) * 10, y: f.y + Math.sin(ang) * 10, z: me ? (P.crouch ? .95 : 1.48) : 1.4, vx: Math.cos(ang) * v, vy: Math.sin(ang) * v, vz: 0, own: f, ang, life: 2.2, dmg: w.dmg * ad.admg * (.8 + .4 * charge), pen: 1 - (1 - (w.pen || 0)) * (1 - ad.apen), bleed: ad.ableed };
    if (me) s.vz = Math.tan(P.pitch + rand(-sp, sp)) * v * S;
    else { const d = Math.hypot(P.x - f.x, P.y - f.y), t = d / v, th = (P.crouch ? .8 : 1.15) + rand(-.35, .45) * (1.3 - f.E.skill); s.vz = (th - s.z) / t + 2.5 * t; }     // aimed to arrive at chest height
    R.shots.push(s); G.gfx.arrowAdd(s); sfxAt(w.xbow ? 'twang' : 'arrow', f, .8, true); if (R.net) G.net.shot(s);
  };
  X.throwStone = function () {
    const R = X.R, P = X.P; if (P.stoneCd > 0 || P.atk || P.use || P.busy || P.dead) return;
    P.stoneCd = 1.6; const v = 170;
    const s = { kind: 'stone', x: P.x + Math.cos(P.ang) * 8, y: P.y + Math.sin(P.ang) * 8, z: P.crouch ? 1 : 1.5, vx: Math.cos(P.ang) * v, vy: Math.sin(P.ang) * v, vz: Math.tan(clamp(P.pitch + .3, -.5, .9)) * v * S, own: P, ang: P.ang, life: 4 };
    R.shots.push(s); G.gfx.arrowAdd(s); G.gfx.punch(.5); G.sfx('swing', .3); if (R.net) G.net.shot(s);
  };
  // The weapon at your belt, thrown at what you are looking at. It flies flat and fast, hits as hard as a good blow
  // with it (harder on a man who has not seen you), and lies where it lands for you to pick up again.
  X.throwSide = function () {
    const R = X.R, P = X.P; if (P.stoneCd > 0 || P.atk || P.use || P.busy || P.dead) return;
    const it = P.eq.side; if (!it) return X.throwStone();
    const d = I[it.id], v = 330; P.eq.side = null; P.stoneCd = 1.2; G.raid.gearChanged(); X.spend(P, 8);
    const s = { kind: 'arrow', x: P.x + Math.cos(P.ang) * 9, y: P.y + Math.sin(P.ang) * 9, z: P.crouch ? 1 : 1.5, vx: Math.cos(P.ang) * v, vy: Math.sin(P.ang) * v, vz: Math.tan(clamp(P.pitch, -.7, .7)) * v * S + 1.3, own: P, ang: P.ang, life: 2.2, dmg: (d.dmg || 14) * 1.25, pen: d.pen || 0, bleed: 1, type: d.type || 'pierce', thrown: it };
    R.shots.push(s); G.gfx.arrowAdd(s); G.gfx.punch(.8); G.sfx('swing', .6, 0, { w: .8 }); if (R.net) G.net.shot(s); msg(`You throw the ${d.name.toLowerCase()}.`, 'dim', 1);
  };
  const landThrown = a => { const it = a.thrown; if (!it) return; a.thrown = null; if (a.ghost) return; if (X.R.net === 'client') G.net.send(['pd', Math.round(a.x), Math.round(a.y), it]); else G.raid.putDown(a.x, a.y, it, a.x, a.y); };
  X.updShots = function (dt) {
    const R = X.R, P = X.P, W = X.W;
    for (let i = R.shots.length - 1; i >= 0; i--) {
      const a = R.shots[i]; let gone = false; a.life -= dt;
      for (let s = 0; s < 3 && !gone; s++) {
        const h = dt / 3; a.x += a.vx * h; a.y += a.vy * h; a.vz -= (a.kind === 'stone' ? 9.8 : 5) * h; a.z += a.vz * h;
        if (a.z <= 0 || a.life <= 0 || W.shotPx(a.x, a.y)) {
          gone = true; if (a.thrown) { a.x -= a.vx * h; a.y -= a.vy * h; landThrown(a); }
          if (a.kind === 'stone') { sfxAt('stone', a, .9, true); if (!a.ghost) X.noise(a.x, a.y, 230, true); } else if (a.life > 0) sfxAt('thunk', a, .6, true);
          break;
        }
        if (a.kind === 'stone') continue;
        // a.ghost: a friend's arrow, shown here but settled on their machine. An arrow that reaches someone whose hurt is
        // not this machine's to settle simply stops there.
        if (R.net) { let stop = false; for (const o of R.fighters) { if (o === a.own || o === P || o.dead || !(a.ghost ? o.ai || o.remote : o.remote) || Math.hypot(o.x - a.x, o.y - a.y) > o.r + 2 || a.z > (o.E.quad ? o.E.quad.h + .3 : 1.85)) continue; stop = true; break; } if (stop) { gone = true; landThrown(a); break; } }
        for (const o of (a.ghost ? [] : a.own === P ? R.fighters : (a.own && a.own.ai && a.own.ai.foe ? [a.own.ai.foe] : []).concat(P.dead || P.gone ? [] : [P]))) {
          if (o === a.own || o.dead || o.remote || Math.hypot(o.x - a.x, o.y - a.y) > o.r + 2) continue;
          const top = o.E.quad ? o.E.quad.h + .3 : (o === P && P.crouch ? 1.25 : 1.85); if (a.z > top) continue;
          let zone;
          if (o.E.quad) { const r = Math.random(); zone = r < .22 ? 'head' : r < .72 ? 'thorax' : 'stomach'; }
          else { const z = a.z * (o === P && P.crouch ? 1.45 : 1), side = Math.random() < .5 ? 'l' : 'r'; zone = z >= 1.47 ? 'head' : z >= 1.08 ? (Math.random() < .24 ? side + 'arm' : 'thorax') : z >= .82 ? (Math.random() < .2 ? side + 'arm' : 'stomach') : side + 'leg'; }
          X.resolve(a.own, o, a.dmg, a.type || 'pierce', a.ang + Math.PI, { zone, pen: a.pen, arrow: true, bolt: a.kind === 'bolt', bleed: a.bleed, skill: a.thrown ? 'blades' : 'archery' }); landThrown(a); gone = true; break;
        }
        // a shaft that was not yours going past your ear
        if (!gone && !a.whiz && a.own !== P && !R.ghost && Math.hypot(a.x - P.x, a.y - P.y) < 26) { a.whiz = 1; G.sfx('flyby', .9, Math.sin(angDiff(a.ang, P.ang)) * .8); }
      }
      if (gone) { G.gfx.arrowDel(a); R.shots.splice(i, 1); }
    }
  };
  X.dodge = function (f, dx, dy) {
    if (f.stagger > 0 || f.stam < 15 || f.dodgeCd > 0 || f.dead) return;
    const c = 20 * (2 - f.lf); spend(f, c); if (f === X.P) G.addSkill('vigor', c * .03);
    if (f.atk && f.atk.phase === 'windup') f.atk = null; f.use = null; f.busy = null;
    const s = [235, 170, 130][X.legsBad(f)] * f.lf; f.kx = dx * s; f.ky = dy * s; f.iframes = .3; f.dodgeCd = .6; sfxAt('swing', f, .3);
  };
  // a kick or shove: no real hurt, but it breaks a guard and buys room. Used by the player and by sergeants.
  X.kick = function (f) {
    const R = X.R, P = X.P, me = f === P;
    if ((f.kickCd || 0) > 0 || f.atk || f.stagger > 0 || f.stam < 12 || f.use || f.busy || f.dead) return;
    spend(f, 14); f.kickCd = me ? .9 : 3; f.kickT = .35; if (me) G.gfx.punch(1); sfxAt('swing', f, .6); X.noise(f.x, f.y, 120);
    let best = null, bd = 30; const T = me ? null : (f.ai && f.ai.tgt) || P;
    for (const o of (me ? R.fighters : [T])) { if (o === f || o.dead || o.gone || (me && o.remote)) continue; const dx = o.x - f.x, dy = o.y - f.y, d = Math.hypot(dx, dy) - o.r; if (d < bd && Math.abs(angDiff(Math.atan2(dy, dx), f.ang)) < .7) { bd = d; best = o; } }
    if (!best) return;
    if (me && best.pup) return G.net.send(['kk', best.id]);                                  // the host says what it did to him
    if (best.remote) return G.net.toPlayer(best, ['kd', f.id, +f.ang.toFixed(3)]);           // their own machine says what it did to them
    X.kicked(f, best);
  };
  // what a kick does to the one it lands on. f: who kicked.
  X.kicked = function (f, o) {
    const R = X.R, P = X.P, me = isP(f), mine = o === P;
    if (o.iframes > 0) return;
    sfxAt('thud', o, 1); X.say(o, 'oof', .9); if (mine) R.shake = 4; else jolt(f, 4); o.kx += Math.cos(f.ang) * 150; o.ky += Math.sin(f.ang) * 150; o.atk = null; o.use = null; o.busy = null; hurt(o, 'stomach', 3);
    if (o.blocking) { o.blocking = false; if (o.ai) o.ai.blockUntil = 0; o.stagger = Math.max(o.stagger, .95); spend(o, 30); if (me) tell(f, `You kick through ${nm(o)}'s guard. He is open.`, 'good'); else msg(`${nm(f, 1)} kicks your guard aside!`, 'bad'); }
    else { o.stagger = Math.max(o.stagger, .4); if (me) tell(f, `You shove ${nm(o)} back.`, 'dim', 1); else msg(`${nm(f, 1)} kicks you back.`, 'bad', 1); }
    if (f === P && o.ai && X.neutral(o)) { R.banditsHostile = true; msg('The hill-folk will not leave a gleaner alone now.', 'bad'); }
    if (me) o.hitBy = f;
    if (o.ai && o.ai.state !== 'combat') X.alert(o, false, me ? f : null);
    if (fallen(o)) X.die(o, f, {});
  };

  // ------------------------------------------------------------------ treating yourself, eating, sharpening
  const vital = z => z === 'head' || z === 'thorax' ? .7 : 1;      // the head and chest are seen to first
  const worstOf = (P, list) => list.sort((a, b) => P.hp[a] / P.max[a] * vital(a) - P.hp[b] / P.max[b] * vital(b))[0];
  X.canUse = function (it) {
    const P = X.P, d = I[it.id], fx = d.fx || {}, b = X.bleeds(P);
    if (d.cat === 'food') return d.raw ? 'It needs cooking. Take it home.' : null;
    if (d.id === 'whetstone') { const w = P.eq.weapon; return !w || w.dur == null || I[w.id].ranged ? 'Nothing to sharpen.' : w.dur > .97 ? 'The edge is already good.' : null; }
    if (fx.bleed) return b[0] || b[1] ? null : 'You are not bleeding.';
    if (fx.heavy) return b[1] || b[0] ? null : 'You are not bleeding.';
    if (fx.heal) return ZN.some(z => P.hp[z] > 0 && P.hp[z] < P.max[z] - .5) ? null : 'Nothing a poultice can mend.';
    if (fx.frac) return LIMBS.some(z => P.frac[z]) ? null : 'Nothing is broken.';
    if (fx.surgery) return ['stomach', ...LIMBS].some(z => P.hp[z] <= 0) ? null : 'No limb needs the needle.';
    if (fx.pain) return null;
    return 'You cannot use that here.';
  };
  X.useItem = function (it, c) {
    const R = X.R, P = X.P, d = I[it.id]; if (!R || P.use || P.dead || P.stagger > 0) return false;
    const why = X.canUse(it); if (why) { msg(why, 'dim', 2); return false; }
    P.atk = null; P.busy = null;
    const dur = d.use * (d.cat === 'med' ? 1 - .03 * sk('leechcraft') : 1);
    P.use = { it, c, t: 0, dur, name: d.name }; G.sfx(d.cat === 'food' ? (d.hydr > 10 ? 'drink' : 'eat') : d.id === 'whetstone' ? 'whet' : 'cloth', .7);
    return true;
  };
  X.applyUse = function (u) {
    const P = X.P, it = u.it, d = I[it.id], fx = d.fx || {}; let spent = 1;
    if (d.cat === 'food') { P.energy = Math.min(100, P.energy + d.energy); P.hydr = clamp(P.hydr + d.hydr, 0, 100); msg(d.hydr > 10 ? 'You drink.' : 'You eat.'); }
    if (d.id === 'whetstone') { const w = P.eq.weapon; if (w) w.dur = Math.min(1, w.dur + .3); msg('The edge comes back.', 'good'); }
    if (fx.bleed) {
      const z = ZN.filter(z => P.lb[z] > 0).sort((a, b) => P.lb[b] - P.lb[a])[0], hz = ZN.find(z => P.hb[z]);
      if (z) { P.lb[z] = 0; msg(`You bind your ${ZNAME[z]}.` + (X.bleeds(P)[0] + X.bleeds(P)[1] ? ' You are still bleeding elsewhere.' : ' The bleeding stops.'), 'good'); }
      else if (hz) { P.hb[hz] = false; P.lb[hz] = 2; msg(`Linen will not stop a wound like the one in your ${ZNAME[hz]}. It slows it. It wants a ligature.`, 'bad'); }      // a bandage only slows a heavy bleed
    }
    if (fx.heavy) { const z = ZN.find(z => P.hb[z]) || ZN.find(z => P.lb[z] > 0); if (z) { P.hb[z] = false; P.lb[z] = 0; msg(`You twist the ligature tight on your ${ZNAME[z]}.`, 'good'); } }
    if (fx.heal) {
      let pool = Math.min(it.u, 35 * (1 + .02 * sk('leechcraft'))), used = 0;
      for (let g = 0; g < 8 && pool > .5; g++) { const zs = ZN.filter(z => P.hp[z] > 0 && P.hp[z] < P.max[z] - .5); if (!zs.length) break; const z = worstOf(P, zs), amt = Math.min(pool, P.max[z] - P.hp[z]); P.hp[z] += amt; pool -= amt; used += amt; }
      spent = Math.max(1, Math.round(used / (1 + .02 * sk('leechcraft')))); msg('It burns, then eases.', 'good');
    }
    if (fx.frac) { const z = LIMBS.find(z => P.frac[z]); if (z) { P.frac[z] = false; msg(`You set your ${ZNAME[z]} and bind it tight.`, 'good'); } }
    if (fx.surgery) { const z = ['stomach', 'lleg', 'rleg', 'rarm', 'larm'].find(z => P.hp[z] <= 0); if (z) { P.max[z] = Math.round(P.max[z] * .85); P.hp[z] = 1; P.frac[z] = false; msg(`You sew your ${ZNAME[z]} back into use. It will never be what it was today.`, 'good'); } }
    if (fx.pain) { P.numb = Math.max(P.numb, fx.pain); msg('The pain goes somewhere far away.'); }
    if (fx.stam) P.ale = Math.max(P.ale, fx.stam);
    if (d.cat === 'med') { G.addSkill('leechcraft', 4); X.R.xp.heal += 4; }
    if (it.u != null) { it.u -= spent; if (it.u <= 0) G.inv.remove(u.c, it); } else G.useUp(it, u.c);
  };
  // H: treat whatever is worst with whatever you carry
  X.quickHeal = function () {
    const P = X.P, b = X.bleeds(P), order = [];
    if (b[1]) order.push(2, 1); if (b[0]) order.push(1, 2);
    if (LIMBS.some(z => P.frac[z])) order.push(4);
    if (['stomach', ...LIMBS].some(z => P.hp[z] <= 0)) order.push(5);
    if (ZN.some(z => P.hp[z] > 0 && P.hp[z] < P.max[z] * .8)) order.push(3);
    if (X.inPain(P)) order.push(6);
    for (const k of order) for (const c of G.carried()) for (const o of c.items) if (I[o.it.id].key === k && !X.canUse(o.it)) return X.useItem(o.it, c);
    msg(order.length ? 'You carry nothing that will help.' : 'You need no treating.', 'dim', 2);
  };
  X.quickUse = function (key) {
    const P = X.P; let fallback = null;
    for (const c of G.carried()) for (const o of c.items) { if (I[o.it.id].key !== key) continue; if (!X.canUse(o.it)) return X.useItem(o.it, c); fallback = fallback || o.it; }
    if (fallback) msg(X.canUse(fallback), 'dim', 2);
  };
})();
