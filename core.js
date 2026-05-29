(function (global) {
  const TRANSPARENT_ALPHA_THRESHOLD = 5;
  const NEAR_BLACK_THRESHOLD = 10;

  function rgbaToHex(r, g, b, a = 255) {
    const channels = a < 255 ? [r, g, b, a] : [r, g, b];
    return channels
      .map((x) => x.toString(16).padStart(2, "0").toUpperCase())
      .join("");
  }

  function hexToRgba(hex) {
    return {
      r: parseInt(hex.slice(0, 2), 16),
      g: parseInt(hex.slice(2, 4), 16),
      b: parseInt(hex.slice(4, 6), 16),
      a: hex.length === 8 ? parseInt(hex.slice(6, 8), 16) : 255,
    };
  }

  function parsePaletteText(text) {
    const colors = [];
    const seen = new Set();

    text.split(/\r?\n/).forEach((rawLine) => {
      const line = rawLine.trim();
      if (!line) return;
      if (
        line.startsWith("#") &&
        !/^#[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?/.test(line)
      ) {
        return;
      }
      if (/^(GIMP Palette|Name:|Columns:)/i.test(line)) return;

      let hex = null;
      const gplMatch = line.match(/^(\d{1,3})\s+(\d{1,3})\s+(\d{1,3})(?:\s|$)/);
      if (gplMatch) {
        const [, r, g, b] = gplMatch.map(Number);
        if ([r, g, b].every((value) => value >= 0 && value <= 255)) {
          hex = rgbaToHex(r, g, b);
        }
      }

      if (!hex) {
        const hexMatches =
          line.match(/#?[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?/g) || [];
        hexMatches.forEach((match) => {
          const normalized = match.replace(/^#/, "").toUpperCase();
          if (
            (normalized.length === 6 || normalized.length === 8) &&
            !seen.has(normalized)
          ) {
            seen.add(normalized);
            colors.push(normalized);
          }
        });
        return;
      }

      if (!seen.has(hex)) {
        seen.add(hex);
        colors.push(hex);
      }
    });

    return colors;
  }

  function isVisiblePixel(r, g, b, a, transparentNearBlack = false) {
    if (a <= TRANSPARENT_ALPHA_THRESHOLD) {
      return false;
    }
    if (transparentNearBlack) {
      return (
        r > NEAR_BLACK_THRESHOLD ||
        g > NEAR_BLACK_THRESHOLD ||
        b > NEAR_BLACK_THRESHOLD
      );
    }
    return true;
  }

  function colorBoxRange(colors) {
    const range = {
      rMin: 255,
      rMax: 0,
      gMin: 255,
      gMax: 0,
      bMin: 255,
      bMax: 0,
      aMin: 255,
      aMax: 0,
      count: 0,
    };

    colors.forEach((color) => {
      range.rMin = Math.min(range.rMin, color.r);
      range.rMax = Math.max(range.rMax, color.r);
      range.gMin = Math.min(range.gMin, color.g);
      range.gMax = Math.max(range.gMax, color.g);
      range.bMin = Math.min(range.bMin, color.b);
      range.bMax = Math.max(range.bMax, color.b);
      range.aMin = Math.min(range.aMin, color.a);
      range.aMax = Math.max(range.aMax, color.a);
      range.count += color.count;
    });

    return range;
  }

  function widestChannel(colors) {
    const range = colorBoxRange(colors);
    const widths = {
      r: range.rMax - range.rMin,
      g: range.gMax - range.gMin,
      b: range.bMax - range.bMin,
      a: range.aMax - range.aMin,
    };

    return Object.keys(widths).reduce((best, channel) =>
      widths[channel] > widths[best] ? channel : best,
    );
  }

  function splitColorBox(colors) {
    const channel = widestChannel(colors);
    const sorted = colors.slice().sort((a, b) => a[channel] - b[channel]);
    const total = sorted.reduce((sum, color) => sum + color.count, 0);
    let running = 0;
    let splitIndex = 1;

    for (let i = 0; i < sorted.length - 1; i++) {
      running += sorted[i].count;
      if (running >= total / 2) {
        splitIndex = i + 1;
        break;
      }
    }

    return [sorted.slice(0, splitIndex), sorted.slice(splitIndex)];
  }

  function averageColor(colors) {
    const total = colors.reduce((sum, color) => sum + color.count, 0);
    const sum = colors.reduce(
      (acc, color) => {
        acc.r += color.r * color.count;
        acc.g += color.g * color.count;
        acc.b += color.b * color.count;
        acc.a += color.a * color.count;
        return acc;
      },
      { r: 0, g: 0, b: 0, a: 0 },
    );

    return rgbaToHex(
      Math.round(sum.r / total),
      Math.round(sum.g / total),
      Math.round(sum.b / total),
      Math.round(sum.a / total),
    );
  }

  function medianCutQuantize(colors, limit) {
    if (colors.length <= limit) {
      return colors.map((color) => color.hex);
    }

    const boxes = [colors.slice()];
    while (boxes.length < limit) {
      let bestIndex = -1;
      let bestScore = -1;

      boxes.forEach((box, index) => {
        if (box.length < 2) return;
        const range = colorBoxRange(box);
        const maxWidth = Math.max(
          range.rMax - range.rMin,
          range.gMax - range.gMin,
          range.bMax - range.bMin,
          range.aMax - range.aMin,
        );
        const score = maxWidth * range.count;
        if (score > bestScore) {
          bestScore = score;
          bestIndex = index;
        }
      });

      if (bestIndex === -1) break;
      const [left, right] = splitColorBox(boxes[bestIndex]);
      boxes.splice(bestIndex, 1, left, right);
    }

    const palette = boxes.map(averageColor);
    const uniquePalette = Array.from(new Set(palette));
    const frequentColors = colors
      .slice()
      .sort((a, b) => b.count - a.count)
      .map((color) => color.hex);

    for (const hex of frequentColors) {
      if (uniquePalette.length >= limit) break;
      if (!uniquePalette.includes(hex)) {
        uniquePalette.push(hex);
      }
    }

    return uniquePalette.slice(0, limit);
  }

  function normalizePalette(paletteHexes, limit) {
    return Array.from(
      new Set(
        paletteHexes
          .map((hex) => hex.replace(/^#/, "").trim().toUpperCase())
          .filter((hex) => hex.length === 6 || hex.length === 8),
      ),
    ).slice(0, limit);
  }

  function buildPalette(
    colors,
    limit,
    mode = "lossy",
    customPaletteHexes = [],
  ) {
    const forcedPalette = normalizePalette(customPaletteHexes, limit);
    if (forcedPalette.length > 0) {
      return forcedPalette;
    }

    if (mode === "lossless") {
      if (colors.length <= limit) {
        return colors.map((color) => color.hex);
      }
      return medianCutQuantize(colors, limit);
    }

    return medianCutQuantize(colors, limit);
  }

  function tokenCapacity(paletteSymbols, tokenWidth) {
    return paletteSymbols.length ** tokenWidth;
  }

  function tokenWidthForColorCount(colorCount, paletteSymbols) {
    if (colorCount <= tokenCapacity(paletteSymbols, 1)) {
      return 1;
    }
    return 2;
  }

  function tokenForIndex(index, paletteSymbols, tokenWidth) {
    if (tokenWidth === 1) {
      return paletteSymbols[index];
    }
    const base = paletteSymbols.length;
    const chars = new Array(tokenWidth);
    let value = index;
    for (let i = tokenWidth - 1; i >= 0; i--) {
      chars[i] = paletteSymbols[value % base];
      value = Math.floor(value / base);
    }
    return chars.join("");
  }

  function colorDistance(a, b) {
    const dr = a.r - b.r;
    const dg = a.g - b.g;
    const db = a.b - b.b;
    const da = a.a - b.a;
    return dr * dr + dg * dg + db * db + da * da * 2;
  }

  function findClosestPaletteIndex(color, paletteColors) {
    let closestIdx = 0;
    let minDistance = Infinity;

    paletteColors.forEach((paletteColor, index) => {
      const distance = colorDistance(color, paletteColor);
      if (distance < minDistance) {
        minDistance = distance;
        closestIdx = index;
      }
    });

    return closestIdx;
  }

  function addError(
    buffer,
    width,
    height,
    x,
    y,
    error,
    factor,
    transparentNearBlack,
  ) {
    if (x < 0 || x >= width || y < 0 || y >= height) return;
    const index = (y * width + x) * 4;
    if (
      !isVisiblePixel(
        buffer[index],
        buffer[index + 1],
        buffer[index + 2],
        buffer[index + 3],
        transparentNearBlack,
      )
    ) {
      return;
    }

    buffer[index] += error.r * factor;
    buffer[index + 1] += error.g * factor;
    buffer[index + 2] += error.b * factor;
  }

  function mapImageDataToPaletteIndices(
    imgData,
    width,
    height,
    paletteHexes,
    mode = "lossy",
    transparentNearBlack = false,
  ) {
    const paletteColors = paletteHexes.map(hexToRgba);
    const indices = new Array(width * height).fill(-1);
    const useDither = mode === "dither";
    const buffer = useDither ? Array.from(imgData, (value) => value) : imgData;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const pixelIndex = (y * width + x) * 4;
        const r = buffer[pixelIndex];
        const g = buffer[pixelIndex + 1];
        const b = buffer[pixelIndex + 2];
        const a = buffer[pixelIndex + 3];

        if (
          !isVisiblePixel(r, g, b, a, transparentNearBlack) ||
          paletteColors.length === 0
        ) {
          continue;
        }

        const color = { r, g, b, a };
        const paletteIndex = findClosestPaletteIndex(color, paletteColors);
        indices[y * width + x] = paletteIndex;

        if (useDither) {
          const target = paletteColors[paletteIndex];
          const error = {
            r: r - target.r,
            g: g - target.g,
            b: b - target.b,
          };
          addError(
            buffer,
            width,
            height,
            x + 1,
            y,
            error,
            7 / 16,
            transparentNearBlack,
          );
          addError(
            buffer,
            width,
            height,
            x - 1,
            y + 1,
            error,
            3 / 16,
            transparentNearBlack,
          );
          addError(
            buffer,
            width,
            height,
            x,
            y + 1,
            error,
            5 / 16,
            transparentNearBlack,
          );
          addError(
            buffer,
            width,
            height,
            x + 1,
            y + 1,
            error,
            1 / 16,
            transparentNearBlack,
          );
        }
      }
    }

    return indices;
  }

  function rleLine(chars) {
    if (chars.length === 0) return "";
    const tokens = [];
    let current = chars[0];
    let count = 1;

    for (let i = 1; i < chars.length; i++) {
      if (chars[i] === current) {
        count++;
      } else {
        tokens.push(count === 1 ? current : `${count}${current}`);
        current = chars[i];
        count = 1;
      }
    }
    tokens.push(count === 1 ? current : `${count}${current}`);
    return tokens.join("");
  }

  function compressEmptyRows(lines, width) {
    const optimized = [];
    const emptyRow = `${width}.`;
    let emptyRun = 0;

    lines.forEach((line) => {
      if (line === emptyRow) {
        emptyRun++;
        return;
      }
      if (emptyRun > 0) {
        optimized.push(`${emptyRun}x${width}`);
        emptyRun = 0;
      }
      optimized.push(line);
    });

    if (emptyRun > 0) {
      optimized.push(`${emptyRun}x${width}`);
    }
    return optimized;
  }

  function encodeImageDataToMPLN(imgData, width, height, options = {}) {
    const mode = options.mode || "lossy";
    const paletteSymbols = options.paletteSymbols;
    if (!paletteSymbols) {
      throw new Error("encodeImageDataToMPLN requires paletteSymbols.");
    }
    const transparentNearBlack = Boolean(options.transparentNearBlack);
    const colorMap = new Map();

    for (let i = 0; i < imgData.length; i += 4) {
      const r = imgData[i];
      const g = imgData[i + 1];
      const b = imgData[i + 2];
      const a = imgData[i + 3];

      if (isVisiblePixel(r, g, b, a, transparentNearBlack)) {
        const hex = rgbaToHex(r, g, b, a);
        const existing = colorMap.get(hex);
        if (existing) {
          existing.count++;
        } else {
          colorMap.set(hex, { hex, r, g, b, a, count: 1 });
        }
      }
    }

    const colorPool = Array.from(colorMap.values());
    const customPaletteCount = parsePaletteText(
      (options.customPaletteHexes || []).join("\n"),
    ).length;
    const requestedColorCount = Math.max(colorPool.length, customPaletteCount);
    const tokenWidth = tokenWidthForColorCount(requestedColorCount, paletteSymbols);
    const colorLimit = tokenCapacity(paletteSymbols, tokenWidth);

    let palette = buildPalette(
      colorPool,
      colorLimit,
      mode,
      options.customPaletteHexes || [],
    );
    if (palette.length === 0) {
      palette = ["000000"];
    }

    const pixelIndices = mapImageDataToPaletteIndices(
      imgData,
      width,
      height,
      palette,
      mode,
      transparentNearBlack,
    );
    const lines = [];
    for (let y = 0; y < height; y++) {
      const chars = [];
      for (let x = 0; x < width; x++) {
        const index = pixelIndices[y * width + x];
        chars.push(
          index >= 0 && index < palette.length
            ? tokenForIndex(index, paletteSymbols, tokenWidth)
            : ".",
        );
      }
      lines.push(rleLine(chars));
    }

    const optimized = compressEmptyRows(lines, width);
    const header = tokenWidth === 1
      ? `${width}x${height}`
      : `${width}x${height};T${tokenWidth}`;
    return `${header}|${palette.join(",")}|${optimized.join(";")};`;
  }

  const MPLNCore = {
    buildPalette,
    encodeImageDataToMPLN,
    findClosestPaletteIndex,
    hexToRgba,
    isVisiblePixel,
    mapImageDataToPaletteIndices,
    medianCutQuantize,
    parsePaletteText,
    rgbaToHex,
    tokenCapacity,
    tokenForIndex,
    tokenWidthForColorCount,
  };

  global.MPLNCore = MPLNCore;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = MPLNCore;
  }
})(typeof window !== "undefined" ? window : globalThis);
