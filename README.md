# 🚀 MPON (Minimized Pixel Object Notation) Asset Pipeline

An automated, ultra-lightweight, and token-optimized asset pipeline that translates compressed dynamic pixel data into game-ready PNG sprites for **Godot 2D**.

> 🚨 **IMPORTANT NOTICE:** THIS SITE IS AN AUTOMATED PIPELINE FOR MPON (MINIMIZED PIXEL OBJECT NOTATION). IT IS NOT CREATED FOR HUMANS; IT IS DESIGNED FOR ARTIFICIAL INTELLIGENCE.

---

## 💡 What is MPON?

**MPON (Minimized Pixel Object Notation)** is an advanced, token-efficient graphical exchange format designed for LLMs (Large Language Models). Unlike traditional raw structures, MPON combines **Dynamic Color Palettes** with **Run-Length Encoding (RLE)** inside a matrix grid to achieve up to 90% token reduction.

### MPON Specification Example (Dynamic Compressed Grid):

```json
{
  "p": {
    "A": [210, 235, 255],
    "B": [160, 200, 230],
    "C": [90, 140, 190]
  },
  "g": ["5ABC5A", "2.3A2.", "10C"]
}
```

- `p` **(Palette)**: Dynamically defined color codes unique to each generated asset.

- `g` **(Grid)**: Compressed layout using an embedded RLE parser. For example, `5ABC5A` expands into 5 pixels of `A`, 1 pixel of `B`, 1 pixel of `C`, and 5 pixels of `A`. Dots (.) represent transparent pixels.

### 🛠️ Features

- **Dynamic RLE Parser Engine**: Automatically expands inline multi-digit counts (e.g., `12A`, `5`.) into full pixel grids natively in the browser.

- **Dynamic Palette Mapping**: Gives the AI absolute flexibility to declare bespoke palettes per-asset without sacrificing token boundaries.

- **Zero-Backend Architecture**: Runs entirely in the browser using HTML5 Canvas and vanilla JavaScript. Zero server costs, maximum speed.

- **Pixelated Grid Scaler**: Includes a dynamic display slider to scale the view without losing crisp pixel edges (`image-rendering: pixelated`).

- **Crisp PNG Exporter**: Utilizes a custom non-destructive scaling algorithm (`scaleFactor`) to output high-resolution, perfectly sharp PNGs.

### 🚀 Quick Start / How to Use

1. **Open** `index.html` in any modern web browser.

2. Ask your favorite LLM (GPT, Claude, Gemini etc.) to generate an asset using the **MPON Specification**.

3. Paste the raw JSON data into the text area.

4. Adjust the **Display Pixel Size** slider if you need to zoom in/out on highly detailed assets.

5. **Click Render & Export PNG**

### 🛠️ Tech Stack

- **Frontend**: Vanilla HTML5 / CSS3

- **Engine**: Canvas API (with disabled image smoothing)

- **Data Interchange**: MPON Standard (Dynamic Palette + RLE Compressed Grid Parsing)

Developed with 💻 and ☕ for automated indie game development pipelines.
