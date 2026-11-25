'use strict';
// ASHEN MARCH — static data: items, enemies, loot tables.
// Item categories: weapon shield head body legs pack belt med food ammo mat tool loot key
const G = window.G = {};
G.T = 32;
const I = G.ITEMS = {};
function add(id, name, cat, w, h, value, weight, icon, x, desc) { I[id] = Object.assign({ id, name, cat, w, h, value, weight, icon, desc: desc || '' }, x || {}); }

// ---------------------------------------------------------------- weapons
// st = [dmg, type, reach(px), windup, recover, arc(rad), stamina, block(stamina multiplier when guarding with it)]
// skill: blades | hafted | pole | archery.  pen = share of the target's armour it ignores.
function wp(id, name, w, h, value, weight, icon, skill, st, x, desc) {
  add(id, name, 'weapon', w, h, value, weight, icon, Object.assign({ skill, dmg: st[0], type: st[1], reach: st[2], windup: st[3], recover: st[4], arc: st[5], stam: st[6], block: st[7], strike: .12, pen: 0, cond: true }, x), desc);
}
wp('rusty_knife', 'Rusty Knife', 1, 1, 8, .3, 'sword', 'blades', [13, 'pierce', 27, .16, .22, .7, 7, 1.5], { pen: .15, col: '#7d6a58' }, 'Pitted and bent. It will still open a throat.');
wp('seax', 'Seax', 1, 2, 24, .5, 'sword', 'blades', [17, 'cut', 31, .19, .24, 1.2, 8, 1.3], { bw: .11 }, 'A long single-edged knife. Every farm has one.');
wp('dagger', 'Rondel Dagger', 1, 2, 38, .5, 'sword', 'blades', [18, 'pierce', 30, .15, .2, .7, 7, 1.4], { pen: .4 }, 'A stiff spike made for the gaps in a harness.');
wp('falchion', 'Falchion', 1, 3, 90, 1.3, 'sword', 'blades', [28, 'cut', 45, .28, .34, 1.7, 12, .85], { bw: .13 }, 'A butcher\'s cleaver that went to war.');
wp('arming_sword', 'Arming Sword', 1, 3, 140, 1.2, 'sword', 'blades', [27, 'cut', 50, .25, .3, 1.6, 11, .75], {}, 'Quick, balanced, honest steel.');
wp('longsword', 'Longsword', 1, 4, 260, 1.6, 'sword', 'blades', [36, 'cut', 58, .32, .36, 1.9, 15, .65], { twoH: true }, 'Two-handed. Guards as well as it cuts.');
wp('estoc', 'Estoc', 1, 4, 300, 1.5, 'sword', 'blades', [30, 'pierce', 62, .3, .38, .5, 13, .8], { twoH: true, pen: .5, bw: .05 }, 'Two-handed. An edgeless steel needle for killing men in plate.');
wp('cudgel', 'Cudgel', 1, 2, 10, 1.2, 'club', 'hafted', [16, 'blunt', 37, .3, .35, 1.5, 11, 1.1], {}, 'A length of ash with the bark still on it.');
wp('hatchet', 'Hatchet', 1, 2, 28, 1.1, 'axe', 'hafted', [22, 'cut', 35, .3, .36, 1.4, 12, 1.2], {}, 'Meant for kindling.');
wp('mace', 'Flanged Mace', 1, 2, 120, 1.7, 'mace', 'hafted', [26, 'blunt', 39, .33, .4, 1.4, 14, 1], { pen: .25 }, 'Mail does nothing against it. Breaks bones.');
wp('war_axe', 'War Axe', 1, 3, 110, 1.8, 'axe', 'hafted', [33, 'cut', 43, .36, .44, 1.5, 15, 1.1], {}, 'Slow. Ruinous.');
wp('warhammer', 'War Hammer', 1, 3, 210, 1.9, 'hammer', 'hafted', [31, 'blunt', 42, .36, .44, 1.3, 15, 1], { pen: .45 }, 'A beak on one side, a hammer on the other. Opens plate like an oyster.');
wp('quarterstaff', 'Quarterstaff', 1, 4, 14, 1.4, 'staff', 'pole', [17, 'blunt', 62, .28, .32, 1.8, 10, .7], { twoH: true }, 'Two-handed. Cheap, long, and it guards well.');
wp('pitchfork', 'Pitchfork', 1, 4, 15, 1.8, 'fork', 'pole', [19, 'pierce', 64, .38, .46, .5, 13, 1], { twoH: true }, 'Two-handed. Keeps a man at the length of his fear.');
wp('spear', 'Short Spear', 1, 4, 62, 1.6, 'spear', 'pole', [25, 'pierce', 68, .34, .42, .45, 13, 1], { pen: .2 }, 'Reach wins fights. Can be used with a shield.');
wp('billhook', 'Billhook', 1, 5, 95, 2.6, 'bill', 'pole', [34, 'cut', 70, .44, .5, 1.3, 17, .9], { twoH: true }, 'Two-handed. A hedging tool on a long pole.');
wp('halberd', 'Halberd', 1, 5, 280, 3, 'halberd', 'pole', [40, 'cut', 72, .44, .5, 1.4, 19, .85], { twoH: true, pen: .25 }, 'Two-handed. Axe, hook and spike on one shaft.');
wp('poleaxe', 'Poleaxe', 1, 5, 340, 3, 'poleaxe', 'pole', [44, 'blunt', 68, .46, .52, 1.5, 20, .8], { twoH: true, pen: .4 }, 'Two-handed. Made to kill men in plate.');
wp('bow', 'Hunting Bow', 1, 4, 85, .9, 'bow', 'archery', [26, 'pierce', 0, .75, .45, .3, 9, 2], { twoH: true, ranged: true, ammo: 'arrow', speed: 520 }, 'Two-handed. Hold to draw, release to loose. Aim a little high at range.');
wp('longbow', 'War Bow', 1, 5, 240, 1.2, 'bow', 'archery', [37, 'pierce', 0, 1.0, .5, .3, 14, 2], { twoH: true, ranged: true, ammo: 'arrow', speed: 640, pen: .15 }, 'Two-handed. A yew stave as tall as a man. Tires the arm.');
wp('crossbow', 'Crossbow', 2, 3, 320, 3.2, 'xbow', 'archery', [46, 'pierce', 0, .3, 3.2, .3, 5, 2], { twoH: true, ranged: true, ammo: 'bolt', speed: 760, pen: .35, xbow: true }, 'Two-handed. Looses at once, then takes an age to span again.');

