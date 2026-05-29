package mpln

import (
	"errors"
	"fmt"
	"image"
	"image/color"
	"image/png"
	"io"
	"math"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
)

const (
	FrameDelimiter = "||"
	PaletteSymbols = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwyz!#$%&()*+-/:<=>?@[]^_{}~"

	ModeLossy    = "lossy"
	ModeLossless = "lossless"
	ModeDither   = "dither"
)

type Frame struct {
	Palette    []string
	Pixels     [][]string
	TokenWidth int
	Width      int
	Height     int
}

type EncodeOptions struct {
	Mode                 string
	TargetWidth          int
	TransparentNearBlack bool
	CustomPaletteHexes   []string
}

type RenderedImage struct {
	RGBA   []byte
	Width  int
	Height int
}

type countedColor struct {
	hex   string
	color color.NRGBA
	count int
}

type frameHeader struct {
	width      int
	height     int
	tokenWidth int
}

func SplitFrames(doc string) []string {
	parts := strings.Split(doc, FrameDelimiter)
	frames := make([]string, 0, len(parts))
	for _, part := range parts {
		part = strings.TrimSpace(part)
		if part != "" {
			frames = append(frames, part)
		}
	}
	return frames
}

func ParseDocument(doc string) ([]Frame, error) {
	parts := SplitFrames(doc)
	if len(parts) == 0 {
		return nil, errors.New("empty MPLN document")
	}

	frames := make([]Frame, 0, len(parts))
	for _, part := range parts {
		frame, err := ParseFrame(part, 64)
		if err != nil {
			return nil, err
		}
		frames = append(frames, frame)
	}
	return frames, nil
}

func ParseFrame(input string, fallbackWidth int) (Frame, error) {
	sections := strings.Split(strings.TrimSpace(input), "|")
	if len(sections) != 2 && len(sections) != 3 {
		return Frame{}, errors.New("invalid MPLN format")
	}

	width := fallbackWidth
	declaredHeight := -1
	tokenWidth := 1
	paletteIndex := 0
	rowsIndex := 1
	if len(sections) == 3 {
		header, ok, err := parseFrameHeader(sections[0], fallbackWidth)
		if err != nil {
			return Frame{}, err
		}
		if !ok {
			return Frame{}, errors.New("invalid MPLN frame header")
		}
		width = header.width
		declaredHeight = header.height
		tokenWidth = header.tokenWidth
		paletteIndex = 1
		rowsIndex = 2
	}

	palette := splitPalette(sections[paletteIndex])
	tokenMap := tokenMapForPalette(len(palette), tokenWidth)
	pixels := [][]string{}

	for _, rawRow := range strings.Split(sections[rowsIndex], ";") {
		row := strings.TrimSpace(rawRow)
		if row == "" {
			continue
		}

		if isDimension(row) {
			parts := strings.Split(row, "x")
			multiplier, _ := strconv.Atoi(parts[0])
			count, _ := strconv.Atoi(parts[1])
			if count > width {
				return Frame{}, fmt.Errorf("empty row token exceeds %d columns: %s", width, row)
			}
			for i := 0; i < multiplier; i++ {
				pixels = append(pixels, emptyRow(width))
			}
			continue
		}

		line := []string{}
		runes := []rune(row)
		for i := 0; i < len(runes); {
			num := ""
			for i < len(runes) && runes[i] >= '0' && runes[i] <= '9' {
				num += string(runes[i])
				i++
			}
			count := 1
			if num != "" {
				parsedCount, err := strconv.Atoi(num)
				if err != nil {
					return Frame{}, err
				}
				count = parsedCount
			}
			if i >= len(runes) {
				break
			}
			token := "."
			if runes[i] == '.' {
				i++
			} else {
				if i+tokenWidth > len(runes) {
					return Frame{}, fmt.Errorf("MPLN row %q has incomplete T%d token", row, tokenWidth)
				}
				token = string(runes[i : i+tokenWidth])
				i += tokenWidth
			}

			pixel := "."
			if token != "." {
				if idx, ok := tokenMap[token]; ok && idx < len(palette) {
					pixel = palette[idx]
				}
			}
			for c := 0; c < count; c++ {
				line = append(line, pixel)
			}
			if len(line) > width {
				return Frame{}, fmt.Errorf("MPLN row %q exceeds %d columns", row, width)
			}
		}
		for len(line) < width {
			line = append(line, ".")
		}
		pixels = append(pixels, line)
	}

	if declaredHeight >= 0 && len(pixels) != declaredHeight {
		return Frame{}, fmt.Errorf("MPLN row count %d does not match header %d", len(pixels), declaredHeight)
	}

	return Frame{Palette: palette, Pixels: pixels, TokenWidth: tokenWidth, Width: width, Height: len(pixels)}, nil
}

