'use strict';
// The raid, part 2: enemies. How they are made, what they notice, and how they stand guard, patrol, hunt, fight and run.
(function () {
  const X = G.rx, I = G.ITEMS, RS = G.RS, rand = G.rand, clamp = G.clamp, angDiff = G.angDiff, WALK = X.WALK;
  const wd = X.wd, shield = X.shield, nm = X.nm, msg = X.msg, sfxAt = X.sfxAt;
  // on a gleaner run the hill bandits leave you be, until you give them cause
  X.neutral = o => !!X.R.gleaner && o.E.faction === 'bandit' && !X.R.banditsHostile;

  X.mkEnemy = function (s) {
    const W = X.W, th = G.threat(), E0 = G.ENEMIES[s.type], beast = E0.faction === 'beast';
    const E = Object.assign({}, E0, { hp: E0.hp * (beast ? 1.12 : E0.captive ? 1 : 1.3), skill: Math.min(.96, E0.skill + (beast || E0.captive ? 0 : .08 + .03 * (th - 1))) }), f = X.mkF(E, s.x, s.y); f.type = s.type;
    for (const k in E.kit) { const id = G.wpick(E.kit[k]); if (id) { const it = G.mk(id); if (it.dur != null) it.dur = rand(.25 + W.tier * .08, .7 + W.tier * .09); f.eq[k] = it; } }
    const w = f.eq.weapon && I[f.eq.weapon.id]; if (w && w.twoH) delete f.eq.off;
    f.loot = G.rollLoot(E.loot, W.tier);
    if (E.extra) for (const id of E.extra) f.loot.push(G.mk(id));
    if (E.stacks) for (const [id, a, b, p] of E.stacks) if (Math.random() < p) f.loot.push(G.mk(id, G.irand(a, b)));
    let wt = 0; for (const k of ['body', 'head', 'legs']) if (f.eq[k]) wt += I[f.eq[k].id].weight; f.lf = clamp(1 - wt / 90, .7, 1);
    f.ai = { state: 'idle', aware: 0, tick: rand(0, .12), seed: rand(0, 6), home: { x: s.x, y: s.y }, patrol: s.patrol || null, pi: 0, wait: rand(0, 3), cd: rand(.2, .8), strafe: Math.random() < .5 ? 1 : -1, strafeT: 0, blockUntil: 0, parry: false, reacted: null, hold: 0, backoff: 0, lostT: 0, lastX: s.x, lastY: s.y, path: null, pathT: 0, pgx: 0, pgy: 0, draw: 0, melee: false, fled: false, fleeT: 0, poi: null, sees: false, goT: 0, feint: false, go: null, post: null, leader: null, off: { x: rand(-26, 26), y: rand(-26, 26) } };
    if (!E.quad && !E.proper) f.pname = G.pick(G.NAMES);
    f.rattle = X.rattleOf(f.eq); if (E.captive) f.bound = true;
    if (s.post) { f.ai.post = { x: s.x, y: s.y, face: s.face || 0 }; f.ang = s.face || 0; }
    if (s.dest) { f.ai.go = s.dest; f.ai.goSpd = WALK * .95; f.ai.home = { x: s.dest.x, y: s.dest.y }; }
    return f;
  };
  // make an enemy and put him in the world; friends who are up there are told who he is and what he has in his hands
  // vs: whose voice he has. It comes from his number, so he sounds the same on every machine.
  const voiceOf = id => (Math.imul(id + 7, 2654435761) >>> 0) / 4294967296;
  X.addEnemy = function (s) { const R = X.R, f = X.mkEnemy(s); f.id = R.nextId++; f.vs = voiceOf(f.id); R.fighters.push(f); G.gfx.addFighter(f); if (R.net === 'host') G.net.spawned(f); return f; };
  // an enemy as the host describes him, on a friend's machine: his place and his kit, and nothing in his head. The host
  // moves him; this machine only plays out his blows, to see whether they land on its own player.
  X.addPuppet = function (d) {
    const R = X.R, f = X.mkF(Object.assign({}, G.ENEMIES[d.type]), d.x, d.y); f.type = d.type; f.id = d.id; f.pup = true; f.ang = d.ang; f.pname = d.pname; f.loot = [];
    for (const k in d.eq) f.eq[k] = G.mk(d.eq[k]);
    f.vs = voiceOf(f.id); f.rattle = X.rattleOf(f.eq); f.bound = !!f.E.captive;
    f.ai = { state: 'idle', melee: false, hold: 0, parry: false, draw: 0, blockUntil: 0, tgt: null, seed: f.vs * 6 };
    f.nx = d.x; f.ny = d.y; f.na = d.ang;
    R.fighters.push(f); G.gfx.addFighter(f); return f;
  };
  // men who arrive part-way through: they walk in from the edge of the map
  X.spawnWave = function (wv) { for (const e of wv.list) X.addEnemy(e); };
  // Whom this man minds. With friends up there it is the one he can see, else the nearest, and he does not change his
  // mind lightly. Alone, it is you.
  const away = p => p.dead || p.gone;
  X.mark = function (f) {
    const R = X.R, a = f.ai, ps = R.players; if (ps.length < 2) return ps[0];
    let cur = a.tgt; if (cur && away(cur)) cur = null;
    if (cur && a.markT > R.time) return cur;
    a.markT = R.time + rand(.4, .8); let best = null, bs = 1e9;
    for (const p of ps) { if (away(p)) continue; const d = Math.hypot(p.x - f.x, p.y - f.y); let s = d * (p === cur ? .7 : 1); if (d < 900 && !X.W.los(f.x, f.y, p.x, p.y)) s += 420; if (s < bs) { bs = s; best = p; } }
    return a.tgt = best || cur || X.P;
  };

  // ------------------------------------------------------------------ noise and alarm
  // lure: a thrown stone draws men to look without putting them on edge
  X.noise = function (x, y, rad, lure) {
    const R = X.R; if (R.net === 'client') return G.net.send(['n', Math.round(x), Math.round(y), Math.round(rad), lure ? 1 : 0]);      // the men who might hear it are in the host's keeping
    rad *= R.wx.hear; let said = 0;
    for (const f of R.fighters) {
      const a = f.ai; if (!a || f.dead || (a.state !== 'idle' && a.state !== 'investigate')) continue;
      if (Math.hypot(f.x - x, f.y - y) > rad * f.E.hear) continue;
      if (a.state === 'idle' && said < 2 && rad > 60 && Math.random() < .7) { said++; X.say(f, 'huh', .8); }      // "what was that?"
      a.state = 'investigate'; a.poi = { x: x + rand(-12, 12), y: y + rand(-12, 12) }; a.wait = 3; a.goT = 0; if (!lure) a.aware = Math.max(a.aware, .35);
    }
  };
  // who: the player he has noticed (with friends up there it need not be you)
  X.alert = function (f, silent, who) {
    const R = X.R, a = f.ai, P = who || a.tgt || X.P; if (a.state === 'combat' || a.state === 'yield' || a.state === 'gone' || f.E.captive) return;
    a.tgt = P; a.markT = R.time + 2;
    if (f.E.passive) { if (a.state !== 'flee') { a.state = 'flee'; a.fleeT = rand(7, 11); a.aware = 0; } return; }      // deer do not fight
    a.state = 'combat'; a.aware = 1; a.lastX = P.x; a.lastY = P.y; a.lostT = 0; a.cd = rand(.2, .6);
    if (silent) return;
    const quad = !!f.E.quad; X.say(f, 'alert', 1);
    if (f.E.boss) X.tell(P, `${f.name} has seen you.`, 'bad');
    else if (!quad) X.tell(P, G.pick([`${nm(f, 1)} has seen you.`, `${nm(f, 1)} shouts: "There! Take him!"`, `${nm(f, 1)} cries out and comes at you.`, `${nm(f, 1)} shouts: "To me! To me!"`]), 'bad', 2);
    else X.tell(P, f.type === 'hound' ? 'A war hound gives tongue.' : f.type === 'boar' ? 'A boar turns on you.' : 'A wolf has your scent.', 'bad', 3);
    for (const o of R.fighters) {
      if (!o.ai || o.dead || o === f || o.ai.state === 'combat' || o.ai.state === 'yield' || o.ai.state === 'gone' || o.E.captive || Math.hypot(o.x - f.x, o.y - f.y) > 380) continue;
      const kin = quad ? o.type === f.type || (f.type === 'hound' && o.E.faction === 'raider') : !o.E.quad || o.type === 'hound';
      if (kin && !X.neutral(o)) { o.ai.state = 'investigate'; o.ai.poi = { x: P.x, y: P.y }; o.ai.wait = 4; o.ai.goT = 0; o.ai.aware = .8; }
    }
  };

  // ------------------------------------------------------------------ movement
  const boxSolid = X.boxSolid = (x, y, r) => { const W = X.W; return W.solidPx(x - r, y - r) || W.solidPx(x + r, y - r) || W.solidPx(x - r, y + r) || W.solidPx(x + r, y + r); };
  X.move = function (f, dx, dy) { const r = 5; if (!boxSolid(f.x + dx, f.y, r)) f.x += dx; if (!boxSolid(f.x, f.y + dy, r)) f.y += dy; };
  const turn = X.turn = function (f, target, rate, dt) { const d = angDiff(target, f.ang), m = rate * dt; f.ang += Math.abs(d) < m ? d : Math.sign(d) * m; };
  function clearWalk(x0, y0, x1, y1) {
    const d = Math.hypot(x1 - x0, y1 - y0), n = Math.ceil(d / 8);
    for (let i = 1; i <= n; i++) if (boxSolid(x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n, 5)) return false;
    return true;
  }
  function aiMove(f, tx, ty, spd, dt, face) {
    const a = f.ai, W = X.W; let gx = tx, gy = ty; a.pathT -= dt;
    if (!clearWalk(f.x, f.y, tx, ty)) {
      if (!a.path || a.pathT <= 0 || Math.hypot(a.pgx - tx, a.pgy - ty) > 40) { a.path = W.path(f.x, f.y, tx, ty); a.pathT = .8 + rand(0, .3); a.pgx = tx; a.pgy = ty; }
      if (!a.path || !a.path.length) { f.mvx = f.mvy = 0; return false; }
      while (a.path.length > 1 && Math.hypot(a.path[0].x - f.x, a.path[0].y - f.y) < 10) a.path.shift();
      if (a.path.length > 1 && clearWalk(f.x, f.y, a.path[1].x, a.path[1].y)) a.path.shift();
      gx = a.path[0].x; gy = a.path[0].y;
    } else a.path = null;
    const dx = gx - f.x, dy = gy - f.y, d = Math.hypot(dx, dy) || 1;
    f.mvx = dx / d * spd; f.mvy = dy / d * spd; if (face) turn(f, Math.atan2(dy, dx), 7, dt);
    return true;
  }

  // ------------------------------------------------------------------ senses
  function sense(f, P, d, dx, dy) {
    const R = X.R, W = X.W, a = f.ai, E = f.E, own = P === X.P; let see = false, range = 0;
    if (!away(P) && !X.neutral(f)) {
      range = E.view * 2 * (1 - R.dusk * .45) * (P.crouch ? .42 : 1) * (P.inBush && P.crouch ? .25 : 1) * (a.state === 'combat' ? 1.4 : 1) * (1 - .02 * (own ? X.sk('fieldcraft') : P.craft || 0)) / Math.max(1, Math.pow(R.wx.fog, .8));
      if (R.time < 15) range *= .5;      // you slipped in unseen: nobody is looking your way in the first moments
      if (d < range) { const rel = Math.abs(angDiff(Math.atan2(dy, dx), f.ang)); if (rel < (a.state === 'combat' ? 2.6 : a.state === 'investigate' ? 1.25 : .9) || d < (P.crouch ? 9 : 18)) see = W.los(f.x, f.y, P.x, P.y); }      // a man at his ease sees only what is before him; creep up behind and he does not turn
    }
    a.sees = see;
    if (see) {
      a.lastX = P.x; a.lastY = P.y; a.lostT = 0;
      if (a.state !== 'combat') {
        a.aware += .12 * 2.4 * (1.3 - d / range) * (P.crouch ? .45 : .8);      // and he is slower to be sure of a shape that keeps low
        if (a.aware >= 1) X.alert(f, false, P); else if (a.aware > .3 && a.state === 'idle') { a.state = 'investigate'; a.poi = { x: P.x, y: P.y }; a.wait = 3; a.goT = 0; X.say(f, 'huh', .8); }
      }
    } else if (a.state !== 'combat') {
      a.aware = Math.max(0, a.aware - .03);
      if (own && P.crouch && d < range * 1.1 && d > 0 && !P.dead && a.state === 'idle' && range > 0) R.sneak += .12;      // close, unseen: fieldcraft
    }
  }

  // ------------------------------------------------------------------ men who are no threat
  // A captive kneels where he was left until someone cuts him loose, and then runs for the nearest way out. A man who
  // has yielded kneels with his hands up until he is sent off, struck down, or left alone long enough to slip away.
  function meek(f, P, d, dt) {
    const R = X.R, a = f.ai, W = X.W; f.blocking = false; f.atk = null;
    if (a.state === 'gone') {      // running for it: at a way out, or once nobody can see him, he is out of the story
      a.goneT += dt; if (!aiMove(f, a.out.x, a.out.y, WALK * 1.4 * f.E.speed, dt, true)) a.goneT += dt * 4;
      if (Math.hypot(a.out.x - f.x, a.out.y - f.y) < 40 || a.goneT > 45 || (a.goneT > 5 && R.players.every(p => away(p) || Math.hypot(p.x - f.x, p.y - f.y) > 420 || !W.los(f.x, f.y, p.x, p.y)))) X.leave(f);
      return;
    }
    if (f.E.captive && f.taken) { const L = a.leader; a.state = 'idle'; if (!L || L.dead || L.left) { f.taken = null; f.bound = true; a.leader = null; return; } const dl = Math.hypot(L.x - f.x, L.y - f.y); if (dl > 34) aiMove(f, L.x, L.y, WALK * (dl > 90 ? 1.1 : .7), dt, true); return; }
    if (f.E.captive) { a.state = 'idle'; a.aware = 0; if (d < 170 && Math.random() < dt * .1) X.say(f, 'fear', .7); return; }
    a.yieldT += dt; X.turn(f, Math.atan2(P.y - f.y, P.x - f.x), 3, dt);
    if (a.yieldT > 50 || (a.yieldT > 8 && d > 520)) X.runOff(f);
  }
  X.runOff = function (f) {
    const a = f.ai, W = X.W; let best = null, bd = 1e9; for (const e of W.extracts) { const dd = Math.hypot(e.x - f.x, e.y - f.y); if (dd < bd) { bd = dd; best = e; } }
    f.bound = false; f.yield = false; a.state = 'gone'; a.goneT = 0; a.out = best ? { x: best.x, y: best.y } : { x: a.home.x, y: a.home.y };
  };
  // he is out of the raid, alive: no body and no kill
  X.leave = function (f) { const R = X.R, i = R.fighters.indexOf(f); if (i >= 0) R.fighters.splice(i, 1); G.gfx.removeFighter(f); f.m = null; f.left = true; if (R.net === 'host') G.net.cast(['gn', f.id]); };

  // ------------------------------------------------------------------ the day's doings
  // Captives are kept where there are men to keep them, and the day's word from the hills (G.dayEvent) changes who is
  // up there. All of it is people, and people are in the host's keeping, so friends need be told nothing more.
  X.populate = function (day) {
    const R = X.R, W = X.W, P = X.P, tier = W.tier, ev = R.gleaner ? 'none' : G.dayEvent(W.id, day), men = R.fighters.filter(f => f.ai && !f.E.quad && !f.E.captive);
    const beside = (f, r) => { for (let i = 0; i < 30; i++) { const x = f.x + rand(-r, r), y = f.y + rand(-r, r); if (!boxSolid(x, y, 7) && W.los(f.x, f.y, x, y)) return { x, y }; } return null; };
    const far = f => Math.hypot(f.x - P.x, f.y - P.y) > 520, take = l => l.splice(Math.random() * l.length | 0, 1)[0];
    R.event = ev;
    const keepers = men.filter(f => !f.ai.patrol && !f.ai.go && !f.ai.leader && !f.E.boss && far(f));
    let n = (Math.random() < .75 ? 1 : 0) + (Math.random() < .3 ? 1 : 0) + (ev === 'taken' ? 2 : 0);
    while (n-- > 0 && keepers.length) { const k = take(keepers), p = beside(k, 46); if (p) { const c = X.addEnemy({ type: 'captive', x: p.x, y: p.y }); c.ang = Math.atan2(k.y - p.y, k.x - p.x); } }
    if (ev === 'wolves') { const dens = R.fighters.filter(f => f.ai && f.E.quad && far(f)); for (let i = 0; i < 3 + tier && dens.length; i++) { const p = beside(G.pick(dens), 90); if (p) X.addEnemy({ type: 'wolf', x: p.x, y: p.y }); } }
    if (ev === 'muster') for (const f of men) if (!f.E.boss && far(f) && Math.random() < .28) { const p = beside(f, 60); if (p) { const c = X.addEnemy({ type: f.type, x: p.x, y: p.y }); c.ai.leader = f; c.loot.push(G.mk('coin', G.irand(3, 9) * tier)); } }
    if (ev === 'fever') for (const f of men) if (!f.E.boss) { for (const z in f.hp) f.hp[z] *= .72; f.E.courage *= .6; }
    if (ev === 'hunt') {
      const from = men.filter(far); if (from.length < 2) return; const a = G.pick(from); let b = a; for (const o of from) if (Math.hypot(o.x - a.x, o.y - a.y) > Math.hypot(b.x - a.x, b.y - a.y)) b = o;
      const type = tier === 1 ? 'cutthroat' : 'raider', p0 = beside(a, 70); if (!p0) return;
      const lead = X.addEnemy({ type, x: p0.x, y: p0.y, patrol: [{ x: b.x, y: b.y }, { x: a.x, y: a.y }] }); for (let i = 0; i < 2; i++) { const p = beside(lead, 40); if (p) X.addEnemy({ type, x: p.x, y: p.y }).ai.leader = lead; }
    }
  };

  // ------------------------------------------------------------------ the director
  // Nobody up there simply stands where he was put. Everyone but a place's own captain and his guard belongs to a
  // group, each group has something it is trying to do, and the director (on the host) gives them their next errand
  // once a second, brings new groups in as the day wears on, and answers what the players do.
  //   the Duke's men   walk the ground from place to place; when one of theirs is killed by a player the nearest
  //                    group is sent to where it happened, and searches outward from there
  //   hill bandits     are there for the same reason you are: they go from chest to chest and body to body and
  //                    take what they find (kill the man who carried it off and it is on him). Each band is its own:
  //                    two bands that meet will fight
  //   wolves           circle the place, closing on the middle of it as the light goes
  // As the clock runs down more bands and more of the Duke's squads come in by the roads, and on some days a man or
  // a beast with a name.
  const NOTABLE = [
    { base: 'cutthroat', name: 'Wat the Flayer', hp: 1.7, skill: .72, with: ['cutthroat', 'bandit'], coin: 140, say: 'Word runs ahead of him: Wat the Flayer has come up to the ruins, with his knives and his friends.' },
    { base: 'sergeant', name: 'Ser Joss Harrow', hp: 1.6, skill: .86, with: ['raider', 'raider'], coin: 220, say: 'A banner on the road. Ser Joss Harrow has come in for the Duke, and he is looking for whoever has been killing his men.' },
    { base: 'wolf', name: 'Old Greymane', hp: 3, skill: .6, with: ['wolf', 'wolf'], coin: 0, say: 'A howl deeper than the rest. Old Greymane is down from the hill.' }
  ];
  // Each band of hill men has come for one thing and takes nothing else, so what is missing from a place tells you who
  // has been through it: food from the sacks and barrels, iron from the racks and the dead, silver from chests and
  // altars, physic from the leech's shelves; and one kind of band comes for people.
  const WANT = {
    food: { say: 'food', kinds: /sack|barrel|crate|herbpatch|woodpile/, has: d => d.cat === 'food' },
    iron: { say: 'iron', kinds: /rack|armoury|corpse|remains|toolbox|crate/, has: d => /weapon|ammo|shield|head|body|legs/.test(d.cat || '') },
    silver: { say: 'silver', kinds: /chest|coffer|desk|altar|cache|corpse/, has: (d, it) => it.id === 'coin' || (d.value >= 25 && !/weapon|ammo|shield|head|body|legs|food|med/.test(d.cat || '')) },
    physic: { say: 'physic', kinds: /medchest|dispensary|herbpatch|crate|chest/, has: d => d.cat === 'med' },
    folk: { say: 'people to sell', kinds: /^$/, has: () => false }
  };
  const BANDS = ['Reave\'s men', 'the Crows', 'the Gallows Lot', 'the Marsh Boys', 'the Tallymen', 'Black Bess\'s lot', 'the Ditchers', 'the Lean Dogs'];
  // How ready a group is to fight: 0 timid (keeps off, runs if pressed), 1 wary (warns you off and holds its ground;
  // crowd it or outstay its patience and it comes for you), 2 bold (fights on sight), 3 savage (fights on sight, two
  // at once, and does not break). Blood raises it; so does the failing light.
  const AGNAME = ['timid', 'wary', 'bold', 'savage'];
  X.bandName = f => f.band !== undefined ? BANDS[f.band % BANDS.length] : null;
  const spotNear = (x, y, r) => { for (let i = 0; i < 14; i++) { const px = x + rand(-r, r), py = y + rand(-r, r); if (!boxSolid(px, py, 6)) return { x: px, y: py }; } return null; };
  const doors = () => { const M = X.R.map, T = G.T || 32; return M.starts.concat(M.exits).map(e => ({ x: e.x * T, y: e.y * T, name: e.name })); };
  function addGroup(m, obj) {
    const D = X.R.dir, a = m[0], g = { id: D.groups.length, m, fac: a.E.quad ? 'wolf' : a.E.faction, obj: obj || (a.E.quad ? 'prowl' : a.E.faction === 'raider' ? 'patrol' : 'loot'), dest: null, t: 0, busy: 0, work: 0, wait: rand(10, 90), th: rand(0, 6.28) };
    if (g.fac === 'bandit') { const near = D.groups.find(o => o.fac === 'bandit' && o.band !== undefined && !obj && Math.hypot(o.m[0].x - a.x, o.m[0].y - a.y) < 520); g.band = near ? near.band : D.started ? D.bands++ : 1 + (D.bands++ % 2); for (const f of m) f.band = g.band; const D2 = D.wants || (D.wants = {}); g.want = D2[g.band] || (D2[g.band] = g.band === 0 ? 'silver' : !obj ? (g.band === 1 ? G.pick(['food', 'iron']) : G.pick(['silver', 'physic'])) : G.pick(['food', 'iron', 'silver', 'physic', 'food', 'iron', 'folk'])); if (g.want === 'folk' && !obj) g.want = D2[g.band] = 'iron'; }
    g.ag = a.E.quad ? (m.length > 2 ? 1 : 0) : g.fac === 'raider' ? 2 : m.length >= 3 ? G.pick([1, 2, 2]) : G.pick([0, 1, 1, 2]); g.haul = 0;
    for (const f of m) { f.ai.post = null; f.ai.patrol = null; f.ai.go = null; f.ai.leader = f === a ? null : a; f.grp = g; }
    D.groups.push(g); return g;
  }
  X.directorStart = function () {
    const R = X.R, D = R.dir = { groups: [], bands: 1, t: 0, next: rand(80, 140), alarm: null, pend: null, bossAt: R.total * rand(.25, .6), boss: !R.gleaner && Math.random() < .55, late: !R.gleaner };
    const pool = R.fighters.filter(f => f.ai && !f.E.captive && !f.E.passive && !f.E.boss && !(f.ai.leader && f.ai.leader.E.boss) && (!f.E.quad || f.type === 'wolf'));
    for (const f of R.fighters) if (f.ai && f.E.faction === 'bandit' && (f.E.boss || (f.ai.leader && f.ai.leader.E.boss))) f.band = 0;      // the place's own captain's band
    while (pool.length) {
      const a = pool.shift(), g = [a];
      for (let i = pool.length - 1; i >= 0 && g.length < 4; i--) { const o = pool[i]; if (o.E.faction === a.E.faction && !!o.E.quad === !!a.E.quad && Math.hypot(o.x - a.x, o.y - a.y) < 460) { g.push(o); pool.splice(i, 1); } }
      const keep = !a.E.quad && Math.random() < .22, post = a.ai.post, grp = addGroup(g, keep ? 'guard' : null); if (keep && post) a.ai.post = post;      // a few still keep a place, so that not every door stands open
    }
    D.started = true; D.bands = 3;      // the men of the place are two bands at most; every band that comes in later is its own
  };
  X.dirAlarm = function (x, y) { const D = X.R.dir; if (D && !D.pend && !D.alarm) D.pend = { x, y, t: rand(12, 26) }; };
  function send(g, L, p, spd) { L.ai.go = { x: p.x, y: p.y }; L.ai.goSpd = spd; L.ai.home = { x: p.x, y: p.y }; L.ai.wait = 0; g.dest = p; g.t = 0; }
  function arrive(kind) {
    const R = X.R, W = X.W, tier = W.tier, D = R.dir, ways = doors().filter(e => R.players.every(p => away(p) || Math.hypot(p.x - e.x, p.y - e.y) > 620)); if (!ways.length) return null;
    const way = G.pick(ways), list = kind === 'bandit' ? (tier === 1 ? ['cutthroat', 'bandit', 'bandit'] : ['cutthroat', 'cutthroat', 'bandit', 'bandit']) : kind === 'raider' ? (tier === 1 ? ['raider', 'raider', 'raider'] : tier === 2 ? ['sergeant', 'raider', 'raider', 'bowman'] : ['sergeant', 'raider', 'raider', 'crossbowman']) : kind === 'wolf' ? ['wolf', 'wolf', 'wolf'] : kind.with.concat([]);
    const m = []; if (kind.base) list.unshift(kind.base);
    for (const type of list) { const p = spotNear(way.x, way.y, 60); if (p) m.push(X.addEnemy({ type, x: p.x, y: p.y })); }
    if (!m.length) return null;
    if (kind.base) {      // a name: the same kind of man or beast, but more of him, and worth the killing
      const f = m[0]; f.E = Object.assign({}, f.E, { name: kind.name, proper: true, boss: true, skill: kind.skill, courage: 1 }); f.name = kind.name; f.pname = kind.name; for (const z in f.hp) { f.hp[z] *= kind.hp; f.max[z] *= kind.hp; }
      if (kind.coin) f.loot.push(G.mk('coin', Math.round(kind.coin * tier * rand(.8, 1.2)))); for (const it of G.rollLoot('pockets_rich', tier)) f.loot.push(it);
    }
    const g = addGroup(m, m[0].E.quad ? 'prowl' : m[0].E.faction === 'raider' ? (kind.base ? 'hunt' : 'patrol') : 'loot'); g.new = true; g.name = way.name; g.ag = kind.base ? 3 : Math.max(g.ag, m[0].E.quad ? 1 : 2);
    if (g.obj === 'hunt') { const P = R.players.find(p => !away(p)) || X.P; D.alarm = { x: P.x + rand(-200, 200), y: P.y + rand(-200, 200) }; g.obj = 'patrol'; }
    X.all(kind.base ? kind.say : kind === 'bandit' ? `Voices by ${way.name}: ${X.bandName(m[0])} have come up, after ${WANT[g.want].say}.` : kind === 'raider' ? `A horn from ${way.name}. More of the Duke's men are coming in.` : `Wolves are down off the hill, by ${way.name}.`, 'bad');
    if (kind === 'wolf' || kind.base === 'wolf') { G.sfx('howl', .8, rand(-.8, .8)); if (R.net === 'host') G.net.fx(['w']); } else G.sfx('bell', .45);
    return g;
  }
  X.director = function (dt) {
    const R = X.R, W = X.W, D = R.dir; D.t += dt; if (D.t < 1) return; D.t -= 1;
    // someone answers for a dead man of the Duke's: a little later, the nearest of his fellows come looking
    if (D.pend && (D.pend.t -= 1) <= 0) { D.alarm = { x: D.pend.x, y: D.pend.y }; D.pend = null; if (D.groups.some(g => !g.done && g.fac === 'raider')) { X.all('A horn, short and angry. The Duke\'s men know one of theirs is down, and where.', 'bad'); G.sfx('bell', .5); } }
    if (D.alarm) { let best = null, bd = 2200; for (const g of D.groups) { if (g.done || g.fac !== 'raider' || g.obj === 'guard') continue; const L = g.m.find(f => !f.dead && !f.left); if (!L) continue; const d = Math.hypot(L.x - D.alarm.x, L.y - D.alarm.y); if (d < bd) { bd = d; best = g; } } if (best) { best.obj = 'hunt'; best.dest = null; best.hunt = D.alarm; best.ag = 3; } D.alarm = null; }
    // new arrivals, oftener as the light goes; and, on some days, a name
    if (D.late && R.time < R.total - 100) {
      if ((D.next -= 1) <= 0) { const live = D.groups.filter(g => !g.done).length; D.next = rand(110, 190) * (live > 9 ? 1.6 : 1) * (1 - .25 * R.time / R.total); const r = Math.random(); arrive(r < .45 ? 'bandit' : r < (W.tier === 1 ? .75 : .85) ? 'raider' : 'wolf'); }
      if (D.boss && R.time > D.bossAt) { D.boss = false; arrive(G.pick(NOTABLE)); }
    }
    // as the light goes, everyone up there grows bolder
    if (!D.dusked && R.time > R.total * .6) { D.dusked = true; for (const g of D.groups) if (!g.done) g.ag = Math.min(3, g.ag + 1); X.all('The light is going. Whatever is up here with you is growing bolder.', 'bad'); }
    for (const g of D.groups) {
      if (g.done) continue;
      const alive = g.m.filter(f => !f.dead && !f.left && f.ai.state !== 'gone' && f.ai.state !== 'yield'); if (!alive.length) { g.done = true; continue; }
      const L = alive[0]; L.ai.leader = null; for (const f of alive) if (f !== L) f.ai.leader = L;
      if (alive.some(f => f.ai.state === 'combat' || f.ai.state === 'flee')) { g.busy = 4; continue; } if (g.busy > 0) { g.busy--; continue; }
      if (g.obj === 'guard') continue;
      g.t++; const there = g.dest && (Math.hypot(L.x - g.dest.x, L.y - g.dest.y) < 60 || (!L.ai.go && g.t > 6) || g.t > 150);
      if (g.obj === 'hunt') {
        if (!g.dest) { const p = spotNear(g.hunt.x, g.hunt.y, 50); if (p) send(g, L, p, WALK * 1.25); else g.obj = 'patrol'; }
        else if (there) { for (const f of alive) { const p = spotNear(g.hunt.x, g.hunt.y, 150); if (!p) continue; f.ai.state = 'investigate'; f.ai.poi = p; f.ai.wait = 3; f.ai.goT = 0; f.ai.search = 3; f.ai.aware = Math.max(f.ai.aware, .55); f.ai.lastX = g.hunt.x; f.ai.lastY = g.hunt.y; } g.obj = 'patrol'; g.dest = null; g.wait = 30; }
      } else if (g.obj === 'patrol') {
        if (g.dest && !there) continue; if (g.dest) { g.dest = null; g.wait = rand(6, 18); } if ((g.wait -= 1) > 0) continue;
        const c = G.pick(R.loot.filter(l => l.kind !== 'corpse' && l.kind !== 'pile')), p = c && spotNear(c.x, c.y, 70); if (p) send(g, L, p, WALK * .62);
      } else if (g.obj === 'leave') {      // they have what they came for: out by the nearest road, and what they carry goes with them
        if (!g.dest) { let b = null, bd = 1e9; for (const e of doors()) { const d = Math.hypot(e.x - L.x, e.y - L.y); if (d < bd) { bd = d; b = e; } } if (b) send(g, L, b, WALK * .8); }
        else if (there) { if (R.players.some(p => !away(p) && Math.hypot(p.x - L.x, p.y - L.y) < 500)) X.all(`${G.cap(X.bandName(L) || 'A band')} are away down the road with what they took.`, 'dim'); for (const f of alive) X.leave(f); for (const c of R.fighters.filter(c => c.taken === g)) X.leave(c); g.done = true; }
      } else if (g.obj === 'loot') {
        const want = WANT[g.want] || WANT.silver, seen = l => l.bandSeen && l.bandSeen[g.band];
        if (g.haul >= 4) { g.obj = 'leave'; g.dest = null; if (g.tgt) { g.tgt.claim = null; g.tgt = null; } continue; }
        if (g.want === 'folk') {      // slavers: find one of yours on his knees, get him on his feet, and walk him out
          const mine = R.fighters.find(c => c.taken === g && !c.dead && !c.left);
          if (mine) { g.haul = 4; continue; }
          if (!g.cap || g.cap.dead || g.cap.left || !g.cap.bound) { g.cap = R.fighters.filter(c => c.E.captive && c.bound && !c.dead && !c.taken).sort((p, q) => Math.hypot(p.x - L.x, p.y - L.y) - Math.hypot(q.x - L.x, q.y - L.y))[0] || null; g.dest = null; g.work = 0; if (!g.cap) { g.want = 'iron'; continue; } }
          if (!g.dest) { const p = spotNear(g.cap.x, g.cap.y, 30); if (p) send(g, L, p, WALK * .8); }
          else if (there && ++g.work >= 10) { g.cap.taken = g; g.cap.bound = false; g.cap.ai.leader = L; X.all(`${G.cap(X.bandName(L) || 'slavers')} have ${g.cap.pname} on a rope and are walking ${'him'} out. Kill them and the rope is yours to cut.`, 'bad'); }
          continue;
        }
        const ok = l => l.c && l.c.items.length && want.kinds.test(l.kind || '') && !seen(l) && l.lock == null && !(l.key && !l.unlocked) && (!l.claim || l.claim === g);
        if (g.tgt && !ok(g.tgt)) { g.tgt.claim = null; g.tgt = null; g.dest = null; }
        if (!g.tgt) { if ((g.wait -= 1) > 0) continue; let best = null, bd = 1e9; for (const l of R.loot) { if (!ok(l)) continue; const d = Math.hypot(l.x - L.x, l.y - L.y) * (.6 + Math.random() * .8); if (d < bd) { bd = d; best = l; } } if (!best) { g.obj = g.haul ? 'leave' : 'patrol'; g.dest = null; continue; } const p = spotNear(best.x, best.y, 26); best.claim = g; if (!p) { (best.bandSeen || (best.bandSeen = {}))[g.band] = 1; best.claim = null; continue; } g.tgt = best; g.work = 0; send(g, L, p, WALK * .78); }
        else if (there) {      // hands in it: he is in no hurry, takes what his band came for and leaves the rest where it lay
          if (g.work === 0 && R.players.some(p => !away(p) && Math.hypot(p.x - L.x, p.y - L.y) < 420)) X.all(`${G.cap(X.bandName(L) || X.nm(L))} are after ${want.say}: one of them is going through ${/^body/i.test(g.tgt.name) ? 'a body' : 'the ' + g.tgt.name.toLowerCase()}.`, 'dim');
          if (++g.work >= 24) { const l = g.tgt; let n = 0; for (let i = l.c.items.length - 1; i >= 0 && n < 3; i--) { const it = l.c.items[i].it; if (want.has(I[it.id], it)) { L.loot.push(it); l.c.items.splice(i, 1); n++; } } (l.bandSeen || (l.bandSeen = {}))[g.band] = 1; if (n) { l.rifled = true; g.haul++; } l.claim = null; g.tgt = null; g.dest = null; g.wait = n ? rand(45, 100) : rand(8, 20); }
        }
      } else {      // wolves:
        if (g.dest && !there) continue;
        const M = R.map, T = G.T || 32, k = clamp(R.time / R.total, 0, 1), far = Math.min(W.w, W.h) * T * .42, r = far + (150 - far) * k; g.th += rand(.5, 1.1);
        const p = spotNear(M.hub[0] * T + Math.cos(g.th) * r, M.hub[1] * T + Math.sin(g.th) * r, 90); if (p) send(g, L, p, WALK * .55);
      }
    }
  };

  // ------------------------------------------------------------------ the bands are no friends of one another
  // The hill bandits and the Duke's men would each as soon kill the other as you; the Duke's hounds go for bandits;
  // wolves go for any man who comes close. So a fight you did not start may be going on round the next corner, and a
  // fight you did start may bring a third party down on it. Beasts other than wolves, and men against beasts, only
  // answer a blow. Nothing is settled far from every player: there the land keeps as it was.
  const hostile = (f, o) => {
    const A = f.E.faction, B = o.E.faction, hound = t => t.type === 'hound';
    if (o.E.captive || o.E.passive || !o.ai || o.ai.state === 'gone' || o.ai.state === 'yield' || B === 'folk') return false;
    if (f.type === 'wolf') return B !== 'beast';
    if (hound(f)) return B === 'bandit';
    if (A === 'beast') return false;
    if (hound(o)) return A === 'bandit';
    return B !== 'beast' && (A !== B || (A === 'bandit' && f.band !== undefined && o.band !== undefined && f.band !== o.band));      // and one band of hill men is no friend to another
  };
  function foeOf(f, dt) {
    const R = X.R, a = f.ai, E = f.E; if (E.captive || E.passive || R.gleaner || a.state === 'yield' || a.state === 'gone' || a.state === 'flee') return null;
    let o = a.foe; if (o && (o.dead || o.left || !o.ai || o.ai.state === 'gone' || o.ai.state === 'yield' || Math.hypot(o.x - f.x, o.y - f.y) > 780)) o = a.foe = null;
    if (o) return o;
    a.foeT = (a.foeT === undefined ? rand(0, .7) : a.foeT) - dt; if (a.foeT > 0) return null; a.foeT = .6;
    if (!R.players.some(p => !away(p) && Math.hypot(p.x - f.x, p.y - f.y) < 1300)) return null;
    const reach = Math.max(120, E.view * (f.type === 'wolf' ? .75 : 1.15)) * (1 - R.dusk * .3); let best = null, bd = reach;
    for (const c of R.fighters) { if (c === f || !c.ai || c.dead || !hostile(f, c)) continue; const d = Math.hypot(c.x - f.x, c.y - f.y); if (d < bd && X.W.los(f.x, f.y, c.x, c.y)) { bd = d; best = c; } }
    if (!best) return null;
    a.foe = best; a.lostT = 0; a.lastX = best.x; a.lastY = best.y;
    if (a.state !== 'combat') { a.state = 'combat'; a.aware = 1; a.cd = rand(.2, .6); X.say(f, 'alert', .9); }
    return best;
  }

  // ------------------------------------------------------------------ what each man does this instant
  X.aiUpdate = function (f, dt) {
    // whom he minds this instant: one of you, or a man (or beast) of another band who is nearer or already at his throat
    const R = X.R, a = f.ai, E = f.E, pl = X.mark(f), fo = foeOf(f, dt), P = fo && !(a.state === 'combat' && a.seesP && Math.hypot(pl.x - f.x, pl.y - f.y) < Math.hypot(fo.x - f.x, fo.y - f.y)) ? fo : pl, dx = P.x - f.x, dy = P.y - f.y, d = Math.hypot(dx, dy);
    f.mvx = f.mvy = 0;
    if (E.captive || a.state === 'yield' || a.state === 'gone') return meek(f, P, d, dt);
    if (d > 1700 && a.state === 'idle' && !a.go) return;
    a.tick -= dt;
    if (a.tick <= 0) {
      a.tick = .12;
      if (P.ai) { a.sees = d < 700 && X.W.los(f.x, f.y, P.x, P.y); a.seesP = false; if (a.sees) { a.lastX = P.x; a.lastY = P.y; a.lostT = 0; } else if ((a.lostT += .12) > 5) a.foe = null; }
      else { sense(f, P, d, dx, dy); a.seesP = a.sees; }
    }
    if (f.stagger > 0) return;
    const lb = [1, .72, .5][X.legsBad(f)], run = WALK * 1.42 * E.speed * f.lf * lb, walk = WALK * .5 * E.speed * lb;
    if (a.state === 'idle') {
      f.blocking = false; a.wait -= dt; a.draw = Math.min(a.draw, 0);
      const L = a.leader;
      if (L && !L.dead) {
        if (L.ai.state === 'combat') { X.alert(f, true, L.ai.tgt); return; }
        const tx = L.x + a.off.x, ty = L.y + a.off.y, dl = Math.hypot(tx - f.x, ty - f.y);
        if (dl > 34) aiMove(f, tx, ty, dl > 130 ? run : walk * 1.5, dt, true); else X.turn(f, L.ang + Math.sin(R.time * .5 + a.seed) * .8, 1.4, dt);
      } else if (a.go) {
        if (Math.hypot(a.go.x - f.x, a.go.y - f.y) < 12 || a.wait < -60) { a.go = null; a.wait = rand(2, 6); } else if (!aiMove(f, a.go.x, a.go.y, a.goSpd || walk * 1.3, dt, true)) a.go = null;
      } else if (a.post) {
        if (Math.hypot(a.post.x - f.x, a.post.y - f.y) > 12) aiMove(f, a.post.x, a.post.y, walk * 1.4, dt, true);
        else X.turn(f, a.post.face + Math.sin(R.time * .35 + a.seed) * .6, 1.2, dt);
      } else if (a.patrol) {
        const t = a.patrol[a.pi];
        if (Math.hypot(t.x - f.x, t.y - f.y) < 26) { if (a.wait < -3) { a.pi = (a.pi + 1) % a.patrol.length; a.wait = 0; } }
        else { if (!aiMove(f, t.x, t.y, walk * 1.2, dt, true)) a.pi = (a.pi + 1) % a.patrol.length; a.wait = 0; }
      } else if (a.dest) {
        if (Math.hypot(a.dest.x - f.x, a.dest.y - f.y) < 8 || a.wait < -8) { a.dest = null; a.wait = rand(3, 9); } else aiMove(f, a.dest.x, a.dest.y, walk, dt, true);
      } else if (a.wait <= 0) {
        const x = a.home.x + rand(-60, 60), y = a.home.y + rand(-60, 60);
        if (!boxSolid(x, y, 5)) a.dest = { x, y }; else a.wait = 1;
      } else if (a.lookT > 0) { a.lookT -= dt; X.turn(f, a.lookA, 1.5, dt); } else if (Math.random() < dt * .25) { a.lookT = 1.5; a.lookA = f.ang + rand(-1.6, 1.6); }
    } else if (a.state === 'investigate') {
      f.blocking = false; a.goT += dt;
      if (Math.hypot(a.poi.x - f.x, a.poi.y - f.y) > 16 && a.goT < 12) { if (!aiMove(f, a.poi.x, a.poi.y, WALK * .8 * E.speed * lb, dt, true)) a.goT = 99; }
      else { a.wait -= dt; X.turn(f, f.ang + 1, 1.3, dt); if (a.wait <= 0 && a.search > 0) {      // he lost you a moment ago: he does not shrug at once, but tries the corners round where you were
        a.search--; for (let i = 0; i < 8; i++) { const x = a.lastX + rand(-130, 130), y = a.lastY + rand(-130, 130); if (!boxSolid(x, y, 5)) { a.poi = { x, y }; break; } } a.wait = rand(1.5, 3); a.goT = 0; a.aware = Math.max(a.aware, .5);
      } else if (a.wait <= 0) { a.state = 'idle'; a.wait = 0; a.search = 0; if (Math.random() < .6) X.say(f, 'hmph', .8); if (!a.post && !a.patrol && !a.leader) a.go = { x: a.home.x, y: a.home.y }; } }
    } else if (a.state === 'flee') {
      f.blocking = false; a.fleeT -= dt; const tx = f.x - dx / (d || 1) * 200, ty = f.y - dy / (d || 1) * 200;
      if (!aiMove(f, tx, ty, run, dt, true)) aiMove(f, a.home.x, a.home.y, run, dt, true);
      if (a.fleeT <= 0 && E.passive) { a.state = 'idle'; a.home = { x: f.x, y: f.y }; a.wait = 2; }
      else if (a.fleeT <= 0) { a.state = 'investigate'; a.poi = { x: a.lastX, y: a.lastY }; a.wait = 4; a.goT = 0; }
    } else combat(f, P, dt, d, dx, dy, run);
  };

  // Men who are on the same quarry share it out between them, and look again every second or so. The nearest fit man
  // (or their captain) presses: he is the one who fights you face to face. The next goes round to flank. The third
  // holds the other side behind his guard and pushes up slowly. Any more wait their turn. When one falls, tires or
  // is beaten back, the parts move up. Beasts know none of this and come on together.
  function squad(f) {
    const R = X.R, a = f.ai; if (a.role && a.roleT > R.time) return a.role;
    const tg = o => o.ai.foe || o.ai.tgt || X.P, who = tg(f), fac = f.E.faction, L = R.fighters.filter(o => o.ai && !o.dead && o.E.faction === fac && o.band === f.band && (!o.E.quad || o.type === f.type) && o.ai.state === 'combat' && tg(o) === who && !(o.E.archer && !o.ai.melee));
    const sc = o => Math.hypot(o.x - who.x, o.y - who.y) - (o.ai.role === 'press' ? 40 : 0) - (o.E.boss ? 500 : 0) + (o.stagger > 0 || o.stam < 22 ? 70 : 0);
    L.sort((p, q) => sc(p) - sc(q));
    // The Duke's men are drilled: one engages, the next two close up behind their guards as a line, and only then does
    // one go round. Hill bandits have no line: one comes in, the others circle for your back like dogs, and nobody
    // stands where he might be hit. Wolves do the same, and never wait.
    const PARTS = f.grp && f.grp.ag >= 3 ? ['press', 'press', 'flank', 'flank'] : fac === 'raider' ? ['press', 'hold', 'hold', 'flank'] : fac === 'beast' ? ['press', 'flank', 'flank', 'flank'] : ['press', 'flank', 'flank', 'wait'];
    L.forEach((o, i) => { const r = PARTS[i] || (fac === 'beast' ? 'flank' : 'wait'); if (o.ai.role !== r) { o.ai.role = r; o.ai.push = 125; } o.ai.roleT = R.time + rand(.8, 1.3); });
    return a.role || 'press';
  }
  function combat(f, P, dt, d, dx, dy, run) {
    const R = X.R, a = f.ai, E = f.E, toP = Math.atan2(dy, dx);
    if (away(P)) { a.state = 'idle'; a.wait = 2; a.tgt = null; f.blocking = false; return; }
    if (X.neutral(f)) { a.state = 'idle'; a.aware = 0; f.blocking = false; return; }
    if (!a.sees) {
      f.blocking = false; a.lostT += dt; a.draw = Math.min(a.draw, 0);
      const dl = Math.hypot(a.lastX - f.x, a.lastY - f.y);
      if (dl < 20 || a.lostT > 10) { a.state = 'investigate'; a.poi = { x: a.lastX + rand(-50, 50), y: a.lastY + rand(-50, 50) }; a.wait = 5; a.goT = 0; a.aware = .6; a.search = E.skill > .5 ? 3 : 2; if (Math.random() < .6) X.say(f, 'call', 1); }
      else if (!aiMove(f, a.lastX, a.lastY, run, dt, true)) a.lostT += dt * 3;
      return;
    }
    const ux = dx / (d || 1), uy = dy / (d || 1);
    if (E.archer) {
      a.melee = d < 44 || (a.melee && d < 70);
      if (!a.melee) {
        const bw = I[f.eq.weapon.id], xb = !!bw.xbow;
        X.turn(f, toP, 6, dt);
        if (d < 110) { f.mvx = -ux * WALK * .7; f.mvy = -uy * WALK * .7; if (boxSolid(f.x + f.mvx * .3, f.y + f.mvy * .3, 5)) f.mvx = f.mvy = 0; }
        else if (d > (xb ? 640 : 520)) { aiMove(f, P.x, P.y, run, dt, false); a.draw = Math.min(a.draw, 0); return; }
        a.draw += dt;
        if (a.draw > (xb ? 1.5 : 1.25) && Math.abs(angDiff(toP, f.ang)) < .15) { X.fire(f, .5, bw); a.draw = xb ? -rand(3, 3.8) : -rand(.9, 1.6); }
        return;
      }
      a.draw = Math.min(a.draw, 0);
    }
    const w = wd(f), reach = w.reach * RS + P.r - 2, eng = Math.max(reach * .9, P.r + f.r + 11);      // never closer than bodies allow
    X.turn(f, toP, f.atk ? (f.atk.phase === 'windup' ? 3.5 : .7) : 7, dt);
    // react to the player's wind-up: guard, perhaps parry, perhaps step back
    const pa = P.atk;
    if (pa && pa.phase === 'windup' && a.reacted !== pa && !pa.w.ranged && d < pa.w.reach * RS + 30 && Math.abs(angDiff(toP + Math.PI, P.ang)) < 1) {
      a.reacted = pa;
      if (!E.noBlock && !f.atk && Math.random() < E.skill * .85 + (shield(f) ? .2 : 0)) { a.blockUntil = R.time + pa.dur + rand(.3, .7); a.parry = Math.random() < E.skill * .28; }
      else if (Math.random() < E.skill * .35 + (E.quad ? .3 : 0)) X.dodge(f, -ux, -uy);
    }
    f.blocking = a.blockUntil > R.time && !f.atk && f.stam > 5;
    if (f.atk) {
      // a practised man will show a blow and pull it, to draw your parry early
      if (a.feint && f.atk.phase === 'windup' && f.atk.t > f.atk.dur * .62) { f.atk = null; a.feint = false; a.cd = .12; return; }
      if (f.atk.phase === "windup" && d > eng) { f.mvx = ux * WALK * .6; f.mvy = uy * WALK * .6; }
      return;
    }
    if (E.kicks && P.blocking && P.blockT > .9 && d < 26 && (f.kickCd || 0) <= 0 && Math.random() < dt * 1.6) { X.kick(f); return; }
    // ---- each man has his part (see squad): only the one who presses comes straight at you
    // A group that is not yet set on blood does not rush you. It faces you, shows its teeth and keeps its distance:
    // the timid give ground and run if you press them; the wary hold, and come for you if you crowd them or will
    // not go away. Strike any one of them and the matter is settled for all of them.
    { const g = f.grp;
      if (g && !P.ai && g.ag < 2 && !g.prov) {
        const keep = g.ag ? 125 : 185; a.warnT = (a.warnT || 0) + dt; f.blocking = !E.quad && d < 150 && f.stam > 20;
        if (!g.warned) { g.warned = true; X.tell(P, E.quad ? 'The wolves do not come on. They circle, and watch you.' : g.ag ? `${G.cap(nm(f))} squares up to you and does not move. "${G.pick(['That is ours. Walk on.', 'Not one step nearer.', 'Find your own. Go on.'])}"` : `${G.cap(nm(f))} backs off with his hands wide. "${G.pick(['No quarrel. No quarrel.', 'We are going. Leave it.', 'Easy. Easy now.'])}"`, 'dim'); }
        if (Math.random() < dt * .3) X.say(f, 'taunt', .8);
        if (g.ag === 0 && d < 75) { a.state = 'flee'; a.fleeT = rand(5, 8); X.say(f, 'fear', .9); return; }
        if (g.ag === 1 && (d < 62 || (a.warnT > 9 && d < 230))) { g.prov = true; X.tell(P, E.quad ? 'The wolves have made up their minds.' : `${G.cap(nm(f))} has had enough of you.`, 'bad'); }
        else { const s = d < keep - 15 ? -.75 : d > keep + 40 ? .5 : 0; a.strafeT -= dt; if (a.strafeT <= 0) { a.strafeT = rand(1.5, 3.5); a.strafe = -a.strafe; } f.mvx = (-uy * a.strafe * (E.quad ? .6 : .2) + ux * s) * WALK; f.mvy = (ux * a.strafe * (E.quad ? .6 : .2) + uy * s) * WALK; return; }
      }
    }
    const role = E.quad && f.type !== 'wolf' && f.type !== 'hound' ? 'press' : squad(f);
    // a bandit will not trade blows with a man who is ready for him: faced by a raised guard, he gives ground and waits for a better moment
    if (E.faction === 'bandit' && !E.boss && P.blocking && d < eng + 30 && a.backoff <= 0 && Math.random() < dt * 1.4) a.backoff = rand(.5, 1.1);
    if (role !== 'press' && d > eng * .9 && !(P.atk && d < eng + 20)) {
      if (role === 'flank') {      // round to your back, wide of your weapon, and only then in
        const back = P.ang + Math.PI;
        if (Math.abs(angDiff(toP + Math.PI, back)) > .9 && d < 260) { const ba = back + a.strafe * .7, r = Math.max(eng + 14, 62); aiMove(f, P.x + Math.cos(ba) * r, P.y + Math.sin(ba) * r, d > 110 ? run : WALK * 1.25 * E.speed, dt, false); return; }
      } else {      // hold: stand off with his guard up and close the distance a pace at a time. wait: stay back until there is room
        a.push = Math.max(role === 'hold' ? eng + 4 : 120, (a.push || 125) - dt * (role === 'hold' ? 7 : 0));
        if (d > a.push + 8) { aiMove(f, P.x, P.y, d > 190 ? run : WALK * .8 * E.speed, dt, false); return; }
        if (d > eng + 6 || role === 'wait') {
          const s = d < a.push - 8 ? -.6 : 0; f.mvx = (-uy * a.strafe * .35 + ux * s) * WALK; f.mvy = (ux * a.strafe * .35 + uy * s) * WALK;
          a.strafeT -= dt; if (a.strafeT <= 0) { a.strafeT = rand(1.5, 3.5); a.strafe = -a.strafe; }
          if (role === 'hold' && d < 110 && f.stam > 30) f.blocking = true; return;
        }
      }
    }
    if (a.backoff > 0 || f.stam < 22) {
      a.backoff -= dt; f.mvx = -ux * WALK * .7; f.mvy = -uy * WALK * .7;
      if (boxSolid(f.x + f.mvx * .3, f.y + f.mvy * .3, 5)) { f.mvx = -uy * WALK * .6 * a.strafe; f.mvy = ux * WALK * .6 * a.strafe; }
      return;
    }
    if (d > eng) {
      // if a friend already stands between him and you he does not queue behind: he comes round the side
      let tx = P.x, ty = P.y;
      if (d < 170) for (const o of R.fighters) { if (o === f || !o.ai || o.dead || o.ai.state !== 'combat' || o.ai.tgt !== a.tgt) continue; const od = Math.hypot(o.x - P.x, o.y - P.y); if (od < d && Math.abs(angDiff(Math.atan2(o.y - P.y, o.x - P.x), toP + Math.PI)) < .8) { tx -= uy * 48 * a.strafe; ty += ux * 48 * a.strafe; break; } }
      aiMove(f, tx, ty, d > 80 ? run : WALK * 1.1 * E.speed, dt, false); return;
    }
    a.strafeT -= dt; if (a.strafeT <= 0) { a.strafeT = rand(.8, 2.2); a.strafe = -a.strafe; }
    f.mvx = -uy * WALK * .4 * a.strafe; f.mvy = ux * WALK * .4 * a.strafe;
    if (f.blocking) return;
    a.cd -= dt;
    if (a.cd <= 0 && Math.abs(angDiff(toP, f.ang)) < .5 && X.startAttack(f)) {
      a.hold = Math.random() < .25 ? rand(.2, .55) : 0; a.cd = rand(.5, 1.3) / (.6 + E.skill);
      a.feint = !E.quad && Math.random() < E.skill * .24;
      if (Math.random() < (E.quad ? .8 : .3)) a.backoff = rand(.4, .9) + w.windup + w.recover;
      if (E.quad) X.say(f, 'effort', .8); else if (Math.random() < .14) X.say(f, 'taunt', .9);
    }
  }
})();
