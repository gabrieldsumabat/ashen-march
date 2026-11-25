'use strict';
// Interface, part 1: item icons, the grid inventory (drag, drop, rotate with R, stack, split), tooltips,
// the right-click menu, and the search-and-loot overlay used in the ruins. Shared helpers live on G.U.
(function () {
  const CELL = 40, I = G.ITEMS, $ = id => document.getElementById(id);
  const U = G.U = { CELL, $ };
  const h = U.h = function (tag, cls, txt) { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
  const inRaid = U.inRaid = () => G.raid.active();
  let loot = null, lootOn = false, searchT = 0, drag = null, toastT = 0;

  // ------------------------------------------------------------------ item icons (drawn, cached)
  const icache = {};
  const icon = U.icon = function (d, rot) {
    const key = d.id + (rot ? 'r' : ''); if (icache[key]) return icache[key];
    if (rot) { const img = icon.canvas(d), c = document.createElement('canvas'); c.width = img.height; c.height = img.width; const g = c.getContext('2d'); g.translate(c.width, 0); g.rotate(Math.PI / 2); g.drawImage(img, 0, 0); return icache[key] = c.toDataURL(); }
    return icache[key] = icon.canvas(d).toDataURL();
  };
  const ccache = {};
  icon.canvas = function (d) {
    if (ccache[d.id]) return ccache[d.id];
    const w = d.w * CELL, hh = d.h * CELL, c = document.createElement('canvas'); c.width = w; c.height = hh;
    const g = c.getContext('2d'); g.lineCap = 'round'; g.lineJoin = 'round';
    const X = v => v * w, Y = v => v * hh, px = Math.min(w, hh);
    const poly = (pts, col) => { g.fillStyle = col; g.beginPath(); pts.forEach((p, i) => i ? g.lineTo(X(p[0]), Y(p[1])) : g.moveTo(X(p[0]), Y(p[1]))); g.closePath(); g.fill(); };
    const ln = (x1, y1, x2, y2, col, wd) => { g.strokeStyle = col; g.lineWidth = wd; g.beginPath(); g.moveTo(X(x1), Y(y1)); g.lineTo(X(x2), Y(y2)); g.stroke(); };
    const circ = (x, y, r, col) => { g.fillStyle = col; g.beginPath(); g.arc(X(x), Y(y), r, 0, 7); g.fill(); };
    const ring = (x, y, r, col, wd) => { g.strokeStyle = col; g.lineWidth = wd; g.beginPath(); g.arc(X(x), Y(y), r, 0, 7); g.stroke(); };
    const rect = (x, y, rw, rh, col) => { g.fillStyle = col; g.fillRect(X(x), Y(y), X(rw), Y(rh)); };
    const st = '#a3a9af', dk = '#5f656b', wo = '#6b4a2b', le = '#4a321f', col = d.col || st, e = 8 / hh, p = v => v / hh;
    const shaft = top => ln(.5, top, .5, 1 - e, wo, 4);
    switch (d.icon) {
      case 'sword': { const bw = (d.bw || .08) * 40 / w, gy = 1 - 15 / hh; poly([[.5 - bw, gy], [.5 - bw, p(12)], [.5, p(4)], [.5 + bw, p(12)], [.5 + bw, gy]], d.col || st); ln(.5, p(12), .5, gy, 'rgba(0,0,0,.2)', 1); ln(.5 - 9 / w, gy, .5 + 9 / w, gy, dk, 3); ln(.5, gy, .5, 1 - 7 / hh, le, 4); circ(.5, 1 - 5 / hh, 3, dk); break; }
      case 'club': poly([[.44, 1 - e], [.56, 1 - e], [.66, .14], [.34, .14]], wo); circ(.5, .14, 6.5, wo); break;
      case 'staff': ln(.5, e, .5, 1 - e, wo, 4.5); ln(.5, e, .5, p(14), dk, 5); ln(.5, 1 - p(14), .5, 1 - e, dk, 5); break;
      case 'axe': shaft(e); poly([[.5, p(8)], [.86, p(5)], [.9, p(24)], [.5, p(19)]], st); break;
      case 'mace': shaft(.2); circ(.5, p(12), 8, dk); for (let i = 0; i < 6; i++) ln(.5, p(12), .5 + Math.cos(i * 1.05) * 11 / w, (12 + Math.sin(i * 1.05) * 11) / hh, dk, 3); break;
      case 'hammer': shaft(e); rect(.3, p(6), .34, p(12), dk); poly([[.64, p(7)], [.95, p(12)], [.64, p(17)]], st); break;
      case 'spear': shaft(p(18)); poly([[.5, p(3)], [.62, p(15)], [.5, p(24)], [.38, p(15)]], st); break;
      case 'fork': shaft(p(22)); ln(.35, p(5), .35, p(22), dk, 2.5); ln(.65, p(5), .65, p(22), dk, 2.5); ln(.35, p(22), .65, p(22), dk, 2.5); break;
      case 'poleaxe': shaft(p(12)); poly([[.5, p(3)], [.56, p(16)], [.44, p(16)]], st); poly([[.5, p(16)], [.86, p(12)], [.9, p(32)], [.5, p(27)]], st); poly([[.5, p(18)], [.22, p(17)], [.22, p(27)], [.5, p(26)]], dk); break;
      case 'halberd': shaft(p(12)); poly([[.5, p(2)], [.58, p(16)], [.42, p(16)]], st); poly([[.5, p(14)], [.9, p(9)], [.96, p(36)], [.5, p(28)]], st); poly([[.5, p(18)], [.16, p(22)], [.24, p(30)], [.5, p(26)]], dk); break;
      case 'bill': shaft(p(20)); poly([[.44, p(34)], [.44, p(9)], [.56, p(3)], [.8, p(9)], [.66, p(15)], [.58, p(34)]], st); break;
      case 'bow': g.strokeStyle = wo; g.lineWidth = 3; g.beginPath(); g.moveTo(X(.3), Y(e)); g.quadraticCurveTo(X(1.05), Y(.5), X(.3), Y(1 - e)); g.stroke(); ln(.3, e, .3, 1 - e, '#cfc8b0', 1); break;
      case 'xbow': ln(.5, .16, .5, .92, wo, 6); g.strokeStyle = dk; g.lineWidth = 4; g.beginPath(); g.moveTo(X(.06), Y(.3)); g.quadraticCurveTo(X(.5), Y(.08), X(.94), Y(.3)); g.stroke(); ln(.06, .3, .94, .3, '#cfc8b0', 1); ln(.5, .2, .5, .5, st, 2); break;
      case 'arrows': for (const o of [-.14, 0, .14]) { ln(.3 + o, .85, .62 + o, .2, wo, 1.6); poly([[.62 + o, .2], [.7 + o, .1], [.69 + o, .28]], d.col || st); } break;
      case 'bolts': for (const o of [-.16, 0, .16]) { ln(.38 + o, .78, .54 + o, .3, wo, 2.6); poly([[.5 + o, .32], [.6 + o, .16], [.6 + o, .36]], dk); } break;
      case 'shieldR': circ(.5, .5, px / 2 - 6, col); ring(.5, .5, px / 2 - 6, dk, 2.5); circ(.5, .5, 6, st); break;
      case 'shieldH': poly([[.14, .1], [.86, .1], [.86, .5], [.5, .92], [.14, .5]], col); g.strokeStyle = st; g.lineWidth = 2.5; g.stroke(); break;
      case 'helm': g.fillStyle = col; g.beginPath(); g.arc(X(.5), Y(.55), px * .3, Math.PI, 0); g.lineTo(X(.8), Y(.72)); g.lineTo(X(.2), Y(.72)); g.fill(); if (d.nasal) ln(.5, .5, .5, .86, dk, 4); else ln(.1, .73, .9, .73, dk, 4); if (d.closed) { poly([[.3, .56], [.7, .56], [.62, .9], [.38, .9]], col); ln(.34, .62, .66, .62, '#0a0a0a', 2.5); } break;
      case 'ghelm': rect(.24, .22, .52, .64, col); rect(.2, .16, .6, .08, dk); ln(.3, .46, .7, .46, '#0a0a0a', 3); ln(.5, .46, .5, .84, dk, 2); for (const o of [.36, .64]) for (const y of [.6, .7]) circ(o, y, 1.3, '#0a0a0a'); break;
      case 'coif': g.fillStyle = col; g.beginPath(); g.arc(X(.5), Y(.48), px * .31, Math.PI, 0); g.lineTo(X(.84), Y(.88)); g.lineTo(X(.16), Y(.88)); g.fill(); circ(.5, .52, px * .16, '#1a1612'); break;
      case 'torso': poly(d.arms ? [[.26, .14], [.4, .08], [.6, .08], [.74, .14], [.94, .4], [.78, .48], [.72, .36], [.72, .92], [.28, .92], [.28, .36], [.22, .48], [.06, .4]] : [[.26, .12], [.4, .08], [.6, .08], [.74, .12], [.76, .3], [.72, .36], [.72, .92], [.28, .92], [.28, .36], [.24, .3]], col); ln(.5, .1, .5, .92, 'rgba(0,0,0,.25)', 1.5); break;
      case 'legs': poly([[.22, .1], [.78, .1], [.8, .92], [.56, .92], [.5, .34], [.44, .92], [.2, .92]], col); break;
      case 'bag': poly([[.22, .3], [.78, .3], [.88, .88], [.12, .88]], col); poly([[.36, .14], [.64, .14], [.7, .3], [.3, .3]], col); ln(.3, .3, .7, .3, 'rgba(0,0,0,.4)', 2.5); break;
      case 'belt': ln(.05, .5, .95, .5, col, hh > 50 ? 9 : 7); g.strokeStyle = '#8d9399'; g.lineWidth = 2; g.strokeRect(X(.44), Y(.5) - 7, X(.12), 14); for (let i = 0; i < (d.cw > 3 ? 2 : 1); i++) rect(.14 + i * .56, .5, .14, hh > 50 ? .3 : .34, col); if (d.ch > 1) { rect(.14, .14, .16, .22, col); rect(.7, .14, .16, .22, col); } break;
      case 'bandage': rect(.22, .34, .56, .34, '#d8d0b8'); ring(.5, .51, 4, '#a09880', 1.5); ln(.78, .4, .9, .62, '#d8d0b8', 4); break;
      case 'strap': ring(.44, .54, 9, '#5a3d25', 4.5); ln(.56, .22, .82, .8, wo, 3.5); break;
      case 'jar': rect(.26, .34, .48, .48, d.col || '#7a5a3c'); rect(.3, .24, .4, .12, '#4f6a3a'); break;
      case 'splint': ln(.32, .12, .32, .88, wo, 4); ln(.68, .12, .68, .88, wo, 4); for (const y of [.25, .5, .75]) ln(.26, y, .74, y, '#d8d0b8', 3); break;
      case 'roll': rect(.26, .14, .48, .72, '#6a4a2e'); for (const y of [.3, .7]) ln(.24, y, .76, y, '#d8d0b8', 2.5); ln(.4, .38, .4, .62, st, 1.5); ln(.5, .38, .5, .62, st, 1.5); ln(.6, .4, .6, .6, st, 2.5); break;
      case 'bark': for (const [x, a] of [[.3, -.2], [.5, .1], [.68, -.1]]) { g.save(); g.translate(X(x), Y(.5)); g.rotate(a); g.fillStyle = '#7a5a3c'; g.fillRect(-4, -13, 8, 26); g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(-1, -11, 1, 22); g.restore(); } break;
      case 'mug': rect(.24, .3, .42, .5, wo); ring(.74, .54, 6, wo, 3); rect(.24, .24, .42, .08, '#d8d0b8'); break;
      case 'vial': rect(.38, .36, .24, .5, '#5a7a8a'); rect(.42, .2, .16, .16, wo); break;
      case 'bottle': rect(.34, .4, .32, .5, '#2f4a34'); rect(.44, .12, .12, .3, '#2f4a34'); rect(.42, .08, .16, .06, '#8a6a42'); rect(.36, .58, .28, .16, '#cdbf96'); break;
      case 'skin': g.fillStyle = '#6a4a2e'; g.beginPath(); g.ellipse(X(.5), Y(.6), w * .32, hh * .3, 0, 0, 7); g.fill(); rect(.42, .1, .16, .24, '#6a4a2e'); rect(.4, .08, .2, .06, '#2a1f16'); ln(.3, .3, .7, .3, '#a08a58', 2); break;
      case 'bread': g.fillStyle = '#5c4026'; g.beginPath(); g.ellipse(X(.5), Y(.56), px * .36, px * .24, 0, 0, 7); g.fill(); ln(.36, .46, .44, .6, '#3a2816', 2); ln(.54, .44, .62, .58, '#3a2816', 2); break;
      case 'apple': circ(.4, .6, 9, '#8a3a2a'); circ(.64, .56, 8, '#7a8a3a'); ln(.4, .38, .44, .28, wo, 2); break;
      case 'cheese': poly([[.14, .7], [.86, .46], [.86, .7]], '#c8a84a'); poly([[.14, .7], [.86, .46], [.6, .34]], '#d8bc5e'); circ(.6, .6, 2, '#a8883a'); circ(.74, .56, 1.6, '#a8883a'); break;
      case 'fish': for (const y of [.36, .62]) { g.fillStyle = '#6a6a5a'; g.beginPath(); g.ellipse(X(.46), Y(y), w * .3, hh * .07, 0, 0, 7); g.fill(); poly([[.76, y], [.92, y - .08], [.92, y + .08]], '#6a6a5a'); circ(.24, y - .01, 1.2, '#111'); } break;
      case 'meat': g.fillStyle = col; g.beginPath(); g.ellipse(X(.5), Y(.55), px * .34, px * .22, -.3, 0, 7); g.fill(); ln(.3, .62, .66, .46, '#e0d0c0', 2.5); break;
      case 'turnip': circ(.5, .6, px * .24, col); poly([[.5, .95], [.44, .8], [.56, .8]], col); ln(.5, .38, .36, .14, '#4f6a34', 3); ln(.5, .38, .64, .14, '#4f6a34', 3); break;
      case 'grain': poly([[.24, .22], [.76, .22], [.86, .92], [.14, .92]], col); poly([[.38, .08], [.62, .08], [.68, .22], [.32, .22]], col); ln(.3, .22, .7, .22, 'rgba(0,0,0,.4)', 2.5); for (const o of [.36, .5, .64]) circ(o, .6, 2, '#6f5a2e'); break;
      case 'plank': rect(.3, .06, .4, .88, col); for (const o of [.4, .5, .6]) ln(o, .1, o, .9, 'rgba(0,0,0,.22)', 1); circ(.5, .3, 2.5, 'rgba(0,0,0,.35)'); break;
      case 'nails': for (const o of [-.16, 0, .16]) { ln(.5 + o, .3, .5 + o * .4, .8, col, 2); ln(.44 + o, .3, .56 + o, .3, col, 2.5); } break;
      case 'ingot': poly([[.2, .7], [.3, .4], [.7, .4], [.8, .7]], col); poly([[.3, .4], [.36, .32], [.76, .32], [.7, .4]], '#7a8087'); break;
      case 'rag': poly([[.18, .3], [.5, .2], [.84, .34], [.74, .62], [.86, .8], [.5, .72], [.3, .84], [.24, .6]], col); ln(.32, .42, .68, .46, 'rgba(0,0,0,.2)', 1.5); break;
      case 'rope': for (let i = 0; i < 4; i++) ring(.5, .3 + i * .13, 9, i % 2 ? '#8a7648' : col, 3.5); break;
      case 'herb': for (const o of [-.2, 0, .2]) { ln(.5, .9, .5 + o, .3, '#4f6a34', 2); circ(.5 + o, .26, 4, '#e0dcc8'); } break;
      case 'hide': poly([[.1, .2], [.3, .28], [.5, .16], [.7, .28], [.9, .2], [.84, .5], [.92, .8], [.7, .72], [.5, .86], [.3, .72], [.08, .8], [.16, .5]], col); break;
      case 'coal': circ(.38, .6, 7, col); circ(.6, .5, 8, '#1c1a18'); circ(.54, .7, 5, '#34322e'); break;
      case 'flint': poly([[.22, .7], [.34, .34], [.52, .26], [.6, .66], [.4, .8]], col); g.strokeStyle = st; g.lineWidth = 3; g.beginPath(); g.arc(X(.72), Y(.5), 7, .6, 5.6); g.stroke(); break;
      case 'stone': g.fillStyle = col; g.fillRect(X(.16), Y(.36), X(.68), Y(.3)); g.fillStyle = 'rgba(255,255,255,.18)'; g.fillRect(X(.16), Y(.36), X(.68), Y(.08)); break;
      case 'toolh': ln(.5, .3, .5, .94, wo, 4); rect(.26, .12, .48, .2, dk); poly([[.26, .12], [.14, .08], [.14, .2], [.26, .32]], dk); break;
      case 'saw': ln(.3, .06, .3, .94, wo, 3); ln(.7, .06, .7, .94, wo, 3); ln(.3, .1, .7, .1, wo, 3); ln(.3, .5, .7, .5, wo, 2); ln(.3, .9, .7, .9, st, 2); for (let i = 0; i < 6; i++) ln(.33 + i * .06, .9, .36 + i * .06, .93, st, 1); break;
      case 'tongs': ln(.36, .08, .6, .94, dk, 3); ln(.64, .08, .4, .94, dk, 3); circ(.5, .46, 2.5, st); break;
      case 'needle': ln(.3, .8, .72, .22, st, 1.6); ring(.74, .2, 2, st, 1); ln(.26, .3, .52, .72, wo, 4); ln(.52, .72, .6, .86, st, 1.6); break;
      case 'coin': circ(.4, .6, 8, '#8f8f88'); circ(.6, .46, 8, col); ring(.6, .46, 8, '#77776f', 1.5); break;
      case 'tally': ln(.3, .84, .7, .16, col, 5); for (let i = 0; i < 4; i++) ln(.36 + i * .08, .62 - i * .12, .46 + i * .08, .68 - i * .12, '#2a1f16', 1.5); break;
      case 'ring': ring(.5, .56, 8, col, 3.5); circ(.5, .32, 3.5, col); break;
      case 'beads': for (let i = 0; i < 12; i++) circ(.5 + Math.cos(i * .52) * .28, .5 + Math.sin(i * .52) * .28, 2.6, col); ln(.5, .78, .5, .94, col, 2); ln(.42, .86, .58, .86, col, 2); break;
      case 'comb': rect(.2, .28, .6, .16, col); for (let i = 0; i < 8; i++) ln(.24 + i * .075, .44, .24 + i * .075, .76, col, 1.6); break;
      case 'candle': rect(.4, .22, .2, .62, col); rect(.24, .84, .52, .08, col); circ(.5, .16, 2.6, '#d8a84a'); break;
      case 'goblet': poly([[.24, .2], [.76, .2], [.6, .52], [.4, .52]], col); ln(.5, .52, .5, .8, col, 3); ln(.32, .82, .68, .82, col, 4); break;
      case 'cross': ln(.5, .08, .5, .92, col, 6); ln(.24, .3, .76, .3, col, 6); circ(.5, .3, 3, '#8a1c2a'); break;
      case 'dish': circ(.5, .5, px * .36, col); ring(.5, .5, px * .24, '#9a9a92', 2); ring(.5, .5, px * .36, '#8a8a82', 2); break;
      case 'tapestry': rect(.2, .06, .6, .84, col); for (let i = 0; i < 5; i++) ln(.24 + i * .13, .9, .24 + i * .13, .97, '#c8a83a', 2); ring(.5, .34, 9, '#c8a83a', 2); poly([[.36, .56], [.64, .56], [.5, .78]], '#2a3f5a'); break;
      case 'box': rect(.12, .3, .76, .5, col); poly([[.12, .3], [.5, .1], [.88, .3]], col); ln(.5, .34, .5, .76, '#5a4410', 2); ln(.38, .5, .62, .5, '#5a4410', 2); break;
      case 'pouch': circ(.5, .62, px * .26, col); poly([[.38, .2], [.62, .2], [.56, .4], [.44, .4]], col); ln(.38, .38, .62, .38, '#d8d0b8', 2); break;
      case 'cloth': rect(.08, .28, .84, .44, col); for (let i = 1; i < 5; i++) ln(.08 + i * .17, .3, .08 + i * .17, .7, 'rgba(0,0,0,.25)', 1.5); break;
      case 'pelt': poly([[.2, .1], [.4, .2], [.6, .2], [.8, .1], [.74, .4], [.9, .6], [.74, .64], [.8, .9], [.5, .78], [.2, .9], [.26, .64], [.1, .6], [.26, .4]], col); break;
      case 'tusk': g.strokeStyle = col; g.lineWidth = 6; g.beginPath(); g.moveTo(X(.28), Y(.82)); g.quadraticCurveTo(X(.3), Y(.3), X(.74), Y(.2)); g.stroke(); break;
      case 'antler': ln(.1, .8, .5, .5, col, 4); ln(.5, .5, .92, .2, col, 3.5); ln(.36, .6, .3, .2, col, 3); ln(.62, .42, .6, .1, col, 3); ln(.76, .32, .9, .6, col, 3); break;
      case 'bone': ln(.3, .7, .7, .3, col, 5); for (const [x, y] of [[.26, .66], [.34, .76], [.66, .24], [.74, .34]]) circ(x, y, 3.5, col); break;
      case 'book': rect(.2, .14, .6, .72, col); rect(.74, .17, .06, .66, '#c9bf9f'); ln(.34, .3, .62, .3, '#b89a3e', 1.5); ln(.34, .38, .62, .38, '#b89a3e', 1.5); break;
      case 'scroll': rect(.24, .16, .52, .68, col); ln(.2, .16, .8, .16, '#a89a78', 4); ln(.2, .84, .8, .84, '#a89a78', 4); for (const y of [.32, .42, .52]) ln(.32, y, .68, y, 'rgba(60,40,20,.6)', 1.2); circ(.6, .7, 4, '#8a1c14'); break;
      case 'keyring': ring(.5, .34, 9, '#8a8f94', 2.5); for (const o of [-.2, 0, .2]) { ln(.5 + o * .4, .5, .5 + o, .86, '#8a8f94', 2.5); ln(.5 + o, .8, .58 + o, .8, '#8a8f94', 2); } break;
      case 'key': ring(.5, .26, 7, '#8a8f94', 3); ln(.5, .4, .5, .88, '#8a8f94', 3); ln(.5, .76, .66, .76, '#8a8f94', 3); ln(.5, .88, .62, .88, '#8a8f94', 3); break;
      default: rect(.25, .25, .5, .5, '#777');
    }
    return ccache[d.id] = c;
  };

  // ------------------------------------------------------------------ building blocks
  function itemEl(it, loc, inSlot) {
    const d = G.def(it), e = h('div', 'item'); e._it = it; e._loc = loc;
    if (inSlot) { e.classList.add('fit'); e.style.backgroundImage = `url(${icon(d)})`; }
    else { e.style.width = G.iw(it) * CELL + 'px'; e.style.height = G.ih(it) * CELL + 'px'; e.style.backgroundImage = `url(${icon(d, it.r)})`; }
    if (it.n > 1) e.appendChild(h('span', 'n', it.n)); else if (it.u != null) e.appendChild(h('span', 'n', it.u));
    if (it.dur != null) { const b = h('i', 'dur'); b.style.width = Math.round(it.dur * 100) + '%'; if (it.dur < .4) b.style.background = '#a8402e'; e.appendChild(b); }
    if (it.fir) e.appendChild(h('i', 'fir')); if (it.ins) e.appendChild(h('i', 'ins'));
    // at a glance: what is worth carrying (a richer edge), and what somebody in the Hollow has asked for (a gold corner)
    if (d.value >= 200) e.classList.add('rich'); else if (d.value >= 60) e.classList.add('fine');
    if (wanted().has(d.id)) e.appendChild(h('i', 'want'));
    return e;
  }
  // ---- what things are for. Asked of you: wanted by an open task. Used: by the shelter's next works, or to make something.
  let wantSet = null;
  const wanted = U.wanted = function () {
    if (wantSet) return wantSet; wantSet = new Set(); if (G.me !== G.save) return wantSet;
    for (const t of G.openTasks()) t.objs.forEach((o, i) => { if (o.k === 'hand') { const p = G.objProgress(t, i); if (p[0] < p[1]) wantSet.add(o.id); } });
    return wantSet;
  };
  U.fresh = () => { wantSet = null; };
  function usesOf(id) {
    const s = G.save, out = []; if (G.me !== s) return out;
    for (const t of G.openTasks()) t.objs.forEach((o, i) => { if (o.k === 'hand' && o.id === id) { const p = G.objProgress(t, i); if (p[0] < p[1]) out.push(`<span class="wantT">Asked of you</span>: ${t.name} (${p[0]} of ${p[1]}${o.fir ? ', found not bought' : ''})`); } });
    const works = []; for (const k in G.MODULES) { const lv = G.MODULES[k].levels[s.up[k] || 0]; if (lv && lv.need && lv.need[id]) works.push(`${G.MODULES[k].name} (${lv.need[id]})`); if (lv && lv.tool && lv.tool.includes(id)) works.push(`${G.MODULES[k].name} (as a tool)`); }
    if (works.length) out.push('For the shelter: ' + works.join(', '));
    const makes = G.RECIPES.filter(r => r.need && r.need[id]).map(r => I[r.out].name.toLowerCase()); if (makes.length) out.push('Goes into: ' + [...new Set(makes)].slice(0, 5).join(', '));
    return out;
  }
  // how a thing measures against the one you have on: better in green, worse in red
  const dl = (v, unit, good, dp) => { const n = +v.toFixed(dp === undefined ? 0 : dp); if (!n) return ''; return `<span class="${(n > 0) === good ? 'up' : 'down'}">${n > 0 ? '+' : '−'}${Math.abs(n)}${unit}</span>`; };
  function versus(it) {
    const d = G.def(it), eq = G.me.eq;
    if (d.cat === 'weapon' && !d.ranged) {
      const cur = eq.weapon && eq.weapon !== it ? G.def(eq.weapon) : null; if (!cur || cur.ranged) return '';
      const parts = [dl(d.dmg - cur.dmg, ' harm', true), dl((d.reach - cur.reach) * G.RS / 16, ' m reach', true, 1), dl((d.windup + d.strike + d.recover) - (cur.windup + cur.strike + cur.recover), 's a blow', false, 2), dl(d.stam - cur.stam, ' stamina', false)].filter(Boolean);
      return parts.length ? `Against your ${cur.name.toLowerCase()}: ${parts.join(' · ')}` : `Much the same as your ${cur.name.toLowerCase()}.`;
    }
    if (d.prot) {
      const slot = G.slotFor(it), cur = slot && eq[slot] && eq[slot] !== it ? G.def(eq[slot]) : null; if (!cur || !cur.prot) return slot && !eq[slot] ? 'You wear nothing there now.' : '';
      const parts = [dl((d.prot.cut - cur.prot.cut) * 100, '% cut', true), dl((d.prot.pierce - cur.prot.pierce) * 100, '% pierce', true), dl((d.prot.blunt - cur.prot.blunt) * 100, '% blunt', true), dl(d.weight - cur.weight, ' lb', false, 1)].filter(Boolean);
      return parts.length ? `Against your ${cur.name.toLowerCase()}: ${parts.join(' · ')}` : `Much the same as your ${cur.name.toLowerCase()}.`;
    }
    return '';
  }
  const KIND = { weapon: 'Weapon', ammo: 'Shot', shield: 'Shield', head: 'Armour for the head', body: 'Armour for the body', legs: 'Armour for the legs', belt: 'Belt', pack: 'Pack', med: 'Physic', food: 'Food and drink', key: 'Key', case: 'Case' };
  const gridEl = U.gridEl = function (c) {
    const g = h('div', 'grid'); g.style.width = c.w * CELL + 'px'; g.style.height = c.h * CELL + 'px'; g._c = c;
    for (const o of c.items) {
      let e;
      if (o.hid) { e = h('div', 'item hid', '?'); e.style.width = G.iw(o.it) * CELL + 'px'; e.style.height = G.ih(o.it) * CELL + 'px'; }
      else e = itemEl(o.it, { c });
      e.style.left = o.x * CELL + 'px'; e.style.top = o.y * CELL + 'px'; g.appendChild(e);
    }
    return g;
  };
  const SLOTN = { head: 'Head', body: 'Body', legs: 'Legs', weapon: 'Weapon', off: 'Shield', side: 'Sidearm', belt: 'Belt', pack: 'Pack' };
  function slotEl(name) {
    const s = h('div', 'slot'); s._slot = name; s.appendChild(h('label', null, SLOTN[name]));
    const it = G.me.eq[name]; if (it) s.appendChild(itemEl(it, { slot: name }, true));
    return s;
  }
  // What you are wearing, reckoned up: how much of each kind of blow each part of you is covered against (worn armour
  // turns less as it is cut about), and what the thing in your hand does.
  function sheet(m) {
    const eq = m.eq, box = h('div', 'sheet'), tb = h('div', 'prot');
    const at = (slot, arms) => { const it = eq[slot], d = it && G.def(it); if (!d || !d.prot || (arms && !d.arms)) return null; const k = (.35 + .65 * (it.dur == null ? 1 : it.dur)) * (arms ? .8 : 1); return { cut: d.prot.cut * k, pierce: d.prot.pierce * k, blunt: d.prot.blunt * k }; };
    for (const hd of ['', 'cut', 'pierce', 'blunt']) tb.appendChild(h('span', 'hd', hd));
    for (const [name, p] of [['Head', at('head')], ['Chest, belly', at('body')], ['Arms', at('body', true)], ['Legs', at('legs')]]) {
      tb.appendChild(h('span', 'nm', name));
      for (const k of ['cut', 'pierce', 'blunt']) { const c = h('span', 'pv' + (p && p[k] >= .5 ? ' hi' : p && p[k] > 0 ? '' : ' no')), v = p ? Math.round(p[k] * 100) : 0; c.textContent = v ? v + '%' : '—'; const b = h('i'); b.style.width = v + '%'; c.appendChild(b); tb.appendChild(c); }
    }
    box.appendChild(tb);
    const wi = eq.weapon, d = wi ? G.def(wi) : null, sh = eq.off && !(d && d.twoH) ? G.def(eq.off) : null;
    box.appendChild(h('div', 'sub', d ? (d.ranged ? `${d.name}: pierce ${d.dmg}, ${d.xbow ? 'spanned in ' + d.recover : 'drawn in ' + d.windup}s` : `${d.name}: ${d.type} ${d.dmg}, reach ${(d.reach * G.RS / 16).toFixed(1)} m, a blow every ${(d.windup + d.strike + d.recover).toFixed(2)}s`) + (wi.dur != null && wi.dur < .35 ? ' — notched and dull' : '') : 'Bare hands: blunt 6, and a short reach'));
    if (sh) box.appendChild(h('div', 'sub', `${sh.name}: guard cost ×${sh.block}` + (sh.arrows ? ', stops arrows' : '')));
    const hd = eq.head && G.def(eq.head); if (hd && hd.closed) box.appendChild(h('div', 'sub warn', 'A closed helm: you see through a slit and hear less.'));
    return box;
  }
  U.charPanel = function (root) {
    root.innerHTML = ''; const m = G.me; U.fresh();
    root.appendChild(h('h2', null, m.gleaner ? 'The gleaner' : 'Yourself'));
    const sl = h('div', 'slots'); for (const n of G.SLOTS) sl.appendChild(slotEl(n)); root.appendChild(sl);
    const w = G.weight(), lim = 14 + (m === G.save ? G.skillLvl('might') : 0);
    // the load, as a bar: free to the first mark, slower beyond it, and at the end of the bar you can barely move
    const pace = Math.round(G.clamp(1 - Math.max(0, w - lim) / 70, .6, 1) * 100), lb = h('div', 'loadbar'), fill = h('i'), mk = h('b');
    fill.style.width = Math.min(100, w / (lim + 28) * 100) + '%'; fill.className = w > lim + 28 ? 'red' : w > lim ? 'amber' : ''; mk.style.left = lim / (lim + 28) * 100 + '%'; lb.appendChild(fill); lb.appendChild(mk);
    root.appendChild(h('div', 'sub', `Load ${w.toFixed(1)} lb` + (w > lim + 28 ? ' — heavily burdened' : w > lim ? ' — burdened' : '') + ` · pace ${pace}%`)); root.appendChild(lb);
    root.appendChild(sheet(m));
    const two = h('div', 'two'), a = h('div'), b = h('div');
    a.appendChild(h('h3', null, 'Hands')); a.appendChild(gridEl(m.pockets));
    if (m.pouch.w * m.pouch.h) { b.appendChild(h('h3', null, 'Hidden pouch')); b.appendChild(gridEl(m.pouch)); }
    two.appendChild(a); two.appendChild(b); root.appendChild(two);
    if (m.eq.belt) { root.appendChild(h('h3', null, G.def(m.eq.belt).name)); root.appendChild(gridEl(m.eq.belt.c)); }
    if (m.eq.pack) { root.appendChild(h('h3', null, G.def(m.eq.pack).name)); root.appendChild(gridEl(m.eq.pack.c)); }
    if (U.openCase) {      // a key ring opened with right-click
      const hd = h('h3', null, G.def(U.openCase).name + ' '), x = h('button', 'small', 'Close'); x.onclick = () => { U.openCase = null; changed(); }; hd.appendChild(x);
      root.appendChild(hd); root.appendChild(gridEl(U.openCase.c));
    }
  };

  // ------------------------------------------------------------------ moving items
  const takeFrom = U.takeFrom = function (loc, it) { if (loc.slot) G.me.eq[loc.slot] = null; else G.inv.remove(loc.c, it); if (it === U.openCase) U.openCase = null; };
  const mine = loc => !!loc.slot || G.carried().includes(loc.c);
  function moveTo(it, from, to) {
    const eq = G.me.eq, d = G.def(it);
    if (to.slot) {
      if (!G.canEquip(it, to.slot)) { toast('That does not go there.'); return false; }
      const cur = eq[to.slot]; if (cur === it) return false;
      if (from.slot) { if (cur && !G.canEquip(cur, from.slot)) return false; eq[from.slot] = cur || null; eq[to.slot] = it; return true; }
      const ent = from.c.items.find(o => o.it === it); G.inv.remove(from.c, it);
      if (cur && !(cur.c !== from.c && G.inv.add(from.c, cur)) && !(cur.c !== from.c && G.carryAdd(cur))) { from.c.items.push(ent); toast('No room to swap.'); return false; }
      it.r = undefined; eq[to.slot] = it; return true;
    }
    const c = to.c; if (it.c === c) { toast('It cannot hold itself.'); return false; }
    const tgt = G.inv.at(c, to.px, to.py);
    if (tgt && !tgt.hid && G.canStack(tgt.it, it) && tgt.it.n < d.stack) { const m = Math.min(d.stack - tgt.it.n, it.n); tgt.it.n += m; it.n -= m; if (it.n <= 0) takeFrom(from, it); return true; }
    if (!G.inv.fits(c, it, to.x, to.y, it, to.rot)) return false;
    it.r = to.rot || undefined;
    if (!from.slot && from.c === c) { const ent = c.items.find(o => o.it === it); ent.x = to.x; ent.y = to.y; return true; }
    takeFrom(from, it); c.items.push({ it, x: to.x, y: to.y }); return true;
  }
  function quick(it, loc) {
    const other = inRaid() ? (loot ? loot.c : null) : G.save.stash;
    if (mine(loc)) { if (!other) return; if (G.inv.add(other, it)) takeFrom(loc, it); else toast('No room.'); }
    else { const slot = G.slotFor(it); if (slot) { takeFrom(loc, it); it.r = undefined; G.me.eq[slot] = it; } else if (G.carryAdd(it)) takeFrom(loc, it); else toast('You cannot carry that.'); }
    changed();
  }
  const changed = U.changed = function () { G.sfx('ui'); if (inRaid()) { G.raid.gearChanged(); renderRaid(); if (lootOn && loot) G.raid.lootChanged(loot); } else { G.persist(); G.ui.menu(); } };

  // ------------------------------------------------------------------ searching and looting in the ruins
  function renderRaid() {
    if (!lootOn) return;
    U.charPanel($('rChar')); const r = $('rLoot'); r.innerHTML = '';
    // with no keyboard there must be a way to put the pack away again
    if (!loot) { r.appendChild(h('h2', null, 'Nothing within reach')); r.appendChild(h('div', 'sub', 'Stand over a body or a chest and press F to search it. The world does not wait while you rummage. R turns a thing you are dragging; right-click to use or drop.')); return; }
    r.appendChild(h('h2', null, loot.name));
    const hid = loot.c.items.filter(o => o.hid).length;
    if (hid) r.appendChild(h('div', 'sub searching', 'Searching…'));
    else if (loot.c.items.length) { const ta = h('button', 'small', 'Take all  [R]'); ta.onclick = takeAll; r.appendChild(ta); }
    r.appendChild(gridEl(loot.c)); if (!loot.c.items.length) r.appendChild(h('div', 'sub', 'Empty.'));
  }
  function search() {
    clearTimeout(searchT); if (!lootOn || !loot) return;
    const next = loot.c.items.find(o => o.hid); if (!next) { loot.searched = true; return; }
    searchT = setTimeout(() => { if (!lootOn || !loot || !G.raid.active()) return; next.hid = false; G.sfx('find'); G.raid.found(1); renderRaid(); search(); }, (loot.searched ? 120 : 700) * G.raid.searchTime());
  }
  function openLoot(l) { loot = l; lootOn = true; $('raidinv').classList.remove('hidden'); G.raid.setUI(true); renderRaid(); search(); }
  function closeLoot() { if (!lootOn) return; clearTimeout(searchT); if (loot && inRaid()) G.raid.lootClosed(loot); lootOn = false; loot = null; drag = null; $('ghost').classList.add('hidden'); hideCtx(); $('tip').classList.add('hidden'); $('raidinv').classList.add('hidden'); G.raid.setUI(false); }
  function takeAll() {
    if (!lootOn || !loot) return; let left = 0;
    for (const o of loot.c.items.slice()) { if (o.hid) continue; const slot = G.def(o.it).cat === 'pack' || G.def(o.it).cat === 'belt' ? G.slotFor(o.it) : null; if (slot) { G.inv.remove(loot.c, o.it); G.me.eq[slot] = o.it; } else if (G.carryAdd(o.it)) G.inv.remove(loot.c, o.it); else left++; }
    if (left) toast(`No room for ${left} thing${left > 1 ? 's' : ''}.`); changed();
  }
  function rotateDrag() { if (!drag || !drag.on) return false; const d = G.def(drag.it); if (d.w === d.h) return true; drag.rot = !drag.rot; ghost(); return true; }
  function ghost() { const g = $('ghost'), d = G.def(drag.it), w = drag.rot ? d.h : d.w, hh = drag.rot ? d.w : d.h; g.style.width = w * CELL + 'px'; g.style.height = hh * CELL + 'px'; g.style.backgroundImage = `url(${icon(d, drag.rot)})`; drag.ox = Math.min(drag.ox, w * CELL - 4); drag.oy = Math.min(drag.oy, hh * CELL - 4); }

  // ------------------------------------------------------------------ tooltip, context menu, toast
  const pct = v => Math.round(v * 100) + '%';
  function tipText(it) {
    const d = G.def(it), tier = d.value >= 200 ? 'rich' : d.value >= 60 ? 'fine' : '', L = [`<b class="${tier}">${d.name}</b> <span class="kind">${KIND[d.cat] || (d.quest ? 'Asked for' : 'Goods')}</span>`];
    if (d.cat === 'weapon') {
      const sk = G.SKILLS[d.skill] ? G.SKILLS[d.skill].name : '';
      L.push(d.ranged ? `Pierce ${d.dmg} · ${d.xbow ? 'spans in ' + d.recover + 's' : 'drawn in ' + d.windup + 's'} · shoots ${d.ammo === 'bolt' ? 'quarrels' : 'arrows'}` : `${G.cap(d.type)} ${d.dmg} · reach ${(d.reach * G.RS / 16).toFixed(1)} m · a blow every ${(d.windup + d.strike + d.recover).toFixed(2)}s`);
      L.push(`${sk} · stamina ${d.stam}` + (d.twoH ? ' · two-handed' : '') + (d.arc < .9 && !d.ranged ? ' · thrust' : '') + (d.pen ? ` · ignores ${pct(d.pen)} of armour` : '') + (d.block && !d.ranged ? ` · guard cost ×${d.block}` : ''));
    }
    if (d.cat === 'ammo') L.push(`Damage ×${d.admg} · ignores ${pct(d.apen)} of armour · bleeding ×${d.ableed}`);
    if (d.cat === 'shield') L.push(`Guard cost ×${d.block}` + (d.arrows ? ' · stops arrows' : ' · does not stop arrows'));
    if (d.prot) { L.push(`Armour class ${d.cls} · covers ${d.cat === 'head' ? 'the head' : d.cat === 'legs' ? 'the legs' : d.arms ? 'chest, belly and arms' : 'chest and belly'}`); L.push(`Stops cut ${pct(d.prot.cut)} · pierce ${pct(d.prot.pierce)} · blunt ${pct(d.prot.blunt)}`); if (d.closed) L.push('Closed helm: you see through a slit and hear less.'); }
    if (d.cw) L.push(`Holds ${d.cw}×${d.ch}` + (d.only ? ' of keys' : '') + (it.c && it.c.items.length ? `: ${it.c.items.map(o => G.def(o.it).name).join(', ')}` : ''));
    if (it.t != null && G.LETTERS[it.t]) L.push(`It reads: “${G.LETTERS[it.t]}”`);
    if (d.id === 'writ') L.push('It reads: “By this writ Garran, Duke, grants to Aldric called the Flayer the castle and March of Ashenmere, to hold by any means until the host returns.”');
    if (d.cat === 'key') L.push('Keys are not used up. If you die carrying one outside the hidden pouch, it is gone.');
    if (it.dur != null) L.push(`Condition ${pct(it.dur)}`);
    if (d.cat === 'food') L.push([d.energy ? `Food ${d.energy > 0 ? '+' : ''}${d.energy}` : '', d.hydr ? `Water ${d.hydr > 0 ? '+' : ''}${d.hydr}` : '', d.food ? `${d.food} larder portion${d.food > 1 ? 's' : ''}` : ''].filter(Boolean).join(' · '));
    if (d.pool) L.push(d.fx && d.fx.heal ? `${it.u} of ${d.pool} health left in the pot` : `${it.u} of ${d.pool} uses left`);
    if (d.use) L.push(`Takes ${d.use}s` + (d.key ? ` · key ${d.key}` : ''));
    const vs = versus(it); if (vs) L.push(`<span class="vs">${vs}</span>`);
    if (it.fir) L.push('<span class="firT">Found in the ruins</span>'); if (it.ins) L.push('<span class="insT">Insured with the brothers</span>');
    if (d.desc) L.push(`<i>${d.desc}</i>`);
    for (const u of usesOf(d.id)) L.push(`<span class="use">${u}</span>`);
    const best = d.id === 'coin' ? null : G.bestSell(it);
    L.push(`<span class="sub">${d.id === 'coin' ? '' : `Worth ~${Math.round(G.itemValue(it))} s · `}${G.itemWeight(it).toFixed(1)} lb${best ? ` · ${G.TRADERS[best.tid].name} gives ${best.price}` : ''}</span>`);
    return L.join('<br>');
  }
  const hideCtx = U.hideCtx = () => $('ctx').classList.add('hidden');
  // the menu of what can be done with a thing, on a right-click
  function showCtx(e, it, loc) {
    const m = $('ctx'), d = G.def(it), raid = inRaid(); m.innerHTML = '';
    const opt = (label, fn) => { const b = h('div', 'opt', label); b.onmousedown = ev => { ev.stopPropagation(); hideCtx(); fn(); }; m.appendChild(b); };
    if (d.cat === 'case') opt('Open', () => { U.openCase = it; changed(); });
    if (raid && (d.cat === 'med' || d.cat === 'food' || d.id === 'whetstone') && mine(loc) && !loc.slot) opt('Use', () => { if (G.raid.useItem(it, loc.c)) closeLoot(); });
    // a whetstone works at home as well as in the field, wherever it lies (stash or pack): on the weapon in your hand if that is dull, else on the dullest edge you own
    if (!raid && d.id === 'whetstone') {
      const s = G.save, dull = w => w && w.dur != null && w.dur < .97 && I[w.id].cat === 'weapon' && !I[w.id].ranged, all = [...s.stash.items.map(o => o.it), ...G.allCarried(true)].filter(dull).sort((p, q) => p.dur - q.dur), tg = dull(s.eq.weapon) ? s.eq.weapon : all[0];
      opt(tg ? `Sharpen the ${I[tg.id].name.toLowerCase()} (${Math.round(tg.dur * 100)}%)` : 'Nothing needs sharpening', () => { if (!tg) return; tg.dur = Math.min(1, tg.dur + .3); it.u = (it.u == null ? d.pool : it.u) - 1; if (it.u <= 0) takeFrom(loc, it); G.sfx('whet', .7); toast(`The edge comes back: ${I[tg.id].name}, ${Math.round(tg.dur * 100)}%.`); G.persist(); changed(); });
    }
    // Patching: cloth, quilted and leather armour can be stitched up at home with linen scraps or cured hide, before
    // Osric has a bench at all. It will never be as good as his work (no further than 80%), and a needle and awl makes
    // each patch go twice as far. Mail, plate and shields are smith's work.
    if (!raid && it.dur != null && /^(head|body|legs)$/.test(d.cat || '') && !/mail|plate|brigandine|helm|bascinet/.test(it.id)) {
      const s = G.save, find = id => { const o = s.stash.items.find(o => o.it.id === id); if (o) return { it: o.it, c: s.stash }; return G.findCarried(x => x.id === id); };
      const mat = find(it.id === 'leather_jack' ? 'leather' : 'cloth') || find('cloth') || find('leather'), needle = !!(find('needle')), gain = needle ? .4 : .2;
      if (it.dur >= .8) opt('Too sound to patch further (Osric could make it new)', () => { });
      else if (!mat) opt('Patching it wants linen scraps or cured hide', () => { });
      else opt(`Patch with ${I[mat.it.id].name.toLowerCase()} (${Math.round(it.dur * 100)}% → ${Math.round(Math.min(.8, it.dur + gain) * 100)}%${needle ? '' : '; a needle and awl would do twice as much'})`, () => { G.useUp(mat.it, mat.c); it.dur = Math.min(.8, it.dur + gain); G.sfx('cloth', .7); toast(`Patched: ${d.name}, ${Math.round(it.dur * 100)}%.`); G.persist(); changed(); });
    }
    if (!raid && d.fx && d.fx.heal) opt('Use on your wounds', () => { if (G.healAtHome(it)) { if (it.u <= 0) takeFrom(loc, it); G.sfx('cloth'); changed(); } else toast('You are not hurt.'); });
    if (!raid && d.food) opt(`Put in the larder (+${(d.food * (it.n || 1) * G.foodMult()).toFixed(1).replace('.0', '')})`, () => { G.storeFood(it); takeFrom(loc, it); changed(); });
    if (!loc.slot) { const s = G.slotFor(it) || G.SLOTS.find(k => G.canEquip(it, k)); if (s) opt('Equip', () => { if (moveTo(it, loc, { slot: s })) changed(); }); }
    else opt('Unequip', () => { if (G.carryAdd(it) || (!raid && G.inv.add(G.save.stash, it))) { G.me.eq[loc.slot] = null; changed(); } else toast('No room.'); });
    // the same move a double-click makes: to the stash or the thing being searched if it is yours, into your own kit if it is not
    if (mine(loc)) { if (!raid) opt('Put in the stash', () => quick(it, loc)); else if (loot) opt(`Leave in the ${loot.name[0].toLowerCase() + loot.name.slice(1)}`, () => quick(it, loc)); } else opt(raid ? 'Take' : 'Take with you', () => quick(it, loc));
    if (!loc.slot && d.w !== d.h) opt('Turn', () => { const ent = loc.c.items.find(o => o.it === it); if (ent && G.inv.fits(loc.c, it, ent.x, ent.y, it, !it.r)) { it.r = !it.r || undefined; changed(); } else toast('No room to turn it there.'); });
    if (it.n > 1 && !loc.slot) opt('Split the stack', () => { const half = Math.floor(it.n / 2), piece = Object.assign({}, it, { n: half }); it.n -= half; const s = G.inv.spot(loc.c, piece); if (s) { piece.r = s.r || undefined; loc.c.items.push({ it: piece, x: s.x, y: s.y }); } else it.n += half; changed(); });
    if (!raid) {
      const best = G.bestSell(it);
      if (best && !(it.c && it.c.items.length)) opt(`Sell to ${G.TRADERS[best.tid].name} for ${best.price} silver`, () => { G.sellTo(best.tid, it); takeFrom(loc, it); G.sfx('coin'); changed(); });
      opt('Discard', () => { takeFrom(loc, it); changed(); });
    } else if (mine(loc)) opt('Drop', () => { if (G.raid.dropItem(it)) { takeFrom(loc, it); changed(); } });
    m.style.left = '0px'; m.style.top = '0px'; m.classList.remove('hidden');
    const r = m.getBoundingClientRect(); m.style.left = Math.max(4, Math.min(innerWidth - r.width - 4, e.clientX)) + 'px'; m.style.top = Math.max(4, Math.min(innerHeight - r.height - 4, e.clientY)) + 'px';
  }
  const toast = U.toast = function (t) { const e = $('toast'); e.textContent = t; e.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => e.classList.remove('on'), 2600); };

  U.initInv = function () {
    const startDrag = (el, x, y) => { const r = el.getBoundingClientRect(), fit = el.classList.contains('fit'); return { it: el._it, loc: el._loc, sx: x, sy: y, ox: fit ? CELL / 2 : x - r.left, oy: fit ? CELL / 2 : y - r.top, on: false, el, rot: fit ? false : !!el._it.r }; };
    const moveGhost = (x, y) => { const g = $('ghost'); drag.mx = x; drag.my = y; g.style.left = x - drag.ox + 'px'; g.style.top = y - drag.oy + 'px'; };
    // let go of what is being dragged at a point on the screen
    const dropAt = (dr, x, y) => {
      const t = document.elementFromPoint(x, y), g = t && t.closest('.grid'), s = t && t.closest('.slot'), box = t && t.closest('[data-drop]');
      let ok = false;
      if (g) { const r = g.getBoundingClientRect(); ok = moveTo(dr.it, dr.loc, { c: g._c, x: Math.round((x - dr.ox - r.left) / CELL), y: Math.round((y - dr.oy - r.top) / CELL), px: Math.floor((x - r.left) / CELL), py: Math.floor((y - r.top) / CELL), rot: dr.rot }); }
      else if (s) ok = moveTo(dr.it, dr.loc, { slot: s._slot });
      else if (box && G.ui.dropOn) ok = G.ui.dropOn(box.dataset.drop, dr.it, dr.loc);
      if (ok) changed(); else dr.el.style.opacity = 1;
    };
    document.addEventListener('mousedown', e => {
      if (!e.target.closest('#ctx')) hideCtx();
      const el = e.target.closest('.item'); if (!el || e.button !== 0 || el._buy || !el._it) return;
      e.preventDefault();
      if (e.ctrlKey || e.shiftKey) return quick(el._it, el._loc);
      drag = startDrag(el, e.clientX, e.clientY);
    });
    document.addEventListener('mousemove', e => {
      const tip = $('tip');
      if (drag) {
        tip.classList.add('hidden');
        if (!drag.on && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 5) { drag.on = true; ghost(); $('ghost').classList.remove('hidden'); drag.el.style.opacity = .25; }
        if (drag.on) moveGhost(e.clientX, e.clientY);
        return;
      }
      const el = e.target.closest && e.target.closest('.item');
      if (el && el._it) { tip.innerHTML = tipText(el._it); tip.classList.remove('hidden'); tip.style.left = Math.min(innerWidth - 300, e.clientX + 16) + 'px'; tip.style.top = Math.max(4, Math.min(innerHeight - tip.offsetHeight - 8, e.clientY + 14)) + 'px'; } else tip.classList.add('hidden');
    });
    document.addEventListener('mouseup', e => {
      if (!drag) return; const dr = drag; drag = null; $('ghost').classList.add('hidden');
      if (dr.on) dropAt(dr, e.clientX, e.clientY);
    });
    document.addEventListener('dblclick', e => { const el = e.target.closest('.item'); if (el && !el._buy && el._it) quick(el._it, el._loc); });
    document.addEventListener('contextmenu', e => { const el = e.target.closest('.item'); if (el && !el._buy && el._it) { e.preventDefault(); showCtx(e, el._it, el._loc); } });
    addEventListener('keydown', e => { if (e.code === 'KeyR' && !inRaid() && rotateDrag()) e.preventDefault(); });
  };
  U.loot = { openLoot, closeLoot, takeAll, lootOpen: () => lootOn, lootTarget: () => loot, refresh: () => { if (inRaid()) renderRaid(); }, rKey: () => { if (!rotateDrag()) takeAll(); }, reset() { clearTimeout(searchT); lootOn = false; loot = null; } };
})();
