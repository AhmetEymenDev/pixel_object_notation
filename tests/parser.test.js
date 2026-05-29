const assert = require("node:assert/strict");
const test = require("node:test");

const {
  FRAME_DELIMITER,
  PALETTE_SYMBOLS,
  parseMPLN,
  parseMPLNFrames,
  parsePON,
  splitMPLNFrames,
} = require("../parser.js");

test("palette symbols do not conflict with MPLN syntax", () => {
  assert.ok(PALETTE_SYMBOLS.length >= 62);
  assert.equal(new Set(PALETTE_SYMBOLS).size, PALETTE_SYMBOLS.length);
  assert.doesNotMatch(PALETTE_SYMBOLS, /[0-9]/);
  assert.doesNotMatch(PALETTE_SYMBOLS, /[.,;|x]/);
});

test("parser decodes palette symbols beyond letter-only indexes", () => {
  const palette = Array.from({ length: 53 }, (_, index) =>
    index.toString(16).padStart(6, "0"),
  );
  const symbol = PALETTE_SYMBOLS[52];

  const { grid } = parseMPLN(`${palette.join(",")}|${symbol};`, 1);

  assert.equal(grid.length, 1);
  assert.deepEqual(grid[0], [palette[52].toUpperCase()]);
});

test("parser rejects rows that expand beyond the declared width", () => {
  assert.throws(
    () => parseMPLN("AA0000|65A;", 64),
    /exceeds 64 columns/,
  );
});

test("parser reads variable canvas dimensions from MPLN header", () => {
  const { grid, width, height } = parseMPLN("128x2|AA0000|128A;128.;");

  assert.equal(width, 128);
  assert.equal(height, 2);
  assert.equal(grid.length, 2);
  assert.equal(grid[0].length, 128);
  assert.equal(grid[1].length, 128);
});

test("parser reads two-character palette tokens from T2 headers", () => {
  const source = "4x1;T2|FF0000,00FF00|AA3AB;";
  const { grid, tokenWidth, width, height } = parseMPLN(source);

  assert.equal(width, 4);
  assert.equal(height, 1);
  assert.equal(tokenWidth, 2);
  assert.deepEqual(grid[0], ["FF0000", "00FF00", "00FF00", "00FF00"]);
});

test("parser exposes the old parsePON browser alias", () => {
  const { width } = parsePON("2x1|AA0000|2A;");

  assert.equal(width, 2);
});

test("parser splits and parses multi-frame MPLN documents", () => {
  const source = [
    "2x1|FF0000|2A;",
    "2x1|00FF00|A.;",
  ].join(FRAME_DELIMITER);

  assert.deepEqual(splitMPLNFrames(source), [
    "2x1|FF0000|2A;",
    "2x1|00FF00|A.;",
  ]);

  const frames = parseMPLNFrames(source);
  assert.equal(frames.length, 2);
  assert.equal(frames[0].grid[0][0], "FF0000");
  assert.equal(frames[1].grid[0][0], "00FF00");
});