add('arrow', 'Broadhead Arrows', 'ammo', 1, 1, 3, .05, 'arrows', { stack: 20, ammo: 'arrow', admg: 1, apen: 0, ableed: 1.5 }, 'Wide barbed heads. They cut flesh and bleed a man white.');
add('bodkin', 'Bodkin Arrows', 'ammo', 1, 1, 6, .05, 'arrows', { stack: 20, ammo: 'arrow', admg: .85, apen: .45, ableed: .6, col: '#5f656b' }, 'Narrow hardened points that go through mail.');
add('bolt', 'Quarrels', 'ammo', 1, 1, 6, .08, 'bolts', { stack: 12, ammo: 'bolt', admg: 1, apen: .25, ableed: 1 }, 'Short, square-headed crossbow bolts.');

// shields: block = stamina multiplier when guarding (lower is better)
add('buckler', 'Buckler', 'shield', 2, 2, 45, 1.2, 'shieldR', { block: .55, arrows: false, col: '#70757a', cond: true }, 'A fist-sized shield. Will not stop arrows.');
add('round_shield', 'Round Shield', 'shield', 2, 2, 70, 3, 'shieldR', { block: .4, arrows: true, col: '#6b4a2b', cond: true }, 'Limewood planks and a steel boss.');
add('kite_shield', 'Kite Shield', 'shield', 2, 3, 120, 3.8, 'shieldH', { block: .34, arrows: true, col: '#3d4a5a', cond: true }, 'Covers a man from shoulder to shin.');
add('heater_shield', 'Heater Shield', 'shield', 2, 3, 150, 3.5, 'shieldH', { block: .3, arrows: true, col: '#5a2420', cond: true }, 'Some dead knight\'s arms, scraped off.');

// armour: prot = share stopped of {cut, pierce, blunt} at full condition. arms = also covers the arms. cls = armour class 1-6.
function ar(id, name, cat, w, h, value, weight, icon, col, cls, cut, pierce, blunt, x, desc) { add(id, name, cat, w, h, value, weight, icon, Object.assign({ col, cls, prot: { cut, pierce, blunt }, cond: true }, x), desc); }
ar('coif', 'Padded Coif', 'head', 2, 2, 22, .5, 'coif', '#b3a488', 1, .35, .2, .25, {}, 'Quilted linen. Better than hair.');
ar('nasal_helm', 'Nasal Helm', 'head', 2, 2, 70, 1.3, 'helm', '#7d8389', 2, .65, .5, .4, { nasal: true }, 'An old iron cap with a bar for the nose.');
ar('kettle_helm', 'Kettle Helm', 'head', 2, 2, 110, 1.6, 'helm', '#8d9399', 3, .75, .6, .45, {}, 'A broad-brimmed iron hat.');
ar('bascinet', 'Bascinet', 'head', 2, 2, 290, 2.4, 'helm', '#aab0b6', 4, .9, .8, .55, { closed: .3, hear: .75 }, 'Close steel. You hear your own breath, and less of everything else.');
ar('great_helm', 'Great Helm', 'head', 2, 2, 420, 3.2, 'ghelm', '#b4bac0', 5, .95, .9, .62, { closed: .52, hear: .55 }, 'A steel bucket with a slit. Nothing gets in. Not much gets seen.');
ar('leather_jack', 'Leather Jack', 'body', 2, 2, 30, 2, 'torso', '#5d4129', 1, .35, .25, .2, {}, 'Boiled hide, cracked at the seams. Leaves the arms bare.');
ar('gambeson', 'Gambeson', 'body', 2, 3, 75, 3, 'torso', '#b9aa8a', 2, .45, .3, .35, { arms: true }, 'Thirty layers of linen. Turns a lazy cut.');
ar('mail_hauberk', 'Mail Hauberk', 'body', 2, 3, 280, 10, 'torso', '#80868c', 3, .85, .6, .25, { arms: true }, 'Riveted rings. Proof against edges, not against clubs.');
ar('brigandine', 'Brigandine', 'body', 2, 3, 360, 8, 'torso', '#4f2a26', 4, .8, .72, .45, {}, 'Steel plates riveted inside canvas. Leaves the arms bare.');
ar('plate_harness', 'Plate Harness', 'body', 2, 3, 900, 15, 'torso', '#b4bac0', 6, .95, .87, .55, { arms: true }, 'White harness. A fortune, and a slow way to walk.');
ar('padded_chausses', 'Padded Chausses', 'legs', 2, 2, 35, 1.5, 'legs', '#a8997b', 1, .4, .25, .3, {}, 'Quilted leggings.');
ar('mail_chausses', 'Mail Chausses', 'legs', 2, 2, 160, 5, 'legs', '#80868c', 3, .8, .55, .25, {}, 'Ring-mail leggings.');
ar('plate_greaves', 'Plate Greaves', 'legs', 2, 2, 320, 6, 'legs', '#b4bac0', 5, .92, .8, .5, {}, 'Steel for the shins and knees.');