func RenderSpriteSheet(frames []Frame) *image.NRGBA {
	width := 0
	height := 0
	for _, frame := range frames {
		width += frame.Width
		if frame.Height > height {
			height = frame.Height
		}
	}

	sheet := image.NewNRGBA(image.Rect(0, 0, width, height))
	offsetX := 0
	for _, frame := range frames {
		for y, row := range frame.Pixels {
			for x, hex := range row {
				if hex == "." {
					continue
				}
				sheet.SetNRGBA(offsetX+x, y, mustParseHex(hex))
			}
		}
		offsetX += frame.Width
	}
	return sheet
}

func EncodeImage(img image.Image, options EncodeOptions) (string, error) {
	if options.Mode == "" {
		options.Mode = ModeLossy
	}
	if options.TargetWidth > 0 && options.TargetWidth != img.Bounds().Dx() {
		img = resizeNearest(img, options.TargetWidth)
	}

	bounds := img.Bounds()
	width := bounds.Dx()
	height := bounds.Dy()
	colors := collectColors(img, options.TransparentNearBlack)
	forcedPalette := normalizePalette(options.CustomPaletteHexes, tokenCapacity(2))
	requestedColors := len(colors)
	if len(forcedPalette) > requestedColors {
		requestedColors = len(forcedPalette)
	}
	tokenWidth := tokenWidthForColorCount(requestedColors)
	colorLimit := tokenCapacity(tokenWidth)

	palette := forcedPalette
	if len(palette) == 0 {
		palette = choosePalette(colors, colorLimit)
	}
	if len(palette) == 0 {
		palette = []countedColor{
			{
				hex:   "000000",
				color: color.NRGBA{A: 255},
				count: 0,
			},
		}
	}
	paletteColors := make([]color.NRGBA, len(palette))
	for i, item := range palette {
		paletteColors[i] = item.color
	}

	lines := make([]string, 0, height)
	for _, chars := range mapImageToSymbols(
		img,
		paletteColors,
		options.Mode,
		tokenWidth,
		options.TransparentNearBlack,
	) {
		lines = append(lines, rleLine(chars))
	}

	optimized := compressEmptyRows(lines, width)
	paletteHex := make([]string, len(palette))
	for i, item := range palette {
		paletteHex[i] = item.hex
	}
	header := fmt.Sprintf("%dx%d", width, height)
	if tokenWidth > 1 {
		header = fmt.Sprintf("%s;T%d", header, tokenWidth)
	}
	return fmt.Sprintf("%s|%s|%s;", header, strings.Join(paletteHex, ","), strings.Join(optimized, ";")), nil
}

func DecodePNG(inPath, outPath string, meta string) error {
	data, err := os.ReadFile(inPath)
	if err != nil {
		return err
	}
	frames, err := ParseDocument(string(data))
	if err != nil {
		return err
	}
	out, err := os.Create(outPath)
	if err != nil {
		return err
	}
	defer out.Close()
	if err := png.Encode(out, RenderSpriteSheet(frames)); err != nil {
		return err
	}
	return WriteMetaFiles(outPath, meta)
}

