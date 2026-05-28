const assert = require("node:assert/strict");
const test = require("node:test");

const { PALETTE_SYMBOLS, parsePON } = require("../parser.js");

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

  const { grid } = parsePON(`${palette.join(",")}|${symbol};`, 1);

  assert.equal(grid.length, 1);
  assert.deepEqual(grid[0], [palette[52].toUpperCase()]);
});

test("parser rejects rows that expand beyond the declared width", () => {
  assert.throws(
    () => parsePON("AA0000|65A;", 64),
    /exceeds 64 columns/,
  );
});

test("parser reads variable canvas dimensions from MPLN header", () => {
  const { grid, width, height } = parsePON("128x2|AA0000|128A;128.;");

  assert.equal(width, 128);
  assert.equal(height, 2);
  assert.equal(grid.length, 2);
  assert.equal(grid[0].length, 128);
  assert.equal(grid[1].length, 128);
});
