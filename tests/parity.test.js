const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const path = require("node:path");
const test = require("node:test");
const zlib = require("node:zlib");

const { encodeImageDataToMPLN } = require("../core.js");
const { PALETTE_SYMBOLS, parseMPLNFrames } = require("../parser.js");

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type, "ascii");
  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  typeBuffer.copy(chunk, 4);
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 8 + data.length);
  return chunk;
}

function encodePngRgba(width, height, rgba) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const scanlines = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    const rowStart = y * (1 + width * 4);
    scanlines[rowStart] = 0;
    Buffer.from(rgba.slice(y * width * 4, (y + 1) * width * 4)).copy(
      scanlines,
      rowStart + 1,
    );
  }
  return Buffer.concat([
    signature,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", zlib.deflateSync(scanlines)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function decodePngRgba(buffer) {
  let offset = 8;
  let width = 0;
  let height = 0;
  let colorType = 0;
  const idat = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      colorType = data[9];
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "IEND") {
      break;
    }
    offset += 12 + length;
  }

  const bytesPerPixel = colorType === 6 ? 4 : 3;
  const inflated = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * bytesPerPixel;
  const raw = Buffer.alloc(height * stride);
  let sourceOffset = 0;

  for (let y = 0; y < height; y++) {
    const filter = inflated[sourceOffset++];
    for (let x = 0; x < stride; x++) {
      const current = inflated[sourceOffset++];
      const left = x >= bytesPerPixel ? raw[y * stride + x - bytesPerPixel] : 0;
      const up = y > 0 ? raw[(y - 1) * stride + x] : 0;
      const upLeft =
        y > 0 && x >= bytesPerPixel
          ? raw[(y - 1) * stride + x - bytesPerPixel]
          : 0;
      let value = current;
      if (filter === 1) value = current + left;
      if (filter === 2) value = current + up;
      if (filter === 3) value = current + Math.floor((left + up) / 2);
      if (filter === 4) value = current + paeth(left, up, upLeft);
      raw[y * stride + x] = value & 0xff;
    }
  }

  const rgba = new Uint8Array(width * height * 4);
  for (let i = 0, j = 0; i < raw.length; i += bytesPerPixel, j += 4) {
    rgba[j] = raw[i];
    rgba[j + 1] = raw[i + 1];
    rgba[j + 2] = raw[i + 2];
    rgba[j + 3] = colorType === 6 ? raw[i + 3] : 255;
  }
  return { width, height, rgba };
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

function renderMPLNToRgba(mpln) {
  const frames = parseMPLNFrames(mpln);
  const width = frames.reduce((sum, frame) => sum + frame.width, 0);
  const height = Math.max(...frames.map((frame) => frame.height));
  const rgba = new Uint8Array(width * height * 4);
  let offsetX = 0;
  for (const frame of frames) {
    for (let y = 0; y < frame.height; y++) {
      for (let x = 0; x < frame.width; x++) {
        const hex = frame.grid[y][x];
        if (hex === ".") continue;
        const target = (y * width + offsetX + x) * 4;
        rgba[target] = parseInt(hex.slice(0, 2), 16);
        rgba[target + 1] = parseInt(hex.slice(2, 4), 16);
        rgba[target + 2] = parseInt(hex.slice(4, 6), 16);
        rgba[target + 3] = hex.length === 8 ? parseInt(hex.slice(6, 8), 16) : 255;
      }
    }
    offsetX += frame.width;
  }
  return { width, height, rgba };
}

function assertSamePixels(actual, expected) {
  assert.equal(actual.width, expected.width);
  assert.equal(actual.height, expected.height);
  assert.deepEqual(Array.from(actual.rgba), Array.from(expected.rgba));
}