func EncodePNG(inPath, outPath string, options EncodeOptions) error {
	in, err := os.Open(inPath)
	if err != nil {
		return err
	}
	defer in.Close()
	img, _, err := image.Decode(in)
	if err != nil {
		return err
	}
	doc, err := EncodeImage(img, options)
	if err != nil {
		return err
	}
	return os.WriteFile(outPath, []byte(doc), 0644)
}

func EncodeRGBA(rgba []byte, width int, height int, options EncodeOptions) (string, error) {
	if width < 1 || height < 1 {
		return "", fmt.Errorf("invalid image size %dx%d", width, height)
	}
	expected := width * height * 4
	if len(rgba) != expected {
		return "", fmt.Errorf("RGBA buffer has %d bytes, want %d", len(rgba), expected)
	}
	img := image.NewNRGBA(image.Rect(0, 0, width, height))
	copy(img.Pix, rgba)
	return EncodeImage(img, options)
}

func RenderDocumentRGBA(doc string) (RenderedImage, error) {
	frames, err := ParseDocument(doc)
	if err != nil {
		return RenderedImage{}, err
	}
	sheet := RenderSpriteSheet(frames)
	rgba := append([]byte(nil), sheet.Pix...)
	return RenderedImage{
		RGBA:   rgba,
		Width:  sheet.Bounds().Dx(),
		Height: sheet.Bounds().Dy(),
	}, nil
}

func WritePNG(w io.Writer, frames []Frame) error {
	return png.Encode(w, RenderSpriteSheet(frames))
}

func WriteMetaFiles(pngPath string, meta string) error {
	switch strings.ToLower(meta) {
	case "", "none":
		return nil
	case "godot":
		return os.WriteFile(pngPath+".import", []byte(GodotImportText(filepath.Base(pngPath))), 0644)
	case "unity":
		return os.WriteFile(pngPath+".meta", []byte(UnityMetaText()), 0644)
	case "both":
		if err := os.WriteFile(pngPath+".import", []byte(GodotImportText(filepath.Base(pngPath))), 0644); err != nil {
			return err
		}
		return os.WriteFile(pngPath+".meta", []byte(UnityMetaText()), 0644)
	default:
		return fmt.Errorf("unknown meta target %q", meta)
	}
}

func GodotImportText(filename string) string {
	return fmt.Sprintf(`[remap]

importer="texture"
type="CompressedTexture2D"
path="res://.godot/imported/%s.ctex"

[params]

compress/mode=0
detect_3d/compress_to=1
mipmaps/generate=false
process/fix_alpha_border=false
process/premult_alpha=false
process/normal_map_invert_y=false
process/hdr_as_srgb=false
process/hdr_clamp_exposure=false
process/size_limit=0
process/channel_pack=0
filter=false
`, filename)
}

func UnityMetaText() string {
	return `fileFormatVersion: 2
guid: 00000000000000000000000000000000
TextureImporter:
  mipmaps:
    mipMapMode: 0
    enableMipMap: 0
  isReadable: 1
  textureType: 8
  textureShape: 1
  filterMode: 0
  textureCompression: 0
  spriteMode: 2
  spritePixelsToUnits: 100
`
}

func isDimension(value string) bool {
	parts := strings.Split(strings.TrimSpace(value), "x")
	if len(parts) != 2 {
		return false
	}
	_, errA := strconv.Atoi(parts[0])
	_, errB := strconv.Atoi(parts[1])
	return errA == nil && errB == nil
}

