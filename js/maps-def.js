'use strict';
// The three places of the March, in rising order of danger and reward.
//   Dunmere        — your burnt village. Hill bandits under Black Tom, a few of the Duke's stragglers, wolves.
//   St Osyth's     — the abbey in the fen, fortified by the Crow Company under Hob Crowmaster.
//   Aldric's Hold  — the castle. A garrison in mail and plate, crossbows on every gate, and the Flayer himself.
(function () {
  const TL = G.TILE, PI = Math.PI;

  // ======================================================================================== DUNMERE
  G.defMap({
    id: 'dunmere', name: 'Dunmere', sub: 'your village', tier: 1, w: 120, h: 120, seed: 7741, minutes: 18, hub: [60, 70], bossAt: [55, 27],
    danger: 'Low. Bandits, a few raiders, wolves.',
    blurb: 'Where you were born. The hill bandits strip it house by house and answer to Black Tom in the Reeve\'s Hall. Food, timber and plain arms; little of real worth outside Tom\'s strongroom.',
    env: { fog: 0x8a8f8c, dens: .016, mist: .006, damp: .16, stone: [1, .96, .9], trees: [.45, .4, .15], grass: [.8, 1, .32], leaf: [.55, 1, .45], weather: [['overcast', 3], ['rain', 4], ['storm', 1], ['fog', 1], ['clear', 1.5]] },
    keys: ['undercroft_key'],
    starts: [
      { id: 'south', name: 'The South Ford', x: 60, y: 113, desc: 'The way the army came. A long straight road to the green, watched from the cottages.' },
      { id: 'west', name: 'The Charcoal Trail', x: 6, y: 70, desc: 'Through the western woods, past the tithe barn and the smithy. Wolves den near here.' },
      { id: 'east', name: 'The Mill Road', x: 113, y: 70, desc: 'In by the mill pond, under the parish church. The east camp is close.' }
    ],
    exits: [
      { id: 'oldroad', name: 'The Old Road', x: 60, y: 6, dir: 'north' },
      { id: 'ferry', name: 'The Ferryman', x: 108, y: 97, dir: 'south-east', cost: 30, note: 'he is paid when you are home' },
      { id: 'collier', name: 'The Collier\'s Cart', x: 6, y: 70, dir: 'west', late: 9, notFrom: ['west'] },
      { id: 'ford', name: 'The South Ford', x: 60, y: 113, dir: 'south', late: 9, notFrom: ['south'] },
      { id: 'millroad', name: 'The Mill Road', x: 113, y: 70, dir: 'east', late: 9, notFrom: ['east'] }
    ],
    terrain(x, y, B) {
      const n = B.vn(x / 9, y / 9) * .7 + B.vn(x / 3.5 + 5, y / 3.5 + 5) * .3, bowl = Math.hypot(x - 60, y - 66) / 60;
      if (n + bowl * .3 > .72 && B.R() < .8) return TL.TREE;
      if (n + bowl * .25 > .64 && B.R() < .16) return TL.BUSH;
      if (B.vn(x / 6 + 3, y / 6 + 7) < .22) return TL.DIRT;
      return TL.GRASS;
    },
    build(B) {
      const { V, th } = B, cont = B.cont, sp = B.sp;
      B.disc(60, 70, 8); B.disc(60, 70, 4, TL.DIRT, true);
      B.disc(27, 84, 9); B.disc(27, 98, 4, TL.DIRT, true);
      B.disc(100, 95, 5, TL.WATER, true); B.disc(104, 91, 3, TL.WATER, true);
      B.disc(87, 56, 5);

      // ---- the Reeve's Hall: Black Tom's court. Roofless since the fire; the strongroom at the east end still locks.
      const hall = B.building({ x: 50, y: 22, w: 18, h: 12, kind: 'hall' }, TL.SWALL, TL.STONE, 0, null, 4.6);
      B.wall(62, 23, 62, 32, TL.SWALL, 4.6); B.lockDoor(62, 28, 'reeve_key', 'the Reeve\'s strongroom');
      B.door(hall, 1, 56, true); B.set(53, 22, TL.DIRT); B.set(54, 22, TL.DIRT); hall.doors.push({ x: 53, y: 20 });
      cont('chest', B.spot(51, 23, 61, 32)); cont('desk', B.spot(51, 23, 55, 26)); cont('sack', B.spot(51, 23, 61, 32)); cont('crate', B.spot(51, 23, 61, 32)); cont('barrel', B.spot(51, 28, 61, 32));
      cont('coffer', B.spot(63, 23, 66, 26)); cont('chest', B.spot(63, 27, 66, 32)); cont('rack', B.spot(63, 27, 66, 32), { tier: 2 });
      const tom = sp('tom', B.spot(53, 25, 58, 29), { chance: .7, boss: true });
      if (tom) { sp('cutthroat', B.spot(52, 24, 60, 31), { follow: tom, boss: true }); sp('cutthroat', B.spot(52, 24, 60, 31), { follow: tom, boss: true }); }
      else { sp('cutthroat', B.spot(52, 24, 60, 31)); sp('cutthroat', B.spot(52, 24, 60, 31)); sp('bandit', B.spot(52, 24, 60, 31)); }
      sp('bandit', B.at(55, 35), { post: true, face: PI / 2 }); sp('cutthroat', B.at(58, 35), { post: true, face: PI / 2 });
      B.fire(54, 36, 'brazier'); B.fire(59, 36, 'brazier');
      B.label(59, 19, 'The Reeve\'s Hall'); B.zone('reeve', 'The Reeve\'s Hall', 58, 28, 9);

      // ---- the village: [x, y, w, h, door side, roofed]
      const cottages = [[44, 58, 8, 7, 3, 1], [68, 58, 9, 6, 2, 0], [45, 76, 7, 6, 3, 0], [68, 76, 8, 7, 2, 1], [50, 90, 7, 6, 3, 0], [64, 97, 8, 6, 2, 0], [28, 60, 8, 6, 1, 1], [16, 73, 7, 6, 3, 0], [84, 73, 8, 6, 0, 0]];
      cottages.forEach((c, i) => {
        const b = B.building({ x: c[0], y: c[1], w: c[2], h: c[3], kind: 'cottage' }, TL.WWALL, TL.WOOD, c[5] ? 0 : .13);
        B.door(b, c[4]); if (!c[5] && i % 2) B.door(b, c[4] ^ 1);
        cont(i % 2 ? 'sack' : 'crate', B.inner(b)); if (i % 3 !== 1) cont(i % 4 === 0 ? 'chest' : 'sack', B.inner(b)); if (i % 4 === 2) cont('remains', B.inner(b)); if (i % 3 === 0) cont('barrel', B.inner(b));
        if (i % 2 === 0) cont('woodpile', B.near(b.doors[0].x, b.doors[0].y, 1));
        if (V() < .5 + .07 * th) B.grp(b, V() < .3 ? ['bandit', 'bandit', 'bandit'] : V() < .6 ? ['bandit', th > 1 && V() < .4 ? 'cutthroat' : 'bandit'] : ['bandit']);
      });
      const chapel = B.building({ x: 92, y: 50, w: 9, h: 13, kind: 'chapel' }, TL.SWALL, TL.STONE, 0, 'thatch', 5);
      B.door(chapel, 1); cont('altar', B.at(96, 52)); cont('chest', B.inner(chapel)); cont('desk', B.inner(chapel)); cont('remains', B.inner(chapel)); cont('sack', B.inner(chapel));
      B.grp(chapel, V() < .5 ? ['cutthroat', 'cutthroat', 'raider'] : ['cutthroat', 'raider', 'raider']);
      for (const [gx, gy] of [[84, 53], [86, 53], [88, 53], [84, 56], [86, 56], [88, 56], [85, 59], [87, 59]]) B.prop('grave', gx, gy, { rot: 0 });
      cont('remains', B.near(86, 55, 1)); cont('remains', B.near(87, 58, 1)); cont('herbpatch', B.near(83, 60, 1)); B.label(96, 47, 'The Parish Church'); B.zone('chapel', 'The Parish Church', 96, 56, 7);
      const smithy = B.building({ x: 33, y: 74, w: 8, h: 7, kind: 'smithy' }, TL.SWALL, TL.DIRT, .08);
      B.door(smithy, 0); B.door(smithy, 3); cont('rack', B.inner(smithy)); cont('rack', B.inner(smithy)); cont('toolbox', B.inner(smithy), { extra: ['tongs'] }); cont('crate', B.inner(smithy));
      B.prop('anvil', 36, 77); B.grp(smithy, ['cutthroat', 'bandit']); B.label(37, 83, 'The Smithy'); B.zone('smithy', 'The Smithy', 37, 77, 4);
      const barn = B.building({ x: 21, y: 86, w: 11, h: 8, kind: 'barn' }, TL.WWALL, TL.DIRT, .14);
      B.door(barn, 0); B.door(barn, 3); cont('crate', B.inner(barn)); cont('crate', B.inner(barn)); cont('sack', B.inner(barn)); cont('sack', B.inner(barn)); cont('woodpile', B.near(34, 88, 1));
      B.grp(barn, ['bandit', 'bandit', 'bandit']); B.label(26, 96, 'The Tithe Barn'); B.zone('barn', 'The Tithe Barn', 26, 90, 7);
      const under = B.building({ x: 13, y: 88, w: 6, h: 5, kind: 'undercroft' }, TL.SWALL, TL.STONE, 0, 'thatch', 3.2);
      B.lockDoor(18, 90, 'undercroft_key', 'the undercroft'); cont('barrel', B.inner(under)); cont('barrel', B.inner(under)); cont('crate', B.inner(under), { tier: 2 }); cont('toolbox', B.inner(under)); cont('chest', B.inner(under));
      for (const [hx, hy] of [[35, 91], [36, 94], [18, 82]]) B.prop('hay', hx, hy);
      sp('boar', B.near(27, 100, 2)); sp('boar', B.near(30, 101, 2), { chance: .6 });
      const mill = B.building({ x: 86, y: 88, w: 8, h: 7, kind: 'mill' }, TL.SWALL, TL.WOOD, 0);
      B.door(mill, 2); cont('crate', B.inner(mill)); cont('sack', B.inner(mill)); cont('barrel', B.inner(mill)); cont('chest', B.inner(mill)); B.grp(mill, V() < .5 ? ['bandit', 'bandit'] : ['cutthroat', 'bandit']); B.label(90, 98, 'The Mill'); B.zone('mill', 'The Mill', 90, 91, 6);
      // the green
      B.prop('well', 60, 70, { rot: 0 }); B.prop('gallows', 65, 66, { rot: .3 }); B.prop('stall', 55, 66); B.prop('stall', 56, 74); B.prop('cart', 63, 75); B.prop('barrel', 54, 68); B.prop('barrel', 57, 75);
      B.prop('cart', 58, 100); B.prop('barrel', 47, 61); B.prop('cart', 80, 69); B.prop('barrel', 40, 73);
      cont('crate', B.near(56, 67, 1)); cont('barrel', B.near(57, 73, 1)); cont('remains', B.near(65, 67, 1));
      sp('bandit', B.near(58, 68, 2)); sp('bandit', B.near(62, 72, 2), { chance: .6 }); sp('raider', B.near(61, 68, 2), { minTh: 4 }); sp('cutthroat', B.near(63, 71, 2), { minTh: 4 });
      B.label(60, 64, 'The Green'); B.zone('green', 'The Green', 60, 70, 8);
      // camps in the woods: bandits to the west, the Duke's tithe-takers to the east
      for (const [cx, cy, nm, id, men] of [[24, 32, 'West Camp', 'westcamp', ['bandit', 'bandit', 'cutthroat']], [97, 26, 'East Camp', 'eastcamp', ['raider', 'raider', 'raider']]]) {
        B.disc(cx, cy, 5); B.disc(cx, cy, 2, TL.DIRT, true); B.fire(cx, cy);
        B.world.buildings.push({ x: cx - 3, y: cy - 3, w: 7, h: 7, kind: 'camp', doors: [{ x: cx, y: cy + 4 }] });
        cont('crate', B.near(cx, cy, 2)); cont('sack', B.near(cx, cy, 2)); cont('rack', B.near(cx, cy, 3)); cont('barrel', B.near(cx, cy, 3));
        B.prop('tent', cx - 3, cy - 2, { rot: .6 }); B.prop('tent', cx + 3, cy - 2, { rot: -.6 }); B.prop('barrel', cx + 2, cy + 2);
        for (const m of men) sp(m, B.near(cx, cy, 2)); sp(id === 'eastcamp' ? 'sergeant' : 'cutthroat', B.near(cx, cy, 2), { minTh: 3 });
        B.label(cx, cy + 6, nm); B.zone(id, nm, cx, cy, 6);
      }
      // roads
      B.line(60, 115, 60, 70, 2); B.line(60, 70, 57, 36, 2); B.line(4, 70, 115, 70, 2);
      B.line(57, 36, 71, 36, 1); B.line(71, 36, 71, 14, 1); B.line(71, 14, 60, 6, 2);
      B.trail(24, 36, 30, 60); B.trail(97, 30, 96, 64); B.trail(27, 86, 30, 72); B.trail(86, 91, 80, 72); B.trail(48, 28, 26, 30); B.trail(71, 22, 94, 26); B.trail(94, 92, 107, 97);
      for (const b of B.world.buildings) if (b.kind === 'cottage') B.trail(b.doors[0].x, b.doors[0].y, b.doors[0].x < 60 ? 59 : 61, Math.max(40, Math.min(112, b.doors[0].y)));
      B.label(60, 3.6, 'The Old Road'); B.label(109, 101, 'Ferry');
      // the wild
      for (const [dx, dy] of [[17, 50], [103, 110], [32, 110]]) { B.disc(dx, dy, 3); const n = 2 + (V() < .5 ? 1 : 0); for (let j = 0; j < n; j++) sp('wolf', B.near(dx, dy, 2)); cont('remains', B.near(dx, dy, 2)); }
      for (const [dx, dy] of [[104, 40], [110, 82], [42, 44], [14, 100]]) { B.disc(dx, dy, 2); sp('deer', B.near(dx, dy, 2)); sp('deer', B.near(dx, dy, 2), { chance: .5 }); }
      for (const [rx, ry] of [[40, 45], [80, 44], [44, 104], [78, 108], [12, 96], [108, 44]]) cont('remains', B.near(rx, ry, 2));
      for (const [rx, ry] of [[38, 52], [76, 50], [48, 106], [100, 84], [14, 62], [72, 12]]) cont('herbpatch', B.near(rx, ry, 2));
      for (const [rx, ry] of [[46, 48], [82, 100], [12, 40]]) cont('cache', B.near(rx, ry, 1));
      cont('courier', B.near(62, 106, 1));
      const P1 = B.route([[60, 70], [57, 38], [96, 66], [62, 72]]), P2 = B.route([[30, 70], [27, 84], [42, 72], [58, 70]]), P3 = B.route([[60, 100], [60, 72], [84, 71], [60, 72]]);
      sp('bandit', B.near(58, 46, 2), { patrol: P1 }); sp(V() < .5 ? 'bandit' : 'cutthroat', B.near(60, 48, 2), { patrol: P1 }); sp('raider', B.near(59, 47, 2), { patrol: P1, minTh: 3 });
      sp('bandit', B.near(30, 70, 2), { patrol: P2 }); sp('bandit', B.near(31, 71, 2), { patrol: P2, chance: .6 });
      sp('cutthroat', B.near(60, 98, 2), { patrol: P3, minTh: 2 }); sp('bandit', B.near(61, 99, 2), { patrol: P3, minTh: 2 });
      // who comes later
      B.wave(300, [['bandit', 60, 114, 60, 74], ['bandit', 61, 114, 58, 72]]);
      B.wave(600, [['raider', 114, 70, 64, 70], ['raider', 114, 71, 62, 72], ['raider', 113, 70, 66, 69]]);
      B.wave(840, [['sergeant', 60, 5, 58, 40], ['raider', 61, 5, 56, 40]], 3);
    }
  });

  // ======================================================================================== ST OSYTH'S ABBEY
  G.defMap({
    id: 'abbey', name: 'St Osyth\'s Abbey', sub: 'the fen', tier: 2, w: 112, h: 112, seed: 30417, minutes: 22, hub: [55, 66], bossAt: [65, 29],
    danger: 'High. A raider company in mail, bowmen, war hounds.',
    blurb: 'A walled abbey on an island in the fen, taken by the Crow Company. Hob Crowmaster holds his musters in the church. Physic in the infirmary, plate in the sacristy, a saint in the crypt — all behind locks.',
    env: { masonry: 'ashlar', fog: 0x8d938c, dens: .021, mist: .016, damp: .34, stone: [1.14, 1.1, 1], trees: [.12, .64, .24], grass: [.85, .95, .4], leaf: [.6, .9, .4], weather: [['fog', 4], ['rain', 3], ['overcast', 2], ['storm', 1]] },
    keys: ['infirmary_key', 'sacristy_key'],
    starts: [
      { id: 'south', name: 'The Causeway', x: 56, y: 107, desc: 'The pilgrim road: over the Lode by the bridge and straight to the gatehouse. Watched.' },
      { id: 'west', name: 'The West Dyke', x: 5, y: 56, desc: 'Along the old flood bank to the breach in the north-west wall. Slow going through the fen.' },
      { id: 'north', name: 'Alder Carr', x: 56, y: 5, desc: 'Down through the alders behind the church. Far from any gate, close to the breach and the sluice.' }
    ],
    exits: [
      { id: 'carr', name: 'Alder Carr', x: 56, y: 5, dir: 'north', notFrom: ['north'] },
      { id: 'causeway', name: 'The Causeway', x: 56, y: 107, dir: 'south', notFrom: ['south'] },
      { id: 'dyke', name: 'The West Dyke', x: 5, y: 56, dir: 'west', notFrom: ['west'], late: 10 },
      { id: 'boat', name: 'The Fen Boat', x: 93, y: 86, dir: 'south-east', cost: 60, r: 2, note: 'he is paid when you are home' },
      { id: 'sluice', name: 'The Sluice', x: 100, y: 30, dir: 'north-east', nopack: true }
    ],
    terrain(x, y, B) {
      const R = B.R, n = B.vn(x / 8, y / 8) * .65 + B.vn(x / 3 + 7, y / 3 + 2) * .35, ry = 90 + Math.sin(x / 9) * 2.5;
      if (Math.abs(y - ry) < 1.6) return TL.DEEP;
      if (Math.abs(y - ry) < 3.2) return R() < .4 ? TL.REED : TL.WATER;
      if (x > 22 && x < 88 && y > 16 && y < 80) return n > .76 && R() < .3 ? TL.TREE : (B.vn(x / 5, y / 5) < .3 ? TL.DIRT : TL.GRASS);
      if (n > .66) return R() < .6 ? TL.TREE : TL.BUSH;
      if (n < .33) return R() < .25 ? TL.REED : TL.WATER;
      if (n < .42) return R() < .5 ? TL.REED : TL.MUD;
      if (n < .5) return TL.MUD;
      return R() < .08 ? TL.REED : TL.GRASS;
    },
    build(B) {
      const { V, th } = B, cont = B.cont, sp = B.sp, S = TL.SWALL;
      // ---- the precinct: wall, gatehouse, breach, water gate
      B.fill(27, 21, 83, 75, TL.GRASS, true);
      B.wall(26, 20, 84, 20, S, 3.6); B.wall(26, 76, 84, 76, S, 3.6); B.wall(26, 20, 26, 76, S, 3.6); B.wall(84, 20, 84, 76, S, 3.6);
      B.set(26, 28, TL.DIRT); B.set(26, 29, TL.DIRT); B.set(84, 52, TL.STONE);
      const gate = B.building({ x: 52, y: 74, w: 7, h: 5, kind: 'gate' }, S, TL.STONE, 0, 'slab', 5.2);
      B.door(gate, 0, 55, true); B.door(gate, 1, 55, true); B.fire(54, 72, 'brazier');
      sp('raider', B.at(54, 80), { post: true, face: PI / 2 }); sp('raider', B.at(57, 80), { post: true, face: PI / 2 }); sp('bowman', B.at(55, 76), { post: true, face: PI / 2 }); sp('sergeant', B.at(56, 72), { post: true, face: PI / 2, minTh: 2 });
      cont('rack', B.spot(53, 75, 57, 77)); B.label(55, 80.5, 'Gatehouse'); B.zone('gatehouse', 'The Gatehouse', 55, 76, 5);

      // ---- the church, with the sacristy on its north-east corner
      const ch = B.building({ x: 40, y: 24, w: 32, h: 11, kind: 'church' }, S, TL.STONE, 0, 'slab', 6.5);
      B.door(ch, 2, 29, true); B.door(ch, 1, 52); B.door(ch, 0, 58);
      for (const x of [46, 52, 58, 64]) for (const y of [27, 31]) B.set(x, y, S, 6.5);
      const sac = B.building({ x: 72, y: 24, w: 6, h: 6, kind: 'sacristy' }, S, TL.STONE, 0, 'slab', 4.3);
      B.set(71, 27, TL.STONE); B.lockDoor(72, 27, 'sacristy_key', 'the sacristy');
      cont('coffer', B.spot(73, 25, 76, 28)); cont('altar', B.spot(73, 25, 76, 28)); cont('chest', B.spot(73, 25, 76, 28), { tier: 3 });
      cont('altar', B.at(69, 29)); cont('chest', B.spot(41, 25, 44, 33)); cont('remains', B.spot(47, 25, 63, 33)); cont('sack', B.spot(41, 25, 70, 33)); cont('desk', B.spot(66, 25, 70, 26));
      B.fire(68, 26, 'candle'); B.fire(68, 32, 'candle'); B.prop('pew', 49, 29, { rot: 0 }); B.prop('pew', 55, 29, { rot: 0 }); B.prop('pew', 61, 29, { rot: 0 });
      const hob = sp('hob', B.spot(64, 28, 67, 30), { chance: .75, boss: true });
      if (hob) { sp('sergeant', B.spot(60, 26, 68, 32), { follow: hob, boss: true }); sp('sergeant', B.spot(60, 26, 68, 32), { follow: hob, boss: true }); }
      else { sp('sergeant', B.spot(60, 26, 68, 32)); sp('raider', B.spot(48, 26, 68, 32)); sp('raider', B.spot(48, 26, 68, 32)); }
      sp('bowman', B.spot(42, 26, 45, 32)); sp('raider', B.at(38, 30), { post: true, face: PI });
      B.label(56, 22, 'The Abbey Church'); B.zone('church', 'The Abbey Church', 56, 29, 9);

      // ---- the cloister and its three ranges
      B.fill(42, 36, 59, 53, TL.STONE); B.fill(44, 38, 57, 51, TL.GRASS);
      B.wall(44, 38, 57, 38, TL.LOW); B.wall(44, 51, 57, 51, TL.LOW); B.wall(44, 38, 44, 51, TL.LOW); B.wall(57, 38, 57, 51, TL.LOW);
      for (const [gx, gy] of [[50, 38], [51, 38], [50, 51], [51, 51], [44, 44], [44, 45], [57, 44], [57, 45]]) B.set(gx, gy, TL.GRASS);
      B.prop('cross', 50, 44, { rot: 0 }); B.fire(43, 37, 'brazier'); cont('remains', B.spot(46, 40, 55, 49)); cont('herbpatch', B.spot(46, 40, 55, 49)); cont('herbpatch', B.spot(46, 40, 55, 49));
      B.zone('cloister', 'The Cloister', 50, 44, 8); B.label(50, 46, 'Cloister');
      const er = B.building({ x: 60, y: 36, w: 9, h: 18, kind: 'range' }, S, TL.WOOD, 0, 'slab', 5);
      B.wall(61, 44, 67, 44, S, 5); B.set(64, 44, TL.WOOD); B.door(er, 2, 40); B.door(er, 2, 49); B.door(er, 3, 48);
      cont('desk', B.spot(61, 37, 67, 43)); cont('chest', B.spot(61, 37, 67, 43)); cont('chest', B.spot(61, 45, 67, 52)); cont('chest', B.spot(61, 45, 67, 52)); cont('sack', B.spot(61, 45, 67, 52)); cont('rack', B.spot(61, 45, 67, 52));
      for (const y of [46, 48, 50]) B.prop('bed', 66, y, { rot: 0 });
      sp('raider', B.spot(61, 45, 67, 52)); sp('raider', B.spot(61, 45, 67, 52)); sp('raider', B.spot(61, 45, 67, 52), { minTh: 2 }); sp('bowman', B.spot(61, 37, 67, 43));
      B.label(64, 55.2, 'Dorter');
      const sr = B.building({ x: 42, y: 54, w: 18, h: 8, kind: 'refectory' }, S, TL.WOOD, 0, 'slab', 5);
      B.wall(54, 55, 54, 60, S, 5); B.set(54, 57, TL.WOOD); B.door(sr, 0, 50); B.door(sr, 1, 46); B.door(sr, 3, 57);
      cont('barrel', B.spot(55, 55, 58, 60)); cont('barrel', B.spot(55, 55, 58, 60)); cont('crate', B.spot(55, 55, 58, 60)); cont('sack', B.spot(43, 55, 53, 60)); cont('chest', B.spot(43, 55, 53, 60));
      B.prop('table', 47, 57, { rot: 0 }); B.prop('table', 50, 57, { rot: 0 }); B.fire(57, 58, 'fire');
      sp('raider', B.spot(43, 55, 53, 60)); sp('raider', B.spot(43, 55, 53, 60)); sp('cutthroat', B.spot(55, 55, 58, 60)); B.label(50, 62.6, 'Frater');
      const wr = B.building({ x: 32, y: 36, w: 10, h: 18, kind: 'cellarium' }, S, TL.STONE, 0, 'slab', 5);
      B.door(wr, 3, 44); B.door(wr, 2, 48);
      for (let i = 0; i < 3; i++) cont('barrel', B.inner(wr)); cont('sack', B.inner(wr)); cont('sack', B.inner(wr)); cont('crate', B.inner(wr)); cont('crate', B.inner(wr)); cont('toolbox', B.inner(wr));
      sp('raider', B.inner(wr)); sp('raider', B.inner(wr)); B.label(36, 55.2, 'Cellarium');

      // ---- infirmary (with the locked dispensary), scriptorium, brewhouse, granary
      const inf = B.building({ x: 72, y: 40, w: 10, h: 12, kind: 'infirmary' }, S, TL.WOOD, 0, 'slab', 4.5);
      B.door(inf, 2, 45); B.wall(76, 41, 76, 44, S, 4.5); B.wall(76, 45, 80, 45, S, 4.5); B.lockDoor(76, 43, 'infirmary_key', 'the dispensary', TL.WOOD);
      cont('dispensary', B.spot(77, 41, 80, 44)); cont('dispensary', B.spot(77, 41, 80, 44));
      cont('medchest', B.spot(73, 46, 80, 50)); cont('medchest', B.spot(73, 46, 80, 50)); cont('medchest', B.spot(73, 41, 75, 44)); cont('remains', B.spot(73, 46, 80, 50));
      for (const x of [74, 76, 78, 80]) B.prop('bed', x, 49, { rot: PI / 2 });
      sp('raider', B.spot(73, 46, 80, 50)); sp('bowman', B.spot(73, 46, 80, 50)); B.label(77, 53.2, 'Infirmary'); B.zone('infirmary', 'The Infirmary', 77, 46, 6);
      const scr = B.building({ x: 74, y: 31, w: 8, h: 7, kind: 'scriptorium' }, S, TL.WOOD, 0, 'slab', 4.3);
      B.door(scr, 1, 77); B.door(scr, 2, 34);
      cont('desk', B.inner(scr), { extra: ['ledger'] }); cont('desk', B.inner(scr)); cont('desk', B.inner(scr)); cont('chest', B.inner(scr), { tier: 3 });
      sp('sergeant', B.inner(scr)); sp('raider', B.inner(scr), { minTh: 2 }); B.label(78, 30, 'Scriptorium'); B.zone('scriptorium', 'The Scriptorium', 78, 34, 4);
      const brew = B.building({ x: 29, y: 60, w: 10, h: 9, kind: 'brewhouse' }, S, TL.DIRT, .05, 'thatch');
      B.door(brew, 3, 64); B.door(brew, 0, 33); B.fire(33, 64, 'fire');
      for (let i = 0; i < 3; i++) cont('barrel', B.inner(brew)); cont('sack', B.inner(brew)); cont('crate', B.inner(brew));
      B.grp(brew, ['raider', 'raider', 'cutthroat']); B.label(34, 70.2, 'Brewhouse'); B.zone('brewhouse', 'The Brewhouse', 34, 64, 5);
      const gran = B.building({ x: 29, y: 23, w: 9, h: 10, kind: 'barn' }, TL.WWALL, TL.DIRT, .08);
      B.door(gran, 3, 27); B.door(gran, 1, 33);
      cont('sack', B.inner(gran)); cont('sack', B.inner(gran)); cont('crate', B.inner(gran)); cont('toolbox', B.inner(gran)); cont('woodpile', B.near(39, 30, 1));
      B.grp(gran, ['cutthroat', 'cutthroat']); B.label(33, 22, 'Granary');

      // ---- the monks' cemetery and the crypt
      B.wall(62, 56, 82, 56, TL.LOW); B.wall(62, 56, 62, 72, TL.LOW); B.set(66, 56, TL.GRASS); B.set(62, 64, TL.GRASS);
      for (let x = 64; x <= 70; x += 2) for (let y = 58; y <= 70; y += 3) B.prop('grave', x, y, { rot: 0 });
      const crypt = B.building({ x: 72, y: 62, w: 7, h: 7, kind: 'crypt' }, S, TL.STONE, 0, 'slab', 3.2);
      B.lockDoor(72, 65, 'crypt_key', 'the crypt'); cont('coffer', B.spot(73, 63, 77, 67), { extra: ['relic'], name: 'Shrine of St Osyth' }); cont('coffer', B.spot(73, 63, 77, 67)); cont('remains', B.spot(73, 63, 77, 67)); cont('remains', B.spot(73, 63, 77, 67));
      cont('remains', B.near(66, 62, 2)); cont('cache', B.near(68, 68, 1)); B.label(75, 70.2, 'Crypt'); B.zone('crypt', 'The Crypt', 75, 65, 4); B.zone('cemetery', 'The Monks\' Cemetery', 67, 64, 6);

      // ---- paths inside the wall
      B.line(55, 73, 55, 63, 2); B.line(39, 64, 70, 64, 1); B.line(30, 34, 30, 58, 1); B.line(30, 34, 39, 30, 1); B.line(70, 54, 83, 52, 1); B.line(70, 36, 73, 38, 1);
      const PA = B.route([[55, 68], [41, 64], [30, 46], [38, 30], [58, 22.6], [80, 22.6], [83, 39], [70, 55], [56, 66]]);
      const handler = sp('raider', B.near(55, 68, 1), { patrol: PA }); sp('hound', B.near(54, 67, 1), { follow: handler }); sp('hound', B.near(56, 69, 1), { follow: handler });
      const PB = B.route([[43, 45], [50, 37], [58, 45], [50, 52]]); sp('sergeant', B.at(43, 46), { patrol: PB }); sp('raider', B.at(43, 47), { patrol: PB });

      // ---- outside: fishponds and sluice, boathouse, causeway, dyke, carr
      B.fill(85, 40, 87, 62, TL.DIRT, true); B.fill(88, 44, 97, 58, TL.WATER); B.fill(88, 50, 97, 51, TL.DIRT);
      B.line(87, 40, 100, 31, 1); B.label(101, 27, 'Sluice');
      const boat = B.building({ x: 90, y: 80, w: 7, h: 6, kind: 'boathouse' }, TL.WWALL, TL.WOOD, .1);
      B.door(boat, 0, 93); B.door(boat, 1, 93); B.fill(93, 86, 94, 88, TL.WOOD);
      cont('crate', B.inner(boat)); cont('barrel', B.inner(boat)); cont('sack', B.inner(boat)); B.grp(boat, ['cutthroat', 'cutthroat']);
      B.trail(86, 62, 93, 78); B.label(93, 78.4, 'Boathouse'); B.zone('boathouse', 'The Boathouse', 93, 83, 5);
      B.line(56, 108, 56, 79, 2); B.fill(56, 85, 57, 95, TL.WOOD);
      B.line(4, 56, 22, 56, 2); B.line(22, 56, 22, 29, 1); B.line(22, 29, 25, 29, 1);
      B.line(56, 3, 56, 17, 2); B.line(56, 17, 22, 17, 1); B.line(22, 17, 22, 29, 1); B.line(56, 17, 90, 17, 1); B.line(90, 17, 90, 40, 1);
      B.label(56, 109.4, 'The Causeway');
      for (const [x, y, w, h, side] of [[43, 98, 7, 6, 3], [62, 99, 7, 5, 2]]) {
        const b = B.building({ x, y, w, h, kind: 'cottage' }, TL.WWALL, TL.WOOD, .15); B.door(b, side);
        cont('sack', B.inner(b)); cont('crate', B.inner(b)); B.grp(b, V() < .5 ? ['bandit', 'cutthroat'] : ['cutthroat']);
      }
      cont('courier', B.near(57, 100, 1)); cont('courier', B.near(18, 56, 1)); cont('remains', B.near(12, 30, 2)); cont('remains', B.near(100, 70, 2)); cont('remains', B.near(40, 12, 2));
      for (const [x, y] of [[14, 40], [98, 14], [20, 100], [80, 104], [100, 62]]) cont('herbpatch', B.near(x, y, 2));
      for (const [x, y] of [[10, 76], [74, 10], [104, 96]]) cont('cache', B.near(x, y, 1));
      for (const [x, y] of [[12, 22], [100, 104]]) { B.disc(x, y, 3); sp('wolf', B.near(x, y, 2)); sp('wolf', B.near(x, y, 2)); sp('wolf', B.near(x, y, 2), { chance: .5 }); }
      sp('boar', B.near(16, 92, 2)); sp('boar', B.near(18, 94, 2), { chance: .5 }); sp('deer', B.near(100, 12, 2)); sp('deer', B.near(8, 102, 2)); sp('deer', B.near(102, 44, 2), { chance: .6 });
      sp('raider', B.near(22, 30, 1), { post: true, face: PI }); sp('bowman', B.near(27, 30, 1), { post: true, face: PI }); sp('raider', B.at(85, 53), { post: true, face: 0 });
      B.wave(420, [['raider', 56, 108, 55, 82], ['raider', 57, 108, 57, 82], ['bowman', 56, 109, 56, 84]]);
      B.wave(800, [['sergeant', 5, 56, 30, 40], ['raider', 5, 57, 32, 42], ['raider', 6, 56, 34, 40], ['hound', 6, 57, 33, 41]]);
      B.wave(1040, [['sergeant', 56, 4, 40, 22.6], ['bowman', 57, 4, 44, 22.6], ['bowman', 55, 4, 48, 22.6]], 2);
    }
  });

  // ======================================================================================== ALDRIC'S HOLD
  G.defMap({
    id: 'hold', name: 'Aldric\'s Hold', sub: 'the castle', tier: 3, w: 104, h: 104, seed: 51903, minutes: 25, hub: [52, 60], bossAt: [30, 29],
    danger: 'Extreme. Sergeants, crossbows, knights in plate.',
    blurb: 'The castle the Duke left a captain to hold. One gate, a breach the siege made in the west wall, and a postern for those with the key. The armoury and the strongroom hold the best steel in the March. Edge weapons will not answer here.',
    env: { masonry: 'ashlar', battlements: true, fog: 0x7f8488, dens: .017, mist: .005, damp: .12, stone: [.8, .82, .88], trees: [.72, .2, .08], grass: [.7, .9, .34], leaf: [.5, .95, .5], weather: [['overcast', 3], ['rain', 2], ['storm', 2], ['clear', 2], ['fog', 1]] },
    keys: ['dungeon_key', 'armoury_key'],
    starts: [
      { id: 'south', name: 'The Barbican Road', x: 52, y: 99, desc: 'Up through the burnt hamlet to the drawbridge. The gate is held by sergeants and crossbows.' },
      { id: 'west', name: 'The Siege Lines', x: 5, y: 64, desc: 'Through the Duke\'s old siege camp to the breach in the west wall. Raiders still sleep in the tents.' },
      { id: 'east', name: 'The Postern Wood', x: 99, y: 40, desc: 'To the plank bridge and the postern gate. Useless without the key; the fastest way in with it.' }
    ],
    exits: [
      { id: 'road', name: 'The Barbican Road', x: 52, y: 99, dir: 'south', notFrom: ['south'] },
      { id: 'siege', name: 'The Siege Lines', x: 5, y: 64, dir: 'west', notFrom: ['west'] },
      { id: 'wood', name: 'The Postern Wood', x: 99, y: 40, dir: 'east', notFrom: ['east'] },
      { id: 'chute', name: 'The Garderobe Chute', x: 52, y: 22, dir: 'inside the north wall', nopack: true, inside: true, r: 1.6 },
      { id: 'cart', name: 'The Smuggler\'s Cart', x: 92, y: 93, dir: 'south-east', cost: 120, note: 'he is paid when you are home' }
    ],
    terrain(x, y, B) {
      const n = B.vn(x / 9, y / 9) * .7 + B.vn(x / 3.5 + 5, y / 3.5 + 5) * .3, d = Math.hypot(x - 52, y - 48) / 52;
      if (B.vn(x / 4 + 11, y / 4 + 3) > .8 && d > .75) return TL.ROCK;
      if (n + d * .3 > .74 && B.R() < .8) return TL.TREE;
      if (n + d * .22 > .64 && B.R() < .15) return TL.BUSH;
      if (B.vn(x / 5 + 2, y / 5 + 9) < .24) return TL.DIRT;
      return TL.GRASS;
    },
    build(B) {
      const { V, th } = B, cont = B.cont, sp = B.sp, S = TL.SWALL, cren = (x, y, base) => base + (((x + y) & 1) ? .75 : 0);
      // ---- moat, curtain wall, towers
      for (let y = 13; y <= 83; y++) for (let x = 17; x <= 87; x++) B.set(x, y, B.R() < .6 ? TL.DIRT : TL.GRASS);
      B.fill(19, 15, 85, 81, TL.DEEP); B.fill(22, 18, 82, 78, TL.DIRT);
      for (let x = 24; x <= 80; x++) { B.set(x, 20, S, cren(x, 20, 6.2)); B.set(x, 76, S, cren(x, 76, 6.2)); }
      for (let y = 20; y <= 76; y++) { B.set(24, y, S, cren(24, y, 6.2)); B.set(80, y, S, cren(80, y, 6.2)); }
      for (const [tx, ty] of [[22, 18], [78, 18], [22, 74], [78, 74]]) B.fill(tx, ty, tx + 4, ty + 4, S, false, 9);
      B.fill(25, 21, 79, 45, TL.COBBLE); B.fill(52, 47, 53, 71, TL.COBBLE);
      for (let x = 25; x <= 79; x++) B.set(x, 46, S, cren(x, 46, 5.6)); B.set(52, 46, TL.COBBLE, 0); B.set(53, 46, TL.COBBLE, 0);
      // gatehouse and drawbridge (south), the siege breach (west), the postern (east)
      const gate = B.building({ x: 48, y: 72, w: 9, h: 7, kind: 'gate' }, S, TL.COBBLE, 0, 'slab', 8);
      B.door(gate, 0, 52, true); B.door(gate, 1, 52, true); B.fill(52, 79, 53, 82, TL.WOOD);
      B.set(24, 46, TL.DIRT, 0); B.set(24, 47, TL.DIRT, 0); B.set(25, 46, TL.DIRT, 0); B.fill(19, 45, 21, 48, TL.MUD);
      B.lockDoor(80, 36, 'postern_key', 'the postern gate', TL.COBBLE); B.fill(81, 36, 85, 36, TL.WOOD);
      B.fire(50, 70, 'brazier'); B.fire(55, 70, 'brazier'); B.fire(51, 84, 'brazier'); B.fire(54, 84, 'brazier');
      sp('sergeant', B.at(51, 83), { post: true, face: PI / 2 }); sp('sergeant', B.at(54, 83), { post: true, face: PI / 2 });
      sp('crossbowman', B.at(50, 75), { post: true, face: PI / 2 }); sp('crossbowman', B.at(55, 75), { post: true, face: PI / 2 }); sp('knight', B.at(52, 69), { post: true, face: PI / 2, minTh: 3 });
      B.label(52, 86, 'Barbican'); B.zone('barbican', 'The Barbican', 52, 80, 6); B.zone('postern', 'The Postern Gate', 82, 36, 4); B.label(88, 34.4, 'Postern');
      sp('crossbowman', B.at(26, 48), { post: true, face: PI }); sp('raider', B.at(27, 47), { post: true, face: PI });

      // ---- the outer bailey
      const stab = B.building({ x: 27, y: 63, w: 13, h: 8, kind: 'stables' }, TL.WWALL, TL.DIRT, 0, 'thatch');
      B.door(stab, 0, 33, true); cont('toolbox', B.inner(stab)); cont('crate', B.inner(stab)); cont('sack', B.inner(stab)); cont('sack', B.inner(stab)); B.prop('hay', 29, 66); B.prop('hay', 37, 68); B.grp(stab, ['raider', 'raider']);
      B.label(33, 72, 'Stables'); B.zone('stables', 'The Stables', 33, 66, 6);
      const ken = B.building({ x: 27, y: 50, w: 8, h: 7, kind: 'kennels' }, TL.WWALL, TL.DIRT, 0, 'thatch');
      B.door(ken, 3, 53); sp('hound', B.inner(ken)); sp('hound', B.inner(ken)); sp('hound', B.inner(ken), { minTh: 2 }); cont('sack', B.inner(ken)); B.label(30, 58, 'Kennels');
      const store = B.building({ x: 38, y: 50, w: 9, h: 6, kind: 'store' }, TL.WWALL, TL.WOOD, 0, 'thatch');
      B.door(store, 1, 42); for (let i = 0; i < 3; i++) cont('barrel', B.inner(store)); cont('sack', B.inner(store)); cont('crate', B.inner(store)); cont('crate', B.inner(store)); B.grp(store, ['raider', 'raider']); B.label(43, 48.8, 'Storehouse');
      const bar = B.building({ x: 60, y: 49, w: 17, h: 8, kind: 'barracks' }, S, TL.WOOD, 0, 'slab', 4.5);
      B.door(bar, 2, 53); B.door(bar, 1, 68);
      for (const x of [63, 66, 69, 72]) B.prop('bed', x, 51, { rot: PI / 2 }); B.fire(74, 54, 'fire');
      cont('chest', B.inner(bar)); cont('chest', B.inner(bar)); cont('rack', B.inner(bar)); cont('rack', B.inner(bar)); cont('medchest', B.inner(bar)); cont('desk', B.inner(bar));
      B.grp(bar, ['raider', 'raider', 'raider', 'sergeant']); sp('raider', B.inner(bar), { minTh: 2 }); B.label(68, 48, 'Barracks'); B.zone('barracks', 'The Barracks', 68, 53, 7);
      const smi = B.building({ x: 60, y: 61, w: 17, h: 9, kind: 'smithy' }, S, TL.DIRT, 0, 'slab', 4.5);
      B.door(smi, 2, 65); B.wall(69, 62, 69, 68, S, 4.5); B.lockDoor(69, 65, 'armoury_key', 'the armoury', TL.DIRT);
      cont('armoury', B.spot(70, 62, 75, 68)); cont('armoury', B.spot(70, 62, 75, 68)); cont('armoury', B.spot(70, 62, 75, 68)); cont('rack', B.spot(70, 62, 75, 68), { tier: 3 });
      cont('toolbox', B.spot(61, 62, 68, 68)); cont('toolbox', B.spot(61, 62, 68, 68)); cont('rack', B.spot(61, 62, 68, 68)); cont('crate', B.spot(61, 62, 68, 68));
      B.prop('anvil', 64, 65); B.fire(66, 63, 'fire'); sp('sergeant', B.spot(61, 62, 68, 68)); sp('raider', B.spot(61, 62, 68, 68));
      B.label(64, 71.2, 'Smithy'); B.label(73, 71.2, 'Armoury'); B.zone('armoury', 'The Armoury', 72, 65, 4);
      B.prop('well', 49, 60, { rot: 0 }); B.prop('gallows', 44, 67, { rot: 0 }); B.prop('pell', 57, 59, { rot: 0 }); B.prop('pell', 57, 62, { rot: 0 }); B.prop('cart', 46, 71); B.prop('barrel', 41, 58); B.prop('barrel', 58, 71); B.fire(48, 58, 'brazier');
      cont('remains', B.near(44, 68, 1)); cont('crate', B.near(46, 70, 1));
      B.zone('bailey', 'The Outer Bailey', 50, 61, 9); B.label(47, 62.6, 'Outer Bailey');
      const PA = B.route([[52, 68], [42, 59], [30, 59], [36, 72], [52, 68], [58, 60], [77, 59], [77, 72], [58, 72]]);
      sp('sergeant', B.near(52, 66, 1), { patrol: PA }); sp('raider', B.near(51, 67, 1), { patrol: PA }); sp('raider', B.near(53, 67, 1), { patrol: PA });
      const PB = B.route([[40, 60], [56, 58], [56, 48], [30, 48]]);
      const handler = sp('raider', B.near(40, 60, 1), { patrol: PB }); sp('hound', B.near(41, 61, 1), { follow: handler }); sp('hound', B.near(39, 61, 1), { follow: handler });
      sp('crossbowman', B.at(27, 73), { post: true, face: -PI / 4 }); sp('crossbowman', B.at(77, 73), { post: true, face: -PI * .75 });

      // ---- the inner ward
      sp('knight', B.at(51, 44), { post: true, face: PI / 2 }); sp('sergeant', B.at(54, 44), { post: true, face: PI / 2 }); B.fire(50, 44, 'brazier'); B.fire(55, 44, 'brazier');
      B.zone('innergate', 'The Inner Gate', 52, 45, 4);
      const hall = B.building({ x: 27, y: 24, w: 22, h: 12, kind: 'hall' }, S, TL.STONE, 0, 'slab', 7);
      B.door(hall, 1, 38, true); B.door(hall, 3, 29);
      for (const x of [32, 38, 44]) for (const y of [28, 31]) B.set(x, y, S, 7);
      B.prop('table', 35, 29.5, { rot: 0 }); B.prop('table', 41, 29.5, { rot: 0 }); B.fire(29, 27, 'brazier'); B.fire(29, 32, 'brazier'); B.fire(46, 26, 'candle');
      cont('chest', B.spot(28, 25, 31, 34), { tier: 3 }); cont('coffer', B.at(28, 30), { name: 'The Captain\'s coffer' }); cont('desk', B.spot(28, 25, 31, 34), { extra: ['writ'] }); cont('chest', B.spot(33, 25, 47, 34)); cont('barrel', B.spot(40, 25, 47, 34)); cont('rack', B.spot(40, 25, 47, 34), { tier: 3 });
      const ald = sp('aldric', B.at(30, 29), { chance: .8, boss: true });
      if (ald) { sp('knight', B.at(31, 27), { follow: ald, boss: true }); sp('knight', B.at(31, 32), { follow: ald, boss: true }); sp('sergeant', B.spot(34, 26, 46, 33), { follow: ald, boss: true }); }
      else { sp('knight', B.at(31, 27)); sp('knight', B.at(31, 32)); sp('sergeant', B.spot(34, 26, 46, 33)); }
      sp('crossbowman', B.spot(42, 25, 47, 34)); B.label(38, 22.6, 'Great Hall'); B.zone('hall', 'The Great Hall', 38, 30, 9);
      const kit = B.building({ x: 27, y: 37, w: 11, h: 8, kind: 'kitchen' }, S, TL.STONE, 0, 'slab', 4.5);
      B.door(kit, 3, 40); B.fire(29, 40, 'fire'); for (let i = 0; i < 3; i++) cont('barrel', B.inner(kit)); cont('sack', B.inner(kit)); cont('crate', B.inner(kit)); cont('sack', B.inner(kit)); B.grp(kit, ['raider', 'cutthroat']); B.label(32, 45.4, 'Kitchens');
      const keep = B.building({ x: 56, y: 22, w: 15, h: 14, kind: 'keep' }, S, TL.STONE, 0, 'slab', 10);
      B.door(keep, 1, 63); B.wall(57, 28, 69, 28, S, 10); B.set(60, 28, TL.STONE, 0); B.wall(64, 23, 64, 27, S, 10); B.lockDoor(64, 25, 'strongroom_key', 'the strongroom');
      cont('coffer', B.spot(65, 23, 69, 27)); cont('coffer', B.spot(65, 23, 69, 27)); cont('coffer', B.spot(65, 23, 69, 27)); cont('armoury', B.spot(65, 23, 69, 27));
      cont('chest', B.spot(57, 23, 63, 27), { tier: 3 }); cont('desk', B.spot(57, 23, 63, 27)); cont('rack', B.spot(57, 29, 69, 34), { tier: 3 }); cont('medchest', B.spot(57, 29, 69, 34)); cont('barrel', B.spot(57, 29, 69, 34));
      B.fire(58, 33, 'brazier'); B.fire(68, 30, 'candle');
      sp('sergeant', B.spot(57, 29, 69, 34)); sp('sergeant', B.spot(57, 29, 69, 34)); sp('crossbowman', B.spot(57, 29, 69, 34)); sp('knight', B.spot(57, 23, 63, 27)); sp('knight', B.at(62, 37), { post: true, face: PI / 2, minTh: 2 });
      B.label(63, 20.6, 'The Keep'); B.zone('keep', 'The Keep', 63, 29, 8);
      const dun = B.building({ x: 73, y: 24, w: 6, h: 10, kind: 'dungeon' }, S, TL.STONE, 0, 'slab', 3.4);
      B.lockDoor(73, 29, 'dungeon_key', 'the cells'); B.wall(74, 28, 76, 28, TL.LOW); B.wall(74, 30, 76, 30, TL.LOW);
      cont('remains', B.at(77, 26), { extra: ['edric_ring'], name: 'A young man in irons' }); cont('remains', B.at(75, 32)); cont('remains', B.at(77, 31)); cont('chest', B.at(74, 25));
      B.label(76, 35, 'Cells'); B.zone('dungeon', 'The Cells', 76, 29, 4);
      const chap = B.building({ x: 67, y: 38, w: 9, h: 7, kind: 'chapel' }, S, TL.STONE, 0, 'slab', 5);
      B.door(chap, 2, 41); cont('altar', B.at(74, 41)); cont('chest', B.inner(chap)); B.fire(73, 39, 'candle'); B.grp(chap, ['crossbowman', 'raider']); B.label(71, 45.4, 'Chapel');
      B.label(52, 23.4, 'garderobe');
      const PC = B.route([[52, 40], [40, 38], [52, 37], [64, 37], [72, 36], [52, 40]]); sp('sergeant', B.near(52, 40, 1), { patrol: PC }); sp('crossbowman', B.near(53, 41, 1), { patrol: PC });

      // ---- outside the walls: the burnt hamlet, the siege camp, the postern wood
      B.line(52, 101, 52, 83, 2);
      for (const [x, y, w, h, side] of [[40, 86, 7, 6, 3], [58, 88, 8, 6, 2], [43, 94, 7, 5, 3]]) {
        const b = B.building({ x, y, w, h, kind: 'cottage' }, TL.WWALL, TL.WOOD, .16); B.door(b, side);
        cont('sack', B.inner(b)); cont(V() < .5 ? 'crate' : 'chest', B.inner(b)); B.grp(b, V() < .5 ? ['cutthroat', 'cutthroat'] : ['cutthroat', 'bandit']);
      }
      B.label(52, 92, 'the burnt hamlet');
      B.disc(10, 46, 6); B.disc(10, 46, 3, TL.DIRT, true); B.fire(10, 46); B.line(8, 46, 18, 46, 2); B.trail(5, 64, 9, 52);
      B.wall(15, 42, 15, 44, TL.LOW); B.wall(15, 48, 15, 50, TL.LOW); B.wall(12, 39, 14, 39, TL.LOW);
      B.prop('tent', 7, 43, { rot: .5 }); B.prop('tent', 12, 42, { rot: -.4 }); B.prop('tent', 7, 50, { rot: .9 }); B.prop('trebuchet', 12, 51, { rot: -1.2 }); B.prop('cart', 14, 47);
      cont('crate', B.near(9, 44, 1)); cont('rack', B.near(11, 48, 1)); cont('toolbox', B.near(8, 48, 1)); cont('sack', B.near(12, 44, 1)); cont('armoury', B.near(6, 47, 1), { tier: 2 });
      sp('raider', B.near(10, 45, 2)); sp('raider', B.near(10, 47, 2)); sp('raider', B.near(9, 46, 2)); sp('bowman', B.near(12, 46, 2)); sp('sergeant', B.near(11, 46, 2), { minTh: 2 });
      B.label(10, 54, 'Siege Lines'); B.zone('siege', 'The Siege Lines', 10, 46, 7);
      B.trail(99, 40, 86, 36); B.trail(86, 36, 92, 93); B.trail(52, 99, 92, 93);
      cont('courier', B.near(90, 38, 1)); cont('courier', B.near(50, 96, 1)); cont('remains', B.near(18, 30, 2)); cont('remains', B.near(88, 60, 2)); cont('remains', B.near(52, 10, 2)); cont('cache', B.near(92, 20, 1)); cont('cache', B.near(14, 84, 1)); cont('cache', B.near(70, 96, 1));
      for (const [x, y] of [[90, 70], [12, 20], [30, 96], [96, 12]]) cont('herbpatch', B.near(x, y, 2));
      for (const [x, y] of [[12, 86], [94, 78]]) { B.disc(x, y, 3); sp('wolf', B.near(x, y, 2)); sp('wolf', B.near(x, y, 2)); sp('wolf', B.near(x, y, 2), { chance: .6 }); }
      sp('deer', B.near(94, 10, 2)); sp('deer', B.near(10, 12, 2)); sp('boar', B.near(74, 92, 2), { chance: .6 });
      B.wave(480, [['sergeant', 52, 101, 52, 86], ['raider', 53, 101, 50, 88], ['raider', 51, 101, 54, 88], ['raider', 52, 102, 52, 90]]);
      B.wave(900, [['knight', 99, 40, 88, 37], ['crossbowman', 99, 41, 89, 39], ['crossbowman', 98, 40, 90, 36]]);
      B.wave(1200, [['sergeant', 5, 64, 14, 46], ['raider', 5, 65, 13, 47], ['hound', 6, 64, 12, 45], ['hound', 6, 65, 12, 48]], 2);
    }
  });
})();
