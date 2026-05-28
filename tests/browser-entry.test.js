const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const test = require("node:test");
const vm = require("node:vm");

test("browser entrypoint works when index.html is opened directly", () => {
  const html = readFileSync("index.html", "utf8");
  const script = readFileSync("script.js", "utf8");

  assert.doesNotMatch(html, /type="module"/);
  assert.doesNotMatch(script, /^\s*import\s/m);
  assert.doesNotMatch(script, /^\s*export\s/m);
});

test("classic scripts can execute together without global name collisions", () => {
  const core = readFileSync("core.js", "utf8");
  const parser = readFileSync("parser.js", "utf8");
  const script = readFileSync("script.js", "utf8");
  const elements = new Map();
  const makeElement = () => ({
    addEventListener() {},
    appendChild() {},
    click() {},
    getContext() {
      return {
        clearRect() {},
        fillRect() {},
        getImageData() {
          return { data: new Uint8ClampedArray() };
        },
      };
    },
    removeChild() {},
    style: {},
    value: "",
  });
  const context = {
    Blob: function Blob() {},
    FileReader: function FileReader() {},
    Image: function Image() {},
    URL: {
      createObjectURL() {
        return "blob:test";
      },
      revokeObjectURL() {},
    },
    alert() {},
    console,
    document: {
      body: makeElement(),
      createElement: makeElement,
      documentElement: { dataset: {} },
      getElementById(id) {
        if (!elements.has(id)) {
          elements.set(id, makeElement());
        }
        return elements.get(id);
      },
    },
    window: {},
  };

  vm.createContext(context);

  assert.doesNotThrow(() => {
    vm.runInContext(core, context);
    vm.runInContext(parser, context);
    vm.runInContext(script, context);
  });
  assert.equal(typeof context.window.renderPON, "function");
});

test("image import can retry the same file selection", () => {
  const script = readFileSync("script.js", "utf8");

  assert.match(script, /imageImportInput\.addEventListener\("click"/);
  assert.match(script, /imageImportInput\.value = ""/);
});

test("image import uses palette quantization instead of luminance-only sorting", () => {
  const script = readFileSync("script.js", "utf8");

  assert.match(script, /medianCutQuantize/);
  assert.match(script, /findClosestPaletteIndex/);
  assert.doesNotMatch(script, /colorPool\.sort\(\(a, b\) => b\.luminance - a\.luminance\)/);
});

test("ui exposes image export and mpln import controls", () => {
  const html = readFileSync("index.html", "utf8");

  assert.match(html, /id="importWidthInput"/);
  assert.match(html, /id="compressionModeSelect"/);
  assert.match(html, /id="paletteImportInput"/);
  assert.match(html, /id="paletteTextInput"/);
  assert.match(html, /id="exportPngBtn"/);
  assert.match(html, /id="exportJpgBtn"/);
  assert.match(html, /id="mplnImportInput"/);
  assert.match(html, /accept="\.mpln,text\/plain"/);
  assert.match(html, /id="comparisonCanvas"/);
});

test("script supports exported images, mpln import, and mirrored comparison", () => {
  const script = readFileSync("script.js", "utf8");
  const html = readFileSync("index.html", "utf8");

  assert.match(html, /core\.js\?v=/);
  assert.match(script, /window\.MPLNCore/);
  assert.match(script, /compressionModeSelect\.value/);
  assert.match(script, /paletteImportInput\.addEventListener\("change"/);
  assert.match(script, /paletteTextInput\.addEventListener\("input"/);
  assert.match(script, /function getImportTargetWidth/);
  assert.match(script, /\$\{targetWidth\}x\$\{targetHeight\}\|/);
  assert.doesNotMatch(script, /const GRID_COLUMNS = 64/);
  assert.match(script, /function exportRenderedImage/);
  assert.match(script, /mplnImportInput\.addEventListener\("change"/);
  assert.match(script, /function updateComparisonCanvas/);
  assert.match(script, /comparisonCtx\.scale\(-1, 1\)/);
});
