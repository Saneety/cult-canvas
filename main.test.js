// Logic tests for Cult Canvas: node main.test.js (Obsidian does not load this file).
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');

const load = Module._load;
Module._load = function (request, ...rest) {
  if (request === 'obsidian') return { Plugin: class {}, PluginSettingTab: class {}, Setting: class {}, Menu: class {}, FuzzySuggestModal: class {}, Notice: class {} };
  return load.call(this, request, ...rest);
};
const { logic } = require('./main.js');
Module._load = load;
const {
  TOOLS, SHAPES, MARKER_COLORS, MARKER_WIDTH, OVERLAY_TOOLS, clampMarkerWidth, buildStrokeNode, isValidStroke, strokeHit, samplePath,
  strokeOutlinePoints, strokeOutlinePath, centerlinePath, dragRect, centeredRect, unionBounds, minimapFit, zoomPercent, toolByCode, imageFitSize,
  boxesOverlap, layerOrder, styleKindOf, styleSnapshot, styleKey, applyStyle, segmentHitsRect, polylineHitsRect,
  orderMenuSections, menuHotkeys, swapAltCtrl, swapAltCtrlHandlers,
  STRINGS, setLanguage, t,
} = logic;

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; } catch (e) { console.error(`FAIL ${name}\n`, e.message); process.exitCode = 1; }
}

test('stroke node box covers the line with the marker size as padding', () => {
  const n = buildStrokeNode([[100, 50], [150, 80], [200, 50]], 6);
  assert.deepStrictEqual([n.x, n.y, n.width, n.height], [94, 44, 112, 42]);
  assert.deepStrictEqual(n.gbStroke.points[0], [6, 6]);
  assert.strictEqual(n.gbStroke.w, n.width);
  assert.strictEqual(n.gbStroke.h, n.height);
  assert.ok(isValidStroke(n.gbStroke));
  for (const [x, y] of n.gbStroke.points) assert.ok(x >= 0 && y >= 0 && x <= n.width && y <= n.height);
});

test('a click without movement still makes a visible dot', () => {
  const n = buildStrokeNode([[10, 10], [10.2, 10.1]], 5);
  assert.strictEqual(n.gbStroke.points.length, 2);
  assert.ok(strokeOutlinePath(n.gbStroke.points, 5).startsWith('M'));
  assert.throws(() => buildStrokeNode([], 5));
});

test('stroke hit only near the line, also after the card was resized', () => {
  const n = buildStrokeNode([[0, 0], [100, 0]], 6);
  const s = n.gbStroke;
  assert.ok(strokeHit(n, s, { x: 50, y: 2 }, 2));
  assert.ok(!strokeHit(n, s, { x: 50, y: 20 }, 2));
  assert.ok(!strokeHit(n, s, { x: 300, y: 0 }, 2));
  const wide = { ...n, width: n.width * 2 }; // stretched to the right: the line now ends near x = 206
  assert.ok(strokeHit(wide, s, { x: 190, y: 0 }, 2));
  assert.ok(!strokeHit(n, s, { x: 190, y: 0 }, 2));
});

test('a circle around a card does not catch clicks inside it', () => {
  const pts = [];
  for (let a = 0; a <= Math.PI * 2 + 0.01; a += 0.1) pts.push([200 + 150 * Math.cos(a), 200 + 100 * Math.sin(a)]);
  const n = buildStrokeNode(pts, 5);
  assert.ok(!strokeHit(n, n.gbStroke, { x: 200, y: 200 }, 4));
  assert.ok(strokeHit(n, n.gbStroke, { x: 350, y: 200 }, 4));
});

