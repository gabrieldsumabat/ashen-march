'use strict';
// Sound. Nothing here is a recording: every blow, footfall, voice and breath of wind is made on the spot from
// oscillators and filtered noise, so the game stays a handful of small files with nothing to fetch.
//
//   G.sfx(name, vol, pan, o)     a sound. o (optional): { d: how far off, 0 beside you .. 1 at the edge of hearing;
//                                occ: 1 with a wall between; back: 0..1 behind you; at: seconds from now; and whatever
//                                the sound itself reads (surf, kit, w) }
//   G.voice(kind, vol, pan, o)   a wordless voice. o as above, plus { type: man | boss | wolf | hound | boar | deer,
//                                seed: whose voice it is, helm: 1 from inside a closed helm }. Returns how the mouth
//                                should move: { dur, syl: [[from, to, how open], ...], ex: the face that goes with it }
//   G.amb(state)                 the standing sound of where you are: wind, rain, fire, water, birds, the drum of a fight
//   G.sting(name)                a few plucked notes for a moment that has earned them
(function () {
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v, rnd = (a, b) => a + Math.random() * (b - a), irnd = (a, b) => Math.floor(rnd(a, b + 1)), pick = a => a[Math.random() * a.length | 0], lerp = (a, b, k) => a + (b - a) * k;
  const opt = (k, d) => { const o = G.save && G.save.opts; return o && typeof o[k] === 'number' ? o[k] : d; };
  // ac: the context being written to. B: its buses. live: the one you hear (the other kind is a test render, see the end).
  let ac = null, B = null, live = null, white = null, brown = null, queued = 0, helm = 1, forced = false;
  const IR = {};

  // ------------------------------------------------------------ the desk: buses, echo, and the way out
  function noises() {
    const sr = ac.sampleRate; white = ac.createBuffer(1, sr * 2, sr); brown = ac.createBuffer(1, sr * 4, sr);
    { const d = white.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
    {
      const d = brown.getChannelData(0), n = 3000; let v = 0; for (let i = 0; i < d.length; i++) { v = (v + (Math.random() * 2 - 1) * .02) / 1.02; d[i] = v * 3.5; }
      for (let i = 0; i < n; i++) { const k = i / n; d[d.length - n + i] = d[d.length - n + i] * (1 - k) + d[i] * k; }      // so the loop does not click
    }
  }
  // the echo of a place, made of noise that dies away and dulls as it dies; taps are single slaps off far walls
  function impulse(len, decay, bright, taps) {
    const sr = ac.sampleRate, n = Math.floor(sr * len), b = ac.createBuffer(2, n, sr);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch); let lp = 0;
      for (let i = 0; i < n; i++) { const t = i / n, w = (Math.random() * 2 - 1) * Math.pow(1 - t, decay); lp += (w - lp) * (bright - (bright - .06) * t); d[i] = lp; }
      if (taps) for (const [at, g] of taps) { const k = Math.floor(sr * at * rnd(.88, 1.12)); for (let j = 0; j < 90 && k + j < n; j++) d[k + j] += (Math.random() * 2 - 1) * g * (1 - j / 90); }
    }
    return b;
  }
  function wire(ctx, full) {
    ac = ctx; if (!white) noises();
    const b = { ac: ctx }, gain = v => { const g = ctx.createGain(); g.gain.value = v; return g; };
    b.master = gain(full ? opt('vol', .5) : 1);
    if (full) {      // a limiter of sorts, so that a melee with six men in it does not tear the speakers
      const c = ctx.createDynamicsCompressor(); c.threshold.value = -15; c.knee.value = 12; c.ratio.value = 5; c.attack.value = .004; c.release.value = .22;
      b.master.connect(c); c.connect(ctx.destination); b.tap = ctx.createAnalyser(); b.tap.fftSize = 2048; c.connect(b.tap);
    } else b.master.connect(ctx.destination);
    b.dry = gain(1); b.dry.connect(b.master);
    // two echoes, the open air and a stone room; which one you hear depends on whether there is a roof over you
    b.rev = gain(1); b.gOut = gain(.5); b.gIn = gain(0);
    const co = ctx.createConvolver(), ci = ctx.createConvolver();
    co.buffer = IR.out || (IR.out = impulse(1.25, 3.4, .32, [[.085, .5], [.16, .34], [.29, .2]])); ci.buffer = IR.in || (IR.in = impulse(1.8, 2.3, .5));
    b.rev.connect(co); co.connect(b.gOut); b.gOut.connect(b.master); b.rev.connect(ci); ci.connect(b.gIn); b.gIn.connect(b.master);
    b.amb = gain(1); b.amb.connect(b.master); b.mus = gain(full ? opt('mus', .6) : 1); b.mus.connect(b.master);
    return b;
  }
  // true if a sound asked for now would be heard. A browser keeps sound shut until the page has been clicked or a key pressed; a few
  // sounds are let through while it opens, and no more, or they would all go off together when it did.
  function ready() {
    if (forced) return true;
    if (!live) { let ctx; try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return false; } live = B = wire(ctx, true); layers(); setInterval(ambTick, 100); }
    if (ac.state !== 'running') { try { ac.resume(); } catch (e) { } return ++queued < 3; }
    queued = 0; return true;
  }
  for (const ev of ['pointerdown', 'keydown']) addEventListener(ev, () => { if (live ? live.ac.state !== 'running' : true) ready(); }, { capture: true, passive: true });
  G.setVolume = v => { if (live) live.master.gain.value = v; };
  G.setMusic = v => { if (live) live.mus.gain.value = v; };

  // Where a sound sits: how loud, how dulled by distance or a wall or the back of your head, to which side, and how much
  // of it goes to the echo. Returns the point to play into and the moment to play at.
  function place(vol, pan, o) {
    o = o || {}; const t = ac.currentTime + (o.at || 0) + .004, g = ac.createGain(); g.gain.value = vol; let tail = g;
    const world = o.d !== undefined, far = world ? clamp(o.d, 0, 1) : 0; let cut = 22000;
    if (world) { cut = 700 + 19000 * Math.pow(1 - far, 2.4); if (o.occ) cut = Math.min(cut, 900); if (o.back) cut *= 1 - .4 * o.back; cut = Math.min(cut, 22000 * helm * helm * helm); }
    if (o.muf) cut = Math.min(cut, o.muf);
    if (cut < 16000) { const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = cut; f.Q.value = .6; tail.connect(f); tail = f; }
    if (pan && ac.createStereoPanner) { const p = ac.createStereoPanner(); p.pan.value = clamp(pan, -1, 1); tail.connect(p); tail = p; }
    tail.connect(o.bus || B.dry);
    const send = o.rev !== undefined ? o.rev : world ? .1 + .5 * far + (o.occ ? .12 : 0) : 0;
    if (send > 0) { const s = ac.createGain(); s.gain.value = send; tail.connect(s); s.connect(B.rev); }
    return { t, out: g };
  }

  // ------------------------------------------------------------ the raw stuff
  const up = v => Math.max(v, .0008);
  // a burst of noise through a filter that sweeps from f0 to f1; atk: seconds to swell in (else it starts at full)
  function nz(c, at, dur, f0, f1, vol, type, q, atk, buf) {
    const t = c.t + at, s = ac.createBufferSource(); s.buffer = buf || white; s.loop = true;
    const f = ac.createBiquadFilter(); f.type = type || 'lowpass'; f.Q.value = q || 1; f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
    const g = ac.createGain(); if (atk) { g.gain.setValueAtTime(.0005, t); g.gain.exponentialRampToValueAtTime(up(vol), t + atk); } else g.gain.setValueAtTime(up(vol), t); g.gain.exponentialRampToValueAtTime(.0004, t + dur);
    s.connect(f); f.connect(g); g.connect(c.out); s.start(t, Math.random() * 1.5); s.stop(t + dur + .03);
  }
  // a tone that slides from f0 to f1; ff: put it through a band at that pitch (a creak, a caw)
  function tn(c, at, dur, f0, f1, vol, type, atk, ff, fq) {
    const t = c.t + at, o = ac.createOscillator(); o.type = type || 'sine'; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ac.createGain(); if (atk) { g.gain.setValueAtTime(.0005, t); g.gain.exponentialRampToValueAtTime(up(vol), t + atk); } else g.gain.setValueAtTime(up(vol), t); g.gain.exponentialRampToValueAtTime(.0004, t + dur);
    if (ff) { const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = ff; f.Q.value = fq || 3; o.connect(f); f.connect(g); } else o.connect(g);
    g.connect(c.out); o.start(t); o.stop(t + dur + .03);
  }
  // struck metal: partials that are not in tune with one another, the high ones dying first. parts: [[ratio, level, life]]
  function ring(c, at, dur, base, parts, vol) {
    const t = c.t + at;
    for (const [m, a, life] of parts) { const o = ac.createOscillator(), g = ac.createGain(), d = dur * life; o.frequency.value = base * m * rnd(.996, 1.004); g.gain.setValueAtTime(up(a * vol), t); g.gain.exponentialRampToValueAtTime(.0003, t + d); o.connect(g); g.connect(c.out); o.start(t); o.stop(t + d + .03); }
  }
  const STEEL = [[1, 1, 1], [1.47, .7, .8], [2.09, .55, .62], [2.56, .4, .46], [3.4, .3, .32], [4.9, .2, .2]];
  const BELL = [[.5, .45, 1], [1, 1, .85], [1.19, .55, .6], [1.5, .35, .5], [2, .5, .42], [2.51, .22, .3], [3.01, .14, .2]];
  // a rounded note with a soft start and end (birds, owls, drips)
  function chirp(c, at, dur, f0, f1, vol) {
    const t = c.t + at, o = ac.createOscillator(), g = ac.createGain(); o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + dur * .3); g.gain.linearRampToValueAtTime(0, t + dur); o.connect(g); g.connect(c.out); o.start(t); o.stop(t + dur + .02);
  }
  // a plucked gut string (Karplus and Strong's trick: a loop of noise that averages itself smooth), kept once made
  const plucks = {};
  function pluck(c, at, freq, vol) {
    const key = Math.round(freq * 4); let b = plucks[key];
    if (!b) {
      const sr = ac.sampleRate, n = Math.floor(sr * 1.7), N = Math.max(2, Math.round(sr / freq)), loop = new Float32Array(N); b = plucks[key] = ac.createBuffer(1, n, sr); const d = b.getChannelData(0);
      for (let i = 0; i < N; i++) loop[i] = Math.random() * 2 - 1; for (let k = 0; k < 3; k++) for (let i = 1; i < N; i++) loop[i] = (loop[i] + loop[i - 1]) * .5;      // a finger, not a quill
      let p = 0; for (let i = 0; i < n; i++) { const nx = p + 1 === N ? 0 : p + 1, v = loop[p]; d[i] = v; loop[p] = (v + loop[nx]) * .498; p = nx; }
    }
    const t = c.t + at, s = ac.createBufferSource(), g = ac.createGain(); s.buffer = b; g.gain.setValueAtTime(vol, t); g.gain.setTargetAtTime(0, t + 1, .22); s.connect(g); g.connect(c.out); s.start(t); s.stop(t + 1.7);
  }

  // ------------------------------------------------------------ sounds (c: where to play, v: how loud, o: what was asked)
  const rattle = (c, at, v, kit) => {      // what a man's harness adds to anything he does
    if (kit === 'mail') { for (let i = 0; i < 3; i++) ring(c, at + rnd(0, .05), .07, rnd(4200, 7800), [[1, 1, 1]], .014 * v); nz(c, at, .05, 8000, 5000, .05 * v, 'highpass'); }
    else if (kit === 'plate') { ring(c, at + rnd(0, .02), .13, rnd(900, 1500), [[1, 1, 1], [1.5, .6, .7], [2.3, .4, .5]], .028 * v); nz(c, at + .01, .03, 3000, 1200, .07 * v, 'bandpass', 2); }
  };
  const S = {
    // a weapon through the air. w: about 0.6 for a thrust or a light blade, 1.5 for something swung in both hands
    swing: (c, v, o) => { const w = o.w || 1, d = .12 + .09 * w; nz(c, 0, d, 2300 / w, 520 / w, .5 * v, 'bandpass', 1.2, d * .35); nz(c, .01, d * .8, 5400 / w, 1500 / w, .15 * v, 'bandpass', 2.5, d * .3); nz(c, 0, d * 1.3, 420 / w, 140 / w, .34 * v * w, 'bandpass', .8, d * .5); tn(c, d * .3, d * .7, 150 / w, 70 / w, .12 * v * w); },      // (and the air it moves: heavier for a heavier thing)    // an edge into a body; a blunt thing into a body; anything into mail; steel on plate or on steel; wood
    hit: (c, v) => { nz(c, 0, .09, 900, 160, .9 * v); tn(c, 0, .14, 120, 42, .95 * v); nz(c, .005, .06, 4200, 1800, .2 * v, 'bandpass', 2); nz(c, .03, .1, 1400, 500, .18 * v, 'bandpass', 3, .02); nz(c, .02, .2, 700, 180, .42 * v, 'lowpass', 1, .03); nz(c, .06, .12, 2600, 900, .1 * v, 'bandpass', 4, .03); tn(c, .012, .06, 300, 110, .3 * v, 'triangle'); },      // edge, the body under it, and the wet of it    hitb: (c, v) => { tn(c, 0, .2, 98, 34, 1.15 * v); nz(c, 0, .1, 520, 90, .85 * v); nz(c, .012, .035, 2600, 900, .28 * v, 'bandpass', 3); tn(c, .01, .09, 210, 70, .4 * v, 'triangle'); nz(c, .03, .16, 380, 110, .35 * v, 'lowpass', 1, .03); nz(c, .02, .05, 1500, 700, .16 * v, 'bandpass', 5); },      // a dull weight landing, and something giving under it    mail: (c, v) => { nz(c, 0, .08, 700, 140, .6 * v); tn(c, 0, .1, 120, 50, .5 * v); for (let i = 0; i < 6; i++) ring(c, i * .011 + rnd(0, .01), .13, rnd(3800, 7400), [[1, 1, 1]], .035 * v); nz(c, 0, .07, 7500, 4500, .24 * v, 'highpass'); },
    clang: (c, v) => { const f = rnd(1250, 1900); ring(c, 0, .55, f, STEEL, .1 * v); ring(c, .003, .35, f * rnd(1.4, 1.52), STEEL.slice(0, 3), .045 * v); nz(c, 0, .05, 6000, 2500, .42 * v, 'highpass'); tn(c, 0, .08, 190, 70, .5 * v); nz(c, .03, .14, 3800, 2100, .09 * v, 'bandpass', 6, .02); },      // two notes that do not agree, the knock of it in the arm, and the edges dragging apart    parry: (c, v) => { ring(c, 0, 1.1, rnd(1900, 2600), STEEL, .11 * v); ring(c, .004, .5, rnd(3100, 3900), STEEL.slice(0, 3), .05 * v); nz(c, 0, .07, 7000, 3000, .5 * v, 'highpass'); tn(c, 0, .06, 240, 90, .35 * v); nz(c, .04, .22, 5200, 2400, .1 * v, 'bandpass', 7, .04); },      // (and the long scrape as the blades slide off one another)    thud: (c, v) => { tn(c, 0, .13, 165, 62, .85 * v); nz(c, 0, .07, 1100, 220, .55 * v); tn(c, 0, .05, 420, 300, .16 * v, 'triangle'); },
    crack: (c, v) => { nz(c, 0, .04, 3600, 700, .8 * v, 'bandpass', 2); tn(c, 0, .08, 260, 90, .5 * v, 'square'); nz(c, .03, .06, 1800, 500, .3 * v, 'bandpass', 2); },
    // a footfall. surf: grass | dirt | stone | wood | mud | water. kit: mail | plate, which you hear before you see
    step: (c, v, o) => {
      const s = o.surf || 'dirt';
      if (s === 'water') { nz(c, 0, .16, 1900, 420, .22 * v, 'bandpass', .8, .012); nz(c, .05, .2, 900, 300, .12 * v, 'bandpass', 1.2, .03); tn(c, 0, .06, 220, 90, .1 * v); }
      else if (s === 'stone') { nz(c, 0, .035, 2400, 700, .2 * v, 'bandpass', 1.5); tn(c, 0, .05, 150, 70, .2 * v); nz(c, .02, .05, 700, 200, .1 * v); }
      else if (s === 'wood') { tn(c, 0, .09, rnd(95, 125), 60, .3 * v); nz(c, 0, .05, 800, 250, .16 * v); if (Math.random() < .15) tn(c, .03, .18, rnd(70, 95), rnd(60, 80), .12 * v, 'sawtooth', .05, rnd(700, 1100), 9); }
      else if (s === 'grass') { nz(c, 0, .09, 3200, 1400, .11 * v, 'bandpass', .7, .02); nz(c, 0, .06, 300, 110, .16 * v); }
      else if (s === 'mud') { nz(c, 0, .1, 500, 140, .24 * v, 'lowpass', 2); nz(c, .06, .09, 1300, 500, .09 * v, 'bandpass', 3, .03); }
      else { nz(c, 0, .06, 420, 110, .22 * v); nz(c, 0, .04, 1900, 900, .05 * v, 'bandpass', 1); }
      rattle(c, 0, v, o.kit);
    },
    stepw: (c, v, o) => S.step(c, v, Object.assign({}, o, { surf: 'water' })),
    bodyfall: (c, v, o) => { tn(c, 0, .22, 85, 36, .9 * v); nz(c, 0, .16, 380, 70, .8 * v); nz(c, .05, .12, 1500, 400, .12 * v, 'bandpass', 1, .02); rattle(c, .02, v * 2.5, o.kit); },
    // bows: the creak of the draw, the loose, a shaft going past your ear, a shaft stopping in something
    draw: (c, v) => { tn(c, 0, .5, 62, 104, 1.6 * v, 'sawtooth', .12, rnd(900, 1300), 8); nz(c, .1, .35, 1500, 2100, .08 * v, 'bandpass', 6, .1); },
    arrow: (c, v) => { tn(c, 0, .07, 210, 120, .4 * v, 'triangle'); nz(c, 0, .05, 2600, 1200, .22 * v, 'bandpass', 3); nz(c, .02, .22, 3400, 900, .24 * v, 'bandpass', 3, .03); },
    twang: (c, v) => { tn(c, 0, .16, 170, 110, .5 * v, 'triangle'); nz(c, 0, .03, 1800, 600, .5 * v, 'bandpass', 2); tn(c, 0, .05, 620, 300, .2 * v, 'square'); nz(c, .02, .2, 3000, 900, .2 * v, 'bandpass', 3, .03); },
    flyby: (c, v) => { nz(c, 0, .17, 5200, 1400, .5 * v, 'bandpass', 5, .06); tn(c, 0, .15, 1700, 700, .05 * v, 'sine', .05); },
    thunk: (c, v) => { tn(c, 0, .07, 240, 110, .7 * v); nz(c, 0, .04, 1600, 400, .5 * v); tn(c, .01, .16, 150, 138, .12 * v, 'triangle', .01); },
    stone: (c, v) => { nz(c, 0, .04, 4000, 1500, .6 * v, 'bandpass', 3); tn(c, 0, .05, 900, 500, .2 * v, 'square'); nz(c, rnd(.09, .14), .03, 3600, 1600, .25 * v, 'bandpass', 3); nz(c, rnd(.2, .28), .025, 3200, 1500, .12 * v, 'bandpass', 3); },
    // things in the hand
    ui: (c, v) => { tn(c, 0, .035, 640, 520, .07 * v, 'triangle'); nz(c, 0, .02, 3000, 1500, .03 * v, 'bandpass', 2); },
    coin: (c, v) => { ring(c, 0, .22, rnd(2700, 3000), STEEL.slice(0, 4), .05 * v); ring(c, .06, .3, rnd(3300, 3700), STEEL.slice(0, 4), .05 * v); if (Math.random() < .5) ring(c, .13, .25, rnd(2900, 3400), STEEL.slice(0, 3), .03 * v); },
    cloth: (c, v) => { nz(c, 0, .16, 1300, 600, .4 * v, 'bandpass', .8, .04); nz(c, .12, .2, 900, 450, .35 * v, 'bandpass', .8, .06); },
    open: (c, v) => { tn(c, 0, .28, 74, 96, 1.1 * v, 'sawtooth', .06, rnd(600, 900), 9); nz(c, .16, .12, 700, 200, .5 * v); },
    eat: (c, v) => { for (let i = 0; i < 3; i++) nz(c, i * .24, .08, rnd(1000, 1400), 450, .8 * v, 'bandpass', 2); },
    drink: (c, v) => { for (let i = 0; i < 3; i++) { tn(c, i * .23, .1, 300 - i * 20, 170 - i * 8, .25 * v); nz(c, i * .23 + .02, .06, 700, 300, .08 * v, 'bandpass', 2); } },
    whet: (c, v) => { for (let i = 0; i < 2; i++) { nz(c, i * .38, .25, 5200 + i * 200, 3700, .7 * v, 'bandpass', 6, .03); ring(c, i * .38 + .02, .2, rnd(4200, 5200), [[1, 1, 1]], .01 * v); } },
    lock: (c, v) => { tn(c, 0, .03, 1600, 900, .3 * v, 'square'); ring(c, 0, .08, 2400, [[1, 1, 1], [1.6, .5, .6]], .03 * v); tn(c, .14, .05, 700, 300, .4 * v, 'square'); nz(c, .14, .2, 500, 120, .4 * v); tn(c, .26, .4, 68, 92, .25 * v, 'sawtooth', .1, rnd(500, 800), 8); },
    find: (c, v) => tn(c, 0, .05, 880, 990, .06 * v, 'triangle'),
    bell: (c, v) => { ring(c, 0, 3.2, 392, BELL, .2 * v); nz(c, 0, .03, 2500, 900, .1 * v, 'bandpass', 1); },
    level: (c, v) => { [293.66, 349.23, 440, 587.33].forEach((f, i) => pluck(c, i * .13, f, .5 * v)); pluck(c, .52, 146.83, .5 * v); },
    // sky and beasts heard from afar
    crow: (c, v) => { const f = rnd(520, 640); for (let i = 0; i < irnd(2, 4); i++) { tn(c, i * .3, .2, f, f * .72, .5 * v, 'sawtooth', .02, rnd(1500, 1900), 2.5); nz(c, i * .3, .18, 2100, 1200, .07 * v, 'bandpass', 3, .02); } },
    owl: (c, v) => { const f = rnd(310, 360); chirp(c, 0, .4, f, f * .94, .3 * v); chirp(c, .7, .16, f, f * .97, .25 * v); chirp(c, .92, .45, f, f * .9, .3 * v); },
    howl: (c, v) => sing(c, plan('howl', 'wolf'), who('wolf', Math.random()), v * .5),
    thunder: (c, v) => { nz(c, 0, .35, 3200, 400, .45 * v, 'bandpass', .6, .01); nz(c, .05, 3.6, 420, 38, 1 * v, 'lowpass', .7, .08); tn(c, .05, 2.6, 58, 26, .6 * v); for (let i = 0; i < 3; i++) nz(c, rnd(.4, 2.2), rnd(.5, 1.1), rnd(160, 320), 45, rnd(.25, .5) * v, 'lowpass', .7, .15); },
    // your own body
    breath: (c, v) => { nz(c, 0, .36, 700, 1500, .26 * v, 'bandpass', 1.4, .2); nz(c, .42, .42, 1200, 420, .32 * v, 'bandpass', 1.2, .1); },
    heart: (c, v) => { tn(c, 0, .12, 62, 40, .7 * v); nz(c, 0, .05, 180, 60, .25 * v); tn(c, .17, .14, 50, 34, .5 * v); }
  };
  // how some of them sit in the world when nothing else is said
  const DEF = { thunder: { rev: .55 }, bell: { rev: .5 }, howl: { rev: .7, d: .72 }, crow: { rev: .5, d: .55 }, owl: { rev: .6, d: .6 }, level: { rev: .3 } };

  G.sfx = function (name, vol, pan, o) {
    if (vol === undefined) vol = 1; if (vol <= .012 || !S[name] || !ready()) return;
    o = DEF[name] ? Object.assign({}, DEF[name], o) : o || {};
    S[name](place(1, pan || 0, o), vol, o);
  };

  // ------------------------------------------------------------ voices
  // A voice is a buzz (the cords) and a hiss (the breath) put through three resonances that stand for the shape of the
  // mouth, and slid from one vowel toward another. No words: cries, grunts, and the sound of talk too far off to follow.
  const VOW = { a: [730, 1090, 2440], ae: [660, 1720, 2410], e: [530, 1840, 2480], i: [290, 2250, 2900], o: [570, 840, 2410], u: [320, 870, 2240], w: [640, 920, 2400], y: [500, 1500, 2500], m: [260, 1150, 2300] };
  const OPEN = { a: 1, ae: .9, w: .85, o: .7, e: .6, y: .5, i: .35, u: .3, m: .04 };
  const SPEECH = ['a', 'e', 'i', 'o', 'u', 'y', 'ae', 'w'], NOTES = [1, 1.125, 1.2, 1.333, 1.5, 1.667, 1.8, 2];
  // one stretch of voice. t, d: when and how long. v0, v1: the mouth at each end (a vowel, or three resonances).
  // p0, p1: pitch, as multiples of the speaker's own. a: loudness. x: { n: share of breath, atk, rel, rough, tense,
  // soft, tie: runs on from the stretch before, hold: runs on into the next, open: how wide the mouth, cons: 1 }
  const seg = (t, d, v0, v1, p0, p1, a, x) => Object.assign({ t, d, v0, v1, p0, p1, a }, x);
  // whose voice: its pitch, the size of the head it comes out of, how rough, how breathy
  function who(type, seed) {
    const r = k => { const x = Math.sin((seed * 977 + k) * 12.9898) * 43758.5453; return x - Math.floor(x); };
    switch (type) {
      case 'wolf': return { f0: 88 + r(1) * 22, fs: 1, rough: .5, breath: .1, am: 30 + r(2) * 10, vib: 5 };
      case 'hound': return { f0: 108 + r(1) * 28, fs: 1.06, rough: .45, breath: .1, am: 34 + r(2) * 10, vib: 5 };
      case 'boar': return { f0: 82 + r(1) * 18, fs: .9, rough: .6, breath: .2, am: 26 + r(2) * 8, vib: 4 };
      case 'deer': return { f0: 340 + r(1) * 60, fs: 1.15, rough: .2, breath: .15, am: 24, vib: 6 };
      case 'boss': return { f0: 76 + r(1) * 16, fs: .87 + r(2) * .06, rough: .3 + r(3) * .3, breath: r(4) * .1, am: 34 + r(5) * 14, vib: 4.5 + r(6) };
      default: return { f0: 92 + r(1) * 54, fs: .93 + r(2) * .17, rough: r(3) * .35, breath: r(4) * .18, am: 36 + r(5) * 20, vib: 4.5 + r(6) * 2 };
    }
  }
  const MAN = {
    effort() { return [seg(0, rnd(.11, .2), pick(['a', 'y', 'w', 'm']), 'y', 1.4, 1, .9, { n: .25, atk: .012 })]; },
    oof() { return [seg(0, rnd(.1, .16), 'u', 'y', 1.25, .9, .7, { n: .35, atk: .01 })]; },
    pain() { return [seg(0, rnd(.24, .5), pick(['a', 'ae', 'w']), 'y', rnd(1.5, 1.9), rnd(1.05, 1.3), 1, { n: .2, atk: .01, rough: .6, tense: 1 })]; },
    death() { const d = rnd(.8, 1.4); return [seg(0, d * .45, 'a', 'w', 1.5, 1.1, 1, { rough: .5, n: .2, tense: 1, hold: 1 }), seg(d * .45, d * .55, 'w', 'u', 1.1, .55, .7, { n: .5, rough: .7, rel: d * .3, tie: 1 }), seg(d + .08, rnd(.3, .6), 'y', 'u', .5, .45, .3, { n: .95, atk: .08, rel: .25 })]; },
    alert() {
      const n = pick([1, 1, 2, 2, 3]), hi = rnd(1.9, 2.4), out = []; let t = 0;
      for (let i = 0; i < n; i++) { const d = rnd(.16, .3) * (i === n - 1 ? 1.3 : 1), [a, b] = pick([['o', 'i'], ['e', 'i'], ['a', 'a'], ['a', 'u'], ['e', 'y'], ['o', 'o']]); out.push(seg(t, d, a, b, hi * rnd(.92, 1.05), hi * rnd(.75, .95), 1, { n: .12, atk: .015, tense: 1, rough: .25, cons: i ? 1 : 0 })); t += d + rnd(.05, .12); }
      return out;
    },
    roar() { const d = rnd(.7, 1.05); return [seg(0, d * .3, 'o', 'a', 1.5, 1.9, 1, { tense: 1, rough: .7, atk: .05, n: .15, hold: 1 }), seg(d * .3, d * .7, 'a', 'w', 1.9, 1.35, 1, { tense: 1, rough: .85, rel: .2, n: .2, tie: 1 })]; },
    taunt() { const out = [], n = pick([1, 2]); let t = 0; for (let i = 0; i < n; i++) { const d = rnd(.13, .22); out.push(seg(t, d, pick(['a', 'e', 'o']), pick(['a', 'y', 'i']), rnd(1.5, 1.8), rnd(1.2, 1.5), .9, { tense: 1, n: .15, atk: .012, rough: .2, cons: 1 })); t += d + rnd(.04, .09); } return out; },
    call() { const d = rnd(.45, .7); return [seg(0, d * .6, 'o', 'o', 1.8, 2.1, 1, { tense: 1, atk: .04, n: .1, hold: 1 }), seg(d * .6, d * .4, 'o', 'i', 2.1, 1.6, .9, { tense: 1, n: .1, tie: 1, rel: .1 })]; },
    fear() { const out = [], n = irnd(2, 3); let t = 0; for (let i = 0; i < n; i++) { const d = rnd(.12, .26); out.push(seg(t, d, pick(['a', 'ae']), 'y', rnd(2.3, 2.8), rnd(1.9, 2.3), .9, { n: .3, tense: 1, rough: .35, atk: .01 })); t += d + rnd(.05, .1); } return out; },
    huh() { return Math.random() < .5 ? [seg(0, rnd(.2, .3), 'm', 'm', 1, 1.5, .55, { n: .1, atk: .04 })] : [seg(0, rnd(.16, .24), 'e', 'e', 1.15, 1.6, .55, { n: .3, atk: .03 })]; },
    hmph() { return [seg(0, rnd(.16, .24), 'm', 'm', 1.2, .8, .5, { n: .3, atk: .02 })]; },
    sigh() { return [seg(0, rnd(.4, .6), 'y', 'u', 1.1, .8, .75, { n: .85, atk: .12, rel: .25 })]; },
    // talk, as you hear it through a wall: the tune and the rhythm of it, and none of the sense
    mutter() {
      const n = irnd(3, 8), out = []; let t = 0, p = rnd(1, 1.15);
      for (let i = 0; i < n; i++) { const d = rnd(.08, .19), last = i === n - 1; out.push(seg(t, d * (last ? 1.4 : 1), pick(SPEECH), pick(SPEECH), p * rnd(.94, 1.1), p * (last ? .82 : rnd(.9, 1.04)), rnd(.3, .5), { n: .15, atk: .02, cons: Math.random() < .6 ? 1 : 0, soft: 1 })); t += d + rnd(.015, .07); p *= .975; }
      return out;
    },
    laugh() { const n = irnd(3, 6), out = [], v = pick(['e', 'a', 'y']); let t = 0, p = rnd(1.4, 1.7), a = .6; for (let i = 0; i < n; i++) { out.push(seg(t, rnd(.06, .09), v, v, p, p * .9, a, { n: .45, atk: .012 })); t += rnd(.13, .17); p *= .94; a *= .86; } return out; },
    cough() { const out = []; let t = 0; for (let i = 0; i < irnd(2, 3); i++) { out.push(seg(t, rnd(.06, .09), 'a', 'y', .95, .8, .8, { n: .8, atk: .004, rough: .5 })); t += rnd(.17, .26); } return out; },
    sniff() { return [seg(0, rnd(.14, .2), 'i', 'i', 1, 1, .7, { n: 1, atk: .05, open: .02 })]; },
    yawn() { return [seg(0, .5, 'y', 'a', .9, 1.3, .4, { n: .4, atk: .2, hold: 1, open: 1 }), seg(.5, rnd(.6, .8), 'a', 'o', 1.3, .75, .4, { n: .5, rel: .3, tie: 1, open: .9 })]; },
    hum() { const out = []; let t = 0, i = irnd(0, 4); for (let k = irnd(3, 6); k--;) { const d = pick([.28, .28, .42, .56]), p = NOTES[i]; out.push(seg(t, d, 'm', 'm', p, p, .4, { n: .05, atk: .04, soft: 1 })); t += d + .03; i = clamp(i + pick([-2, -1, 1, 1, 2]), 0, 7); } return out; },
    // through the teeth: a tune, or the start of one
    whistle() { const out = []; let t = 0, i = irnd(2, 6); for (let k = irnd(4, 8); k--;) { const d = pick([.16, .16, .24, .32, .48]), p = NOTES[i]; out.push(seg(t, d, 'u', 'u', p, p, .5, { atk: .03, open: .12 })); t += d + .03; i = clamp(i + pick([-2, -1, -1, 1, 1, 2]), 0, 7); } out.whistle = true; return out; }
  };
  const WOLF = {
    growl() { const d = rnd(.7, 1.2); return [seg(0, d, [420, 1000, 2300], [520, 1150, 2400], .85, 1, .9, { n: .35, rough: .9, atk: .12, rel: .2, open: .25 })]; },
    snarl() { return [seg(0, rnd(.26, .4), [650, 1500, 2800], [520, 1300, 2600], 1.3, 1.6, 1, { n: .5, rough: .9, tense: 1, atk: .02, open: .6 })]; },
    whuff() { return [seg(0, rnd(.08, .12), [520, 1100, 2400], [420, 950, 2300], 1.6, 1.2, .5, { n: .6, atk: .008, open: .3 })]; },
    bark() { const out = []; let t = 0; for (let i = irnd(1, 3); i--;) { const d = rnd(.08, .11); out.push(seg(t, d, [750, 1450, 2700], [550, 1200, 2500], 2.9, 1.8, 1, { n: .35, atk: .006, tense: 1, rough: .4, open: .8 })); t += d + rnd(.09, .15); } return out; },
    yelp() { return [seg(0, rnd(.12, .18), [900, 2100, 3200], [800, 1900, 3000], 6, 4, .9, { n: .15, tense: 1, atk: .008, open: .6 })]; },
    whine() { return [seg(0, rnd(.4, .7), [800, 1900, 3000], [700, 1700, 2900], 5, 3.4, .45, { n: .2, atk: .06, rel: .2, soft: 1, open: .15 })]; },
    pant() { const out = []; let t = 0; for (let i = irnd(3, 5); i--;) { out.push(seg(t, .11, [600, 1400, 2600], [500, 1200, 2500], 1, 1, .7, { n: 1, atk: .03, open: .5 })); t += .2; } return out; },
    death() { return [seg(0, .15, [900, 2100, 3200], [800, 1900, 3000], 6, 4.4, .9, { n: .15, tense: 1, atk: .008, hold: 1, open: .7 }), seg(.15, rnd(.5, .8), [800, 1900, 3000], [600, 1500, 2700], 4.4, 2.2, .6, { n: .3, tie: 1, rel: .35, open: .4 })]; },
    howl() { const a = [450, 900, 2300], b = [500, 1000, 2400], hi = rnd(4.3, 4.8), d = rnd(1, 1.6); return [seg(0, .45, a, b, 2.9, hi, .45, { atk: .25, hold: 1, soft: 1, open: .7 }), seg(.45, d, b, b, hi, hi * 1.02, .5, { tie: 1, hold: 1, soft: 1, open: .7 }), seg(.45 + d, rnd(.7, 1.1), b, [420, 850, 2200], hi * 1.02, 3.1, .5, { tie: 1, rel: .6, soft: 1, open: .5 })]; }
  };
  const BOAR = {
    grunt() { const out = []; let t = 0; for (let i = irnd(2, 4); i--;) { const d = rnd(.07, .13); out.push(seg(t, d, [320, 850, 1900], [280, 700, 1800], 1, .85, .9, { n: .55, rough: .7, atk: .012, open: .3 })); t += d + rnd(.05, .1); } return out; },
    squeal() { const d = rnd(.4, .7); return [seg(0, d * .4, [950, 2300, 3400], [1000, 2400, 3500], 8, 12, .6, { n: .3, rough: .5, tense: 1, atk: .02, hold: 1, open: .8 }), seg(d * .4, d * .6, [1000, 2400, 3500], [900, 2200, 3300], 12, 9, .6, { n: .3, rough: .5, tense: 1, tie: 1, rel: .12, open: .8 })]; },
    death() { const d = rnd(.6, .9); return [seg(0, d, [950, 2300, 3400], [600, 1500, 2600], 11, 4, .65, { n: .35, rough: .6, tense: 1, atk: .02, rel: .3, open: .8 }), seg(d + .1, .14, [320, 850, 1900], [280, 700, 1800], 1, .8, .6, { n: .6, rough: .7, open: .3 })]; }
  };
  const DEER = {
    snort() { return [seg(0, rnd(.12, .17), [600, 1600, 2800], [500, 1400, 2600], 1, 1, .8, { n: 1, atk: .005, open: .1 })]; },
    bleat() { return [seg(0, rnd(.2, .32), [650, 1700, 2700], [600, 1600, 2600], 1.2, .95, .7, { n: .2, rough: .7, atk: .02, open: .5 })]; },
    death() { return [seg(0, rnd(.5, .7), [650, 1700, 2700], [520, 1400, 2500], 1.3, .7, .7, { n: .3, rough: .7, atk: .02, rel: .3, open: .5 })]; }
  };
  const VP = { man: MAN, boss: MAN, wolf: WOLF, hound: WOLF, boar: BOAR, deer: DEER };
  // what a beast does where a man would shout, grunt or whimper
  const ALIAS = {
    wolf: { alert: 'growl', roar: 'growl', huh: 'whuff', hmph: 'whuff', effort: 'snarl', taunt: 'snarl', pain: 'yelp', oof: 'yelp', fear: 'whine', call: 'howl', idle: 'whine' },
    hound: { alert: 'bark', roar: 'bark', huh: 'growl', hmph: 'whuff', effort: 'snarl', taunt: 'bark', pain: 'yelp', oof: 'yelp', fear: 'whine', call: 'bark', idle: 'pant' },
    boar: { alert: 'squeal', roar: 'squeal', huh: 'grunt', hmph: 'grunt', effort: 'grunt', taunt: 'grunt', pain: 'squeal', oof: 'grunt', fear: 'squeal', call: 'grunt', idle: 'grunt' },
    deer: { alert: 'snort', roar: 'snort', huh: 'snort', hmph: 'snort', effort: 'snort', taunt: 'snort', pain: 'bleat', oof: 'bleat', fear: 'bleat', call: 'snort', idle: 'snort' },
    boss: { alert: 'roar' }
  };
  // the look on the face that goes with a sound
  const EXOF = { pain: 'pain', oof: 'pain', death: 'pain', alert: 'shout', roar: 'shout', call: 'shout', taunt: 'shout', fear: 'fear', huh: 'notice', laugh: 'laugh', yawn: 'yawn', whistle: 'purse', effort: 'strain', growl: 'snarl', snarl: 'snarl', bark: 'snarl', squeal: 'snarl', howl: 'howl' };
  function plan(kind, type) {
    kind = (ALIAS[type] && ALIAS[type][kind]) || kind; const make = (VP[type] || MAN)[kind]; if (!make) return null;
    const segs = make(); let dur = 0; for (const s of segs) dur = Math.max(dur, s.t + s.d);
    return { kind, segs, dur, ex: EXOF[kind] || null, syl: segs.map(s => [s.t, s.t + s.d, (s.open !== undefined ? s.open : (OPEN[s.v0] + OPEN[s.v1]) / 2) * Math.min(1, .45 + s.a * .6)]) };
  }
  const vow = v => typeof v === 'string' ? VOW[v] : v;
  // play a plan into c in the voice W, k times as loud
  function sing(c, pl, W, k) {
    const t0 = c.t, end = t0 + pl.dur + .12, out = ac.createGain(); out.gain.value = k * 1.75; out.connect(c.out);
    if (pl.segs.whistle) {      // no throat in a whistle: a clean note with a little air round it
      const base = rnd(820, 1150);
      for (const s of pl.segs) { const f = base * s.p0, a = t0 + s.t, o = ac.createOscillator(), g = ac.createGain(), l = ac.createOscillator(), lg = ac.createGain(); o.frequency.setValueAtTime(f * .97, a); o.frequency.linearRampToValueAtTime(f, a + .04); l.frequency.value = 5.5; lg.gain.value = f * .006; l.connect(lg); lg.connect(o.frequency); g.gain.setValueAtTime(0, a); g.gain.linearRampToValueAtTime(.2 * s.a, a + s.atk); g.gain.setValueAtTime(.2 * s.a, a + s.d - .03); g.gain.linearRampToValueAtTime(0, a + s.d); o.connect(g); g.connect(out); o.start(a); l.start(a); o.stop(a + s.d + .02); l.stop(a + s.d + .02); nz({ t: a, out }, 0, s.d, f, f, .012 * s.a, 'bandpass', 6, .03); }
      return;
    }
    const osc = ac.createOscillator(), tilt = ac.createBiquadFilter(), gv = ac.createGain(), gn = ac.createGain(), ns = ac.createBufferSource(), mix = ac.createGain();
    osc.type = 'sawtooth'; tilt.type = 'lowpass'; tilt.Q.value = .5; tilt.frequency.value = 2200; gv.gain.value = 0; gn.gain.value = 0; ns.buffer = white; ns.loop = true;
    osc.connect(tilt); tilt.connect(gv); ns.connect(gn);
    const F = [0, 1, 2].map(i => { const f = ac.createBiquadFilter(), g = ac.createGain(); f.type = 'bandpass'; f.Q.value = [4.5, 8, 9][i]; g.gain.value = [1, .62, .32][i]; gv.connect(f); gn.connect(f); f.connect(g); g.connect(mix); return f; });
    mix.connect(out);
    // a rough throat: the loudness shaken many times a second. And the small waver every held note has.
    const am = ac.createOscillator(), ag = ac.createGain(), vib = ac.createOscillator(), vg = ac.createGain();
    am.frequency.value = W.am; ag.gain.value = 0; am.connect(ag); ag.connect(mix.gain); vib.frequency.value = W.vib; vg.gain.value = W.f0 * .012; vib.connect(vg); vg.connect(osc.frequency);
    for (const s of pl.segs) {
      const a = t0 + s.t, b = a + s.d, atk = Math.min(s.atk || .02, s.d * .4), rel = Math.min(s.rel || .05, s.d * .5), va = vow(s.v0), vb = vow(s.v1), n = clamp((s.n || 0) + W.breath * (1 - (s.n || 0)), 0, 1), av = s.a * (1 - n), an = s.a * n * .55;
      osc.frequency.setValueAtTime(W.f0 * s.p0, a); osc.frequency.linearRampToValueAtTime(W.f0 * s.p1, b);
      for (let i = 0; i < 3; i++) { F[i].frequency.setValueAtTime(va[i] * W.fs, a); F[i].frequency.linearRampToValueAtTime(vb[i] * W.fs, b); }
      tilt.frequency.setValueAtTime(s.tense ? 5200 : s.soft ? 1300 : 2400, a);
      ag.gain.setValueAtTime(clamp((s.rough || 0) + W.rough * .4, 0, .9) * .55, a);
      for (const [p, v] of [[gv.gain, av], [gn.gain, an]]) {
        if (!s.tie) p.setValueAtTime(0, a); p.linearRampToValueAtTime(v, a + atk);
        if (s.hold) p.setValueAtTime(v, b); else { p.setValueAtTime(v, b - rel); p.linearRampToValueAtTime(0, b); }
      }
      // a consonant before it: a hiss, a tap, or just a catch of breath
      if (s.cons) { const r = Math.random(), at = d => Math.max(ac.currentTime, a - d); if (r < .35) nz({ t: at(.035), out }, 0, .04, 5200, 3500, .05 * s.a, 'highpass'); else if (r < .7) nz({ t: at(.012), out }, 0, .014, 2600, 1500, .09 * s.a, 'bandpass', 2); }
    }
    for (const o of [osc, am, vib]) { o.start(t0); o.stop(end); } ns.start(t0, Math.random()); ns.stop(end);
  }
  // Returns the plan even when nothing can be heard, so that mouths still move.
  G.voice = function (kind, vol, pan, o) {
    o = o || {}; const type = o.type || 'man', pl = plan(kind, type); if (!pl) return null;
    if (vol > .012 && ready()) sing(place(1, pan || 0, o.helm ? Object.assign({}, o, { muf: 1250 }) : o), pl, who(type, o.seed || 0), vol * (o.helm ? .8 : 1));
    return pl;
  };

  // ------------------------------------------------------------ the standing sound of a place
  let L = null;
  const RAIN_SOUND = false;      // rain is seen and not heard: nothing made here sounded enough like the real thing, and it drowned what matters (footsteps)
  function layers() {
    const loop = (buf, rate) => { const s = ac.createBufferSource(); s.buffer = buf; s.loop = true; if (rate) s.playbackRate.value = rate; s.start(0, Math.random() * 1.5); return s; };
    const flt = (type, f, q) => { const n = ac.createBiquadFilter(); n.type = type; n.frequency.value = f; n.Q.value = q || .7; return n; };
    const gain = v => { const g = ac.createGain(); g.gain.value = v || 0; return g; }, panner = () => ac.createStereoPanner ? ac.createStereoPanner() : gain(1);
    const chain = (...n) => { for (let i = 0; i < n.length - 1; i++) n[i].connect(n[i + 1]); };
    L = {};
    // wind: a low body that swells and sinks, and a thin whistle over it when it blows hard or finds a gap in a wall
    L.windF = flt('bandpass', 380, .6); L.wind = gain(); chain(loop(brown), L.windF, L.wind, B.amb);
    L.whisF = flt('bandpass', 1400, 12); L.whis = gain(); chain(loop(white), L.whisF, L.whis, B.amb);
    // rain: the hiss of it falling and the body of it striking. Under a roof only the drumming comes through.
    L.rainLP = flt('lowpass', 16000, .5); L.rain1 = gain(); L.rain2 = gain(); L.rain3 = gain();
    chain(loop(white, .8), flt('bandpass', 5200, .4), flt('lowpass', 7500, .5), L.rain1, L.rainLP);      // the thin hiss of it falling, kept low
    chain(loop(brown, 1.7), flt('bandpass', 620, .3), L.rain2, L.rainLP);      // the body of it on the ground
    chain(loop(white, .55), flt('bandpass', 2100, .7), L.rain3, L.rainLP);      // the patter, which is never even: it is swelled and thinned by a slow wandering
    { const wob = gain(.05); chain(loop(brown, .035), flt('lowpass', 6, .5), wob); wob.connect(L.rain3.gain); const wob2 = gain(.02); chain(loop(brown, .05), flt('lowpass', 4, .5), wob2); wob2.connect(L.rain1.gain); }
    L.rainLP.connect(B.amb);
    // a fire near by: the low breath of it. The cracks and spits are thrown in one at a time (see ambTick).
    L.fire = gain(); L.firePan = panner(); chain(loop(brown, 1.3), flt('lowpass', 380, .5), L.fire, L.firePan, B.amb);
    L.water = gain(); L.waterPan = panner(); chain(loop(white, .8), flt('bandpass', 850, .5), L.water, L.waterPan, B.amb);
    // the drone under a fight: an open fifth, low, on something like a hurdy-gurdy
    L.drone = gain(); L.droneF = flt('lowpass', 220, 1.2);
    for (const [f, d, v] of [[73.42, -6, 1], [73.42, 7, .8], [110, 3, .6], [146.83, -4, .35]]) { const o = ac.createOscillator(), g = gain(v * .22); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = d; o.connect(g); g.connect(L.droneF); o.start(); }
    chain(L.droneF, L.drone, B.mus);
  }
  const T = { on: 0, rain: 0, wind: 0, storm: 0, shelter: 0, dusk: 0, fire: 0, firePan: 0, water: 0, waterPan: 0, tension: 0, hollow: 0, helm: 1 }, C = Object.assign({}, T);
  let gust = .5, gustTo = .5, birdT = 5, owlT = 25, dripT = 1, creakT = 20, luteT = 9, beatT = 0, beatN = 0, cricketT = 0;
  // s: null for silence, or what the place is like now. Anything left out is taken as none of it.
  G.amb = function (s) {
    for (const k in T) T[k] = k === 'helm' ? 1 : 0; if (!s) return;
    for (const k in T) if (typeof s[k] === 'number' && isFinite(s[k])) T[k] = s[k]; T.on = 1;
  };
  const DOR = [146.83, 164.81, 174.61, 196, 220, 246.94, 261.63, 293.66, 329.63, 349.23, 392, 440];
  const one = (v, pan, rev, at) => place(v, pan, { bus: B.amb, rev, at });
  function bird(v, pan) {
    const c = one(v, pan, .35), base = rnd(2400, 4200), kind = irnd(0, 3); let t = 0;
    if (kind === 0) for (let i = irnd(2, 5); i--;) { chirp(c, t, rnd(.05, .09), base * rnd(.9, 1.1), base * rnd(1.2, 1.5), .5); t += rnd(.09, .16); }
    else if (kind === 1) for (let i = irnd(4, 9); i--;) { chirp(c, t, .035, base * 1.3, base * .9, .4); t += .05; }
    else if (kind === 2) { chirp(c, 0, .22, base * .7, base * .95, .5); chirp(c, .3, .3, base * .95, base * .6, .5); }
    else for (let i = irnd(3, 6); i--;) { const f = base * pick([1, 1.125, 1.25, 1.5, .84]); chirp(c, t, rnd(.07, .14), f, f * rnd(.92, 1.1), .45); t += rnd(.1, .2); }
  }
  function drum(at, v) { const c = place(v, 0, { bus: B.mus, rev: .25, at }); tn(c, 0, .22, 92, 46, .9); nz(c, 0, .1, 300, 80, .5); nz(c, 0, .015, 1800, 900, .15, 'bandpass', 1); }
  function lute(v) {
    const c = place(v, rnd(-.3, .3), { bus: B.mus, rev: .3 }); let i = pick([0, 4, 7]), t = 0; pluck(c, 0, 73.42, .8);
    for (let k = irnd(4, 8); k--;) { pluck(c, t, DOR[i], rnd(.7, 1)); t += pick([.3, .3, .45, .6, .9]); i = clamp(i + pick([-2, -1, -1, 1, 1, 2]), 0, DOR.length - 1); }
    pluck(c, t, DOR[pick([0, 4, 7])], 1); pluck(c, t + .03, 146.83, .6);
  }
  function ambTick() {
    if (!live || forced || live.ac.state !== 'running') return;
    const now = ac.currentTime, set = (p, v, tc) => p.setTargetAtTime(v, now, tc || .25);
    for (const k in T) { const r = k === 'tension' ? (T[k] > C[k] ? .25 : .03) : k === 'firePan' || k === 'waterPan' ? .35 : k === 'shelter' ? .2 : .12; C[k] += (T[k] - C[k]) * r; }
    helm = clamp(C.helm, .3, 1);
    const on = C.on, sh = C.shelter, open = 1 - sh, raid = on * (1 - C.hollow), quiet = raid > .5 && C.rain < .45;
    if (Math.random() < .04) gustTo = rnd(.2, 1); gust += (gustTo - gust) * .05;
    const w = C.wind * (.5 + .8 * gust);
    set(L.wind.gain, (.02 + .26 * w) * (1 - .55 * sh) * on); set(L.windF.frequency, 250 + 430 * w * (1 - .4 * sh), .6);
    set(L.whis.gain, (w * w * .018 + w * sh * .012) * on); set(L.whisF.frequency, 900 + 900 * gust + 500 * w, .9);
    set(L.rain1.gain, 0); set(L.rain2.gain, 0); set(L.rain3.gain, 0); set(L.rainLP.frequency, lerp(16000, 850, sh));
    set(L.fire.gain, C.fire * .14 * on); if (L.firePan.pan) set(L.firePan.pan, clamp(C.firePan, -1, 1), .12);
    set(L.water.gain, C.water * .1 * (.75 + .25 * Math.sin(now * 1.9)) * on); if (L.waterPan.pan) set(L.waterPan.pan, clamp(C.waterPan, -1, 1), .12);
    set(live.gOut.gain, .5 * open + .1 * sh); set(live.gIn.gain, .9 * sh); set(live.mus.gain, opt('mus', .6), .1);
    // a fight: the drone comes up under it, and when it is hot a tabor keeps time
    const ten = C.tension * raid;
    set(L.drone.gain, ten > .04 ? .08 + .32 * ten : 0, .8); set(L.droneF.frequency, 170 + 520 * ten, .8);
    if (ten > .45) { if (beatT < now) { beatT = now + .06; beatN = 0; } while (beatT < now + .22) { const k = [1, 0, .45, 0, .8, 0, .45, .3][beatN++ & 7]; if (k) drum(beatT - now, k * (ten - .15) * .45); beatT += .27; } }
    // the spit and crack of a fire
    // now and then, not all the time: a pop every half second or so, sometimes two or three close together.
    // (It once threw one to two every tick, ten to twenty a second, and a hearth became a steady scratching hiss.)
    if (C.fire * on > .03 && Math.random() < C.fire * .22) for (let i = Math.random() < .2 ? irnd(2, 3) : 1; i-- > 0;) { const c = one(C.fire * .22, clamp(C.firePan + rnd(-.15, .15), -1, 1), .04, rnd(0, .1) + i * rnd(.04, .12)); nz(c, 0, rnd(.004, .02), rnd(1200, 3800), rnd(700, 1600), rnd(.3, 1), 'bandpass', rnd(1.5, 4)); if (Math.random() < .12) tn(c, 0, .05, rnd(220, 380), 110, .5); }
    // single drops striking close by: leaves, mud, your own shoulders. They are what makes rain rain and not a hiss.
    if (RAIN_SOUND && C.rain * on > .04) for (let i = 0, n = Math.round(1 + C.rain * 6 * (.6 + Math.random() * .8) * (.35 + .65 * open)); i < n; i++) {
      // most strike leaves and earth: a short high tick. Some find a puddle: a lower, rounder plop. A few are close and loud.
      const plop = Math.random() < .22, near = Math.random() < .12, f = plop ? rnd(420, 950) : rnd(1900, 6200), c = one(rnd(.008, .022) * (near ? 2.2 : 1) * (.5 + C.rain * .6) * (.4 + .6 * open), rnd(-1, 1), .12, rnd(0, .1));
      chirp(c, 0, plop ? rnd(.03, .06) : rnd(.008, .022), f, f * (plop ? rnd(1.3, 1.8) : rnd(.4, .7)), 1);
    }    // rain finding its way through a roof
    if (RAIN_SOUND && C.rain * sh * on > .15 && (dripT -= .1) <= 0) { dripT = rnd(.25, 1.8) / C.rain; const f = rnd(1100, 2300), c = one(.03, rnd(-.8, .8), .5); chirp(c, 0, .05, f, f * .6, 1); }
    // timbers shifting when it blows
    if (sh > .5 && raid > .5 && (creakT -= .1 * (.3 + C.wind)) <= 0) { creakT = rnd(14, 38); const c = one(.05, rnd(-.8, .8), .5); tn(c, 0, rnd(.3, .7), rnd(58, 80), rnd(70, 100), 1, 'sawtooth', .1, rnd(600, 1100), 9); }
    // birds by day, where it is not raining hard; at dusk an owl, and things in the grass
    if (quiet && sh < .7) {
      if ((birdT -= .1) <= 0) { birdT = rnd(2.5, 10) * (1 + C.dusk * 3); if (C.dusk < .7) bird(rnd(.02, .06) * open, rnd(-1, 1)); }
      if (C.dusk > .5 && (owlT -= .1) <= 0) { owlT = rnd(20, 50); S.owl(one(1, rnd(-.9, .9), .6), rnd(.1, .2) * open, {}); }
      if (C.dusk > .55 && (cricketT -= .1) <= 0) { cricketT = rnd(.35, .8); const c = one((C.dusk - .5) * .03 * open, pick([-.6, .5]), .1), f = pick([4200, 4500]); for (let i = 0; i < 3; i++) chirp(c, i * .045, .028, f, f, 1); }
    }
    // in the Hollow someone has a lute, and plays a few bars when the mood takes them
    if (C.hollow * on > .5 && (luteT -= .1) <= 0) { luteT = rnd(26, 60); lute(.5); }
  }
  // a few notes for the end of a day's work, or the end of you
  G.sting = function (name) {
    if (!ready()) return; const c = place(.55, 0, { bus: B.mus, rev: .35 });
    if (name === 'out') { [146.83, 220, 293.66, 349.23, 440].forEach((f, i) => pluck(c, i * .16, f, .8)); pluck(c, .95, 293.66, .9); pluck(c, .97, 440, .7); pluck(c, .99, 587.33, .7); pluck(c, .95, 73.42, .9); }
    else if (name === 'dead') { [220, 196, 174.61, 164.81, 146.83].forEach((f, i) => pluck(c, i * .42, f, .8)); pluck(c, 2.1, 73.42, 1); tn(c, 0, .5, 80, 40, .5); nz(c, 0, .2, 260, 70, .3); }
    else if (name === 'begin') { tn(c, 0, .3, 90, 44, .7); nz(c, 0, .12, 300, 80, .4); pluck(c, .05, 73.42, .9); pluck(c, .3, 110, .8); pluck(c, .55, 146.83, .7); }
  };

  // ------------------------------------------------------------ testing without ears
  // Render what fn() plays into a buffer instead of the speakers, so that it can be measured and looked at.
  G.audioDev = {
    render(fn, secs) { const kb = B, ka = ac, off = new OfflineAudioContext(2, Math.ceil(44100 * (secs || 2)), 44100); B = wire(off, false); forced = true; try { fn(); } finally { forced = false; B = kb; ac = ka; } return off.startRendering(); },
    level() { if (!live) return null; const a = new Float32Array(live.tap.fftSize); live.tap.getFloatTimeDomainData(a); let s = 0, p = 0; for (const v of a) { s += v * v; p = Math.max(p, Math.abs(v)); } return { rms: Math.sqrt(s / a.length), peak: p, state: live.ac.state }; },
    sounds: () => Object.keys(S), kinds: type => Object.keys(VP[type] || MAN), state: () => ({ T: Object.assign({}, T), C: Object.assign({}, C) })
  };
})();