add('sack', 'Grain Sack', 'pack', 2, 2, 12, .4, 'bag', { cw: 3, ch: 3, col: '#9c8a66' }, 'Holds 3×3. Slung over one shoulder.');
add('satchel', 'Satchel', 'pack', 2, 2, 55, .8, 'bag', { cw: 4, ch: 4, col: '#6b4a2b' }, 'Holds 4×4.');
add('rucksack', 'Rucksack', 'pack', 3, 3, 150, 1.4, 'bag', { cw: 5, ch: 5, col: '#5a4a34' }, 'Holds 5×5.');
add('pack_frame', 'Pack Frame', 'pack', 3, 3, 320, 2.5, 'bag', { cw: 6, ch: 6, col: '#4a3a2a' }, 'Holds 6×6. A pedlar\'s frame of withies and hide.');
add('rope_belt', 'Rope Belt', 'belt', 2, 1, 6, .2, 'belt', { cw: 3, ch: 1, col: '#a08a58' }, 'Three things can hang from it.');
add('leather_belt', 'Leather Belt', 'belt', 2, 1, 30, .4, 'belt', { cw: 4, ch: 1, col: '#5a3d25' }, 'Four loops.');
add('pouch_belt', 'Soldier\'s Belt', 'belt', 2, 1, 110, .8, 'belt', { cw: 4, ch: 2, col: '#3a2a1c' }, 'Pouches front and back. Holds 4×2.');
add('baldric', 'Quartermaster\'s Harness', 'belt', 2, 2, 260, 1.2, 'belt', { cw: 5, ch: 2, col: '#2a1f16' }, 'Belt, baldric and five pouches. Holds 5×2.');

// ---------------------------------------------------------------- medicine. fx keys: bleed heavy heal(pool) frac surgery pain stam
function med(id, name, w, h, value, weight, icon, use, key, fx, x, desc) { add(id, name, 'med', w, h, value, weight, icon, Object.assign({ use, key, fx }, x), desc); }
med('bandage', 'Linen Bandage', 1, 1, 14, .1, 'bandage', 2.5, 1, { bleed: 1 }, { stack: 3 }, 'Stops a light bleed. Takes a few breaths to tie.');
med('ligature', 'Leather Ligature', 1, 1, 22, .1, 'strap', 3.5, 2, { heavy: 1 }, { stack: 2 }, 'A strap and a stick to twist it. Stops a heavy bleed.');
med('salve', 'Goose-grease Salve', 1, 1, 18, .2, 'jar', 2.5, 3, { heal: 30 }, { pool: 30, col: '#b9b08a' }, 'Mends 30 health in all before the pot is empty.');
med('poultice', 'Yarrow Poultice', 1, 1, 45, .3, 'jar', 3, 3, { heal: 70 }, { pool: 70 }, 'Mends 70 health in all before the pot is empty.');
med('splint', 'Splint', 1, 2, 30, .4, 'splint', 5, 4, { frac: 1 }, {}, 'Sets a broken arm or leg.');
med('surgeon_roll', 'Surgeon\'s Roll', 1, 2, 160, .4, 'roll', 9, 5, { surgery: 1 }, { pool: 3 }, 'Needle, gut and lancet. Brings a ruined limb back to use, three times.');
med('willow', 'Willow Bark', 1, 1, 6, .05, 'bark', 1.5, 6, { pain: 45 }, { stack: 4 }, 'Chewed, it dulls pain for a short while.');
med('tincture', 'Poppy Tincture', 1, 1, 70, .1, 'vial', 2, 6, { pain: 150 }, { pool: 2 }, 'Two swallows. For a time you ignore ruined limbs.');

// ---------------------------------------------------------------- food and drink. energy / hydr restored when eaten in the ruins; food = larder portions
function fd(id, name, w, h, value, weight, icon, energy, hydr, food, x, desc) { add(id, name, 'food', w, h, value, weight, icon, Object.assign({ use: 3, energy, hydr, food }, x), desc); }
fd('bread', 'Black Bread', 1, 1, 5, .3, 'bread', 20, -3, 1, { stack: 3, key: 8 }, 'Dense as a brick.');
fd('turnip', 'Turnips', 1, 1, 3, .4, 'turnip', 10, 3, 1, { stack: 4, col: '#c8b8c0', key: 8 }, 'Dug from a trampled field.');
fd('apple', 'Apples', 1, 1, 3, .2, 'apple', 8, 8, 1, { stack: 4, key: 8 }, 'Windfalls, bruised and sweet.');
fd('cheese', 'Hard Cheese', 1, 1, 14, .5, 'cheese', 30, -5, 2, { key: 8 }, 'A wheel-end, rind like bark.');
fd('dried_fish', 'Dried Eels', 1, 1, 8, .2, 'fish', 22, -8, 1, { stack: 3, key: 8 }, 'Fen eels, split and smoked.');
fd('salt_pork', 'Salt Pork', 1, 1, 14, .5, 'meat', 35, -12, 2, { col: '#9a5a4a', key: 8 }, 'The Hollow is hungry. So is everyone.');
fd('venison', 'Venison', 1, 1, 16, .8, 'meat', 25, 0, 3, { stack: 3, col: '#7a3a34', key: 8 }, 'Fresh meat. Three portions for the larder.');
fd('grain', 'Sack of Barley', 1, 2, 14, 2.5, 'grain', 0, 0, 4, { col: '#b39a5e', raw: true }, 'Cannot be eaten raw. Four portions once Maud has it.');
fd('honey', 'Honeycomb', 1, 1, 30, .3, 'jar', 18, 0, 1, { col: '#c89a3a', key: 8 }, 'Sweet, and good on a wound.');
fd('waterskin', 'Waterskin', 1, 2, 12, 1, 'skin', 0, 40, 0, { use: 2.5, pool: 3, key: 7 }, 'Three long drinks. Refilled each night at the Hollow.');
fd('ale', 'Small Ale', 1, 1, 9, .5, 'mug', 5, 22, 0, { use: 2, stack: 2, key: 7, fx: { stam: 60 } }, 'Wets the throat. Wind returns faster for a while.');
fd('wine', 'Gascon Wine', 1, 2, 48, 1, 'bottle', 4, 18, 0, { use: 2.5, key: 7, fx: { pain: 40 } }, 'The abbot\'s. Takes the edge off a wound.');

