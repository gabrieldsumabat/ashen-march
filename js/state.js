'use strict';
// The save game and everything that happens between raids: your character sheet, skills and level,
// the shelter (the Hollow) and its works, making things, the larder, insurance, gleaners, and the turn of the day.
//
// G.me is whoever is going up into the ruins: normally the save itself (eq / pockets / pouch), or a throwaway gleaner.
(function () {
  const I = G.ITEMS, KEY = 'ashenmarch_v2';
  G.SLOTS = ['head', 'body', 'legs', 'weapon', 'off', 'side', 'belt', 'pack'];
  G.ZONES = ['head', 'thorax', 'stomach', 'larm', 'rarm', 'lleg', 'rleg'];
  G.ZNAME = { head: 'head', thorax: 'chest', stomach: 'belly', larm: 'left arm', rarm: 'right arm', lleg: 'left leg', rleg: 'right leg' };
  G.BASEHP = { head: 35, thorax: 85, stomach: 70, larm: 60, rarm: 60, lleg: 65, rleg: 65 };

  G.STORY = [
    'Four days ago the Duke\'s host came up the south road. By dusk Dunmere was burning.',
    'They took the grain, the stock and anyone worth ransoming. Then the army marched on, and left the March to whoever wanted what remained: bandits out of the hills, raiders who slipped the column to plunder for themselves, a captain set to hold the castle, and the wolves that follow every war.',
    'You were born here. You lived because you were under the floor of the Burnt Hart when the roof came down. A handful of others lived too. They call the cellar the Hollow now.',
    'There is no one coming. Go up into the ruins, bring back what keeps people alive, and last as many days as you can.'
  ];

  // ---------------------------------------------------------------- skills
  G.SKILLS = {
    vigor: { name: 'Vigor', text: 'Sprinting, dodging and hard fighting build wind.', per: l => `+${l * 2}% stamina recovery, +${Math.round(l * 1.5)} stamina` },
    might: { name: 'Might', text: 'Dealing wounds and carrying weight build strength.', per: l => `+${(l * 1.2).toFixed(0)}% damage, +${l} lb before you are burdened` },
    hardiness: { name: 'Hardiness', text: 'Being hurt and living through it.', per: l => `+${l}% health, bleeding ${Math.round(l * 1.5)}% slower` },
    fieldcraft: { name: 'Fieldcraft', text: 'Moving unseen near men who would kill you, and striking them unawares.', per: l => `seen from ${l * 2}% closer, ${l * 2}% quieter` },
    scavenging: { name: 'Scavenging', text: 'Searching bodies, chests and corners.', per: l => `search ${l * 3}% faster` },
    leechcraft: { name: 'Leechcraft', text: 'Binding wounds, your own for now.', per: l => `treat ${l * 3}% faster, mend ${l * 2}% more` },
    guard: { name: 'Guard', text: 'Blows caught and blows turned aside.', per: l => `guarding costs ${l * 2}% less, parry window +${l * 5} ms` },
    blades: { name: 'Blades', text: 'Knives, daggers and swords.', per: l => `${(l * 1.2).toFixed(0)}% quicker, ${(l * 1.2).toFixed(0)}% less tiring` },
    hafted: { name: 'Hafted', text: 'Clubs, axes, maces and hammers.', per: l => `${(l * 1.2).toFixed(0)}% quicker, ${(l * 1.2).toFixed(0)}% less tiring` },
    pole: { name: 'Polearms', text: 'Staves, spears, bills and poleaxes.', per: l => `${(l * 1.2).toFixed(0)}% quicker, ${(l * 1.2).toFixed(0)}% less tiring` },
    archery: { name: 'Archery', text: 'Bow and crossbow.', per: l => `${(l * 1.2).toFixed(0)}% quicker draw, steadier aim` }
  };
  G.skillNeed = l => 15 * l * (l + 1);                                  // points needed in all to reach level l
  G.skillLvl = k => { const p = (G.save.skills[k] || 0); return Math.min(20, Math.floor((-1 + Math.sqrt(1 + 4 * p / 15)) / 2)); };
  G.skillUps = [];
  G.addSkill = (k, pts) => {
    if (G.me !== G.save || pts <= 0) return;
    const b = G.skillLvl(k); G.save.skills[k] = (G.save.skills[k] || 0) + pts;
    const a = G.skillLvl(k); if (a > b) G.skillUps.push(`${G.SKILLS[k].name} is now ${a}.`);
  };
  G.xpNeed = l => 400 + 220 * (l - 1);
  G.addXP = n => {
    const s = G.save; if (G.me !== s) return 0; s.xp += Math.round(n); let up = 0;
    while (s.xp >= G.xpNeed(s.level)) { s.xp -= G.xpNeed(s.level); s.level++; up++; }
    return up;
  };

  // ---------------------------------------------------------------- save
  G.newSave = () => {
    const s = {
      v: 2, coin: 150, day: 1, started: false, ironman: false, inRaid: false, kept: 0,      // kept: the day a save file was last downloaded
      stash: { w: 10, h: 20, items: [] }, overflow: { w: 10, h: 5, items: [] },
      eq: { head: null, body: null, legs: null, weapon: null, off: null, side: null, belt: null, pack: null },
      pockets: { w: 2, h: 1, items: [] }, pouch: { w: 2, h: 1, items: [] },
      hp: {}, energy: 100, hydr: 100, starving: false, xp: 0, level: 1, skills: {}, larder: 6,
      up: {}, jobs: [], rep: {}, spent: {}, bought: {}, tasks: {}, prog: {}, flags: {},
      stats: { raids: 0, survived: 0, deaths: 0, kills: {}, maps: {}, gleans: 0, freed: 0, spared: 0 }, journal: [], kit: null,
      history: [], places: {},      // history: the last ventures, for the Journal. places: the named places you have set foot in, by map.
      opts: { sens: 1, vol: .5, mus: .6, fov: 74, bright: 1, gfx: 'high' }, returns: [], gleanDay: 2, folk: 0, boy: null, pell: 'blades', note: 'Maud: "Take what you need from the shelves and put it on. Go up by the South Ford and learn the ground before you try anything clever. Be down again before dark." — There is linen and a pot of salve on your belt: ' + 'H treats your worst hurt.' + ' ' + 'Drag things from the stash onto yourself; right-click anything for more.' + ' Tasks, trade and the shelter are on the tabs to the right.'
    };
    for (const z of G.ZONES) s.hp[z] = 1;
    s.eq.weapon = G.mk('hatchet'); s.eq.body = G.mk('leather_jack'); s.eq.pack = G.mk('sack'); s.eq.belt = G.mk('rope_belt');
    G.inv.add(s.eq.belt.c, G.mk('bandage', 2)); G.inv.add(s.eq.belt.c, G.mk('salve'));      // something for a bleed and something to mend with, already on you
    for (const [id, n] of [['cudgel', 1], ['rusty_knife', 1], ['coif', 1], ['bandage', 3], ['ligature', 1], ['salve', 1], ['bread', 2], ['turnip', 2], ['ale', 1], ['waterskin', 1], ['willow', 2]]) G.inv.add(s.stash, G.mk(id, n));
    G.inv.add(s.pockets, G.mk('ligature', 1));
    return s;
  };
  G.migrate = () => {
    const s = G.save, f = G.newSave();
    for (const k in f) if (s[k] === undefined) s[k] = f[k];
    for (const k in G.MODULES) if (s.up[k] === undefined) s.up[k] = 0;
    for (const k in f.opts) if (s.opts[k] === undefined) s.opts[k] = f.opts[k];
    for (const k in f.stats) if (s.stats[k] === undefined) s.stats[k] = f.stats[k];
    for (const z of G.ZONES) if (s.hp[z] === undefined) s.hp[z] = 1;
    if (!s.daily) s.daily = G.rollDaily ? G.rollDaily() : [];
    if (!s.journal.length) G.log('The roof of the Burnt Hart is gone. The cellar held. Maud counted eleven of us by candle, and then put the candle out.');
  };
  G.persist = () => { try { localStorage.setItem(KEY, JSON.stringify(G.save)); return true; } catch (e) { return false; } };
  // a save that says you are still up in the ruins was closed mid-venture: you did not come back
  const fallen = s => { if (s.inRaid) { G.loseCarried(); s.inRaid = false; s.stats.deaths++; s.note = 'You went up into the ruins and did not come back down. Whatever you carried is gone.'; } };
  G.load = () => {
    let s = null;
    try { s = JSON.parse(localStorage.getItem(KEY)); } catch (e) { }
    if (!s || s.v !== 2) s = G.newSave();
    G.save = G.me = s; G.migrate(); fallen(s);
    G.persist();
  };
  G.reset = () => { G.save = G.me = G.newSave(); G.migrate(); G.persist(); };
  G.best = () => { try { return +(localStorage.getItem('ashenmarch_best') || 0); } catch (e) { return 0; } };
  G.log = text => { const j = G.save.journal; j.push({ day: G.save.day, text }); if (j.length > 80) j.shift(); };

  // ---------------------------------------------------------------- keeping the save outside the browser
  // The game keeps your days in this browser's own storage and nowhere else. A save file is the same thing written
  // out, to put away somewhere safe or to carry to another browser or machine. Nothing is ever sent anywhere.
  // A file that is read back in may have been damaged or altered, so nothing in it is trusted: every number is
  // clamped, every thing must be a thing this game knows and must fit where it lies, and no text keeps any markup.
  const TAG = 'ashen-march', MAXFILE = 3e6;
  const num = (v, lo, hi, d) => { v = +v; return isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d; };
  const int = (v, lo, hi, d) => Math.round(num(v, lo, hi, d));
  const obj = v => v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  function plain(v, depth) {
    if (typeof v === 'string') return v.replace(/[<>]/g, '').slice(0, 2000);
    if (typeof v === 'number') return isFinite(v) ? v : 0;
    if (typeof v === 'boolean') return v;
    if (!v || typeof v !== 'object' || depth > 12) return null;
    if (Array.isArray(v)) return v.slice(0, 2000).map(x => plain(x, depth + 1));
    const o = {};
    for (const k of Object.keys(v).slice(0, 2000)) if (k !== '__proto__' && k !== 'constructor' && k !== 'prototype') o[k.replace(/[<>]/g, '')] = plain(v[k], depth + 1);
    return o;
  }
  // One thing, or one container of things, rebuilt from data that came from outside: a save file, or another player's
  // machine. Only things this game knows survive, with every number forced into its proper range. lost.n counts the rest.
  const own = (o, k) => typeof k === 'string' && Object.prototype.hasOwnProperty.call(o, k);
  const cleanItem = G.cleanItem = (it, depth, lost) => {
    depth = depth || 0;
    if (!it || typeof it !== 'object' || !own(I, it.id) || depth > 4) { if (it && lost) lost.n++; return null; }
    const df = I[it.id], o = { id: it.id };
    if (df.stack) o.n = int(it.n, 1, df.stack, 1);
    if (df.cond) o.dur = num(it.dur, 0, 1, 1);
    if (df.pool) o.u = num(it.u, 0, df.pool, df.pool);
    if (it.fir) o.fir = true; if (it.ins) o.ins = true; if (it.r && df.w !== df.h) o.r = true;
    if (it.id === 'dispatch') o.t = int(it.t, 0, G.LETTERS.length - 1, 0);
    if (df.cw) o.c = cleanBox(it.c, df.cw, df.ch, df.only, depth + 1, lost);
    return o;
  };
  const cleanBox = G.cleanBox = (c, w, h, only, depth, lost) => {
    const out = { w, h, items: [] }; if (only) out.only = only;
    for (const e of (c && Array.isArray(c.items) ? c.items : []).slice(0, 600)) {
      const it = e && cleanItem(e.it, depth, lost); if (!it) continue;
      const x = int(e.x, 0, 99, 0), y = int(e.y, 0, 99, 0);
      if (G.inv.fits(out, it, x, y)) out.items.push({ it, x, y }); else if (!G.inv.add(out, it) && lost) lost.n++;
    }
    return out;
  };
  G.canStore = () => { try { localStorage.setItem('ashenmarch_probe', '1'); localStorage.removeItem('ashenmarch_probe'); return true; } catch (e) { return false; } };
  G.saveFile = () => {
    if (G.raid && G.raid.active()) return null;      // never while you are up in the ruins: a venture is all or nothing
    const s = G.save, d = new Date(), p = n => String(n).padStart(2, '0');
    return {
      name: `ashen-march-day-${s.day}-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}.json`,
      text: JSON.stringify({ game: TAG, v: s.v, written: d.toISOString(), day: s.day, level: s.level, best: Math.max(G.best(), s.day - 1), save: s })
    };
  };
  // Read the text of a save file, or the bare save text. Returns { save, best, left } (left = things that could not be
  // kept) or { error }. The game in play is not touched.
  G.readSave = text => {
    const no = 'That is not a save from this game.';
    if (typeof text !== 'string' || !text.trim()) return { error: 'There is nothing in that file.' };
    if (text.length > MAXFILE) return { error: 'That file is far too large to be a save.' };
    let d = null; try { d = JSON.parse(text); } catch (e) { return { error: no }; }
    let best = 0; if (d && d.game === TAG && d.save) { best = int(d.best, 0, 1e5, 0); d = d.save; }
    if (!d || typeof d !== 'object' || Array.isArray(d) || !d.stash || !d.eq) return { error: no };
    if (d.v !== 2) return { error: d.v > 2 ? 'That save is from a newer version of the game than this one.' : 'That save is from an older version of the game and cannot be read.' };
    const f = G.newSave(), s = plain(d, 0), lost = { n: 0 };
    const item = (it, depth) => cleanItem(it, depth, lost), box = (c, w, h, only, depth) => cleanBox(c, w, h, only, depth, lost);
    for (const k of ['started', 'ironman', 'inRaid', 'starving']) s[k] = !!s[k];
    s.v = 2; s.coin = int(s.coin, 0, 1e7, f.coin); s.day = int(s.day, 1, 1e5, 1); s.level = int(s.level, 1, 500, 1); s.xp = int(s.xp, 0, 1e9, 0);
    s.larder = num(s.larder, 0, 1e4, f.larder); s.energy = num(s.energy, 0, 100, 100); s.hydr = num(s.hydr, 0, 100, 100); s.gleanDay = int(s.gleanDay, 1, 1e6, f.gleanDay); s.folk = int(s.folk, 0, 1e5, 0); s.kept = int(s.kept, 0, 1e5, 0);
    const hp = obj(s.hp); s.hp = {}; for (const z of G.ZONES) s.hp[z] = num(hp[z], 0, 1, 1);
    const sk = obj(s.skills); s.skills = {}; for (const k in G.SKILLS) if (sk[k] !== undefined) s.skills[k] = num(sk[k], 0, 1e7, 0);
    const up = obj(s.up); s.up = {}; for (const k in G.MODULES) s.up[k] = int(up[k], 0, (G.MODULES[k].levels || []).length, 0);
    for (const k of ['rep', 'spent', 'bought']) { const o = obj(s[k]); s[k] = {}; for (const q in o) s[k][q] = num(o[q], 0, 1e9, 0); }
    for (const k of ['tasks', 'flags']) s[k] = obj(s[k]);
    const pr = obj(s.prog); s.prog = {}; for (const k in pr) if (Array.isArray(pr[k])) s.prog[k] = pr[k].slice(0, 8).map(v => num(v, 0, 1e6, 0));
    const st = obj(s.stats), kl = obj(st.kills), mp = obj(st.maps); s.stats = { kills: {}, maps: {} };
    for (const k of ['raids', 'survived', 'deaths', 'gleans', 'freed', 'spared']) s.stats[k] = int(st[k], 0, 1e7, 0);
    for (const k in kl) if (own(G.ENEMIES, k)) s.stats.kills[k] = int(kl[k], 0, 1e7, 0);
    for (const m of G.MAPS) if (mp[m.id]) s.stats.maps[m.id] = int(mp[m.id], 0, 1e7, 0);
    s.journal = (Array.isArray(s.journal) ? s.journal : []).filter(e => e && typeof e.text === 'string').slice(-80).map(e => ({ day: int(e.day, 1, 1e5, 1), text: e.text }));
    s.history = (Array.isArray(s.history) ? s.history : []).filter(e => e && typeof e === 'object').slice(-20).map(e => ({ day: int(e.day, 1, 1e5, 1), map: G.MAPS.some(m => m.id === e.map) ? e.map : G.MAPS[0].id, out: ['extract', 'dead', 'lost'].includes(e.out) ? e.out : 'lost', cut: !!e.cut, min: int(e.min, 0, 999, 0), kills: int(e.kills, 0, 999, 0), val: int(e.val, -1e7, 1e7, 0), with: typeof e.with === 'string' ? e.with.slice(0, 60) : '' }));
    const pl = obj(s.places); s.places = {}; for (const m of G.MAPS) { const z = obj(pl[m.id]); s.places[m.id] = {}; for (const k of Object.keys(z).slice(0, 80)) s.places[m.id][k] = 1; }
    const op = obj(s.opts);
 s.opts = { sens: num(op.sens, .3, 2.5, 1), vol: num(op.vol, 0, 1, .5), mus: num(op.mus, 0, 1, .6), fov: int(op.fov, 60, 95, 74), bright: num(op.bright, .7, 1.6, 1), gfx: ['high', 'medium', 'low'].includes(op.gfx) ? op.gfx : 'high' };
    s.note = typeof s.note === 'string' ? s.note : null; s.pell = own(G.SKILLS, s.pell) ? s.pell : 'blades';
    s.boy = s.boy && typeof s.boy === 'object' && G.BOY[s.boy.tier] ? { tier: int(s.boy.tier, 0, G.BOY.length - 1, 0), day: int(s.boy.day, 1, 1e6, s.day + 1) } : null;
    s.jobs = (Array.isArray(s.jobs) ? s.jobs : []).filter(j => j && G.RECIPES.some(r => r.id === j.r)).slice(0, 40).map(j => ({ r: j.r, day: int(j.day, 1, 1e6, s.day + 1) }));
    s.returns = (Array.isArray(s.returns) ? s.returns : []).slice(0, 40).map(r => ({ day: int(r && r.day, 1, 1e6, s.day + 1), items: (r && Array.isArray(r.items) ? r.items : []).slice(0, 80).map(it => item(it, 0)).filter(Boolean) })).filter(r => r.items.length);
    const kit = s.kit; s.kit = null;
    if (kit && typeof kit === 'object') { const list = a => (Array.isArray(a) ? a : []).filter(e => Array.isArray(e) && own(I, e[0])).slice(0, 80).map(e => [e[0], int(e[1], 1, 999, 1)]), k = s.kit = { eq: {}, pockets: list(kit.pockets), belt: list(kit.belt), pack: list(kit.pack) }; for (const sl of G.SLOTS) if (kit.eq && own(I, kit.eq[sl])) k.eq[sl] = kit.eq[sl]; }
    // the day's contracts are whole tasks kept in the save; if they are not exactly the shape the game makes, new ones are drawn
    const okObj = o => o && (o.k === 'kill' ? Array.isArray(o.who) && o.who.length > 0 && o.who.every(w => own(G.ENEMIES, w)) && (!o.map || G.MAPS.some(m => m.id === o.map)) : o.k === 'hand' ? own(I, o.id) : false) && int(o.n, 1, 999, 0) > 0;
    const okTask = t => t && typeof t.id === 'string' && own(G.TRADERS, t.by) && typeof t.name === 'string' && typeof t.text === 'string' && Array.isArray(t.objs) && t.objs.length > 0 && t.objs.every(okObj) && t.reward && typeof t.reward === 'object';
    if (!Array.isArray(s.daily) || s.daily.length > 4 || !s.daily.every(okTask)) delete s.daily;
    else for (const t of s.daily) { t.daily = true; t.reward = { coin: int(t.reward.coin, 0, 1e5, 0), rep: num(t.reward.rep, 0, 1, 0), xp: int(t.reward.xp, 0, 1e6, 0) }; for (const o of t.objs) { o.n = int(o.n, 1, 999, 1); if (o.k === 'hand') o.fir = !!o.fir; } }
    // what you own: worn things must suit their slot, and everything else must fit where it lies or find another place
    const eq = obj(s.eq); s.eq = {};
    for (const sl of G.SLOTS) { const it = item(eq[sl], 0); if (it) it.r = undefined; if (it && !G.canEquip(it, sl)) lost.n++; s.eq[sl] = it && G.canEquip(it, sl) ? it : null; }
    const pc = obj(s.pouch);
    s.stash = box(s.stash, f.stash.w, f.stash.h + 4 * (s.up.shelves || 0), null, 0); s.overflow = box(s.overflow, f.overflow.w, f.overflow.h, null, 0);
    s.pockets = box(s.pockets, f.pockets.w, f.pockets.h, null, 0); s.pouch = box(s.pouch, int(pc.w, 1, 5, f.pouch.w), int(pc.h, 1, 5, f.pouch.h), null, 0);
    return { save: s, best, left: lost.n };
  };
  // make a save that has been read the game in play
  G.adoptSave = r => {
    if (G.raid && G.raid.active()) return false;
    r.save.opts = G.save.opts;      // sensitivity, volume and graphics belong to this device, not to the tale
    G.save = G.me = r.save; G.migrate(); fallen(G.save);
    if (r.best > G.best()) try { localStorage.setItem('ashenmarch_best', r.best); } catch (e) { }
    return G.persist();
  };

  // ---------------------------------------------------------------- the character going up (G.me)
  // order matters: things are drawn from the belt first, then pockets, then the pack, then the hidden pouch
  G.carried = () => { const m = G.me; return [m.eq.belt && m.eq.belt.c, m.pockets, m.eq.pack && m.eq.pack.c, m.pouch].filter(Boolean); };
  G.carryAdd = it => { const m = G.me; return (m.eq.pack && G.inv.add(m.eq.pack.c, it)) || (m.eq.belt && G.inv.add(m.eq.belt.c, it)) || G.inv.add(m.pockets, it); };
  G.countCarried = id => G.carried().reduce((n, c) => n + G.inv.count(c, id), 0);
  // looks in belt, hands, pack and pouch, and inside any small case (a key ring) lying in them
  G.findCarried = fn => {
    const walk = c => { for (const o of c.items) { if (fn(o.it, I[o.it.id])) return { it: o.it, c }; if (o.it.c && I[o.it.id].cat === 'case') { const r = walk(o.it.c); if (r) return r; } } return null; };
    for (const c of G.carried()) { const r = walk(c); if (r) return r; } return null;
  };
  G.useUp = (it, c) => { if (it.n > 1) it.n--; else G.inv.remove(c, it); };       // spend one of a stack
  G.hasKey = id => !!G.findCarried(it => it.id === id);
  G.canEquip = (it, slot) => {
    const cat = I[it.id].cat;
    if (slot === 'weapon' || slot === 'side') return cat === 'weapon';
    if (slot === 'off') return cat === 'shield';
    return cat === slot;
  };
  G.slotFor = it => {
    const cat = I[it.id].cat, eq = G.me.eq;
    if (cat === 'weapon') return !eq.weapon ? 'weapon' : !eq.side ? 'side' : null;
    if (cat === 'shield') return eq.off ? null : 'off';
    if (cat in eq) return eq[cat] ? null : cat;
    return null;
  };
  G.allCarried = pouchToo => {
    const m = G.me, out = [];
    for (const k of G.SLOTS) if (m.eq[k]) G.eachItem(m.eq[k], it => out.push(it));
    for (const o of m.pockets.items) G.eachItem(o.it, it => out.push(it));
    if (pouchToo) for (const o of m.pouch.items) G.eachItem(o.it, it => out.push(it));
    return out;
  };
  G.weight = () => { const m = G.me; let w = 0; for (const k of G.SLOTS) if (m.eq[k]) w += G.itemWeight(m.eq[k]); for (const c of [m.pockets, m.pouch]) for (const o of c.items) w += G.itemWeight(o.it); return w; };
  G.carriedValue = () => { const m = G.me; let v = 0; for (const k of G.SLOTS) if (m.eq[k]) v += G.itemValue(m.eq[k]); for (const c of [m.pockets, m.pouch]) for (const o of c.items) v += G.itemValue(o.it); return Math.round(v); };
  G.bankCoins = cs => { let got = 0; for (const c of cs) { if (!c) continue; got += G.inv.count(c, 'coin'); c.items = c.items.filter(o => o.it.id !== 'coin'); } G.save.coin += got; return got; };
  G.loseCarried = () => { const s = G.save; for (const k of G.SLOTS) s.eq[k] = null; s.pockets.items = []; G.bankCoins([s.pouch]); };
  G.toStash = it => { const s = G.save; it.ins = undefined; return G.inv.add(s.stash, it) || G.inv.add(s.overflow, it); };

  // ---------------------------------------------------------------- the shelter
  G.MODULES = {
    hearth: { name: 'Hearth', levels: [{ need: { timber: 3, nails: 2 }, text: 'Wounds mend faster overnight (60% instead of 35%).' }, { need: { timber: 5, iron_ingot: 2, cloth: 3 }, tool: ['hammer'], text: 'A night by the fire mends you fully.' }] },
    water: { name: 'Rain Butt', levels: [{ need: { timber: 2, pitch: 1, rope: 1 }, text: 'Clean water every night. Without it you wake half-parched.' }] },
    kitchen: { name: 'Maud\'s Pot', levels: [{ need: { iron_ingot: 1, timber: 2, flint: 1 }, text: 'Food goes a quarter further in the larder.' }, { need: { iron_ingot: 2, charcoal: 3, rope: 1 }, tool: ['hammer'], text: 'A smoke-rack. Food goes half as far again.' }] },
    bench: { name: 'Osric\'s Bench', levels: [{ need: { timber: 2, nails: 3, iron_ingot: 1 }, text: 'Armour and shields can be mended for silver. Staves and cudgels can be cut.' }, { need: { timber: 4, iron_ingot: 3, rope: 1 }, tool: ['hammer'], text: 'Bandages, splints, arrows, ligatures and belts can be made.' }, { need: { iron_ingot: 4, charcoal: 4, leather: 2 }, tool: ['tongs', 'hammer'], text: 'A working forge. Weapons can be re-edged; bodkins and quarrels made.' }] },
    garden: { name: 'Herb Bed', levels: [{ need: { herbs: 3, timber: 2 }, text: 'Yields a bandage every second day. Poultices can be steeped.' }, { need: { herbs: 6, rope: 1, cloth: 2 }, text: 'Also yields a pot of salve every third day.' }] },
    door: { name: 'Barred Door', levels: [{ need: { timber: 6, nails: 4 }, text: 'Night raids on the cellar are half as likely.' }, { need: { timber: 10, rope: 2, iron_ingot: 2 }, tool: ['hammer', 'saw'], text: 'No one finds the cellar door.' }] },
    shelves: { name: 'Shelves', levels: [{ need: { timber: 4, nails: 4 }, text: 'The stash holds four more rows.' }, { need: { timber: 8, nails: 6 }, tool: ['saw'], text: 'Four more rows again.' }, { need: { timber: 12, nails: 8, iron_ingot: 2 }, tool: ['saw', 'hammer'], text: 'Four more rows again.' }] },
    perch: { name: 'The Boy\'s Perch', levels: [{ need: { timber: 3, rope: 2 }, text: 'Wat the foundling can be sent out by night to pick through the ruins. Gleaners are ready a day sooner.' }, { need: { rope: 2, leather: 2, cloth: 4 }, tool: ['needle'], text: 'Wat can be sent further, for richer pickings.' }] },
    pell: { name: 'Pell', levels: [{ need: { timber: 4, rope: 1, leather: 1 }, text: 'A post to hit. Each night you train a little at the weapon skill of your choice.' }] }
  };
  G.RECIPES = [
    { id: 'staff', out: 'quarterstaff', n: 1, need: { timber: 2 }, mod: 'bench', lvl: 1, nights: 0 },
    { id: 'cudgel', out: 'cudgel', n: 1, need: { timber: 1 }, mod: 'bench', lvl: 1, nights: 0 },
    { id: 'bandage', out: 'bandage', n: 1, need: { cloth: 2 }, mod: 'bench', lvl: 2, nights: 0 },
    { id: 'splint', out: 'splint', n: 1, need: { timber: 1, cloth: 1 }, mod: 'bench', lvl: 2, nights: 0 },
    { id: 'ligature', out: 'ligature', n: 1, need: { leather: 1 }, mod: 'bench', lvl: 2, nights: 0, tool: ['needle'] },
    { id: 'arrow', out: 'arrow', n: 6, need: { timber: 1, nails: 1 }, mod: 'bench', lvl: 2, nights: 0 },
    { id: 'belt', out: 'leather_belt', n: 1, need: { leather: 2 }, mod: 'bench', lvl: 2, nights: 1, tool: ['needle'] },
    { id: 'bodkin', out: 'bodkin', n: 8, need: { timber: 1, iron_ingot: 1 }, mod: 'bench', lvl: 3, nights: 1 },
    { id: 'bolt', out: 'bolt', n: 8, need: { timber: 1, iron_ingot: 1 }, mod: 'bench', lvl: 3, nights: 1 },
    { id: 'spear', out: 'spear', n: 1, need: { timber: 2, iron_ingot: 1 }, mod: 'bench', lvl: 3, nights: 1 },
    { id: 'salve', out: 'salve', n: 1, need: { herbs: 1, tallow: 1 }, mod: 'garden', lvl: 1, nights: 0 },
    { id: 'poultice', out: 'poultice', n: 1, need: { herbs: 3, cloth: 1 }, mod: 'garden', lvl: 1, nights: 1 },
    { id: 'ale', out: 'ale', n: 4, need: { grain: 1, herbs: 1 }, mod: 'kitchen', lvl: 1, nights: 2 }
  ];
  const cnt = id => G.inv.count(G.save.stash, id);
  G.hasAll = need => Object.keys(need).every(id => cnt(id) >= need[id]);
  G.hasTools = t => !t || t.every(id => cnt(id) > 0);
  G.spend = need => { for (const id in need) G.inv.take(G.save.stash, id, need[id]); };
  G.needText = (need, tool) => Object.keys(need).map(id => `${need[id]} ${I[id].name} (${cnt(id)})`).join(', ') + (tool ? '. Tools: ' + tool.map(id => `${I[id].name}${cnt(id) ? '' : ' (missing)'}`).join(', ') : '');
  G.canBuild = key => { const lv = G.MODULES[key].levels[G.save.up[key]]; return !!lv && G.hasAll(lv.need) && G.hasTools(lv.tool); };
  G.build = key => {
    const s = G.save, u = G.MODULES[key], lv = u.levels[s.up[key]];
    if (!G.canBuild(key)) return false;
    G.spend(lv.need); s.up[key]++; if (key === 'shelves') s.stash.h += 4;
    G.log(`${u.name} ${s.up[key] > 1 ? 'improved' : 'built'}.`); G.addXP(120); G.persist(); return true;
  };
  G.canCraft = r => G.save.up[r.mod] >= r.lvl && G.hasAll(r.need) && G.hasTools(r.tool) && !(r.nights && G.save.jobs.length >= 3);
  G.craft = r => {
    const s = G.save; if (!G.canCraft(r)) return false;
    G.spend(r.need);
    if (r.nights) s.jobs.push({ r: r.id, day: s.day + r.nights }); else G.toStash(G.mk(r.out, r.n));
    G.persist(); return true;
  };
  G.foodMult = () => [1, 1.25, 1.5][G.save.up.kitchen];
  G.storeFood = it => { const d = I[it.id]; if (!d.food) return 0; const n = d.food * (it.n || 1) * G.foodMult(); G.save.larder = Math.round((G.save.larder + n) * 100) / 100; return n; };
  G.storeAllFood = () => { const s = G.save; let n = 0; s.stash.items = s.stash.items.filter(o => { const f = G.storeFood(o.it); n += f; return !f; }); G.persist(); return n; };
  const gear = () => { const s = G.save, out = s.stash.items.map(o => o.it); for (const k of G.SLOTS) if (s.eq[k]) out.push(s.eq[k]); return out; };
  // kind: 'armour' (bench 1) or 'weapon' (bench 3)
  G.mendList = kind => gear().filter(it => it.dur != null && it.dur < .99 && ((I[it.id].cat === 'weapon') === (kind === 'weapon')));
  G.mendCost = kind => Math.ceil(G.mendList(kind).reduce((c, it) => c + I[it.id].value * (1 - it.dur) * .3, 0));
  G.mend = kind => { const c = G.mendCost(kind), s = G.save; if (!c || s.coin < c) return false; s.coin -= c; for (const it of G.mendList(kind)) it.dur = 1; G.persist(); return true; };
  // healing at home from a pot (poultice / salve), spending its pool
  G.healAtHome = it => {
    const s = G.save, d = I[it.id]; if (!d.fx || !d.fx.heal) return false; let any = false;
    for (let g = 0; g < 12 && it.u > 0; g++) {
      const z = G.ZONES.slice().sort((a, b) => s.hp[a] - s.hp[b])[0]; if (s.hp[z] >= .995) break;
      const a = Math.min(it.u, (1 - s.hp[z]) * G.BASEHP[z], 35); s.hp[z] = Math.min(1, s.hp[z] + a / G.BASEHP[z]); it.u = Math.round(it.u - a); any = true;
    }
    return any;
  };
  G.hurtPoints = () => Math.round(G.ZONES.reduce((n, z) => n + (1 - G.save.hp[z]) * G.BASEHP[z], 0));
  G.threat = () => Math.min(5, 1 + Math.floor((G.save.day - 1) / 5));

  // ---------------------------------------------------------------- insurance: the brothers go out at night for what you dropped
  const insurable = () => G.allCarried(false).filter(it => !it.ins && it.id !== 'coin' && I[it.id].cat !== 'key' && !I[it.id].quest);
  G.insureCost = () => Math.ceil(insurable().reduce((c, it) => c + I[it.id].value * (it.n || 1) * (it.dur != null ? .4 + .6 * it.dur : 1) * .13, 0));
  G.insureAll = () => { const c = G.insureCost(), s = G.save; if (!c || s.coin < c) return false; s.coin -= c; s.spent.anselm = (s.spent.anselm || 0) + c; for (const it of insurable()) it.ins = true; G.persist(); return true; };
  // called just before the dead character's gear is wiped
  G.claimInsurance = (tier, byBeast) => {
    const s = G.save, p = [.78, .58, .4][tier - 1] + (byBeast ? .15 : 0), back = [];
    for (const it of G.allCarried(false)) { if (!it.ins) continue; it.ins = undefined; if (Math.random() < p) { if (it.c) it.c = { w: it.c.w, h: it.c.h, items: [] }; it.r = undefined; back.push(it); } }
    if (back.length) s.returns.push({ day: s.day + 2 + (Math.random() < .5 ? 1 : 0), items: back });      // a night or two after the one you were carried home
    return back.length;
  };

  // ---------------------------------------------------------------- gleaners: someone else from the Hollow goes up with whatever they have
  G.gleanReady = () => G.save.day >= G.save.gleanDay;
  G.mkGleaner = () => {
    const eq = { head: null, body: null, legs: null, weapon: null, off: null, side: null, belt: null, pack: null }, m = { eq, pockets: { w: 2, h: 1, items: [] }, pouch: { w: 0, h: 0, items: [] }, gleaner: true };
    const worn = id => { const it = G.mk(id); if (it.dur != null) it.dur = G.rand(.3, .7); return it; };
    eq.weapon = worn(G.wpick([['cudgel', 3], ['rusty_knife', 2], ['hatchet', 2], ['pitchfork', 2], ['quarterstaff', 3], ['seax', 2], ['spear', .6]]));
    if (Math.random() < .4) eq.body = worn(G.wpick([['leather_jack', 3], ['gambeson', 1]]));
    if (Math.random() < .25) eq.head = worn('coif');
    eq.belt = G.mk('rope_belt'); eq.pack = G.mk(Math.random() < .25 ? 'satchel' : 'sack');
    if (Math.random() < .18) { eq.side = eq.weapon; eq.weapon = worn('bow'); G.inv.add(eq.pack.c, G.mk('arrow', G.irand(6, 12))); }
    G.inv.add(eq.belt.c, G.mk('bandage', G.irand(1, 2)));
    for (const id of [G.pick(['bread', 'turnip', 'apple']), G.pick(['willow', 'ale', 'salve'])]) G.inv.add(eq.pack.c, G.mk(id, 1));
    return m;
  };

  // ---------------------------------------------------------------- saved kit
  const listOf = c => c ? c.items.map(o => [o.it.id, o.it.n || 1]) : [];
  G.saveKit = () => { const s = G.save, k = { eq: {}, pockets: listOf(s.pockets), belt: listOf(s.eq.belt && s.eq.belt.c), pack: listOf(s.eq.pack && s.eq.pack.c) }; for (const sl of G.SLOTS) if (s.eq[sl]) k.eq[sl] = s.eq[sl].id; s.kit = k; G.persist(); };
  G.applyKit = () => {
    const s = G.save, k = s.kit; if (!k) return null; let missing = 0;
    const pull = id => { const o = s.stash.items.find(e => e.it.id === id && !(e.it.c && e.it.c.items.length)); if (o) G.inv.remove(s.stash, o.it); return o && o.it; };
    for (const sl in k.eq) { if (s.eq[sl]) continue; const it = pull(k.eq[sl]); if (it) s.eq[sl] = it; else missing++; }
    const fill = (c, list) => {
      if (!c) return;
      for (const [id, n] of list) {
        let want = n - G.inv.count(c, id);
        while (want > 0) { const o = s.stash.items.find(e => e.it.id === id && !(e.it.c && e.it.c.items.length)); if (!o) { missing++; break; } const take = Math.min(want, o.it.n || 1); let piece = o.it; if ((o.it.n || 1) > take) { o.it.n -= take; piece = Object.assign({}, o.it, { n: take }); } else G.inv.remove(s.stash, o.it); if (!G.inv.add(c, piece)) { G.inv.add(s.stash, piece); break; } want -= take; }
      }
    };
    fill(s.pockets, k.pockets || []); fill(s.eq.belt && s.eq.belt.c, k.belt || []); fill(s.eq.pack && s.eq.pack.c, k.pack || []);
    G.persist(); return missing;
  };

  // ---------------------------------------------------------------- the boy
  G.BOY = [{ cost: 40, table: 'boy1', name: 'the near cottages' }, { cost: 120, table: 'boy2', name: 'the far side of the green' }, { cost: 300, table: 'boy3', name: 'the abbey road' }];
  G.sendBoy = tier => { const s = G.save, b = G.BOY[tier]; if (s.boy || s.coin < b.cost || s.up.perch < (tier > 1 ? 2 : 1)) return false; s.coin -= b.cost; s.boy = { tier, day: s.day + 1 }; G.persist(); return true; };

  // ---------------------------------------------------------------- the day turns
  const QUIET = ['A quiet night. Rain on the trapdoor.', 'Someone cried in their sleep. No one said who.', 'Osric sharpened things until the candle went out.', 'The children played knucklebones with pig teeth. For an hour it was almost a tavern again.', 'Wind in the chimney stack all night, like a host passing.', 'Brother Anselm read the office for the dead. He has it by heart now.', 'Maud told the story of the miller\'s wife and the bishop. Even Osric laughed.', 'Frost on the inside of the trapdoor by morning.', 'A fox barked on the green half the night.'];
  const BEATS = { 2: 'Smoke still on the south road. The host is two days gone and not coming back for us, in either sense.', 4: 'More men in the ruins than yesterday. Word has gone round the hills that the March is open.', 6: 'Maud says the sergeants ride out from the Hold at dusk to count what the bandits have gathered for them.', 9: 'First frost. The dead on the green have stopped smelling.', 11: 'A pedlar\'s boy says the Crow Company have fortified the abbey and hanged the prior from his own bell-rope.', 14: 'They are better armed now. They have been stripping the same dead we have.', 18: 'A raider shouted my name across the green today. They know someone is still living here.', 23: 'Snow on the Hold\'s towers. Aldric means to winter there.', 30: 'A month. There were eleven of us. There are still eleven.' };
  G.endDay = (outcome, ctx) => {
    const s = G.save, lines = [], died = outcome !== 'extract';
    if (died) { for (const z in s.hp) s.hp[z] = Math.min(s.hp[z], .45); lines.push('They found you at the edge of the ruins and carried you down. Everything you had on you is gone.'); }
    s.day++; s.bought = {}; if (G.newDay) G.newDay(); G.log(died ? 'I did not make it back on my own feet.' : `Came back alive from ${ctx.mapName}.`);
    // supper
    const need = 2, fed = s.larder >= need; s.larder = Math.round(Math.max(0, s.larder - need) * 100) / 100; s.starving = !fed;
    s.energy = fed ? 100 : Math.max(0, s.energy - 30); s.hydr = s.up.water ? 100 : Math.min(100, Math.max(s.hydr, 20) + 45);
    lines.push(fed ? `The Hollow ate. ${Math.floor(s.larder)} portions left in the larder${s.larder < 4 ? ' — not enough.' : '.'}` : 'The larder is empty. Nobody ate. You will go up weak tomorrow.');
    // those you cut loose do what they can for the Hollow: the more of them, the oftener something is left by your bed
    { const folk = s.folk || 0; if (folk && Math.random() < Math.min(.85, .2 + folk * .07)) { const gift = G.pick([['grain', 1, 'a measure of grain'], ['cheese', 1, 'a cheese'], ['bandage', 2, 'clean linen torn for bandages'], ['salt_pork', 1, 'a side of salt pork'], ['salve', 1, 'a pot of salve']]); for (let i = 0; i < gift[1]; i++) G.toStash(G.mk(gift[0])); lines.push(`${folk > 1 ? 'The folk you cut loose have' : 'The one you cut loose has'} left ${gift[2]} by your bed.`); } }
    for (const it of [...s.stash.items.map(o => o.it), ...G.allCarried(true)]) if (it.id === 'waterskin') it.u = I.waterskin.pool;
    // wounds
    const rate = [.35, .6, 1][s.up.hearth] * (fed ? 1 : .4); let hurt = false;
    for (const z in s.hp) { if (s.hp[z] < .995) hurt = true; s.hp[z] = Math.min(1, s.hp[z] + rate); }
    if (hurt) lines.push(Object.values(s.hp).every(v => v >= .995) ? 'Your wounds have closed.' : 'You are still hurt. Brother Anselm, a poultice, or another night would help.');
    // work finished overnight
    for (const j of s.jobs.filter(j => j.day <= s.day)) { const r = G.RECIPES.find(r => r.id === j.r); if (r) { G.toStash(G.mk(r.out, r.n)); lines.push(`Ready this morning: ${I[r.out].name}${r.n > 1 ? ' ×' + r.n : ''}.`); } }
    s.jobs = s.jobs.filter(j => j.day > s.day);
    if (s.up.garden && s.day % 2 === 0) { G.toStash(G.mk('bandage', 1)); lines.push('Maud cut and boiled a bandage from the herb bed.'); }
    if (s.up.garden > 1 && s.day % 3 === 0) { G.toStash(G.mk('salve', 1)); lines.push('There is a fresh pot of salve by your pallet.'); }
    if (s.up.pell) { G.addSkill(s.pell, 18); lines.push(`An hour at the pell before sleep (${G.SKILLS[s.pell].name}).`); }
    if (s.boy && s.boy.day <= s.day) {
      const b = G.BOY[s.boy.tier]; s.boy = null;
      if (Math.random() < .1) lines.push('Wat came back at dawn with nothing but a torn sleeve. He will not say what chased him.');
      else { const got = G.rollLoot(b.table, 1); for (const it of got) { it.fir = true; G.toStash(it); } lines.push(`Wat came back from ${b.name} with ${got.length} thing${got.length === 1 ? '' : 's'}: ${got.map(it => I[it.id].name).join(', ')}.`); }
    }
    for (const r of s.returns.filter(r => r.day <= s.day)) { for (const it of r.items) G.toStash(it); lines.push(`The brothers brought back what they could find of yours: ${r.items.map(it => I[it.id].name).join(', ')}.`); }
    s.returns = s.returns.filter(r => r.day > s.day);
    // the night itself
    const r = Math.random(), raid = [.12, .06, 0][s.up.door];
    if (r < raid) { const f = Math.min(Math.floor(s.larder), 3), c = Math.min(s.coin, 25); s.larder -= f; s.coin -= c; lines.push(`Men found the cellar door in the night. They took ${f} portions and ${c} silver before Osric drove them off.`); }
    else if (r < raid + .1) { const id = G.pick(['bandage', 'turnip', 'cloth', 'timber', 'ale', 'nails', 'willow', 'apple']); G.toStash(G.mk(id, 1)); lines.push(`A stranger sheltered with us and left ${I[id].name.toLowerCase()} in thanks.`); }
    else if (r < raid + .18) { for (const k of ['head', 'body', 'legs']) if (s.eq[k] && s.eq[k].dur != null) s.eq[k].dur = Math.min(1, s.eq[k].dur + .2); lines.push('Maud sat up stitching and riveting what you wear.'); }
    else if (r < raid + .25 && s.larder >= 1) { s.larder -= 1; lines.push('Rats in the larder. One portion spoiled.'); }
    else lines.push(G.pick(QUIET));
    if (s.day === 3) lines.push('A pedlar woman, Ysolde, has found the cellar. She says she can get things, and get rid of things.');
    if (BEATS[s.day]) lines.push(BEATS[s.day]);
    for (const l of lines.slice(1)) G.log(l);
    if (s.day - 1 > G.best()) localStorage.setItem('ashenmarch_best', s.day - 1);
    let epitaph = null;
    if (died && s.ironman) { epitaph = `You lasted ${s.day - 1} day${s.day > 2 ? 's' : ''} after the sack of Dunmere, and reached level ${s.level}.`; G.reset(); }
    G.persist(); return { lines, epitaph, day: G.save.day };
  };
})();
