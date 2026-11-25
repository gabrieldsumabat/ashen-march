'use strict';
// Interface, part 2: the Hollow (character, stash, traders, shelter, tasks, skills, journal),
// the briefing before you go up, the reckoning when you come back, the title and the pause screen.
(function () {
  const U = G.U, h = U.h, $ = U.$, toast = U.toast, I = G.ITEMS;
  let tab = 'traders', trader = 'maud', pickMap = 'dunmere', pickStart = null, sift = 'all';
  const SIFT = {
    arms: d => d.cat === 'weapon' || d.cat === 'ammo' || d.cat === 'shield', armour: d => !!d.prot, physic: d => d.cat === 'med', food: d => d.cat === 'food',
    goods: d => !['weapon', 'ammo', 'shield', 'med', 'food', 'belt', 'pack', 'key', 'case'].includes(d.cat) && !d.prot, wanted: d => U.wanted().has(d.id)
  };
  const btn = (label, fn, off, cls) => { const b = h('button', cls || 'small', label); b.disabled = !!off; b.onclick = () => { fn(); }; return b; };
  const act = fn => () => { fn(); G.sfx('ui'); menu(); };
  const bar = (v, max, cls) => { const o = h('div', 'bar ' + (cls || '')), i = h('i'); i.style.width = Math.round(G.clamp(v / max, 0, 1) * 100) + '%'; o.appendChild(i); return o; };

  // ------------------------------------------------------------------ the Hollow
  function menu() {
    const s = G.save;
    for (const id of ['result', 'raidinv', 'brief', 'title']) $(id).classList.add('hidden'); $('menu').classList.remove('hidden');
    G.amb({ hollow: 1, shelter: 1, fire: .8, wind: .25 });      // the Hollow: a hearth, the wind kept outside, and now and then somebody's lute
    if (!s.eq.weapon && !s.eq.side && !s.stash.items.some(o => G.def(o.it).cat === 'weapon') && s.coin < 40) {
      G.inv.add(s.stash, G.mk('rusty_knife')); G.inv.add(s.stash, G.mk('bandage', 1)); G.inv.add(s.stash, G.mk('salve')); s.note = (s.note ? s.note + ' ' : '') + 'Maud leaves a knife, a strip of linen and a pot of salve on your pallet. "Last time," she says.'; G.persist();
    }
    const days = Math.floor(s.larder / 2);
    $('coin').innerHTML = `<span>Day ${s.day}</span><span>Level ${s.level} <small>${s.xp}/${G.xpNeed(s.level)}</small></span><span class="${days < 2 ? 'warn' : ''}">Larder ${Math.floor(s.larder)} <small>(${days} day${days === 1 ? '' : 's'})</small></span><span>${s.coin} silver</span>`;
    const cc = $('colChar'); U.charPanel(cc); charExtras(cc);
    const st = $('colStash'); st.innerHTML = '';
    const hd = h('h2', null, 'Stash '); hd.appendChild(btn('Tidy', act(() => G.inv.tidy(s.stash)))); st.appendChild(hd);
    // show one kind of thing at a time: the rest stay where they are, but dimmed
    const chips = h('div', 'chips'), worth = s.stash.items.reduce((v, o) => v + G.itemValue(o.it), 0);
    for (const [k, n] of [['all', 'All'], ['arms', 'Arms'], ['armour', 'Armour'], ['physic', 'Physic'], ['food', 'Food'], ['goods', 'Goods'], ['wanted', 'Wanted']]) { const b = h('button', 'chip' + (sift === k ? ' on' : ''), n); b.onclick = () => { sift = k; G.sfx('ui'); menu(); }; chips.appendChild(b); }
    chips.appendChild(h('span', 'sub', `${s.stash.items.length} things · about ${Math.round(worth)} silver`)); st.appendChild(chips);
    const sg = U.gridEl(s.stash); if (sift !== 'all') for (const e of sg.children) if (e._it && !SIFT[sift](G.def(e._it))) e.classList.add('dim');
    const wrap = h('div', 'scroll'); wrap.appendChild(sg);
    if (s.overflow.items.length) { wrap.appendChild(h('h3', null, 'The cart at the trapdoor')); wrap.appendChild(h('div', 'sub', 'There was no room on the shelves for these. They will wait here.')); wrap.appendChild(U.gridEl(s.overflow)); }
    st.appendChild(wrap);
    const r = $('colRight'); r.innerHTML = '';
    const tabs = h('div', 'tabs'), ready = G.allTasks().filter(t => G.taskState(t) === 'ready').length;
    for (const [k, n] of [['traders', 'Trade'], ['shelter', 'Shelter'], ['tasks', 'Tasks' + (ready ? ` (${ready})` : '')], ['skills', 'Skills'], ['journal', 'Journal']]) { const b = h('button', tab === k ? 'on' : '', n); b.onclick = () => { tab = k; G.sfx('ui'); menu(); }; tabs.appendChild(b); }
    r.appendChild(tabs);
    if (s.note) r.appendChild(h('div', 'note', s.note));
    const body = h('div', 'scroll'); r.appendChild(body);
    ({ traders, shelter, tasks, skills, journal })[tab](body);
    // you came by a friend's link: once you are down in the Hollow, show the way into their party
    if (G.net.want && !G.net.asked) { G.net.asked = true; G.net.panel(); }
  }
  function charExtras(cc) {
    const s = G.save;
    cc.appendChild(h('h3', null, 'Condition'));
    const grid = h('div', 'cond');
    for (const z of G.ZONES) { const row = h('div', 'crow'); row.appendChild(h('span', null, G.cap(G.ZNAME[z]))); row.appendChild(bar(s.hp[z], 1, s.hp[z] < .5 ? 'red' : s.hp[z] < .995 ? 'amber' : 'green')); grid.appendChild(row); }
    for (const [lab, v, cls] of [['Fed', s.energy, 'food'], ['Watered', s.hydr, 'water']]) { const row = h('div', 'crow'); row.appendChild(h('span', null, lab)); row.appendChild(bar(v, 100, v < 30 ? 'red' : cls)); grid.appendChild(row); }
    cc.appendChild(grid);
    const hc = G.healCost(); if (hc) cc.appendChild(btn(`Brother Anselm tends you (${hc} silver)`, act(() => { if (G.healAll()) toast('He works in silence. It hurts, and then it does not.'); }), s.coin < hc));
    if (s.starving) cc.appendChild(h('div', 'sub warn', 'The Hollow did not eat last night.'));
    cc.appendChild(h('h3', null, 'Kit'));
    const loose = [s.pockets, s.eq.belt && s.eq.belt.c, s.eq.pack && s.eq.pack.c].filter(Boolean), nLoose = loose.reduce((n, c) => n + c.items.length, 0);
    cc.appendChild(btn(`Unload hands, belt and pack into the stash (${nLoose})`, act(() => { for (const c of loose) for (const o of c.items.slice()) if (G.inv.add(s.stash, o.it) || G.inv.add(s.overflow, o.it)) G.inv.remove(c, o.it); G.sfx('cloth'); }), !nLoose));
    const kr = h('div', 'btnrow');
    kr.appendChild(btn('Remember this kit', act(() => { G.saveKit(); toast('Kit remembered.'); })));
    kr.appendChild(btn('Take up remembered kit', act(() => { const m = G.applyKit(); G.sfx('cloth'); toast(m ? `${m} piece${m > 1 ? 's' : ''} of your kit are not in the stash.` : 'Kitted out.'); }), !s.kit));
    cc.appendChild(kr);
  }

  // ------------------------------------------------------------------ trade
  function sellJunk() {
    const s = G.save, keep = new Set(); for (const t of G.openTasks()) for (const o of t.objs) if (o.k === 'hand') keep.add(o.id);
    return s.stash.items.filter(o => { const d = G.def(o.it); return d.cat === 'loot' && !d.quest && !keep.has(d.id) && G.bestSell(o.it); });
  }
  function traders(body) {
    const s = G.save, open = Object.keys(G.TRADERS).filter(G.traderOpen); if (!open.includes(trader)) trader = open[0];
    const tb = h('div', 'tabs sub2'); for (const tid of open) { const b = h('button', trader === tid ? 'on' : '', `${G.TRADERS[tid].name} · ${'I'.repeat(G.loyalty(tid)).replace('IIII', 'IV')}`); b.onclick = () => { trader = tid; G.sfx('ui'); menu(); }; tb.appendChild(b); }
    body.appendChild(tb);
    const T = G.TRADERS[trader], ll = G.loyalty(trader), nx = G.LLREQ[ll];
    body.appendChild(h('p', 'jline', `${T.name}, ${T.title}. ${T.blurb}`));
    body.appendChild(h('div', 'sub', `Standing ${ll} of 4.` + (nx ? ` For the next: level ${nx.lvl} (you are ${s.level}), regard ${Math.round((s.rep[trader] || 0) * 100)}/${Math.round(nx.rep * 100)} from tasks, ${Math.round(s.spent[trader] || 0)}/${nx.spent} silver traded.` : ' There is nothing they would not sell you.')));
    if (trader === 'osric') {
      const row = h('div', 'btnrow'), ca = G.mendCost('armour'), cw = G.mendCost('weapon');
      row.appendChild(btn(s.up.bench < 1 ? 'Mending armour needs his bench built' : ca ? `Mend all armour and shields (${ca} silver)` : 'Armour is sound', act(() => { if (G.mend('armour')) toast('Mended.'); }), s.up.bench < 1 || !ca || s.coin < ca));
      row.appendChild(btn(s.up.bench < 3 ? 'Re-edging weapons needs a working forge' : cw ? `Re-edge all weapons (${cw} silver)` : 'Edges are good', act(() => { if (G.mend('weapon')) toast('Sharp again.'); }), s.up.bench < 3 || !cw || s.coin < cw));
      body.appendChild(row);
    }
    if (trader === 'anselm') { const hc = G.healCost(); body.appendChild(btn(hc ? `Have your wounds tended (${hc} silver)` : 'You are whole', act(() => { if (G.healAll()) toast('He works in silence.'); }), !hc || s.coin < hc)); body.appendChild(h('div', 'sub', 'Insurance is bought as you set out: his brothers go out by night for what you dropped. More comes back from Dunmere than from the Hold.')); }
    const sb = h('div', 'sellbox', `Drag things here to sell them to ${T.name}`); sb.dataset.drop = 'sell:' + trader; body.appendChild(sb);
    const junk = sellJunk(), jv = junk.reduce((n, o) => n + G.bestSell(o.it).price, 0);
    body.appendChild(btn(`Sell all valuables, each to whoever pays most (${jv} silver)`, act(() => { for (const o of junk) { const b = G.bestSell(o.it); G.sellTo(b.tid, o.it); G.inv.remove(s.stash, o.it); } G.sfx('coin'); G.persist(); }), !jv));
    body.appendChild(h('div', 'sub', 'That never sells building stuff, food, tools, keys, gear, or anything someone has asked you for. ' + 'Right-click any item to sell it to the best buyer.'));
    for (let L = 1; L <= 4; L++) {
      const rows = T.stock.map((e, i) => [e, i]).filter(p => p[0][1] === L); if (!rows.length) continue;
      body.appendChild(h('h3', null, `Standing ${['I', 'II', 'III', 'IV'][L - 1]}` + (L > ll ? ' — not yet' : '')));
      for (const [e, i] of rows) {
        const d = I[e[0]], row = h('div', 'row' + (L > ll ? ' locked' : '')), n = e[2] || 1, leftN = G.stockLeft(trader, i);
        const ic = h('div', 'item mini'); ic.style.backgroundImage = `url(${U.icon(d)})`; ic._it = G.mk(e[0], n); ic._buy = true; row.appendChild(ic);
        row.appendChild(h('span', 'nm', d.name + (n > 1 ? ' ×' + n : '')));
        if (e[4]) row.appendChild(h('span', 'pr', 'for ' + Object.keys(e[4]).map(id => `${e[4][id]} ${I[id].name} (${G.inv.count(s.stash, id)})`).join(', ')));
        row.appendChild(h('span', 'pr', leftN > 0 ? `${leftN} left` : 'none today'));
        if (L <= ll) row.appendChild(btn(e[4] ? 'Barter' : `${G.buyPrice(trader, e)} s`, () => { const r = G.buy(trader, i); if (r === null) toast('Your stash is full.'); else if (r) { G.sfx('coin'); menu(); } }, !G.canBuy(trader, i)));
        body.appendChild(row);
      }
    }
  }
  function dropOn(kind, it, loc) {
    if (kind === 'larder') { if (!G.storeFood(it)) { toast('That is not food.'); return false; } U.takeFrom(loc, it); return true; }
    const tid = kind.split(':')[1], p = G.sellPrice(tid, it);
    if (it.c && it.c.items.length) { toast('Empty it first.'); return false; }
    if (!p) { toast(`${G.TRADERS[tid].name} does not buy that.`); return false; }
    G.sellTo(tid, it); U.takeFrom(loc, it); G.sfx('coin'); toast(`Sold for ${p} silver.`); return true;
  }

  // ------------------------------------------------------------------ shelter
  function shelter(body) {
    const s = G.save;
    body.appendChild(h('h3', null, 'The larder'));
    body.appendChild(h('p', null, `${Math.floor(s.larder)} portions. The Hollow eats 2 each night${s.larder < 2 ? ' — there is not enough for tonight.' : '.'}` + (s.up.kitchen ? ` Maud's pot makes food go ${s.up.kitchen > 1 ? 'half' : 'a quarter'} as far again.` : '')));
    const foodN = s.stash.items.reduce((n, o) => n + (G.def(o.it).food || 0) * (o.it.n || 1), 0) * G.foodMult();
    const lb = h('div', 'sellbox', 'Drag food here to put it in the larder'); lb.dataset.drop = 'larder'; body.appendChild(lb);
    body.appendChild(btn(`Store all food from the stash (+${Math.round(foodN * 10) / 10})`, act(() => { const n = G.storeAllFood(); toast(`${Math.round(n * 10) / 10} portions put by.`); }), !foodN));
    body.appendChild(h('div', 'sub', 'Food you mean to eat in the ruins should go in your pack, not the larder.'));
    if (s.up.perch) {
      body.appendChild(h('h3', null, 'Wat the foundling'));
      if (s.boy) body.appendChild(h('p', null, `Wat is out at ${G.BOY[s.boy.tier].name}. He will be back by morning, God willing.`));
      else { const row = h('div', 'btnrow'); G.BOY.forEach((b, i) => { if (i < 2 || s.up.perch > 1) row.appendChild(btn(`Send him to ${b.name} (${b.cost} silver)`, act(() => { if (G.sendBoy(i)) toast('He is gone before you finish the sentence.'); }), s.coin < b.cost)); }); body.appendChild(row); body.appendChild(h('div', 'sub', 'He comes back at dawn with whatever he found, or with nothing.')); }
    }
    body.appendChild(h('h3', null, 'Works'));
    for (const key in G.MODULES) {
      const u = G.MODULES[key], lv = s.up[key], nx = u.levels[lv], box = h('div', 'task');
      box.appendChild(h('h3', null, `${u.name} — ${lv ? 'level ' + lv + ' of ' + u.levels.length : 'not built'}`));
      if (nx) { box.appendChild(h('p', null, nx.text)); box.appendChild(h('div', 'sub', 'Needs: ' + G.needText(nx.need, nx.tool))); box.appendChild(btn(lv ? 'Improve' : 'Build', act(() => { if (G.build(key)) toast(`${u.name} ${lv ? 'improved' : 'built'}.`); }), !G.canBuild(key))); }
      else box.appendChild(h('div', 'sub', 'As good as it will get.'));
      body.appendChild(box);
    }
    body.appendChild(h('h3', null, 'Making'));
    if (s.jobs.length) for (const j of s.jobs) { const r = G.RECIPES.find(r => r.id === j.r); body.appendChild(h('div', 'sub', `In hand: ${I[r.out].name}${r.n > 1 ? ' ×' + r.n : ''} — ready on day ${j.day}.`)); }
    let any = false;
    for (const r of G.RECIPES) {
      if (s.up[r.mod] < r.lvl) continue; any = true;
      const row = h('div', 'row'); const ic = h('div', 'item mini'); ic.style.backgroundImage = `url(${U.icon(I[r.out])})`; ic._it = G.mk(r.out, r.n); ic._buy = true; row.appendChild(ic);
      row.appendChild(h('span', 'nm', `${I[r.out].name}${r.n > 1 ? ' ×' + r.n : ''}`)); row.appendChild(h('span', 'pr', G.needText(r.need, r.tool) + (r.nights ? ` · ${r.nights} night${r.nights > 1 ? 's' : ''}` : '')));
      row.appendChild(btn('Make', act(() => { if (G.craft(r)) toast(r.nights ? 'Started. It will be ready in the morning.' : 'Made.'); }), !G.canCraft(r))); body.appendChild(row);
    }
    if (!any) body.appendChild(h('div', 'sub', 'Nothing can be made yet. Build Osric\'s bench, the herb bed or Maud\'s pot.'));
  }

  // ------------------------------------------------------------------ tasks
  // ---- a task is told in pictures first: what kind of thing is asked, how far along it is, and what it pays
  const GLYPH = {
    kill(g) { g.beginPath(); g.arc(18, 15, 9, 0, 7); g.fill(); g.fillRect(13, 21, 10, 7); g.fillStyle = '#1a1612'; g.beginPath(); g.arc(14.5, 15, 2.6, 0, 7); g.arc(21.5, 15, 2.6, 0, 7); g.fill(); g.fillRect(15.5, 24, 1.4, 4); g.fillRect(19, 24, 1.4, 4); },
    free(g) { g.lineWidth = 3; g.beginPath(); g.arc(11, 18, 6, .6, 5.7); g.stroke(); g.beginPath(); g.arc(25, 18, 6, 3.7, 8.8); g.stroke(); g.lineWidth = 2; for (const a of [-.9, 0, .9]) { g.beginPath(); g.moveTo(18 + Math.sin(a) * 3, 13); g.lineTo(18 + Math.sin(a) * 8, 5); g.stroke(); } },
    build(g) { g.save(); g.translate(18, 18); g.rotate(-.7); g.fillRect(-2, -6, 4, 20); g.fillRect(-9, -12, 18, 8); g.restore(); },
    day(g) { g.beginPath(); g.arc(18, 18, 6.5, 0, 7); g.fill(); g.lineWidth = 2.4; for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; g.beginPath(); g.moveTo(18 + Math.cos(a) * 10, 18 + Math.sin(a) * 10); g.lineTo(18 + Math.cos(a) * 14.5, 18 + Math.sin(a) * 14.5); g.stroke(); } },
    extract(g) { g.lineWidth = 3; g.strokeRect(6, 6, 14, 24); g.beginPath(); g.moveTo(14, 18); g.lineTo(31, 18); g.moveTo(25, 12); g.lineTo(31, 18); g.lineTo(25, 24); g.stroke(); },
    visit(g) { g.beginPath(); g.arc(18, 13, 8, Math.PI, 0); g.lineTo(18, 32); g.closePath(); g.fill(); g.fillStyle = '#1a1612'; g.beginPath(); g.arc(18, 13, 3.2, 0, 7); g.fill(); },
    larder(g) { g.beginPath(); g.ellipse(18, 20, 13, 8, 0, 0, 7); g.fill(); g.strokeStyle = '#1a1612'; g.lineWidth = 1.6; for (const x of [12, 18, 24]) { g.beginPath(); g.moveTo(x - 2, 15); g.lineTo(x + 2, 22); g.stroke(); } },
    survive(g) { g.beginPath(); g.moveTo(18, 30); g.bezierCurveTo(2, 18, 8, 5, 18, 12); g.bezierCurveTo(28, 5, 34, 18, 18, 30); g.fill(); },
    coin(g) { g.beginPath(); g.arc(18, 18, 11, 0, 7); g.fill(); g.strokeStyle = '#1a1612'; g.lineWidth = 1.6; g.beginPath(); g.arc(18, 18, 7, 0, 7); g.stroke(); },
    xp(g) { g.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 5.5 : 13; g.lineTo(18 + Math.cos(a) * r, 18 + Math.sin(a) * r); } g.closePath(); g.fill(); },
    pouch(g) { g.beginPath(); g.moveTo(11, 12); g.lineTo(25, 12); g.bezierCurveTo(34, 22, 30, 31, 18, 31); g.bezierCurveTo(6, 31, 2, 22, 11, 12); g.fill(); g.fillRect(12, 7, 12, 4); }
  };
  const glyph = (k, col, size) => { const c = document.createElement('canvas'), n = size || 36; c.width = c.height = 36; c.style.width = c.style.height = n + 'px'; c.style.flex = 'none'; const g = c.getContext('2d'); g.fillStyle = g.strokeStyle = col || '#d8cfb8'; g.lineCap = 'round'; (GLYPH[k] || GLYPH.visit)(g); const im = document.createElement('img'); im.src = c.toDataURL(); im.style.width = im.style.height = n + 'px'; im.style.flex = 'none'; return im; };      // (as a picture: the page's own rules put every canvas behind the game)
  const pic = (id, n) => { const im = document.createElement('img'); im.src = U.icon(I[id]); im.title = I[id].name; im.style.height = (n || 34) + 'px'; im.style.maxWidth = '70px'; im.style.objectFit = 'contain'; im.style.flex = 'none'; return im; };
  const flexRow = gap => { const e = h('div'); e.style.display = 'flex'; e.style.alignItems = 'center'; e.style.gap = (gap || 8) + 'px'; e.style.margin = '6px 0'; e.style.flexWrap = 'wrap'; return e; };
  // an objective: its picture, then one pip for each thing asked (a bar when there are many), then a few words
  function objRow(t, o, i) {
    const p = G.objProgress(t, i), have = Math.min(p[0], p[1]), ok = p[0] >= p[1], col = ok ? '#a9c088' : '#d8cfb8', row = flexRow(9); row.title = p[2];
    row.appendChild(o.k === 'hand' ? pic(o.id) : glyph(o.k, col));
    if (o.k === 'kill' && o.who) { const E = G.ENEMIES[o.who[0]]; const tag = h('span', null, o.who.length > 2 && E.faction === 'raider' ? 'the Duke\'s men' : E.name + (o.n > 1 && !E.proper ? 's' : '')); tag.style.color = col; row.appendChild(tag); }
    if (p[1] <= 12) { const pips = h('span'); pips.style.display = 'inline-flex'; pips.style.gap = '3px'; for (let k = 0; k < p[1]; k++) { const d = h('span'); d.style.width = d.style.height = '11px'; d.style.borderRadius = '50%'; d.style.border = '1px solid ' + col; d.style.background = k < have ? col : 'transparent'; pips.appendChild(d); } row.appendChild(pips); }
    else { const bar = h('span'), fill = h('span'); bar.style.width = '120px'; bar.style.height = '9px'; bar.style.border = '1px solid ' + col; bar.style.display = 'inline-block'; fill.style.display = 'block'; fill.style.height = '100%'; fill.style.width = Math.round(have / p[1] * 100) + '%'; fill.style.background = col; bar.appendChild(fill); row.appendChild(bar); }
    const num = h('span', null, ok ? '✓' : `${have}/${p[1]}`); num.style.color = col; num.style.fontSize = '14px'; row.appendChild(num);
    if (o.map) { row.appendChild(glyph('visit', '#9a927e', 20)); const m = h('span', 'sub', G.mapName(o.map)); row.appendChild(m); }
    return row;
  }
  function rewardRow(r) {
    const row = flexRow(10), add = (el, txt) => { const w = h('span'); w.style.display = 'inline-flex'; w.style.alignItems = 'center'; w.style.gap = '4px'; w.appendChild(el); if (txt) w.appendChild(h('span', 'sub', txt)); row.appendChild(w); };
    const lab = h('span', 'sub', 'Pays'); row.appendChild(lab);
    if (r.coin) add(glyph('coin', '#c9a653', 24), String(r.coin));
    for (const x of r.items || []) add(pic(x[0], 28), x[1] > 1 ? '×' + x[1] : '');
    if (r.pouch) add(glyph('pouch', '#b9a773', 24), `${r.pouch[0]}×${r.pouch[1]}`);
    if (r.xp) add(glyph('xp', '#8fb07a', 22), String(r.xp));
    return row;
  }
  function tasks(body) {
    const s = G.save, order = { ready: 0, active: 1, locked: 2, done: 3 };
    const taskBox = t => {
      const st = G.taskState(t), box = h('div', 'task' + (st === 'locked' || st === 'done' ? ' done' : st === 'ready' ? ' ready' : ''));
      box.appendChild(h('h3', null, t.name + (st === 'locked' ? ` — ${G.taskLock(t)}` : st === 'done' ? ' — done' : '') + (t.daily ? ` · ${G.TRADERS[t.by].name}` : '')));
      if (st === 'locked' || st === 'done') return box;
      t.objs.forEach((o, i) => box.appendChild(objRow(t, o, i))); box.appendChild(rewardRow(t.reward));
      { const d = document.createElement('details'), sm = document.createElement('summary'); sm.textContent = 'What was said'; sm.className = 'sub'; sm.style.cursor = 'pointer'; d.appendChild(sm); d.appendChild(h('p', null, t.text)); for (let i = 0; i < t.objs.length; i++) d.appendChild(h('div', 'sub', '· ' + G.objProgress(t, i)[2])); box.appendChild(d); }

      box.appendChild(btn(t.objs.some(o => o.k === 'hand') ? 'Hand over' : 'Claim', () => { const res = G.claimTask(t); if (res) { G.sfx('coin'); if (res.up) G.sfx('level'); toast(res.note || `${t.name} — done.`); menu(); } }, st !== 'ready'));
      return box;
    };
    const daily = (s.daily || []).filter(t => G.traderOpen(t.by));
    if (daily.length) { body.appendChild(h('h3', null, 'The day\'s work — gone by morning')); for (const t of daily) body.appendChild(taskBox(t)); }
    for (const tid in G.TRADERS) {
      if (!G.traderOpen(tid)) continue;
      const list = G.TASKS.filter(t => t.by === tid).sort((a, b) => order[G.taskState(a)] - order[G.taskState(b)]), done = list.filter(t => G.taskState(t) === 'done');
      body.appendChild(h('h3', null, `${G.TRADERS[tid].name} — ${done.length} of ${list.length} done`));
      for (const t of list) { if (G.taskState(t) === 'done') continue; body.appendChild(taskBox(t)); }
    }
  }

  // ------------------------------------------------------------------ skills
  function skills(body) {
    const s = G.save;
    body.appendChild(h('h3', null, `Level ${s.level}`)); body.appendChild(bar(s.xp, G.xpNeed(s.level), 'gold')); body.appendChild(h('div', 'sub', `${s.xp} of ${G.xpNeed(s.level)} experience. Kills, searching, ground covered, wounds treated and above all coming out alive. Traders open their better stock by level.`));
    if (s.up.pell) { body.appendChild(h('h3', null, 'At the pell each night')); const row = h('div', 'btnrow'); for (const k of ['blades', 'hafted', 'pole', 'archery', 'guard']) { const b = btn(G.SKILLS[k].name, act(() => { s.pell = k; G.persist(); })); if (s.pell === k) b.classList.add('on'); row.appendChild(b); } body.appendChild(row); }
    body.appendChild(h('h3', null, 'Skills'));
    for (const k in G.SKILLS) {
      const d = G.SKILLS[k], l = G.skillLvl(k), p = s.skills[k] || 0, a = G.skillNeed(l), b = G.skillNeed(l + 1), box = h('div', 'skill');
      box.appendChild(h('b', null, `${d.name} ${l}`)); box.appendChild(bar(l >= 20 ? 1 : p - a, l >= 20 ? 1 : b - a));
      box.appendChild(h('div', 'sub', (l ? d.per(l) + '. ' : '') + d.text)); body.appendChild(box);
    }
  }

  // ------------------------------------------------------------------ journal, settings
  function settingsEl() {
    const o = G.save.opts, box = h('div', 'settings');
    const row = (label, key, min, max, step, fmt, apply) => {
      const r = h('label', 'set'), val = h('span', 'pr', fmt(o[key])), inp = document.createElement('input');
      inp.type = 'range'; inp.min = min; inp.max = max; inp.step = step; inp.value = o[key];
      inp.oninput = () => { o[key] = +inp.value; val.textContent = fmt(o[key]); if (apply) apply(o[key]); G.persist(); };
      r.appendChild(h('span', 'nm', label)); r.appendChild(inp); r.appendChild(val); box.appendChild(r);
    };
    row('Mouse sensitivity', 'sens', .3, 2.5, .05, v => v.toFixed(2) + '×');
    row('Volume', 'vol', 0, 1, .05, v => Math.round(v * 100) + '%', v => G.setVolume(v));
    row('Music', 'mus', 0, 1, .05, v => v ? Math.round(v * 100) + '%' : 'off', v => G.setMusic(v));
    row('Field of view', 'fov', 60, 95, 1, v => v + '°');
    row('Brightness', 'bright', .7, 1.6, .05, v => Math.round(v * 100) + '%');
    const GQ = { high: 'High — everything', medium: 'Medium — no glow or contact shadows, thinner grass', low: 'Low — no shadows, sparse grass' }, q = h('label', 'set'), qb = h('button', 'small', GQ[o.gfx] || GQ.high);
    qb.onclick = () => { o.gfx = o.gfx === 'low' ? 'high' : o.gfx === 'medium' ? 'low' : 'medium'; qb.textContent = GQ[o.gfx]; G.persist(); };
    q.appendChild(h('span', 'nm', 'Graphics')); q.appendChild(qb); q.appendChild(h('span', 'sub', 'from the next time you go up')); box.appendChild(q);
    return box;
  }
  const CONTROLS = ['Mouse — look (arrow keys also turn)', 'W A S D — move · Shift — sprint · C — crouch · Q — throw your sidearm at what you are looking at (a stone, if you carry none) · E or F — use, search, open', 'Left mouse — strike where you are looking: level for the head, lower for the body, down for the legs. Hold to wind up a heavier blow; click again as a blow lands for a faster return cut.', 'Right mouse — guard; raise it just as a blow lands to parry, then strike at once for a quick riposte. Right mouse during your own wind-up feints.', 'Middle mouse, or T — thrust with a sword: less hurt than a cut, but it finds the gaps in mail and plate', 'V — kick: breaks a guard · Space — dodge · X — swap to sidearm · G — throw a stone, to draw men elsewhere', 'F — search, unlock · R — take everything, or turn the thing you are dragging · Tab — pack · M — map · O — ways out', 'H — treat your worst hurt with whatever you carry', '1 bandage · 2 ligature · 3 salve or poultice · 4 splint · 5 surgeon\'s roll · 6 willow or poppy · 7 drink · 8 eat · 9 whetstone', 'Esc — pause, settings', 'In the pack: drag things, R to turn them, double-click or Ctrl-click to move quickly, right-click for more.'];
  function journal(body) {
    const sv = G.save, s = sv.stats, k = Object.entries(s.kills).map(([t, n]) => `${n} ${G.ENEMIES[t].name}${n > 1 && !G.ENEMIES[t].proper ? 's' : ''}`).join(', ') || 'none';
    body.appendChild(h('p', null, `Day ${sv.day} after the sack${sv.ironman ? ' — one life' : ''}. Longest you have lasted: ${Math.max(G.best(), sv.day - 1)} days.`));
    body.appendChild(h('p', 'sub', `Went up ${s.raids} times, came back on your feet ${s.survived}. Gleaners sent: ${s.gleans}. Killed: ${k}.`));
    // the last ventures, newest first
    const hist = (sv.history || []).slice(-10).reverse();
    if (hist.length) {
      body.appendChild(h('h3', null, 'Ventures')); const tb = h('div', 'hist');
      for (const e of hist) {
        const out = e.out === 'extract', row = h('div', 'hrow ' + (out ? 'ok' : 'bad'));
        for (const t of [`Day ${e.day}`, G.mapName(e.map), out ? (e.cut ? 'came down alone' : 'out alive') : e.out === 'dead' ? 'fell' : 'lost to the dark', `${e.min} min`, e.kills ? `${e.kills} killed` : '—', out ? `${e.val >= 0 ? '+' : '−'}${Math.abs(e.val)} s` : '']) row.appendChild(h('span', null, t));
        if (e.with) row.appendChild(h('span', 'with', `with ${e.with}`));
        tb.appendChild(row);
      }
      body.appendChild(tb);
    }
    // how well you know each place
    const known = G.MAPS.map(M => [M, Object.keys((sv.places || {})[M.id] || {}).length, G.mapWorld(M.id).zones.length]).filter(e => e[1]);
    if (known.length) { body.appendChild(h('h3', null, 'Places you know')); for (const [M, n, all] of known) { const row = h('div', 'crow'); row.appendChild(h('span', null, `${M.name} — ${n} of ${all} places`)); row.appendChild(bar(n, all, n >= all ? 'green' : 'amber')); body.appendChild(row); } }
    body.appendChild(h('h3', null, 'Journal'));
    const j = sv.journal.slice(-16).reverse(); let last = -1;
    for (const e of j) { if (e.day !== last) { body.appendChild(h('div', 'jday', `Day ${e.day}`)); last = e.day; } body.appendChild(h('p', 'jline', e.text)); }
    body.appendChild(h('h3', null, 'How to last'));
    for (const l of ['Every venture is a day. Each night the Hollow eats two portions from the larder; if it is empty you go up hungry. You also hunger and thirst in the ruins: carry bread and a waterskin.',
      'There are three places to go: Dunmere, the abbey in the fen, and the Hold. Each is deadlier and richer than the last. You choose where you go in; the ways out depend on it. Some open late, some cost silver, some will not take a pack.',
      'You have seven parts: head, chest, belly, arms, legs. Lose the head or the chest and you are dead. A ruined limb passes its hurt to the rest. Cuts bleed — lightly (bandage) or heavily (ligature); clubs break bones (splint). A surgeon\'s roll brings a ruined limb back.',
      'A blow lands where you are looking. Armour protects only what it covers. Mail stops edges, not hammers; plate stops nearly everything but a hammer, a poleaxe or an estoc.',
      'What you find in the ruins is marked. Some tasks want things found, not bought. Keys open the rooms that hold the best of it; keep them in the hidden pouch.',
      'Wounds come home with you and mend overnight, faster with a hearth. Brother Anselm will tend you for silver, and insure your gear before you go.',
      'Every third day someone else from the Hollow can go up as a gleaner, with whatever they have. Bandits leave gleaners alone. What a gleaner brings back is yours; if they die you lose nothing.',
      'Men who have not seen you die easily. Crouch to move quietly, bushes and reeds hide you, rain covers your steps, and a thrown stone draws them off. Every five days the ruins grow more dangerous.']) body.appendChild(h('p', null, l));
    body.appendChild(h('h3', null, 'Controls')); for (const l of CONTROLS) body.appendChild(h('div', 'sub', l));
    body.appendChild(h('h3', null, 'Settings')); body.appendChild(settingsEl());
    body.appendChild(h('h3', null, 'Keeping your save'));
    body.appendChild(h('p', null, 'Your days are kept in this browser and nowhere else. Download the save to put a copy somewhere safe, or to carry on in another browser or on another machine: load the file there and go on from where you stopped.'));
    if (!G.canStore()) body.appendChild(h('p', 'warn', 'This browser is not keeping anything — a private window, or its storage is blocked. Download your save before you close the tab, or the days are lost.'));
    body.appendChild(h('div', 'sub', sv.kept ? `Last downloaded on day ${sv.kept}.` : 'Never downloaded.'));
    const row = h('div', 'btnrow');
    row.appendChild(btn('Download the save', () => { download(); menu(); }));
    row.appendChild(btn('Load a save file', () => pickFile(ok => { if (ok) menu(); })));
    body.appendChild(row);
    // the same thing as text, for a browser that will not hand over a file
    const ta = document.createElement('textarea'); ta.className = 'savebox'; ta.placeholder = 'Or as text: write the save out here to copy it, or paste one here to read it in.'; ta.spellcheck = false;
    const row2 = h('div', 'btnrow');
    row2.appendChild(btn('Write it out as text', () => { const f = G.saveFile(); if (!f) return; ta.value = f.text; ta.select(); toast('Copy that text and keep it somewhere safe.'); }));
    row2.appendChild(btn('Read in the text', () => offer(ta.value, ok => { if (ok) menu(); })));
    body.appendChild(row2); body.appendChild(ta);
    body.appendChild(btn('Back to the title', () => title()));
  }

  // ------------------------------------------------------------------ keeping the save
  // The save lives in this browser's storage. These write it out as a file and read one back in, so it can be kept
  // safe or carried to another browser without the game needing anywhere of its own to store it.
  function download() {
    if (G.raid.active()) return;
    G.save.kept = G.save.day; G.persist();
    const f = G.saveFile(); if (!f) return;
    const url = URL.createObjectURL(new Blob([f.text], { type: 'application/json' })), a = document.createElement('a');
    a.href = url; a.download = f.name; a.style.display = 'none'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
    G.sfx('ui'); toast(`Written out as ${f.name}. Put it somewhere safe.`);
  }
  // can every screen of the Hollow be drawn from the save now in play?
  function sound() {
    try { const s = G.save, d = () => h('div'); U.charPanel(d()); charExtras(d()); U.gridEl(s.stash); U.gridEl(s.overflow); for (const f of [traders, shelter, tasks, skills, journal]) f(d()); G.weight(); G.carriedValue(); G.insureCost(); return true; } catch (e) { return false; }
  }
  function ask(lines, yes, onYes) {
    const a = $('ask'), box = h('div', 'card'), row = h('div', 'btnrow center'), close = () => { a.classList.add('hidden'); G.sfx('ui'); };
    a.innerHTML = ''; a.classList.remove('hidden'); lines.forEach((l, i) => box.appendChild(h('p', i ? 'sub' : null, l)));
    row.appendChild(btn(yes, () => { close(); onYes(); }, false, 'on')); row.appendChild(btn('Leave it', close, false, ' ')); box.appendChild(row); a.appendChild(box);
  }
  // Offer a save that has been read: say what it holds, ask before it replaces a game under way, and put the old
  // one back if the Hollow cannot be drawn from the new. done(true) is called if it was taken up.
  function offer(text, done) {
    if (G.raid.active()) return;      // not while you are up in the ruins
    const r = G.readSave(text); if (r.error) { G.sfx('ui'); toast(r.error); return; }
    const cur = G.save, say = s => `day ${s.day}, level ${s.level}${s.ironman ? ', one life' : ''}`;
    const take = () => {
      const before = JSON.stringify(cur), stored = G.adoptSave(r);
      if (!sound()) { G.save = G.me = JSON.parse(before); G.persist(); toast('That save is damaged and cannot be played. Yours is as it was.'); if (done) done(false); return; }
      toast(`Taken up: ${say(G.save)}.` + (r.left ? ` ${r.left} thing${r.left > 1 ? 's' : ''} in it could not be kept.` : '') + (stored ? '' : ' This browser is not keeping saves; download it again before you leave.'));
      if (done) done(true);
    };
    if (cur.started) ask([`This file holds ${say(r.save)}.`, `It will take the place of the game in this browser (${say(cur)}). That game will be gone unless you have downloaded it.`], 'Take it up', take); else take();
  }
  function readFile(f, done) {
    if (f.size > 3e6) { toast('That file is far too large to be a save.'); return; }
    const rd = new FileReader(); rd.onload = () => offer(String(rd.result), done); rd.onerror = () => toast('That file could not be read.'); rd.readAsText(f);
  }
  let fileInp = null;
  function pickFile(done) {
    if (!fileInp) { fileInp = document.createElement('input'); fileInp.type = 'file'; fileInp.accept = '.json,application/json,text/plain'; fileInp.style.display = 'none'; document.body.appendChild(fileInp); }
    fileInp.value = ''; fileInp.onchange = () => { const f = fileInp.files && fileInp.files[0]; if (f) readFile(f, done); }; fileInp.click();
  }
  // a save file can also be dropped anywhere on the page. A dropped file is never allowed to replace the page itself:
  // that would end a venture as surely as closing the tab.
  addEventListener('dragover', e => { if (e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files')) e.preventDefault(); });
  addEventListener('drop', e => {
    const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]; if (!f) return; e.preventDefault();
    if (G.raid.active() || !$('result').classList.contains('hidden')) return;
    readFile(f, ok => { if (ok) { if ($('title').classList.contains('hidden')) menu(); else title(); } });
  });

  // ------------------------------------------------------------------ before you go up
  function brief() {
    const b = $('brief'), s = G.save, M = G.mapById(pickMap); b.innerHTML = ''; b.classList.remove('hidden');
    if (!M.starts.some(x => x.id === pickStart)) pickStart = M.starts[0].id;
    const left = h('section'), right = h('section'), cvs = document.createElement('canvas'), sc = 4; cvs.width = M.w * sc + 36; cvs.height = M.h * sc + 36; left.appendChild(cvs);
    const w = G.genWorld({ map: M.id, preview: true, start: pickStart }); G.drawMap(cvs.getContext('2d'), M.id, 18, 18, sc, { start: w.start, exits: w.extracts });
    const mt = h('div', 'tabs'); for (const m of G.MAPS) { const x = h('button', pickMap === m.id ? 'on' : '', `${['I', 'II', 'III'][m.tier - 1]} · ${m.name}`); x.onclick = () => { pickMap = m.id; pickStart = null; G.sfx('ui'); brief(); }; mt.appendChild(x); }
    right.appendChild(mt);
    right.appendChild(h('h2', null, `${M.name} — ${M.sub}`)); right.appendChild(h('p', null, M.blurb));
    right.appendChild(h('div', 'sub' + (M.tier > 1 ? ' warn' : ''), `Danger: ${M.danger} Dark falls after ${M.minutes} minutes.` + (M.tier === 2 && s.level < 5 ? ' You are not ready for this.' : M.tier === 3 && s.level < 10 ? ' This will kill you.' : '')));
    const sky = G.WEATHER[G.dayWeather(M.id, s.day)]; right.appendChild(h('div', 'sub', `The sky there this morning: ${sky.name.toLowerCase()}. ${sky.text}`));
    { const ev = G.EVENTS[G.dayEvent(M.id, s.day)]; if (ev[0]) right.appendChild(h('div', 'sub', `Word from the hills: ${ev[0].toLowerCase()}. ${ev[1]}`)); }
    const been = s.stats.maps[M.id] || 0; if (been) right.appendChild(h('div', 'sub', `You have come out of here alive ${been} time${been > 1 ? 's' : ''}.`));
    right.appendChild(h('h3', null, 'Where you go in'));
    for (const st of M.starts) { const o = h('div', 'choice' + (pickStart === st.id ? ' on' : '')); o.appendChild(h('b', null, st.name)); o.appendChild(h('div', 'sub', st.desc)); o.onclick = () => { pickStart = st.id; G.sfx('ui'); brief(); }; right.appendChild(o); }
    right.appendChild(h('h3', null, 'Ways out')); for (const e of w.extracts) right.appendChild(h('div', 'sub', '· ' + G.exitText(e)));
    right.appendChild(h('h3', null, 'Before you go'));
    const chk = (ok, text) => right.appendChild(h('div', 'chk ' + (ok ? 'ok' : 'warn'), (ok ? '✓ ' : '! ') + text));
    const band = G.countCarried('bandage'), lig = G.countCarried('ligature'), wt = G.weight(), hurt = G.ZONES.filter(z => s.hp[z] < .7), wd = s.eq.weapon && G.def(s.eq.weapon);
    chk(wd, wd ? `${wd.name} in hand` + (s.eq.weapon.dur < .35 ? ' — notched and dull' : '') : 'No weapon in hand — you will be fighting with your fists');
    if (wd && wd.ranged) chk(G.findCarried((it, d) => d.cat === 'ammo' && d.ammo === wd.ammo), `Something to shoot from it`);
    chk(band > 0, band ? `${band} bandage${band > 1 ? 's' : ''}` + (lig ? `, ${lig} ligature${lig > 1 ? 's' : ''}` : ' — no ligature for a heavy bleed') : 'No bandages — a cut will bleed until you die');
    const pot = G.findCarried((it, d) => d.fx && d.fx.heal); chk(pot, pot ? 'Salve or a poultice to mend your hurts' : 'No salve or poultice — nothing to mend a wound with up there');
    chk(s.eq.pack, s.eq.pack ? G.def(s.eq.pack).name + ' to carry things home' : 'No pack — you can bring back only what hangs from your belt');
    chk(wt < 42 + G.skillLvl('might'), `Load ${wt.toFixed(1)} lb` + (wt >= 42 ? ' — heavily burdened, slow and quickly winded' : ''));
    chk(!hurt.length, hurt.length ? 'Still hurt: ' + hurt.map(z => G.ZNAME[z]).join(', ') : 'Sound of limb');
    chk(s.energy > 40 && s.hydr > 40, s.energy > 40 && s.hydr > 40 ? 'Fed and watered' : 'Hungry or parched — carry food and a waterskin');
    chk(s.larder >= 2, `Larder holds ${Math.floor(s.larder)} portions` + (s.larder < 2 ? ' — bring back food or nobody eats tonight' : ''));
    const ic = G.insureCost(); right.appendChild(btn(ic ? `Insure what you carry with the brothers (${ic} silver)` : 'All you carry is insured, or not worth insuring', () => { if (G.insureAll()) { G.sfx('coin'); toast('If you fall, they will go out by night for it.'); brief(); menu(); $('brief').classList.remove('hidden'); } }, !ic || s.coin < ic));
    const open = G.openTasks().slice(0, 5);
    if (open.length) { right.appendChild(h('h3', null, 'Asked of you')); for (const t of open) right.appendChild(h('div', 'sub', `${t.name} — ` + t.objs.map((o, i) => { const p = G.objProgress(t, i); return `${Math.min(p[0], p[1])}/${p[1]}`; }).join(', '))); }
    // with friends (net.js): the one who opened the party leads it up, and those who have said they are ready come too
    const net = G.net, party = net.role, coming = party === 'host' ? net.players.filter(p => p.pid !== 0 && p.ready).length : 0, staying = party === 'host' ? net.players.length - 1 - coming : 0;
    const row = h('div', 'btnrow'), go = h('button', 'big', `Go up into ${M.name}` + (coming ? ` with ${coming} friend${coming > 1 ? 's' : ''}` : '')), gl = h('button', null, G.gleanReady() ? 'Send a gleaner instead' : `Gleaner ready on day ${s.gleanDay}`);
    if (party === 'client') right.appendChild(h('p', 'sub warn', `${net.host} leads your party. Say you are ready on the Party screen, and you go up when they do, into the place they choose.`));
    else if (party === 'host') right.appendChild(h('p', 'sub' + (staying ? ' warn' : ''), coming ? `${coming} of your party ${coming > 1 ? 'are' : 'is'} ready and will come with you.` + (staying ? ` ${staying} ${staying > 1 ? 'are' : 'is'} not ready and will be left in the Hollow.` : '') : staying ? 'Nobody in your party has said they are ready. You would go up alone.' : 'Your party is open, but nobody has joined it yet. You would go up alone.'));
    go.onclick = () => { b.classList.add('hidden'); launch(`Going up into ${M.name}…`, () => { if (!(G.net.role === 'host' && G.net.goUp(pickMap, pickStart))) G.raid.start({ map: pickMap, start: pickStart }); }); };
    go.disabled = party === 'client';
    gl.disabled = !G.gleanReady() || !!party; gl.onclick = () => { b.classList.add('hidden'); launch(`Going up into ${M.name}…`, () => G.raid.start({ map: pickMap, start: pickStart, gleaner: true })); }; gl.title = 'Someone else from the Hollow goes up with whatever they own. Bandits leave gleaners alone. What comes back is yours; if they die you lose nothing. It does not use up the day.';
    row.appendChild(go); row.appendChild(gl); row.appendChild(btn('Not yet', () => { G.sfx('ui'); b.classList.add('hidden'); }, false, ' ')); right.appendChild(row);
    b.appendChild(left); b.appendChild(right);
  }
  // going up takes a moment while the place is built: say so, then start once that has been drawn
  function launch(label, start) {
    G.sfx('ui'); for (const id of ['brief', 'menu', 'result', 'title']) $(id).classList.add('hidden'); U.hideCtx(); $('tip').classList.add('hidden');
    const a = $('ask'); a.innerHTML = ''; const card = h('div', 'card'); card.appendChild(h('p', null, label)); a.appendChild(card); a.classList.remove('hidden');
    setTimeout(() => { try { start(); } catch (e) { G.raid.abort(); menu(); toast('The way up could not be made. Try again.'); if (window.console) console.error(e); } finally { a.classList.add('hidden'); } }, 60);
  }

  // ------------------------------------------------------------------ the reckoning
  function result(info) {
    U.loot.reset(); for (const id of ['raidinv', 'menu', 'brief']) $(id).classList.add('hidden');
    const r = $('result'); r.innerHTML = ''; r.classList.remove('hidden');
    const box = h('div', 'card'), out = info.outcome === 'extract';
    box.appendChild(h('div', 'sub', `${info.map} — day ${info.dayNo}` + (info.gleaner ? ' — a gleaner' : '')));
    box.appendChild(h('h1', out ? '' : 'dead', out ? (info.gleaner ? 'The gleaner came back.' : info.cut ? 'You came down alone.' : 'You made it out.') : info.outcome === 'lost' ? 'Lost to the ruins.' : info.gleaner ? 'The gleaner did not come back.' : 'You fell in the ruins.'));
    if (!out) box.appendChild(h('p', null, info.gleaner ? 'One more name Maud does not say aloud. You lost nothing of your own.' : info.cause));
    else {
      if (info.cut) box.appendChild(h('p', null, 'You lost the others, and without them the ruin fell quiet. You found your own way down with what you were carrying.'));
      box.appendChild(h('p', null, info.gleaner ? `Everything they carried is in your stash: about ${info.value} silver of goods.` : `By ${info.exit || 'the back ways'}, ${info.value >= 0 ? 'richer' : 'poorer'} by about ${Math.abs(info.value)} silver in goods and coin.` + (info.paid ? ` ${info.paid} silver paid for the passage.` : '')));
      if (info.coins) box.appendChild(h('p', null, `${info.coins} silver pennies counted into your purse.`));
      if (info.found.length) {
        const agg = {}; for (const it of info.found) agg[it.id] = (agg[it.id] || 0) + (it.n || 1);
        const fl = h('div', 'found'); for (const id in agg) { const e = h('span', 'chip'); const ic = h('i'); ic.style.backgroundImage = `url(${U.icon(I[id])})`; e.appendChild(ic); e.appendChild(document.createTextNode(`${I[id].name}${agg[id] > 1 ? ' ×' + agg[id] : ''}`)); fl.appendChild(e); }
        box.appendChild(h('h3', null, 'Brought home')); box.appendChild(fl);
      }
    }
    if (info.insured) box.appendChild(h('p', 'sub', `${info.insured} insured thing${info.insured > 1 ? 's' : ''} may yet be found by the brothers. Give them a night or two.`));
    // the way you went: your path over the map, where men fell, and where it ended
    if (info.route && info.route.trail.length > 1 && !info.gleaner) {
      const rt = info.route, M = G.mapById(rt.map), sc = Math.max(2, Math.round(360 / M.w)), cvs = document.createElement('canvas'), pad = 16, T = G.T; cvs.width = M.w * sc + pad * 2; cvs.height = M.h * sc + pad * 2; cvs.className = 'route';
      const c = cvs.getContext('2d'), px = v => pad + v / T * sc; G.drawMap(c, rt.map, pad, pad, sc, {});
      c.fillStyle = 'rgba(194,177,134,.28)'; c.fillRect(pad, pad, M.w * sc, M.h * sc);      // fade the map a little so the route stands out
      c.lineJoin = c.lineCap = 'round'; c.strokeStyle = 'rgba(40,24,12,.55)'; c.lineWidth = 4; c.beginPath(); rt.trail.forEach((p, i) => i ? c.lineTo(px(p[0]), px(p[1])) : c.moveTo(px(p[0]), px(p[1]))); c.stroke();
      c.strokeStyle = '#8a1f14'; c.lineWidth = 2; c.setLineDash([5, 4]); c.stroke(); c.setLineDash([]);
      for (const k of rt.marks) { const x = px(k[0]), y = px(k[1]); c.strokeStyle = k[2] ? '#1a1410' : 'rgba(26,20,16,.5)'; c.lineWidth = 2; c.beginPath(); c.moveTo(x - 3, y - 3); c.lineTo(x + 3, y + 3); c.moveTo(x + 3, y - 3); c.lineTo(x - 3, y + 3); c.stroke(); }
      const a = rt.trail[0], z = rt.trail[rt.trail.length - 1];
      c.fillStyle = '#2e2416'; c.beginPath(); c.arc(px(a[0]), px(a[1]), 4, 0, 7); c.fill();
      c.strokeStyle = out ? '#1f5a2a' : '#8a1f14'; c.lineWidth = 3; c.beginPath(); c.arc(px(z[0]), px(z[1]), 6, 0, 7); c.stroke(); if (!out) { c.beginPath(); c.moveTo(px(z[0]) - 4, px(z[1]) - 4); c.lineTo(px(z[0]) + 4, px(z[1]) + 4); c.moveTo(px(z[0]) + 4, px(z[1]) - 4); c.lineTo(px(z[0]) - 4, px(z[1]) + 4); c.stroke(); }
      box.appendChild(h('h3', null, 'The way you went')); box.appendChild(cvs);
      box.appendChild(h('div', 'sub', `A dot where you went in, a ring where ${out ? 'you came out' : 'it ended'}` + (rt.marks.length ? ', a cross for each one killed.' : '.')));
    }
    const m = Math.floor(info.time / 60), kills = {}; for (const k of info.kills) kills[k] = (kills[k] || 0) + 1;

    box.appendChild(h('p', 'sub', `Time in the ruins: ${m} min. Killed: ${Object.entries(kills).map(([n, c]) => `${c} × ${n}`).join(', ') || 'nothing'}.`));
    if (info.xp.length) {
      box.appendChild(h('h3', null, 'Experience')); const tb = h('div', 'xp');
      for (const [l, n] of info.xp) { const row = h('div', 'crow'); row.appendChild(h('span', null, l)); row.appendChild(h('span', n < 0 ? 'warn' : '', (n > 0 ? '+' : '') + n)); tb.appendChild(row); }
      const row = h('div', 'crow tot'); row.appendChild(h('span', null, 'In all')); row.appendChild(h('span', null, '+' + info.xpTotal)); tb.appendChild(row); box.appendChild(tb);
      if (info.levels) { box.appendChild(h('p', 'lvl', `You are now level ${G.save.level}.`)); G.sfx('level'); }
      for (const u of info.ups) box.appendChild(h('div', 'sub lvl', u));
    }
    if (info.night) {
      box.appendChild(h('h3', null, 'That night')); for (const l of info.night.lines) box.appendChild(h('p', 'jline', l));
      if (info.night.epitaph) { box.appendChild(h('h1', 'dead', 'It ends here.')); box.appendChild(h('p', null, info.night.epitaph)); }
    }
    const ep = info.night && info.night.epitaph;
    // a nudge, now and then, to keep a copy: the save is only as safe as this browser's storage
    if (info.night && !ep) {
      const s = G.save, since = s.day - (s.kept || 0), store = G.canStore();
      if (!store || (s.kept ? since >= 5 : s.day >= 4)) { box.appendChild(h('p', 'sub', !store ? 'This browser is not keeping saves. Download yours before you close the tab.' : s.kept ? `It is ${since} days since you downloaded your save.` : 'You have not yet downloaded your save. It lives only in this browser.')); box.appendChild(btn('Download the save', download)); }
    }
    const on = btn(ep ? 'Begin again' : info.night ? `Wake to day ${info.night.day}` : 'Back to the Hollow', () => { G.sfx('ui'); r.classList.add('hidden'); if (ep) title(); else menu(); }, false, 'big');
    // You led the party, and friends are still up there. The world they are in lives in this page, so there is no going
    // on until they are down, unless you choose to end it for them.
    waiting = null;
    if (info.waiting && G.raid.ghost()) {
      const note = h('p', 'warn', 'Your friends are still up there, and the ruin they are in lives in this page. Keep it open. The way back opens when they are down.');
      const end = btn('End it for them now', () => { if (!end._sure) { end._sure = true; end.textContent = 'They will be sent down with what they carry. Click again.'; return; } G.net.leave(); }, false, 'small danger');
      on.disabled = true; box.appendChild(note); waiting = { on, note, end };
      box.appendChild(on); box.appendChild(end);
    } else box.appendChild(on);
    r.appendChild(box);
  }
  let waiting = null;
  function resultReady() { if (!waiting) return; waiting.on.disabled = false; waiting.note.textContent = 'Everyone is down.'; waiting.note.className = 'sub'; waiting.end.remove(); waiting = null; }

  // ------------------------------------------------------------------ title, pause
  function title() {
    const t = $('title'), s = G.save; t.innerHTML = ''; t.classList.remove('hidden'); $('menu').classList.add('hidden');
    const box = h('div', 'card wide'); box.appendChild(h('h1', null, 'ASHEN MARCH'));
    for (const l of G.STORY) box.appendChild(h('p', null, l));
    const go = () => { s.started = true; G.persist(); t.classList.add('hidden'); G.sfx('ui'); menu(); };
    const fresh = iron => { G.reset(); G.save.ironman = iron; G.save.started = true; G.persist(); t.classList.add('hidden'); G.sfx('ui'); menu(); };
    if (G.net.want) box.appendChild(h('p', 'warn', `A friend has sent you the code of their party (${G.net.want}). ${s.started ? 'Go down to the Hollow' : 'Begin'}, and you will be shown the way in.`));
    if (s.started) { box.appendChild(h('p', 'sub', `Day ${s.day}, level ${s.level}${s.ironman ? ' — one life' : ''}. Longest you have lasted: ${Math.max(G.best(), s.day - 1)} days.`)); box.appendChild(btn('Go back down to the Hollow', go, false, 'big')); }
    const row = h('div', 'btnrow center');
    const mk = (label, iron) => { const b = h('button', s.started ? 'small' : 'big', label); b.onclick = () => { if (s.started && !b._sure) { b._sure = true; b.textContent = 'This erases your days. Click again.'; return; } fresh(iron); }; row.appendChild(b); };
    mk(s.started ? 'Begin again' : 'Begin', false); mk(s.started ? 'Begin again — one life' : 'Begin — one life', true);
    box.appendChild(row); box.appendChild(h('p', 'sub', 'One life: when you fall, the tale ends and only the count of days is kept.'));
    const kr = h('div', 'btnrow center');
    if (s.started) kr.appendChild(btn('Download your save', () => { download(); title(); }));
    kr.appendChild(btn('Load a save file', () => pickFile(ok => { if (ok) title(); })));
    box.appendChild(kr);
    box.appendChild(h('p', 'sub', 'Your days are kept in this browser only. A save file is a copy you can put away, or load in another browser to carry on there. You can also drop one anywhere on this page.' + (s.started ? (s.kept ? ` Last downloaded on day ${s.kept}.` : ' Never downloaded.') : '')));
    if (!G.canStore()) box.appendChild(h('p', 'sub warn', 'This browser is not keeping anything — a private window, or its storage is blocked. Download your save before you close the tab.'));
    t.appendChild(box);
  }
  function pauseMenu(on) {
    const p = $('pause'); if (!on) { p.classList.add('hidden'); return; }
    p.innerHTML = ''; p.classList.remove('hidden');
    const st = G.raid.state(), co = !!(st && st.net);
    const box = h('div', 'card'); box.appendChild(h('h1', null, co ? 'Not paused' : 'Paused'));
    if (co) box.appendChild(h('p', 'warn', 'You are up there with friends, and the world does not stop for one of you. You can be struck while this is open.'));
    box.appendChild(btn('Back to it', () => G.raid.resume(), false, 'big'));
    box.appendChild(h('h3', null, 'Settings')); box.appendChild(settingsEl());
    box.appendChild(h('h3', null, 'Controls')); for (const l of CONTROLS) box.appendChild(h('div', 'sub', l));
    const ab = h('button', 'small danger', 'Drop everything and run home'); ab.onclick = () => { if (!ab._sure) { ab._sure = true; ab.textContent = 'You will lose all you carry. Click again.'; return; } G.raid.abandon(); }; box.appendChild(ab);
    p.appendChild(box);
  }

  G.ui = Object.assign({ menu, result, toast, pauseMenu, title, brief, dropOn, launch, resultReady }, U.loot);
  G.load(); U.initInv(); G.net.boot();
  $('go').onclick = () => { G.sfx('ui'); U.hideCtx(); $('tip').classList.add('hidden'); brief(); };
  title();
})();