func parseFrameHeader(value string, fallbackWidth int) (frameHeader, bool, error) {
	headerParts := strings.Split(strings.TrimSpace(value), ";")
	if len(headerParts) > 2 || !isDimension(headerParts[0]) {
		return frameHeader{}, false, nil
	}

	dims := strings.Split(headerParts[0], "x")
	width, err := strconv.Atoi(dims[0])
	if err != nil {
		return frameHeader{}, false, err
	}
	if width == 0 {
		width = fallbackWidth
	}
	height, err := strconv.Atoi(dims[1])
	if err != nil {
		return frameHeader{}, false, err
	}

	tokenWidth := 1
	if len(headerParts) == 2 {
		tokenPart := strings.TrimSpace(headerParts[1])
		if !strings.HasPrefix(tokenPart, "T") {
			return frameHeader{}, false, fmt.Errorf("invalid token header %q", tokenPart)
		}
		tokenWidth, err = strconv.Atoi(strings.TrimPrefix(tokenPart, "T"))
		if err != nil {
			return frameHeader{}, false, err
		}
		if tokenWidth < 1 {
			return frameHeader{}, false, fmt.Errorf("invalid token width T%d", tokenWidth)
		}
	}

	return frameHeader{width: width, height: height, tokenWidth: tokenWidth}, true, nil
}

func tokenCapacity(tokenWidth int) int {
	capacity := 1
	for i := 0; i < tokenWidth; i++ {
		capacity *= len([]rune(PaletteSymbols))
	}
	return capacity
}

func tokenWidthForColorCount(colorCount int) int {
	if colorCount <= tokenCapacity(1) {
		return 1
	}
	return 2
}

func tokenForIndex(index int, tokenWidth int) string {
	symbols := []rune(PaletteSymbols)
	if tokenWidth == 1 {
		return string(symbols[index])
	}
	chars := make([]rune, tokenWidth)
	value := index
	base := len(symbols)
	for i := tokenWidth - 1; i >= 0; i-- {
		chars[i] = symbols[value%base]
		value /= base
	}
	return string(chars)
}

func tokenMapForPalette(paletteLength int, tokenWidth int) map[string]int {
	result := make(map[string]int, paletteLength)
	for index := 0; index < paletteLength; index++ {
		result[tokenForIndex(index, tokenWidth)] = index
	}
	return result
}

func splitPalette(input string) []string {
	parts := strings.Split(input, ",")
	palette := make([]string, 0, len(parts))
	for _, part := range parts {
		part = strings.ToUpper(strings.TrimSpace(strings.TrimPrefix(part, "#")))
		if len(part) == 6 || len(part) == 8 {
			palette = append(palette, part)
		}
	}
	return palette
}

func normalizePalette(input []string, limit int) []countedColor {
	seen := map[string]bool{}
	palette := make([]countedColor, 0, minInt(len(input), limit))
	for _, raw := range input {
		hex := strings.ToUpper(strings.TrimSpace(strings.TrimPrefix(raw, "#")))
		if len(hex) != 6 && len(hex) != 8 {
			continue
		}
		if seen[hex] {
			continue
		}
		seen[hex] = true
		palette = append(palette, countedColor{hex: hex, color: mustParseHex(hex)})
		if len(palette) >= limit {
			break
		}
	}
	return palette
}

func emptyRow(width int) []string {
	row := make([]string, width)
	for i := range row {
		row[i] = "."
	}
	return row
}

func mustParseHex(hex string) color.NRGBA {
	hex = strings.TrimPrefix(strings.ToUpper(hex), "#")
	r, _ := strconv.ParseUint(hex[0:2], 16, 8)
	g, _ := strconv.ParseUint(hex[2:4], 16, 8)
	b, _ := strconv.ParseUint(hex[4:6], 16, 8)
	a := uint64(255)
	if len(hex) == 8 {
		a, _ = strconv.ParseUint(hex[6:8], 16, 8)
	}
	return color.NRGBA{R: uint8(r), G: uint8(g), B: uint8(b), A: uint8(a)}
}

func rgbaToHex(c color.NRGBA) string {
	if c.A < 255 {
		return fmt.Sprintf("%02X%02X%02X%02X", c.R, c.G, c.B, c.A)
	}
	return fmt.Sprintf("%02X%02X%02X", c.R, c.G, c.B)
}

func visible(c color.NRGBA, transparentNearBlack bool) bool {
	if c.A <= 5 {
		return false
	}
	if transparentNearBlack {
		return c.R > 10 || c.G > 10 || c.B > 10
	}
	return true
}

