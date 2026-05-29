# MPLN Studio

MPLN Studio is a zero-backend browser tool for converting pixel-art images into
MPLN text and rendering MPLN text back onto an HTML canvas.

The current app is not the old JSON-based MPLN prototype. It uses a compact
line format designed for AI-assisted asset transfer:

```text
HEX,HEX,HEX|row;row;row;
```

New files can also include an explicit canvas size header:

```text
128x140|HEX,HEX,HEX|row;row;row;
```

Older `palette|rows` MPLN still renders as 64 columns for compatibility.

Large-palette files can add a token-width marker to the size header:

```text
128x140;T2|HEX,HEX,HEX|row;row;row;
```

`T1` is the default legacy single-character token mode. `T2` uses two
characters per color token, raising the lossless palette capacity from the base
alphabet size to `alphabet * alphabet` colors.

With the current 75-character alphabet, `T2` stores up to 5,625 palette colors.
If an imported image has more unique colors than that, MPLN still exports it by
quantizing the palette down to 5,625 colors instead of failing.

Animation files can store multiple frames in one text document by joining full
MPLN frames with `||`:

```text
64x64|HEX,HEX|rows;||64x64|HEX,HEX|rows;
```

## What MPLN Stores

- A comma-separated palette of RGB hex colors.
- A row list separated by semicolons.
- RLE tokens inside each row, where a number before a symbol means repeat.
- `.` for transparent pixels.
- `Nx64` for repeated empty rows, for example `12x64`.
- `||` between complete frames for animation documents.

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

When a row uses `T2`, RLE still works the same way: `12AA` means repeat the
two-character token `AA` twelve times, while `.` remains the transparent pixel.

## Shared Core

`core.js` contains the browser-safe asset conversion core used by the studio:

- GIMP `.gpl` and plain hex palette parsing.
- Weighted median-cut palette generation.
- Lossless palette validation.
- Nearest-color mapping and Floyd-Steinberg dithering.
- Dynamic `T1` / `T2` token generation.

The file also exports CommonJS functions for Node tests. The browser prefers the
Go WebAssembly core for PNG imports when `mpln.wasm` is available, and falls
back to `core.js` when the WASM bundle cannot be loaded.

## Image Import Behavior

When importing PNG/JPG:

- The image is resized to the selected import width with nearest-neighbor
  sampling.
- `Import Width` controls the resized pixel width before MPLN conversion. Use
  larger values such as 128 or 256 for detailed source sprites.
- Height is preserved proportionally.
- Fully transparent pixels are treated as transparent. Opaque black and
  near-black pixels are preserved, so alpha is the default transparency source.
- `Mode` controls how colors are indexed:
  - `Lossy` uses weighted median-cut up to the active token capacity.
  - `Lossless` keeps exact source colors while they fit the active token
    capacity. Above the `T2` capacity, it still exports by capping the palette
    to 5,625 colors.
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

When the editor contains multiple `||`-separated frames, the browser renders
them left-to-right as a sprite sheet.

Rows that expand past the declared width now throw an error instead of being
silently clipped into long horizontal bars.

## Export and Compare

- `Export as .mpln` saves the text currently in the editor.
- `Export PNG` saves the current MPLN-rendered canvas with transparency.
- `Export JPG` saves the current MPLN-rendered canvas on a dark background.
- `IMPORT .MPLN` loads a saved MPLN text file and renders it.
- After importing PNG/JPG, the comparison canvas shows the resized source image
  on the left and the MPLN-rendered result mirrored on the right.

## Go CLI Compiler

The Go compiler lives under `cmd/mpln` and uses the same MPLN syntax:

```bash
go run ./cmd/mpln encode -in sprite.png -out sprite.mpln -width 128 -mode lossy
go run ./cmd/mpln decode -in walk.mpln -out walk.png -meta godot
go run ./cmd/mpln batch -in assets -out compiled -width 128 -mode lossless -meta both
```

Commands:

- `encode` converts a PNG into `.mpln`.
- `decode` converts one `.mpln` document into a PNG. Multi-frame documents are
  written as a horizontal sprite sheet.
- `batch` walks a folder recursively. `.png` files become `.mpln`; `.mpln`
  files become `.png`.
- By default, PNG encode preserves opaque black and near-black pixels. Add
  `-transparent-black` only for pixel-art sources where black background should
  become transparent.

Meta generation:

- `-meta godot` writes `sprite.png.import` with filtering disabled.
- `-meta unity` writes `sprite.png.meta` with point filtering and texture
  compression disabled.
- `-meta both` writes both files.

Build a Windows executable with:

```bash
go build -o mpln.exe ./cmd/mpln
```

## Browser WASM Core

The browser loads the same Go core through WebAssembly:

- `wasm_exec.js` is the Go runtime bridge.
- `wasm_loader.js` loads `mpln.wasm` and exposes `window.MPLNWasm`.
- `cmd/mplnwasm` exposes `mplnEncodeImageData` and `mplnRenderMPLN` to JS.

Rebuild the WASM bundle after Go core changes:

```bash
GOOS=js GOARCH=wasm go build -o mpln.wasm ./cmd/mplnwasm
```

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
go test ./...
```

They verify that the palette alphabet does not conflict with MPLN syntax, that
symbols past the letter-only range decode correctly, and that oversized rows are
rejected. They also cover the shared conversion core, custom palette parsing,
lossless color limits, `T2` token parsing, dither mapping, multi-frame parsing,
Go sprite-sheet rendering, WASM buildability, and pixel-art meta-file
generation.
