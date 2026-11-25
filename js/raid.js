'use strict';
// The raid, part 3: going up and coming back, the frame loop, the player's own control, doors, searching,
// the ways out, the HUD and input.
(function () {
  const X = G.rx, T = G.T, I = G.ITEMS, TL = G.TILE, rand = G.rand, clamp = G.clamp, lerp = G.lerp, angDiff = G.angDiff;
  const ZN = G.ZONES, BASE = G.BASEHP, ZNAME = G.ZNAME, WALK = X.WALK, msg = X.msg, sk = X.sk;
  const cv = document.getElementById('cv'), hud = document.getElementById('hud'), hx = hud.getContext('2d');
  const keys = {}, mouse = { r: false, x: null, y: null };
  let last = 0, locked = false, grainC = null, filterNow = '', bg = false;      // bg: the drawing loop is starved and a worker's clock is moving the world
  // the HUD is drawn at up to twice the page's resolution so text stays sharp on dense screens
  const sizeHud = () => { const k = hud._k = Math.min(2, window.devicePixelRatio || 1); hud.width = Math.round(innerWidth * k); hud.height = Math.round(innerHeight * k); };
  const WX = {
    overcast: { name: 'Overcast', rain: 0, fog: 1, sun: .8, hear: 1 }, rain: { name: 'Rain', rain: .7, fog: 1.15, sun: .55, hear: .8 },
    storm: { name: 'Storm', rain: 1, fog: 1.3, sun: .4, hear: .62, storm: true }, fog: { name: 'Fog', rain: .08, fog: 2.1, sun: .5, hear: 1 }, clear: { name: 'Clear', rain: 0, fog: .8, sun: 1.25, hear: 1.05 }
  };

  // ------------------------------------------------------------------ going up
  function start(opts) {
    // opts.net (see net.js): going up with friends. { role: 'host' | 'client', seed, day, wx, slot }
    const s = G.save, M = G.mapById(opts.map), net = opts.net || null, gle = !!opts.gleaner && !net;
    G.me = gle ? G.mkGleaner() : s; G.skillUps.length = 0;
    if (gle) s.stats.gleans++; else { s.inRaid = true; s.stats.raids++; s.note = null; }
    G.persist();
    // with friends the place is rolled from the host's seed and the host's count of days, so it is the same for everyone
    const W = X.W = G.genWorld({ map: M.id, start: opts.start, day: net ? net.day : s.day, seed: net ? net.seed : undefined });
    const wxId = net ? net.wx : G.dayWeather(M.id, s.day), wx = Object.assign({ id: wxId }, G.WEATHER[wxId]);
    G.gfx.init(cv); G.gfx.setWeather(wx); G.gfx.build(W);
    W.containers.forEach((c, i) => { c.id = i; });      // every machine counts them in the same order, so the number names the chest
    // net: null alone, else 'host' or 'client'. players: you, and on the host your friends too (whom the enemies may mark).
    // ghost: you are out, but friends are still up there and this machine must go on moving the world for them.
    const R = X.R = { net: net ? net.role : null, players: [], nextId: 1, lootSeq: W.containers.length, ghost: false, asking: null, map: M, time: 0, total: M.minutes * 60, fighters: [], loot: W.containers.slice(), shots: [], msgs: [], pop: [], shake: 0, slow: 0, hurt: 0, over: false, paused: false, menu: false, kills: [], xp: { kill: 0, loot: 0, explore: 0, heal: 0 }, startValue: G.carriedValue(), extT: 0, dusk: 0, ui: false, near: null, nearDoor: null, deathT: 0, cause: '', hint: 25, wx, gleaner: gle, banditsHostile: false, had: new Set(G.allCarried(true)), card: 5, thunder: rand(20, 60), heart: 0, seenZones: {}, zone: null, zoneCard: null, waves: W.waves.slice(), sneak: 0, held: false, lateSaid: {}, exitBlock: '', exitZone: null };
    // friends come in side by side
    let sx = W.start.x, sy = W.start.y; if (net) { const o = [[0, 0], [24, 0], [-24, 0], [0, 24]][net.slot & 3]; if (!X.boxSolid(sx + o[0], sy + o[1], 6)) { sx += o[0]; sy += o[1]; } }
    const P = X.P = X.mkF({ name: 'you', hp: 1, speed: 1, skill: 1, faction: 'you' }, sx, sy);
    P.eq = G.me.eq; P.pitch = 0; P.ang = Math.atan2(M.hub[1] * T - P.y, M.hub[0] * T - P.x); P.crouch = false; P.sprint = false; P.use = null; P.busy = null;
    P.buf = 0; P.comboT = 0; P.riposte = 0; P.swing = 1; P.kickCd = 0; P.stoneCd = 0; P.lean = 0; P.pain = false; P.exhaust = false; P.inBush = false;
    const hard = 1 + .01 * sk('hardiness');
    for (const z of ZN) { P.max[z] = BASE[z] * hard; P.hp[z] = gle ? P.max[z] : Math.max(P.max[z] * .12, P.max[z] * s.hp[z]); }
    P.energy = gle ? 80 : s.energy; P.hydr = gle ? 80 : s.hydr; P.maxStam = 100 + 1.5 * sk('vigor'); P.stam = P.maxStam;
    R.fighters.push(P); R.players.push(P); R.freed = R.spared = 0; R.nearMan = null; R.event = 'none'; R.wx0 = Object.assign({}, wx); R.wxSeed = ((net ? net.day : s.day) * 7.31 + M.seed % 5) % 6.28; R.hits = []; R.marks = []; R.trail = [[Math.round(P.x), Math.round(P.y)]]; R.trailT = 0;
    if (R.net !== 'client') {      // on a friend's machine the enemies are the host's, and arrive from there
      const by = new Map(); for (const sp of W.spawns) by.set(sp, X.addEnemy(sp));
      for (const [sp, f] of by) if (sp.follow && by.get(sp.follow)) f.ai.leader = by.get(sp.follow);
      X.populate(net ? net.day : s.day);      // captives, and whatever else the day has brought
      X.directorStart();      // and from here on everyone up there has an errand (see the director in raid-ai.js)
    }
    if (net) G.net.begun(net);
    gear(); G.U.hideCtx(); document.getElementById('tip').classList.add('hidden');
    document.body.classList.add('raid'); sizeHud(); ambT = 0; G.sting('begin');
    msg(`${M.name}, day ${s.day}. ${wx.name}. Dark falls in ${M.minutes} minutes.`);
    msg('Ways out: ' + W.extracts.filter(e => !e.late).map(e => e.name + (e.dir ? ' (' + e.dir + ')' : '')).join(', ') + '. Hold O to see them all.');
    { const ev = G.EVENTS[gle ? 'none' : G.dayEvent(M.id, net ? net.day : s.day)]; if (ev[0]) msg(`Word from the hills: ${ev[0].toLowerCase()}. ${ev[1]}`); }
    if (gle) msg('You go up as a gleaner, with what little you have. The hill bandits will leave you be unless you give them cause.', 'good');
    else { if (s.starving) msg('You have not eaten. Your wind is short today.', 'bad'); if (ZN.some(z => P.hp[z] < P.max[z] * .7)) msg('Yesterday\'s wounds have not closed.', 'bad'); }
    for (const k in keys) keys[k] = false; mouse.r = false;
    lock(); setTimeout(noCapture, 600);
    last = performance.now(); requestAnimationFrame(loop);
  }
  function gear() { const P = X.P, h = P.eq.head && I[P.eq.head.id]; P.hearMul = h && h.hear ? h.hear : 1; P.visor = h && h.closed ? h.closed : 0; P.rattle = X.rattleOf(P.eq); P.vs = .37; G.gfx.setView(P.eq); if (X.R && X.R.net) G.net.kit(); }
  function lock() { try { const p = cv.requestPointerLock(); if (p && p.catch) p.catch(() => { }); } catch (e) { } }

  // ------------------------------------------------------------------ coming back, or not
  // cut: the link to the host was lost. You keep what you carry and find your own way down, with nothing for the getting out.
  function finish(outcome, cut) {
    const R = X.R, P = X.P, W = X.W; if (!R || R.over) return;
    if (G.ui.lootOpen()) G.ui.closeLoot();      // let go of whatever you had your hands in, so a friend may search it
    R.over = true; G.amb(null); G.sting(outcome === 'extract' ? 'out' : 'dead');
    if (R.net) G.net.left(outcome);
    const s = G.save, gle = R.gleaner, tier = W.tier, out = outcome === 'extract', found = [];
    if (document.pointerLockElement) document.exitPointerLock();
    const info = { cut: !!cut, outcome, cause: R.cause, kills: R.kills, time: R.time, map: R.map.name, gleaner: gle, dayNo: s.day, found: [], xp: [], xpTotal: 0, levels: 0, ups: [], insured: 0, coins: 0, exit: R.exitZone ? R.exitZone.name : '', night: null, value: 0 };
    if (out) for (const it of G.allCarried(true)) { it.ins = undefined; if (!R.had.has(it)) { it.fir = true; found.push(it); } }
    info.found = found.filter(it => it.id !== 'coin');
    const foundVal = found.reduce((v, it) => v + I[it.id].value * (it.n || 1), 0);
    if (gle) {
      if (out) { info.coins = G.bankCoins(G.carried()); const m = G.me; for (const k of G.SLOTS) if (m.eq[k]) G.toStash(m.eq[k]); for (const o of m.pockets.items) G.toStash(o.it); info.value = Math.round(foundVal); }
      s.gleanDay = s.day + (s.up.perch ? 2 : 3); G.me = s; G.persist();
    } else {
      const hard = 1 + .01 * sk('hardiness');
      for (const z of ZN) s.hp[z] = clamp(P.hp[z] / (BASE[z] * hard), 0, 1);
      s.energy = Math.round(P.energy); s.hydr = Math.round(P.hydr); s.inRaid = false;
      const add = (label, n) => { n = Math.round(n); if (n > 0) { info.xp.push([label, n]); info.xpTotal += n; } };
      add('Kills', R.xp.kill); add('Searching', R.xp.loot); add('Ground covered', R.xp.explore); add('Wounds treated', R.xp.heal);
      // those you cut loose count once you are down yourself; they follow you to the Hollow
      if (out && R.freed) { add('Our own, cut loose', 150 * tier * R.freed); s.stats.freed = (s.stats.freed || 0) + R.freed; s.folk = (s.folk || 0) + R.freed; G.log(R.freed > 1 ? `Brought ${R.freed} of ours down from ${R.map.name}.` : `Brought one of ours down from ${R.map.name}.`); }
      if (R.spared) s.stats.spared = (s.stats.spared || 0) + R.spared;
      if (out) { if (!cut) add('Came out alive', 120 * tier); add('What you carried out', foundVal * .1); }
      else { const cut = Math.round(info.xpTotal * .3); if (cut) { info.xp.push(['Died in the ruins', -cut]); info.xpTotal -= cut; } }
      info.levels = G.addXP(info.xpTotal);
      if (out) {
        if (!cut) { s.stats.survived++; s.stats.maps[W.id] = (s.stats.maps[W.id] || 0) + 1; G.taskEvent('extract', { map: W.id }); }
        info.coins = G.bankCoins(G.carried());
        if (R.exitZone && R.exitZone.cost && !cut) { s.coin = Math.max(0, s.coin - R.exitZone.cost); info.paid = R.exitZone.cost; }
        info.value = G.carriedValue() + info.coins - R.startValue - (info.paid || 0);
      } else { s.stats.deaths++; info.insured = G.claimInsurance(tier, !!(R.killer && R.killer.E.faction === 'beast')); G.loseCarried(); }
      info.ups = G.skillUps.splice(0);
      s.history.push({ day: s.day, map: W.id, out: outcome, cut: !!cut, min: Math.round(R.time / 60), kills: R.kills.length, val: Math.round(info.value || 0), with: R.net ? G.net.names() : '' }); if (s.history.length > 20) s.history.shift();
      info.night = G.endDay(outcome, { mapName: R.map.name });
    }
    info.route = { map: W.id, trail: R.trail.concat([[Math.round(P.x), Math.round(P.y)]]), marks: R.marks };
    G.ui.pauseMenu(false); cv.style.filter = ''; filterNow = ''; document.body.classList.remove('raid');

    // The world is in the host's machine. If the host is out while friends are still up there, it must go on turning for
    // them: the reckoning is shown, but the way back to the Hollow stays shut until they are down too.
    if (R.net === 'host' && !cut && G.net.anyUp()) { R.ghost = true; P.gone = true; info.waiting = true; }
    else { X.R = null; if (R.net) G.net.over(); }
    G.ui.result(info);
  }
  function endGhost() { const R = X.R; if (!R || !R.ghost) return; X.R = null; G.net.over(); G.ui.resultReady(); }

  // ------------------------------------------------------------------ everyone, every frame
  function stepF(f, dt) {
    const P = X.P, W = X.W, me = f === P;
    if (f.stagger > 0) { f.stagger -= dt; f.mvx *= .15; f.mvy *= .15; f.blocking = false; }
    if (f.iframes > 0) f.iframes -= dt; if (f.dodgeCd > 0) f.dodgeCd -= dt; if (f.kickT > 0) f.kickT -= dt; if (f.kickCd > 0) f.kickCd -= dt;
    if (f.numb > 0) f.numb -= dt; if (f.ale > 0) f.ale -= dt;
    X.updAttack(f, dt);
    if (f.stamDelay > 0) f.stamDelay -= dt;
    else { let r = 17 * f.lf * (f.blocking ? .35 : 1) * (f.ale > 0 ? 1.5 : 1); if (me) r *= (1 + .02 * sk('vigor')) * (P.energy < 25 ? .7 : 1) * (P.hydr < 25 ? .7 : 1) * (P.pain ? .85 : 1); f.stam = Math.min(f.maxStam, f.stam + r * dt); }
    // bleeding
    const bm = me ? 1 - .015 * sk('hardiness') : 1; let bl = 0;
    for (const z of ZN) {
      if (f.lb[z] > 0) { X.hurt(f, z, .3 * f.lb[z] * bm * dt); bl += f.lb[z]; if (f.ai && Math.random() < dt * .06) f.lb[z]--; }
      if (f.hb[z]) { X.hurt(f, z, 1.05 * bm * dt); bl += 3; if (f.ai && Math.random() < dt * .025) f.hb[z] = false; }
    }
    if (bl) { f.dripT -= dt; if (f.dripT <= 0) { f.dripT = rand(.5, 1.2) / bl; G.gfx.decal(f.x, f.y, 2.5); } if (f.hp.head <= 0 || f.hp.thorax <= 0) { X.die(f, null, {}); return; } }
    const sm = W.speedAt(f.x, f.y), vx = (f.mvx + f.kx) * sm, vy = (f.mvy + f.ky) * sm;
    X.move(f, vx * dt, vy * dt); const k = Math.exp(-9 * dt); f.kx *= k; f.ky *= k;
    // wells, carts, chests and the like are solid: slide round them
    const tx = Math.floor(f.x / T), ty = Math.floor(f.y / T);
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
      const l = W.bgrid[tx + ox + (ty + oy) * W.w]; if (!l) continue;
      for (const b of l) { const dx = f.x - b.x, dy = f.y - b.y, d = Math.hypot(dx, dy), m = b.r + f.r - 1; if (d < m && d > .01) X.move(f, dx / d * (m - d), dy / d * (m - d)); }
    }
    if (f.ai) {      // footfalls you can hear, and place
      const sp = Math.hypot(f.mvx, f.mvy); f.stepD += sp * dt;
      if (f.stepD > 26) { f.stepD = 0; const d = Math.hypot(f.x - P.x, f.y - P.y); if (d < 680 && sp > 9) X.sfxAt('step', f, (sp > 60 ? 1.9 : 1.15) * (f.E.quad ? .55 : 1), true, { surf: X.surfAt(f.x, f.y), kit: f.rattle }); }
      drawTell(f);
    }
  }
  // the creak of a bow being bent at you: fair warning, if you are listening for it
  function drawTell(f) {
    const a = f.ai, w = f.eq.weapon && I[f.eq.weapon.id], on = !!(a && a.draw > 0 && !a.melee && f.E.archer && w && !w.xbow);
    if (on && !f.aimed) X.sfxAt('draw', f, .8, true); f.aimed = on;
  }
  // A fighter moved from another machine (a friend, or on a friend's machine an enemy): ease him toward where he was last
  // said to be, and keep his own clocks running. An enemy's blow is played out here so that it can land on you.
  function stepNet(f, dt) {
    const P = X.P, W = X.W;
    if (f.stagger > 0) f.stagger -= dt; if (f.kickT > 0) f.kickT -= dt;
    if (f.pup) X.updAttack(f, dt); else if (f.atk) f.atk.t += dt;
    const k = Math.min(1, dt * 12), ox = f.x, oy = f.y;
    if (Math.hypot(f.nx - f.x, f.ny - f.y) > 160) { f.x = f.nx; f.y = f.ny; } else { f.x += (f.nx - f.x) * k; f.y += (f.ny - f.y) * k; }
    f.ang += angDiff(f.na, f.ang) * Math.min(1, dt * 14);
    const iv = 1 / Math.max(dt, .004), vx = (f.x - ox) * iv, vy = (f.y - oy) * iv; f.mvx = Math.abs(vx) < 400 ? vx : 0; f.mvy = Math.abs(vy) < 400 ? vy : 0;
    if (f.blocking) f.blockT += dt; else f.blockT = 0;
    const sp = Math.hypot(f.mvx, f.mvy); f.stepD += sp * dt;
    if (f.stepD > 26) { f.stepD = 0; const d = Math.hypot(f.x - P.x, f.y - P.y); if (d < 680 && sp > 9 && !f.crouch) X.sfxAt('step', f, (sp > 60 ? 1.9 : 1.15) * (f.E.quad ? .55 : 1), true, { surf: X.surfAt(f.x, f.y), kit: f.rattle }); }
    if (f.pup) drawTell(f);
  }
  function updPlayer(dt) {
    const R = X.R, P = X.P, W = X.W, p = P;
    p.lf = clamp(1 - Math.max(0, G.weight() - (14 + sk('might'))) / 70, .6, 1); p.pain = X.inPain(p);
    if (p.comboT > 0 && !p.atk) p.comboT -= dt; if (p.riposte > 0) p.riposte -= dt; if (p.stoneCd > 0) p.stoneCd -= dt;
    if (p.buf > 0) { p.buf -= dt; if (!p.atk && p.stagger <= 0 && !R.ui && X.startAttack(p)) p.buf = 0; }      // a click during recovery is remembered
    let mx = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0), my = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0); const ml = Math.hypot(mx, my); if (ml > 1) { mx /= ml; my /= ml; }
    // keyboard and screen-edge turning (the latter only when the mouse is not captured); leaning
    let tr = (keys.ArrowRight ? 1 : 0) - (keys.ArrowLeft ? 1 : 0); const tp = (keys.ArrowUp ? 1 : 0) - (keys.ArrowDown ? 1 : 0);
    if (!locked && !R.ui && mouse.x != null) { const ex = mouse.x / innerWidth; if (ex < .1) tr -= (.1 - ex) * 10; else if (ex > .9) tr += (ex - .9) * 10; }
    p.ang += tr * 2.6 * dt; p.pitch = clamp(p.pitch + tp * 1.5 * dt, -1.2, 1.2);
    p.lean = 0;      // (leaning is gone: Q throws and E uses)
    const c = Math.cos(p.ang), s = Math.sin(p.ang), wx = c * mx - s * my, wy = s * mx + c * my, lb = X.legsBad(p);
    if (p.stam <= 0) { p.exhaust = true; X.tip('wind', 'You are winded: no sprinting, weak blows, and a guard that breaks. Back off and let your wind return. A heavy load makes it slower.'); } if (p.stam > 25) p.exhaust = false;
    let sp = WALK * p.lf * [1, .72, .5][lb];
    p.limp = lb ? 1 : 0; if (lb && (mx || my)) { p.limpT = (p.limpT || 0) + dt * 5.5; sp *= .68 + .32 * Math.abs(Math.sin(p.limpT)); }
    p.sprint = !!(keys.ShiftLeft && ml && mx > 0 && !p.atk && !p.blocking && !p.use && !p.busy && !lb && !p.exhaust && p.stagger <= 0 && !p.lean);
    if (p.sprint) { sp *= 1.6; const cost = 12 * dt * (2 - p.lf); X.spend(p, cost); G.addSkill('vigor', cost * .03); p.crouch = false; } else if (p.crouch) sp *= .5;
    if (mx < 0) sp *= .75; if (p.lean) sp *= .6;
    if (p.blocking) sp *= .55; if (p.atk) sp *= .6; if (p.use || p.busy) sp *= .4;
    p.mvx = wx * sp; p.mvy = wy * sp;
    const was = p.blocking;
    { const want = mouse.r && !p.atk && p.stagger <= 0 && !R.ui && !p.use && !p.busy, bad = !(p.numb > 0) && (p.hp.larm <= 0 || p.frac.larm); p.guardT = want ? (p.guardT || 0) + dt : 0; p.blocking = want && p.guardT >= (bad ? .15 : .1); }      // the guard takes a moment to come up; half as long again on a ruined left arm
    if (p.blocking) { if (!was) p.blockT = p.blockDown < .3 ? 1 : 0; else p.blockT += dt; p.blockDown = 0; } else p.blockDown += dt;
    if (p.atk && p.atk.phase === 'windup' && mouse.r && !R.ui && !p.atk.w.ranged) { p.atk = null; X.spend(p, 4); }   // feint
    if (p.use) { p.use.t += dt; if (p.use.t >= p.use.dur) { const u = p.use; p.use = null; X.applyUse(u); gearSoft(); G.ui.refresh(); } }
    if (p.busy) { p.busy.t += dt; if (p.busy.t >= p.busy.dur) { const b = p.busy; p.busy = null; b.done(); } }
    // hunger and thirst
    const gut = p.hp.stomach <= 0 ? 3 : 1, hb = X.bleeds(p)[1] ? 2 : 1, run = p.sprint ? 2 : 1;
    p.energy = Math.max(0, p.energy - .03 * dt * run * gut); p.hydr = Math.max(0, p.hydr - .042 * dt * run * gut * hb);
    if (p.energy <= 0 || p.hydr <= 0) { X.hurt(p, 'thorax', .14 * dt); if (p.hp.thorax <= 0) return X.die(p, null, {}); msg(p.hydr <= 0 ? 'You are parched to the point of falling. Drink something.' : 'You are faint with hunger. Eat something.', 'bad', 5.5); }
    if (ml) {
      p.stepD += sp * Math.min(1, ml) * dt;
      if (p.stepD > (p.sprint ? 30 : 24)) { p.stepD = 0; const wet = W.tileAt(p.x, p.y) === TL.WATER; X.noise(p.x, p.y, (p.sprint ? 250 : p.crouch ? 22 : 100) * (2 - p.lf) * (wet ? 1.4 : 1) * (1 - .02 * sk('fieldcraft'))); G.sfx('step', p.crouch ? .25 : p.sprint ? 1 : .6, 0, { surf: X.surfAt(p.x, p.y), kit: p.crouch ? null : p.rattle }); }
      if (G.weight() > 28) G.addSkill('might', dt * .03);
    } else R.sneak = 0;
    if (R.sneak > 2) { G.addSkill('fieldcraft', R.sneak * .35); R.sneak = 0; }
    p.inBush = W.tileAt(p.x, p.y) === TL.BUSH || W.tileAt(p.x, p.y) === TL.REED;
  }
  function gearSoft() { const P = X.P, h = P.eq.head && I[P.eq.head.id]; P.hearMul = h && h.hear ? h.hear : 1; P.visor = h && h.closed ? h.closed : 0; }
  // cutting a captive loose, or sending off a man who has yielded: a moment's work, and the host settles it
  function manAct(f) {
    const R = X.R, P = X.P, cap = !!f.E.captive;
    P.atk = null; P.use = null; P.busy = { t: 0, dur: cap ? 2.4 : 1.2, label: cap ? 'Cutting the ropes' : 'Sending him off', done() { if (f.dead || f.left) return; G.sfx('cloth', .6); if (R.net === 'client') G.net.send(['iv', f.id]); else X.freeMan(f, P); } };
  }
  function interact() {
    const R = X.R, P = X.P, W = X.W; if (G.ui.lootOpen()) return G.ui.closeLoot();
    if (R.nearMan && !P.busy) return manAct(R.nearMan);
    const d = R.nearDoor, c = R.near;
    const unlock = (key, name, done) => {
      if (!G.hasKey(key)) return msg(`Locked. It wants the ${I[key].name}.`, 'dim', 2);
      P.atk = null; P.use = null; P.busy = { t: 0, dur: 2.2, label: 'Unlocking ' + name, done() { G.sfx('lock'); R.xp.explore += 40; R.pop.push({ text: '+40  unlocked', t: 3 }); msg(`The ${I[key].name.toLowerCase()} turns. ${G.cap(name)} is open.`, 'good'); done(); } };
    };
    if (d && (!c || d._d <= c._d)) return unlock(d.key, d.name, () => { W.openDoor(d); G.gfx.openDoor(d); if (R.net) G.net.door(d); });
    if (!c) return;
    if (c.key && !c.unlocked) return unlock(c.key, c.name.toLowerCase(), () => { c.unlocked = true; if (R.net) G.net.unlocked(c); });
    const open = () => { P.atk = null; G.ui.openLoot(c); G.sfx(/chest|coffer|crate|barrel|rack|armoury|toolbox|desk|dispensary|altar/.test(c.kind || '') ? 'open' : 'cloth', .6); X.tip('search', 'Things turn up one at a time as you search, and the world does not wait. R takes everything found so far; R also turns a thing you are dragging.'); };
    // with friends, what a chest or a body holds is in the host's keeping, and only one of you may have your hands in it at a time
    if (R.net) G.net.search(c, open); else open();
  }
  function dropItem(it) {
    const R = X.R, P = X.P, x = P.x + Math.cos(P.ang) * 12, y = P.y + Math.sin(P.ang) * 12;
    if (R.net === 'client') { G.net.send(['pd', Math.round(x), Math.round(y), it]); return true; }      // what lies on the ground is in the host's keeping
    return putDown(x, y, it, P.x, P.y);
  }
  // goods set on the ground: onto a heap already there, if it has room and nobody has their hands in it, else a new one
  function putDown(x, y, it, nx, ny) {
    const R = X.R; let pile = R.loot.find(l => l.kind === 'pile' && l.lock == null && Math.hypot(l.x - nx, l.y - ny) < 24 && G.inv.spot(l.c, it));
    if (!pile) pile = X.addLoot({ x, y, c: { w: 6, h: 6, items: [] }, name: 'Dropped goods', kind: 'pile', searched: true });
    return G.inv.add(pile.c, it);
  }

  function update(dt) {
    // host: this machine moves the enemies (always, when you go up alone). here: you are still up there yourself.
    const R = X.R, P = X.P, W = X.W, host = R.net !== 'client', here = !R.ghost, up = p => !p.dead && !p.gone;
    R.time += dt; R.dusk = Math.pow(clamp(R.time / R.total, 0, 1), 1.6);
    if (R.card > 0) R.card -= dt; if (R.zoneCard) { R.zoneCard.t -= dt; if (R.zoneCard.t <= 0) R.zoneCard = null; }
    if (host && R.dir) X.director(dt);
    // The sky does not hold still: rain comes on, slackens and comes again, by the clock everyone shares, so friends see
    // the same sky. A grey day may bring showers, a wet one a lull; a clear day stays clear.
    { const b = R.wx0, v = Math.sin(R.time / 97 + R.wxSeed) * .55 + Math.sin(R.time / 41 + R.wxSeed * 2.3) * .3, was = R.wx.rain;
      const r = b.id === 'clear' ? 0 : b.id === 'overcast' ? clamp(v * .9 - .3, 0, .6) : b.id === 'fog' ? clamp(.08 + v * .15, 0, .3) : b.storm ? clamp(.9 + v * .3, .5, 1) : clamp(.6 + v * .45, .1, 1);
      R.wx.rain = r; R.wx.hear = clamp(b.hear + (b.rain - r) * .35, .55, 1.05);
      if (was < .15 && r >= .15) msg('Rain comes on.', 'dim', 3); else if (was >= .15 && r < .15) msg('The rain slackens and stops.', 'dim', 3); else if (was < .75 && r >= .75) msg('It is coming down hard now. Men will hear less.', 'dim', 3); }
    if (R.wx.storm && host) { R.thunder -= dt; if (R.thunder <= 0) { R.thunder = rand(18, 70); thunder(); if (R.net) G.net.fx(['t']); } }
    if (here && !P.dead && (P.hp.thorax < P.max.thorax * .35 || P.hp.head < P.max.head * .35)) { R.heart -= dt; if (R.heart <= 0) { R.heart = .85; G.sfx('heart', .9); } }
    if (R.shake > 0) R.shake = Math.max(0, R.shake - dt * 30); if (R.hurt > 0) R.hurt -= dt * .8; if (R.hint > 0) R.hint -= dt;
    for (const m of R.msgs) m.t -= dt; while (R.msgs.length && R.msgs[0].t <= 0) R.msgs.shift();
    for (const m of R.pop) m.t -= dt; while (R.pop.length && R.pop[0].t <= 0) R.pop.shift();
    for (const m of R.hits) m.t -= dt; while (R.hits.length && R.hits[0].t <= 0) R.hits.shift();
    // the way you went, for the reckoning afterwards
    if (here && !P.dead) { R.trailT -= dt; if (R.trailT <= 0) { R.trailT = 1.2; const l = R.trail[R.trail.length - 1]; if (Math.hypot(P.x - l[0], P.y - l[1]) > 24 && R.trail.length < 1500) R.trail.push([Math.round(P.x), Math.round(P.y)]); } }
    if (host) for (let i = R.waves.length - 1; i >= 0; i--) {
      const wv = R.waves[i], sx = wv.list[0].x, sy = wv.list[0].y; if (R.time < wv.at) continue;
      if (R.players.some(p => up(p) && Math.hypot(sx - p.x, sy - p.y) < 15 * T)) { wv.at += 20; continue; }
      X.spawnWave(wv); R.waves.splice(i, 1);
      for (const p of R.players) if (up(p)) X.tell(p, `Voices carry from the ${compass(Math.atan2(sy - p.y, sx - p.x))}. More men are coming in.`, 'dim');
      if (W.id === 'abbey' && here) G.sfx('bell', .35);
    }
    ambience(dt);
    if (here) {
      if (P.dead) { R.deathT -= dt; P.mvx = P.mvy = 0; if (R.deathT <= 0) return finish('dead'); }
      else { updPlayer(dt); if (!X.R) return; }
    }
    for (const f of R.fighters) { if (f.dead) continue; if (f.pup || f.remote) stepNet(f, dt); else if (f !== P || here) { if (f.ai) X.aiUpdate(f, dt); stepF(f, dt); } }
    const fs = R.fighters;
    for (let i = 0; i < fs.length; i++) for (let j = i + 1; j < fs.length; j++) {
      const a = fs[i], b = fs[j]; if (a.dead || b.dead || a.gone || b.gone) continue;
      const dx = b.x - a.x, dy = b.y - a.y; if (dx > 30 || dx < -30 || dy > 30 || dy < -30) continue;
      // one moved from another machine cannot be shoved from here: whoever is this machine's to move gives all the ground
      const na = a.pup || a.remote, nb = b.pup || b.remote; if (na && nb) continue;
      const pa = X.isP(a), pb = X.isP(b), d = Math.hypot(dx, dy), m = a.r + b.r + (pa && pb ? 0 : pa || pb ? 9 : 3);
      if (d < m && d > .01) { const p = (m - d) / (na || nb ? 1 : 2), ux = dx / d, uy = dy / d; if (!na) X.move(a, -ux * p, -uy * p); if (!nb) X.move(b, ux * p, uy * p); }
    }
    for (const f of fs) if (f.ai || f.remote) G.gfx.updFighter(f, dt);
    X.updShots(dt);
    if (R.net) G.net.tick(dt);
    if (!here) return;
    // what is within reach: things to search, doors to unlock
    R.near = null; R.nearDoor = null; let bd = 34;
    const facing = (dx, dy, d, w) => d < 12 || Math.abs(angDiff(Math.atan2(dy, dx), P.ang)) < w;
    for (const l of R.loot) { const dx = l.x - P.x, dy = l.y - P.y, d = Math.hypot(dx, dy); if (d < bd && facing(dx, dy, d, 1)) { bd = d; R.near = l; l._d = d; } }
    // a man on his knees: a captive to cut loose, or one who has yielded
    R.nearMan = null; for (const f of R.fighters) { if (!f.ai || f.dead || !(f.bound || f.ai.state === 'yield')) continue; const dx = f.x - P.x, dy = f.y - P.y, d = Math.hypot(dx, dy); if (d < 42 && d - 8 < bd && facing(dx, dy, d, 1)) { bd = d - 8; R.nearMan = f; R.near = null; } }
    for (const dr of W.doors) { if (!dr.locked) continue; const dx = dr.x - P.x, dy = dr.y - P.y, d = Math.hypot(dx, dy); if (d < 46 && facing(dx, dy, d, .9)) { R.nearDoor = dr; dr._d = d - 14; } }
    const lt = G.ui.lootTarget(); if (G.ui.lootOpen() && lt && Math.hypot(lt.x - P.x, lt.y - P.y) > 46) G.ui.closeLoot();
    // where you are
    const z = W.zoneAt(P.x, P.y);
    if (z && z !== R.zone && !P.dead) {
      R.zoneCard = { name: z.name, t: 3.5 };
      if (G.me === G.save) (G.save.places[W.id] || (G.save.places[W.id] = {}))[z.id] = 1;
      if (!R.seenZones[z.id]) { R.seenZones[z.id] = 1; R.xp.explore += 15; for (const l of G.taskEvent('visit', { map: W.id, zone: z.id })) msg(l, 'good'); }
    }
    R.zone = z;
    // ways out
    const left = R.total - R.time; R.exitZone = null; R.exitBlock = '';
    for (const e of W.extracts) {
      const open = !e.late || left <= e.late * 60;
      if (e.late && open && !R.lateSaid[e.id]) { R.lateSaid[e.id] = 1; G.sfx('bell', .6); msg(`A bell, far off. ${e.name} is open, to the ${e.dir}.`, 'good'); }
      if (!open || Math.hypot(e.x - P.x, e.y - P.y) > e.r) continue;
      R.exitZone = e;
      if (e.nopack && G.me.eq.pack) R.exitBlock = 'No pack will fit through. Drop it (right-click it in your gear) or find another way.';
      else if (e.cost && G.save.coin < e.cost) R.exitBlock = `He wants ${e.cost} silver, and you do not have it at home.`;
    }
    if (R.exitZone && !R.exitBlock && !P.dead) { R.extT += dt; if (R.extT >= 7) return finish('extract'); } else R.extT = 0;
    if (left <= 0 && !P.dead) { R.cause = 'The dark took you. No one sees what happens in the ruins at night.'; return finish('lost'); }
  }
  function thunder() { G.gfx.flash(); setTimeout(() => { if (X.R && !X.R.ghost) G.sfx('thunder', rand(.5, 1)); }, rand(400, 2600)); }
  const compass = a => ['east', 'south-east', 'south', 'south-west', 'west', 'north-west', 'north', 'north-east'][((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8];
  // what you overhear when two men who have not noticed you stand talking
  const TALK = {
    bandit: ['…Tom takes a third and the Flayer takes a third. What is left for the likes of us?', '…there was a cellar under the tavern. I would swear I heard a child.', '…wolves had the miller\'s boy. Left the boots.', '…the sergeants come at dusk to count. Have it ready or it is your ears.', '…I knew this village. I sold them apples.', '…Tom keeps the reeve\'s key on his belt. Sleeps with it.', '…burn the rest, I say. Nothing left worth the carrying.'],
    raider: ['…Hob says we winter here. Hob says a lot.', '…the Duke\'s paymaster has not been seen since the bridge.', '…the Flayer has a smith\'s boy in the cells. Says he will forge nails till his hands fall off.', '…keep your tally on you. No tally, no pay, no burial.', '…there is a key to the postern. The pedlar woman was asking after it.', '…crossbows on the gate, knights in the hall. Nobody is getting in there.', '…the monks hid their saint in the crypt. Hob has the key and will not say why he has not opened it.', '…mail turns a sword. It does not turn a hammer. Ask Wulf, if you can find his teeth.', '…the prior? Hanging from his own bell-rope. Hob rang him for vespers.']
  };
  // What the place sounds like from where you stand, told to the sound desk a few times a second: the weather, whether
  // there is a roof over you, a fire or water near by, and whether anyone is hunting you.
  let ambT = 0;
  function soundscape(dt) {
    const R = X.R, P = X.P, W = X.W; ambT -= dt; if (ambT > 0) return; ambT = .15;
    if (R.ghost || R.over) return G.amb(null);
    const tx = P.x / T, ty = P.y / T, bear = (x, y) => Math.sin(angDiff(Math.atan2(y - P.y, x - P.x), P.ang)) * .8; let roof = 0;
    for (const b of W.buildings) if (tx >= b.x && tx < b.x + b.w && ty >= b.y && ty < b.y + b.h) { roof = b.roof === 'rafters' ? .45 : b.roof ? 1 : .2; break; }
    let fire = 0, fpan = 0;
    for (const f of W.fires) { const d = Math.hypot(f.x - P.x, f.y - P.y); if (d > 240) continue; const v = Math.pow(1 - d / 240, 2) * (f.kind === 'candle' ? .12 : f.kind === 'brazier' ? .7 : 1); if (v > fire) { fire = v; fpan = d > 8 ? bear(f.x, f.y) : 0; } }
    let water = 0, wpan = 0;
    for (const r of [2, 4, 7]) for (let i = 0; i < 8; i++) { const x = P.x + Math.cos(i * .785) * r * T, y = P.y + Math.sin(i * .785) * r * T, t = W.tileAt(x, y); if ((t === TL.WATER || t === TL.DEEP) && 1 - r / 8 > water) { water = 1 - r / 8; wpan = bear(x, y); } }
    if (W.tileAt(P.x, P.y) === TL.WATER) { water = 1; wpan = 0; }
    let ten = 0;
    if (!P.dead) for (const f of R.fighters) { const a = f.ai; if (!a || f.dead || f.E.passive || (a.state !== 'combat' && a.state !== 'investigate')) continue; const d = Math.hypot(f.x - P.x, f.y - P.y); if (d < 520) ten = Math.max(ten, a.state === 'combat' ? (d < 320 ? 1 : .7) : .3); }
    G.amb({ rain: R.wx.rain, wind: clamp(.3 + R.wx.rain * .45 + (R.wx.storm ? .4 : 0) - (R.wx.id === 'clear' ? .12 : 0) + R.dusk * .15, 0, 1.2), storm: R.wx.storm ? 1 : 0, shelter: roof, dusk: R.dusk, fire, firePan: fpan, water, waterPan: wpan, tension: ten, helm: P.hearMul });
  }
  // something to be done a little later, in the raid's own time (a reply, an answering howl)
  const after = (sec, fn) => { const R = X.R; (R.todo || (R.todo = [])).push({ t: R.time + sec, fn }); };
  // Two men talking: one says his piece and the other answers, a few times over. No words in it, only the sound of talk.
  function talk(a, b, turns) {
    const ok = f => f.ai && !f.dead && f.ai.state === 'idle', pl = ok(a) && ok(b) && X.say(a, turns > 0 && Math.random() < .12 ? 'laugh' : 'mutter', .9, true);
    if (pl && turns > 0) after(pl.dur + rand(.25, .7), () => talk(b, a, turns - 1));
  }
  // The small sounds men and beasts make when they think nobody is listening: talk, a cough, a tune through the teeth.
  // Every machine makes these up for itself. They are worth listening for: they tell you where a man is before you see him.
  const HABIT = ['whistle', 'whistle', 'hum', 'hum', 'cough', 'cough', 'sniff', 'sigh', 'yawn', 'mutter'];
  function idleVoices(dt) {
    const R = X.R, P = X.P;
    if (R.todo) for (let i = R.todo.length - 1; i >= 0; i--) if (R.todo[i].t <= R.time) { const e = R.todo.splice(i, 1)[0]; e.fn(); }
    R.idleV = (R.idleV === undefined ? rand(3, 8) : R.idleV) - dt; if (R.idleV > 0 || R.ghost) return; R.idleV = rand(3.5, 8);
    const near = R.fighters.filter(f => f.ai && !f.dead && f.ai.state === 'idle' && Math.hypot(f.x - P.x, f.y - P.y) < 520); if (!near.length) return;
    const a = G.pick(near);
    if (a.E.quad) { if (Math.random() < (a.E.passive ? .15 : .5)) X.say(a, 'idle', .7, true); return; }
    const b = near.find(o => o !== a && !o.E.quad && Math.hypot(o.x - a.x, o.y - a.y) < 110);
    if (b && Math.random() < .7) return talk(a, b, G.irand(1, 3));
    // alone, each man has his own habit: one whistles, one hums, one has a cough he cannot shake
    const h = HABIT[Math.floor((a.vs || 0) * 7919) % HABIT.length]; X.say(a, Math.random() < .65 ? h : G.pick(['sniff', 'sigh', 'cough', 'hmph', 'yawn']), .8, true);
  }
  function ambience(dt) {
    const R = X.R, P = X.P;
    soundscape(dt); idleVoices(dt);
    R.amb = (R.amb === undefined ? rand(8, 25) : R.amb) - dt;
    if (R.ghost) { if (R.net !== 'host') return; } else {
      if (R.amb <= 0) { R.amb = rand(18, 55); if (R.wx.rain < .6) G.sfx(R.dusk > .45 && Math.random() < .6 ? 'howl' : 'crow', rand(.25, .6), rand(-.9, .9)); }
      if (!P.dead && P.stam < 22) { R.breath = (R.breath || 0) - dt; if (R.breath <= 0) { R.breath = .95; G.sfx('breath', .8); } }
    }
    // at dusk the wolves come down, on whoever is still up there
    const ups = R.players.filter(p => !p.dead && !p.gone);
    if (!R.wolves && R.time > R.total * .72 && R.net !== 'client' && ups.length) {
      R.wolves = true; const W = X.W, Q = G.pick(ups); let placed = 0;
      for (let tries = 0; tries < 80 && placed < 2 + W.tier; tries++) {
        const a = rand(0, 6.28), d = rand(22, 30) * T, x = Q.x + Math.cos(a) * d, y = Q.y + Math.sin(a) * d;
        if (x < 3 * T || y < 3 * T || x > (W.w - 3) * T || y > (W.h - 3) * T || X.boxSolid(x, y, 6)) continue;
        X.addEnemy({ type: 'wolf', x, y, dest: { x: Q.x + rand(-60, 60), y: Q.y + rand(-60, 60) } }); placed++;
      }
      if (placed) {      // you hear where they are, if you stop to listen
        const pack = R.fighters.filter(f => f.type === 'wolf' && !f.dead).slice(-placed); pack.forEach((f, i) => after(i * rand(.9, 1.6), () => X.say(f, 'howl', 1)));
        X.all('Wolves are giving tongue. The dusk belongs to them.', 'bad');
      }
    }
    R.chat = (R.chat === undefined ? rand(10, 30) : R.chat) - dt;
    if (R.chat > 0 || P.dead || R.ghost) return; R.chat = 1.5;
    for (const a of R.fighters) {
      if (!a.ai || a.dead || a.E.quad || a.ai.state !== 'idle' || Math.hypot(a.x - P.x, a.y - P.y) > 230) continue;
      const b = R.fighters.find(o => o !== a && o.ai && !o.dead && !o.E.quad && o.ai.state === 'idle' && Math.hypot(o.x - a.x, o.y - a.y) < 110);
      if (b) { msg('You overhear: ' + G.pick(TALK[a.E.faction] || TALK.raider), 'dim'); talk(a, b, 2); R.chat = rand(30, 70); return; }
    }
  }
  function loop(now) {
    if (!X.R) return; const R = X.R; bg = false;
    let dt = Math.max(0, Math.min(.05, (now - last) / 1000)); last = now;      // the first frame after the map is built can carry a time from before it; never step backwards
    R.paused = R.menu && !R.net;      // with friends up there the world does not stop for anyone
    if (!R.paused) { if (R.slow > 0) { R.slow -= dt; dt *= .3; } update(dt); }
    if (!X.R) return;
    if (!R.ghost) { G.gfx.render(X.P, R, R.paused ? 0 : dt); drawHud(); }
    requestAnimationFrame(loop);
  }
  // A browser stops drawing a page that is not in view, or draws it rarely, and this loop stops or crawls with it. With
  // friends up there that will not do: the host's machine moves the world for all of them, and nobody's own player
  // should stand safe while they look at another window. net.js calls this from a worker's clock, which is not slowed;
  // it takes over whenever the drawing loop has not run for a little while.
  function bgTick() {
    const R = X.R; if (!R || !R.net) return;
    const now = performance.now(); if (!bg && now - last < 140) return;
    bg = true; let left = Math.min(.25, Math.max(0, (now - last) / 1000)); last = now;
    while (left > .001 && X.R) { const d = Math.min(.05, left); update(d); left -= d; }
  }

  // ------------------------------------------------------------------ HUD
  // break a line of text to a width, for narrow screens
  const zcol = (P, z) => { const r = clamp(P.hp[z] / P.max[z], 0, 1); return r <= 0 ? '#151212' : `rgb(${lerp(150, 96, r) | 0},${lerp(20, 108, r) | 0},${lerp(16, 78, r) | 0})`; };
  function drawHud() {
    const R = X.R, P = X.P, W = X.W, hk = hud._k || 1, w = hud.width / hk, h = hud.height / hk, c = hx; c.setTransform(hk, 0, 0, hk, 0, 0); c.clearRect(0, 0, w, h);
    const piped = G.gx.post.on, want = piped ? '' : P.pain ? 'saturate(.4) contrast(1.1) brightness(.96)' : 'saturate(.78) contrast(1.05)';      // on High the grade, grain and vignette are done on the graphics card
    if (want !== filterNow) { cv.style.filter = want; filterNow = want; }
    // film grain
    if (!grainC) { grainC = document.createElement('canvas'); grainC.width = grainC.height = 256; const gx = grainC.getContext('2d'), id = gx.createImageData(256, 256); for (let i = 0; i < id.data.length; i += 4) { const v = Math.random() * 255; id.data[i] = id.data[i + 1] = id.data[i + 2] = v; id.data[i + 3] = 26; } gx.putImageData(id, 0, 0); }
    const gox = Math.random() * 256 | 0, goy = Math.random() * 256 | 0;
    if (!piped) for (let y = -goy; y < h; y += 256) for (let x = -gox; x < w; x += 256) c.drawImage(grainC, x, y);
    // the slit of a closed helm
    if (P.visor > 0 && !P.dead) {
      const bar = h * P.visor * .46; c.fillStyle = '#050505'; c.fillRect(0, 0, w, bar); c.fillRect(0, h - bar, w, bar);
      let g = c.createLinearGradient(0, bar, 0, bar + 40); g.addColorStop(0, 'rgba(5,5,5,.9)'); g.addColorStop(1, 'rgba(5,5,5,0)'); c.fillStyle = g; c.fillRect(0, bar, w, 40);
      g = c.createLinearGradient(0, h - bar - 40, 0, h - bar); g.addColorStop(0, 'rgba(5,5,5,0)'); g.addColorStop(1, 'rgba(5,5,5,.9)'); c.fillStyle = g; c.fillRect(0, h - bar - 40, w, 40);
      for (const sx of [0, 1]) { g = c.createLinearGradient(sx ? w : 0, 0, sx ? w - w * P.visor * .5 : w * P.visor * .5, 0); g.addColorStop(0, 'rgba(5,5,5,.95)'); g.addColorStop(1, 'rgba(5,5,5,0)'); c.fillStyle = g; c.fillRect(sx ? w - w * P.visor * .5 : 0, 0, w * P.visor * .5, h); }
    }
    // vignette + pain
    let g = c.createRadialGradient(w / 2, h / 2, h * .35, w / 2, h / 2, h * .95); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.75)'); c.fillStyle = g; if (!piped) c.fillRect(0, 0, w, h);
    const bl = X.bleeds(P), low = 1 - Math.min(P.hp.thorax / P.max.thorax, P.hp.head / P.max.head), red = Math.max(R.hurt, low > .5 ? (low - .5) * .9 : 0) + ((bl[0] + bl[1] * 3) ? Math.min(.3, .06 * (bl[0] + bl[1] * 3)) * (.6 + .4 * Math.sin(R.time * 5)) : 0);
    if (red > 0) { g = c.createRadialGradient(w / 2, h / 2, h * .2, w / 2, h / 2, h * .8); g.addColorStop(0, 'rgba(90,0,0,0)'); g.addColorStop(1, `rgba(110,0,0,${Math.min(.85, red)})`); c.fillStyle = g; c.fillRect(0, 0, w, h); }
    c.textBaseline = 'middle'; c.font = '15px Georgia'; c.textAlign = 'left';
    const left = Math.max(0, R.total - R.time), show = !P.dead && !keys.KeyM && !keys.KeyO;
    if (!P.dead) {
      const ch = P.atk ? P.atk.charge : 0; c.fillStyle = P.riposte > 0 ? 'rgba(200,220,160,.9)' : 'rgba(230,225,210,.7)'; c.beginPath(); c.arc(w / 2, h / 2, 1.6 + ch * 2.5, 0, 7); c.fill();
      // the compass: a strip of bearings, with the open ways out and your friends marked along it
      const cw = Math.min(280, w * .3), span = 1.1; c.textAlign = 'center';
      for (let i = 0; i < 24; i++) {
        const dd = angDiff(i * Math.PI / 12, P.ang); if (Math.abs(dd) > span) continue;
        const x = w / 2 + dd / span * cw, fade = 1 - Math.pow(Math.abs(dd) / span, 3), big = i % 3 === 0;
        c.fillStyle = `rgba(210,200,180,${(big ? .55 : .3) * fade})`; c.fillRect(x - .5, 32, 1, big ? 7 : 4);
        if (big) { const l = ['E', 'SE', 'S', 'SW', 'W', 'NW', 'N', 'NE'][i / 3]; c.font = l.length === 1 ? '13px Georgia' : '10px Georgia'; c.fillStyle = l === 'N' ? `rgba(200,80,62,${fade})` : `rgba(210,200,180,${(l.length === 1 ? .8 : .5) * fade})`; c.fillText(l, x, 22); }
      }
      c.fillStyle = 'rgba(225,215,190,.8)'; c.beginPath(); c.moveTo(w / 2, 43); c.lineTo(w / 2 - 4, 49); c.lineTo(w / 2 + 4, 49); c.fill();
      const pin = (x, y, col, label) => {      // off the end of the strip a mark waits, fainter, at the edge it will come in from
        const dd = angDiff(Math.atan2(y - P.y, x - P.x), P.ang), px = w / 2 + clamp(dd / span, -1, 1) * cw;
        c.globalAlpha = Math.abs(dd) > span ? .4 : 1; c.fillStyle = col; c.beginPath(); c.moveTo(px, 31); c.lineTo(px - 4, 25); c.lineTo(px + 4, 25); c.fill();
        if (label && Math.abs(dd) < .2) { c.font = '11px Georgia'; c.fillStyle = 'rgba(0,0,0,.6)'; c.fillText(label, px + 1, 11); c.fillStyle = col; c.fillText(label, px, 10); }
        c.globalAlpha = 1;
      };
      for (const e of W.extracts) if (!e.late || left <= e.late * 60) pin(e.x, e.y, '#8fb07a', `${e.name} · ${Math.round(Math.hypot(e.x - P.x, e.y - P.y) / 16)} m`);
      if (R.net) for (const f of R.fighters) if (f.remote && !f.dead && !f.gone) pin(f.x, f.y, '#d9c27a', f.name);
      // where the last blows came from
      for (const hh of R.hits) { const th = angDiff(hh.a, P.ang) - Math.PI / 2; c.strokeStyle = `rgba(190,40,28,${Math.min(1, hh.t) * .8})`; c.lineWidth = 7; c.lineCap = 'round'; c.beginPath(); c.arc(w / 2, h / 2, Math.min(w, h) * .2, th - .3, th + .3); c.stroke(); }
      // someone has half noticed you: a mark toward him, which fills as he grows surer. Amber: he is coming to look.
      let marks = 0; c.lineCap = 'butt';
      for (const f of R.fighters) {
        const a = f.ai; if (!a || f.dead || marks > 5 || a.state === 'combat' || a.state === 'flee') continue;
        if (!(f.pup ? a.aware > 0 : !R.net || a.tgt === P) || Math.hypot(f.x - P.x, f.y - P.y) > 900) continue;
        const look = a.state === 'investigate', k = look ? Math.max(.55, a.aware) : a.aware; if (k < .08) continue; marks++;
        const th = angDiff(Math.atan2(f.y - P.y, f.x - P.x), P.ang) - Math.PI / 2, rr = Math.min(w, h) * .27;
        c.lineWidth = 6; c.strokeStyle = 'rgba(0,0,0,.42)'; c.beginPath(); c.arc(w / 2, h / 2, rr, th - .17, th + .17); c.stroke();
        c.lineWidth = 4; c.strokeStyle = look ? 'rgba(222,170,88,.95)' : `rgba(228,220,200,${.4 + .5 * k})`; c.beginPath(); c.arc(w / 2, h / 2, rr, th - .16 * k, th + .16 * k); c.stroke();
      }
      c.textAlign = 'center';
      const mm = Math.floor(left / 60), ss = Math.floor(left % 60);
      c.fillStyle = left < 180 ? '#c9483a' : 'rgba(210,200,180,.85)'; c.font = '15px Georgia'; c.fillText(`${mm}:${ss < 10 ? '0' : ''}${ss} until dark`, w / 2, 58);
      // stamina, hunger, thirst
      const bw = 260, bx = w / 2 - bw / 2, by = h - 40, sw = bw * .477;
      c.fillStyle = 'rgba(0,0,0,.55)'; c.fillRect(bx - 1, by - 1, bw + 2, 8); c.fillStyle = P.exhaust ? '#8a3a2a' : '#b9a773'; c.fillRect(bx, by, bw * P.stam / P.maxStam, 6);
      const small = (x, v, col, lab) => { c.fillStyle = 'rgba(0,0,0,.55)'; c.fillRect(x - 1, by + 11, sw + 2, 5); c.fillStyle = v < 20 ? '#c9483a' : col; c.fillRect(x, by + 12, sw * v / 100, 3); if (v < 20) { c.font = '11px Georgia'; c.textAlign = 'center'; c.fillText(lab, x + sw / 2, by + 24); } };
      small(bx, P.energy, '#8a7a4a', 'hungry'); small(bx + bw - sw, P.hydr, '#5a7a8a', 'thirsty');
      {
      // the body: seven parts
      const ox = 30, oy = h - 196;
      c.fillStyle = 'rgba(0,0,0,.45)'; c.fillRect(ox - 12, oy - 12, 212, 180);
      const part = (z, x, y, pw, ph) => { c.fillStyle = zcol(P, z); c.fillRect(ox + x, oy + y, pw, ph); if (P.hb[z]) { c.strokeStyle = '#ff3a2a'; c.lineWidth = 2; c.strokeRect(ox + x - 1, oy + y - 1, pw + 2, ph + 2); } else if (P.lb[z]) { c.strokeStyle = '#c9483a'; c.lineWidth = 1; c.strokeRect(ox + x - .5, oy + y - .5, pw + 1, ph + 1); } if (P.frac[z]) { c.fillStyle = '#d0a03a'; c.fillRect(ox + x + pw / 2 - 1, oy + y + 2, 2, ph - 4); } };
      part('head', 24, 0, 20, 22); part('thorax', 16, 26, 36, 30); part('stomach', 18, 58, 32, 22); part('larm', 2, 26, 11, 50); part('rarm', 55, 26, 11, 50); part('lleg', 17, 83, 15, 58); part('rleg', 36, 83, 15, 58);
      c.textAlign = 'left'; c.font = '12px Georgia'; let ly = oy + 4;
      for (const z of ZN) { c.fillStyle = P.hp[z] <= 0 ? '#8a3a2a' : 'rgba(210,200,180,.8)'; c.fillText(`${G.cap(ZNAME[z])}`, ox + 78, ly); c.textAlign = 'right'; c.fillText(`${Math.max(0, Math.ceil(P.hp[z]))}/${Math.round(P.max[z])}`, ox + 192, ly); c.textAlign = 'left'; ly += 15; }
      ly += 5; const st = [];
      if (bl[1]) st.push(['Heavy bleeding', '#ff4a3a']); if (bl[0]) st.push(['Bleeding' + (bl[0] > 1 ? ' ×' + bl[0] : ''), '#d0483a']);
      if (['larm', 'rarm', 'lleg', 'rleg'].some(z => P.frac[z])) st.push(['Fracture', '#d0a03a']); if (P.pain) st.push(['In pain', '#c9906a']);
      if (P.numb > 0) st.push(['Numbed', '#8fa8c0']); if (P.ale > 0) st.push(['Ale', '#b9a773']); if (P.crouch) st.push(['Crouched', '#8a9a7a']); if (P.lf < .95) st.push(['Burdened', '#a89a7a']);
      c.font = '12px Georgia'; let sx = ox + 78;
      for (const s of st) { const tw = c.measureText(s[0]).width; if (sx + tw > ox + 196) { sx = ox + 78; ly += 14; } c.fillStyle = s[1]; c.fillText(s[0], sx, ly); sx += tw + 9; }
      // quick slots
      c.textAlign = 'right'; c.font = '13px Georgia'; let qy = h - 34; const seen = {};
      const slots = []; for (const cc of G.carried()) for (const o of cc.items) { const d = I[o.it.id]; if (d.key) { const k = d.key + d.name; if (!seen[k]) { seen[k] = { key: d.key, name: d.name, n: 0 }; slots.push(seen[k]); } seen[k].n += o.it.n || (o.it.u != null && d.pool <= 4 ? o.it.u : 1); } }
      slots.sort((a, b) => b.key - a.key);
      for (const sl of slots.slice(0, 9)) { c.fillStyle = 'rgba(210,200,180,.75)'; c.fillText(`${sl.name} ×${sl.n}   [${sl.key}]`, w - 26, qy); qy -= 18; }
      const pw = X.wd(P), wit = P.eq.weapon;
      if (pw.ranged) { const am = X.ammoFor(pw); c.fillStyle = 'rgba(210,200,180,.85)'; c.fillText(am ? `${I[am.it.id].name} ×${G.countCarried(am.it.id)}` : 'No ' + (pw.ammo === 'bolt' ? 'quarrels' : 'arrows'), w - 26, qy); qy -= 18; }
      // what is in your hand, and the state of its edge
      qy -= 4; const dull = wit && wit.dur != null && wit.dur < .35 && !pw.ranged;
      if (wit && wit.dur != null) { c.fillStyle = 'rgba(0,0,0,.55)'; c.fillRect(w - 27 - 60, qy - 3, 62, 6); c.fillStyle = wit.dur < .35 ? '#a8402e' : wit.dur < .6 ? '#b9a773' : '#7f9a5a'; c.fillRect(w - 26 - 60, qy - 2, 60 * wit.dur, 4); }
      c.fillStyle = dull ? '#c9906a' : 'rgba(225,215,190,.9)'; c.fillText(G.cap(pw.name) + (dull ? ' — notched and dull  [9 whetstone]' : ''), w - 26 - (wit && wit.dur != null ? 70 : 0), qy);
      }
      // prompts
      c.textAlign = 'center'; c.font = '16px Georgia';
      const bar = (label, k, col) => { c.fillStyle = 'rgba(225,215,190,.92)'; c.fillText(label, w / 2, h / 2 + 60); c.fillStyle = 'rgba(0,0,0,.55)'; c.fillRect(w / 2 - 90, h / 2 + 76, 180, 8); c.fillStyle = col; c.fillRect(w / 2 - 89, h / 2 + 77, 178 * clamp(k, 0, 1), 6); };
      if (P.use) bar(P.use.name, P.use.t / P.use.dur, '#b9a773');
      else if (P.busy) bar(P.busy.label, P.busy.t / P.busy.dur, '#b9a773');
      else if (R.exitZone) { if (R.exitBlock) { c.fillStyle = '#d9877a'; c.fillText(`${R.exitZone.name}: ${R.exitBlock}`, w / 2, h / 2 + 60); } else bar(`${R.exitZone.name}${R.exitZone.cost ? ' — ' + R.exitZone.cost + ' silver' : ''} — hold here`, R.extT / 7, '#7fa06a'); }
      else if (!R.ui && R.nearMan) { c.fillStyle = 'rgba(225,215,190,.9)'; c.fillText(R.nearMan.E.captive ? `[F]  Cut ${R.nearMan.pname} loose` : `[F]  Send ${X.nm(R.nearMan)} on his way`, w / 2, h / 2 + 60); }
      else if (!R.ui && R.nearDoor && (!R.near || R.nearDoor._d <= R.near._d)) { c.fillStyle = 'rgba(225,215,190,.9)'; c.fillText(`[F]  ${G.cap(R.nearDoor.name)} — locked`, w / 2, h / 2 + 60); }
      else if (R.near && !R.ui) { c.fillStyle = 'rgba(225,215,190,.9)'; c.fillText(`[F]  ${R.near.key && !R.near.unlocked ? 'Unlock' : 'Search'} ${R.near.name[0].toLowerCase() + R.near.name.slice(1)}`, w / 2, h / 2 + 60); }
      if (R.zoneCard && R.card <= 0) { c.font = 'italic 20px Georgia'; c.fillStyle = `rgba(216,207,184,${clamp(Math.min(R.zoneCard.t, 3.5 - R.zoneCard.t) * 1.4, 0, .9)})`; c.fillText(R.zoneCard.name, w / 2, h * .2); }
      if (R.hint > 0 && G.save.stats.raids <= 2) { c.font = '13px Georgia'; c.fillStyle = `rgba(210,200,180,${Math.min(.8, R.hint / 3)})`; c.fillText('LMB strike where you look · RMB guard / parry · V kick · Q/E lean · G stone · H treat wounds · F search · Tab pack · O ways out · M map', w / 2 + (w < 1300 ? 110 : 0), h - 70); }
    }
    if (R.net) G.net.hud(c, w, h);      // friends: their names over their heads, and how each one fares
    // messages, and what you have earned
    c.textBaseline = 'middle'; c.textAlign = 'left'; c.font = '15px Georgia'; let my = w < 1200 ? 88 : 30; const lh = 21;
    for (const m of R.msgs) { c.globalAlpha = Math.min(1, m.t); const col = m.cls === 'bad' ? '#d9877a' : m.cls === 'good' ? '#b8c79a' : m.cls === 'tip' ? '#d9c27a' : m.cls === 'dim' ? '#8f8878' : '#d8cfb8'; c.fillStyle = 'rgba(0,0,0,.6)'; c.fillText(m.text, 27, my + 1); c.fillStyle = col; c.fillText(m.text, 26, my); my += lh; }
    c.textAlign = 'center'; c.font = '14px Georgia'; let py = h / 2 - 60;
    for (const m of R.pop) { c.globalAlpha = Math.min(1, m.t); c.fillStyle = '#c9b06a'; c.fillText(m.text, w / 2, py - (3 - m.t) * 12); py -= 18; }
    c.globalAlpha = 1;
    // what the Hollow asked of you (rebuilt twice a second, not every frame)
    if (show && !R.gleaner) {
      if (!R.trk || R.time - R.trk.t > .5 || R.time < R.trk.t) {
        const lines = [], have = G.allCarried(true);
        for (const t of G.openTasks()) for (let i = 0; i < t.objs.length && lines.length < 7; i++) {
          const o = t.objs[i]; if ((o.k !== 'kill' && o.k !== 'visit' && o.k !== 'hand') || (o.map && o.map !== W.id)) continue;
          let p = G.objProgress(t, i); if (o.k === 'hand') p = [p[0] + have.filter(it => it.id === o.id).reduce((n, it) => n + (it.n || 1), 0), p[1]];
          lines.push([`${t.name}${t.objs.length > 1 ? ' ' + (i + 1) : ''}  ${Math.min(p[0], p[1])}/${p[1]}`, p[0] >= p[1]]);
        }
        R.trk = { t: R.time, lines };
      }
      c.textAlign = 'right'; c.font = '13px Georgia'; let ty = 30; const tx = w - 26, tl = R.trk.lines;
      for (const l of tl) { c.fillStyle = l[1] ? 'rgba(184,199,154,.9)' : 'rgba(210,200,180,.6)'; c.fillText(l[0], tx, ty); ty += 18; }
    }
    if (keys.KeyO && !P.dead) {      // the ways out
      const ex = W.extracts, bh = 60 + ex.length * 44, pw2 = Math.min(600, w - 20), px0 = w / 2 - pw2 / 2 + 20; c.fillStyle = 'rgba(14,12,9,.9)'; c.fillRect(w / 2 - pw2 / 2, h / 2 - bh / 2, pw2, bh);
      c.textAlign = 'center'; c.fillStyle = '#b9a773'; c.font = '17px Georgia'; c.fillText('WAYS OUT', w / 2, h / 2 - bh / 2 + 24); c.textAlign = 'left'; let yy = h / 2 - bh / 2 + 58;
      for (const e of ex) {
        const open = !e.late || left <= e.late * 60, wait = e.late ? left - e.late * 60 : 0, d = Math.round(Math.hypot(e.x - P.x, e.y - P.y) / 16);
        c.font = '16px Georgia'; c.fillStyle = open ? '#b8c79a' : '#8f8878'; c.fillText(e.name, px0, yy);
        c.font = '13px Georgia'; c.fillStyle = 'rgba(210,200,180,.75)'; c.fillText(`${e.dir || ''} · ${d} m` + (e.cost ? ` · ${e.cost} silver` : '') + (e.nopack ? ' · no pack' : '') + (open ? '' : ` · opens in ${Math.floor(wait / 60)}:${String(Math.floor(wait % 60)).padStart(2, '0')}`), px0, yy + 18); yy += 44;
      }
    }
    if (keys.KeyM && !P.dead) { const s = Math.max(3, Math.floor(Math.min(w, h) * .82 / W.w)); G.drawMap(c, W.id, (w - W.w * s) / 2, (h - W.h * s) / 2, s, { exits: W.extracts.filter(e => !e.late || left <= e.late * 60), player: P }); }
    if (R.card > 0) {      // arriving
      const ta = clamp(Math.min(R.card - .6, 5 - R.card) * 1.5, 0, 1);
      c.fillStyle = `rgba(0,0,0,${clamp((R.card - 3.4) / 1.4, 0, 1)})`; c.fillRect(0, 0, w, h);
      c.textAlign = 'center'; c.fillStyle = `rgba(216,207,184,${ta})`; c.font = `${Math.min(44, w / 20) | 0}px Georgia`; c.fillText(R.map.name.toUpperCase().split('').join(' '), w / 2, h * .36);
      c.font = 'italic 18px Georgia'; c.fillText(`${W.start.name} — day ${G.save.day} after the sack${R.gleaner ? ' — a gleaner goes up' : ''}`, w / 2, h * .36 + 44);
    }
    if (P.dead) { c.fillStyle = `rgba(0,0,0,${clamp(1 - R.deathT / 2.8, 0, .85)})`; c.fillRect(0, 0, w, h); }
  }

  // ------------------------------------------------------------------ input
  function setMenu(on) { const R = X.R; if (!R) return; R.menu = on; G.ui.pauseMenu(on); for (const k in keys) keys[k] = false; mouse.r = false; R.held = false; stick.f = stick.r = 0; if (on) { if (document.pointerLockElement) document.exitPointerLock(); } else lock(); }
  // one press of a key, however it was made: on the keyboard, or with a button on the screen
  function press(code) {
    const R = X.R, P = X.P; if (!R || R.over) return;
    if (R.menu) { if (code === 'Escape') setMenu(false); return; }
    if (P.dead) return;
    switch (code) {
      case 'Escape': if (G.ui.lootOpen()) G.ui.closeLoot(); else setMenu(true); break;
      case 'Tab': if (G.ui.lootOpen()) G.ui.closeLoot(); else G.ui.openLoot(null); break;
      case 'KeyF': case 'KeyE': interact(); break;
      case 'KeyQ': if (!R.ui) X.throwSide(); break;
      case 'KeyR': if (G.ui.lootOpen()) G.ui.rKey(); break;
      case 'KeyC': P.crouch = !P.crouch; break;
      case 'KeyV': X.kick(P); break;
      case 'KeyG': if (!R.ui) X.throwStone(); break;
      case 'KeyH': if (!R.ui) X.quickHeal(); break;
      case 'KeyT': if (!R.ui) X.startAttack(P, true); break;
      case 'KeyX': if (!P.atk) { const q = P.eq; [q.weapon, q.side] = [q.side, q.weapon]; gear(); G.sfx('cloth', .5); G.ui.refresh(); } break;
      case 'Space': {      // away from the way you are moving, or straight back if you are standing still
        let mx = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0), my = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0); if (Math.hypot(mx, my) < .25) { mx = -1; my = 0; }
        const l = Math.hypot(mx, my), c = Math.cos(P.ang), s = Math.sin(P.ang); X.dodge(P, (c * mx - s * my) / l, (s * mx + c * my) / l); break;
      }
      default: if (/^Digit[1-9]$/.test(code) && !R.ui) X.quickUse(+code[5]);
    }
  }
  addEventListener('keydown', e => {
    const R = X.R; if (!R || R.over) return;
    if (['Tab', 'Space', 'KeyF', 'KeyQ', 'KeyE'].includes(e.code) || e.code.startsWith('Arrow')) e.preventDefault();
    if (e.repeat) return; keys[e.code] = true; press(e.code);
  });
  addEventListener('keyup', e => { keys[e.code] = false; });
  addEventListener('blur', () => { for (const k in keys) keys[k] = false; mouse.r = false; if (X.R) X.R.held = false; });
  document.addEventListener('pointerlockchange', () => { const was = locked, R = X.R; locked = document.pointerLockElement === cv; if (locked) G.raid.nolock = false; else { mouse.r = false; if (R) R.held = false; if (was && R && !R.ui && !R.over) setMenu(true); } });
  // Mouse look. With pointer capture we use raw movement; where the browser refuses capture we fall back
  // to cursor deltas, and holding the cursor near a screen edge keeps turning.
  document.addEventListener('pointerlockerror', () => noCapture());
  function noCapture() { if (!X.R || locked || G.raid.nolock) return; G.raid.nolock = true; msg('Mouse capture is unavailable here: move the mouse to look, hold it at the screen edge to keep turning. Arrow keys also turn.', 'dim'); }
  document.addEventListener('mousemove', e => {
    const px = mouse.x, py = mouse.y, R = X.R, P = X.P; mouse.x = e.clientX; mouse.y = e.clientY;
    if (!R || P.dead || R.ui || R.menu) return;
    let dx, dy;
    if (locked) { dx = e.movementX; dy = e.movementY; } else { if (px == null || !G.raid.nolock) return; dx = (e.clientX - px) * 1.6; dy = (e.clientY - py) * 1.6; }
    const s = .0023 * (G.save.opts.sens || 1) * (P.atk && P.atk.phase === 'strike' ? .35 : 1);
    P.ang += dx * s; P.pitch = clamp(P.pitch - dy * s, -1.2, 1.2);
  });
  cv.addEventListener('mousedown', e => {
    const R = X.R, P = X.P; if (!R || R.menu) return;
    if (!locked && !R.ui) { lock(); setTimeout(noCapture, 500); }
    if (!locked && !G.raid.nolock) return;
    if (R.ui || P.dead) return;
    if (e.button === 0) { R.held = true; if (!X.startAttack(P, keys.KeyT)) P.buf = .35; } else if (e.button === 1) { e.preventDefault(); R.held = true; X.startAttack(P, true); } else if (e.button === 2) mouse.r = true;
  });
  addEventListener('mouseup', e => { if (e.button === 0 || e.button === 1) { if (X.R) X.R.held = false; } else if (e.button === 2) mouse.r = false; });
  addEventListener('contextmenu', e => { if (X.R) e.preventDefault(); });
  addEventListener('resize', () => { sizeHud(); });

  G.raid = {
    start, dropItem, nolock: false, useItem: (it, c) => X.useItem(it, c), canUse: it => X.canUse(it),
    active: () => !!X.R, state: () => X.R, player: () => X.P, world: () => X.W,
    setUI(on) { const R = X.R; if (!R) return; R.ui = on; if (on) { mouse.r = false; R.held = false; if (document.pointerLockElement) document.exitPointerLock(); } else lock(); },
    gearChanged() { if (X.R) gear(); },
    // called by the loot screen each time searching turns something up
    found(n) { const R = X.R; if (!R) return; R.xp.loot += 3 * n; G.addSkill('scavenging', 2 * n); },
    searchTime() { return 1 - .03 * sk('scavenging'); },
    resume: () => setMenu(false),
    // test hook: run the simulation forward without waiting on the display
    _step(n, dt, quiet) { for (let i = 0; i < n && X.R; i++) update(dt || 1 / 30); if (X.R && !quiet) { G.gfx.render(X.P, X.R, 1 / 30); drawHud(); } },
    // the place could not be built: put everything back as it was before you set out
    abort() { const R = X.R, s = G.save; if (R && R.net) { G.net.left('lost'); G.net.over(); } X.R = null; G.me = s; if (s.inRaid) { s.inRaid = false; s.stats.raids = Math.max(0, s.stats.raids - 1); G.persist(); } document.body.classList.remove('raid'); G.amb(null); },
    // going up with friends (net.js)
    bgTick, endGhost, putDown, compass,
    ghost: () => !!(X.R && X.R.ghost),
    lootClosed(l) { const R = X.R; if (R && R.net && l && l.id != null) G.net.searched(l, true); },
    lootChanged(l) { const R = X.R; if (R && R.net && l && l.id != null) G.net.searched(l, false); },
    cut() { const R = X.R; if (!R) return; if (R.ghost) return endGhost(); if (!R.over) { msg('You have lost the others.'); finish(X.P.dead ? 'dead' : 'extract', !X.P.dead); } },
    _keys: keys,
    abandon() { const R = X.R; if (!R) return; R.cause = 'You turned and ran, and dropped everything to run faster.'; finish('lost'); }
  };
})();