test("Go CLI and JS core are pixel-perfect for lossless PNG encode/decode", () => {
  assert.equal(typeof encodeImageDataToMPLN, "function");
  const width = 3;
  const height = 2;
  const rgba = new Uint8Array([
    5, 5, 5, 255,
    250, 10, 10, 255,
    0, 0, 0, 0,
    20, 30, 40, 255,
    10, 250, 10, 255,
    10, 20, 250, 255,
  ]);

  const jsMpln = encodeImageDataToMPLN(rgba, width, height, {
    mode: "lossless",
    paletteSymbols: PALETTE_SYMBOLS,
  });
  const jsPixels = renderMPLNToRgba(jsMpln);
  const workspace = path.resolve(__dirname, "..");
  const tempDir = mkdtempSync(path.join(tmpdir(), "mpln-parity-"));

  try {
    const sourcePng = path.join(tempDir, "source.png");
    const goMpln = path.join(tempDir, "source.mpln");
    const goPng = path.join(tempDir, "source_go.png");
    writeFileSync(sourcePng, encodePngRgba(width, height, rgba));
    execFileSync("go", ["run", "./cmd/mpln", "encode", "-in", sourcePng, "-out", goMpln, "-mode", "lossless"], {
      cwd: workspace,
      env: { ...process.env, GOCACHE: path.join(workspace, ".gocache") },
      stdio: "pipe",
    });
    execFileSync("go", ["run", "./cmd/mpln", "decode", "-in", goMpln, "-out", goPng], {
      cwd: workspace,
      env: { ...process.env, GOCACHE: path.join(workspace, ".gocache") },
      stdio: "pipe",
    });

    assert.ok(existsSync(goPng));
    assert.equal(readFileSync(goMpln, "utf8"), jsMpln);
    assertSamePixels(decodePngRgba(readFileSync(goPng)), jsPixels);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("Go CLI and JS core produce identical lossy MPLN text", () => {
  const width = 80;
  const height = 1;
  const rgba = new Uint8Array(width * height * 4);
  for (let x = 0; x < width; x++) {
    const index = x * 4;
    rgba[index] = (x * 3) % 256;
    rgba[index + 1] = (x * 5) % 256;
    rgba[index + 2] = (x * 7) % 256;
    rgba[index + 3] = 255;
  }

  const jsMpln = encodeImageDataToMPLN(rgba, width, height, {
    mode: "lossy",
    paletteSymbols: PALETTE_SYMBOLS,
  });
  const workspace = path.resolve(__dirname, "..");
  const tempDir = mkdtempSync(path.join(tmpdir(), "mpln-parity-"));

  try {
    const sourcePng = path.join(tempDir, "source.png");
    const goMpln = path.join(tempDir, "source.mpln");
    writeFileSync(sourcePng, encodePngRgba(width, height, rgba));
    execFileSync("go", ["run", "./cmd/mpln", "encode", "-in", sourcePng, "-out", goMpln, "-mode", "lossy"], {
      cwd: workspace,
      env: { ...process.env, GOCACHE: path.join(workspace, ".gocache") },
      stdio: "pipe",
    });

    assert.equal(readFileSync(goMpln, "utf8"), jsMpln);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("Go CLI and JS parser render the same multi-frame MPLN pixels", () => {
  const mpln = "2x1|FF0000,00000000|A.;||2x1|00FF00|.A;";
  const expected = renderMPLNToRgba(mpln);
  const workspace = path.resolve(__dirname, "..");
  const tempDir = mkdtempSync(path.join(tmpdir(), "mpln-parity-"));

  try {
    const mplnPath = path.join(tempDir, "frames.mpln");
    const pngPath = path.join(tempDir, "frames.png");
    writeFileSync(mplnPath, mpln);
    execFileSync("go", ["run", "./cmd/mpln", "decode", "-in", mplnPath, "-out", pngPath], {
      cwd: workspace,
      env: { ...process.env, GOCACHE: path.join(workspace, ".gocache") },
      stdio: "pipe",
    });

    assertSamePixels(decodePngRgba(readFileSync(pngPath)), expected);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});