func mapImageToSymbols(img image.Image, palette []color.NRGBA, mode string, tokenWidth int, transparentNearBlack bool) [][]string {
	bounds := img.Bounds()
	width := bounds.Dx()
	height := bounds.Dy()
	rows := make([][]string, height)
	if mode != ModeDither {
		for y := 0; y < height; y++ {
			rows[y] = make([]string, width)
			for x := 0; x < width; x++ {
				c := color.NRGBAModel.Convert(img.At(bounds.Min.X+x, bounds.Min.Y+y)).(color.NRGBA)
				rows[y][x] = symbolForColor(c, palette, tokenWidth, transparentNearBlack)
			}
		}
		return rows
	}

	buffer := make([]float64, width*height*4)
	visiblePixels := make([]bool, width*height)
	for y := 0; y < height; y++ {
		rows[y] = make([]string, width)
		for x := 0; x < width; x++ {
			idx := y*width + x
			c := color.NRGBAModel.Convert(img.At(bounds.Min.X+x, bounds.Min.Y+y)).(color.NRGBA)
			buffer[idx*4] = float64(c.R)
			buffer[idx*4+1] = float64(c.G)
			buffer[idx*4+2] = float64(c.B)
			buffer[idx*4+3] = float64(c.A)
			visiblePixels[idx] = visible(c, transparentNearBlack)
		}
	}

	for y := 0; y < height; y++ {
		for x := 0; x < width; x++ {
			idx := y*width + x
			if !visiblePixels[idx] || len(palette) == 0 {
				rows[y][x] = "."
				continue
			}
			c := color.NRGBA{
				R: clampChannel(buffer[idx*4]),
				G: clampChannel(buffer[idx*4+1]),
				B: clampChannel(buffer[idx*4+2]),
				A: clampChannel(buffer[idx*4+3]),
			}
			paletteIndex := closestColorIndex(c, palette)
			rows[y][x] = tokenForIndex(paletteIndex, tokenWidth)
			target := palette[paletteIndex]
			errR := float64(c.R) - float64(target.R)
			errG := float64(c.G) - float64(target.G)
			errB := float64(c.B) - float64(target.B)
			addDitherError(buffer, visiblePixels, width, height, x+1, y, errR, errG, errB, 7.0/16.0)
			addDitherError(buffer, visiblePixels, width, height, x-1, y+1, errR, errG, errB, 3.0/16.0)
			addDitherError(buffer, visiblePixels, width, height, x, y+1, errR, errG, errB, 5.0/16.0)
			addDitherError(buffer, visiblePixels, width, height, x+1, y+1, errR, errG, errB, 1.0/16.0)
		}
	}
	return rows
}

func symbolForColor(c color.NRGBA, palette []color.NRGBA, tokenWidth int, transparentNearBlack bool) string {
	if !visible(c, transparentNearBlack) || len(palette) == 0 {
		return "."
	}
	return tokenForIndex(closestColorIndex(c, palette), tokenWidth)
}

func addDitherError(buffer []float64, visiblePixels []bool, width int, height int, x int, y int, errR float64, errG float64, errB float64, factor float64) {
	if x < 0 || x >= width || y < 0 || y >= height {
		return
	}
	idx := y*width + x
	if !visiblePixels[idx] {
		return
	}
	buffer[idx*4] += errR * factor
	buffer[idx*4+1] += errG * factor
	buffer[idx*4+2] += errB * factor
}

func clampChannel(value float64) uint8 {
	if value < 0 {
		return 0
	}
	if value > 255 {
		return 255
	}
	return uint8(math.Round(value))
}

func collectColors(img image.Image, transparentNearBlack bool) []countedColor {
	bounds := img.Bounds()
	byHex := map[string]*countedColor{}
	order := []string{}
	for y := bounds.Min.Y; y < bounds.Max.Y; y++ {
		for x := bounds.Min.X; x < bounds.Max.X; x++ {
			c := color.NRGBAModel.Convert(img.At(x, y)).(color.NRGBA)
			if !visible(c, transparentNearBlack) {
				continue
			}
			hex := rgbaToHex(c)
			if existing, ok := byHex[hex]; ok {
				existing.count++
				continue
			}
			byHex[hex] = &countedColor{hex: hex, color: c, count: 1}
			order = append(order, hex)
		}
	}
	colors := make([]countedColor, 0, len(order))
	for _, hex := range order {
		colors = append(colors, *byHex[hex])
	}
	return colors
}