// ---------------------------------------------------------------- materials, tools
function mt(id, name, w, h, value, weight, icon, col, desc, x) { add(id, name, 'mat', w, h, value, weight, icon, Object.assign({ col }, x), desc); }
mt('timber', 'Seasoned Timber', 1, 2, 6, 1.5, 'plank', '#7a5632', 'Unburnt wood. The shelter is built of this.', { stack: 4 });
mt('nails', 'Handful of Nails', 1, 1, 8, .2, 'nails', '#70757a', 'Pulled from burnt timbers.', { stack: 6 });
mt('iron_ingot', 'Iron Bloom', 1, 1, 30, 1.5, 'ingot', '#5f656b', 'The smith always wants iron.', { stack: 3 });
mt('cloth', 'Linen Scraps', 1, 1, 5, .1, 'rag', '#c9c0a6', 'Clean enough to boil into bandages.', { stack: 6 });
mt('rope', 'Hemp Rope', 1, 2, 10, .6, 'rope', '#a08a58', 'Lashings, snares, a well-rope.', { stack: 2 });
mt('herbs', 'Yarrow', 1, 1, 8, .05, 'herb', '#6f8a4a', 'Staunches blood. Maud knows what to do with it.', { stack: 6 });
mt('leather', 'Cured Hide', 2, 1, 14, .8, 'hide', '#6a4a2e', 'Straps, belts, shoe-soles.', { stack: 2 });
mt('pitch', 'Pot of Pitch', 1, 1, 9, .6, 'jar', '#1c1814', 'Seals a barrel, a roof or a wound you do not expect to keep.');
mt('charcoal', 'Charcoal', 1, 1, 4, .3, 'coal', '#2a2826', 'The colliers\' whole trade. Osric\'s forge eats it.', { stack: 4 });
mt('tallow', 'Tallow Candles', 1, 1, 6, .2, 'candle', '#cdbf96', 'Light for the cellar.', { stack: 4 });
mt('flint', 'Flint and Steel', 1, 1, 12, .1, 'flint', '#5a5a58', 'Fire, when you want it.');
add('whetstone', 'Whetstone', 'tool', 1, 1, 20, .3, 'stone', { use: 6, key: 9, pool: 4, col: '#7a7c78' }, 'Four good sharpenings. Puts an edge back on a weapon, even in the field.');
add('hammer', 'Claw Hammer', 'tool', 1, 2, 25, .8, 'toolh', {}, 'Building needs one.');
add('saw', 'Frame Saw', 'tool', 1, 3, 35, 1, 'saw', {}, 'For anything bigger than a shelf.');
add('tongs', 'Smith\'s Tongs', 'tool', 1, 2, 30, .9, 'tongs', {}, 'Osric lost his when the forge was taken.');
add('needle', 'Needle and Awl', 'tool', 1, 1, 20, .05, 'needle', {}, 'Leatherwork and wound-work.');

// ---------------------------------------------------------------- valuables, papers, keys
function lt(id, name, w, h, value, weight, icon, col, desc, x) { add(id, name, 'loot', w, h, value, weight, icon, Object.assign({ col }, x), desc); }
lt('coin', 'Silver Pennies', 1, 1, 1, .01, 'coin', '#b9b9b0', 'Clipped and worn. Counted into your purse when you get out.', { stack: 200 });
lt('tally', 'Muster Tally', 1, 1, 8, .05, 'tally', '#8a6a42', 'A notched stick the Duke\'s paymasters give each man. Proof of a dead raider.', { stack: 10 });
lt('silver_ring', 'Silver Ring', 1, 1, 60, .05, 'ring', '#c9c9c0', 'Still warm, or you imagine it.');
lt('rosary', 'Wooden Rosary', 1, 1, 18, .05, 'beads', '#6b4a2b', 'Prayed smooth.');
lt('comb', 'Ivory Comb', 1, 1, 55, .05, 'comb', '#e0d8c0', 'Walrus ivory, carved with hounds.');
lt('amber', 'Amber Beads', 1, 1, 75, .05, 'beads', '#c8862a', 'Baltic amber on a silk cord.');
lt('candlestick', 'Pewter Candlestick', 1, 2, 45, .8, 'candle', '#8a8f94', 'From someone\'s table.');
lt('goblet', 'Silver Goblet', 1, 1, 95, .4, 'goblet', '#c9c9c0', 'Dented. Still silver.');
lt('spice', 'Pouch of Pepper', 1, 1, 85, .1, 'pouch', '#7a3b20', 'Worth more than the man who carried it.');
lt('saffron', 'Saffron', 1, 1, 160, .05, 'pouch', '#c8641e', 'A pinch flavours a feast. This is a fistful.');
lt('silk', 'Bolt of Silk', 2, 1, 130, .6, 'cloth', '#7b2f4a', 'Come a long way to end up here.');
lt('wolf_pelt', 'Wolf Pelt', 2, 2, 70, 1.5, 'pelt', '#6e6a62', 'Stinks. Sells.');
lt('tusk', 'Boar Tusk', 1, 1, 20, .1, 'tusk', '#d8d0b8', 'A hand long and sharp as a sickle.');
lt('antler', 'Antler', 2, 1, 26, .6, 'antler', '#b8a888', 'Knife handles, combs, dice.');
lt('reliquary', 'Reliquary', 2, 1, 240, 1, 'box', '#b89a3e', 'A saint\'s finger bone in gilt. The Church pays to have it back.');
lt('psalter', 'Illuminated Psalter', 1, 2, 260, .8, 'book', '#2a3f5a', 'A year of a monk\'s life in blue and gold.');
lt('chalice', 'Gold Chalice', 1, 2, 340, .9, 'goblet', '#c8a83a', 'Mass was said with this.');
lt('gold_cross', 'Altar Cross', 1, 2, 380, 1.2, 'cross', '#c8a83a', 'Gilt, with garnets. Heavy as guilt.');
lt('plate', 'Silver Dish', 2, 2, 240, 1.5, 'dish', '#c9c9c0', 'A lord\'s table service.');
lt('tapestry', 'Tapestry', 2, 3, 300, 3, 'tapestry', '#5a2a3a', 'A hunt in wool and silk. Rolled, it fills a pack.');
lt('dispatch', 'Raider\'s Dispatch', 1, 1, 45, .02, 'scroll', '#d8cfae', 'Orders, counts, a list of villages. Someone will pay to read it.');
lt('writ', 'Ducal Writ', 1, 2, 150, .05, 'scroll', '#d8cfae', 'The Duke\'s seal on it. What it grants, and to whom, is worth knowing.');
lt('ledger', 'Tithe Ledger', 1, 2, 150, .6, 'book', '#4a2f22', 'Who owed what to whom in Dunmere. Someone still cares.', { quest: true });
lt('relic', 'Finger of St Osyth', 1, 1, 500, .05, 'bone', '#e0d8c0', 'She carried her own head three furlongs. This is what is left.', { quest: true });
lt('seal', 'Abbot\'s Seal', 1, 1, 220, .2, 'ring', '#8a5a2a', 'Bronze matrix of the abbey seal. Hob has been sealing his own letters with it.', { quest: true });
lt('edric_ring', 'Edric\'s Ring', 1, 1, 30, .05, 'ring', '#8a8a80', 'Iron, hammered by a smith for his son.', { quest: true });
lt('signet', 'The Flayer\'s Signet', 1, 1, 400, .05, 'ring', '#b89a3e', 'Captain Aldric\'s seal. Proof he is dead.', { quest: true });
function key(id, name, value, desc) { add(id, name, 'key', 1, 1, value, .05, 'key', {}, desc); }
key('reeve_key', 'Reeve\'s Key', 90, 'Opens the strongroom of the Reeve\'s Hall in Dunmere.');
key('undercroft_key', 'Undercroft Key', 70, 'Opens the undercroft of the tithe barn in Dunmere.');
key('sacristy_key', 'Sacristy Key', 180, 'Opens the sacristy of the abbey church.');
key('infirmary_key', 'Dispensary Key', 150, 'Opens the locked dispensary in the abbey infirmary.');
key('crypt_key', 'Crypt Key', 220, 'Opens the crypt beneath St Osyth\'s.');
key('postern_key', 'Postern Key', 260, 'Opens the postern gate in the east wall of the Hold.');
key('armoury_key', 'Armoury Key', 300, 'Opens the armoury in the outer bailey of the Hold.');
key('dungeon_key', 'Gaoler\'s Key', 240, 'Opens the cells of the Hold.');
key('strongroom_key', 'Strongroom Key', 400, 'Opens the strongroom of the keep.');

