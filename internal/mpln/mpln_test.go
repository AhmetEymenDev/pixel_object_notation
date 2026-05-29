package mpln

import (
	"fmt"
	"image"
	"image/color"
	"strings"
	"testing"
)

func TestParseDocumentSplitsFramesAndRendersSpriteSheet(t *testing.T) {
	doc := "2x1|FF0000|2A;" + FrameDelimiter + "2x1|00FF00|A.;"

	frames, err := ParseDocument(doc)
	if err != nil {
		t.Fatalf("ParseDocument returned error: %v", err)
	}
	if len(frames) != 2 {
		t.Fatalf("got %d frames, want 2", len(frames))
	}

	sheet := RenderSpriteSheet(frames)
	if sheet.Bounds().Dx() != 4 || sheet.Bounds().Dy() != 1 {
		t.Fatalf("sheet bounds = %v, want 4x1", sheet.Bounds())
	}

	if got := sheet.NRGBAAt(0, 0); got != (color.NRGBA{R: 255, A: 255}) {
		t.Fatalf("left frame pixel = %#v, want red", got)
	}
	if got := sheet.NRGBAAt(2, 0); got != (color.NRGBA{G: 255, A: 255}) {
		t.Fatalf("right frame pixel = %#v, want green", got)
	}
	if got := sheet.NRGBAAt(3, 0); got.A != 0 {
		t.Fatalf("transparent pixel alpha = %d, want 0", got.A)
	}
}

func TestEncodeImageLosslessRoundTripsVisiblePixels(t *testing.T) {
	img := image.NewNRGBA(image.Rect(0, 0, 2, 1))
	img.SetNRGBA(0, 0, color.NRGBA{R: 255, A: 255})
	img.SetNRGBA(1, 0, color.NRGBA{G: 255, A: 255})

	doc, err := EncodeImage(img, EncodeOptions{Mode: ModeLossless})
	if err != nil {
		t.Fatalf("EncodeImage returned error: %v", err)
	}

	frames, err := ParseDocument(doc)
	if err != nil {
		t.Fatalf("ParseDocument returned error: %v", err)
	}
	if len(frames) != 1 {
		t.Fatalf("got %d frames, want 1", len(frames))
	}
	if frames[0].Pixels[0][0] != "FF0000" || frames[0].Pixels[0][1] != "00FF00" {
		t.Fatalf("pixels = %#v", frames[0].Pixels[0])
	}
}

func TestEncodeImageKeepsNearBlackOpaqueByDefault(t *testing.T) {
	img := image.NewNRGBA(image.Rect(0, 0, 1, 1))
	img.SetNRGBA(0, 0, color.NRGBA{R: 5, G: 5, B: 5, A: 255})

	doc, err := EncodeImage(img, EncodeOptions{Mode: ModeLossless})
	if err != nil {
		t.Fatalf("EncodeImage returned error: %v", err)
	}
	frames, err := ParseDocument(doc)
	if err != nil {
		t.Fatalf("ParseDocument returned error: %v", err)
	}
	got := RenderSpriteSheet(frames).NRGBAAt(0, 0)
	if got.A != 255 || got.R != 5 || got.G != 5 || got.B != 5 {
		t.Fatalf("pixel = %#v, want opaque near-black", got)
	}
}

func TestEncodeImageCanTreatNearBlackAsTransparent(t *testing.T) {
	img := image.NewNRGBA(image.Rect(0, 0, 1, 1))
	img.SetNRGBA(0, 0, color.NRGBA{R: 5, G: 5, B: 5, A: 255})

	doc, err := EncodeImage(img, EncodeOptions{
		Mode:                 ModeLossless,
		TransparentNearBlack: true,
	})
	if err != nil {
		t.Fatalf("EncodeImage returned error: %v", err)
	}
	frames, err := ParseDocument(doc)
	if err != nil {
		t.Fatalf("ParseDocument returned error: %v", err)
	}
	if got := RenderSpriteSheet(frames).NRGBAAt(0, 0); got.A != 0 {
		t.Fatalf("alpha = %d, want transparent", got.A)
	}
}

func TestEncodeImageLossyKeepsRareHighContrastColors(t *testing.T) {
	img := image.NewNRGBA(image.Rect(0, 0, 151, 1))
	for x := 0; x < 75; x++ {
		v := uint8(11 + x)
		img.SetNRGBA(x*2, 0, color.NRGBA{R: v, G: v, B: v, A: 255})
		img.SetNRGBA(x*2+1, 0, color.NRGBA{R: v, G: v, B: v, A: 255})
	}
	img.SetNRGBA(150, 0, color.NRGBA{R: 240, G: 32, B: 32, A: 255})

	doc, err := EncodeImage(img, EncodeOptions{Mode: ModeLossy})
	if err != nil {
		t.Fatalf("EncodeImage returned error: %v", err)
	}
	frames, err := ParseDocument(doc)
	if err != nil {
		t.Fatalf("ParseDocument returned error: %v", err)
	}

	decoded := RenderSpriteSheet(frames)
	rare := decoded.NRGBAAt(150, 0)
	if rare.R < 180 || rare.G > 90 || rare.B > 90 {
		t.Fatalf("rare high-contrast pixel = %#v, want a red representative", rare)
	}
}

