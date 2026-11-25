'use strict';
// The people you trade with and what they ask of you.
// Traders have four levels of standing (level + reputation + silver traded), daily stock limits and barter deals.
// Tasks are chains of objectives: kill, hand over (often "found in the ruins" only), visit a place, get out of a map alive, build.
(function () {
  const I = G.ITEMS;
  // stock entry: [id, standing, quantity per purchase, limit per day, barter {id: n} instead of silver]
  G.TRADERS = {
    maud: {
      name: 'Maud', title: 'kept the Burnt Hart', buys: ['food', 'mat', 'med', 'pack', 'belt', 'tool'], rate: .42, markup: 1.55,
      blurb: 'She ran the tavern over your head. Now she runs the Hollow: who eats, who sleeps where, who goes up.',
      stock: [['bread', 1, 1, 6], ['turnip', 1, 2, 4], ['apple', 1, 2, 4], ['ale', 1, 1, 4], ['waterskin', 1, 1, 2], ['bandage', 1, 1, 4], ['salve', 1, 1, 3], ['willow', 1, 2, 3], ['cloth', 1, 2, 4], ['sack', 1, 1, 2], ['rope_belt', 1, 1, 2],
        ['cheese', 2, 1, 3], ['salt_pork', 2, 1, 3], ['poultice', 2, 1, 2], ['ligature', 2, 1, 2], ['satchel', 2, 1, 1], ['leather_belt', 2, 1, 1], ['tallow', 2, 2, 3], ['flint', 2, 1, 1], ['rope', 2, 1, 2],
        ['satchel', 1, 1, 1, { cloth: 6, rope: 1 }], ['grain', 3, 1, 2], ['honey', 3, 1, 2], ['pouch_belt', 3, 1, 1], ['rucksack', 3, 1, 1], ['rucksack', 2, 1, 1, { leather: 3, rope: 2, cloth: 4 }], ['pack_frame', 4, 1, 1], ['baldric', 4, 1, 1]]
    },
    osric: {
      name: 'Osric', title: 'the smith', buys: ['weapon', 'shield', 'head', 'body', 'legs', 'ammo', 'mat', 'tool'], rate: .45, markup: 1.6,
      blurb: 'Dunmere\'s smith. The raiders took his forge and his son Edric in the same hour. He works with what you bring him.',
      stock: [['rusty_knife', 1, 1, 2], ['cudgel', 1, 1, 2], ['quarterstaff', 1, 1, 2], ['hatchet', 1, 1, 2], ['pitchfork', 1, 1, 1], ['seax', 1, 1, 2], ['coif', 1, 1, 2], ['leather_jack', 1, 1, 2], ['buckler', 1, 1, 1], ['whetstone', 1, 1, 2], ['nails', 1, 3, 3],
        ['kettle_helm', 1, 1, 1, { iron_ingot: 3, tally: 2 }], ['spear', 1, 1, 1, { timber: 2, iron_ingot: 1 }],
        ['spear', 2, 1, 2], ['falchion', 2, 1, 1], ['dagger', 2, 1, 1], ['gambeson', 2, 1, 2], ['padded_chausses', 2, 1, 2], ['nasal_helm', 2, 1, 1], ['kettle_helm', 2, 1, 1], ['round_shield', 2, 1, 1], ['hammer', 2, 1, 1], ['iron_ingot', 2, 1, 2],
        ['arming_sword', 2, 1, 1, { iron_ingot: 3, charcoal: 4 }], ['mail_hauberk', 2, 1, 1, { iron_ingot: 6, leather: 2, tally: 5 }],
        ['mace', 3, 1, 1], ['arming_sword', 3, 1, 1], ['war_axe', 3, 1, 1], ['billhook', 3, 1, 1], ['mail_hauberk', 3, 1, 1], ['mail_chausses', 3, 1, 1], ['kite_shield', 3, 1, 1], ['heater_shield', 3, 1, 1],
        ['longsword', 4, 1, 1], ['warhammer', 4, 1, 1], ['halberd', 4, 1, 1], ['poleaxe', 4, 1, 1], ['estoc', 4, 1, 1], ['brigandine', 4, 1, 1], ['bascinet', 4, 1, 1], ['plate_greaves', 4, 1, 1], ['plate_harness', 4, 1, 1, { iron_ingot: 9, leather: 4, writ: 1 }]]
    },
    anselm: {
      name: 'Brother Anselm', title: 'infirmarer of St Osyth\'s', buys: ['loot', 'med', 'key'], rate: .5, markup: 1.5,
      blurb: 'He was bleeding a carter in Dunmere when the host reached the abbey. He will tend you for silver, and his brothers will go out at night for what the dead dropped.',
      stock: [['bandage', 1, 1, 3], ['ligature', 1, 1, 2], ['salve', 1, 1, 2], ['splint', 1, 1, 2], ['willow', 1, 2, 3], ['herbs', 1, 2, 2], ['poultice', 1, 1, 1], ['poultice', 1, 1, 2, { herbs: 3, cloth: 1 }],
        ['poultice', 2, 1, 3], ['tincture', 2, 1, 1], ['honey', 2, 1, 2], ['wine', 2, 1, 2], ['tincture', 1, 1, 1, { amber: 1 }], ['surgeon_roll', 2, 1, 1, { needle: 1, cloth: 4, wine: 1 }],
        ['tincture', 3, 1, 3], ['surgeon_roll', 3, 1, 1], ['surgeon_roll', 4, 1, 2]]
    },
    ysolde: {
      name: 'Ysolde', title: 'pedlar', buys: ['weapon', 'shield', 'head', 'body', 'legs', 'ammo', 'mat', 'tool', 'food', 'med', 'pack', 'belt', 'loot', 'key', 'case'], rate: .36, markup: 1.7, fromDay: 3,
      blurb: 'She walked the March with a pack before the war and knows every back gate in it. She buys anything, cheaply, and can find keys.',
      stock: [['bow', 1, 1, 1], ['arrow', 1, 10, 3], ['rope', 1, 1, 2], ['flint', 1, 1, 1], ['needle', 1, 1, 1], ['hammer', 1, 1, 1], ['leather', 1, 1, 2], ['pitch', 1, 1, 2], ['charcoal', 1, 3, 2], ['undercroft_key', 1, 1, 1],
        ['bow', 1, 1, 1, { wolf_pelt: 2 }], ['satchel', 1, 1, 1, { tally: 6 }],
        ['bodkin', 2, 10, 2], ['keyring', 1, 1, 1], ['saw', 2, 1, 1], ['tongs', 2, 1, 1], ['infirmary_key', 2, 1, 1], ['pouch_belt', 2, 1, 1, { tally: 8 }], ['rucksack', 2, 1, 1, { dispatch: 3, tally: 6 }],
        ['longbow', 3, 1, 1], ['crossbow', 3, 1, 1], ['bolt', 3, 8, 3], ['sacristy_key', 3, 1, 1], ['dungeon_key', 3, 1, 1], ['postern_key', 3, 1, 1], ['great_helm', 3, 1, 1, { writ: 1, dispatch: 2 }],
        ['armoury_key', 4, 1, 1], ['crossbow', 2, 1, 1, { dispatch: 4, iron_ingot: 2 }]]
    }
  };
  const LL = [null, { lvl: 3, rep: .15, spent: 250 }, { lvl: 7, rep: .4, spent: 1200 }, { lvl: 12, rep: .75, spent: 4000 }];
  G.LLREQ = LL;
  G.traderOpen = tid => !G.TRADERS[tid].fromDay || G.save.day >= G.TRADERS[tid].fromDay;
  G.loyalty = tid => { const s = G.save; let l = 1; for (let i = 1; i < 4; i++) if (s.level >= LL[i].lvl && (s.rep[tid] || 0) >= LL[i].rep && (s.spent[tid] || 0) >= LL[i].spent) l = i + 1; else break; return l; };
  G.buyPrice = (tid, e) => Math.ceil(I[e[0]].value * (e[2] || 1) * G.TRADERS[tid].markup * (1 - .03 * (G.loyalty(tid) - 1)));
  G.stockLeft = (tid, idx) => { const e = G.TRADERS[tid].stock[idx]; return (e[3] || 1) - (G.save.bought[tid + idx] || 0); };
  G.canBuy = (tid, idx) => {
    const s = G.save, e = G.TRADERS[tid].stock[idx];
    if (G.loyalty(tid) < e[1] || G.stockLeft(tid, idx) <= 0) return false;
    return e[4] ? Object.keys(e[4]).every(id => G.inv.count(s.stash, id) >= e[4][id]) : s.coin >= G.buyPrice(tid, e);
  };
  G.buy = (tid, idx) => {
    const s = G.save, e = G.TRADERS[tid].stock[idx]; if (!G.canBuy(tid, idx)) return false;
    const it = G.mk(e[0], e[2] || 1);
    if (!G.inv.spot(s.stash, it) && !I[e[0]].stack) return null;         // no room
    if (e[4]) { for (const id in e[4]) G.inv.take(s.stash, id, e[4][id]); s.spent[tid] = (s.spent[tid] || 0) + Math.round(I[e[0]].value * .6); }
    else { const p = G.buyPrice(tid, e); s.coin -= p; s.spent[tid] = (s.spent[tid] || 0) + p; }
    if (!G.inv.add(s.stash, it)) G.inv.add(s.overflow, it);
    s.bought[tid + idx] = (s.bought[tid + idx] || 0) + 1; G.persist(); return true;
  };
  G.sellPrice = (tid, it) => {
    const t = G.TRADERS[tid], d = I[it.id]; if (it.id === 'coin') return it.n;
    if (!t.buys.includes(d.cat) || d.quest) return 0;
    return Math.max(1, Math.floor(G.itemValue(it) * t.rate * (1 + .03 * (G.loyalty(tid) - 1))));
  };
  G.bestSell = it => { let best = null; for (const tid in G.TRADERS) { if (!G.traderOpen(tid)) continue; const p = G.sellPrice(tid, it); if (p > 0 && (!best || p > best.price)) best = { tid, price: p }; } return best; };
  G.sellTo = (tid, it) => { const s = G.save, p = G.sellPrice(tid, it); if (!p) return 0; s.coin += p; s.spent[tid] = (s.spent[tid] || 0) + p; return p; };
  G.healCost = () => Math.max(0, Math.ceil(G.hurtPoints() * 1.1));
  G.healAll = () => { const s = G.save, c = G.healCost(); if (!c || s.coin < c) return false; s.coin -= c; s.spent.anselm = (s.spent.anselm || 0) + c; for (const z in s.hp) s.hp[z] = 1; G.persist(); return true; };

  // ---------------------------------------------------------------- tasks
  // objective kinds: kill {who[], map?, with?[skills], n} · hand {id, n, fir?} · visit {map, zone, label} · extract {map?, n} · build {mod, n} · day {n} · larder {n} · survive {n}
  const FOES = ['raider', 'bowman', 'sergeant', 'crossbowman', 'knight', 'hob', 'aldric'];
  G.TASKS = [
    { id: 'm1', by: 'maud', name: 'Bandits on the Green', text: 'Hill bandits are picking through our neighbours\' houses before the ash is cold. Put three in the ground in Dunmere and the rest will learn the village still has teeth.', objs: [{ k: 'kill', who: ['bandit', 'cutthroat', 'tom'], map: 'dunmere', n: 3 }], reward: { coin: 80, items: [['bandage', 2], ['salve', 1]], rep: .08, xp: 300 } },
    { id: 'm2', by: 'maud', after: 'm1', name: 'Bread for the Hollow', text: 'There are children under this floor. The army took the stock but not every flitch. Bring me three sides of salt pork out of the ruins — found, not bought.', objs: [{ k: 'hand', id: 'salt_pork', n: 3, fir: true }], reward: { coin: 100, items: [['poultice', 1]], rep: .1, xp: 400 } },
    { id: 'm3', by: 'maud', name: 'A Fire That Stays Lit', text: 'We cannot mend anyone in the cold. Find timber and nails and I will have a hearth drawing by morning.', objs: [{ k: 'build', mod: 'hearth', n: 1 }], reward: { coin: 50, items: [['grain', 1]], rep: .07, xp: 300 } },
    { id: 'm4', by: 'maud', after: 'm3', name: 'The Well Rope', text: 'The well on the green is fouled with a dead horse. Build me something to catch the rain.', objs: [{ k: 'build', mod: 'water', n: 1 }], reward: { coin: 40, items: [['waterskin', 1], ['cheese', 2]], rep: .07, xp: 300 } },
    { id: 'm5', by: 'maud', after: 'm2', lvl: 3, name: 'Black Tom', text: 'The bandits answer to Tom Reave. He was hanged in effigy at three assizes. He holds court in the Reeve\'s Hall with his best men about him. Kill him and they are a rabble again.', objs: [{ k: 'kill', who: ['tom'], n: 1 }], reward: { coin: 300, items: [['pouch_belt', 1]], rep: .15, xp: 900, pouch: [2, 2], note: 'Maud sews a deeper pouch into your shirt. It holds 2×2 now.' } },
    { id: 'm6', by: 'maud', name: 'Ten Dawns', text: 'Any fool can last a night. See the tenth dawn.', objs: [{ k: 'day', n: 10 }], reward: { coin: 150, items: [['kettle_helm', 1]], rep: .1, xp: 600 } },
    { id: 'm7', by: 'maud', name: 'Our Own', text: 'They did not kill everyone. Some they roped and kept, to carry and to dig. If you find one of ours on their knees up there, cut them loose and they will find their own way down. Three would be a start.', objs: [{ k: 'free', n: 3 }], reward: { coin: 120, items: [['salve', 2]], rep: .12, xp: 500 } },
    { id: 'm8', by: 'maud', after: 'm7', name: 'Every One of Them', text: 'Three is three. I have the names of ten who were taken and not found among the dead.', objs: [{ k: 'free', n: 10 }], reward: { coin: 320, items: [['poultice', 2]], rep: .15, xp: 1200 } },
    { id: 'm7', by: 'maud', after: 'm4', name: 'Winter Stores', text: 'I want twenty portions in that larder at one time. Then I will sleep.', objs: [{ k: 'larder', n: 20 }], reward: { coin: 120, items: [['honey', 2], ['wine', 1]], rep: .12, xp: 600 } },
    { id: 'm8', by: 'maud', after: 'm5', lvl: 9, name: 'The Flayer', text: 'The Duke left a captain to hold the castle: Aldric, in full harness, with his household knights. He skinned my husband on the green as a lesson to the rest of us. Bring me his ring.', objs: [{ k: 'hand', id: 'signet', n: 1, fir: true }], reward: { coin: 1500, items: [['great_helm', 1]], rep: .3, xp: 3000, note: 'Maud turns the ring over twice and drops it down the well. Nobody in the Hollow sleeps that night, and for once it is not from fear.' } },

    { id: 'o1', by: 'osric', name: 'The Duke\'s Stragglers', text: 'Raiders who slipped the column hold the chapel and the east camp. They took my forge and my son. Kill five of the Duke\'s men, anywhere.', objs: [{ k: 'kill', who: FOES, n: 5 }], reward: { coin: 100, items: [['arming_sword', 1]], rep: .1, xp: 500 } },
    { id: 'o2', by: 'osric', after: 'o1', name: 'My Forge', text: 'Go to the smithy in Dunmere and see what they left. My tongs hung by the hearth. Bring a pair back out of the ruins and I can work properly.', objs: [{ k: 'visit', map: 'dunmere', zone: 'smithy', label: 'Stand in the smithy in Dunmere' }, { k: 'hand', id: 'tongs', n: 1, fir: true }], reward: { coin: 120, items: [['whetstone', 2]], rep: .1, xp: 500 } },
    { id: 'o3', by: 'osric', after: 'o2', name: 'Iron for the Hollow', text: 'Six blooms of iron. I do not care where from.', objs: [{ k: 'hand', id: 'iron_ingot', n: 6 }], reward: { coin: 60, items: [['mail_chausses', 1]], rep: .1, xp: 500 } },
    { id: 'o4', by: 'osric', after: 'o1', lvl: 6, name: 'Proof of Steel', text: 'The sergeants wear mail and know their trade. Kill three and I will know what I make for you is not wasted.', objs: [{ k: 'kill', who: ['sergeant'], n: 3 }], reward: { coin: 200, items: [['brigandine', 1]], rep: .15, xp: 1000 } },
    { id: 'o5', by: 'osric', after: 'o2', lvl: 7, name: 'My Son Edric', text: 'They took the strong ones to the castle to dig and carry. If Edric is anywhere he is in Aldric\'s cells. He wore an iron ring I made him. Bring me the ring or bring me him.', objs: [{ k: 'visit', map: 'hold', zone: 'dungeon', label: 'Reach the cells of the Hold' }, { k: 'hand', id: 'edric_ring', n: 1, fir: true }], reward: { coin: 500, items: [['warhammer', 1]], rep: .2, xp: 1500, note: 'Osric holds the ring a long time. Then he puts it on his own finger and goes back to the bellows.' } },
    { id: 'o6', by: 'osric', after: 'o4', name: 'Knight-killer', text: 'An edge will not go through plate. A hammer or a poleaxe will. Kill two of Aldric\'s household knights with a hafted weapon or a polearm.', objs: [{ k: 'kill', who: ['knight'], with: ['hafted', 'pole'], n: 2 }], reward: { coin: 400, items: [['poleaxe', 1]], rep: .2, xp: 1500 } },

    { id: 'a1', by: 'anselm', name: 'Yarrow and Linen', text: 'I have nothing to work with. Four bundles of yarrow and four of clean linen and I can keep people alive.', objs: [{ k: 'hand', id: 'herbs', n: 4 }, { k: 'hand', id: 'cloth', n: 4 }], reward: { coin: 60, items: [['poultice', 2], ['ligature', 2]], rep: .08, xp: 300 } },
    { id: 'a2', by: 'anselm', after: 'a1', lvl: 4, name: 'Back to St Osyth\'s', text: 'The Crow Company hold my abbey. Go and stand in the church, see what they have done to it, and come out alive to tell me.', objs: [{ k: 'visit', map: 'abbey', zone: 'church', label: 'Stand in the abbey church' }, { k: 'extract', map: 'abbey', n: 1 }], reward: { coin: 200, items: [['tincture', 1]], rep: .1, xp: 700 } },
    { id: 'a3', by: 'anselm', after: 'a2', name: 'What Was Owed', text: 'The tithe ledger is in the scriptorium. With it the abbey can prove whose land this is when the lords come back. Without it, the Flayer writes his own.', objs: [{ k: 'hand', id: 'ledger', n: 1, fir: true }], reward: { coin: 250, items: [['tincture', 2]], rep: .15, xp: 800 } },
    { id: 'a4', by: 'anselm', after: 'a2', name: 'Physic', text: 'The infirmary had a surgeon\'s roll and jars of honey for wounds. Bring me a roll and two combs of honey out of the ruins.', objs: [{ k: 'hand', id: 'surgeon_roll', n: 1, fir: true }, { k: 'hand', id: 'honey', n: 2, fir: true }], reward: { coin: 200, items: [['surgeon_roll', 1], ['poultice', 2]], rep: .12, xp: 700 } },
    { id: 'a5', by: 'anselm', after: 'a2', lvl: 7, name: 'Crowmaster', text: 'Hob was a bell-ringer once. Now he rings ours for his musters, in the abbot\'s own stall, with his sergeants round him. God forgive me. Kill him.', objs: [{ k: 'kill', who: ['hob'], n: 1 }], reward: { coin: 600, items: [['bascinet', 1]], rep: .2, xp: 1500 } },
    { id: 'a6', by: 'anselm', after: 'a5', name: 'The Finger of St Osyth', text: 'Our saint lies in the crypt. Hob carried the key. Bring her out before they melt the casket.', objs: [{ k: 'hand', id: 'relic', n: 1, fir: true }], reward: { coin: 600, items: [['poultice', 3]], rep: .25, xp: 2000, pouch: [3, 2], note: 'Anselm gives you the saint\'s own purse, of oiled silk. Your hidden pouch holds 3×2 now.' } },
    { id: 'a7', by: 'anselm', name: 'Souls Brought Home', text: 'Come back alive ten times. I am keeping count; it is the only good arithmetic left.', objs: [{ k: 'survive', n: 10 }], reward: { coin: 300, items: [['tincture', 2]], rep: .1, xp: 800 } },

    { id: 'y1', by: 'ysolde', name: 'Tallies', text: 'The Duke\'s paymasters give every man a notched stick. A dead raider\'s tally is worth silver to people I know. Bring me six, taken off them yourself.', objs: [{ k: 'hand', id: 'tally', n: 6, fir: true }], reward: { coin: 120, items: [['leather_belt', 1]], rep: .1, xp: 400 } },
    { id: 'y2', by: 'ysolde', name: 'Meat for Winter', text: 'There are deer in the woods round Dunmere and boar rooting in the barn fields. Four cuts of venison and I will give you something to hunt with.', objs: [{ k: 'hand', id: 'venison', n: 4, fir: true }], reward: { coin: 40, items: [['bow', 1], ['arrow', 12]], rep: .08, xp: 400 } },
    { id: 'y3', by: 'ysolde', name: 'Grey Hides', text: 'Wolves have come down for the dead. Two pelts and I will trade you something to carry your takings in.', objs: [{ k: 'hand', id: 'wolf_pelt', n: 2 }], reward: { coin: 40, items: [['rucksack', 1]], rep: .08, xp: 400 } },
    { id: 'y4', by: 'ysolde', after: 'y1', lvl: 5, name: 'Dispatches', text: 'The captains write to each other. Raiders carry the letters; so do the couriers they kill. Three dispatches, and I will give you a key that is worth a great deal to the right fool.', objs: [{ k: 'hand', id: 'dispatch', n: 3, fir: true }], reward: { coin: 250, items: [['postern_key', 1]], rep: .15, xp: 800 } },
    { id: 'y5', by: 'ysolde', after: 'y4', name: 'Eyes on the Hold', text: 'Somebody wants to know how Aldric holds his castle. Look at the barbican, the outer bailey and the postern gate, and walk out again.', objs: [{ k: 'visit', map: 'hold', zone: 'barbican', label: 'See the barbican of the Hold' }, { k: 'visit', map: 'hold', zone: 'bailey', label: 'Stand in the outer bailey' }, { k: 'visit', map: 'hold', zone: 'postern', label: 'Find the postern gate' }, { k: 'extract', map: 'hold', n: 1 }], reward: { coin: 500, items: [['crossbow', 1], ['bolt', 10]], rep: .2, xp: 1500 } },
    { id: 'y6', by: 'ysolde', after: 'y5', name: 'A Ducal Writ', text: 'Aldric holds the castle by a writ under the Duke\'s seal. Whoever has it can say what it says. Bring one out of the ruins.', objs: [{ k: 'hand', id: 'writ', n: 1, fir: true }], reward: { coin: 700, items: [['baldric', 1]], rep: .2, xp: 1500 } },
    { id: 'y7', by: 'ysolde', after: 'y3', lvl: 6, name: 'The Silk Road', text: 'Silk, saffron, pepper. One of each, out of the ruins. I have a buyer who does not ask.', objs: [{ k: 'hand', id: 'silk', n: 1, fir: true }, { k: 'hand', id: 'saffron', n: 1, fir: true }, { k: 'hand', id: 'spice', n: 1, fir: true }], reward: { coin: 300, items: [['pack_frame', 1]], rep: .15, xp: 1000 } }
  ];
  // ---- the day's work: two small contracts, new every morning
  G.rollDaily = () => {
    const s = G.save, lv = s.level, out = [], day = s.day, ys = G.traderOpen('ysolde');
    const maps = lv < 4 ? ['dunmere'] : lv < 8 ? ['dunmere', 'abbey'] : ['dunmere', 'abbey', 'hold'], mp = G.pick(maps), tier = G.mapById(mp).tier;
    const hunts = tier === 1 ? [[['bandit', 'cutthroat'], 4, 60, 250, 'maud', 'Thin them out'], [['wolf'], 3, 55, 250, ys ? 'ysolde' : 'maud', 'Wolves at the door'], [['raider'], 2, 90, 350, 'osric', 'Tithe-takers']]
      : tier === 2 ? [[['raider', 'bowman', 'sergeant'], 5, 170, 500, 'anselm', 'Crows off the carrion'], [['hound'], 2, 100, 400, 'anselm', 'The hounds of St Osyth\'s'], [['cutthroat', 'bandit'], 3, 90, 350, 'maud', 'Pickers in the fen']]
        : [[['sergeant', 'crossbowman', 'knight'], 4, 340, 900, 'osric', 'Bleed the garrison'], [['raider', 'bowman'], 5, 220, 600, 'osric', 'The siege lines'], [['crossbowman'], 2, 240, 700, ys ? 'ysolde' : 'osric', 'Silence the gate']];
    const hn = G.pick(hunts);
    out.push({ id: 'd' + day + 'h', by: hn[4], daily: true, name: hn[5], text: `Today, in ${G.mapName(mp)}. It pays ${hn[2]} silver and it needs doing.`, objs: [{ k: 'kill', who: hn[0], map: mp, n: hn[1] }], reward: { coin: hn[2], rep: .03, xp: hn[3] } });
    const errands = [['cloth', 4, 'maud'], ['timber', 4, 'maud'], ['salt_pork', 2, 'maud'], ['herbs', 3, 'anselm'], ['iron_ingot', 2, 'osric'], ['leather', 2, 'osric'], ['nails', 5, 'osric'], ['bandage', 3, 'anselm']];
    if (ys) errands.push(['tally', 4, 'ysolde'], ['dispatch', 2, 'ysolde'], ['arrow', 10, 'ysolde']);
    const er = G.pick(errands), d = I[er[0]], pay = Math.round(d.value * er[1] * 2.5 + 30);
    out.push({ id: 'd' + day + 'e', by: er[2], daily: true, name: `Wanted: ${d.name}`, text: `${G.TRADERS[er[2]].name} is short. Bring ${er[1]} out of the ruins today — found, not bought.`, objs: [{ k: 'hand', id: er[0], n: er[1], fir: true }], reward: { coin: pay, rep: .03, xp: 200 } });
    return out;
  };
  G.newDay = () => { const s = G.save; for (const d of s.daily || []) { delete s.prog[d.id]; delete s.tasks[d.id]; } s.daily = G.rollDaily(); };
  G.allTasks = () => G.TASKS.concat(G.save.daily || []);
  const byId = {}; for (const t of G.TASKS) byId[t.id] = t;
  const prog = t => { const p = G.save.prog; if (!p[t.id]) p[t.id] = t.objs.map(() => 0); return p[t.id]; };
  // [have, need, description]
  G.objProgress = (t, i) => {
    const s = G.save, o = t.objs[i], E = G.ENEMIES, where = o.map ? ' in ' + G.mapName(o.map) : '';
    switch (o.k) {
      case 'kill': return [prog(t)[i], o.n, `Kill ${o.n > 1 ? o.n + ' ' : ''}${o.who.length > 2 ? 'of the Duke\'s men' : o.who.length === 1 && E[o.who[0]].proper ? E[o.who[0]].name : E[o.who[0]].name + (o.n > 1 ? 's' : '')}${where}${o.with ? ' with a hafted weapon or polearm' : ''}`];
      case 'hand': return [G.inv.count(s.stash, o.id, o.fir), o.n, `Hand over ${o.n > 1 ? o.n + ' × ' : ''}${I[o.id].name}${o.fir ? ' (found in the ruins)' : ''}`];
      case 'visit': return [prog(t)[i], 1, o.label];
      case 'extract': return [prog(t)[i], o.n, `Come out of ${o.map ? G.mapName(o.map) : 'the ruins'} alive${o.n > 1 ? ' ' + o.n + ' times' : ''}`];
      case 'build': return [s.up[o.mod], o.n, `Build the ${G.MODULES[o.mod].name}`];
      case 'day': return [s.day, o.n, `See dawn on day ${o.n}`];
      case 'larder': return [Math.floor(s.larder), o.n, `Have ${o.n} portions in the larder`];
      case 'free': return [s.stats.freed || 0, o.n, `Cut ${o.n} of your own loose, and come out alive`];
      case 'survive': return [s.stats.survived, o.n, `Come back alive ${o.n} times`];
    }
    return [0, 1, '?'];
  };
  // locked | active | ready | done
  G.taskState = t => {
    const s = G.save; if (s.tasks[t.id]) return 'done';
    if (!G.traderOpen(t.by) || (t.after && !s.tasks[t.after]) || (t.lvl && s.level < t.lvl)) return 'locked';
    return t.objs.every((o, i) => { const p = G.objProgress(t, i); return p[0] >= p[1]; }) ? 'ready' : 'active';
  };
  G.taskLock = t => { const s = G.save; if (t.after && !s.tasks[t.after]) return `after “${byId[t.after].name}”`; if (t.lvl && s.level < t.lvl) return `at level ${t.lvl}`; return ''; };
  // what happened in the ruins: returns lines to show the player
  G.taskEvent = (kind, e) => {
    const out = []; if (G.me !== G.save) return out;
    for (const t of G.allTasks()) {
      const st = G.taskState(t); if (st !== 'active' && st !== 'ready') continue;
      t.objs.forEach((o, i) => {
        if (o.k !== kind) return; const p = prog(t); if (p[i] >= (o.n || 1)) return;
        if (kind === 'kill' && (!o.who.includes(e.type) || (o.map && o.map !== e.map) || (o.with && !o.with.includes(e.skill)))) return;
        if (kind === 'visit' && (o.map !== e.map || o.zone !== e.zone)) return;
        if (kind === 'extract' && o.map && o.map !== e.map) return;
        p[i]++; out.push(`${t.name}: ${kind === 'visit' ? o.label + ' — done' : p[i] + ' of ' + o.n}`);
      });
    }
    return out;
  };
  G.claimTask = t => {
    const s = G.save; if (G.taskState(t) !== 'ready') return false;
    for (const o of t.objs) if (o.k === 'hand') G.inv.take(s.stash, o.id, o.n, o.fir);
    const r = t.reward; s.tasks[t.id] = true; s.coin += r.coin || 0; s.rep[t.by] = (s.rep[t.by] || 0) + (r.rep || 0);
    for (const [id, n] of r.items || []) G.toStash(G.mk(id, n));
    if (r.pouch && r.pouch[0] * r.pouch[1] > s.pouch.w * s.pouch.h) { s.pouch.w = r.pouch[0]; s.pouch.h = r.pouch[1]; }
    const up = G.addXP(r.xp || 0); G.log(`${t.name} — done.` + (r.note ? ' ' + r.note : '')); G.persist();
    return { up, note: r.note };
  };
  G.openTasks = () => G.allTasks().filter(t => { const st = G.taskState(t); return st === 'active' || st === 'ready'; });
})();