// ---------------------------------------------------------------- enemies
// faction: bandit (hill folk; leave gleaners alone), raider (the Duke's stragglers and the garrison), beast
const kit = o => o;
G.ENEMIES = {
  // not an enemy: one of your own village, roped and kept by the men who burned it. Cut loose, they run for a way out.
  captive: { name: 'captive', faction: 'folk', hp: .6, skill: 0, speed: 1, courage: 0, view: 0, hear: 0, xp: 0, loot: null, captive: true, kit: kit({}) },
  bandit: {
    name: 'bandit', faction: 'bandit', hp: .7, skill: .22, speed: .95, courage: .35, view: 250, hear: 1, xp: 40, loot: 'pockets_poor',
    kit: kit({ weapon: [['cudgel', 3], ['rusty_knife', 3], ['hatchet', 2], ['pitchfork', 2], ['quarterstaff', 2], ['seax', 1]], body: [[null, 5], ['leather_jack', 2], ['gambeson', 1]], head: [[null, 6], ['coif', 1]], pack: [[null, 5], ['sack', 2]], belt: [[null, 3], ['rope_belt', 2]] })
  },
  cutthroat: {
    name: 'cutthroat', faction: 'bandit', hp: .85, skill: .4, speed: 1, courage: .55, view: 270, hear: 1.1, xp: 75, loot: 'pockets',
    kit: kit({ weapon: [['falchion', 3], ['seax', 2], ['hatchet', 2], ['spear', 2], ['war_axe', 1], ['mace', .5]], off: [[null, 3], ['buckler', 2], ['round_shield', 1]], body: [['leather_jack', 3], ['gambeson', 3], [null, 1]], head: [[null, 3], ['coif', 2], ['nasal_helm', 2]], legs: [[null, 4], ['padded_chausses', 1]], pack: [[null, 3], ['sack', 2], ['satchel', 1]], belt: [['rope_belt', 2], ['leather_belt', 1], [null, 2]] })
  },
  raider: {
    name: 'raider', faction: 'raider', hp: 1, skill: .55, speed: 1, courage: .7, view: 290, hear: 1.1, xp: 110, loot: 'pockets',
    kit: kit({ weapon: [['spear', 3], ['arming_sword', 2], ['falchion', 3], ['war_axe', 2], ['mace', 1], ['billhook', 1]], off: [[null, 2], ['round_shield', 2], ['buckler', 1], ['kite_shield', .6]], body: [[null, 1], ['gambeson', 6], ['mail_hauberk', 1.2], ['leather_jack', 2]], head: [[null, 2], ['coif', 2], ['nasal_helm', 2], ['kettle_helm', 3]], legs: [[null, 4], ['padded_chausses', 2]], pack: [[null, 5], ['satchel', 1], ['sack', 1]], belt: [['leather_belt', 2], [null, 2]] })
  },
  bowman: {
    name: 'bowman', faction: 'raider', hp: .85, skill: .5, speed: 1, courage: .5, view: 340, hear: 1.1, xp: 110, loot: 'pockets', archer: true,
    kit: kit({ weapon: [['bow', 3], ['longbow', 1]], side: [['dagger', 2], ['hatchet', 1], ['seax', 1]], body: [[null, 2], ['gambeson', 2], ['leather_jack', 2]], head: [[null, 3], ['coif', 2], ['nasal_helm', 1]], belt: [['leather_belt', 1], ['rope_belt', 1]] }),
    stacks: [['arrow', 5, 12, 1], ['bodkin', 3, 8, .3]]
  },
  sergeant: {
    name: 'sergeant', faction: 'raider', hp: 1.1, skill: .75, speed: 1, courage: .95, view: 300, hear: 1.2, xp: 220, loot: 'pockets_rich', kicks: true,
    kit: kit({ weapon: [['longsword', 3], ['mace', 2], ['arming_sword', 2], ['halberd', 1.5], ['warhammer', 1], ['poleaxe', .5]], off: [[null, 1], ['heater_shield', 2], ['kite_shield', 2]], body: [['mail_hauberk', 3], ['brigandine', 2]], head: [['kettle_helm', 2], ['bascinet', 1.2]], legs: [['padded_chausses', 2], ['mail_chausses', 2]], belt: [['pouch_belt', 1], ['leather_belt', 2]] })
  },
  crossbowman: {
    name: 'crossbowman', faction: 'raider', hp: .95, skill: .65, speed: 1, courage: .7, view: 380, hear: 1.2, xp: 200, loot: 'pockets', archer: true,
    kit: kit({ weapon: [['crossbow', 1]], side: [['arming_sword', 1], ['dagger', 2], ['mace', 1]], body: [['gambeson', 2], ['mail_hauberk', 2], ['brigandine', 1]], head: [['kettle_helm', 3], ['nasal_helm', 1]], legs: [[null, 1], ['padded_chausses', 2]], belt: [['leather_belt', 2], ['pouch_belt', 1]] }),
    stacks: [['bolt', 5, 12, 1]]
  },
  knight: {
    name: 'household knight', faction: 'raider', hp: 1.25, skill: .88, speed: .95, courage: 1, view: 300, hear: 1, xp: 400, loot: 'pockets_rich', kicks: true,
    kit: kit({ weapon: [['longsword', 2], ['poleaxe', 2], ['warhammer', 1.5], ['estoc', 1]], off: [[null, 2], ['heater_shield', 1]], body: [['plate_harness', 3], ['brigandine', 1]], head: [['great_helm', 2], ['bascinet', 2]], legs: [['plate_greaves', 3], ['mail_chausses', 1]], belt: [['pouch_belt', 2], ['baldric', .4]] })
  },
  tom: {
    name: 'Black Tom', proper: true, boss: true, faction: 'bandit', hp: 1.3, skill: .68, speed: 1, courage: 1, view: 300, hear: 1.2, xp: 600, loot: 'pockets_rich', kicks: true, extra: ['reeve_key'],
    kit: kit({ weapon: [['falchion', 1]], off: [['round_shield', 1]], body: [['mail_hauberk', 1], ['gambeson', 1], ['brigandine', .5]], head: [['kettle_helm', 1]], legs: [['padded_chausses', 1]], belt: [['pouch_belt', 1]], pack: [['satchel', 1]] })
  },
  hob: {
    name: 'Hob Crowmaster', proper: true, boss: true, faction: 'raider', hp: 1.4, skill: .82, speed: 1, courage: 1, view: 310, hear: 1.2, xp: 900, loot: 'pockets_rich', kicks: true, extra: ['crypt_key', 'seal'],
    kit: kit({ weapon: [['halberd', 1]], body: [['mail_hauberk', 1], ['brigandine', 1]], head: [['bascinet', 1]], legs: [['mail_chausses', 1]], belt: [['pouch_belt', 1]] })
  },
  aldric: {
    name: 'Captain Aldric', proper: true, boss: true, faction: 'raider', hp: 1.5, skill: .93, speed: .95, courage: 1, view: 320, hear: 1.2, xp: 1500, loot: 'pockets_rich', kicks: true, extra: ['signet', 'strongroom_key'],
    kit: kit({ weapon: [['poleaxe', 1]], body: [['plate_harness', 1]], head: [['great_helm', 1], ['bascinet', 1]], legs: [['plate_greaves', 1]], belt: [['baldric', 1]] })
  },
  wolf: { name: 'wolf', faction: 'beast', hp: .5, skill: .3, speed: 1.5, courage: .45, view: 300, hear: 1.6, xp: 50, loot: 'wolf', natural: 'bite', quad: { len: .9, h: .55, col: 0x5d5a54, fat: 1 }, noBlock: true, lunge: 2.2, r: 5, kit: {} },
  hound: { name: 'war hound', faction: 'raider', hp: .6, skill: .4, speed: 1.6, courage: .95, view: 300, hear: 1.8, xp: 60, loot: 'none', natural: 'bite', quad: { len: .95, h: .62, col: 0x3a3028, fat: 1.15 }, noBlock: true, lunge: 2.3, r: 5, kit: {} },
  boar: { name: 'boar', faction: 'beast', hp: .95, skill: .25, speed: 1.3, courage: .95, view: 200, hear: 1.2, xp: 70, loot: 'boar', natural: 'tusk', quad: { len: 1.05, h: .58, col: 0x3a2e24, tusk: true, fat: 1.35 }, noBlock: true, lunge: 2.6, r: 7, kit: {} },
  deer: { name: 'deer', faction: 'beast', hp: .45, skill: 0, speed: 1.75, courage: 0, view: 330, hear: 1.8, xp: 30, loot: 'deer', natural: 'bite', quad: { len: 1.15, h: .95, col: 0x7a5a3c, antler: true, fat: .85 }, noBlock: true, passive: true, r: 7, kit: {} }
};