func TestParseFrameTwoCharacterTokens(t *testing.T) {
	frame, err := ParseFrame("4x1;T2|FF0000,00FF00|AA3AB;", 64)
	if err != nil {
		t.Fatalf("ParseFrame returned error: %v", err)
	}

	if frame.TokenWidth != 2 {
		t.Fatalf("TokenWidth = %d, want 2", frame.TokenWidth)
	}
	got := frame.Pixels[0]
	if got[0] != "FF0000" || got[1] != "00FF00" || got[2] != "00FF00" || got[3] != "00FF00" {
		t.Fatalf("pixels = %#v", got)
	}
}

func TestEncodeImageLosslessUsesTwoCharacterTokensWhenNeeded(t *testing.T) {
	colorCount := len([]rune(PaletteSymbols)) + 1
	img := image.NewNRGBA(image.Rect(0, 0, colorCount, 1))
	for x := 0; x < colorCount; x++ {
		img.SetNRGBA(x, 0, color.NRGBA{R: uint8(x), G: uint8((x * 3) % 256), B: uint8((x * 7) % 256), A: 255})
	}

	doc, err := EncodeImage(img, EncodeOptions{Mode: ModeLossless})
	if err != nil {
		t.Fatalf("EncodeImage returned error: %v", err)
	}
	if !strings.HasPrefix(doc, fmt.Sprintf("%dx1;T2|", colorCount)) {
		t.Fatalf("doc = %q, want T2 header", doc)
	}
	frames, err := ParseDocument(doc)
	if err != nil {
		t.Fatalf("ParseDocument returned error: %v", err)
	}
	if frames[0].TokenWidth != 2 {
		t.Fatalf("TokenWidth = %d, want 2", frames[0].TokenWidth)
	}
	expected := color.NRGBA{
		R: uint8(colorCount - 1),
		G: uint8(((colorCount - 1) * 3) % 256),
		B: uint8(((colorCount - 1) * 7) % 256),
		A: 255,
	}
	if got := RenderSpriteSheet(frames).NRGBAAt(colorCount-1, 0); got != expected {
		t.Fatalf("last pixel = %#v, want %#v", got, expected)
	}
}

func TestEncodeImageLosslessCapsColorsAboveTwoCharacterTokenCapacity(t *testing.T) {
	colorCount := tokenCapacity(2) + 1
	img := image.NewNRGBA(image.Rect(0, 0, colorCount, 1))
	for x := 0; x < colorCount; x++ {
		img.SetNRGBA(x, 0, color.NRGBA{R: uint8(x & 255), G: uint8((x >> 8) & 255), A: 255})
	}

	doc, err := EncodeImage(img, EncodeOptions{Mode: ModeLossless})
	if err != nil {
		t.Fatalf("EncodeImage returned error: %v", err)
	}
	if !strings.HasPrefix(doc, fmt.Sprintf("%dx1;T2|", colorCount)) {
		t.Fatalf("doc = %q, want T2 header", doc)
	}
	frames, err := ParseDocument(doc)
	if err != nil {
		t.Fatalf("ParseDocument returned error: %v", err)
	}
	if got := len(frames[0].Palette); got != tokenCapacity(2) {
		t.Fatalf("palette length = %d, want %d", got, tokenCapacity(2))
	}
	if got := len(frames[0].Pixels[0]); got != colorCount {
		t.Fatalf("row width = %d, want %d", got, colorCount)
	}
}

func TestEncodeImageUsesCustomPalette(t *testing.T) {
	img := image.NewNRGBA(image.Rect(0, 0, 1, 1))
	img.SetNRGBA(0, 0, color.NRGBA{R: 250, G: 10, B: 10, A: 255})

	doc, err := EncodeImage(img, EncodeOptions{
		Mode:               ModeLossy,
		CustomPaletteHexes: []string{"000000", "FF0000"},
	})
	if err != nil {
		t.Fatalf("EncodeImage returned error: %v", err)
	}
	frames, err := ParseDocument(doc)
	if err != nil {
		t.Fatalf("ParseDocument returned error: %v", err)
	}
	if got := RenderSpriteSheet(frames).NRGBAAt(0, 0); got != (color.NRGBA{R: 255, A: 255}) {
		t.Fatalf("pixel = %#v, want custom palette red", got)
	}
}

func TestMetaFilesDisableFilteringForPixelArt(t *testing.T) {
	godot := GodotImportText("sprite.png")
	if !strings.Contains(godot, "filter=false") {
		t.Fatalf("Godot import text does not disable filtering:\n%s", godot)
	}

	unity := UnityMetaText()
	if !strings.Contains(unity, "filterMode: 0") || !strings.Contains(unity, "textureCompression: 0") {
		t.Fatalf("Unity meta text does not force point/no compression:\n%s", unity)
	}
}
