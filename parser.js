(function (global) {
  const PALETTE_SYMBOLS =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwyz!#$%&()*+-/:<=>?@[]^_{}~";

  /**
   * MPLN (Minimized Pixel Line Notation) Parser - Stable Core v3.2
   * @param {string} ponString
   * @param {number} fallbackColumns
   */
  function parsePON(ponString, fallbackColumns = 64) {
    const sections = ponString.trim().split("|");
    if (sections.length !== 2 && sections.length !== 3) {
      throw new Error("Geçersiz MPLN Formatı.");
    }

    const hasDimensionHeader =
      sections.length === 3 && /^\d+x\d+$/.test(sections[0].trim());
    const dimension = hasDimensionHeader
      ? sections[0].trim().split("x").map(Number)
      : [fallbackColumns, null];
    const totalColumns = dimension[0];
    const declaredRows = dimension[1];
    const paletteSection = hasDimensionHeader ? sections[1] : sections[0];
    const rowsSection = hasDimensionHeader ? sections[2] : sections[1];

    const palette = paletteSection
      .split(",")
      .map((hex) => hex.trim().toUpperCase());

    const alphabet = PALETTE_SYMBOLS.split("");
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
        i++;

        if (!char) break;

        let pixelValue = ".";
        if (char !== ".") {
          const idx = alphabet.indexOf(char);
          if (idx !== -1 && idx < palette.length) {
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

    return { palette, grid, width: totalColumns, height: grid.length };
  }

  const MPLNParser = { PALETTE_SYMBOLS, parsePON };

  global.MPLNParser = MPLNParser;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = MPLNParser;
  }
})(typeof window !== "undefined" ? window : globalThis);
