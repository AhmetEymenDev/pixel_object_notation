# 🚀 PON (Pixel Object Notation) Asset Pipeline

An automated, ultra-lightweight, and data-driven asset pipeline that translates structured pixel data into game-ready PNG sprites for **Godot 2D**.

> 🚨 **IMPORTANT NOTICE:** THIS SITE IS AN AUTOMATED PIPELINE FOR PON (PIXEL OBJECT NOTATION). IT IS NOT CREATED FOR HUMANS; IT IS DESIGNED FOR ARTIFICIAL INTELLIGENCE.

---

## 💡 What is PON?

**PON (Pixel Object Notation)** is an experimental, token-efficient data structure designed for LLMs (Large Language Models) to generate pixel art without human design intervention. Instead of dealing with heavy image manipulation libraries, the AI simply outputs a structured JSON array where each object represents a precise pixel coordinate and its RGBA value.

### PON Specification Example:

```json
[
  { "x": 7, "y": 0, "r": 210, "g": 235, "b": 255, "a": 1 },
  { "x": 8, "y": 0, "r": 210, "g": 235, "b": 255, "a": 1 }
]
```

### 🛠️ Features

- **Zero-Backend Architecture**: Runs entirely in the browser using HTML5 Canvas and vanilla JavaScript. Zero server costs, maximum speed.

- **Robust Parsing Engine**: Automatically sanitizes AI-generated Markdown code blocks and handles trailing commas gracefully.

- **Pixelated Grid Scaler**: Includes a dynamic display slider to scale the on-screen view without blurring or losing crisp pixel edges (`image-rendering: pixelated`).

- **Crisp PNG Exporter**: Utilizes a custom non-destructive scaling algorithm (`scaleFactor`) to output high-resolution, perfectly sharp PNGs that fit natively into retro game engines.

### 🚀 Quick Start / How to Use

1. **Open** index.html in any modern web browser.

2. Ask your favorite LLM (ChatGPT, Claude, etc.) to generate an asset using the **PON Specification**.

3. Paste the raw JSON data into the text area.

4. Adjust the **Display Pixel Size** slider if you need to zoom in/out on highly detailed assets.

5. **Click Render & Export PNG**. The pipeline will immediately render the image and trigger a pixel-perfect file download.

### 🛠️ Tech Stack

- **Frontend**: Vanilla HTML5 / CSS3

- **Engine**: Canvas API (with disabled image smoothing)

- **Data Interchange**: PON Standard (JSON-based Array/Object parsing)

Developed with 💻 and ☕ for automated indie game development pipelines.
