'use strict';
// Renderer, part 2: every texture in the game, drawn by code the first time a raid starts.
// Ground layers go into two array textures (colour, and normal + height) so the ground shader can blend them.
(function () {
  const X = G.gx, PI = Math.PI;
  function rng(seed) { let a = seed >>> 0; return () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  const sstep = (a, b, v) => { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
  const sm = a => { for (let i = 0; i < a.length; i++) a[i] = .3 + a[i] * .4; return a; };      // flatten a noise field toward its middle
  // tileable smooth value noise on a w×h grid from a cx×cy lattice
  function vnoise(w, h, cx, cy, R) {
    const lat = new Float32Array(cx * cy); for (let i = 0; i < lat.length; i++) lat[i] = R();
    const out = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
      const fy = y / h * cy, y0 = fy | 0, ty = fy - y0, sy = ty * ty * (3 - 2 * ty), ya = (y0 % cy) * cx, yb = ((y0 + 1) % cy) * cx;
      for (let x = 0; x < w; x++) {
        const fx = x / w * cx, x0 = fx | 0, tx = fx - x0, sx = tx * tx * (3 - 2 * tx), xa = x0 % cx, xb = (x0 + 1) % cx;
        const a = lat[ya + xa], b = lat[ya + xb], c = lat[yb + xa], d = lat[yb + xb];
        out[x + y * w] = a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
      }
    }
    return out;
  }
  function norm(a) { let lo = 1e9, hi = -1e9; for (let i = 0; i < a.length; i++) { if (a[i] < lo) lo = a[i]; if (a[i] > hi) hi = a[i]; } const k = 1 / (hi - lo || 1); for (let i = 0; i < a.length; i++) a[i] = (a[i] - lo) * k; return a; }
  function fbm(w, h, cx, cy, oct, R) {
    const out = new Float32Array(w * h); let amp = 1;
    for (let o = 0; o < oct && cx <= w / 2 && cy <= h / 2; o++) { const f = vnoise(w, h, cx, cy, R); for (let i = 0; i < out.length; i++) out[i] += f[i] * amp; amp *= .5; cx *= 2; cy *= 2; }
    return norm(out);
  }
  // tileable cell noise: f1 = distance to the nearest point, edge = distance to the cell wall, id = a random number per cell
  function worley(n, c, R) {
    const px = new Float32Array(c * c), py = new Float32Array(c * c), pr = new Float32Array(c * c);
    for (let i = 0; i < c * c; i++) { px[i] = R(); py[i] = R(); pr[i] = R(); }
    const f1 = new Float32Array(n * n), edge = new Float32Array(n * n), id = new Float32Array(n * n);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const gx = x / n * c, gy = y / n * c, ix = gx | 0, iy = gy | 0; let a = 9, b = 9, who = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const k = ((ix + dx + c) % c) + ((iy + dy + c) % c) * c, ex = ix + dx + px[k] - gx, ey = iy + dy + py[k] - gy, d = ex * ex + ey * ey;
        if (d < a) { b = a; a = d; who = pr[k]; } else if (d < b) b = d;
      }
      const i = x + y * n; f1[i] = Math.sqrt(a); edge[i] = Math.sqrt(b) - f1[i]; id[i] = who;
    }
    return { f1, edge, id };
  }
  const canvasOf = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h || w; return c; };
  // fn(i, x, y, d) writes d[i*4 .. i*4+3]
  function pix(w, h, fn) { const c = canvasOf(w, h), g = c.getContext('2d'), id = g.createImageData(w, h), d = id.data; for (let y = 0, i = 0; y < h; y++) for (let x = 0; x < w; x++, i++) { d[i * 4 + 3] = 255; fn(i, x, y, d); } g.putImageData(id, 0, 0); return c; }
  const put = (d, i, c, k) => { d[i * 4] = c[0] * k; d[i * 4 + 1] = c[1] * k; d[i * 4 + 2] = c[2] * k; };
  const mix3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  // draw something that may cross the edge of a tile so that it wraps
  function wrap(g, w, h, x, y, r, draw) { for (const ox of x < r ? [0, w] : x > w - r ? [0, -w] : [0]) for (const oy of y < r ? [0, h] : y > h - r ? [0, -h] : [0]) { g.save(); g.translate(x + ox, y + oy); draw(g); g.restore(); } }
  const lumOf = (c, scale) => { const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data, o = new Float32Array(c.width * c.height); for (let i = 0; i < o.length; i++) o[i] = (d[i * 4] + d[i * 4 + 1] + d[i * 4 + 2]) / 765 * (scale || 1); return o; };
  // tangent-space normal bytes from a height field (wraps); alpha carries the height
  function normalBytes(H, w, h, strength, flipG) {
    const o = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = x + y * w, dx = (H[(x + 1) % w + y * w] - H[(x + w - 1) % w + y * w]) * strength, dy = (H[x + ((y + 1) % h) * w] - H[x + ((y + h - 1) % h) * w]) * strength, l = Math.hypot(dx, dy, 1);
      o[i * 4] = (-dx / l * .5 + .5) * 255; o[i * 4 + 1] = ((flipG ? dy : -dy) / l * .5 + .5) * 255; o[i * 4 + 2] = (1 / l * .5 + .5) * 255; o[i * 4 + 3] = Math.max(0, Math.min(1, H[i])) * 255;
    }
    return o;
  }
  function tex(c, o) {
    o = o || {}; const t = new THREE.CanvasTexture(c); if (!o.data) t.encoding = THREE.sRGBEncoding; t.anisotropy = o.aniso || 8;
    if (o.wrap !== false) t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
  }
  function normalTex(H, w, h, strength) { const c = canvasOf(w, h), g = c.getContext('2d'), id = g.createImageData(w, h); id.data.set(normalBytes(H, w, h, strength, true)); for (let i = 3; i < id.data.length; i += 4) id.data[i] = 255; g.putImageData(id, 0, 0); return tex(c, { data: true }); }
  // rows of blocks that fill a w×h tile and wrap in x
  function courses(w, h, R, hmin, hmax, wmin, wmax) {
    const out = []; let y = 0; const ir = (a, b) => a + Math.floor(R() * (b - a + 1));
    while (y < h) { let hh = ir(hmin, hmax); if (h - y - hh < hmin) hh = h - y; let x = ir(0, wmax), rem = w; while (rem > 0) { let ww = ir(wmin, wmax); if (rem - ww < wmin) ww = rem; out.push({ x: x % w, y, w: ww, h: hh, r: R(), r2: R(), r3: R() }); x += ww; rem -= ww; } y += hh; }
    return out;
  }
  // fn(i, e, cx, cy, blk): e = 0 in the mortar rising to 1 inside the block
  function blocks(w, h, list, gap, rad, edge, fn, wob, amt) {
    for (const b of list) for (let py = 0; py < b.h; py++) for (let qx = 0; qx < b.w; qx++) {
      const cx = qx - b.w / 2 + .5, cy = py - b.h / 2 + .5, ax = Math.abs(cx) - (b.w / 2 - gap - rad), ay = Math.abs(cy) - (b.h / 2 - gap - rad);
      const i = ((b.x + qx) % w) + (b.y + py) * w, sd = Math.hypot(Math.max(ax, 0), Math.max(ay, 0)) + Math.min(Math.max(ax, ay), 0) - rad + (wob ? (wob[i] - .5) * amt + b.r3 * amt * .4 : 0);      // wob roughens the outline
      fn(i, Math.max(0, Math.min(1, -sd / edge)), cx / b.w, cy / b.h, b);
    }
  }

  X.textures = function () {
    if (X.TX) return X.TX;
    const R = rng(90210), TX = X.TX = {}, N = 512, t0 = performance.now();
    const nA = fbm(N, N, 3, 3, 5, R), nA2 = fbm(N, N, 4, 4, 4, R), nB = fbm(N, N, 14, 14, 4, R), nC = fbm(N, N, 64, 64, 3, R);

    // ---- photographs, where they have arrived (see assets.js). Everything they are used for below can also be drawn
    //      here by hand, and is, if a picture is missing.
    const A = G.assets, have = (n, maps) => !!(A && A.has(n, maps));
    // a photograph's light and dark, with its mean at 1, for laying its grain over a colour of our own; and its height, stretched to 0..1
    const lumOfPhoto = (name, w, h, turn) => { const d = A.px(name, 'd', w, h, turn), o = new Float32Array(w * h); let s = 0; for (let i = 0; i < o.length; i++) { o[i] = (d[i * 4] * .3 + d[i * 4 + 1] * .59 + d[i * 4 + 2] * .11) / 255; s += o[i]; } s = s / o.length || 1; for (let i = 0; i < o.length; i++) o[i] /= s; return o; };
    const heightOfPhoto = (name, w, h, turn) => { const d = A.px(name, 'h', w, h, turn), o = new Float32Array(w * h); let lo = 255, hi = 0; for (let i = 0; i < o.length; i++) { const v = d[i * 4]; if (v < lo) lo = v; if (v > hi) hi = v; } const k = 1 / (hi - lo || 1); for (let i = 0; i < o.length; i++) o[i] = (d[i * 4] - lo) * k; return o; };
    // bring a photograph to the tone the place is lit for: its mean colour is moved to the one given (keep: how much of its own hue it keeps)
    const toned = (c, target, keep) => {
      const g = c.getContext('2d'), id = g.getImageData(0, 0, c.width, c.height), d = id.data, m = [0, 0, 0], n = d.length / 4; for (let i = 0; i < d.length; i += 4) { m[0] += d[i]; m[1] += d[i + 1]; m[2] += d[i + 2]; }
      const all = (target[0] + target[1] + target[2]) / ((m[0] + m[1] + m[2]) / n || 1), k = [0, 1, 2].map(q => { const own = target[q] / (m[q] / n || 1); return own + (all - own) * (keep === undefined ? .35 : keep); });
      for (let i = 0; i < d.length; i += 4) { d[i] *= k[0]; d[i + 1] *= k[1]; d[i + 2] *= k[2]; } g.putImageData(id, 0, 0); return c;
    };
    const PG = ['grass', 'dirt', 'mud', 'cobble', 'flag', 'planks', 'forest', 'silt'], photoG = !!X.q.gl2 && PG.every(n => have(n, 'dnh'));

    // ---- noise the shaders read directly
    { const a = fbm(256, 256, 40, 40, 3, R), b = fbm(256, 256, 5, 5, 4, R), c = fbm(256, 256, 3, 48, 3, R);
      TX.grime = tex(pix(256, 256, (i, x, y, d) => { d[i * 4] = (a[i] * .7 + R() * .3) * 255; d[i * 4 + 1] = sstep(.15, .85, b[i]) * 255; d[i * 4 + 2] = c[i] * 255; }), { data: true }); X.U.grime.value = TX.grime; }
    { const a = fbm(256, 256, 3, 3, 6, R), b = fbm(256, 256, 6, 6, 5, R), c = fbm(256, 256, 12, 12, 4, R);
      TX.cloud = tex(pix(256, 256, (i, x, y, d) => { d[i * 4] = a[i] * 255; d[i * 4 + 1] = b[i] * 255; d[i * 4 + 2] = c[i] * 255; }), { data: true }); }
    TX.smoke = tex(pix(64, 64, (i, x, y, d) => { const r = Math.hypot(x - 31.5, y - 31.5) / 32, v = Math.max(0, 1 - r); d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = 255; d[i * 4 + 3] = v * v * (3 - 2 * v) * 255; }), { data: true, wrap: false });
    TX.flat = tex(pix(2, 2, (i, x, y, d) => { d[i * 4] = d[i * 4 + 1] = 128; d[i * 4 + 2] = 255; }), { data: true });

    // ---- ground layers: 0 grass 1 dirt 2 mud 3 cobble 4 flagstone 5 planks 6 forest floor 7 silt
    const L = [];
    const layer = (c, H, strength) => L.push({ a: c.getContext('2d').getImageData(0, 0, N, N).data, n: normalBytes(H, N, N, strength, false) });
    const strokes = (c, count, fn) => { const g = c.getContext('2d'); g.lineCap = 'round'; for (let k = 0; k < count; k++) fn(g, R() * N, R() * N); return c; };
    if (!photoG) {
    { // grass: matted turf
      const c = pix(N, N, (i, x, y, d) => { let col = mix3([40, 48, 26], [66, 74, 38], nB[i] * .6 + nA[i] * .4); col = mix3(col, [62, 52, 34], sstep(.6, .82, nA2[i]) * .7); put(d, i, col, .86 + nC[i] * .3); });
      const pal = ['rgba(60,74,34,.55)', 'rgba(86,94,46,.5)', 'rgba(106,102,56,.4)', 'rgba(38,48,24,.55)', 'rgba(74,84,40,.5)'];
      strokes(c, 11000, (g, x, y) => { const a = R() * 6.28, l = 4 + R() * 9; g.strokeStyle = pal[R() * pal.length | 0]; g.lineWidth = .8 + R(); wrap(g, N, N, x, y, 14, g2 => { g2.beginPath(); g2.moveTo(0, 0); g2.lineTo(Math.cos(a) * l, Math.sin(a) * l); g2.stroke(); }); });
      const H = lumOf(c, 2.4); for (let i = 0; i < H.length; i++) H[i] = H[i] * .6 + nC[i] * .3 + nB[i] * .1; layer(c, H, 2.2);
    }
    { // dirt: packed earth and small stones
      const W = worley(N, 44, R), H = new Float32Array(N * N);
      const c = pix(N, N, (i, x, y, d) => {
        let col = mix3([62, 53, 40], [94, 82, 64], nB[i] * .65 + nA[i] * .35), k = (.86 + nC[i] * .28) * (nA2[i] < .35 ? .86 : 1); H[i] = .3 + nB[i] * .25 + nC[i] * .2;
        const sz = .1 + W.id[i] * .2; if (W.id[i] > .74 && W.f1[i] < sz) { const e = 1 - W.f1[i] / sz; col = mix3(col, mix3([78, 72, 62], [112, 104, 92], (W.id[i] * 7.3) % 1), Math.min(1, e * 3)); H[i] += e * .45; k *= .85 + e * .25; }
        put(d, i, col, k);
      }); layer(c, H, 3.2);
    }
    { // mud: dark, churned, pitted
      const W = worley(N, 13, R), H = new Float32Array(N * N);
      const c = pix(N, N, (i, x, y, d) => {
        let k = .9 + nC[i] * .2; H[i] = .4 + nA[i] * .3 + nB[i] * .2;
        if (W.id[i] > .45 && W.f1[i] < .34) { const e = 1 - W.f1[i] / .34; H[i] -= sstep(0, .7, e) * .3 - sstep(.0, .2, e) * .08; k *= 1 - e * .25; }
        put(d, i, mix3([36, 30, 22], [62, 52, 38], nB[i]), k);
      }); layer(c, H, 2.6);
    }
    { // cobbles
      const W = worley(N, 18, R), H = new Float32Array(N * N);
      const c = pix(N, N, (i, x, y, d) => {
        const s = sstep(.03, .16, W.edge[i]), id = W.id[i], warm = (id * 7.31) % 1;
        let stone = mix3([72, 70, 66], [120, 116, 106], id); stone = mix3(stone, [104, 90, 72], warm * .4);
        let gap = mix3([40, 34, 26], [46, 54, 30], sstep(.55, .75, nA[i]));
        put(d, i, mix3(gap, stone, s), (.84 + nC[i] * .32) * (.85 + s * .15 * Math.min(1, W.edge[i] * 3)));
        H[i] = s * (.5 + .45 * Math.sqrt(Math.min(1, W.edge[i] * 2.4))) + nC[i] * .08;
      }); layer(c, H, 5);
    }
    { // flagstones
      const H = new Float32Array(N * N), list = courses(N, N, R, 96, 160, 90, 210), c = canvasOf(N, N), g = c.getContext('2d'), id = g.createImageData(N, N), d = id.data;
      blocks(N, N, list, 2.5, 4, 5, (i, e, cx, cy, b) => {
        const st = mix3([84, 84, 80], [106, 104, 98], b.r), k = (.9 + nB[i] * .14 + nC[i] * .08) * (.82 + e * .18);
        const col = e > 0 ? mix3(st, [96, 88, 72], b.r2 * .35) : [34, 30, 24]; d[i * 4] = col[0] * k; d[i * 4 + 1] = col[1] * k; d[i * 4 + 2] = col[2] * k; d[i * 4 + 3] = 255;
        H[i] = e > 0 ? .5 + e * .25 + (b.r3 - .5) * .14 + nC[i] * .07 + (cx * (b.r - .5) + cy * (b.r2 - .5)) * .12 : .1;
      });
      g.putImageData(id, 0, 0); g.strokeStyle = 'rgba(20,18,14,.7)'; g.lineWidth = 1.2;
      for (let k = 0; k < 9; k++) { let x = R() * N, y = R() * N; g.beginPath(); g.moveTo(x, y); for (let s = 0; s < 6; s++) { x += (R() - .5) * 46; y += (R() - .2) * 30; g.lineTo(x, y); } g.stroke(); }
      const lm = lumOf(c, 1); for (let i = 0; i < H.length; i++) if (lm[i] < .1) H[i] = Math.min(H[i], .2); layer(c, H, 3.2);
    }
    { // planks, running along x
      const H = new Float32Array(N * N), gr = sm(norm(vnoise(N, N, 5, 128, R))), gr2 = vnoise(N, N, 12, 64, R), bw = 32, tone = [], joint = [];
      for (let j = 0; j < N / bw; j++) { tone.push(R()); joint.push([R() * N | 0, R() < .6 ? R() * N | 0 : -9]); }
      const c = pix(N, N, (i, x, y, d) => {
        const j = y / bw | 0, yy = y % bw, t = tone[j], seam = yy < 1.5 || yy > bw - 1.5 || Math.abs(x - joint[j][0]) < 1.2 || Math.abs(x - joint[j][1]) < 1.2, g = gr[i] * .7 + gr2[i] * .3;
        if (seam) { put(d, i, [18, 13, 9], 1); H[i] = .08; return; }
        put(d, i, mix3([70, 52, 34], [108, 84, 56], t * .4 + g * .6), .9 + nC[i] * .2); H[i] = .55 + g * .12 + (t - .5) * .1 + Math.min(yy, bw - yy) / bw * .08;
      });
      const g = c.getContext('2d'); for (let k = 0; k < 26; k++) { const x = R() * N, y = R() * N; wrap(g, N, N, x, y, 10, g2 => { g2.fillStyle = 'rgba(26,17,10,.7)'; g2.beginPath(); g2.ellipse(0, 0, 5 + R() * 4, 2.5 + R() * 2, 0, 0, 7); g2.fill(); }); }
      layer(c, H, 2.8);
    }
    { // forest floor: needles, twigs, moss
      const c = pix(N, N, (i, x, y, d) => put(d, i, mix3(mix3([30, 26, 18], [56, 46, 28], nB[i]), [40, 54, 28], sstep(.58, .78, nA[i]) * .8), .84 + nC[i] * .32));
      const pal = ['rgba(98,68,36,.6)', 'rgba(72,50,30,.6)', 'rgba(122,94,52,.5)', 'rgba(46,38,24,.6)', 'rgba(84,70,40,.5)'];
      strokes(c, 9000, (g, x, y) => { const a = R() * 6.28, l = 4 + R() * 7; g.strokeStyle = pal[R() * pal.length | 0]; g.lineWidth = .9; wrap(g, N, N, x, y, 12, g2 => { g2.beginPath(); g2.moveTo(0, 0); g2.lineTo(Math.cos(a) * l, Math.sin(a) * l); g2.stroke(); }); });
      strokes(c, 150, (g, x, y) => { const a = R() * 6.28, l = 18 + R() * 40; g.strokeStyle = 'rgba(30,22,14,.85)'; g.lineWidth = 1.5 + R() * 1.5; wrap(g, N, N, x, y, 60, g2 => { g2.beginPath(); g2.moveTo(0, 0); g2.quadraticCurveTo(Math.cos(a + .3) * l * .5, Math.sin(a + .3) * l * .5, Math.cos(a) * l, Math.sin(a) * l); g2.stroke(); }); });
      strokes(c, 260, (g, x, y) => { const a = R() * 6.28; g.fillStyle = ['rgba(128,92,40,.7)', 'rgba(96,60,30,.7)', 'rgba(140,112,50,.6)'][R() * 3 | 0]; wrap(g, N, N, x, y, 10, g2 => { g2.rotate(a); g2.beginPath(); g2.ellipse(0, 0, 4 + R() * 3, 2 + R() * 1.5, 0, 0, 7); g2.fill(); }); });
      const H = lumOf(c, 2.6); for (let i = 0; i < H.length; i++) H[i] = H[i] * .6 + nC[i] * .25 + nB[i] * .15; layer(c, H, 2.6);
    }
    { // silt: what lies under shallow water
      const W = worley(N, 30, R), H = new Float32Array(N * N);
      const c = pix(N, N, (i, x, y, d) => { let col = mix3([40, 42, 32], [66, 64, 50], nB[i] * .6 + nA[i] * .4), k = .9 + nC[i] * .2; H[i] = .35 + nA[i] * .3 + nB[i] * .15; if (W.id[i] > .7 && W.f1[i] < .2) { col = mix3(col, [96, 94, 84], .7); H[i] += .2; } put(d, i, col, k); });
      layer(c, H, 1.8);
    }
    }
    if (photoG) {      // the same eight layers from photographs, each brought to the tone its hand-drawn layer had
      const M = 1024, a = new Uint8Array(M * M * 4 * 8), nn = new Uint8Array(M * M * 4 * 8), TONE = [[50, 58, 31], [78, 67, 52], [48, 40, 29], [90, 88, 80], [94, 92, 87], [84, 65, 44], [60, 52, 37], [52, 52, 40]];
      PG.forEach((name, k) => {
        const d = toned(A.canvas(name, 'd', M, M), TONE[k], .4).getContext('2d').getImageData(0, 0, M, M).data, nr = A.px(name, 'n', M, M), hh = heightOfPhoto(name, M, M), o = k * M * M * 4;
        a.set(d, o); for (let i = 0; i < M * M; i++) { nn[o + i * 4] = nr[i * 4]; nn[o + i * 4 + 1] = 255 - nr[i * 4 + 1]; nn[o + i * 4 + 2] = nr[i * 4 + 2]; nn[o + i * 4 + 3] = hh[i] * 255; }      // green is turned over: these rows run downward
      });
      const arr = data => { const t = new THREE.DataTexture2DArray(data, M, M, 8); t.format = THREE.RGBAFormat; t.type = THREE.UnsignedByteType; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.generateMipmaps = true; t.anisotropy = 8; t.needsUpdate = true; return t; };
      TX.gA = arr(a); TX.gN = arr(nn);
    } else if (X.q.gl2) {
      const mk = key => { const data = new Uint8Array(N * N * 4 * L.length); L.forEach((l, k) => data.set(l[key], k * N * N * 4)); const t = new THREE.DataTexture2DArray(data, N, N, L.length); t.format = THREE.RGBAFormat; t.type = THREE.UnsignedByteType; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.generateMipmaps = true; t.anisotropy = 8; t.needsUpdate = true; return t; };
      TX.gA = mk('a'); TX.gN = mk('n');
    }

    // ---- stone wall: coursed rubble, 4 m to the tile
    { const H = new Float32Array(N * N), list = courses(N, N, R, 26, 52, 34, 104), c = canvasOf(N, N), g = c.getContext('2d'), id = g.createImageData(N, N), d = id.data;
      const pal = [[100, 97, 90], [104, 96, 84], [88, 86, 82], [114, 109, 98], [94, 90, 80], [108, 103, 94]];
      for (const b of list) b.col = mix3(pal[b.r * pal.length | 0], pal[b.r2 * pal.length | 0], .5);
      blocks(N, N, list, 1.6, 9, 9, (i, e, cx, cy, b) => {
        let col, k;
        if (e > 0) { col = mix3(b.col, [106, 108, 88], sstep(.7, .86, nA[i]) * .3); col = mix3(col, [78, 74, 68], sstep(.55, .9, nA2[i]) * .3); k = (.9 + nC[i] * .15 + nB[i] * .08) * (.84 + e * .16); H[i] = .3 + sstep(0, 1, e) * .5 + (cx * (b.r - .5) + cy * (b.r3 - .5)) * .22 + nC[i] * .14 + nB[i] * .08; }
        else { col = mix3([96, 90, 78], [66, 70, 50], sstep(.5, .75, nA2[i])); k = .72 + nC[i] * .36; H[i] = .14 + nC[i] * .1; }
        d[i * 4] = col[0] * k; d[i * 4 + 1] = col[1] * k; d[i * 4 + 2] = col[2] * k; d[i * 4 + 3] = 255;
      }, nB, 7);
      g.putImageData(id, 0, 0); TX.stoneT = tex(c); TX.stoneN = normalTex(H, N, N, 3.6); }

    // ---- timber frame and daub, 2 m wide by 4 m tall: posts at the tile edges, a sill, a rail and a wall plate
    { const w = 256, h = 512, H = new Float32Array(w * h), a = fbm(w, h, 2, 4, 4, R), b = fbm(w, h, 10, 20, 3, R), f = fbm(w, h, 48, 96, 2, R), gv = norm(vnoise(w, h, 56, 3, R)), gh = norm(vnoise(w, h, 2, 110, R)), st = norm(vnoise(w, h, 40, 2, R));
      const W2 = worley(512, 9, R), beams = [[0, .19], [1.42, 1.6], [2.74, 2.96], [3.84, 4.01]];
      const c = pix(w, h, (i, x, y, d) => {
        const wy = (h - 1 - y) / 128, post = x < 14 || x >= w - 14, beam = beams.find(q => wy >= q[0] && wy < q[1]);
        if (post || beam) { const g = post ? gv[i] : gh[i], edge = post ? Math.min(Math.abs(x - 14), Math.abs(x - (w - 14))) < 1.5 : Math.min(Math.abs(wy - beam[0]), Math.abs(wy - beam[1])) < .012; put(d, i, mix3([34, 26, 19], [78, 61, 44], g * .75 + f[i] * .25), edge ? .6 : .9 + f[i] * .2); H[i] = .78 + g * .14 - (edge ? .3 : 0); return; }
        let col = mix3([116, 100, 76], [170, 152, 118], b[i] * .55 + a[i] * .45), k = .9 + f[i] * .2; H[i] = .5 + b[i] * .1 + f[i] * .08;
        if (wy < .7) { const t = 1 - wy / .7; col = mix3(col, [70, 72, 50], t * .5 * (.5 + st[i])); k *= 1 - t * .25; }      // splashed and green at the foot
        for (const q of beams) { const below = q[0] - wy; if (below > 0 && below < .35) k *= 1 - (1 - below / .35) * .3 * st[i]; }      // run-off under each timber
        const wi = (x * 2) + ((y % 512) * 512), cr = W2.edge[wi] < .014 && a[i] > .56; if (cr) { k *= .72; H[i] -= .12; }
        if (a[i] > .985 && b[i] > .5) { const s = (y % 7) < 3; col = s ? [84, 62, 40] : [38, 28, 18]; k = .9; H[i] = s ? .42 : .25; }      // daub fallen away: bare wattle
        put(d, i, col, k);
      });
      TX.daubT = tex(c); TX.daubN = normalTex(H, w, h, 3.5); }

    // ---- thatch, weathered grey-gold, laid in courses
    { const c = pix(N, N, (i, x, y, d) => { const yy = y + nB[i] * 26, t = (yy % 128) / 128; put(d, i, mix3([78, 66, 44], [126, 110, 74], nB[i] * .6 + nA[i] * .4), (.58 + .42 * sstep(0, .4, t)) * (.85 + nC[i] * .3)); });
      const pal = ['rgba(150,134,92,.5)', 'rgba(104,90,58,.5)', 'rgba(66,56,36,.55)', 'rgba(132,120,88,.45)', 'rgba(90,84,60,.5)'];
      strokes(c, 7000, (g, x, y) => { const a = PI / 2 + (R() - .5) * .3, l = 16 + R() * 44; g.strokeStyle = pal[R() * pal.length | 0]; g.lineWidth = .8 + R() * .9; wrap(g, N, N, x, y, 62, g2 => { g2.beginPath(); g2.moveTo(0, 0); g2.lineTo(Math.cos(a) * l, Math.sin(a) * l); g2.stroke(); }); });
      strokes(c, 40, (g, x, y) => { const r = 14 + R() * 34; wrap(g, N, N, x, y, 50, g2 => { const gr = g2.createRadialGradient(0, 0, 1, 0, 0, r); gr.addColorStop(0, 'rgba(50,66,32,.5)'); gr.addColorStop(1, 'rgba(50,66,32,0)'); g2.fillStyle = gr; g2.fillRect(-r, -r, r * 2, r * 2); }); });
      const H = lumOf(c, 2); TX.thatchT = tex(c); TX.thatchN = normalTex(H, N, N, 4); }

    // ---- bark
    { const w = 128, h = 256, r = vnoise(w, h, 22, 3, R), f = fbm(w, h, 32, 64, 2, R), H = new Float32Array(w * h);
      const c = pix(w, h, (i, x, y, d) => { const v = Math.abs(r[i] - .5) * 2, s = sstep(.05, .5, v); put(d, i, mix3([32, 27, 22], [88, 76, 64], s * .8 + f[i] * .2), .85 + f[i] * .3); H[i] = s * .8 + f[i] * .2; });
      TX.barkT = tex(c); TX.barkN = normalTex(H, w, h, 4); }

    // ---- foliage, with see-through gaps
    { // fir boughs for a cone skirt: solid at the top, ragged spikes at the rim
      const n = 256, c = canvasOf(n, n), g = c.getContext('2d'); g.fillStyle = '#263a28'; g.fillRect(0, 0, n, n * .44);
      for (let k = 0; k < 30; k++) { const x = (k + R() * .8) / 30 * n, l = 50 + R() * 92, wd = 13 + R() * 12; for (const ox of [-n, 0, n]) { g.beginPath(); g.moveTo(x + ox - wd, n * .42); g.lineTo(x + ox + wd, n * .42); g.lineTo(x + ox + (R() - .5) * 12, n * .42 + l); g.closePath(); g.fill(); } }
      g.globalCompositeOperation = 'source-atop'; g.lineCap = 'round';
      const pal = ['#26402a', '#325034', '#42643c', '#587a44', '#2c4830'];
      for (let k = 0; k < 4200; k++) { const x = R() * n, y = R() * n, a = PI / 2 + (R() < .5 ? -1 : 1) * (.5 + R() * .7), l = 5 + R() * 7; g.strokeStyle = pal[R() * pal.length | 0]; g.lineWidth = 1.1; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke(); }
      const gr = g.createLinearGradient(0, 0, 0, n); gr.addColorStop(0, 'rgba(0,0,0,.3)'); gr.addColorStop(.5, 'rgba(0,0,0,.05)'); gr.addColorStop(1, 'rgba(100,124,56,.25)'); g.fillStyle = gr; g.fillRect(0, 0, n, n);
      TX.firT = tex(c); TX.firT.wrapT = THREE.ClampToEdgeWrapping; }
    { // a clump of broad leaves with a ragged outline, for the cards a crown is built from
      const n = 256, c = canvasOf(n, n), g = c.getContext('2d');
      const clump = (cx, cy, r, cnt, pal, lo, hi) => { for (let k = 0; k < cnt; k++) { const a = R() * 6.28, dd = Math.sqrt(R()) * r, l = lo + R() * (hi - lo); g.save(); g.translate(cx + Math.cos(a) * dd, cy + Math.sin(a) * dd * .88); g.rotate(R() * 6.28); g.fillStyle = pal[R() * pal.length | 0]; g.beginPath(); g.ellipse(0, 0, l, l * .55, 0, 0, 7); g.fill(); g.strokeStyle = 'rgba(0,0,0,.22)'; g.lineWidth = .7; g.beginPath(); g.moveTo(-l, 0); g.lineTo(l, 0); g.stroke(); g.restore(); } };
      const dark = ['#283618', '#303e1c', '#242e16'], mid = ['#42582a', '#52682e', '#627234', '#484c2a', '#5a6230'], lite = ['#7a8238', '#70803a', '#86843a'];
      clump(128, 128, 94, 420, dark, 6, 10); for (let k = 0; k < 7; k++) { const a = R() * 6.28; clump(128 + Math.cos(a) * 70, 128 + Math.sin(a) * 64, 36, 60, dark, 5, 9); }
      clump(128, 128, 102, 640, mid, 4, 7.5); clump(128, 116, 92, 240, lite, 3.5, 6);
      TX.clumpT = tex(c, { wrap: false }); }

    // ---- dressed stone for the abbey and the hold: squared blocks in even courses, tight joints, the marks of the chisel
    { const H = new Float32Array(N * N), list = courses(N, N, R, 64, 64, 90, 170), c = canvasOf(N, N), g = c.getContext('2d'), id = g.createImageData(N, N), d = id.data, tool = norm(vnoise(N, N, 200, 6, R));
      const pal = [[112, 108, 100], [104, 100, 92], [118, 114, 104], [98, 96, 90], [110, 104, 92]];
      for (const b of list) b.col = mix3(pal[b.r * pal.length | 0], pal[b.r2 * pal.length | 0], .5);
      blocks(N, N, list, 1, 2.5, 4, (i, e, cx, cy, b) => {
        let col, k;
        if (e > 0) { col = mix3(b.col, [92, 96, 78], sstep(.72, .88, nA[i]) * .3); k = (.9 + nC[i] * .12 + (tool[i] - .5) * .1 + nB[i] * .06) * (.86 + e * .14); H[i] = .5 + sstep(0, 1, e) * .3 + (tool[i] - .5) * .1 + nC[i] * .08 + (b.r3 - .5) * .08; }
        else { col = [70, 66, 58]; k = .7 + nC[i] * .3; H[i] = .25 + nC[i] * .08; }
        d[i * 4] = col[0] * k; d[i * 4 + 1] = col[1] * k; d[i * 4 + 2] = col[2] * k; d[i * 4 + 3] = 255;
      });
      g.putImageData(id, 0, 0); TX.ashlarT = tex(c); TX.ashlarN = normalTex(H, N, N, 3); }

    // ---- close detail for everything built from plain-coloured pieces, laid on in grain space (see detailS in gfx.js).
    //      One texture per kind of surface; grain, weave and strands run along x. fn fills o: [light and dark (1 is
    //      none), how much of the second colour, height, gloss (1 is none; for wood, twice the gap between boards)].
    const det = TX.det = {};
    const dtex = (n, fn) => {
      const d = new Uint8ClampedArray(n * n * 4), o = [1, 0, .5, 1];
      for (let y = 0, i = 0; y < n; y++) for (let x = 0; x < n; x++, i++) { fn(i, x, y, o); d[i * 4] = o[0] * 127.5; d[i * 4 + 1] = o[1] * 255; d[i * 4 + 2] = o[2] * 255; d[i * 4 + 3] = o[3] * 127.5; }
      const t = new THREE.DataTexture(new Uint8Array(d.buffer), n, n, THREE.RGBAFormat); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.generateMipmaps = true; t.anisotropy = 8; t.needsUpdate = true; return t;
    };
    { // timber: boards four to the tile, each with its own tone and rings, knots the grain bends round, checks along the grain, silvering where the weather gets at it
      const n = 512, PW = 128, g1 = norm(vnoise(n, n, 3, 160, R)), g2 = norm(vnoise(n, n, 7, 256, R)), wp = fbm(n, n, 2, 3, 3, R), tone = [], rings = [], ph = [], joint = [], knots = [], crack = new Float32Array(n * n);
      for (let j = 0; j < n / PW; j++) { tone.push(.84 + R() * .3); rings.push(3 + R() * 4); ph.push(R() * 6); joint.push(R() < .7 ? R() * n | 0 : -99); }
      for (let k = 0; k < 5; k++) knots.push([R() * n, R() * n, 5 + R() * 7]);
      for (let k = 0; k < 46; k++) { const x = R() * n | 0, len = 24 + R() * 150 | 0; let y = R() * n; for (let s = 0; s < len; s++) { y += (R() - .5) * .5; const yi = ((y | 0) + n) % n, xi = (x + s) % n, e = Math.min(1, s / 8, (len - s) / 8); crack[xi + yi * n] = Math.max(crack[xi + yi * n], e); if (R() < .5) { const q = xi + ((yi + 1) % n) * n; crack[q] = Math.max(crack[q], e * .5); } } }
      det.wood = dtex(n, (i, x, y, o) => {
        const j = y / PW | 0, yy = y % PW; let bend = 0, eye = 0;
        for (const k of knots) { let dx = x - k[0], dy = y - k[1]; dx -= Math.round(dx / n) * n; dy -= Math.round(dy / n) * n; const d2 = (dx * dx * .25 + dy * dy) / (k[2] * k[2]); if (d2 < 9) { bend += Math.exp(-d2 * .6) * (dy > 0 ? 1 : -1) * 1.6; if (d2 < 1) eye = Math.max(eye, 1 - d2); } }
        const ring = .5 + .5 * Math.sin((yy / PW * rings[j] + wp[i] * 2.2 + bend) * 6.283 + ph[j]), gr = g1[i] * .6 + g2[i] * .4, ck = crack[i];
        o[0] = (.74 + gr * .42 + ring * .16) * tone[j] * (1 - eye * .55) * (1 - ck * .5);
        o[1] = sstep(.5, .82, nA[i] * .7 + gr * .3) * .8 + ck * .3;
        o[2] = .5 + (gr - .5) * .5 + ring * .12 - ck * .45 - eye * .2;
        o[3] = (yy < 1.6 || yy > PW - 1.6 || Math.abs(x - joint[j]) < 1.3 ? 1 : yy < 3 || yy > PW - 3 ? .35 : 0) * 2;
      });
    }
    { // cloth: a plain weave you can see, threads of uneven thickness, dirt lying in the weave
      const n = 512, warp = [], weft = [], mot = fbm(n, n, 4, 4, 3, R);
      for (let k = 0; k < n / 8; k++) { warp.push(.88 + R() * .24 + (R() < .08 ? .2 : 0)); weft.push(.88 + R() * .24 + (R() < .08 ? .2 : 0)); }
      det.cloth = dtex(n, (i, x, y, o) => {
        const ix = x >> 3, iy = y >> 3, cx = ((x & 7) - 3.5) / 4, cy = ((y & 7) - 3.5) / 4, over = (ix + iy) & 1;
        const h = over ? (1 - cy * cy) * (.75 + .25 * (1 - cx * cx)) : (1 - cx * cx) * (.75 + .25 * (1 - cy * cy)), t = over ? warp[iy] : weft[ix];
        o[0] = (.74 + h * .4) * t * (.94 + mot[i] * .12 + (R() - .5) * .06);
        o[1] = sstep(.52, .85, nA2[i] * .65 + nB[i] * .35) * (.5 + (1 - h) * .5);
        o[2] = h * .8 + nC[i] * .1; o[3] = 1 + (nB[i] - .5) * .5;
      });
    }
    { // leather: creased into small plates, pored, scuffed pale where it rubs
      const n = 256, W = worley(n, 30, R), W2 = worley(n, 90, R), cr = fbm(n, n, 6, 6, 3, R), lo = fbm(n, n, 3, 3, 3, R);
      det.leather = dtex(n, (i, x, y, o) => {
        const fold = sstep(0, .1, W.edge[i]), pore = sstep(0, .12, W2.edge[i]), scuff = sstep(.72, .93, cr[i]);
        o[0] = .66 + fold * .26 + pore * .1 + (lo[i] - .5) * .16; o[1] = scuff * .8; o[2] = fold * .55 + pore * .2 + W.f1[i] * .2; o[3] = 1.15 - fold * .35 + scuff * .5;
      });
    }
    { // skin: pores, fine lines, the odd mole, and a flush that comes and goes across it
      const n = 256, W = worley(n, 70, R), bl = fbm(n, n, 3, 3, 4, R), fine = fbm(n, n, 40, 40, 2, R), wr = norm(vnoise(n, n, 60, 6, R));
      det.skin = dtex(n, (i, x, y, o) => {
        const pore = W.id[i] > .45 ? sstep(.2, 0, W.f1[i]) : 0, flush = sstep(.48, .8, bl[i]), line = sstep(.72, .9, wr[i]) * .4, mole = W.id[i] > .985 ? sstep(.5, .1, W.f1[i]) : 0;
        o[0] = .97 + (fine[i] - .5) * .16 - pore * .16 - line * .2 - mole * .5 + (bl[i] - .5) * .1; o[1] = flush * .75; o[2] = .6 - pore * .5 - line * .4 + fine[i] * .2; o[3] = 1 - flush * .2 + (fine[i] - .5) * .4;
      });
    }
    { // strands: hair, fur and straw, lying along x in locks
      const n = 256, s1 = norm(vnoise(n, n, 3, 128, R)), s2 = norm(vnoise(n, n, 6, 128, R)), s3 = norm(vnoise(n, n, 2, 40, R)), lock = fbm(n, n, 3, 5, 3, R);
      det.strand = dtex(n, (i, x, y, o) => {
        const s = s1[i] * .5 + s2[i] * .3 + s3[i] * .2, v = sstep(.25, .75, s);
        o[0] = (.6 + v * .8) * (.88 + lock[i] * .24); o[1] = sstep(.6, .9, s) * .9; o[2] = v * .8 + lock[i] * .2; o[3] = 1 + (v - .5) * .4;
      });
    }
    { // cut and weathered stone: speckle, pits, the odd crack, lichen
      const n = 512, Wp = worley(n, 46, R), Wc = worley(n, 5, R), sp = fbm(n, n, 90, 90, 2, R);
      det.stone = dtex(n, (i, x, y, o) => {
        const pit = Wp.id[i] > .6 ? sstep(.16, .02, Wp.f1[i]) : 0, ck = sstep(.016, 0, Wc.edge[i]) * sstep(.35, .6, nA2[i]), lich = sstep(.6, .78, nA[i] * .75 + nB[i] * .25) * sstep(.3, .6, nC[i] + .2);
        o[0] = .86 + (nB[i] - .5) * .34 + (sp[i] - .5) * .3 + (R() - .5) * .1 - pit * .3 - ck * .5; o[1] = lich * .9; o[2] = .55 + (nB[i] - .5) * .5 + (sp[i] - .5) * .2 - pit * .4 - ck * .5; o[3] = 1 + (nB[i] - .5) * .5 + lich * .3;
      });
    }
    { // wrought iron: the marks of the hammer, forge scale, pitting, rust
      const n = 512, Wh = worley(n, 12, R), Wp = worley(n, 80, R), sc = fbm(n, n, 24, 24, 3, R);
      det.iron = dtex(n, (i, x, y, o) => {
        const dimple = Math.cos(Math.min(1, Wh.f1[i] * 1.6) * PI) * .5 + .5, pit = Wp.id[i] > .55 ? sstep(.2, .02, Wp.f1[i]) : 0, rust = Math.min(1, sstep(.52, .78, nA[i] * .55 + nB[i] * .45) + pit * .6 * sstep(.4, .6, nA2[i]));
        o[0] = .84 + (sc[i] - .5) * .4 + dimple * .14 - pit * .35; o[1] = rust; o[2] = .4 + dimple * .35 + (sc[i] - .5) * .2 - pit * .2; o[3] = .9 + rust * .9 - dimple * .25 + (sc[i] - .5) * .3;
      });
    }
    { // plate armour: brushed along its length, scratched every which way, dented, tarnished in patches
      const n = 512, c = canvasOf(n, n), g = c.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, n, n); g.lineCap = 'round';
      for (let k = 0; k < 420; k++) { const x = R() * n, y = R() * n, a = (R() - .5) * (R() < .8 ? .5 : 3), l = 8 + R() * R() * 150; g.strokeStyle = `rgba(255,255,255,${(.25 + R() * .6).toFixed(2)})`; g.lineWidth = .6 + R() * .9; wrap(g, n, n, x, y, 160, g2 => { g2.beginPath(); g2.moveTo(0, 0); g2.lineTo(Math.cos(a) * l, Math.sin(a) * l); g2.stroke(); }); }
      const scr = lumOf(c, 1), br = norm(vnoise(n, n, 2, 256, R)), dent = fbm(n, n, 5, 5, 3, R);
      det.plate = dtex(n, (i, x, y, o) => {
        const tar = sstep(.58, .84, nA2[i] * .6 + nB[i] * .4);
        o[0] = .93 + (br[i] - .5) * .2 + scr[i] * .5 - tar * .15; o[1] = tar * .9 * (1 - scr[i]); o[2] = .5 + (dent[i] - .5) * .9 - scr[i] * .25 + (br[i] - .5) * .08; o[3] = 1 + (br[i] - .5) * .5 - scr[i] * .7 + tar * .9;
      });
    }
    { // a blade: the lines of the grindstone, and spots where the damp has got at it
      const n = 256, br = norm(vnoise(n, n, 2, 128, R)), br2 = norm(vnoise(n, n, 4, 128, R)), st = fbm(n, n, 7, 7, 3, R), W = worley(n, 24, R);
      det.steel = dtex(n, (i, x, y, o) => {
        const spot = W.id[i] > .93 ? sstep(.3, .05, W.f1[i]) : 0, stain = Math.min(1, sstep(.74, .94, st[i]) * .6 + spot);
        o[0] = .95 + (br[i] - .5) * .22 + (br2[i] - .5) * .12 - stain * .2; o[1] = stain; o[2] = .5 + (br[i] - .5) * .5 - spot * .3; o[3] = .95 + (br2[i] - .5) * .5 + stain;
      });
    }

    { // a padded jack: channels of stuffing sewn down between rows of stitches, the cloth dirty in the seams
      const n = 256, mot = fbm(n, n, 5, 5, 3, R), fine = fbm(n, n, 60, 60, 2, R);
      det.quilt = dtex(n, (i, x, y, o) => {
        const c = (y % 32) / 32, puff = Math.pow(Math.sin(c * PI), .55), seam = c < .05 || c > .95 ? 1 : 0, st = seam && (x % 8) < 5 ? 1 : 0;
        o[0] = (.72 + puff * .34 + (fine[i] - .5) * .12 + (mot[i] - .5) * .12) * (1 - seam * .3) * (1 + st * .25); o[1] = (1 - puff) * .7 * sstep(.3, .7, mot[i]) + seam * .25; o[2] = puff * .85 + fine[i] * .1; o[3] = 1 + (mot[i] - .5) * .4;
      });
    }
    { // a coat of plates: cloth or leather outside, and the heads of the rivets that hold the plates within, in rows
      const n = 256, mot = fbm(n, n, 5, 5, 3, R), fine = fbm(n, n, 50, 50, 2, R);
      det.brig = dtex(n, (i, x, y, o) => {
        const ry = y / 32 | 0, cx = ((x + (ry % 2) * 16) % 32) - 15.5, cy = (y % 32) - 15.5, d = Math.hypot(cx, cy), riv = sstep(4.2, 2.6, d), edge = (y % 64) < 1.5 ? 1 : 0;
        o[0] = (.84 + (fine[i] - .5) * .2 + (mot[i] - .5) * .2) * (1 - edge * .35) * (1 + riv * .9) * (1 - sstep(6.5, 4.2, d) * (1 - riv) * .3); o[1] = sstep(.6, .85, mot[i]) * (1 - riv); o[2] = .4 + riv * .55 - edge * .25 + fine[i] * .1; o[3] = 1.1 - riv * .7;
      });
    }

    // ---- the same surfaces from photographs: walls, thatch, bark, the daub between timbers, and the grain of timber,
    //      stone, iron, cloth and leather. S: how many metres of wall one picture covers, as a rate.
    if (have('rubble', 'dn')) { TX.stoneT = tex(toned(A.canvas('rubble', 'd', 1024, 1024), [100, 96, 87])); TX.stoneN = tex(A.canvas('rubble', 'n', 1024, 1024), { data: true }); TX.stoneS = .5; }
    if (have('ashlar', 'dn')) { TX.ashlarT = tex(toned(A.canvas('ashlar', 'd', 1024, 1024), [106, 102, 94], .25)); TX.ashlarN = tex(A.canvas('ashlar', 'n', 1024, 1024), { data: true }); TX.ashlarS = .5; }
    if (have('thatch', 'dn')) { TX.thatchT = tex(toned(A.canvas('thatch', 'd', 1024, 1024), [104, 92, 62], .5)); TX.thatchN = tex(A.canvas('thatch', 'n', 1024, 1024), { data: true }); TX.thatchT.repeat.set(2.5, 2.5); TX.thatchN.repeat.set(2.5, 2.5); }
    if (have('bark', 'dn')) { TX.barkT = tex(toned(A.canvas('bark', 'd', 512, 1024), [70, 58, 46], .5)); TX.barkN = tex(A.canvas('bark', 'n', 512, 1024), { data: true }); }
    if (have('plaster', 'd')) {      // the frame stays as drawn; the daub takes the plaster's grain and the timbers the wood's
      const w = 512, h = 1024, c = canvasOf(w, h), g = c.getContext('2d'); g.drawImage(TX.daubT.image, 0, 0, w, h); const id = g.getImageData(0, 0, w, h), d = id.data, pl = lumOfPhoto('plaster', 512, 512), wl = have('wood', 'd') ? lumOfPhoto('wood', 512, 512) : null;
      for (let y = 0, i = 0; y < h; y++) for (let x = 0; x < w; x++, i++) { const q = x + (y & 511) * 512, timber = d[i * 4] < 95 && d[i * 4] > d[i * 4 + 2] * 1.25, k = timber ? (wl ? .5 + wl[q] * .55 : 1) : .3 + pl[q] * .72; d[i * 4] *= k; d[i * 4 + 1] *= k; d[i * 4 + 2] *= k; }
      g.putImageData(id, 0, 0); TX.daubT = tex(c);
    }
    TX.detS = {}; det.grain = det.wood;      // tool hafts keep the fine grain drawn by hand; boards take the photograph
    const photoDet = (key, name, n, turn, con, size, sec) => {
      const L = lumOfPhoto(name, n, n, turn), Hh = heightOfPhoto(name, n, n, turn), q = 512 / n;
      det[key] = dtex(n, (i, x, y, o) => { o[0] = 1 + (L[i] - 1) * con; o[1] = sec ? sec((x * q | 0) + (y * q | 0) * 512) : 0; o[2] = Hh[i]; o[3] = key === 'wood' ? 0 : 1 + (.5 - Hh[i]) * .5; }); TX.detS[key] = 1 / size;
    };
    if (have('wood', 'dh')) photoDet('wood', 'wood', 1024, 1, 1.6, 2);
    if (have('rock', 'dh')) photoDet('stone', 'rock', 1024, 0, 1, 1.8, i => sstep(.6, .78, nA[i] * .75 + nB[i] * .25) * sstep(.3, .6, nC[i] + .2) * .9);
    if (have('rust', 'dh')) photoDet('iron', 'rust', 1024, 0, .8, .8, i => sstep(.52, .78, nA[i] * .55 + nB[i] * .45));
    if (have('linen', 'dh')) photoDet('cloth', 'linen', 512, 0, .9, .27, i => sstep(.52, .85, nA2[i] * .65 + nB[i] * .35) * .6);
    if (have('leather', 'dh')) photoDet('leather', 'leather', 512, 0, .9, .4);
    // leaves for the crowns of broadleaf trees and for bushes: sprays of photographed leaves, with the air between cut
    // out, laid over one another into a clump (the ones behind darker)
    if (have('leaves', 'da')) {
      const w = 256, h = 512, c = canvasOf(w, h), g = c.getContext('2d'), src = A.img['leaves.d'], al = A.img['leaves.a'], ac = canvasOf(w, h), ag = ac.getContext('2d');
      g.drawImage(src, 0, 0, src.width * .46, src.height, 0, 0, w, h); ag.drawImage(al, 0, 0, al.width * .46, al.height, 0, 0, w, h); const id = g.getImageData(0, 0, w, h), a = ag.getImageData(0, 0, w, h).data; for (let i = 0; i < w * h; i++) id.data[i * 4 + 3] = a[i * 4]; g.putImageData(id, 0, 0);
      const n = 512, c2 = canvasOf(n, n), g2 = c2.getContext('2d');
      for (let k = 0; k < 30; k++) { const an = R() * 6.28, dd = Math.sqrt(R()) * 175, sc = .5 + R() * .3; g2.save(); g2.filter = `brightness(${k < 12 ? .55 : k < 22 ? .8 : 1})`; g2.translate(256 + Math.cos(an) * dd, 256 + Math.sin(an) * dd * .9); g2.rotate(R() * 6.28); g2.scale(sc, sc); g2.drawImage(c, -w / 2, -h / 2); g2.restore(); }
      TX.clumpT = tex(c2, { wrap: false });
    }
    // ---- models (assets.js): each becomes shapes ready to place, and its pictures as textures. cut: it has air in it.
    TX.md = {};
    if (A && A.models) for (const name in A.models) {
      const M = A.models[name]; if (!M.parts || !M.parts.length || !M.img.d) continue; let src = M.img.d;
      if (M.img.a) { const w = src.width, h = src.height, c = canvasOf(w, h), g = c.getContext('2d'), ac = canvasOf(w, h), ag = ac.getContext('2d'); g.drawImage(src, 0, 0); ag.drawImage(M.img.a, 0, 0, w, h); const id = g.getImageData(0, 0, w, h), a = ag.getImageData(0, 0, w, h).data; for (let i = 0; i < w * h; i++) id.data[i * 4 + 3] = a[i * 4]; g.putImageData(id, 0, 0); src = c; }
      // some of their colour is taken out: the rocks were red and blue-yellow stone where the stone here is grey, and the crate was bright red wood
      const grey = ({ boulder: .72, stone: .72, crate: .55 })[name];
      if (grey) {
        const c = canvasOf(src.width, src.height), g = c.getContext('2d'); g.drawImage(src, 0, 0); const id = g.getImageData(0, 0, c.width, c.height), d = id.data;
        for (let i = 0; i < d.length; i += 4) { const l = d[i] * .3 + d[i + 1] * .59 + d[i + 2] * .11; d[i] += (l - d[i]) * grey; d[i + 1] += (l - d[i + 1]) * grey; d[i + 2] += (l - d[i + 2]) * grey; }
        g.putImageData(id, 0, 0); src = name === 'crate' ? c : toned(c, [92, 89, 82], .12);
      }
      const mk = (im, data) => { const t = new THREE.Texture(im); if (!data) t.encoding = THREE.sRGBEncoding; t.flipY = false; t.anisotropy = 8; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.needsUpdate = true; return t; };
      TX.md[name] = { cut: !!M.img.a, map: mk(src), nmap: M.img.n ? mk(M.img.n, true) : null, geos: M.parts.map(p => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p.pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(p.nor, 3)); g.setAttribute('uv', new THREE.BufferAttribute(p.uv, 2)); g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(p.pos.length).fill(1), 3)); g.setIndex(new THREE.BufferAttribute(p.idx, 1)); return g; }) };
    }
    if (A) A.free();

    // ---- what people wear
    { const n = 64, H = new Float32Array(n * n);
      const c = pix(n, n, (i, x, y, d) => { const row = y / 8 | 0, cx = ((x + (row % 2) * 4) % 8) - 3.5, cy = (y % 8) - 3.5, r = Math.hypot(cx, cy * 1.15), ring = Math.max(0, 1 - Math.abs(r - 2.7) / 1.3); H[i] = ring; const v = 92 + ring * 150; d[i * 4] = v; d[i * 4 + 1] = v; d[i * 4 + 2] = v + 3; });
      TX.mailT = tex(c); TX.mailN = normalTex(H, n, n, 2.5); }
    X.texMs = performance.now() - t0;
    return TX;
  };
})();
