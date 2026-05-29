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
  const parseMPLNFrames = parserApi.parseMPLNFrames;
  const coreEncodeImageDataToMPLN = coreApi.encodeImageDataToMPLN;
  const coreParsePaletteText = coreApi.parsePaletteText;
  const wasmApi = window.MPLNWasm;

  const jsonInput = document.getElementById("jsonInput");
  const renderBtn = document.getElementById("renderBtn");
  const pixelCanvas = document.getElementById("pixelCanvas");
  const comparisonCanvas = document.getElementById("comparisonCanvas");
  const pixelSizeSlider = document.getElementById("pixelSizeSlider");
  const pixelSizeValue = document.getElementById("pixelSizeValue");
  const importWidthInput = document.getElementById("importWidthInput");
  const compressionModeSelect = document.getElementById(
    "compressionModeSelect",
  );

  const ctx = pixelCanvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.mozImageSmoothingEnabled = false;
  ctx.webkitImageSmoothingEnabled = false;
  ctx.msImageSmoothingEnabled = false;
  const comparisonCtx = comparisonCanvas.getContext("2d");
  let originalImportCanvas = null;
  let lastImportedImageName = "asset";

  function renderMPLN(mplnString, pixelSize) {
    if (!mplnString) return;

    try {
      const frames = parseMPLNFrames(mplnString);
      const sheetWidth = frames.reduce((sum, frame) => sum + frame.width, 0);
      const sheetHeight = Math.max(...frames.map((frame) => frame.height));

      pixelCanvas.width = sheetWidth * pixelSize;
      pixelCanvas.height = sheetHeight * pixelSize;

      pixelCanvas.style.width = "100%";
      pixelCanvas.style.maxWidth = "700px";
      pixelCanvas.style.height = "auto";

      ctx.clearRect(0, 0, pixelCanvas.width, pixelCanvas.height);

      let frameOffsetX = 0;
      frames.forEach((frame) => {
        frame.grid.forEach((row, y) => {
          row.forEach((pixel, x) => {
            if (pixel !== ".") {
              ctx.fillStyle = `#${pixel}`;
              ctx.fillRect(
                (frameOffsetX + x) * pixelSize,
                y * pixelSize,
                pixelSize,
                pixelSize,
              );
            }
          });
        });
        frameOffsetX += frame.width;
      });
      updateComparisonCanvas();
    } catch (error) {
      console.error("Bridge Render Error:", error.message);
    }
  }

  renderBtn.addEventListener("click", () => {
    const rawData = jsonInput.value.trim();
    const currentSize = parseInt(pixelSizeSlider.value, 10);
    renderMPLN(rawData, currentSize);
  });

  pixelSizeSlider.addEventListener("input", (e) => {
    const newSize = parseInt(e.target.value, 10);
    if (pixelSizeValue) {
      pixelSizeValue.textContent = `${newSize}px`;
    }
    const rawData = jsonInput.value.trim();
    if (rawData) {
      renderMPLN(rawData, newSize);
    }
  });

  window.renderMPLN = renderMPLN;

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
    return Math.max(16, Math.min(4096, requestedWidth));
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
    comparisonCtx.clearRect(
      0,
      0,
      comparisonCanvas.width,
      comparisonCanvas.height,
    );
    comparisonCtx.drawImage(
      originalImportCanvas,
      0,
      0,
      panelWidth,
      panelHeight,
    );

    comparisonCtx.save();
    comparisonCtx.translate(panelWidth * 2, 0);
    comparisonCtx.scale(-1, 1);
    comparisonCtx.drawImage(pixelCanvas, 0, 0, panelWidth, panelHeight);
    comparisonCtx.restore();
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
      renderMPLN(mplnText, parseInt(pixelSizeSlider.value, 10));
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
      img.onload = async function () {
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

        const mode = getCompressionMode();
        let finalMpln = "";

        try {
          if (wasmApi) {
            finalMpln = await wasmApi.encodeImageData(
              imgData,
              targetWidth,
              targetHeight,
              {
                customPaletteHexes,
                mode,
              },
            );
          }
          if (!finalMpln) {
            finalMpln = coreEncodeImageDataToMPLN(
              imgData,
              targetWidth,
              targetHeight,
              {
                customPaletteHexes,
                mode,
                paletteSymbols,
              },
            );
          }
        } catch (error) {
          setStatus(error.message);
          return;
        }

        const detectedColors = finalMpln.split("|")[1].split(",");
        jsonInput.value = finalMpln;

        const currentSize = parseInt(pixelSizeSlider.value, 10);
        renderMPLN(finalMpln, currentSize);
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
