'use strict';
// Map toolkit. Each map (see maps-def.js) is a fixed, hand-laid place built from these pieces so it can be learned;
// who stands where and what the chests hold is rolled fresh each raid and worsens with the days.
// Logic runs on a flat plane in "px" units (32 per tile). The renderer scales this to metres.
(function () {
  const T = G.T;
  const TL = G.TILE = { GRASS: 0, DIRT: 1, WOOD: 2, STONE: 3, SWALL: 4, WWALL: 5, TREE: 6, WATER: 7, BUSH: 8, DEEP: 9, LOW: 10, MUD: 11, COBBLE: 12, DOOR: 13, REED: 14, ROCK: 15 };
  //             grass dirt wood stone swall wwall tree water bush deep low mud cobble door reed rock
  const SOLID = [0, 0, 0, 0, 1, 1, 1, 0, 0, 1, 1, 0, 0, 1, 0, 1];      // cannot be walked through
  const OPAQUE = [0, 0, 0, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0, 1, 1, 1];     // cannot be seen through
  const SHOT = [0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 0, 1, 0, 1];       // stops an arrow
  const SPEED = [1, 1, 1, 1, 1, 1, 1, .6, .9, 1, 1, .72, 1, 1, .8, 1];
  G.TSOLID = SOLID;
  function mulberry(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  G.MAPS = [];
  G.defMap = m => G.MAPS.push(m);
  G.mapById = id => G.MAPS.find(m => m.id === id) || G.MAPS[0];
  G.mapName = id => G.mapById(id).name;
  // the sky is the same for everyone on a given morning, so it can be read before you choose where to go
  G.WEATHER = {
    overcast: { name: 'Overcast', rain: 0, fog: 1, sun: .8, hear: 1, text: 'A plain grey day.' },
    rain: { name: 'Rain', rain: .7, fog: 1.15, sun: .55, hear: .8, text: 'Steps are muffled and men hear less.' },
    storm: { name: 'Storm', rain: 1, fog: 1.3, sun: .4, hear: .62, storm: true, text: 'Thunder covers nearly everything. So does the gloom.' },
    fog: { name: 'Fog', rain: .08, fog: 2.1, sun: .5, hear: 1, text: 'Nobody sees far, you included.' },
    clear: { name: 'Clear', rain: 0, fog: .8, sun: 1.25, hear: 1.05, text: 'Long sight and long shadows. You will be seen from far off.' }
  };
  G.dayWeather = (id, day) => { const M = G.mapById(id), l = M.env.weather; let s = 0; for (const e of l) s += e[1]; let r = mulberry((day || 1) * 7919 + M.seed)() * s; for (const e of l) { r -= e[1]; if (r <= 0) return e[0]; } return l[0][0]; };
  // Each day has its word from the hills: something that changes who is up there (X.populate in raid-ai.js acts on it).
  // It comes from the day and the place, like the weather, so everyone going up together hears the same.
  G.EVENTS = {
    none: ['', ''], wolves: ['Wolves', 'A pack has come down out of the high wood. Expect them where you do not expect men.'],
    muster: ['A muster', 'More men than usual up there, and newly paid: there is silver on them.'],
    fever: ['Camp fever', 'There is sickness among them. They are weaker for it, and quicker to beg for their lives.'],
    hunt: ['A hunting party', 'A band is walking the ground from end to end. They will not stay where you last saw them.'],
    taken: ['Folk taken', 'More of ours were roped and marched in last night. They can be cut loose.']
  };
  G.dayEvent = (id, day) => { if ((day || 1) < 2) return 'none'; const M = G.mapById(id), l = [['none', 32], ['wolves', M.tier === 3 ? 6 : 14], ['muster', 13], ['fever', 13], ['hunt', 13], ['taken', 15]]; let s = 0; for (const e of l) s += e[1]; let r = mulberry(day * 104729 + M.seed * 3 + 11)() * s; for (const e of l) { r -= e[1]; if (r <= 0) return e[0]; } return 'none'; };
  const NAMES = { chest: 'Iron-bound chest', crate: 'Crate', sack: 'Sack', barrel: 'Barrel', rack: 'Arms rack', armoury: 'Arms chest', toolbox: 'Tool chest', desk: 'Writing desk', medchest: 'Physic chest', dispensary: 'Dispensary shelves', altar: 'Altar', coffer: 'Strongbox', cache: 'Disturbed earth', courier: 'Dead courier', remains: 'Old remains', woodpile: 'Woodpile', herbpatch: 'Yarrow patch' };

  // opts: { map, start, day, preview, seed }. With a seed, everything that is rolled comes out the same wherever it is
  // built: friends who go up together must find the same men behind the same doors. See net.js.
  G.genWorld = function (opts) {
    opts = opts || {}; const rnd = Math.random; if (opts.seed != null) Math.random = mulberry(opts.seed >>> 0);
    try { return gen(opts); } finally { Math.random = rnd; }
  };
  function gen(opts) {
    const M = G.mapById(opts.map), R = mulberry(M.seed), V = Math.random, W = M.w, H = M.h, t = new Uint8Array(W * H), hgt = new Float32Array(W * H);
    const th = Math.min(5, 1 + Math.floor(((opts.day || 1) - 1) / 5));     // threat grows every five days
    const ri = (a, b) => a + Math.floor(R() * (b - a + 1));
    const idx = (x, y) => x + y * W, inb = (x, y) => x >= 0 && y >= 0 && x < W && y < H;
    const L = 16, lat = []; for (let i = 0; i < L * L; i++) lat.push(R());
    const sm = v => v * v * (3 - 2 * v);
    function vn(x, y) {
      const gx = Math.floor(x), gy = Math.floor(y), fx = sm(x - gx), fy = sm(y - gy);
      const a = lat[(gx % L) + (gy % L) * L], b = lat[((gx + 1) % L) + (gy % L) * L], c = lat[(gx % L) + ((gy + 1) % L) * L], d = lat[((gx + 1) % L) + ((gy + 1) % L) * L];
      return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
    }
    // things that stand on the ground and cannot be walked through: [radius in px]
    const BR = { well: 17, cart: 15, gallows: 14, stall: 15, tent: 19, table: 13, pew: 11, bed: 10, anvil: 7, trebuchet: 22, hay: 12, barrel: 6, grave: 5, cross: 10, pell: 4, brazier: 5, candle: 3, fire: 8, chest: 7, crate: 7, sack: 5, rack: 8, armoury: 8, toolbox: 5, desk: 8, medchest: 6, dispensary: 9, altar: 10, coffer: 6, woodpile: 7 };
    const block = (kind, x, y) => { const r = BR[kind]; if (!r) return; const k = Math.floor(x / T) + Math.floor(y / T) * W; (world.bgrid[k] || (world.bgrid[k] = [])).push({ x, y, r }); };
    const world = { bgrid: {}, id: M.id, meta: M, tier: M.tier, w: W, h: H, t, hgt, containers: [], spawns: [], waves: [], extracts: [], fires: [], buildings: [], props: [], labels: [], zones: [], doors: [] };
    const px = v => v * T + T / 2;
    const soft = v => v === TL.TREE || v === TL.BUSH || v === TL.WATER || v === TL.REED || v === TL.MUD || v === TL.ROCK;
    const edge = (x, y) => Math.min(x, y, W - 1 - x, H - 1 - y) >= 2;
    const used = new Set();
    const melee = ty => M.tier < 2 && G.ENEMIES[ty] && G.ENEMIES[ty].archer ? 'raider' : ty;
    const B = {
      M, R, V, W, H, t, TL, th, ri, idx, inb, vn, px, world, used,
      set(x, y, v, h) { if (inb(x, y)) { t[idx(x, y)] = v; if (h !== undefined) hgt[idx(x, y)] = h; } },
      get: (x, y) => inb(x, y) ? t[idx(x, y)] : TL.TREE,
      // fill a rectangle (inclusive corners); only = replace only natural ground
      fill(x0, y0, x1, y1, v, only, h) { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (inb(x, y) && edge(x, y) && (!only || soft(t[idx(x, y)]) || t[idx(x, y)] <= TL.DIRT)) B.set(x, y, v, h); },
      disc(cx, cy, r, to, all) {
        for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++)
          if (inb(x, y) && edge(x, y) && (x - cx) * (x - cx) + (y - cy) * (y - cy) <= r * r && (all ? !SOLID[t[idx(x, y)]] || soft(t[idx(x, y)]) : soft(t[idx(x, y)]))) t[idx(x, y)] = to === undefined ? (R() < .5 ? TL.DIRT : TL.GRASS) : to;
      },
      wall(x0, y0, x1, y1, v, h) { B.fill(Math.min(x0, x1), Math.min(y0, y1), Math.max(x0, x1), Math.max(y0, y1), v === undefined ? TL.SWALL : v, false, h); },
      // b: {x,y,w,h,kind}. roof: 'thatch' | 'slab' | 'rafters' | null. ruin: chance a wall tile has fallen. h: wall height in metres.
      building(b, wall, floor, ruin, roof, h) {
        for (let y = b.y - 2; y < b.y + b.h + 2; y++) for (let x = b.x - 2; x < b.x + b.w + 2; x++) {
          if (!inb(x, y)) continue;
          const out = x < b.x || y < b.y || x >= b.x + b.w || y >= b.y + b.h;
          if (out) { if (soft(t[idx(x, y)]) && edge(x, y)) t[idx(x, y)] = R() < .5 ? TL.DIRT : TL.GRASS; continue; }
          const per = x === b.x || y === b.y || x === b.x + b.w - 1 || y === b.y + b.h - 1;
          const corner = (x === b.x || x === b.x + b.w - 1) && (y === b.y || y === b.y + b.h - 1);
          B.set(x, y, per ? ((!corner && R() < ruin) ? TL.DIRT : wall) : floor, per ? (h || 0) : 0);
        }
        b.wall = wall; b.floor = floor; b.doors = []; b.wallH = h || (wall === TL.WWALL ? 2.9 : 4.3);
        b.roof = roof === undefined ? (ruin === 0 ? 'thatch' : (wall === TL.WWALL ? 'rafters' : null)) : roof;
        world.buildings.push(b); return b;
      },
      // side: 0 north, 1 south, 2 west, 3 east
      door(b, side, pos, wide) {
        let x, y, ox = 0, oy = 0;
        if (side === 0) { x = pos === undefined ? b.x + (b.w >> 1) : pos; y = b.y; oy = -1; }
        else if (side === 1) { x = pos === undefined ? b.x + (b.w >> 1) : pos; y = b.y + b.h - 1; oy = 1; }
        else if (side === 2) { x = b.x; y = pos === undefined ? b.y + (b.h >> 1) : pos; ox = -1; }
        else { x = b.x + b.w - 1; y = pos === undefined ? b.y + (b.h >> 1) : pos; ox = 1; }
        B.set(x, y, b.floor, 0); if (wide) B.set(x + (oy ? 1 : 0), y + (ox ? 1 : 0), b.floor, 0);
        b.doors.push({ x: x + ox * 2, y: y + oy * 2, tx: x, ty: y, t2: wide ? [x + (oy ? 1 : 0), y + (ox ? 1 : 0)] : null, ns: !!oy }); return { x, y };
      },
      lockDoor(x, y, key, name, floor) { B.set(x, y, TL.DOOR, 0); world.doors.push({ tx: x, ty: y, x: px(x), y: px(y), key, name, locked: true, floor: floor === undefined ? TL.STONE : floor }); used.add(idx(x, y)); },
      spot(x0, y0, x1, y1) {
        for (let i = 0; i < 60; i++) {
          const x = ri(x0, x1), y = ri(y0, y1), k = idx(x, y);
          if (inb(x, y) && !SOLID[t[k]] && t[k] !== TL.WATER && !used.has(k)) { used.add(k); return { x, y }; }
        }
        return null;
      },
      inner: b => B.spot(b.x + 1, b.y + 1, b.x + b.w - 2, b.y + b.h - 2),
      near: (x, y, r) => B.spot(x - r, y - r, x + r, y + r),
      at(x, y) { used.add(idx(x, y)); return { x, y }; },
      // o: { extra: [ids], key, name, tier, table }
      cont(kind, p, o) {
        if (!p) return null; o = o || {};
        const c = { w: 5, h: 5, items: [] }, open = kind === 'herbpatch' || kind === 'woodpile';
        if (!opts.preview) {
          const list = G.rollLoot(o.table || kind, o.tier || M.tier);
          if (o.extra) for (const id of o.extra) list.unshift(G.mk(id));
          if (kind === 'desk' && M.keys && V() < .16) list.push(G.mk(G.pick(M.keys)));
          for (const it of list) G.inv.add(c, it);
          for (const e of c.items) if (!open) e.hid = true;
        }
        const obj = { x: px(p.x), y: px(p.y), kind, name: o.name || NAMES[kind], c, searched: open, key: o.key || null };
        world.containers.push(obj); block(kind, obj.x, obj.y); return obj;
      },
      // o: { patrol, post, face, chance, minTh, follow }. No bows or crossbows on a beginner map: an archer asked for there comes as a raider.
      sp(type, p, o) {
        o = o || {}; if (!p || (o.chance !== undefined && V() > o.chance) || (o.minTh && th < o.minTh)) return null;
        const s = Object.assign({ type: melee(type), x: px(p.x), y: px(p.y) }, o); world.spawns.push(s); return s;
      },
      grp(b, list, o) { for (const ty of list) B.sp(ty, B.inner(b), o); },
      prop(type, x, y, o) { block(type, px(x), px(y)); world.props.push(Object.assign({ type, x: px(x), y: px(y), rot: R() * 6.28 }, o)); used.add(idx(x, y)); },
      fire(x, y, kind) { block(kind || 'fire', px(x), px(y)); world.fires.push({ x: px(x), y: px(y), kind: kind || 'fire' }); used.add(idx(x, y)); },
      label(x, y, name) { world.labels.push({ x, y, name }); },
      zone(id, name, x, y, r) { world.zones.push({ id, name, x: px(x), y: px(y), r: r * T }); },
      pave(x, y, v) { const k = idx(x, y); if (inb(x, y) && edge(x, y) && (soft(t[k]) || t[k] === TL.GRASS)) t[k] = v === undefined ? TL.DIRT : v; },
      line(ax, ay, bx, by, wide, v) {
        const n = Math.max(Math.abs(bx - ax), Math.abs(by - ay), 1);
        for (let i = 0; i <= n; i++) { const x = Math.round(ax + (bx - ax) * i / n), y = Math.round(ay + (by - ay) * i / n); for (let o = 0; o < (wide || 2); o++) { B.pave(x + o, y, v); B.pave(x, y + o, v); } }
      },
      trail(ax, ay, bx, by, v) { let x = ax, y = ay, g = 0; while ((x !== bx || y !== by) && g++ < 600) { if (x !== bx && (y === by || R() < .5)) x += Math.sign(bx - x); else y += Math.sign(by - y); B.pave(x, y, v); } },
      route: pts => pts.map(p => ({ x: px(p[0]), y: px(p[1]) })),
      // men who arrive later: list of [type, x, y, destX, destY]
      wave(at, list, minTh) { if (minTh && th < minTh) return; world.waves.push({ at, list: list.map(e => ({ type: melee(e[0]), x: px(e[1]), y: px(e[2]), dest: { x: px(e[3]), y: px(e[4]) } })) }); }
    };

    // ---- the land, then what was built on it
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) t[idx(x, y)] = Math.min(x, y, W - 1 - x, H - 1 - y) < 2 ? TL.TREE : M.terrain(x, y, B);
    M.build(B);

    // ---- way in, ways out
    const st = M.starts.find(s => s.id === opts.start) || M.starts[0];
    for (const s of M.starts) B.disc(s.x, s.y, 3);
    world.start = { x: px(st.x), y: px(st.y), name: st.name, id: st.id };
    // Two ways out are open on any day, both from the first moment: the one that lies past the place's captain, and
    // one of the others, drawn by lot, so that there is always a road that does not go through him. The rest are shut.
    {
      const cand = M.exits.filter(e => !(e.notFrom && e.notFrom.includes(st.id))), ba = M.bossAt || M.hub, far = e => Math.hypot(e.x - ba[0], e.y - ba[1]) + (e.nopack ? 1000 : 0);
      const bossX = cand.slice().sort((p, q) => far(p) - far(q))[0], rest = cand.filter(e => e !== bossX), lot = mulberry((opts.day || 1) * 7919 + M.seed * 13 + st.x * 31 + st.y)(), other = rest.length ? rest[Math.floor(lot * rest.length) % rest.length] : null;      // by the day, so that friends going up together draw the same
      if (other && !other.inside) B.trail(st.x, st.y, other.x, other.y);      // and a trodden path toward the other one
      for (const e of [bossX, other]) {
        if (!e) continue; if (!e.inside) B.disc(e.x, e.y, 2);
        world.extracts.push({ id: e.id, x: px(e.x), y: px(e.y), r: (e.r || 2.5) * T, name: e.name, dir: e.dir, late: 0, cost: e.cost || 0, nopack: !!e.nopack, key: e.key || null, note: e.note || '', boss: e === bossX });
      }
    }
    world.spawns = world.spawns.filter(s => s.post || s.boss || Math.hypot(s.x - world.start.x, s.y - world.start.y) > 13 * T);
    // fewer of them than there were, by about a third (each is worth more: see mkEnemy); a captain and his own men always stand
    world.spawns = world.spawns.filter(s => s.boss || R() > (G.ENEMIES[s.type] && G.ENEMIES[s.type].quad ? .25 : .36));

    // ---- guarantee everything that matters can be walked to (locked doors count as passable)
    const walk = k => !SOLID[t[k]] || t[k] === TL.DOOR;
    function flood(sx, sy) {
      const seen = new Uint8Array(W * H), q = [idx(sx, sy)]; seen[q[0]] = 1;
      while (q.length) { const k = q.pop(), x = k % W, y = (k / W) | 0; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy, nk = idx(nx, ny); if (inb(nx, ny) && !seen[nk] && walk(nk)) { seen[nk] = 1; q.push(nk); } } }
      return seen;
    }
    const must = [...world.containers, ...world.spawns, ...world.extracts, ...world.zones, ...M.starts.map(s => ({ x: px(s.x), y: px(s.y) })), ...M.exits.map(s => ({ x: px(s.x), y: px(s.y) }))].map(o => ({ x: (o.x / T) | 0, y: (o.y / T) | 0 }));
    let reach = flood(M.hub[0], M.hub[1]); world.unreached = 0;
    for (const m of must) {
      if (!inb(m.x, m.y) || reach[idx(m.x, m.y)]) continue;
      const par = new Int32Array(W * H).fill(-1), q = [idx(m.x, m.y)]; par[q[0]] = q[0]; let hit = -1;
      for (let qi = 0; qi < q.length && hit < 0; qi++) {
        const k = q[qi], x = k % W, y = (k / W) | 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx, ny = y + dy, nk = idx(nx, ny);
          if (nx < 2 || ny < 2 || nx >= W - 2 || ny >= H - 2 || par[nk] >= 0 || (SOLID[t[nk]] && t[nk] !== TL.TREE && t[nk] !== TL.ROCK && t[nk] !== TL.DOOR)) continue;
          par[nk] = k; if (reach[nk]) { hit = nk; break; } q.push(nk);
        }
      }
      if (hit < 0) { world.unreached++; continue; }
      for (let k = hit; k >= 0 && par[k] !== k; k = par[k]) if (t[k] === TL.TREE || t[k] === TL.ROCK) t[k] = TL.GRASS;
      reach = flood(M.hub[0], M.hub[1]);
    }

    // ---- queries
    world.tile = (tx, ty) => inb(tx, ty) ? t[idx(tx, ty)] : TL.TREE;
    world.tileAt = (x, y) => world.tile(Math.floor(x / T), Math.floor(y / T));
    world.solidPx = (x, y) => SOLID[world.tileAt(x, y)] === 1;
    world.shotPx = (x, y) => SHOT[world.tileAt(x, y)] === 1;
    world.speedAt = (x, y) => SPEED[world.tileAt(x, y)];
    world.openDoor = d => { d.locked = false; t[idx(d.tx, d.ty)] = d.floor; };
    world.zoneAt = (x, y) => { for (const z of world.zones) if (Math.hypot(z.x - x, z.y - y) < z.r) return z; return null; };
    world.los = (x0, y0, x1, y1) => {
      const d = Math.hypot(x1 - x0, y1 - y0), n = Math.ceil(d / 8);
      const t0 = Math.floor(x0 / T) + Math.floor(y0 / T) * W, t1 = Math.floor(x1 / T) + Math.floor(y1 / T) * W;
      for (let i = 1; i < n; i++) {
        const x = x0 + (x1 - x0) * i / n, y = y0 + (y1 - y0) * i / n, k = Math.floor(x / T) + Math.floor(y / T) * W;
        if (k !== t0 && k !== t1 && OPAQUE[t[k]]) return false;
      }
      return true;
    };
    // A* over tiles; returns list of px waypoints or null
    const gs = new Float32Array(W * H), came = new Int32Array(W * H), stamp = new Int32Array(W * H); let gen = 0;
    world.path = (sx, sy, tx, ty) => {
      const cl = (v, n) => { v = Math.floor(v); return v < 0 ? 0 : v >= n ? n - 1 : v; };
      let s = idx(cl(sx / T, W), cl(sy / T, H)), gx = cl(tx / T, W), gy = cl(ty / T, H);
      if (SOLID[t[idx(gx, gy)]]) { let f = null; for (let r = 1; r < 4 && !f; r++) for (let y = gy - r; y <= gy + r && !f; y++) for (let x = gx - r; x <= gx + r; x++) if (inb(x, y) && !SOLID[t[idx(x, y)]]) { f = [x, y]; break; } if (!f) return null; gx = f[0]; gy = f[1]; }
      const g = idx(gx, gy); gen++;
      const heap = [], hf = [];
      const push = (k, f) => { let i = heap.length; heap.push(k); hf.push(f); while (i > 0) { const p = (i - 1) >> 1; if (hf[p] <= f) break; heap[i] = heap[p]; hf[i] = hf[p]; i = p; } heap[i] = k; hf[i] = f; };
      const pop = () => { const top = heap[0], k = heap.pop(), f = hf.pop(); const n = heap.length; if (n) { let i = 0; for (; ;) { let c = i * 2 + 1; if (c >= n) break; if (c + 1 < n && hf[c + 1] < hf[c]) c++; if (hf[c] >= f) break; heap[i] = heap[c]; hf[i] = hf[c]; i = c; } heap[i] = k; hf[i] = f; } return top; };
      gs[s] = 0; came[s] = -1; stamp[s] = gen; push(s, 0);
      let nodes = 0;
      while (heap.length && nodes++ < 5000) {
        const k = pop(); if (k === g) break;
        const x = k % W, y = (k / W) | 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = x + dx, ny = y + dy; if (!inb(nx, ny)) continue;
          const nk = idx(nx, ny); if (SOLID[t[nk]]) continue;
          if (dx && dy && (SOLID[t[idx(x + dx, y)]] || SOLID[t[idx(x, y + dy)]])) continue;
          const c = gs[k] + (dx && dy ? 1.41 : 1) / SPEED[t[nk]];
          if (stamp[nk] === gen && gs[nk] <= c) continue;
          gs[nk] = c; came[nk] = k; stamp[nk] = gen; push(nk, c + Math.hypot(gx - nx, gy - ny));
        }
      }
      if (stamp[g] !== gen) return null;
      const out = []; for (let k = g; k !== s && k >= 0; k = came[k]) out.push({ x: px(k % W), y: px((k / W) | 0) });
      return out.reverse();
    };
    return world;
  };

  // ---------------------------------------------------------------- parchment map (briefing, and the M key)
  // o: { start, exits, player:{x,y,ang}, left (seconds left, for late ways out) }
  const MC = ['#b3a274', '#c7b68a', '#a88c5e', '#a39c8e', '#3a3128', '#4a3524', '#6f7a4c', '#8fa8ae', '#909a62', '#5f7f8c', '#6a5f50', '#9a8a62', '#b0a898', '#7a2a1c', '#a8a060', '#77736a'];
  const cache = {};
  G.mapWorld = id => cache[id] || (cache[id] = G.genWorld({ map: id, preview: true }));
  G.drawMap = function (c, id, ox, oy, s, o) {
    const w = G.mapWorld(id); o = o || {};
    c.fillStyle = '#c2b186'; c.fillRect(ox - 14, oy - 14, w.w * s + 28, w.h * s + 28);
    c.strokeStyle = '#5a4a30'; c.lineWidth = 2; c.strokeRect(ox - 8, oy - 8, w.w * s + 16, w.h * s + 16);
    for (let y = 0; y < w.h; y++) for (let x = 0; x < w.w; x++) { c.fillStyle = MC[w.t[x + y * w.w]]; c.fillRect(ox + x * s, oy + y * s, s + .5, s + .5); }
    c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = `italic ${Math.max(11, s * 2.8)}px Georgia`;
    for (const l of w.labels) { const tw = c.measureText(l.name).width; c.fillStyle = 'rgba(194,177,134,.8)'; c.fillRect(ox + l.x * s - tw / 2 - 3, oy + l.y * s - 7, tw + 6, 14); c.fillStyle = '#2e2416'; c.fillText(l.name, ox + l.x * s, oy + l.y * s); }
    const mark = (x, y, col, txt) => {
      const X = ox + x / T * s, Y = oy + y / T * s; c.strokeStyle = col; c.lineWidth = 2.5; c.beginPath(); c.arc(X, Y, s * 2.4, 0, 7); c.stroke();
      c.font = `bold ${Math.max(11, s * 2.6)}px Georgia`; const tw = c.measureText(txt).width, tx = Math.max(ox + tw / 2 + 2, Math.min(ox + w.w * s - tw / 2 - 2, X)), ty = Y + s * 5 * (y / T > w.h * .55 ? -1 : 1);
      c.fillStyle = 'rgba(194,177,134,.85)'; c.fillRect(tx - tw / 2 - 3, ty - 7, tw + 6, 14); c.fillStyle = col; c.fillText(txt, tx, ty);
    };
    if (o.exits) for (const e of o.exits) mark(e.x, e.y, e.cost ? '#6a4a10' : e.late ? '#27506e' : '#1f5a2a', e.name);
    if (o.start) mark(o.start.x, o.start.y, '#8a1f14', 'you go in here');
    if (o.player) { const p = o.player, X = ox + p.x / T * s, Y = oy + p.y / T * s; c.fillStyle = '#a01f14'; c.beginPath(); c.moveTo(X + Math.cos(p.ang) * 9, Y + Math.sin(p.ang) * 9); c.lineTo(X + Math.cos(p.ang + 2.5) * 6, Y + Math.sin(p.ang + 2.5) * 6); c.lineTo(X + Math.cos(p.ang - 2.5) * 6, Y + Math.sin(p.ang - 2.5) * 6); c.fill(); }
  };
  // how a way out reads in a list
  G.exitText = e => e.name + (e.dir ? ` (${e.dir})` : '') + (e.cost ? ` — ${e.cost} silver` : '') + (e.nopack ? ' — no pack will fit' : '') + (e.late ? ` — only in the last ${e.late} minutes` : '') + (e.boss ? ' — their captain keeps the ground before it' : '') + (e.note ? ' — ' + e.note : '');
})();