func choosePalette(colors []countedColor, limit int) []countedColor {
	if len(colors) <= limit {
		return colors
	}

	boxes := [][]countedColor{append([]countedColor(nil), colors...)}
	for len(boxes) < limit {
		bestIndex := -1
		bestScore := -1
		for i, box := range boxes {
			if len(box) < 2 {
				continue
			}
			r := colorBoxRange(box)
			maxWidth := maxInt(
				int(r.rMax)-int(r.rMin),
				int(r.gMax)-int(r.gMin),
				int(r.bMax)-int(r.bMin),
				int(r.aMax)-int(r.aMin),
			)
			score := maxWidth * r.count
			if score > bestScore {
				bestScore = score
				bestIndex = i
			}
		}
		if bestIndex == -1 {
			break
		}
		left, right := splitColorBox(boxes[bestIndex])
		boxes = append(boxes[:bestIndex], append([][]countedColor{left, right}, boxes[bestIndex+1:]...)...)
	}

	palette := make([]countedColor, 0, len(boxes))
	seen := map[string]bool{}
	for _, box := range boxes {
		avg := averageColor(box)
		if !seen[avg.hex] {
			seen[avg.hex] = true
			palette = append(palette, avg)
		}
	}

	frequent := append([]countedColor(nil), colors...)
	sort.SliceStable(frequent, func(i, j int) bool {
		return frequent[i].count > frequent[j].count
	})
	for _, item := range frequent {
		if len(palette) >= limit {
			break
		}
		if !seen[item.hex] {
			seen[item.hex] = true
			palette = append(palette, item)
		}
	}
	return palette[:minInt(len(palette), limit)]
}

type colorRange struct {
	rMin  uint8
	rMax  uint8
	gMin  uint8
	gMax  uint8
	bMin  uint8
	bMax  uint8
	aMin  uint8
	aMax  uint8
	count int
}

func colorBoxRange(colors []countedColor) colorRange {
	r := colorRange{
		rMin: 255,
		gMin: 255,
		bMin: 255,
		aMin: 255,
	}
	for _, item := range colors {
		c := item.color
		if c.R < r.rMin {
			r.rMin = c.R
		}
		if c.R > r.rMax {
			r.rMax = c.R
		}
		if c.G < r.gMin {
			r.gMin = c.G
		}
		if c.G > r.gMax {
			r.gMax = c.G
		}
		if c.B < r.bMin {
			r.bMin = c.B
		}
		if c.B > r.bMax {
			r.bMax = c.B
		}
		if c.A < r.aMin {
			r.aMin = c.A
		}
		if c.A > r.aMax {
			r.aMax = c.A
		}
		r.count += item.count
	}
	return r
}

func splitColorBox(colors []countedColor) ([]countedColor, []countedColor) {
	channel := widestChannel(colors)
	sortedColors := append([]countedColor(nil), colors...)
	sort.SliceStable(sortedColors, func(i, j int) bool {
		return channelValue(sortedColors[i].color, channel) < channelValue(sortedColors[j].color, channel)
	})
	total := 0
	for _, item := range sortedColors {
		total += item.count
	}
	running := 0
	splitIndex := 1
	for i := 0; i < len(sortedColors)-1; i++ {
		running += sortedColors[i].count
		if running >= total/2 {
			splitIndex = i + 1
			break
		}
	}
	return sortedColors[:splitIndex], sortedColors[splitIndex:]
}

