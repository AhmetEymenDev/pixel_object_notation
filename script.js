(function () {
const parserApi = window.MPLNParser;
if (!parserApi) {
  console.error("MPLN parser did not load. Check parser.js script tag.");
  return;
}

const coreApi = window.MPLNCore;
if (!coreApi) {
  console.error("MPLN core did not load. Check core.js script tag.");
  return;
}

const paletteSymbols = parserApi.PALETTE_SYMBOLS;
const parsePon = parserApi.parsePON;
const coreBuildPalette = coreApi.buildPalette;
const coreIsVisiblePixel = coreApi.isVisiblePixel;
const coreMapImageDataToPaletteIndices = coreApi.mapImageDataToPaletteIndices;
const coreParsePaletteText = coreApi.parsePaletteText;
const coreRgbaToHex = coreApi.rgbaToHex;

const jsonInput = document.getElementById("jsonInput");
const renderBtn = document.getElementById("renderBtn");
const pixelCanvas = document.getElementById("pixelCanvas");
const comparisonCanvas = document.getElementById("comparisonCanvas");
const pixelSizeSlider = document.getElementById("pixelSizeSlider");
const pixelSizeValue = document.getElementById("pixelSizeValue");
const importWidthInput = document.getElementById("importWidthInput");
const compressionModeSelect = document.getElementById("compressionModeSelect");

const ctx = pixelCanvas.getContext("2d");
const comparisonCtx = comparisonCanvas.getContext("2d");
const TRANSPARENT_ALPHA_THRESHOLD = 5;
const NEAR_BLACK_THRESHOLD = 10;
let originalImportCanvas = null;
let lastImportedImageName = "asset";

function renderPON(ponString, pixelSize) {
  if (!ponString) return;

  try {
    const { palette, grid, width } = parsePon(ponString);

    const totalRows = grid.length;
    pixelCanvas.width = width * pixelSize;
    pixelCanvas.height = totalRows * pixelSize;

    ctx.clearRect(0, 0, pixelCanvas.width, pixelCanvas.height);

    grid.forEach((row, y) => {
      row.forEach((pixel, x) => {
        if (pixel !== ".") {
          ctx.fillStyle = `#${pixel}`;
          ctx.fillRect(x * pixelSize, y * pixelSize, pixelSize, pixelSize);
        }
      });
    });
    updateComparisonCanvas();
  } catch (error) {
    console.error("Bridge Render Error:", error.message);
  }
}

renderBtn.addEventListener("click", () => {
  const rawData = jsonInput.value.trim();
  const currentSize = parseInt(pixelSizeSlider.value, 10);
  renderPON(rawData, currentSize);
});

pixelSizeSlider.addEventListener("input", (e) => {
  const newSize = parseInt(e.target.value, 10);
  if (pixelSizeValue) {
    pixelSizeValue.textContent = `${newSize}px`;
  }
  const rawData = jsonInput.value.trim();
  if (rawData) {
    renderPON(rawData, newSize);
  }
});

window.renderPON = renderPON;

const exportMplnBtn = document.getElementById("exportMplnBtn");
const exportPngBtn = document.getElementById("exportPngBtn");
const exportJpgBtn = document.getElementById("exportJpgBtn");
const imageImportInput = document.getElementById("imageImportInput");
const mplnImportInput = document.getElementById("mplnImportInput");
const paletteImportInput = document.getElementById("paletteImportInput");
const paletteTextInput = document.getElementById("paletteTextInput");
const statusLine = document.getElementById("statusLine");
let customPaletteHexes = [];

function setStatus(message) {
  if (statusLine) {
    statusLine.textContent = message;
  }
}

document.documentElement.dataset.mplnReady = "true";
setStatus("Ready.");

function getImportTargetWidth() {
  const requestedWidth = parseInt(importWidthInput.value, 10);
  if (!Number.isFinite(requestedWidth)) return 128;
  return Math.max(16, Math.min(256, requestedWidth));
}

function getCompressionMode() {
  return compressionModeSelect.value || "lossy";
}

function updateCustomPaletteFromText(sourceLabel) {
  customPaletteHexes = coreParsePaletteText(paletteTextInput.value);
  setStatus(
    customPaletteHexes.length
      ? `Loaded ${customPaletteHexes.length} palette colors from ${sourceLabel}.`
      : `No palette colors found in ${sourceLabel}.`,
  );
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const downloadLink = document.createElement("a");
  downloadLink.href = url;
  downloadLink.download = filename;

  document.body.appendChild(downloadLink);
  downloadLink.click();

  document.body.removeChild(downloadLink);
  URL.revokeObjectURL(url);
}

function canvasToBlob(canvas, mimeType, quality) {
  return new Promise((resolve) => {
    canvas.toBlob(resolve, mimeType, quality);
  });
}

function canvasForJpegExport() {
  const jpegCanvas = document.createElement("canvas");
  jpegCanvas.width = pixelCanvas.width;
  jpegCanvas.height = pixelCanvas.height;
  const jpegCtx = jpegCanvas.getContext("2d");

  jpegCtx.fillStyle = "#121212";
  jpegCtx.fillRect(0, 0, jpegCanvas.width, jpegCanvas.height);
  jpegCtx.drawImage(pixelCanvas, 0, 0);

  return jpegCanvas;
}

async function exportRenderedImage(format) {
  if (!pixelCanvas.width || !pixelCanvas.height) {
    setStatus("Nothing to export.");
    return;
  }

  const isJpeg = format === "jpg";
  const exportCanvas = isJpeg ? canvasForJpegExport() : pixelCanvas;
  const mimeType = isJpeg ? "image/jpeg" : "image/png";
  const extension = isJpeg ? "jpg" : "png";
  const blob = await canvasToBlob(exportCanvas, mimeType, 0.95);

  if (!blob) {
    setStatus(`Could not export ${extension.toUpperCase()}.`);
    return;
  }

  downloadBlob(blob, `${lastImportedImageName}_mpln.${extension}`);
  setStatus(`Exported ${extension.toUpperCase()}.`);
}

function updateComparisonCanvas() {
  if (!originalImportCanvas || !pixelCanvas.width || !pixelCanvas.height) {
    return;
  }

  const pixelSize = parseInt(pixelSizeSlider.value, 10);
  const panelWidth = originalImportCanvas.width * pixelSize;
  const panelHeight = originalImportCanvas.height * pixelSize;
  comparisonCanvas.width = panelWidth * 2;
  comparisonCanvas.height = panelHeight;
  comparisonCtx.imageSmoothingEnabled = false;
  comparisonCtx.clearRect(0, 0, comparisonCanvas.width, comparisonCanvas.height);
  comparisonCtx.drawImage(originalImportCanvas, 0, 0, panelWidth, panelHeight);

  comparisonCtx.save();
  comparisonCtx.translate(panelWidth * 2, 0);
  comparisonCtx.scale(-1, 1);
  comparisonCtx.drawImage(pixelCanvas, 0, 0, panelWidth, panelHeight);
  comparisonCtx.restore();
}

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

function isVisiblePixel(r, g, b, a) {
  return (
    a > TRANSPARENT_ALPHA_THRESHOLD &&
    (r > NEAR_BLACK_THRESHOLD ||
      g > NEAR_BLACK_THRESHOLD ||
      b > NEAR_BLACK_THRESHOLD)
  );
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

exportMplnBtn.addEventListener("click", () => {
  const dataToSave = jsonInput.value.trim();
  if (!dataToSave) {
    alert("Textarea is null");
    return;
  }

  const blob = new Blob([dataToSave], { type: "text/plain" });
  downloadBlob(blob, `${lastImportedImageName}.mpln`);
});

exportPngBtn.addEventListener("click", () => {
  exportRenderedImage("png");
});

exportJpgBtn.addEventListener("click", () => {
  exportRenderedImage("jpg");
});

mplnImportInput.addEventListener("click", () => {
  mplnImportInput.value = "";
});

mplnImportInput.addEventListener("change", (event) => {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function (e) {
    const mplnText = e.target.result.trim();
    jsonInput.value = mplnText;
    lastImportedImageName = file.name.replace(/\.[^.]+$/, "") || "asset";
    renderPON(mplnText, parseInt(pixelSizeSlider.value, 10));
    setStatus(`Imported ${file.name}.`);
  };
  reader.onerror = function () {
    setStatus(`Could not read ${file.name}.`);
  };
  reader.readAsText(file);
});

paletteImportInput.addEventListener("click", () => {
  paletteImportInput.value = "";
});

paletteImportInput.addEventListener("change", (event) => {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function (e) {
    paletteTextInput.value = e.target.result;
    updateCustomPaletteFromText(file.name);
  };
  reader.onerror = function () {
    setStatus(`Could not read ${file.name}.`);
  };
  reader.readAsText(file);
});

paletteTextInput.addEventListener("input", () => {
  updateCustomPaletteFromText("palette text");
});

// ==========================================
// IMPORT: RGBA QUANTIZATION ENGINE
// ==========================================
imageImportInput.addEventListener("click", () => {
  imageImportInput.value = "";
});

imageImportInput.addEventListener("change", (event) => {
  const file = event.target.files[0];
  if (!file) return;
  setStatus(`Importing ${file.name}...`);

  const reader = new FileReader();
  reader.onload = function (e) {
    const img = new Image();
    img.onload = function () {
      const targetWidth = getImportTargetWidth();
      const targetHeight = Math.round((img.height * targetWidth) / img.width);

      const hiddenCanvas = document.createElement("canvas");
      hiddenCanvas.width = targetWidth;
      hiddenCanvas.height = targetHeight;
      const hiddenCtx = hiddenCanvas.getContext("2d");

      hiddenCtx.imageSmoothingEnabled = false;
      hiddenCtx.drawImage(img, 0, 0, targetWidth, targetHeight);
      originalImportCanvas = hiddenCanvas;
      lastImportedImageName = file.name.replace(/\.[^.]+$/, "") || "asset";

      const imgData = hiddenCtx.getImageData(
        0,
        0,
        targetWidth,
        targetHeight,
      ).data;

      const colorMap = new Map();
      for (let i = 0; i < imgData.length; i += 4) {
        const r = imgData[i];
        const g = imgData[i + 1];
        const b = imgData[i + 2];
        const a = imgData[i + 3];

        if (coreIsVisiblePixel(r, g, b, a)) {
          const hex = coreRgbaToHex(r, g, b, a);
          const existing = colorMap.get(hex);
          if (existing) {
            existing.count++;
          } else {
            colorMap.set(hex, { hex, r, g, b, a, count: 1 });
          }
        }
      }

      const alphabet = paletteSymbols.split("");
      const colorPool = Array.from(colorMap.values());
      const mode = getCompressionMode();
      let detectedColors = [];

      try {
        detectedColors = coreBuildPalette(
          colorPool,
          alphabet.length,
          mode,
          customPaletteHexes,
        );
      } catch (error) {
        setStatus(error.message);
        return;
      }

      const pixelIndices = coreMapImageDataToPaletteIndices(
        imgData,
        targetWidth,
        targetHeight,
        detectedColors,
        mode,
      );
      let mplnLines = [];

      // 2. ADIM: Matrisi oluştur ve RLE sıkıştırması uygula
      for (let y = 0; y < targetHeight; y++) {
        let currentLineTokens = [];
        let rleChar = "";
        let rleCount = 0;

        for (let x = 0; x < targetWidth; x++) {
          let char = ".";
          const colorIdx = pixelIndices[y * targetWidth + x];

          if (colorIdx >= 0 && colorIdx < alphabet.length) {
            char = alphabet[colorIdx];
          }

          if (x === 0) {
            rleChar = char;
            rleCount = 1;
          } else if (char === rleChar) {
            rleCount++;
          } else {
            currentLineTokens.push(
              rleCount === 1 ? rleChar : `${rleCount}${rleChar}`,
            );
            rleChar = char;
            rleCount = 1;
          }
        }
        currentLineTokens.push(
          rleCount === 1 ? rleChar : `${rleCount}${rleChar}`,
        );
        mplnLines.push(currentLineTokens.join(""));
      }

      // 3. ADIM: Dikey boşluk optimizasyonu
      let optimizedLines = [];
      let emptyRunCount = 0;
      const emptyRowPattern = `${targetWidth}.`;

      for (let i = 0; i < mplnLines.length; i++) {
        if (mplnLines[i] === emptyRowPattern) {
          emptyRunCount++;
        } else {
          if (emptyRunCount > 0) {
            optimizedLines.push(`${emptyRunCount}x${targetWidth}`);
            emptyRunCount = 0;
          }
          optimizedLines.push(mplnLines[i]);
        }
      }
      if (emptyRunCount > 0) {
        optimizedLines.push(`${emptyRunCount}x${targetWidth}`);
      }

      // 4. ADIM: DOM'a bas ve renderla
      const finalMpln = `${targetWidth}x${targetHeight}|${detectedColors.join(",")}|${optimizedLines.join(";")};`;
      jsonInput.value = finalMpln;

      const currentSize = parseInt(pixelSizeSlider.value, 10);
      renderPON(finalMpln, currentSize);
      const paletteSource = customPaletteHexes.length
        ? "custom palette"
        : "generated palette";
      setStatus(
        `Imported ${file.name}: ${targetWidth}x${targetHeight}, ${detectedColors.length} colors, ${mode}, ${paletteSource}.`,
      );
    };
    img.onerror = function () {
      setStatus(`Could not decode ${file.name}.`);
    };
    img.src = e.target.result;
  };
  reader.onerror = function () {
    setStatus(`Could not read ${file.name}.`);
  };
  reader.readAsDataURL(file);
});
})();
