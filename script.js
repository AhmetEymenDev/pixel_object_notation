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

    // 1. Markdown kod blokları varsa temizle
    if (cleanInput.startsWith("```")) {
      cleanInput = cleanInput
        .replace(/^```[a-zA-Z]*\n/, "")
        .replace(/\n```$/, "");
    }

    const parsedData = JSON.parse(cleanInput);
    const pixelData = Array.isArray(parsedData)
      ? parsedData
      : Object.values(parsedData);

    if (pixelData.length === 0) {
      alert("PON data is empty!");
      return;
    }

    // 2. EN SAĞLAM Sınır Bulma Yöntemi (Spread operatörü yerine klasik hızlı döngü)
    let maxX = 0;
    let maxY = 0;
    for (let i = 0; i < pixelData.length; i++) {
      if (pixelData[i].x > maxX) maxX = pixelData[i].x;
      if (pixelData[i].y > maxY) maxY = pixelData[i].y;
    }

    currentMaxX = maxX + 1;
    currentMaxY = maxY + 1;

    // Canvas boyutlarını ata
    canvas.width = currentMaxX;
    canvas.height = currentMaxY;

    // 3. KRİTİK AYAR: Tarayıcının yumuşatma algoritmalarını kapat
    ctx.imageSmoothingEnabled = false;
    ctx.mozImageSmoothingEnabled = false;
    ctx.webkitImageSmoothingEnabled = false;
    ctx.msImageSmoothingEnabled = false;

    // Arka planı temizle
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 4. Pikselleri Çiz
    pixelData.forEach((pixel) => {
      ctx.fillStyle = `rgba(${pixel.r}, ${pixel.g}, ${pixel.b}, ${pixel.a !== undefined ? pixel.a : 1})`;
      ctx.fillRect(pixel.x, pixel.y, 1, 1);
    });

    // Ekranda gösterimi boyutlandır ve bilgisayara jilet gibi indir
    scaleCanvasDisplay(slider.value);
    exportPng(canvas);
  } catch (error) {
    console.error("Detaylı Hata Raporu:", error);
    alert("PON/JSON Parsing Error: " + error.message);
  }
}

function scaleCanvasDisplay(pixelDisplaySize) {
  const canvas = document.getElementById("pixelCanvas");
  if (currentMaxX > 0 && currentMaxY > 0) {
    canvas.style.width = currentMaxX * pixelDisplaySize + "px";
    canvas.style.height = currentMaxY * pixelDisplaySize + "px";
    canvas.style.imageRendering = "pixelated";
    canvas.style.imageRendering = "crisp-edges";
  }
}

function exportPng(canvas) {
  const scaleFactor = 20; // Resmi kalitesini bozmadan 20 kat büyük indirir (Godot ve önizleme için mükemmel netlik)
  const zoomedCanvas = document.createElement("canvas");
  const zoomedCtx = zoomedCanvas.getContext("2d");

  zoomedCanvas.width = canvas.width * scaleFactor;
  zoomedCanvas.height = canvas.height * scaleFactor;

  zoomedCtx.imageSmoothingEnabled = false;
  zoomedCtx.webkitImageSmoothingEnabled = false;
  zoomedCtx.mozImageSmoothingEnabled = false;

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
  link.download = "pon_generated_asset.png";
  link.href = imageUri;
  link.click();
}