// ---------------------------------------------------------------- loot tables
// entry: [id, weight, min, max, minTier, maxTier]. Tier 1 = Dunmere, 2 = the Abbey, 3 = the Hold.
G.LOOT = {
  chest: { rolls: [2, 4], items: [['coin', 6, 15, 60], ['silver_ring', 2], ['goblet', 1.5], ['candlestick', 2], ['rosary', 2], ['spice', 1], ['silk', .8], ['dagger', 1], ['tincture', .6], ['comb', 1], ['amber', .8, 1, 1, 2], ['psalter', .3, 1, 1, 2], ['saffron', .4, 1, 1, 2], ['leather_belt', .8], ['wine', .8, 1, 1, 2]] },
  crate: { rolls: [1, 3], items: [['bandage', 4, 1, 2], ['salve', 2], ['poultice', 1], ['splint', 1.2], ['salt_pork', 3], ['bread', 3, 1, 2], ['ale', 2.5], ['nails', 3, 1, 3], ['iron_ingot', 2], ['tallow', 2], ['hatchet', 1], ['arrow', 2, 4, 10], ['timber', 3, 1, 2], ['cloth', 3, 1, 3], ['rope', 1.5], ['grain', 1.2], ['leather', 1.2], ['pitch', 1], ['charcoal', 1.5, 1, 3], ['waterskin', 1], ['bolt', 1, 3, 8, 2]] },
  sack: { rolls: [1, 2], items: [['bread', 4, 1, 2], ['turnip', 4, 1, 3], ['salt_pork', 2], ['tallow', 2], ['nails', 2], ['coin', 2, 3, 15], ['rosary', 1], ['grain', 2], ['cloth', 2, 1, 2], ['herbs', 1], ['apple', 3, 1, 3], ['dried_fish', 2, 1, 2], ['cheese', 1.5], [null, 2]] },
  barrel: { rolls: [1, 2], items: [['ale', 4, 1, 2], ['salt_pork', 3], ['dried_fish', 3, 1, 3], ['apple', 3, 1, 4], ['grain', 2], ['wine', 1.2, 1, 1, 2], ['pitch', 1], ['cheese', 1.5], [null, 2]] },
  rack: { rolls: [1, 2], items: [['cudgel', 2, 1, 1, 1, 2], ['hatchet', 2, 1, 1, 1, 2], ['quarterstaff', 2], ['spear', 2], ['falchion', 1.5], ['seax', 1.5], ['arming_sword', 1], ['mace', .8], ['war_axe', 1, 1, 1, 2], ['buckler', 1.5], ['round_shield', 1.5], ['kite_shield', .8, 1, 1, 2], ['coif', 1.5], ['nasal_helm', 1.2], ['kettle_helm', 1, 1, 1, 2], ['gambeson', 1], ['billhook', 1], ['bow', 1], ['arrow', 2, 6, 14], ['bodkin', .8, 4, 8, 2], ['whetstone', 1]] },
  armoury: { rolls: [2, 3], items: [['arming_sword', 2], ['longsword', 1.2], ['estoc', .7, 1, 1, 3], ['mace', 1.5], ['warhammer', 1, 1, 1, 2], ['war_axe', 1.5], ['halberd', 1], ['poleaxe', .5, 1, 1, 3], ['crossbow', .8], ['bolt', 2, 6, 12], ['longbow', .8], ['bodkin', 2, 6, 12], ['mail_hauberk', .8], ['brigandine', .6, 1, 1, 3], ['kettle_helm', 1.5], ['bascinet', .7], ['great_helm', .25, 1, 1, 3], ['mail_chausses', .8], ['plate_greaves', .3, 1, 1, 3], ['heater_shield', 1], ['kite_shield', 1], ['whetstone', 1.5], ['pouch_belt', .8]] },
  toolbox: { rolls: [2, 3], items: [['nails', 4, 2, 5], ['hammer', 1.5], ['saw', 1], ['tongs', 1], ['needle', 1.2], ['whetstone', 1.5], ['flint', 1.5], ['rope', 2], ['pitch', 1.5], ['leather', 2], ['iron_ingot', 2, 1, 2], ['charcoal', 2, 1, 3], ['timber', 2, 1, 2]] },
  desk: { rolls: [1, 3], items: [['coin', 3, 10, 40], ['dispatch', 2, 1, 1, 2], ['dispatch', 1], ['writ', .4, 1, 1, 3], ['rosary', 1], ['tallow', 2], ['psalter', .5, 1, 1, 2], ['silver_ring', .8], ['comb', .8], [null, 2]] },
  medchest: { rolls: [2, 3], items: [['bandage', 4, 1, 3], ['ligature', 2.5], ['salve', 3], ['poultice', 2], ['splint', 2], ['willow', 3, 1, 3], ['tincture', 1], ['surgeon_roll', .5], ['herbs', 2, 1, 3], ['honey', 1], ['cloth', 2, 1, 3]] },
  dispensary: { rolls: [3, 5], items: [['poultice', 3], ['tincture', 2.5], ['surgeon_roll', 2], ['ligature', 2, 1, 2], ['splint', 1.5], ['honey', 1.5], ['saffron', .8], ['wine', 1], ['bandage', 2, 2, 3]] },
  altar: { rolls: [1, 3], items: [['candlestick', 3], ['rosary', 3], ['goblet', 2], ['chalice', .8, 1, 1, 2], ['gold_cross', .4, 1, 1, 2], ['psalter', .8], ['reliquary', .5], ['coin', 2, 5, 30], ['tallow', 2, 1, 3], ['wine', 1]] },
  coffer: { rolls: [3, 5], items: [['coin', 5, 60, 200], ['silver_ring', 2], ['amber', 2], ['chalice', 1, 1, 1, 2], ['gold_cross', .8, 1, 1, 2], ['plate', 1.2], ['saffron', 1.2], ['silk', 1.5], ['spice', 1.5], ['psalter', .8], ['tapestry', .5], ['writ', .6, 1, 1, 3], ['goblet', 2], ['reliquary', .8]] },
  cache: { rolls: [2, 3], items: [['coin', 4, 20, 80], ['silver_ring', 2], ['amber', 1.5], ['dagger', 1], ['tincture', 1], ['spice', 1], ['bodkin', 1, 4, 8], ['comb', 1], ['goblet', 1], ['whetstone', 1]] },
  courier: { rolls: [2, 3], items: [['dispatch', 3], ['coin', 3, 10, 40], ['writ', .5, 1, 1, 3], ['waterskin', 1], ['bread', 1], ['dagger', .8], ['tally', 1, 1, 3], ['leather_belt', .6]] },
  remains: { rolls: [1, 2], items: [['coin', 4, 2, 20], ['rosary', 2], ['bandage', 2], ['rusty_knife', 2], ['silver_ring', 1], ['bread', 1], ['cloth', 2, 1, 2], ['rope', 1], ['willow', 1], [null, 2]] },
  woodpile: { rolls: [2, 3], items: [['timber', 5, 1, 3], ['nails', 1, 1, 3], ['charcoal', 1, 1, 2]] },
  herbpatch: { rolls: [1, 2], items: [['herbs', 3, 1, 3], ['willow', 1, 1, 2]] },
  pockets_poor: { rolls: [0, 2], items: [['coin', 4, 1, 9], ['bread', 3], ['turnip', 2], ['bandage', 1], ['tallow', 1], ['nails', 1], ['rosary', 1], ['ale', 1], ['cloth', 1], ['apple', 2], ['willow', 1]] },
  pockets: { rolls: [1, 3], items: [['coin', 5, 5, 25], ['bandage', 3], ['bread', 2], ['ale', 2], ['salt_pork', 2], ['salve', 1.5], ['splint', .7], ['silver_ring', .6], ['spice', .3], ['tally', 4, 1, 2], ['cloth', 1], ['rope', .5], ['ligature', 1], ['dispatch', .5], ['whetstone', .6], ['cheese', 1]] },
  pockets_rich: { rolls: [2, 4], items: [['coin', 5, 20, 70], ['bandage', 2, 1, 2], ['poultice', 2], ['tincture', 1], ['silver_ring', 1.5], ['goblet', 1], ['spice', 1], ['tally', 4, 2, 4], ['ligature', 1.5], ['amber', .8], ['dispatch', 1], ['whetstone', 1], ['wine', .8]] },
  wolf: { rolls: [1, 1], items: [['wolf_pelt', 1]] },
  boar: { rolls: [2, 3], items: [['venison', 3, 1, 2], ['tusk', 1]] },
  deer: { rolls: [2, 3], items: [['venison', 3, 1, 2], ['antler', 1]] },
  none: { rolls: [0, 0], items: [[null, 1]] },
  // what the boy brings back when sent out, by purse
  boy1: { rolls: [2, 4], items: [['bread', 3, 1, 2], ['turnip', 3, 1, 3], ['apple', 2, 1, 3], ['timber', 3, 1, 2], ['cloth', 3, 1, 2], ['nails', 2, 1, 3], ['herbs', 2, 1, 2], ['bandage', 2], ['rosary', 1], ['coin', 2, 5, 20], ['rope', 1]] },
  boy2: { rolls: [3, 5], items: [['salt_pork', 3], ['grain', 2], ['iron_ingot', 2], ['leather', 2], ['salve', 2], ['poultice', 1], ['arrow', 2, 6, 12], ['silver_ring', 1], ['candlestick', 1], ['tally', 2, 1, 3], ['whetstone', 1], ['coin', 2, 20, 50], ['seax', 1], ['coif', 1]] },
  boy3: { rolls: [4, 6], items: [['goblet', 2], ['amber', 2], ['spice', 2], ['silk', 1], ['dispatch', 2], ['tincture', 2], ['ligature', 2], ['bodkin', 2, 6, 12], ['arming_sword', .8], ['kettle_helm', .8], ['psalter', .5], ['coin', 3, 50, 120], ['saffron', .6], ['surgeon_roll', .6]] }
};

