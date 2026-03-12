package httpapi

import (
	"log"
	"net/http"
	"path/filepath"
)

func RegisterStaticRoutes(mux *http.ServeMux) {
	tilesDir, err := filepath.Abs("./data/tiles")
	if err != nil {
		log.Printf("failed to resolve tile directory: %v", err)
		tilesDir = "./data/tiles"
	}

	log.Printf("serving raster tiles from %s", tilesDir)

	fileServer := http.FileServer(http.Dir(tilesDir))
	mux.Handle("/raster/", http.StripPrefix("/raster/", fileServer))
}