func widestChannel(colors []countedColor) string {
	r := colorBoxRange(colors)
	best := "r"
	bestWidth := int(r.rMax) - int(r.rMin)
	for _, item := range []struct {
		channel string
		width   int
	}{
		{channel: "g", width: int(r.gMax) - int(r.gMin)},
		{channel: "b", width: int(r.bMax) - int(r.bMin)},
		{channel: "a", width: int(r.aMax) - int(r.aMin)},
	} {
		if item.width > bestWidth {
			bestWidth = item.width
			best = item.channel
		}
	}
	return best
}

func channelValue(c color.NRGBA, channel string) uint8 {
	switch channel {
	case "g":
		return c.G
	case "b":
		return c.B
	case "a":
		return c.A
	default:
		return c.R
	}
}

func averageColor(colors []countedColor) countedColor {
	total := 0
	sumR := 0
	sumG := 0
	sumB := 0
	sumA := 0
	for _, item := range colors {
		total += item.count
		sumR += int(item.color.R) * item.count
		sumG += int(item.color.G) * item.count
		sumB += int(item.color.B) * item.count
		sumA += int(item.color.A) * item.count
	}
	c := color.NRGBA{
		R: uint8(math.Round(float64(sumR) / float64(total))),
		G: uint8(math.Round(float64(sumG) / float64(total))),
		B: uint8(math.Round(float64(sumB) / float64(total))),
		A: uint8(math.Round(float64(sumA) / float64(total))),
	}
	return countedColor{hex: rgbaToHex(c), color: c, count: total}
}

func maxInt(values ...int) int {
	best := values[0]
	for _, value := range values[1:] {
		if value > best {
			best = value
		}
	}
	return best
}

func minInt(a int, b int) int {
	if a < b {
		return a
	}
	return b
}

func closestColorIndex(c color.NRGBA, palette []color.NRGBA) int {
	best := 0
	bestDistance := math.MaxFloat64
	for i, p := range palette {
		dr := float64(int(c.R) - int(p.R))
		dg := float64(int(c.G) - int(p.G))
		db := float64(int(c.B) - int(p.B))
		da := float64(int(c.A) - int(p.A))
		d := dr*dr + dg*dg + db*db + da*da*2
		if d < bestDistance {
			best = i
			bestDistance = d
		}
	}
	return best
}

func rleLine(chars []string) string {
	if len(chars) == 0 {
		return ""
	}
	var builder strings.Builder
	current := chars[0]
	count := 1
	for _, char := range chars[1:] {
		if char == current {
			count++
			continue
		}
		writeRun(&builder, current, count)
		current = char
		count = 1
	}
	writeRun(&builder, current, count)
	return builder.String()
}

func writeRun(builder *strings.Builder, char string, count int) {
	if count > 1 {
		builder.WriteString(strconv.Itoa(count))
	}
	builder.WriteString(char)
}

func compressEmptyRows(lines []string, width int) []string {
	empty := strconv.Itoa(width) + "."
	result := []string{}
	run := 0
	for _, line := range lines {
		if line == empty {
			run++
			continue
		}
		if run > 0 {
			result = append(result, fmt.Sprintf("%dx%d", run, width))
			run = 0
		}
		result = append(result, line)
	}
	if run > 0 {
		result = append(result, fmt.Sprintf("%dx%d", run, width))
	}
	return result
}

func resizeNearest(src image.Image, targetWidth int) image.Image {
	bounds := src.Bounds()
	srcW := bounds.Dx()
	srcH := bounds.Dy()
	targetHeight := int(math.Round(float64(srcH) * float64(targetWidth) / float64(srcW)))
	if targetHeight < 1 {
		targetHeight = 1
	}
	dst := image.NewNRGBA(image.Rect(0, 0, targetWidth, targetHeight))
	for y := 0; y < targetHeight; y++ {
		srcY := bounds.Min.Y + int(float64(y)*float64(srcH)/float64(targetHeight))
		for x := 0; x < targetWidth; x++ {
			srcX := bounds.Min.X + int(float64(x)*float64(srcW)/float64(targetWidth))
			dst.Set(x, y, src.At(srcX, srcY))
		}
	}
	return dst
}
