package main

import (
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"pixel_object_notation/internal/mpln"
)

func main() {
	if len(os.Args) < 2 {
		usage()
		os.Exit(2)
	}

	var err error
	switch os.Args[1] {
	case "encode":
		err = runEncode(os.Args[2:])
	case "decode":
		err = runDecode(os.Args[2:])
	case "batch":
		err = runBatch(os.Args[2:])
	default:
		usage()
		os.Exit(2)
	}

	if err != nil {
		fmt.Fprintln(os.Stderr, "mpln:", err)
		os.Exit(1)
	}
}

func runEncode(args []string) error {
	fs := flag.NewFlagSet("encode", flag.ExitOnError)
	inPath := fs.String("in", "", "input PNG")
	outPath := fs.String("out", "", "output MPLN")
	mode := fs.String("mode", mpln.ModeLossy, "lossy, lossless, or dither")
	width := fs.Int("width", 0, "optional nearest-neighbor target width")
	transparentBlack := fs.Bool("transparent-black", false, "treat near-black pixels as transparent")
	if err := fs.Parse(args); err != nil {
		return err
	}
	if *inPath == "" || *outPath == "" {
		return fmt.Errorf("encode requires -in and -out")
	}
	return mpln.EncodePNG(*inPath, *outPath, mpln.EncodeOptions{
		Mode:                 *mode,
		TargetWidth:          *width,
		TransparentNearBlack: *transparentBlack,
	})
}

func runDecode(args []string) error {
	fs := flag.NewFlagSet("decode", flag.ExitOnError)
	inPath := fs.String("in", "", "input MPLN")
	outPath := fs.String("out", "", "output PNG sprite sheet")
	meta := fs.String("meta", "none", "none, godot, unity, or both")
	if err := fs.Parse(args); err != nil {
		return err
	}
	if *inPath == "" || *outPath == "" {
		return fmt.Errorf("decode requires -in and -out")
	}
	return mpln.DecodePNG(*inPath, *outPath, *meta)
}

func runBatch(args []string) error {
	fs := flag.NewFlagSet("batch", flag.ExitOnError)
	inDir := fs.String("in", "", "input asset directory")
	outDir := fs.String("out", "", "output directory")
	mode := fs.String("mode", mpln.ModeLossy, "lossy, lossless, or dither")
	width := fs.Int("width", 0, "optional nearest-neighbor target width")
	meta := fs.String("meta", "none", "none, godot, unity, or both for decoded MPLN files")
	transparentBlack := fs.Bool("transparent-black", false, "treat near-black pixels as transparent when encoding PNG files")
	if err := fs.Parse(args); err != nil {
		return err
	}
	if *inDir == "" || *outDir == "" {
		return fmt.Errorf("batch requires -in and -out")
	}
	return filepath.WalkDir(*inDir, func(path string, entry os.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if entry.IsDir() {
			return nil
		}
		rel, err := filepath.Rel(*inDir, path)
		if err != nil {
			return err
		}
		ext := strings.ToLower(filepath.Ext(path))
		stem := strings.TrimSuffix(rel, filepath.Ext(rel))
		switch ext {
		case ".png":
			outPath := filepath.Join(*outDir, stem+".mpln")
			if err := os.MkdirAll(filepath.Dir(outPath), 0755); err != nil {
				return err
			}
			return mpln.EncodePNG(path, outPath, mpln.EncodeOptions{
				Mode:                 *mode,
				TargetWidth:          *width,
				TransparentNearBlack: *transparentBlack,
			})
		case ".mpln":
			outPath := filepath.Join(*outDir, stem+".png")
			if err := os.MkdirAll(filepath.Dir(outPath), 0755); err != nil {
				return err
			}
			return mpln.DecodePNG(path, outPath, *meta)
		default:
			return nil
		}
	})
}

func usage() {
	fmt.Fprintln(os.Stderr, `Usage:
  mpln encode -in sprite.png -out sprite.mpln [-width 128] [-mode lossy|lossless|dither] [-transparent-black]
  mpln decode -in walk.mpln -out walk.png [-meta none|godot|unity|both]
  mpln batch  -in assets -out compiled [-width 128] [-mode lossy|lossless|dither] [-transparent-black] [-meta none|godot|unity|both]`)
}
