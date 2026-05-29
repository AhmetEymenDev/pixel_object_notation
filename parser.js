(function (global) {
  const PALETTE_SYMBOLS =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwyz!#$%&()*+-/:<=>?@[]^_{}~";
  const FRAME_DELIMITER = "||";

  function tokenCapacity(tokenWidth) {
    return PALETTE_SYMBOLS.length ** tokenWidth;
  }

  function tokenForIndex(index, tokenWidth = 1) {
    if (index < 0 || index >= tokenCapacity(tokenWidth)) {
      return null;
    }
    if (tokenWidth === 1) {
      return PALETTE_SYMBOLS[index];
    }
    const base = PALETTE_SYMBOLS.length;
    const chars = new Array(tokenWidth);
    let value = index;
    for (let i = tokenWidth - 1; i >= 0; i--) {
      chars[i] = PALETTE_SYMBOLS[value % base];
      value = Math.floor(value / base);
    }
    return chars.join("");
  }

  function tokenMapForPalette(paletteLength, tokenWidth) {
    const map = new Map();
    for (let index = 0; index < paletteLength; index++) {
      map.set(tokenForIndex(index, tokenWidth), index);
    }
    return map;
  }

  function parseFrameHeader(value, fallbackColumns) {
    const header = value.trim();
    const match = header.match(/^(\d+)x(\d+)(?:;T(\d+))?$/);
    if (!match) {
      return null;
    }
    const tokenWidth = match[3] ? parseInt(match[3], 10) : 1;
    if (tokenWidth < 1) {
      throw new Error(`Invalid token width: T${tokenWidth}.`);
    }
    return {
      declaredRows: parseInt(match[2], 10),
      tokenWidth,
      width: parseInt(match[1], 10) || fallbackColumns,
    };
  }

  /**
   * MPLN (Manipulated Pixel Line Notation) Parser - Stable Core v3.2
   * @param {string} mplnString
   * @param {number} fallbackColumns
   */
  function parseMPLN(mplnString, fallbackColumns = 64) {
    const sections = mplnString.trim().split("|");
    if (sections.length !== 2 && sections.length !== 3) {
      throw new Error("Geçersiz MPLN Formatı.");
    }

    const header = sections.length === 3
      ? parseFrameHeader(sections[0], fallbackColumns)
      : null;
    const hasDimensionHeader = Boolean(header);
    const totalColumns = header ? header.width : fallbackColumns;
    const declaredRows = header ? header.declaredRows : null;
    const tokenWidth = header ? header.tokenWidth : 1;
    const paletteSection = hasDimensionHeader ? sections[1] : sections[0];
    const rowsSection = hasDimensionHeader ? sections[2] : sections[1];

    const palette = paletteSection
      .split(",")
      .map((hex) => hex.trim().toUpperCase());

    const tokenMap = tokenMapForPalette(palette.length, tokenWidth);
    const rows = rowsSection.split(";");
    const grid = [];

    for (const row of rows) {
      const trimmedRow = row.trim();
      if (!trimmedRow) continue;

      // Üst üste binen boş satırları çoğaltma mantığı (Örn: 22x64)
      if (/^\d+x\d+$/.test(trimmedRow)) {
        const [multiplier, count] = trimmedRow.split("x").map(Number);
        if (count > totalColumns) {
          throw new Error(
            `Empty row token exceeds ${totalColumns} columns: ${trimmedRow}`,
          );
        }
        for (let m = 0; m < multiplier; m++) {
          const emptyRow = new Array(count).fill(".");
          while (emptyRow.length < totalColumns) {
            emptyRow.push(".");
          }
          grid.push(emptyRow);
        }
        continue;
      }

      const currentLinePixels = [];

      // Karakter kaçırma riskini sıfıra indiren yeni güvenli token ayıklayıcı
      let i = 0;
      while (i < trimmedRow.length) {
        let numStr = "";

        // Sayısal çarpanı (RLE sayısını) topla
        while (i < trimmedRow.length && /[0-9]/.test(trimmedRow[i])) {
          numStr += trimmedRow[i];
          i++;
        }

        const count = numStr ? parseInt(numStr, 10) : 1;
        const char = trimmedRow[i];
        if (!char) break;

        const token = char === "."
          ? "."
          : trimmedRow.slice(i, i + tokenWidth);
        i += token === "." ? 1 : tokenWidth;

        let pixelValue = ".";
        if (token !== ".") {
          const idx = tokenMap.get(token);
          if (typeof idx === "number" && idx < palette.length) {
            pixelValue = palette[idx];
          }
        }

        for (let c = 0; c < count; c++) {
          currentLinePixels.push(pixelValue);
        }

        if (currentLinePixels.length > totalColumns) {
          throw new Error(
            `MPLN row "${trimmedRow}" exceeds ${totalColumns} columns.`,
          );
        }
      }

      // Güvenlik duvarı: Eksik pikselleri transparanla doldur
      while (currentLinePixels.length < totalColumns) {
        currentLinePixels.push(".");
      }
      grid.push(currentLinePixels);
    }

    if (declaredRows !== null && grid.length !== declaredRows) {
      throw new Error(
        `MPLN row count ${grid.length} does not match header ${declaredRows}.`,
      );
    }

    return {
      palette,
      grid,
      tokenWidth,
      width: totalColumns,
      height: grid.length,
    };
  }

  function splitMPLNFrames(mplnString) {
    return mplnString
      .split(FRAME_DELIMITER)
      .map((frame) => frame.trim())
      .filter(Boolean);
  }

  function parseMPLNFrames(mplnString, fallbackColumns = 64) {
    const frames = splitMPLNFrames(mplnString);
    if (frames.length === 0) {
      throw new Error("Geçersiz MPLN Formatı.");
    }
    return frames.map((frame) => parseMPLN(frame, fallbackColumns));
  }

  const MPLNParser = {
    FRAME_DELIMITER,
    PALETTE_SYMBOLS,
    parseMPLN,
    parseMPLNFrames,
    parsePON: parseMPLN,
    splitMPLNFrames,
    tokenCapacity,
    tokenForIndex,
  };

  global.MPLNParser = MPLNParser;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = MPLNParser;
  }
})(typeof window !== "undefined" ? window : globalThis);
