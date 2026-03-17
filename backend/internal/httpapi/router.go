package httpapi

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/cors"

	"stratoagentic/backend/internal/config"
	"stratoagentic/backend/internal/flightcache"
	"stratoagentic/backend/internal/stream"
)

func NewRouter(cfg config.Config, hub *stream.Hub, cache *flightcache.Cache) http.Handler {
	r := chi.NewRouter()

	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   cfg.CorsOrigins,
		AllowedMethods:   []string{"GET", "POST", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type"},
		AllowCredentials: true,
		MaxAge:           300,
	}))

	r.Get("/healthz", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	})

	r.Get("/api/flights/latest", func(w http.ResponseWriter, r *http.Request) {
		snap, ok := cache.Get()
		if !ok {
			writeJSON(w, http.StatusServiceUnavailable, map[string]any{
				"error": "no flight snapshot available yet",
			})
			return
		}

		writeJSON(w, http.StatusOK, snap)
	})

	r.Get("/stream", NewWSHandler(hub, cache))

	return r
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}
