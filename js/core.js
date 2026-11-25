'use strict';
// Utilities, item instances, the grid inventory model (with rotation), loot rolls, synthesised audio.
//
// Item instance: { id, n? (stack), dur? (condition 0-1), u? (uses / pool left), c? (own container), r? (rotated), fir? (found in raid), ins? (insured) }
// Container:     { w, h, items: [ { it, x, y, hid? (not yet found while searching) } ] }
(function () {
  const I = G.ITEMS;
  G.rand = (a, b) => a + Math.random() * (b - a);
  G.irand = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  G.pick = a => a[Math.floor(Math.random() * a.length)];
  G.wpick = l => { let s = 0; for (const e of l) s += e[1]; let r = Math.random() * s; for (const e of l) { r -= e[1]; if (r <= 0) return e[0]; } return l[0][0]; };
  G.clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  G.lerp = (a, b, t) => a + (b - a) * t;
  G.angDiff = (a, b) => { let d = (a - b) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; };
  G.cap = s => s[0].toUpperCase() + s.slice(1);

  // ------------------------------------------------------------ items
  G.def = it => it ? I[it.id] : null;
  G.iw = it => it.r ? I[it.id].h : I[it.id].w;
  G.ih = it => it.r ? I[it.id].w : I[it.id].h;
  G.mk = (id, n) => {
    const d = I[id], it = { id };
    if (!d) throw new Error('no such item: ' + id);
    if (d.stack) it.n = Math.min(d.stack, n || 1);
    if (d.cond) it.dur = 1;
    if (d.pool) it.u = d.pool;
    if (d.cw) { it.c = { w: d.cw, h: d.ch, items: [] }; if (d.only) it.c.only = d.only; }
    if (id === 'dispatch') it.t = Math.floor(Math.random() * G.LETTERS.length);
    return it;
  };
  G.canStack = (a, b) => a !== b && a.id === b.id && !!I[a.id].stack && !!a.fir === !!b.fir && (!G.raidHad || G.raidHad.has(a) === G.raidHad.has(b));   // in a raid, what you brought never stacks with what you found
  const condF = it => (it.dur != null ? .3 + .7 * it.dur : 1) * (it.u != null ? it.u / I[it.id].pool : 1);
  G.itemValue = it => { let v = I[it.id].value * (it.n || 1) * condF(it); if (it.c) for (const o of it.c.items) v += G.itemValue(o.it); return v; };
  G.itemWeight = it => { let w = I[it.id].weight * (it.n || 1); if (it.c) for (const o of it.c.items) w += G.itemWeight(o.it); return w; };
  G.eachItem = (it, fn) => { fn(it); if (it.c) for (const o of it.c.items) G.eachItem(o.it, fn); };

  // ------------------------------------------------------------ grid inventory
  G.inv = {
    fits(c, it, x, y, ignore, rot) {
      const r = rot === undefined ? !!it.r : rot, d = I[it.id], w = r ? d.h : d.w, h = r ? d.w : d.h;
      if (c.only && d.cat !== c.only) return false;
      if (x < 0 || y < 0 || x + w > c.w || y + h > c.h) return false;
      for (const o of c.items) {
        if (o.it === ignore) continue;
        const ow = G.iw(o.it), oh = G.ih(o.it);
        if (x < o.x + ow && x + w > o.x && y < o.y + oh && y + h > o.y) return false;
      }
      return true;
    },
    spot(c, it) {
      const d = I[it.id], rots = d.w === d.h ? [!!it.r] : [!!it.r, !it.r];
      for (const r of rots) for (let y = 0; y < c.h; y++) for (let x = 0; x < c.w; x++) if (this.fits(c, it, x, y, null, r)) return { x, y, r };
      return null;
    },
    add(c, it) {
      if (!c || it.c === c || (c.only && I[it.id].cat !== c.only)) return false;
      const d = I[it.id];
      if (d.stack) for (const o of c.items) if (!o.hid && G.canStack(o.it, it) && o.it.n < d.stack) {
        const m = Math.min(d.stack - o.it.n, it.n); o.it.n += m; it.n -= m;
        if (it.n <= 0) return true;
      }
      const s = this.spot(c, it);
      if (!s) return false;
      it.r = s.r || undefined; c.items.push({ it, x: s.x, y: s.y });
      return true;
    },
    remove(c, it) { const i = c.items.findIndex(o => o.it === it); if (i >= 0) c.items.splice(i, 1); return i >= 0; },
    at(c, x, y) { for (const o of c.items) if (x >= o.x && x < o.x + G.iw(o.it) && y >= o.y && y < o.y + G.ih(o.it)) return o; return null; },
    count(c, id, fir) { let n = 0; for (const o of c.items) if (o.it.id === id && (!fir || o.it.fir)) n += o.it.n || 1; return n; },
    take(c, id, n, fir) {
      for (let i = c.items.length - 1; i >= 0 && n > 0; i--) {
        const it = c.items[i].it; if (it.id !== id || (fir && !it.fir)) continue;
        if ((it.n || 1) > n) { it.n -= n; n = 0; } else { n -= it.n || 1; c.items.splice(i, 1); }
      }
      return n <= 0;
    },
    tidy(c) {
      const items = c.items.map(o => o.it).sort((a, b) => { const x = I[a.id], y = I[b.id]; return y.h * y.w - x.h * x.w || x.cat.localeCompare(y.cat) || x.id.localeCompare(y.id); });
      c.items = []; const lost = [];
      for (const it of items) { it.r = undefined; if (!this.add(c, it)) lost.push(it); }
      for (const it of lost) c.items.push({ it, x: 0, y: 0 });     // cannot happen in practice; never destroy items
    }
  };

  G.rollLoot = (name, tier) => {
    const t = G.LOOT[name], out = []; if (!t) return out; tier = tier || 1;
    const pool = t.items.filter(e => (e[4] || 1) <= tier && (e[5] || 9) >= tier).map(e => [e, e[1]]);
    const n = G.irand(t.rolls[0], t.rolls[1]);
    for (let i = 0; i < n; i++) {
      const e = G.wpick(pool); if (!e[0]) continue;
      const it = G.mk(e[0], G.irand(e[2] || 1, e[3] || e[2] || 1));
      if (it.dur != null) it.dur = G.rand(.4, 1);
      if (it.u != null && I[it.id].pool > 3) it.u = Math.max(10, Math.round(I[it.id].pool * G.rand(.4, 1)));
      out.push(it);
    }
    return out;
  };

})();
