const assert = require("node:assert/strict");
const test = require("node:test");

const {
  buildPalette,
  mapImageDataToPaletteIndices,
  parsePaletteText,
} = require("../core.js");

test("parsePaletteText reads GIMP GPL palettes", () => {
  const palette = parsePaletteText(`
GIMP Palette
Name: Test
#
  0   0   0 Black
 12  34  56 Blue-ish
255 128   0 Orange
`);

  assert.deepEqual(palette, ["000000", "0C2238", "FF8000"]);
});

test("parsePaletteText reads hex lists", () => {
  const palette = parsePaletteText("#001122, aa33cc\n778899\n#bad");

  assert.deepEqual(palette, ["001122", "AA33CC", "778899"]);
});

test("buildPalette preserves exact colors in lossless mode when possible", () => {
  const colors = [
    { hex: "001122", r: 0, g: 17, b: 34, a: 255, count: 4 },
    { hex: "AA33CC", r: 170, g: 51, b: 204, a: 255, count: 2 },
  ];

  assert.deepEqual(buildPalette(colors, 3, "lossless"), ["001122", "AA33CC"]);
});

test("buildPalette rejects lossless images with too many colors", () => {
  const colors = [
    { hex: "000000", r: 0, g: 0, b: 0, a: 255, count: 1 },
    { hex: "111111", r: 17, g: 17, b: 17, a: 255, count: 1 },
  ];

  assert.throws(
    () => buildPalette(colors, 1, "lossless"),
    /Lossless mode needs 2 colors but only 1 symbols are available/,
  );
});

test("buildPalette uses a custom palette when provided", () => {
  const colors = [
    { hex: "123456", r: 18, g: 52, b: 86, a: 255, count: 1 },
  ];

  assert.deepEqual(buildPalette(colors, 4, "lossy", ["000000", "FFFFFF"]), [
    "000000",
    "FFFFFF",
  ]);
});

test("mapImageDataToPaletteIndices supports nearest and dither modes", () => {
  const data = new Uint8ClampedArray([
    20, 20, 20, 255,
    250, 250, 250, 255,
    120, 120, 120, 255,
    180, 180, 180, 255,
  ]);
  const palette = ["000000", "FFFFFF"];

  const nearest = mapImageDataToPaletteIndices(data, 2, 2, palette, "lossy");
  const dithered = mapImageDataToPaletteIndices(data, 2, 2, palette, "dither");

  assert.equal(nearest.length, 4);
  assert.equal(dithered.length, 4);
  assert.ok(nearest.every((idx) => idx === 0 || idx === 1));
  assert.ok(dithered.every((idx) => idx === 0 || idx === 1));
});
