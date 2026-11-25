'use strict';
// Photographs. The ground, the walls and the grain of most surfaces come from photographed textures, all in the
// public domain (Poly Haven, CC0: see assets/CREDITS.md). They are fetched once when the page opens, behind a loading
// screen. If any is missing the game still runs: the renderer falls back to the textures it can draw for itself.
//
//   G.assets.has(name, maps)       are these maps of this texture here? maps: letters from d (colour), n (normal), h (height)
//   G.assets.px(name, map, w, h)   the picture as RGBA bytes at the size asked for; turn: 1 to lay it on its side
//   G.assets.canvas(name, map, w, h)
//   G.assets.then(fn)              call fn once everything has arrived or failed
(function () {
  // what each is used for -> [file name, which maps were fetched]
  const SETS = {
    grass: ['leafy_grass', 'dnh'], dirt: ['dirt', 'dnh'], mud: ['brown_mud', 'dnh'], cobble: ['mossy_cobblestone', 'dnh'], flag: ['rock_tile_floor', 'dnh'], planks: ['old_wood_floor', 'dnh'], forest: ['forest_ground_04', 'dnh'], silt: ['river_small_rocks', 'dnh'],
    rubble: ['old_stone_wall', 'dn'], ashlar: ['medieval_blocks_05', 'dn'], plaster: ['clay_plaster', 'd'], thatch: ['thatch_roof_angled', 'dn'], bark: ['pine_bark', 'dn'],
    wood: ['weathered_planks', 'dh'], rock: ['rock_boulder_dry', 'dh'], rust: ['rust_coarse_01', 'dh'], linen: ['rough_linen', 'dh'], leather: ['brown_leather', 'dh'],
    leaves: ['leaves', 'da']      // a: which parts of the picture are leaf and which are air
  };
  // Models: a shape and its pictures, in the glTF layout (a text file that describes the shape, a file of numbers, and
  // images). They are read by the few lines below; no reader is fetched from anywhere. cut: has an air map as well.
  const MODELS = { barrel: ['wine_barrel_01'], crate: ['wooden_crate_01'], table: ['WoodenTable_01'], boulder: ['rock_07'], stone: ['rock_09'], fern: ['fern_02', 1], grass: ['grass_medium_02', 1] };
  const FILE = { d: 'diff', n: 'nor', h: 'disp', a: 'alpha' }, A = G.assets = { img: {}, models: {}, total: 0, done: 0, failed: 0, ready: false }, waiting = [];
  const el = id => document.getElementById(id);
  function tick() {
    const bar = el('loadbar'), txt = el('loadtxt'); if (bar) bar.style.width = Math.round(A.done / A.total * 100) + '%'; if (txt) txt.textContent = `Fetching the look of the place: ${A.done} of ${A.total}`;
    if (A.done < A.total) return;
    A.ready = true; const box = el('loading'); if (box) box.classList.add('hidden'); for (const fn of waiting.splice(0)) fn();
  }
  for (const name in SETS) for (const m of SETS[name][1]) {
    const im = new Image(); A.total++;
    im.onload = () => { A.img[name + '.' + m] = im; A.done++; tick(); };
    im.onerror = () => { A.failed++; A.done++; tick(); };
    im.src = `assets/tex/${SETS[name][0]}_${FILE[m]}.jpg`;
  }
  // The shapes in a model file: for each, its points, their facings, where each lies on the picture, and the triangles.
  // Only what these files use is understood: plain numbers, no compression, no skins, no animation.
  function shapes(j, bin) {
    const read = i => {
      const a = j.accessors[i], v = j.bufferViews[a.bufferView], n = ({ SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 })[a.type] * a.count, at = (v.byteOffset || 0) + (a.byteOffset || 0);
      const T = ({ 5126: Float32Array, 5123: Uint16Array, 5125: Uint32Array })[a.componentType]; if (!T || v.byteStride || a.sparse || at + n * T.BYTES_PER_ELEMENT > bin.byteLength) throw new Error('layout');
      return new T(bin.slice(at, at + n * T.BYTES_PER_ELEMENT));
    };
    const out = [];
    for (const node of j.nodes || []) { if (node.mesh === undefined) continue; for (const p of j.meshes[node.mesh].primitives) { if ((p.mode === undefined ? 4 : p.mode) !== 4 || p.indices === undefined) continue; out.push({ pos: read(p.attributes.POSITION), nor: read(p.attributes.NORMAL), uv: read(p.attributes.TEXCOORD_0), idx: read(p.indices) }); } }
    return out;
  }
  for (const name in MODELS) {
    const id = MODELS[name][0], base = `assets/models/${id}/`, M = { parts: null, img: {} }, maps = [['d', 'diff'], ['n', 'nor_gl']].concat(MODELS[name][1] ? [['a', 'alpha']] : []); A.total += 1 + maps.length;
    Promise.all([fetch(base + id + '.gltf').then(r => r.ok ? r.json() : Promise.reject(new Error('gltf'))), fetch(base + id + '.bin').then(r => r.ok ? r.arrayBuffer() : Promise.reject(new Error('bin')))])
      .then(([j, bin]) => { M.parts = shapes(j, bin); A.models[name] = M; }).catch(() => { A.failed++; }).then(() => { A.done++; tick(); });
    for (const [k, suffix] of maps) { const im = new Image(); im.onload = () => { M.img[k] = im; A.done++; tick(); }; im.onerror = () => { A.failed++; A.done++; tick(); }; im.src = `${base}textures/${id}_${suffix}_1k.jpg`; }
  }
  A.then = fn => { if (A.ready) fn(); else waiting.push(fn); };
  A.has = (name, maps) => (maps || 'd').split('').every(m => !!A.img[name + '.' + m]);
  A.canvas = function (name, map, w, h, turn) {
    const im = A.img[name + '.' + map]; if (!im) return null; const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
    if (turn) { g.translate(w / 2, h / 2); g.rotate(Math.PI / 2); g.drawImage(im, -h / 2, -w / 2, h, w); } else g.drawImage(im, 0, 0, w, h);
    return c;
  };
  A.px = (name, map, w, h, turn) => { const c = A.canvas(name, map, w, h, turn); return c ? c.getContext('2d').getImageData(0, 0, w, h).data : null; };
  // once the renderer has made its textures from them the pictures themselves are not needed again
  A.free = () => { A.img = {}; for (const k in A.models) A.models[k].img = {}; };
  tick();
})();