test('the line has the same width at any mouse speed', () => {
  // slow part (1 px apart) then fast part (25 px apart) of one horizontal line
  const pts = [];
  for (let x = 0; x <= 100; x += 1) pts.push([x, 0]);
  for (let x = 125; x <= 400; x += 25) pts.push([x, 0]);
  for (const size of [2, 4, 12, 30]) {
    const outline = strokeOutlinePoints(pts, size).filter((p) => p[0] > 20 && p[0] < 380); // skip the round caps
    assert.ok(outline.length > 4, `outline for ${size}`);
    for (const p of outline) assert.ok(Math.abs(Math.abs(p[1]) - size / 2) < size * 0.05 + 0.05, `size ${size}: y ${p[1]} at x ${p[0]}`);
  }
});

test('marker width from the slider is a whole number within the range', () => {
  assert.strictEqual(clampMarkerWidth(0), MARKER_WIDTH.min);
  assert.strictEqual(clampMarkerWidth(99), MARKER_WIDTH.max);
  assert.strictEqual(clampMarkerWidth('7'), 7);
  assert.strictEqual(clampMarkerWidth(4.6), 5);
  assert.strictEqual(clampMarkerWidth(undefined), MARKER_WIDTH.def);
  assert.strictEqual(clampMarkerWidth('thin'), MARKER_WIDTH.def);
  assert.ok(MARKER_WIDTH.min <= MARKER_WIDTH.def && MARKER_WIDTH.def <= MARKER_WIDTH.max);
});

test('invalid stroke data is ignored instead of breaking the board', () => {
  assert.ok(!isValidStroke(null));
  assert.ok(!isValidStroke({ points: [], size: 5, w: 10, h: 10 }));
  assert.ok(!isValidStroke({ points: [[1, 'x']], size: 5, w: 10, h: 10 }));
  assert.ok(!isValidStroke({ points: [[1, 2]], size: 0, w: 10, h: 10 }));
});

test('eraser sweep samples the whole segment', () => {
  const pts = samplePath({ x: 0, y: 0 }, { x: 100, y: 0 }, 10);
  assert.strictEqual(pts.length, 11);
  assert.deepStrictEqual(pts[pts.length - 1], { x: 100, y: 0 });
  for (let i = 1; i < pts.length; i++) assert.ok(pts[i].x - pts[i - 1].x <= 10);
  assert.strictEqual(samplePath({ x: 5, y: 5 }, { x: 5, y: 5 }, 10).length, 2);
});

test('centre line path has a segment even for one point', () => {
  assert.strictEqual(centerlinePath([[1, 2], [3, 4]]), 'M1,2 L3,4');
  assert.ok(centerlinePath([[1, 2]]).includes('L'));
});

test('drag rectangle is normalised and respects minimum size', () => {
  assert.deepStrictEqual(dragRect({ x: 100, y: 100 }, { x: 40, y: 10 }), { x: 40, y: 10, width: 60, height: 90 });
  assert.deepStrictEqual(dragRect({ x: 0, y: 0 }, { x: 10, y: 10 }, 120, 80), { x: 0, y: 0, width: 120, height: 80 });
  assert.deepStrictEqual(centeredRect({ x: 100, y: 100 }, 220, 220), { x: -10, y: -10, width: 220, height: 220 });
});

test('minimap fits content and viewport and maps back', () => {
  const b = unionBounds([{ minX: 0, minY: 0, maxX: 1000, maxY: 500 }, null, { minX: -200, minY: 100, maxX: 300, maxY: 900 }]);
  assert.deepStrictEqual(b, { minX: -200, minY: 0, maxX: 1000, maxY: 900 });
  const fit = minimapFit(b, 200, 130, 8);
  const tl = fit.toMap(b.minX, b.minY), br = fit.toMap(b.maxX, b.maxY);
  assert.ok(tl.x >= 8 - 1e-9 && tl.y >= 8 - 1e-9 && br.x <= 192 + 1e-9 && br.y <= 122 + 1e-9);
  const back = fit.toCanvas(fit.toMap(350, 420).x, fit.toMap(350, 420).y);
  assert.ok(Math.abs(back.x - 350) < 1e-6 && Math.abs(back.y - 420) < 1e-6);
  assert.strictEqual(unionBounds([]), null);
});