// ---------------------------------------------------------------- small cases, names, and what the letters say
add('keyring', 'Key Ring', 'case', 1, 1, 120, .1, 'keyring', { cw: 3, ch: 2, only: 'key' }, 'Six keys in the space of one. Right-click to open it. Keep it in the hidden pouch.');
G.LOOT.desk.items.push(['keyring', .4, 1, 1, 2]); G.LOOT.courier.items.push(['keyring', .3]); G.LOOT.pockets_rich.items.push(['keyring', .25]);
G.NAMES = ['Wulf', 'Edric', 'Hal', 'Odo', 'Garth', 'Ned', 'Piers', 'Rolf', 'Tam', 'Giles', 'Hob', 'Alf', 'Cuthbert', 'Dunstan', 'Godric', 'Hugh', 'Jankin', 'Osbert', 'Perkin', 'Ralf', 'Simkin', 'Thurstan', 'Wat', 'Wilkin', 'Ymbert', 'Aubrey', 'Bertram', 'Colin', 'Diggory', 'Emmot', 'Fulk', 'Gervase', 'Hamo', 'Ivo', 'Lambert', 'Miles', 'Noll', 'Pagan', 'Ranulf', 'Sweyn'];
G.LETTERS = [
  'To the captain at the Hold: the fen company has sent no tithe of plunder these ten days. Hob grows too large for his boots.',
  'The host is at the river and will not turn back for you. Winter where you are. Hold what you hold.',
  'Count of Dunmere: forty hearths burnt, the grain taken, nineteen villeins for the ransom carts. The reeve hanged.',
  'Send no more men by the south ford. Someone is killing them and stripping the bodies. Local, I think.',
  'The postern key is with the pedlar woman, or she knows who has it. Find her.',
  'Tom Reave may keep the village so long as a third comes up to the Hold each week. If it does not, burn him out.',
  'The smith\'s boy is strong and can work iron. Keep him alive in the cells. Break the others on the wall.',
  'The abbot\'s plate was not all found. The infirmarer was out of the house that day. Find him.',
  'Quarrels are short. Have the fletcher make more, or have him flogged.',
  'His lordship\'s writ lies in the great hall. It is not to leave the castle while he lives.',
  'There are people living under the burnt tavern. Leave them until spring. They are bringing the bandits\' takings out for us, body by body.'
];
