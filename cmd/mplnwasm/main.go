//go:build js && wasm

package main

import (
	"encoding/json"
	"syscall/js"

	"pixel_object_notation/internal/mpln"
)

type encodeRequest struct {
	CustomPaletteHexes   []string `json:"customPaletteHexes"`
	Mode                 string   `json:"mode"`
	TransparentNearBlack bool     `json:"transparentNearBlack"`
}

func main() {
	done := make(chan struct{})
	js.Global().Set("mplnEncodeImageData", js.FuncOf(encodeImageData))
	js.Global().Set("mplnRenderMPLN", js.FuncOf(renderMPLN))
	js.Global().Set("mplnWasmReady", js.ValueOf(true))
	<-done
}

func encodeImageData(_ js.Value, args []js.Value) any {
	if len(args) < 4 {
		return errorResult("mplnEncodeImageData expects rgba, width, height, optionsJson")
	}

	rgba := make([]byte, args[0].Get("length").Int())
	js.CopyBytesToGo(rgba, args[0])
	width := args[1].Int()
	height := args[2].Int()
	options := encodeRequest{Mode: mpln.ModeLossy}
	if raw := args[3].String(); raw != "" {
		if err := json.Unmarshal([]byte(raw), &options); err != nil {
			return errorResult(err.Error())
		}
	}

	doc, err := mpln.EncodeRGBA(rgba, width, height, mpln.EncodeOptions{
		Mode:                 options.Mode,
		TransparentNearBlack: options.TransparentNearBlack,
		CustomPaletteHexes:   options.CustomPaletteHexes,
	})
	if err != nil {
		return errorResult(err.Error())
	}
	result := js.Global().Get("Object").New()
	result.Set("ok", true)
	result.Set("mpln", doc)
	return result
}

func renderMPLN(_ js.Value, args []js.Value) any {
	if len(args) < 1 {
		return errorResult("mplnRenderMPLN expects MPLN text")
	}
	rendered, err := mpln.RenderDocumentRGBA(args[0].String())
	if err != nil {
		return errorResult(err.Error())
	}
	array := js.Global().Get("Uint8Array").New(len(rendered.RGBA))
	js.CopyBytesToJS(array, rendered.RGBA)
	result := js.Global().Get("Object").New()
	result.Set("ok", true)
	result.Set("width", rendered.Width)
	result.Set("height", rendered.Height)
	result.Set("rgba", array)
	return result
}

func errorResult(message string) js.Value {
	result := js.Global().Get("Object").New()
	result.Set("ok", false)
	result.Set("error", message)
	return result
}
