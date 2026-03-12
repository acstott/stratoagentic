package main

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"stratoagentic/backend/internal/config"
	"stratoagentic/backend/internal/db"
	"stratoagentic/backend/internal/flightcache"
	"stratoagentic/backend/internal/httpapi"
	"stratoagentic/backend/internal/mongo"
	"stratoagentic/backend/internal/opensky"
	"stratoagentic/backend/internal/poller"
	"stratoagentic/backend/internal/stream"
)

func main() {
	cfg := config.LoadFromEnv()

	log.Printf("backend starting")
	log.Printf("backend addr: %s", cfg.BackendAddr)
	log.Printf("opensky base url: %s", cfg.OpenSkyBaseURL)
	log.Printf("opensky poll interval: %ds", cfg.PollIntervalSeconds)
	log.Printf(
		"opensky bbox lat=(%f,%f) lon=(%f,%f)",
		cfg.AtlLamin,
		cfg.AtlLamax,
		cfg.AtlLomin,
		cfg.AtlLomax,
	)

	var store *db.Store
	if cfg.EnablePersistence {
		s, err := db.Connect(cfg.DatabaseURL)
		if err != nil {
			log.Fatalf("db connect: %v", err)
		}

		if err := s.Migrate("./migrations"); err != nil {
			log.Fatalf("db migrate: %v", err)
		}

		store = s
		defer store.Close()

		log.Printf("postgres connected")
	}

	var mongoStore *mongo.Store
	if cfg.EnableMongo {
		m, err := mongo.Connect(cfg.MongoURI, cfg.MongoDB)
		if err != nil {
			log.Fatalf("mongo connect: %v", err)
		}

		mongoStore = m
		defer mongoStore.Close()

		log.Printf("mongo connected")
	}

	_ = store
	_ = mongoStore

	client := opensky.NewClient(
		cfg.OpenSkyBaseURL,
		cfg.OpenSkyClientID,
		cfg.OpenSkyClientSecret,
	)

	cache := flightcache.New()
	hub := stream.NewHub()

	openSkyPoller := &poller.OpenSkyPoller{
		Client:   client,
		Cache:    cache,
		Hub:      hub,
		Interval: time.Duration(cfg.PollIntervalSeconds) * time.Second,
		LATMin:   cfg.AtlLamin,
		LATMax:   cfg.AtlLamax,
		LONMin:   cfg.AtlLomin,
		LONMax:   cfg.AtlLomax,
	}

	pollerCtx, cancelPoller := context.WithCancel(context.Background())

	log.Printf("starting opensky poller")
	go openSkyPoller.Run(pollerCtx)

	appHandler := httpapi.NewRouter(cfg, hub, cache)

	mux := http.NewServeMux()

	httpapi.RegisterStaticRoutes(mux)

	mux.HandleFunc("/api/flights/latest", func(w http.ResponseWriter, r *http.Request) {
		snap, ok := cache.Get()
		if !ok {
			http.Error(w, "no data yet", http.StatusServiceUnavailable)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		if err := json.NewEncoder(w).Encode(snap); err != nil {
			http.Error(w, "encode error", http.StatusInternalServerError)
			return
		}
	})

	mux.Handle("/", appHandler)

	srv := &http.Server{
		Addr:              cfg.BackendAddr,
		Handler:           mux,
		ReadHeaderTimeout: 5 * time.Second,
	}

	go func() {
		log.Printf("backend listening on %s", cfg.BackendAddr)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("listen error: %v", err)
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)

	<-stop

	log.Printf("shutdown requested")

	cancelPoller()

	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer shutdownCancel()

	if err := srv.Shutdown(shutdownCtx); err != nil {
		log.Printf("shutdown error: %v", err)
	}

	log.Printf("shutdown complete")
}
