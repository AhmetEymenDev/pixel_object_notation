# MPLN Studio

MPLN Studio is a zero-backend browser tool for converting pixel-art images into
MPLN text and rendering MPLN text back onto an HTML canvas.

The current app is not the old JSON-based MPON prototype. It uses a compact
line format designed for AI-assisted asset transfer:

```text
HEX,HEX,HEX|row;row;row;
```

New files can also include an explicit canvas size header:

```text
128x140|HEX,HEX,HEX|row;row;row;
```

Older `palette|rows` MPLN still renders as 64 columns for compatibility.

## What MPLN Stores

- A comma-separated palette of RGB hex colors.
- A row list separated by semicolons.
- RLE tokens inside each row, where a number before a symbol means repeat.
- `.` for transparent pixels.
- `Nx64` for repeated empty rows, for example `12x64`.

Example:

```text
FF2A1F,7A1C28,F6A23A|10.3A2B49.;2x64;8.4C52.;
```

## Important Syntax Rule

Palette symbols must never overlap with MPLN syntax. Digits are reserved for
RLE counts, and `.`, `,`, `;`, `|`, and lowercase `x` are reserved delimiters.

The parser and importer share `PALETTE_SYMBOLS` from `parser.js` so generated
MPLN cannot accidentally use `0-9` as color symbols. This matters because a row
like `32.11921.` must not be interpreted as a 11,921-pixel run.

## Shared Core

`core.js` contains the browser-safe asset conversion core used by the studio:

- GIMP `.gpl` and plain hex palette parsing.
- Weighted median-cut palette generation.
- Lossless palette validation.
- Nearest-color mapping and Floyd-Steinberg dithering.

The file also exports CommonJS functions for Node tests and for the planned Go
compiler port.

## Image Import Behavior

When importing PNG/JPG:

- The image is resized to the selected import width with nearest-neighbor
  sampling.
- `Import Width` controls the resized pixel width before MPLN conversion. Use
  larger values such as 128 or 256 for detailed source sprites.
- Height is preserved proportionally.
- Fully transparent pixels and near-black pixels are treated as transparent.
- `Mode` controls how colors are indexed:
  - `Lossy` uses weighted median-cut up to the safe symbol limit.
  - `Lossless` keeps exact source colors and stops if the source needs more
    symbols than MPLN can encode.
  - `Dither` uses the same palette limit as lossy mode, then applies
    Floyd-Steinberg error diffusion while mapping pixels.
- `CUSTOM PALETTE (.GPL / HEX)` can load a GIMP palette or a plain text list of
  `#RRGGBB`, `RRGGBB`, `#RRGGBBAA`, or `RRGGBBAA` values. When present, import
  forces the image onto that palette instead of generating one.
- Colors outside the active palette are mapped to the closest RGB(A) palette
  color.
- The generated MPLN is written into the text area and rendered immediately.
- The original resized image is kept in memory for visual comparison against
  the MPLN-rendered result.

## Rendering Behavior

Rendering parses the MPLN text into a fixed-width grid and paints each pixel as
a scaled canvas rectangle. The canvas itself stays transparent; the checkerboard
background is CSS only.

Rows that expand past the declared width now throw an error instead of being
silently clipped into long horizontal bars.

## Export and Compare

- `Export as .mpln` saves the text currently in the editor.
- `Export PNG` saves the current MPLN-rendered canvas with transparency.
- `Export JPG` saves the current MPLN-rendered canvas on a dark background.
- `IMPORT .MPLN` loads a saved MPLN text file and renders it.
- After importing PNG/JPG, the comparison canvas shows the resized source image
  on the left and the MPLN-rendered result mirrored on the right.

## Usage

1. Open the app in a browser.
2. Import a PNG/JPG, import an `.mpln`, or paste MPLN text into the text area.
3. Click `Render the MPLN`.
4. Use `Export as .mpln`, `Export PNG`, or `Export JPG` as needed.
5. Adjust `Pixel Size` to change the preview and comparison scale.

You can open `index.html` directly in a browser. For local development, serving
the folder is also fine:

```bash
python -m http.server 8765
```

Then open:

```text
http://127.0.0.1:8765/
```

## Tests

The regression tests use Node's built-in test runner:

```bash
npm test
```

They verify that the palette alphabet does not conflict with MPLN syntax, that
symbols past the letter-only range decode correctly, and that oversized rows are
rejected. They also cover the shared conversion core, custom palette parsing,
lossless color limits, and dither mapping.
