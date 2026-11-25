'use strict';
// Going up with friends: two to four of you in the same ruin.
//
// There is no game server, because there is nothing to pay for one with. One player's browser is the host: it moves the
// enemies and keeps what the chests and bodies hold. The others connect straight to it, browser to browser (WebRTC).
// A free public broker (PeerJS) only introduces the browsers to each other by room code; once they are joined nothing
// of the game passes through it. If the broker is down, an invitation can be carried by hand: see the pairing code.
//
// What each machine decides:
//   - your own player is yours: where you stand, whether a blow lands on you, your wounds, your pack;
//   - enemies are the host's: where they go, whom they mark, what a blow does to them;
//   - what a chest, a body or a heap on the ground holds is the host's, and only one of you may search it at a time.
//
// Nothing that arrives from another machine is trusted. Every message is a JSON array of a known kind and a bounded
// size; every number is forced into range; every thing must be a thing this game knows; names and messages are text
// only, drawn as text, never as markup. Nothing from the network can touch your save except through the game's own
// rules: things you pick up, kills counted, skill earned, each of them checked and capped here. Friends are on their
// honour not to cheat, as with one life; what is guarded against is harm, not greed.
(function () {
  const X = G.rx, I = G.ITEMS, T = G.T, ZN = G.ZONES, U = G.U, h = U.h, $ = U.$;
  const PROTO = 3, MAXP = 4, PREFIX = 'rk1-', MAXMSG = 60000, ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const SNAP = 1 / 12, SEND = 1 / 15, OFFS = [[0, 0], [24, 0], [-24, 0], [0, 24]];
  const has = (o, k) => typeof k === 'string' && Object.prototype.hasOwnProperty.call(o, k);
  const num = (v, lo, hi, d) => { v = +v; return isFinite(v) ? Math.min(hi, Math.max(lo, v)) : (d === undefined ? lo : d); };
  const int = (v, lo, hi, d) => Math.round(num(v, lo, hi, d));
  const text = (v, n) => typeof v === 'string' ? v.replace(/[<>\u0000-\u001f\u007f]/g, '').slice(0, n) : '';
  const cleanName = v => text(v, 40).replace(/[^\p{L}\p{N} \-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 16) || 'Stranger';
  const CLS = { bad: 1, good: 1, dim: 1, tip: 1, '': 1 }, TYPES = { cut: 1, pierce: 1, blunt: 1 }, KINDS = { arrow: 1, bolt: 1, stone: 1 };
  const rnd32 = () => { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0]; };
  const mulberry = a => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const store = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) { } } };

  // role: null (alone), 'host' or 'client'. players: everyone in the party, you included: { pid, name, ready, up, link, f }.
  // up: is up in the ruins this moment. f: the fighter that stands for them on this machine.
  const N = G.net = { role: null, code: '', name: cleanName(store.get('ashenmarch_name') || G.pick(G.NAMES)), me: 0, players: [], ready: false, status: '', note: '', want: null, host: '' };
  let peer = null, hostLink = null, live = false, pend = null, look = null, tickW = null, tS = 0, tP = 0, atkSeq = 0, lastKit = '', budget = 0, kills = 0, salt = rnd32(), inv = null, joinT = 0;
  const pups = new Map();      // on a friend's machine: the host's enemies, by number
  const me = () => N.players.find(p => p.pid === N.me);
  const byPid = pid => N.players.find(p => p.pid === pid);
  const friends = () => N.players.filter(p => p.pid !== N.me);
  N.names = () => friends().map(p => p.name).join(', ');      // who you are up there with
  N.anyUp = () => N.role === 'host' && N.players.some(p => p.pid !== 0 && p.up && p.link && p.link.open);

  // ------------------------------------------------------------------ the wire
  // A link is one open line to another browser, whichever way it was made.
  function mkLink(send, close) { return { send, close, open: false, pl: null, bad: 0, n: 0, t0: 0, hits: 0, hi: false }; }
  function put(link, m) {
    if (!link || !link.open) return;
    let s; try { s = JSON.stringify(m); } catch (e) { return; }
    if (s.length > MAXMSG) return;      // nothing this game sends should be so large; better lost than a line jammed
    try { link.send(s); } catch (e) { }
  }
  // a message that is malformed, unknown or out of turn counts against the sender; enough of them and the line is cut
  function strike(link, n) { link.bad += n; if (link.bad > 60) drop(link, 'The line was cut: it was sending nonsense.'); }
  function recv(link, data) {
    if (typeof data !== 'string' || data.length > MAXMSG) return strike(link, 6);
    const now = performance.now(); if (now - link.t0 > 1000) { link.t0 = now; link.n = 0; link.hits = 0; if (link.bad > 0) link.bad--; }      // an old fault is forgiven in time; a stream of them is not
    if (++link.n > 500) return strike(link, 1);      // no honest machine sends so many in a second
    let m; try { m = JSON.parse(data); } catch (e) { return strike(link, 6); }
    handle(link, m);
  }
  function handle(link, m) {
    if (!Array.isArray(m) || typeof m[0] !== 'string') return strike(link, 6);
    const table = N.role === 'host' ? HOST : CLIENT; if (!has(table, m[0])) return strike(link, 3);
    try { table[m[0]](m, link); } catch (e) { strike(link, 3); }
  }
  function drop(link, why) {
    if (!link) return; const was = link.open; link.open = false; try { link.close(); } catch (e) { }
    if (N.role === 'client' && link === hostLink) lost(why || 'The link to the host was lost.'); else if (N.role === 'host') gone(link, was);
  }
  N.send = m => put(hostLink, m);                                                          // a friend's machine, to the host
  N.toPlayer = (f, m) => { const p = f && f.pl; if (p && p.out && p.out.length < 4000) p.out.push(m); };      // the host, to one friend
  N.cast = (m, but) => { if (N.role !== 'host' || !live) return; for (const p of N.players) if (p.pid !== 0 && p !== but && p.up && p.out && p.out.length < 4000) p.out.push(m); };
  N.fx = m => N.cast(m);
  function flush(p) {
    if (!p.out.length || !p.built) return;
    let part = [], size = 0;
    for (const m of p.out) { const s = JSON.stringify(m).length + 1; if (size + s > 12000 && part.length) { put(p.link, ['q', part]); part = []; size = 0; } part.push(m); size += s; }
    if (part.length) put(p.link, ['q', part]); p.out.length = 0;
  }

  // ------------------------------------------------------------------ finding each other
  function code8() { const a = new Uint8Array(8); crypto.getRandomValues(a); return Array.from(a, v => ALPHA[v & 31]).join(''); }
  const tidy = c => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
  const pretty = c => c.slice(0, 4) + '-' + c.slice(4);
  N.link = () => location.origin + location.pathname + '?join=' + pretty(N.code);
  function say(status, note) { N.status = status; N.note = note || ''; panel(true); badge(); }
  function peerLink(conn) {
    const link = mkLink(s => conn.send(s), () => conn.close());
    conn.on('open', () => { link.open = true; opened(link); });
    conn.on('data', d => recv(link, d));
    conn.on('close', () => drop(link)); conn.on('error', () => drop(link));
    return link;
  }
  function opened(link) {
    if (N.role === 'client') { clearTimeout(joinT); hostLink = link; put(link, ['hi', PROTO, N.name]); say('joining', 'Reached the host. Waiting to be let in…'); }
    else setTimeout(() => { if (link.open && !link.hi) drop(link); }, 8000);      // whoever knocks must say who they are, and soon
  }
  // open a party in this browser and wait for friends
  N.open = function () {
    if (N.role || G.raid.active()) return;
    N.role = 'host'; N.me = 0; N.code = code8(); N.host = N.name; N.players = [{ pid: 0, name: N.name, ready: true, up: false, link: null, f: null }];
    say('opening', 'Opening the party…'); listen(0);
  };
  function listen(tries) {
    if (typeof Peer === 'undefined') return say('nobroker', 'The service that introduces browsers to each other could not be loaded. You can still pair by hand, below.');
    const p = peer = new Peer(PREFIX + N.code.toLowerCase(), { debug: 0 });
    p.on('open', () => { if (peer === p) say('open', ''); });
    p.on('connection', conn => { if (peer !== p || N.role !== 'host' || conn.serialization !== 'raw' && conn.serialization !== 'none') { try { conn.close(); } catch (e) { } return; } peerLink(conn); });
    p.on('disconnected', () => { if (peer === p && N.role === 'host') setTimeout(() => { try { if (peer === p && !p.destroyed) p.reconnect(); } catch (e) { } }, 3000); });
    p.on('error', e => {
      if (peer !== p) return; const t = e && e.type;
      if (t === 'unavailable-id' && tries < 3) { try { p.destroy(); } catch (x) { } N.code = code8(); return listen(tries + 1); }
      if (t === 'peer-unavailable') return;
      if (N.status !== 'open') say('nobroker', 'The service that introduces browsers to each other cannot be reached just now. You can still pair by hand, below.');
    });
  }
  // join a friend's party by its code
  N.join = function (c) {
    c = tidy(c); if (N.role || G.raid.active()) return;
    if (c.length !== 8) { U.toast('A party code is eight letters and numbers.'); return; }
    if (typeof Peer === 'undefined') { U.toast('The introducing service could not be loaded. Ask the host to pair by hand.'); return; }
    N.role = 'client'; N.code = c; N.players = []; N.ready = false; say('joining', 'Looking for the party…');
    const p = peer = new Peer({ debug: 0 });
    p.on('open', () => { if (peer !== p) return; peerLink(p.connect(PREFIX + c.toLowerCase(), { reliable: true, serialization: 'raw' })); });
    p.on('error', e => { if (peer !== p || hostLink) return; lost(e && e.type === 'peer-unavailable' ? 'There is no party with that code. It may have closed.' : 'The party could not be reached.'); });
    joinT = setTimeout(() => { if (N.role === 'client' && !hostLink) lost('Nobody answered. The code may be wrong, or one of your networks will not allow a direct line.'); }, 20000);
  };
  // leave the party, or close it if it is yours
  N.leave = function (quiet) {
    const role = N.role; if (!role) return;
    if (role === 'host') { if (G.raid.active() && N.anyUp()) for (const p of friends()) put(p.link, ['end']); for (const p of friends()) if (p.link) { p.link.open = false; try { p.link.close(); } catch (e) { } } }
    else if (hostLink) { put(hostLink, ['bye']); hostLink.open = false; try { hostLink.close(); } catch (e) { } }
    reset(); if (G.raid.active()) G.raid.cut();
    if (!quiet) { panel(true); badge(); }
  };
  function reset() {
    clearTimeout(joinT); if (peer) { try { peer.destroy(); } catch (e) { } } peer = null; hostLink = null; live = false; pend = null; inv = null;
    N.role = null; N.code = ''; N.players = []; N.ready = false; N.status = ''; N.note = ''; N.me = 0; ticker(false);
  }
  // the host is gone, or would not have you
  function lost(why) {
    if (N.role !== 'client') return;
    reset(); if (G.raid.active()) G.raid.cut();
    N.note = why || ''; U.toast(why || 'You have left the party.'); panel(true); badge();
  }
  // a friend's line has closed
  function gone(link, was) {
    const p = link.pl; if (!p) return; link.pl = null;
    const R = X.R; if (R && R.net === 'host' && p.up) { leaveRaid(p, 'gone'); X.all(`${p.name} is gone.`, 'dim'); }
    N.players = N.players.filter(q => q !== p); roster(); if (was && !R) U.toast(`${p.name} has left the party.`);
  }
  function roster() {
    if (N.role !== 'host') return;
    const list = N.players.map(p => [p.pid, p.name, p.ready ? 1 : 0, p.up ? 1 : 0]);
    for (const p of friends()) put(p.link, ['ros', list]);
    panel(true); badge();
  }

  // ---- pairing by hand, when the broker cannot be reached: an invitation is carried one way and a reply the other
  const ICE = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };
  const enc = d => btoa(JSON.stringify({ t: d.type, s: d.sdp }));
  function dec(c, want) { let o = null; try { o = JSON.parse(atob(String(c).replace(/\s+/g, ''))); } catch (e) { } if (!o || o.t !== want || typeof o.s !== 'string' || o.s.length > 20000) return null; return { type: o.t, sdp: o.s }; }
  const settled = pc => new Promise(res => { if (pc.iceGatheringState === 'complete') return res(); const t = setTimeout(res, 5000); pc.addEventListener('icegatheringstatechange', () => { if (pc.iceGatheringState === 'complete') { clearTimeout(t); res(); } }); });
  function rawLink(pc, dc) {
    const link = mkLink(s => dc.send(s), () => { try { dc.close(); } catch (e) { } try { pc.close(); } catch (e) { } });
    const up = () => { if (!link.open && !link.shut) { link.open = true; opened(link); } };
    dc.onopen = up; dc.onmessage = e => recv(link, e.data); dc.onclose = () => { link.shut = true; drop(link); };
    if (dc.readyState === 'open') setTimeout(up, 0);      // a line handed over already open never says so again
    pc.addEventListener('connectionstatechange', () => { if (pc.connectionState === 'failed' || pc.connectionState === 'closed') drop(link); });
    return link;
  }
  // host: write an invitation. Resolves to its text.
  N.invite = async function () {
    if (N.role !== 'host') return null;
    const pc = new RTCPeerConnection(ICE), dc = pc.createDataChannel('g'); rawLink(pc, dc);
    await pc.setLocalDescription(await pc.createOffer()); await settled(pc);
    inv = pc; return enc(pc.localDescription);
  };
  // host: take the reply to the invitation last written
  N.admit = async function (reply) { const d = dec(reply, 'answer'); if (!d || !inv) return false; try { await inv.setRemoteDescription(d); inv = null; return true; } catch (e) { return false; } };
  // a friend: answer an invitation. Resolves to the reply to send back, or null.
  N.answer = async function (invitation) {
    const d = dec(invitation, 'offer'); if (!d || N.role || G.raid.active()) return null;
    try {
      const pc = new RTCPeerConnection(ICE); pc.ondatachannel = e => rawLink(pc, e.channel);
      await pc.setRemoteDescription(d); await pc.setLocalDescription(await pc.createAnswer()); await settled(pc);
      N.role = 'client'; N.code = ''; N.players = []; N.ready = false; say('joining', 'Send the reply back to the host. You will be let in when they have it.');
      return enc(pc.localDescription);
    } catch (e) { return null; }
  };

  // ------------------------------------------------------------------ what is sent
  const eqWire = eq => { const o = {}; for (const k of G.SLOTS) if (eq[k]) o[k] = eq[k].id; return o; };
  const eqClean = o => { const out = {}; if (o && typeof o === 'object') for (const k of G.SLOTS) if (has(I, o[k])) out[k] = o[k]; return out; };
  const lootWire = c => c.items.slice(0, 80).map(e => [e.it, e.x, e.y, e.hid ? 1 : 0]);
  // what a chest holds, as another machine says: only things this game knows, set where they fit
  function lootClean(raw, w, h2) {
    const out = { w, h: h2, items: [] };
    for (const e of (Array.isArray(raw) ? raw : []).slice(0, 80)) {
      if (!Array.isArray(e)) continue; const it = G.cleanItem(e[0], 0); if (!it) continue; delete it.ins;
      const x = int(e[1], 0, 99, 0), y = int(e[2], 0, 99, 0); let ent = null;
      if (G.inv.fits(out, it, x, y)) { ent = { it, x, y }; out.items.push(ent); } else if (G.inv.add(out, it)) ent = out.items.find(o => o.it === it);
      if (ent && e[3]) ent.hid = true;
    }
    return out;
  }
  const enemyWire = f => [f.id, f.type, Math.round(f.x), Math.round(f.y), Math.round(f.ang * 100), eqWire(f.eq), f.pname || ''];
  function enemyClean(e) {
    if (!Array.isArray(e) || !has(G.ENEMIES, e[1])) return null;
    return { id: int(e[0], 1, 1e6, 0), type: e[1], x: num(e[2], 0, 1e5, 0), y: num(e[3], 0, 1e5, 0), ang: num(e[4], -1e4, 1e4, 0) / 100, eq: eqClean(e[5]), pname: cleanName(e[6]) };
  }
  // a count of the place as this machine built it: if a friend's count differs, the two games are not the same build
  const worldSig = W => { let s = W.containers.length * 7919 + W.doors.length * 104729 + W.spawns.length * 31; for (let i = 0; i < W.t.length; i += 7) s = (s * 31 + W.t[i]) >>> 0; return s; };
  const lootById = id => X.R.loot.find(l => l.id === id);
  const atkWire = P => { const a = P.atk; if (!a) return 0; if (!a._s) a._s = ++atkSeq; return [a._s, a.phase === 'windup' ? 0 : a.phase === 'strike' ? 1 : 2, Math.round(a.dur * 1000), a.dir < 0 ? -1 : 1, Math.round((a.charge || 0) * 100), a.w.arc < .9 ? 1 : 0, Math.round(a.t * 1000)]; };
  const hpk = P => Math.max(0, Math.min(P.hp.thorax / P.max.thorax, P.hp.head / P.max.head));
  // you, as the others should see you
  const selfWire = (P, R) => [Math.round(P.x), Math.round(P.y), Math.round(P.ang * 100), Math.round(P.pitch * 100), (P.crouch ? 1 : 0) | (P.blocking ? 2 : 0) | (P.dead ? 4 : 0) | (P.inBush ? 8 : 0) | (P.sprint ? 16 : 0) | (P.use || P.busy ? 32 : 0) | (P.kickT > 0 ? 64 : 0), Math.round(hpk(P) * 100), atkWire(P)];

  // ------------------------------------------------------------------ someone else's player, on this machine
  function addProxy(p, slot) {
    const R = X.R, W = X.W, o = OFFS[slot & 3], f = X.mkF({ name: p.name, hp: 1, speed: 1, skill: 1, faction: 'you', proper: true }, W.start.x + o[0], W.start.y + o[1]);
    f.remote = true; f.pid = p.pid; f.vs = ((p.pid + 1) * .2371) % 1; f.pl = p; f.nx = f.x; f.ny = f.y; f.na = f.ang = 0; f.pitch = 0; f.crouch = false; f.inBush = false; f.blockT = 0; f.hpk = 1; f.seq = 0; f.craft = 0; f.eq = {};
    p.f = f; p.up = true; R.fighters.push(f); if (N.role === 'host') R.players.push(f);
    return f;
  }
  // their gear changed: make them again as they now look (the same face each time)
  function dress(f, eq) {
    if (!X.R || !f) return; if (f.m) G.gfx.removeFighter(f); f.m = null; f.eq = {};
    for (const k in eq) f.eq[k] = G.mk(eq[k]);
    f.rattle = X.rattleOf(f.eq);
    if (f.gone) return;
    const r = Math.random; Math.random = mulberry((salt ^ (f.pid + 1) * 2654435761) >>> 0); try { G.gfx.addFighter(f); } finally { Math.random = r; }
  }
  function proxyState(f, s) {
    const W = X.W; if (!f || !Array.isArray(s)) return;
    f.nx = num(s[0], 0, W.w * T, f.nx); f.ny = num(s[1], 0, W.h * T, f.ny); f.na = num(s[2], -1e5, 1e5, 0) / 100; f.pitch = num(s[3], -150, 150, 0) / 100;
    const fl = int(s[4], 0, 255, 0), k = num(s[5], 0, 100, 100) / 100;
    f.crouch = !!(fl & 1); f.blocking = !!(fl & 2); f.inBush = !!(fl & 8); f.busy = fl & 32 ? f.busy || { t: 0, dur: 1 } : null; if (fl & 64 && f.kickT <= 0) f.kickT = .35;
    if (k < f.hpk - .03 && X.R && !f.dead) { G.gfx.burst(f.x, f.y, 1.2, 0, 5, f.ang + Math.PI); X.sfxAt('hit', f, .8, true); X.say(f, k < f.hpk - .1 ? 'pain' : 'oof', .9, true); }      // they have been hurt: you see the blood, and hear it
    f.hpk = k;
    const a = s[6];
    if (!Array.isArray(a)) f.atk = null;
    else {
      const sq = int(a[0], 0, 1e9, 0), ph = ['windup', 'strike', 'recover'][int(a[1], 0, 2, 0)], dur = num(a[2], 20, 6000, 300) / 1000;
      if (sq !== f.seq || !f.atk) { f.seq = sq; let w = X.wd(f); if (a[5]) w = Object.assign({}, w, { arc: .5 }); f.atk = { phase: ph, t: num(a[6], 0, 6000, 0) / 1000, dur, charge: num(a[4], 0, 100, 0) / 100, done: true, w, dir: a[3] < 0 ? -1 : 1, bonus: 1 }; }
      else if (f.atk.phase !== ph) { f.atk.phase = ph; f.atk.t = num(a[6], 0, 6000, 0) / 1000; f.atk.dur = dur; if (ph === 'strike') { X.sfxAt('swing', f, .5, true, { w: f.atk.w.twoH ? 1.5 : f.atk.w.arc < .9 ? .6 : 1 }); if (Math.random() < (f.atk.w.twoH ? .7 : .3)) X.say(f, 'effort', .8, true); } }
      f.atk.charge = num(a[4], 0, 100, 0) / 100;
    }
  }
  // they are out of it: fallen, got out, or their line dropped
  function leaveRaid(p, how) {
    const R = X.R, f = p.f; p.up = false; if (!R || !f) return;
    for (const l of R.loot) if (l.lock === p.pid) l.lock = null;      // whatever they had their hands in is free again
    f.atk = null; f.blocking = false;
    if (how === 'dead') { f.dead = true; f.mvx = f.mvy = 0; X.say(f, 'death', 1, true); }
    else { f.gone = true; if (f.m) { G.gfx.removeFighter(f); f.m = null; } const i = R.fighters.indexOf(f); if (i >= 0) R.fighters.splice(i, 1); const j = R.players.indexOf(f); if (j >= 0) R.players.splice(j, 1); }
    if (N.role === 'host') { N.cast(['pl', p.pid, how]); roster(); }
  }

  // ------------------------------------------------------------------ going up
  // host: lead the party up. Those who have said they are ready come; the rest are left in the Hollow.
  N.goUp = function (map, start) {
    if (N.role !== 'host' || G.raid.active()) return false;
    const day = G.save.day, seed = rnd32(); let slot = 1;
    for (const p of N.players) { p.up = false; p.f = null; p.built = false; p.out = []; p.fl = {}; p.slot = p.pid === 0 ? 0 : p.ready && p.link && p.link.open && slot < MAXP ? slot++ : -1; }
    G.raid.start({ map, start, net: { role: 'host', seed, day, wx: G.dayWeather(map, day), slot: 0, map, start } });
    return true;
  };
  // called from the raid as it begins, on every machine
  N.begun = function (net) {
    const R = X.R, W = X.W; live = true; tS = tP = 0; lastKit = ''; pups.clear(); budget = 900; kills = 0; ticker(true);
    if (net.role === 'host') {
      me().up = true; me().f = X.P; X.P.pid = 0;
      const ups = N.players.filter(p => p.slot > 0); for (const p of ups) addProxy(p, p.slot);
      const en = R.fighters.filter(f => f.ai).map(enemyWire), who = N.players.filter(p => p.slot >= 0).map(p => [p.pid, p.name, p.slot]);
      for (const p of ups) {
        put(p.link, ['st', { map: net.map, start: net.start, day: net.day, seed: net.seed, wx: net.wx, slot: p.slot, sig: worldSig(W), who }]);
        for (let i = 0; i < en.length; i += 15) put(p.link, ['en', en.slice(i, i + 15)]);
        put(p.link, ['go']);
      }
      roster();
    } else {
      X.P.pid = N.me;
      for (const w of pend.who) { if (w.pid === N.me) continue; let p = byPid(w.pid); if (!p) { p = { pid: w.pid, name: w.name, ready: true, up: true }; N.players.push(p); } addProxy(p, w.slot); }
      for (const d of pend.en) if (!pups.has(d.id)) pups.set(d.id, X.addPuppet(d));
      const ok = worldSig(W) === pend.sig; pend = null;
      if (!ok) { setTimeout(() => { U.toast('Your game and the host\'s are not the same version. Reload the page, both of you.'); N.leave(); }, 0); return; }
      N.send(['up']);
    }
  };
  // you are coming out of the raid, one way or another
  N.left = function (outcome) {
    const R = X.R, how = outcome === 'dead' ? 'dead' : 'out'; if (!live) return;
    if (N.role === 'client') N.send(['out', how]);
    else { const m = me(); if (m) m.up = false; if (how === 'out') N.cast(['m', `${N.name} is out.`, 'good', 0]); N.cast(['pl', 0, how]); for (const l of R.loot) if (l.lock === 0) l.lock = null; }
  };
  // you have fallen: the others are told at once, and what you carried lies where you fell
  N.fell = function () {
    const m = G.me, P = X.P, items = []; for (const k of G.SLOTS) if (m.eq[k]) items.push(m.eq[k]); for (const o of m.pockets.items) items.push(o.it);
    if (N.role === 'client') N.send(['fell', items.slice(0, 40)]);
    else { body(N.name, P.x, P.y, JSON.parse(JSON.stringify(items))); N.cast(['pl', 0, 'dead']); X.all(`${N.name} has fallen.`, 'bad'); }
  };
  function body(name, x, y, items) {
    const c = { w: 5, h: 8, items: [] };
    for (const raw of (Array.isArray(items) ? items : []).slice(0, 40)) { const it = G.cleanItem(raw, 0); if (it) { delete it.ins; G.inv.add(c, it); } }
    X.addLoot({ x, y, c, name: `Body of ${name}`, kind: 'corpse', searched: true });
  }
  // the raid is over on this machine
  N.over = function () {
    live = false; pend = null; pups.clear(); ticker(false);
    for (const p of N.players) { p.f = null; p.up = false; p.out = []; }
    if (N.role === 'client') { N.ready = false; N.send(['rdy', 0]); } else if (N.role === 'host') { for (const p of friends()) { p.ready = false; } roster(); }
    panel(true); badge();
  };
  // A page that is not in view is not drawn, and the raid's own loop stops with it. A worker's clock keeps the world
  // turning while friends depend on this machine, and keeps your own player from standing safe while you look away.
  function ticker(on) {
    if (!on) { if (tickW) { try { tickW.terminate ? tickW.terminate() : clearInterval(tickW); } catch (e) { } tickW = null; } return; }
    if (tickW) return;
    try { tickW = new Worker('js/tick.js'); tickW.onmessage = () => G.raid.bgTick(); tickW.onerror = () => { tickW = setInterval(() => G.raid.bgTick(), 250); }; }
    catch (e) { tickW = setInterval(() => G.raid.bgTick(), 250); }
  }

  // ------------------------------------------------------------------ during the raid: hooks the raid calls
  N.kit = function () { const R = X.R; if (!R || !live) return; const eq = eqWire(X.P.eq), s = JSON.stringify(eq); if (s === lastKit) return; lastKit = s; if (N.role === 'client') N.send(['kt', eq]); else N.cast(['kt', 0, eq]); };
  N.spawned = f => { if (live) N.cast(['en', [enemyWire(f)]]); };
  N.shot = function (s) {
    if (!live || s.ghost) return; const mine = s.own === X.P;
    const m = ['sh', s.kind, Math.round(s.x), Math.round(s.y), +s.z.toFixed(2), Math.round(s.vx), Math.round(s.vy), +s.vz.toFixed(2), +s.ang.toFixed(3), +s.life.toFixed(2), +(s.dmg || 0).toFixed(1), +(s.pen || 0).toFixed(2), +(s.bleed || 1).toFixed(2), mine ? 0 : s.own.id];
    if (N.role === 'client') { if (mine) N.send(m); } else N.cast(m);
  };
  N.door = function (d) { const i = X.W.doors.indexOf(d); if (i < 0) return; if (N.role === 'client') N.send(['dr', i]); else N.cast(['dr', i]); };
  N.unlocked = function (c) { if (N.role === 'client') N.send(['lk', c.id]); else N.cast(['lk', c.id]); };
  // ask to search something. open() is called once it is yours to search.
  N.search = function (c, open) {
    const R = X.R; if (c.id == null) return open();
    if (N.role === 'host') { if (c.lock != null && c.lock !== 0) return X.msg('Someone else has their hands in it.', 'dim', 2); c.lock = 0; return open(); }
    if (R.asking) return; R.asking = c; look = open; N.send(['lo', c.id]);
    setTimeout(() => { if (X.R === R && R.asking === c) R.asking = null; }, 4000);
  };
  // what you were searching, as you leave it (close) or as it stands (not close)
  N.searched = function (l, close) {
    if (N.role === 'host') { if (close && l.lock === 0) l.lock = null; return; }
    if (l.mine) { N.send(['lx', l.id, lootWire(l.c), l.searched ? 1 : 0, close ? 1 : 0]); if (close) l.mine = false; }
  };
  N.kill = function (k, by) { for (const p of N.players) if (p.pid !== 0 && p.up && p.out) p.out.push(['kl', k.type, k.head ? 1 : 0, k.skill, by === p.f ? 1 : 0, k.x, k.y]); };

  // ------------------------------------------------------------------ during the raid: every frame
  N.tick = function (dt) {
    const R = X.R, P = X.P; if (!R || !live) return;
    if (N.role === 'host') {
      // a blow begun or pulled is told at once, so that a friend sees it coming as soon as may be
      for (const f of R.fighters) {
        if (!f.ai) continue;
        if (f.atk !== f._atk) {
          if (f._atk && f._atk.phase === 'windup' && !f.atk) N.cast(['ec', f.id]);
          if (f.atk && !f.atk.w.ranged) N.cast(['ea', f.id, f.atk.dir, +f.atk.dur.toFixed(3), +(f.ai.hold || 0).toFixed(2)]);
          f._atk = f.atk;
        }
      }
      tS -= dt;
      if (tS <= 0) {
        tS = SNAP;
        const pl = []; for (const p of N.players) { const f = p.f; if (!f || !p.up || f.gone) continue; pl.push(p.pid === 0 ? [0].concat(selfWire(P, R)) : [p.pid, Math.round(f.nx), Math.round(f.ny), Math.round(f.na * 100), Math.round(f.pitch * 100), (f.crouch ? 1 : 0) | (f.blocking ? 2 : 0) | (f.inBush ? 8 : 0) | (f.busy ? 32 : 0) | (f.kickT > 0 ? 64 : 0), Math.round(f.hpk * 100), f.atkW || 0]); }
        for (const p of N.players) {
          if (p.pid === 0 || !p.up || !p.built) continue; const q = p.f, en = [];
          for (const f of R.fighters) {
            if (!f.ai) continue; const a = f.ai;
            const fl = (f.blocking ? 1 : 0) | (f.dead ? 2 : 0) | (a.state === 'combat' ? 4 : 0) | (a.melee ? 8 : 0) | (a.draw > 0 ? 16 : 0) | (f.kickT > 0 ? 32 : 0) | (a.state === 'flee' || a.state === 'gone' ? 64 : 0) | (a.state === 'investigate' ? 128 : 0) | (a.state === 'yield' ? 256 : 0) | (f.bound ? 512 : 0) | (f.unarmed ? 1024 : 0);
            // near enough to matter, or something about him has changed since this friend was last told
            const d = Math.hypot(f.x - q.nx, f.y - q.ny); if (p.fl[f.id] === fl && (f.dead || d > 1500)) continue;
            // how far he has noticed this friend, so that their screen can show it: only if it is them he minds
            const aw = !f.dead && a.state !== 'combat' && (a.tgt === q || (!a.tgt && d < 600)) ? Math.round(G.clamp(a.aware, 0, 1) * 100) : 0;
            p.fl[f.id] = fl; en.push([f.id, Math.round(f.x), Math.round(f.y), Math.round(f.ang * 100), fl, Math.round(Math.max(0, f.stagger) * 100), aw]);
          }
          p.out.push(['s', +R.time.toFixed(2), en, pl.filter(e => e[0] !== p.pid)]);
        }
      }
      for (const p of N.players) if (p.pid !== 0 && p.out) flush(p);
      if (R.ghost && !N.anyUp()) G.raid.endGhost();
    } else {
      tP -= dt; if (tP <= 0) { tP = SEND; N.send(['p', selfWire(P, R), G.skillLvl('fieldcraft')]); }
    }
  };

  // ------------------------------------------------------------------ what the host does with what a friend sends
  // p: the friend's record. f: the fighter that stands for them here. Every number is clamped; every id is looked up.
  const raider = link => { const p = link.pl, R = X.R; return p && R && R.net === 'host' && live && p.up && p.f ? p : null; };
  const enemy = id => { const f = X.R.fighters.find(o => o.ai && o.id === id); return f && !f.dead ? f : null; };
  const HOST = {
    hi(m, link) {
      if (link.hi) return; link.hi = true;
      const full = N.players.length >= MAXP, wrong = m[1] !== PROTO;
      if (wrong || full) { put(link, ['no', wrong ? 'version' : 'full']); return setTimeout(() => drop(link), 300); }
      let pid = 1; while (byPid(pid)) pid++;
      let name = cleanName(m[2]); while (N.players.some(p => p.name === name)) name = (name.slice(0, 13) + ' ' + (pid + 1));
      const p = { pid, name, ready: false, up: false, link, f: null, out: [], fl: {}, built: false, slot: -1 }; link.pl = p; N.players.push(p);
      put(link, ['wel', pid, N.code]); roster(); U.toast(`${name} has joined the party.`);
    },
    bye(m, link) { drop(link); },
    rdy(m, link) { const p = link.pl; if (!p) return; p.ready = !!m[1] && !p.up; roster(); },
    up(m, link) { const p = link.pl; if (p && p.up) p.built = true; },
    p(m, link) { const p = raider(link); if (!p || p.f.dead) return; const s = m[1]; proxyState(p.f, s); p.f.atkW = Array.isArray(s) && Array.isArray(s[6]) ? s[6].slice(0, 7).map(v => int(v, -1e6, 1e9, 0)) : 0; p.f.craft = num(m[2], 0, 20, 0); },
    kt(m, link) { const p = raider(link); if (!p) return; const eq = eqClean(m[1]); dress(p.f, eq); N.cast(['kt', p.pid, eq], p); },
    // a blow a friend says they landed: it must be on a living enemy near them, and no harder than a blow can be
    h(m, link) {
      const p = raider(link); if (!p || ++link.hits > 14) return; const o = enemy(int(m[1], 0, 1e6, 0)), f = p.f; if (!o || f.dead) return;
      const arrow = int(m[8], 0, 2, 0); if (Math.hypot(o.x - f.nx, o.y - f.ny) > (arrow ? 1600 : 150)) return;
      if (!has(TYPES, m[3]) || !ZN.includes(m[5])) return strike(link, 3);
      X.resolve(f, o, num(m[2], 0, 220, 0), m[3], num(m[4], -10, 10, 0), { zone: m[5], pen: num(m[6], 0, .95, 0), skill: has(G.SKILLS, m[7]) ? m[7] : 'hafted', arrow: !!arrow, bolt: arrow === 2, bleed: num(m[9], 0, 3, 1) });
    },
    kk(m, link) { const p = raider(link); if (!p || ++link.hits > 14) return; const o = enemy(int(m[1], 0, 1e6, 0)), f = p.f; if (o && !f.dead && Math.hypot(o.x - f.nx, o.y - f.ny) < 80) { f.kickT = .35; X.kicked(f, o); } },
    // a friend cuts a captive loose, or sends off a man who has yielded to them
    iv(m, link) { const p = raider(link); if (!p || ++link.hits > 14) return; const o = enemy(int(m[1], 0, 1e6, 0)); if (o && !p.f.dead && Math.hypot(o.x - p.f.nx, o.y - p.f.ny) < 90) X.freeMan(o, p.f); },
    pr(m, link) { const p = raider(link); if (!p) return; const o = enemy(int(m[1], 0, 1e6, 0)); if (o && Math.hypot(o.x - p.f.nx, o.y - p.f.ny) < 160) { o.atk = null; o.stagger = Math.max(o.stagger, .95); } },
    n(m, link) { const p = raider(link); if (!p) return; const x = num(m[1], 0, 1e5, 0), y = num(m[2], 0, 1e5, 0), lure = !!m[4]; if (Math.hypot(x - p.f.nx, y - p.f.ny) < (lure ? 700 : 120)) X.noise(x, y, num(m[3], 0, 420, 0), lure); },
    sh(m, link) { const p = raider(link); if (!p || ++link.hits > 14) return; const s = shotClean(m); if (!s || Math.hypot(s.x - p.f.nx, s.y - p.f.ny) > 60) return; s.own = p.f; s.ghost = true; X.R.shots.push(s); G.gfx.arrowAdd(s); X.sfxAt(s.kind === 'bolt' ? 'twang' : s.kind === 'arrow' ? 'arrow' : 'swing', s, .6, true); N.cast(['sh', s.kind, Math.round(s.x), Math.round(s.y), s.z, Math.round(s.vx), Math.round(s.vy), s.vz, s.ang, s.life, 0, 0, 1, 0], p); },
    // searching: the host says what a thing holds, to one of you at a time
    lo(m, link) {
      const p = raider(link); if (!p) return; const l = lootById(int(m[1], 0, 1e6, -1));
      if (!l || Math.hypot(l.x - p.f.nx, l.y - p.f.ny) > 90 || (l.lock != null && l.lock !== p.pid) || (l.key && !l.unlocked)) return put(link, ['lc', int(m[1], 0, 1e6, 0), null, 0]);
      l.lock = p.pid; put(link, ['lc', l.id, lootWire(l.c), l.searched ? 1 : 0]);
    },
    lx(m, link) { const p = raider(link); if (!p) return; const l = lootById(int(m[1], 0, 1e6, -1)); if (!l || l.lock !== p.pid) return; l.c = lootClean(m[2], l.c.w, l.c.h); l.searched = !!m[3]; if (m[4]) l.lock = null; },
    pd(m, link) { const p = raider(link); if (!p || ++link.hits > 14) return; const it = G.cleanItem(m[3], 0); if (!it) return; delete it.ins; const x = num(m[1], 0, 1e5, 0), y = num(m[2], 0, 1e5, 0); if (Math.hypot(x - p.f.nx, y - p.f.ny) < 560) G.raid.putDown(x, y, it, x, y); },
    lk(m, link) { const p = raider(link); if (!p) return; const l = lootById(int(m[1], 0, 1e6, -1)); if (l && l.key && !l.unlocked && Math.hypot(l.x - p.f.nx, l.y - p.f.ny) < 90) { l.unlocked = true; N.cast(['lk', l.id], p); } },
    dr(m, link) { const p = raider(link); if (!p) return; const W = X.W, d = W.doors[int(m[1], 0, 999, -1)]; if (d && d.locked && Math.hypot(d.x - p.f.nx, d.y - p.f.ny) < 110) { W.openDoor(d); G.gfx.openDoor(d); N.cast(['dr', W.doors.indexOf(d)], p); } },
    fell(m, link) { const p = raider(link); if (!p || p.f.dead) return; body(p.name, p.f.nx, p.f.ny, m[1]); X.all(`${p.name} has fallen.`, 'bad'); leaveRaid(p, 'dead'); },
    out(m, link) { const p = link.pl, R = X.R; if (!p || !p.up || !R) return; if (m[1] === 'dead') { if (!p.f || !p.f.dead) leaveRaid(p, 'dead'); else { p.up = false; roster(); } } else { X.all(`${p.name} is out.`, 'good'); leaveRaid(p, 'out'); } }
  };
  function shotClean(m) {
    if (!has(KINDS, m[1])) return null;
    return { kind: m[1], x: num(m[2], 0, 1e5, 0), y: num(m[3], 0, 1e5, 0), z: num(m[4], 0, 4, 1.4), vx: num(m[5], -1500, 1500, 0), vy: num(m[6], -1500, 1500, 0), vz: num(m[7], -40, 40, 0), ang: num(m[8], -10, 10, 0), life: num(m[9], 0, 4, 2), dmg: num(m[10], 0, 120, 0), pen: num(m[11], 0, .95, 0), bleed: num(m[12], 0, 3, 1) };
  }

  // ------------------------------------------------------------------ what a friend's machine does with what the host sends
  const inRaid = () => { const R = X.R; return R && R.net === 'client' && live ? R : null; };
  const CLIENT = {
    wel(m) { N.me = int(m[1], 1, 9, 1); if (!N.code) N.code = tidy(m[2]); say('joined', ''); },
    no(m) { lost(m[1] === 'full' ? 'That party is full.' : m[1] === 'version' ? 'That party is on a different version of the game. Reload the page, both of you.' : 'The host is not taking anyone in just now.'); },
    ros(m) {
      if (!Array.isArray(m[1])) return; const old = N.players, list = [];
      for (const e of m[1].slice(0, MAXP)) { if (!Array.isArray(e)) continue; const pid = int(e[0], 0, 9, 0), was = old.find(p => p.pid === pid) || {}; list.push(Object.assign(was, { pid, name: cleanName(e[1]), ready: !!e[2], up: was.f ? was.up : !!e[3] })); }
      N.players = list; const hp = byPid(0); N.host = hp ? hp.name : 'the host'; const mine = me(); if (mine) N.ready = mine.ready;
      panel(true); badge();
    },
    // the host is leading the party up: where, and with what dice
    st(m) {
      const o = m[1]; if (G.raid.active() || !N.ready || !o || typeof o !== 'object' || !G.MAPS.some(q => q.id === o.map) || !has(G.WEATHER, o.wx)) return;
      const who = []; for (const e of (Array.isArray(o.who) ? o.who : []).slice(0, MAXP)) if (Array.isArray(e)) who.push({ pid: int(e[0], 0, 9, 0), name: cleanName(e[1]), slot: int(e[2], 0, 3, 0) });
      pend = { map: o.map, start: text(o.start, 30), day: int(o.day, 1, 1e5, 1), seed: int(o.seed, 0, 4294967295, 0), wx: o.wx, slot: int(o.slot, 1, 3, 1), sig: int(o.sig, 0, 4294967295, 0), who, en: [] };
    },
    en(m) {
      if (!Array.isArray(m[1])) return; const R = inRaid();
      if (!R) { if (pend && pend.en.length < 400) for (const e of m[1].slice(0, 20)) { const d = enemyClean(e); if (d && d.id) pend.en.push(d); } return; }      // before you are up: kept until the place is built
      for (const e of m[1].slice(0, 20)) { const d = enemyClean(e); if (d && d.id && !pups.has(d.id) && pups.size < 500) pups.set(d.id, X.addPuppet(d)); }
    },
    go() {
      if (!pend || G.raid.active()) return; const p = pend, M = G.mapById(p.map);
      N.close(); G.ui.launch(`Going up into ${M.name} with ${N.host}…`, () => G.raid.start({ map: p.map, start: p.start, net: { role: 'client', seed: p.seed, day: p.day, wx: p.wx, slot: p.slot } }));
    },
    end() { if (G.raid.active()) { U.toast('The host has ended the raid. You make your own way down.'); G.raid.cut(); } },
    // several things at once
    q(m, link) { if (!Array.isArray(m[1])) return; for (const e of m[1].slice(0, 400)) if (Array.isArray(e) && e[0] !== 'q') handle(link, e); },
    // where everyone is
    s(m) {
      const R = inRaid(); if (!R) return; const t = num(m[1], 0, 1e5, R.time), now = performance.now();
      if (Math.abs(t - R.time) > .75) R.time = t; else R.time += (t - R.time) * .1;
      for (const e of (Array.isArray(m[2]) ? m[2] : []).slice(0, 500)) {
        if (!Array.isArray(e)) continue; const f = pups.get(int(e[0], 0, 1e6, 0)); if (!f) continue;
        f.nx = num(e[1], 0, X.W.w * T, f.nx); f.ny = num(e[2], 0, X.W.h * T, f.ny); f.na = num(e[3], -1e5, 1e5, 0) / 100;
        const fl = int(e[4], 0, 2047, 0), a = f.ai; f.yield = !!(fl & 256); f.bound = !!(fl & 512); f.unarmed = !!(fl & 1024);
        f.blocking = !!(fl & 1); a.state = fl & 256 ? 'yield' : fl & 4 ? 'combat' : fl & 64 ? 'flee' : fl & 128 ? 'investigate' : 'idle'; a.aware = num(e[6], 0, 100, 0) / 100; a.melee = !!(fl & 8); a.draw = fl & 16 ? 1 : 0; if (fl & 32 && f.kickT <= 0) f.kickT = .35;
        if (now > (f.keep || 0)) f.stagger = num(e[5], 0, 200, 0) / 100;      // unless you have only just turned his blow yourself
        if (fl & 2 && !f.dead) { f.dead = true; f.atk = null; f.blocking = false; f.mvx = f.mvy = 0; }
      }
      for (const e of (Array.isArray(m[3]) ? m[3] : []).slice(0, MAXP)) { if (!Array.isArray(e)) continue; const p = byPid(int(e[0], 0, 9, -1)); if (p && p.f && p.pid !== N.me && !p.f.dead) proxyState(p.f, e.slice(1)); }
    },
    // an enemy begins a blow; play it out here from its start, so that your guard is judged against what you saw
    ea(m) { const R = inRaid(); if (!R) return; const f = pups.get(int(m[1], 0, 1e6, 0)); if (!f || f.dead) return; f.atk = { phase: 'windup', t: 0, dur: num(m[3], .04, 3, .3), charge: 0, done: false, w: X.wd(f), dir: m[2] < 0 ? -1 : 1, bonus: 1 }; f.ai.hold = num(m[4], 0, 1, 0); },
    ec(m) { const R = inRaid(); if (!R) return; const f = pups.get(int(m[1], 0, 1e6, 0)); if (f && f.atk && f.atk.phase === 'windup') f.atk = null; },
    sh(m) {
      const R = inRaid(); if (!R || R.shots.length > 200) return; const s = shotClean(m); if (!s) return;
      const own = pups.get(int(m[13], 0, 1e6, 0)); if (own) s.own = own; else { s.own = null; s.ghost = true; }      // an enemy's arrow can find you; a friend's is only to be seen
      R.shots.push(s); G.gfx.arrowAdd(s); X.sfxAt(s.kind === 'bolt' ? 'twang' : s.kind === 'arrow' ? 'arrow' : 'swing', s, .7, true);
    },
    // things only you are told
    m(m) { if (inRaid()) X.msg(text(m[1], 240), has(CLS, m[2]) ? m[2] : '', num(m[3], 0, 6, 0)); },
    k(m) { if (!inRaid() || !has(G.SKILLS, m[1])) return; const n = num(m[2], 0, 8, 0); if (budget < n) return; budget -= n; G.addSkill(m[1], n); },      // skill is earned a little at a time, and only so much in one raid
    j(m) { const R = inRaid(); if (R) R.shake = num(m[1], 0, 8, 0); },
    pd(m) { const R = inRaid(), P = X.P; if (!R || P.dead) return; P.atk = null; P.stagger = Math.max(P.stagger, num(m[1], 0, 1, .6)); },
    kd(m) { const R = inRaid(), P = X.P; if (!R || P.dead) return; const f = pups.get(int(m[1], 0, 1e6, 0)); if (!f || f.dead || Math.hypot(f.x - P.x, f.y - P.y) > 90) return; const a = f.ang; f.ang = num(m[2], -10, 10, a); f.kickT = .35; X.kicked(f, P); f.ang = a; },
    kl(m) { const R = inRaid(); if (!R || !has(G.ENEMIES, m[1]) || ++kills > 200) return; X.killed({ type: m[1], head: !!m[2], skill: has(G.SKILLS, m[3]) ? m[3] : '', x: num(m[5], 0, 1e5, 0), y: num(m[6], 0, 1e5, 0) }, !!m[4]); },

    // one of the host's men has left the raid alive; and what a mercy was worth
    gn(m) { const R = inRaid(); if (!R) return; const id = int(m[1], 0, 1e6, 0), f = pups.get(id); if (!f) return; pups.delete(id); const i = R.fighters.indexOf(f); if (i >= 0) R.fighters.splice(i, 1); G.gfx.removeFighter(f); f.m = null; f.left = true; },
    cr(m) { if (inRaid() && ++kills <= 200 && (m[1] === 'free' || m[1] === 'spare')) X.credited(m[1], has(G.ENEMIES, m[2]) ? m[2] : 'bandit'); },
    // the world
    la(m) {
      const R = inRaid(); if (!R || R.loot.length > 1500) return; const id = int(m[1], 0, 1e6, -1), pile = m[2] === 'pile'; if (id < 0 || lootById(id)) return;
      const l = { id, x: num(m[3], 0, X.W.w * T, 0), y: num(m[4], 0, X.W.h * T, 0), c: { w: pile ? 6 : 5, h: pile ? 6 : 8, items: [] }, name: text(m[5], 60) || 'Something', kind: pile ? 'pile' : 'corpse', searched: pile };
      if (pile) l.m = G.gfx.addPile(l.x, l.y); R.loot.push(l);
    },
    lc(m) {
      const R = inRaid(); if (!R || !R.asking) return; const l = R.asking, open = look; R.asking = null; look = null; if (l.id !== int(m[1], 0, 1e6, -1)) return;
      if (!Array.isArray(m[2])) return X.msg('Someone else has their hands in it.', 'dim', 2);
      if (Math.hypot(l.x - X.P.x, l.y - X.P.y) > 60 || X.P.dead) return N.send(['lx', l.id, m[2], m[3] ? 1 : 0, 1]);      // you have walked off: give it straight back
      l.c = lootClean(m[2], l.c.w, l.c.h); l.searched = !!m[3]; l.mine = true; if (open) open();
    },
    lk(m) { const R = inRaid(); if (!R) return; const l = lootById(int(m[1], 0, 1e6, -1)); if (l) l.unlocked = true; },
    dr(m) { const R = inRaid(); if (!R) return; const W = X.W, d = W.doors[int(m[1], 0, 999, -1)]; if (d && d.locked) { W.openDoor(d); G.gfx.openDoor(d); X.sfxAt('lock', d, .8, true); } },
    kt(m) { const R = inRaid(); if (!R) return; const p = byPid(int(m[1], 0, 9, -1)); if (p && p.f && p.pid !== N.me) dress(p.f, eqClean(m[2])); },
    pl(m) { const R = inRaid(); if (!R) return; const p = byPid(int(m[1], 0, 9, -1)); if (p && p.f && p.pid !== N.me && p.up) leaveRaid(p, m[2] === 'dead' ? 'dead' : 'out'); },
    // things seen and heard
    b(m) { const R = inRaid(); if (R) G.gfx.burst(num(m[1], 0, 1e5, 0), num(m[2], 0, 1e5, 0), num(m[3], 0, 3, 1), m[4] ? 1 : 0, int(m[5], 0, 40, 4), num(m[6], -10, 10, 0)); },
    d(m) { const R = inRaid(); if (R) G.gfx.decal(num(m[1], 0, 1e5, 0), num(m[2], 0, 1e5, 0), num(m[3], 0, 30, 3)); },
    sf(m) { if (inRaid() && has(SOUNDS, m[1])) X.sfxAt(m[1], { x: num(m[2], 0, 1e5, 0), y: num(m[3], 0, 1e5, 0) }, num(m[4], 0, 1, .5), true); },      // a sound somewhere, as the host heard it
    t() { const R = inRaid(); if (R) { G.gfx.flash(); setTimeout(() => { if (X.R === R) G.sfx('thunder', G.rand(.5, 1)); }, G.rand(400, 2600)); } },
    w() { if (inRaid()) G.sfx('howl', .9, G.rand(-1, 1)); },
    // one of the host's men or beasts gives voice: a shout, a cry, a howl. It comes from his own throat here too.
    vo(m) { const R = inRaid(); if (!R || !has(VOICES, m[2])) return; const f = pups.get(int(m[1], 0, 1e6, 0)); if (f) X.say(f, m[2], num(m[3], 0, 1, .8), true); }
  };
  const SOUNDS = { parry: 1, thud: 1, clang: 1, crack: 1, hit: 1, hitb: 1, mail: 1, swing: 1 };
  const VOICES = { alert: 1, roar: 1, huh: 1, hmph: 1, call: 1, fear: 1, pain: 1, oof: 1, death: 1, effort: 1, taunt: 1, howl: 1, idle: 1 };

  // ------------------------------------------------------------------ friends on the HUD
  N.hud = function (c, w, h2) {
    // the list of friends sits at the right edge
    const R = X.R, P = X.P; if (!R) return; let y = h2 * .4; c.textBaseline = 'middle';
    for (const p of N.players) {
      if (p.pid === N.me) continue; const f = p.f, here = f && p.up && !f.gone;
      if (here && !f.dead) {      // a name over the head of each friend in sight
        const d = Math.hypot(f.x - P.x, f.y - P.y), s = d < 1400 ? G.gfx.screen(f.x, f.y, f.crouch ? 1.5 : 2.02) : null;
        if (s && s.x > -50 && s.x < w + 50) { c.textAlign = 'center'; c.font = '13px Georgia'; c.fillStyle = 'rgba(0,0,0,.6)'; c.fillText(p.name, s.x + 1, s.y + 1); c.fillStyle = f.hpk < .4 ? '#d9877a' : '#cfd9b4'; c.fillText(p.name, s.x, s.y); }
      }
      let st = 'in the Hollow', col = 'rgba(160,152,134,.7)';
      if (f && f.dead) { st = 'fallen'; col = '#b0392a'; }
      else if (here) { const d = Math.round(Math.hypot(f.x - P.x, f.y - P.y) / 16); st = (f.hpk < .4 ? 'badly hurt · ' : f.hpk < .75 ? 'hurt · ' : '') + `${d} m ${G.raid.compass(Math.atan2(f.y - P.y, f.x - P.x))}`; col = f.hpk < .4 ? '#d9877a' : 'rgba(207,217,180,.85)'; }
      else if (f) { st = 'out'; col = 'rgba(184,199,154,.7)'; }
      const lx = w - 26; c.textAlign = 'right'; c.font = '13px Georgia'; c.fillStyle = 'rgba(0,0,0,.6)'; c.fillText(`${p.name} — ${st}`, lx + 1, y + 1); c.fillStyle = col; c.fillText(`${p.name} — ${st}`, lx, y); y += 17;
    }
    if (R.asking) { c.textAlign = 'center'; c.font = '14px Georgia'; c.fillStyle = 'rgba(225,215,190,.8)'; c.fillText('…', w / 2, h2 / 2 + 84); }
  };

  // ------------------------------------------------------------------ the party, in the Hollow
  function badge() {
    const b = $('party'); if (b) { b.textContent = N.role ? `Party (${Math.max(1, N.players.length)})` : 'Party'; b.classList.toggle('on', !!N.role); }
    if (!$('brief').classList.contains('hidden') && !G.raid.active()) G.ui.brief();      // who is coming is written on the briefing
  }
  let shown = false;
  N.close = function () { shown = false; $('partybox').classList.add('hidden'); };
  // keep: redraw only if it is already open
  function panel(keep) {
    const box = $('partybox'); if (keep && !shown) return; shown = true; box.innerHTML = ''; box.classList.remove('hidden');
    const card = h('div', 'card'), row = () => { const r = h('div', 'btnrow center'); card.appendChild(r); return r; };
    const btn = (label, fn, off, cls) => { const b = h('button', cls || 'small', label); b.disabled = !!off; b.onclick = () => { G.sfx('ui'); fn(); }; return b; };
    const field = (ph, val, max) => { const i = document.createElement('input'); i.type = 'text'; i.placeholder = ph; i.value = val || ''; i.maxLength = max; i.spellcheck = false; i.autocomplete = 'off'; return i; };
    const area = (ph, val, ro) => { const a = document.createElement('textarea'); a.placeholder = ph; a.value = val || ''; a.readOnly = !!ro; a.rows = 3; a.spellcheck = false; if (ro) a.onclick = () => a.select(); return a; };
    const copy = (txt, b) => { const done = () => { b.textContent = 'Copied'; }; try { navigator.clipboard.writeText(txt).then(done, () => U.toast('Could not copy. Select it and copy by hand.')); } catch (e) { U.toast('Could not copy. Select it and copy by hand.'); } };
    card.appendChild(h('h1', null, 'Going up together'));
    const busy = G.raid.active();
    if (!N.role) {
      card.appendChild(h('p', null, 'Two to four of you can go up into the same ruin. One of you opens a party and gives the others its code.'));
      const nm = field('Your name', N.name, 16), nr = row(); nr.appendChild(h('span', 'sub', 'You are called ')); nr.appendChild(nm);
      nm.onchange = () => { N.name = cleanName(nm.value); nm.value = N.name; store.set('ashenmarch_name', N.name); };
      const r1 = row(); r1.appendChild(btn('Open a party', () => { nm.onchange(); N.open(); }, busy, 'big'));
      card.appendChild(h('h3', null, 'Or join one'));
      const cd = field('XXXX-XXXX', N.want || '', 9), r2 = row(); r2.appendChild(cd); r2.appendChild(btn('Join', () => { nm.onchange(); N.join(cd.value); }, busy));
      cd.onkeydown = e => { if (e.key === 'Enter') { nm.onchange(); N.join(cd.value); } };
      if (N.note) card.appendChild(h('p', 'sub warn', N.note));
      const det = h('details'); det.appendChild(h('summary', 'sub', 'Join by a hand-carried invitation instead'));
      const ia = area('Paste the host\'s invitation here'), out = area('Your reply will appear here. Send it back to the host.', '', true), rr = h('div', 'btnrow center');
      rr.appendChild(btn('Answer it', async () => { nm.onchange(); const rep = await N.answer(ia.value); if (!rep) return U.toast('That is not an invitation, or it could not be answered.'); N.reply = rep; panel(true); }));
      det.appendChild(ia); det.appendChild(rr); det.appendChild(out); card.appendChild(det);
      card.appendChild(h('p', 'sub', 'Friends in a party are joined directly, browser to browser, and so can see one another\'s network address. Share a code only with people you would tell where you live. Nothing is stored anywhere but in your own browser.'));
    } else {
      const host = N.role === 'host';
      if (host && N.status === 'open') {
        card.appendChild(h('p', null, 'Give your friends this code, or send them the link.'));
        card.appendChild(h('div', 'pcode', pretty(N.code)));
        const r = row(), b1 = btn('Copy the code', () => copy(pretty(N.code), b1)), b2 = btn('Copy the link', () => copy(N.link(), b2)); r.appendChild(b1); r.appendChild(b2);
      } else if (N.note) card.appendChild(h('p', N.status === 'nobroker' ? 'sub warn' : 'sub', N.note));
      if (N.reply && !host && !N.players.length) { card.appendChild(h('p', null, 'Send this reply back to the host:')); const a = area('', N.reply, true), r = row(), b = btn('Copy the reply', () => copy(N.reply, b)); card.appendChild(a); r.appendChild(b); }
      if (N.players.length) {
        card.appendChild(h('h3', null, 'The party'));
        for (const p of N.players) {
          const line = h('div', 'prow'); line.appendChild(h('b', null, p.name + (p.pid === N.me ? ' (you)' : '')));
          line.appendChild(h('span', 'sub', p.up ? 'up in the ruins' : p.pid === 0 ? 'leads the party' : p.ready ? 'ready' : 'not ready'));
          if (host && p.pid !== 0) line.appendChild(btn('Send away', () => drop(p.link)));
          card.appendChild(line);
        }
      }
      if (host) {
        card.appendChild(h('p', 'sub', busy ? 'You are up in the ruins.' : 'When they are ready, close this and go up as you always do: those who are ready come with you, into the same place. The world lives in your browser, so keep this page open until everyone is down.'));
        const det = h('details'); det.appendChild(h('summary', 'sub', 'A friend cannot get in? Carry an invitation by hand'));
        const ia = area('Press the button to write an invitation, then send it to your friend.', N.invText || '', true), ra = area('Paste your friend\'s reply here'), r1 = h('div', 'btnrow center'), r2 = h('div', 'btnrow center');
        const cb = btn('Copy the invitation', () => copy(N.invText || '', cb), !N.invText);
        r1.appendChild(btn('Write an invitation', async () => { try { N.invText = await N.invite(); } catch (e) { N.invText = ''; U.toast('This browser could not write one.'); } panel(true); const d2 = $('partybox').querySelector('details'); if (d2) d2.open = true; })); r1.appendChild(cb);
        r2.appendChild(btn('Let them in', async () => { if (await N.admit(ra.value)) { N.invText = ''; U.toast('The reply is good. They will appear in a moment.'); } else U.toast('That is not a reply to the invitation you last wrote.'); }));
        det.appendChild(ia); det.appendChild(r1); det.appendChild(ra); det.appendChild(r2); card.appendChild(det);
      } else if (N.status === 'joined') {
        const mine = me(), up = mine && mine.up;
        card.appendChild(h('p', 'sub', up ? 'You are up in the ruins.' : `${N.host} leads this party. Put on what you mean to carry, then say you are ready: you go up when ${N.host} does, into the place they choose.`));
        if (!up) { const r = row(); r.appendChild(btn(N.ready ? 'Ready — waiting for ' + N.host : 'I am ready', () => { N.ready = !N.ready; N.send(['rdy', N.ready ? 1 : 0]); panel(true); }, busy, N.ready ? 'big on' : 'big')); }
      }
      const r = row(); r.appendChild(btn(host ? 'Close the party' : 'Leave the party', () => { N.reply = ''; N.invText = ''; N.leave(); }, false, 'small danger'));
    }
    const rc = row(); rc.appendChild(btn('Back', N.close, false, ' ')); box.appendChild(card);
  }
  N.panel = () => panel(false);
  // a link with a code in it: remember the code, and take it out of the address so that a reload does not ask again
  N.boot = function () {
    let c = null; try { c = new URLSearchParams(location.search).get('join'); } catch (e) { }
    if (c && tidy(c).length === 8) { N.want = pretty(tidy(c)); try { history.replaceState(null, '', location.pathname); } catch (e) { } }
    const b = $('party'); if (b) b.onclick = () => { G.sfx('ui'); U.hideCtx(); panel(false); };
    addEventListener('beforeunload', () => { if (N.role) N.leave(true); });
  };
})();