test('tools: unique hotkeys on letter keys, not on F8-F10, every overlay tool exists', () => {
  const codes = TOOLS.map((t) => t.code);
  assert.strictEqual(new Set(codes).size, codes.length);
  for (const c of codes) assert.ok(/^Key[A-Z]$/.test(c), c);
  for (const id of OVERLAY_TOOLS) assert.ok(TOOLS.some((t) => t.id === id), id);
  assert.strictEqual(toolByCode('KeyP'), 'marker');
  assert.strictEqual(toolByCode('KeyQ'), null);
  assert.strictEqual(new Set(SHAPES.map((s) => s.id)).size, SHAPES.length);
  assert.strictEqual(SHAPES[0].value, null);
  assert.strictEqual(MARKER_COLORS.length, 5);
});

test('zoom label and image fit', () => {
  assert.strictEqual(zoomPercent(1), '100%');
  assert.strictEqual(zoomPercent(0.354), '35%');
  assert.deepStrictEqual(imageFitSize(2000, 1000), { width: 520, height: 260 });
  assert.deepStrictEqual(imageFitSize(100, 50), { width: 100, height: 50 });
  assert.deepStrictEqual(imageFitSize(0, 0), { width: 520, height: 400 });
});

test('the Advanced Canvas style attributes are declared in styles.css, and styled', () => {
  const css = fs.readFileSync(path.join(__dirname, 'styles.css'), 'utf8');
  const src = fs.readFileSync(path.join(__dirname, 'main.js'), 'utf8');
  // Advanced Canvas looks for /* @advanced-canvas-node-style\n<yaml>*/ in style sheets
  const blocks = [...css.matchAll(/\/\*\s*@advanced-canvas-node-style\s*\n([\s\S]*?)\*\//g)].map((m) => m[1]);
  assert.strictEqual(blocks.length, 2);
  assert.ok(/^key: gb-kind$/m.test(blocks[0]) && /^key: gb-size$/m.test(blocks[1]));
  for (const b of blocks) {
    assert.ok(/^ {4}value: null$/m.test(b), 'a default option');
    for (const line of b.split('\n')) assert.ok(!/label: .*[:#]/.test(line), `YAML-safe label: ${line}`);
  }
  // The community plugin review forbids plugins to add <style> or <link> elements: the config stays static.
  assert.ok(!/createEl\(\s*['"](style|link)['"]|createElement\(\s*['"](style|link)['"]/.test(src), 'no injected style elements');
  for (const v of ['sticky', 'text']) assert.ok(css.includes(`data-gb-kind="${v}"`), v);
  for (const v of ['s', 'l', 'xl']) assert.ok(css.includes(`data-gb-size="${v}"`), v);
  // the card editor (an iframe) repeats the card look: every size and kind also for the editor body
  for (const v of ['s', 'l', 'xl']) assert.ok(css.includes(`body.canvas-node-iframe-body[data-gb-size="${v}"]`), `editor ${v}`);
  for (const v of ['sticky', 'text']) assert.ok(css.includes(`body.canvas-node-iframe-body[data-gb-kind="${v}"]`), `editor ${v}`);
  assert.ok(!/[–—]/.test(css), 'only short hyphens');
});

test('entering editing keeps the rendered text until the editor has drawn its own (no blank frame)', () => {
  const css = fs.readFileSync(path.join(__dirname, 'styles.css'), 'utf8');
  const src = fs.readFileSync(path.join(__dirname, 'main.js'), 'utf8');
  // the editor that is not ready yet is invisible, and the hidden rendered text is shown on top of it
  assert.ok(/iframe\.embed-iframe:not\(\.gb-ready\)\s*\{\s*opacity:\s*0;/.test(css), 'editor hidden until ready');
  assert.ok(/:has\(> \.markdown-embed-content > iframe\.embed-iframe:not\(\.gb-ready\)\) > \.markdown-embed-content\[style\*="display: none"\]\s*\{\s*display: block !important;/.test(css), 'rendered text kept');
  // a fallback swaps them by itself if the script never marks the editor ready
  assert.ok(css.includes('@keyframes gb-editor-reveal') && css.includes('@keyframes gb-preview-hide'), 'CSS fallback');
  assert.ok(/revealEditor\(iframe\)[\s\S]*?addClass\('gb-ready'\)/.test(src), 'main.js marks the editor ready');
  assert.ok(/this\.applyEditorStyle\(node, iframe\);[\s\S]{0,120}this\.revealEditor\(iframe\)/.test(src), 'reveal follows styling');
});

test('layers: front and back move the selection past everything, keeping its own order', () => {
  const order = ['a', 'b', 'c', 'd', 'e'];
  assert.deepStrictEqual(layerOrder(order, new Set(['b', 'd']), 'front'), ['a', 'c', 'e', 'b', 'd']);
  assert.deepStrictEqual(layerOrder(order, new Set(['b', 'd']), 'back'), ['b', 'd', 'a', 'c', 'e']);
  assert.deepStrictEqual(layerOrder(order, new Set(['e']), 'front'), order);
  assert.deepStrictEqual(layerOrder(order, new Set(), 'front'), order);
});

test('layers: forward and backward step past the nearest overlapping element only', () => {
  const order = ['bg', 'x', 'y', 'card'];
  const touching = { card: ['bg', 'y'], bg: ['card', 'x', 'y'], x: ['bg'], y: ['bg', 'card'] };
  const overlaps = (a, b) => touching[a].includes(b);
  // card overlaps y and bg: backward puts it right under y, not under x it does not touch
  assert.deepStrictEqual(layerOrder(order, new Set(['card']), 'backward', overlaps), ['bg', 'x', 'card', 'y']);
  // once more: the next element it overlaps going down is bg
  assert.deepStrictEqual(layerOrder(['bg', 'x', 'card', 'y'], new Set(['card']), 'backward', overlaps), ['card', 'bg', 'x', 'y']);
  // forward from the bottom: right above bg, the nearest element it overlaps
  assert.deepStrictEqual(layerOrder(['card', 'bg', 'x', 'y'], new Set(['card']), 'forward', overlaps), ['bg', 'card', 'x', 'y']);
  // nothing above it overlaps: no change
  assert.deepStrictEqual(layerOrder(order, new Set(['card']), 'forward', overlaps), order);
  assert.ok(boxesOverlap({ minX: 0, minY: 0, maxX: 10, maxY: 10 }, { minX: 5, minY: 5, maxX: 20, maxY: 20 }));
  assert.ok(!boxesOverlap({ minX: 0, minY: 0, maxX: 10, maxY: 10 }, { minX: 10, minY: 0, maxX: 20, maxY: 10 }));
  assert.ok(!boxesOverlap(null, { minX: 0, minY: 0, maxX: 1, maxY: 1 }));
});

test('style memory: every element kind and every shape has its own slot, marker lines none', () => {
  assert.strictEqual(styleKindOf({}, true), 'edge');
  assert.strictEqual(styleKindOf({ type: 'text' }), 'card');
  assert.strictEqual(styleKindOf({ type: 'text', styleAttributes: { gbKind: 'sticky' } }), 'sticky');
  assert.strictEqual(styleKindOf({ type: 'text', styleAttributes: { gbKind: 'text' } }), 'text');
  assert.strictEqual(styleKindOf({ type: 'text', styleAttributes: { shape: 'pill' } }), 'shape:pill');
  assert.strictEqual(styleKindOf({ type: 'text', styleAttributes: { shape: 'diamond' } }), 'shape:diamond');
  assert.strictEqual(styleKindOf({ type: 'group' }), 'group');
  assert.strictEqual(styleKindOf({ type: 'file' }), 'file');
  assert.strictEqual(styleKindOf({ type: 'text', gbStroke: { points: [] } }), null);
});

test('style memory keeps the look, not the size, text or what the element is', () => {
  const card = { id: 'n1', type: 'text', text: 'hi', x: 5, y: 6, width: 100, height: 50, color: '4', styleAttributes: { shape: 'pill', border: 'dashed', textAlign: 'center', gbSize: null } };
  const s = styleSnapshot(card, false);
  assert.deepStrictEqual(s, { styleAttributes: { border: 'dashed', textAlign: 'center' }, color: '4' });
  const edge = { id: 'e1', fromNode: 'a', toNode: 'b', fromEnd: 'arrow', toEnd: 'none', styleAttributes: { pathfindingMethod: 'square', path: 'dotted' } };
  assert.deepStrictEqual(styleSnapshot(edge, true), { styleAttributes: { pathfindingMethod: 'square', path: 'dotted' }, fromEnd: 'arrow', toEnd: 'none' });
  // the key does not depend on the order of the fields
  assert.strictEqual(styleKey({ color: '1', styleAttributes: { a: 1, b: 2 } }), styleKey({ styleAttributes: { b: 2, a: 1 }, color: '1' }));
  assert.notStrictEqual(styleKey(s), styleKey({ ...s, color: '5' }));
});

test('a remembered style replaces the look of a new element but keeps its kind and shape', () => {
  const sticky = { id: 'n', type: 'text', text: '', x: 0, y: 0, width: 220, height: 220, color: '3', styleAttributes: { gbKind: 'sticky', border: 'solid' } };
  const next = applyStyle(sticky, { styleAttributes: { textAlign: 'right' } }, false);
  assert.deepStrictEqual(next.styleAttributes, { textAlign: 'right', gbKind: 'sticky' });
  assert.strictEqual(next.color, undefined, 'no colour in the style: the default colour');
  assert.deepStrictEqual([next.x, next.width, next.text], [0, 220, '']);
  const edge = { id: 'e', fromNode: 'a', toNode: 'b', toEnd: 'arrow' };
  const e2 = applyStyle(edge, { styleAttributes: { pathfindingMethod: 'square' }, color: '4', fromEnd: 'arrow' }, true);
  assert.deepStrictEqual(e2, { id: 'e', fromNode: 'a', toNode: 'b', fromEnd: 'arrow', color: '4', styleAttributes: { pathfindingMethod: 'square' } });
  assert.ok(!('styleAttributes' in applyStyle({ id: 'z', type: 'text' }, { styleAttributes: {} }, false)), 'no empty styleAttributes added');
});

test('box selection catches an arrow only when the box touches its line', () => {
  const r = { minX: 40, minY: -10, maxX: 60, maxY: 10 };
  assert.ok(segmentHitsRect(0, 0, 100, 0, r), 'line through the box');
  assert.ok(!segmentHitsRect(0, 20, 100, 20, r), 'line passes below');
  assert.ok(segmentHitsRect(45, 0, 55, 0, r), 'line inside the box');
  assert.ok(!segmentHitsRect(0, 0, 30, 0, r), 'line ends before the box');
  assert.ok(segmentHitsRect(50, -100, 50, 100, r), 'vertical line');
  // an L-shaped arrow whose bounding box covers the selection box but whose line does not
  const l = [[0, 0], [0, 100], [100, 100]];
  assert.ok(!polylineHitsRect(l, { minX: 40, minY: 40, maxX: 60, maxY: 60 }));
  assert.ok(polylineHitsRect(l, { minX: 40, minY: 90, maxX: 60, maxY: 110 }));
  assert.ok(!polylineHitsRect([], r));
});

test('context menu: copy, layers and duplicate on top, delete at the bottom, hotkeys by icon', () => {
  const order = orderMenuSections(['danger', 'action', 'gb-edit', 'custom', '', 'gb-layer', 'clipboard', 'gb-clipboard']);
  assert.deepStrictEqual(order, ['clipboard', 'gb-clipboard', 'gb-layer', 'gb-edit', 'action', 'custom', '', 'danger']);
  const keys = menuHotkeys('Ctrl');
  assert.strictEqual(keys['lucide-trash-2'], 'Delete');
  assert.strictEqual(keys['lucide-copy'], 'Ctrl+C');
  assert.strictEqual(menuHotkeys('⌘')['lucide-copy'], '⌘+C');
});

test('dragging with Alt copies, with Ctrl turns snapping off (keys swapped for Canvas)', () => {
  const ev = { ctrlKey: false, altKey: true, shiftKey: false, x: 3, preventDefault() { return this.x; } };
  const s = swapAltCtrl(ev);
  assert.strictEqual(s.ctrlKey, true);
  assert.strictEqual(s.altKey, false);
  assert.strictEqual(s.x, 3);
  assert.strictEqual(s.preventDefault(), 3, 'methods keep the real event as this');
  const seen = [];
  const h = swapAltCtrlHandlers({ move: (e, extra) => seen.push([e.ctrlKey, extra]), cleanup: 'kept' });
  h.move(ev, 7);
  assert.deepStrictEqual(seen, [[true, 7]]);
  assert.strictEqual(h.cleanup, 'kept');
  assert.strictEqual(swapAltCtrl(null), null);
});

test('found in live tests: a new arrow is redrawn with its style, menu copy focuses the canvas', () => {
  const src = fs.readFileSync(path.join(__dirname, 'main.js'), 'utf8');
  // Advanced Canvas redraws an arrow path only while the arrow is dirty or selected
  assert.ok(/applyDefaultStyle\(item\)[\s\S]*?item\.setData\(next\);[\s\S]{0,200}markDirty\(item\)/.test(src), 'markDirty after setData');
  // core Canvas copies only while its wrapper has focus; the menu takes the focus away
  assert.ok(/copySelection\(\)\s*\{[\s\S]{0,200}wrapperEl\.focus\(\)[\s\S]{0,300}\.copy\(\)/.test(src), 'focus before copy');
});

test('main.js carries the vendored perfect-freehand', () => {
  const src = fs.readFileSync(path.join(__dirname, 'main.js'), 'utf8');
  assert.ok(!src.includes('// @vendor perfect-freehand'));
  assert.ok(src.includes('exports.getStroke='));
  assert.ok(!/[–—]/.test(src), 'only short hyphens');
});

test('LICENSE is the plain MIT text, so GitHub and the plugin directory recognize it', () => {
  // Any extra paragraph turns GitHub's license detection into "Other"; third-party notices live in main.js.
  const text = fs.readFileSync(path.join(__dirname, 'LICENSE'), 'utf8').replace(/\r\n/g, '\n');
  assert.ok(text.startsWith('MIT License\n\nCopyright (c) '), 'starts like the MIT template');
  assert.ok(text.trimEnd().endsWith('OTHER DEALINGS IN THE\nSOFTWARE.'), 'ends where the MIT template ends');
  const src = fs.readFileSync(path.join(__dirname, 'main.js'), 'utf8');
  assert.ok(src.includes('Stephen Ruiz Ltd') && src.includes('SIL Open Font License'), 'main.js keeps the third-party notices');
});

test('READMEs and guides use short hyphens, and their images, files and anchors exist', () => {
  // GitHub heading anchors: lower case, punctuation dropped, each space becomes a hyphen.
  const slug = (h) => h.trim().toLowerCase().replace(/[^\p{L}\p{M}\p{N}\p{Pc} -]/gu, '').replace(/ /g, '-');
  const docs = ['README.md', 'README.ru.md', 'docs/guide.md', 'docs/guide.ru.md'];
  const texts = Object.fromEntries(docs.map((d) => [d, fs.readFileSync(path.join(__dirname, d), 'utf8')]));
  const anchors = Object.fromEntries(docs.map((d) => [d, new Set([...texts[d].matchAll(/^#{1,6} (.+)$/gm)].map((m) => slug(m[1])))]));
  for (const name of docs) {
    const text = texts[name];
    assert.ok(!/[–—]/.test(text), `${name}: only short hyphens`);
    assert.ok(text.includes('Advanced Canvas') && text.includes('perfect-freehand') && text.includes('Shantell Sans'), name);
    if (name.startsWith('README')) {
      // Obsidian's plugin browser shows every line break, so a README paragraph or list item stays on one line.
      const lines = text.split('\n');
      let code = false;
      lines.forEach((line, i) => {
        if (line.startsWith('```')) code = !code;
        const prev = lines[i - 1] || '';
        const wrapped = !code && i > 0 && line.trim() && prev.trim()
          && !/^\s*(#|[-*] |\||\d+\. |<|```|!\[)/.test(line) && !/^(#|\||<|```|\s*!\[)/.test(prev);
        assert.ok(!wrapped, `${name}:${i + 1} continues the line above; keep a paragraph on one line`);
      });
    }
    const targets = [...text.matchAll(/\]\(([^)\s]+)\)/g), ...text.matchAll(/<img src="([^"]+)"/g)]
      .map((m) => m[1]).filter((u) => !/^https?:/.test(u));
    assert.ok(targets.length > 3, `${name}: has local links`);
    for (const target of targets) {
      const [file, anchor] = target.split('#');
      const abs = file ? path.join(path.dirname(path.join(__dirname, name)), file) : path.join(__dirname, name);
      assert.ok(fs.existsSync(abs), `${name}: ${target} is missing`);
      const rel = path.relative(__dirname, abs).replace(/\\/g, '/');
      if (anchor) assert.ok(anchors[rel] && anchors[rel].has(anchor), `${name}: no heading for ${target}`);
    }
  }
});

test('every language has every text, and the code asks only for texts that exist', () => {
  const src = fs.readFileSync(path.join(__dirname, 'main.js'), 'utf8');
  const en = Object.keys(STRINGS.en).sort();
  for (const lang of Object.keys(STRINGS)) {
    assert.deepStrictEqual(Object.keys(STRINGS[lang]).sort(), en, `${lang} has the same keys as en`);
    for (const k of en) assert.ok(STRINGS[lang][k].trim(), `${lang}.${k} is not empty`);
  }
  const used = [...src.matchAll(/\bt\('([\w.]+)'/g)].map((m) => m[1]);
  assert.ok(used.length > 30);
  for (const k of used) assert.ok(k in STRINGS.en, `missing text ${k}`);
  for (const tool of TOOLS) assert.ok(`tool.${tool.id}` in STRINGS.en, tool.id);
  for (const s of SHAPES) assert.ok(`shape.${s.id}` in STRINGS.en, s.id);
  for (const c of MARKER_COLORS) assert.ok(`color.${c.id}` in STRINGS.en, c.id);
  // placeholders match between languages
  const vars = (s) => (s.match(/\{\w+\}/g) || []).sort().join();
  for (const lang of Object.keys(STRINGS)) for (const k of en) assert.strictEqual(vars(STRINGS[lang][k]), vars(STRINGS.en[k]), `${lang}.${k}`);
});

test('t() follows the language and falls back to English', () => {
  setLanguage('ru');
  assert.strictEqual(t('menu.copy'), STRINGS.ru['menu.copy']);
  assert.strictEqual(t('command.tool', { tool: 'X' }), STRINGS.ru['command.tool'].replace('{tool}', 'X'));
  setLanguage('xx');
  assert.strictEqual(t('menu.copy'), 'Copy');
  assert.strictEqual(t('nav.zoomLabel', { pct: '50%' }), 'Zoom 50%, click to reset to 100%');
  assert.strictEqual(t('no.such.key'), 'no.such.key');
  setLanguage('en');
});

test('no interface text outside STRINGS: Cyrillic only in the Russian texts', () => {
  const lines = fs.readFileSync(path.join(__dirname, 'main.js'), 'utf8').split('\n');
  const ruStart = lines.findIndex((l) => /^\s{2}ru: \{$/.test(l));
  const ruEnd = lines.findIndex((l, i) => i > ruStart && /^\s{2}\},$/.test(l));
  assert.ok(ruStart > 0 && ruEnd > ruStart);
  lines.forEach((l, i) => {
    if (i > ruStart && i < ruEnd) return;
    if (/^const LANGUAGE_NAMES = /.test(l)) return;
    assert.ok(!/[Ѐ-ӿ]/.test(l), `line ${i + 1}: ${l.trim().slice(0, 80)}`);
  });
});

test('the font is embedded: three woff2 subsets with their unicode ranges', () => {
  const src = fs.readFileSync(path.join(__dirname, 'main.js'), 'utf8');
  const subsets = [...src.matchAll(/\{ name: '([\w-]+)', range: '([^']+)', data: '([A-Za-z0-9+/=]+)' \}/g)];
  assert.deepStrictEqual(subsets.map((m) => m[1]).sort(), ['cyrillic', 'latin', 'latin-ext']);
  for (const [, name, range, data] of subsets) {
    const bytes = Buffer.from(data, 'base64');
    assert.strictEqual(bytes.subarray(0, 4).toString('latin1'), 'wOF2', `${name} is woff2`);
    assert.ok(/^U\+[0-9A-F]/.test(range), name);
  }
  assert.ok(/U\+0400-045F/.test(subsets.find((m) => m[1] === 'cyrillic')[2]), 'cyrillic covers Russian');
  assert.ok(!src.includes('readBinary'), 'nothing is read from the plugin folder');
});

test('manifest follows the Obsidian rules', () => {
  const m = JSON.parse(fs.readFileSync(path.join(__dirname, 'manifest.json'), 'utf8'));
  const versions = JSON.parse(fs.readFileSync(path.join(__dirname, 'versions.json'), 'utf8'));
  for (const k of ['id', 'name', 'version', 'minAppVersion', 'description', 'author', 'isDesktopOnly']) assert.ok(k in m, k);
  assert.ok(/^[a-z]+(-[a-z]+)*$/.test(m.id) && !m.id.includes('obsidian') && !m.id.endsWith('plugin'), 'id');
  assert.ok(/^[\x20-\x7E]+$/.test(m.name) && !/obsidian|plugin/i.test(m.name), 'name');
  assert.ok(/^\d+\.\d+\.\d+$/.test(m.version) && versions[m.version] === m.minAppVersion, 'version');
  assert.ok(m.description.length <= 250 && m.description.endsWith('.') && !/obsidian|this plugin/i.test(m.description), 'description');
  assert.strictEqual(m.isDesktopOnly, true, 'electron clipboard: desktop only');
});

// The cheapest part of the community plugin review (eslint-plugin-obsidianmd), for the plugin's own code: the
// vendored library and the font data are left out.
test('the source passes the review rules that need no linter', () => {
  const src = fs.readFileSync(path.join(__dirname, 'main.js'), 'utf8');
  const own = src.replace(/const PF = \(function \(\) \{[\s\S]*?\n\}\)\(\);/, '').replace(/\/\/ FONT_SUBSETS_START[\s\S]*$/, '');
  own.split('\n').forEach((l, i) => {
    const where = `line ${i + 1}: ${l.trim().slice(0, 80)}`;
    assert.ok(!/(^|[^\w.])(setTimeout|clearTimeout|setInterval|clearInterval|requestAnimationFrame|cancelAnimationFrame)\(/.test(l), `window timers: ${where}`);
    assert.ok(!/(^|[^\w.'])document\./.test(l), `activeDocument or el.doc for popout windows: ${where}`);
    assert.ok(!/=\s*this\s*;/.test(l), `no alias of this: ${where}`);
    assert.ok(!/\b(innerHTML|outerHTML|insertAdjacentHTML)\b|\beval\(|new Function\(/.test(l), `unsafe html or eval: ${where}`);
  });
});

console.log(`${passed} tests passed${process.exitCode ? ', some FAILED' : ''}`);
