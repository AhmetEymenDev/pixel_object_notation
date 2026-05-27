document
  .getElementById("renderBtn")
  .addEventListener("click", processPixelPipeline);
const slider = document.getElementById("pixelSizeSlider");
const sliderVal = document.getElementById("pixelSizeValue");

slider.addEventListener("input", (e) => {
  const size = e.target.value;
  sliderVal.textContent = size + "px";
  scaleCanvasDisplay(size);
});

let currentMaxX = 0;
let currentMaxY = 0;

function processPixelPipeline() {
  const jsonInput = document.getElementById("jsonInput").value;
  const canvas = document.getElementById("pixelCanvas");
  const ctx = canvas.getContext("2d");

  if (!jsonInput.trim()) {
    alert("Please enter a valid JSON array.");
    return;
  }

  try {
    let cleanInput = jsonInput.trim();

    if (cleanInput.startsWith("```")) {
      cleanInput = cleanInput
        .replace(/^```[a-zA-Z]*\n/, "")
        .replace(/\n```$/, "");
    }

    const dponData = JSON.parse(cleanInput);
    const palette = dponData.p;
    const compressedGrid = dponData.g;

    if (!palette || !compressedGrid || compressedGrid.length === 0) {
      alert("Invalid MPON format! Missing palette (p) or grid (g).");
      return;
    }

    const decompressedGrid = [];

    compressedGrid.forEach((row) => {
      let decompressedRow = "";
      let countStr = "";
      let verticalCount = 1;

      let targetRowText = row;
      if (row.includes("x")) {
        const parts = row.split("x");
        targetRowText = parts[0];
        verticalCount = parseInt(parts[1]);
      }

      for (let i = 0; i < targetRowText.length; i++) {
        const char = targetRowText[i];

        if (char >= "0" && char <= "9") {
          countStr += char;
        } else {
          const repeatCount = countStr === "" ? 1 : parseInt(countStr);
          decompressedRow += char.repeat(repeatCount);
          countStr = "";
        }
      }

      for (let v = 0; v < verticalCount; v++) {
        decompressedGrid.push(decompressedRow);
      }
    });

    currentMaxY = decompressedGrid.length;
    currentMaxX = decompressedGrid[0].length;

    canvas.width = currentMaxX;
    canvas.height = currentMaxY;

    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (let y = 0; y < currentMaxY; y++) {
      for (let x = 0; x < currentMaxX; x++) {
        const char = decompressedGrid[y][x];

        if (char !== "." && palette[char]) {
          const rgb = palette[char];
          const alpha = rgb[3] !== undefined ? rgb[3] : 1;

          ctx.fillStyle = `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;
          ctx.fillRect(x, y, 1, 1);
        }
      }
    }

    scaleCanvasDisplay(slider.value);
    exportPng(canvas);
  } catch (error) {
    console.error("MPON Parsing Error:", error);
    alert("MPON Format Error: " + error.message);
  }
}

function scaleCanvasDisplay(pixelDisplaySize) {
  const canvas = document.getElementById("pixelCanvas");
  if (currentMaxX > 0 && currentMaxY > 0) {
    canvas.style.width = currentMaxX * pixelDisplaySize + "px";
    canvas.style.height = currentMaxY * pixelDisplaySize + "px";
    canvas.style.imageRendering = "pixelated";
  }
}

function exportPng(canvas) {
  const scaleFactor = 20;
  const zoomedCanvas = document.createElement("canvas");
  const zoomedCtx = zoomedCanvas.getContext("2d");

  zoomedCanvas.width = canvas.width * scaleFactor;
  zoomedCanvas.height = canvas.height * scaleFactor;

  zoomedCtx.imageSmoothingEnabled = false;

  zoomedCtx.drawImage(
    canvas,
    0,
    0,
    canvas.width,
    canvas.height,
    0,
    0,
    zoomedCanvas.width,
    zoomedCanvas.height,
  );

  const imageUri = zoomedCanvas.toDataURL("image/png");
  const link = document.createElement("a");
  link.download = "mpon_generated_asset.png";
  link.href = imageUri;
  link.click();
}
