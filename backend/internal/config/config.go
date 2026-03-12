package config

import (
	"os"
	"strconv"
	"strings"
)

type Config struct {
	// OpenSky API
	OpenSkyBaseURL      string
	OpenSkyClientID     string
	OpenSkyClientSecret string

	// Bounding box
	AtlLamin float64
	AtlLamax float64
	AtlLomin float64
	AtlLomax float64

	PollIntervalSeconds int

	// HTTP server
	BackendAddr string
	CorsOrigins []string

	// Postgres
	DatabaseURL       string
	EnablePersistence bool

	// Mongo
	EnableMongo            bool
	MongoURI               string
	MongoDB                string
	MongoGeoJSONCollection string
}

func LoadFromEnv() Config {
	return Config{
		OpenSkyBaseURL:      env("OPENSKY_BASE_URL", "https://opensky-network.org/api"),
		OpenSkyClientID:     env("OPENSKY_CLIENT_ID", ""),
		OpenSkyClientSecret: env("OPENSKY_CLIENT_SECRET", ""),

		AtlLamin: mustFloat(env("ATL_LAMIN", "33.20")),
		AtlLamax: mustFloat(env("ATL_LAMAX", "34.30")),
		AtlLomin: mustFloat(env("ATL_LOMIN", "-85.30")),
		AtlLomax: mustFloat(env("ATL_LOMAX", "-83.70")),

		PollIntervalSeconds: mustInt(env("POLL_INTERVAL_SECONDS", "60")),

		BackendAddr: env("BACKEND_ADDR", ":8080"),
		CorsOrigins: splitCSV(env("CORS_ORIGINS", "http://localhost:3000")),

		DatabaseURL:       env("DATABASE_URL", "postgres://postgres:postgres@db:5432/stratoagentic?sslmode=disable"),
		EnablePersistence: mustBool(env("ENABLE_PERSISTENCE", "true")),

		EnableMongo:            mustBool(env("ENABLE_MONGO", "true")),
		MongoURI:               env("MONGODB_URI", "mongodb://mongo:27017"),
		MongoDB:                env("MONGODB_DB", "stratoagentic"),
		MongoGeoJSONCollection: env("MONGODB_GEOJSON_COLLECTION", "geojson_features"),
	}
}

func env(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}

func mustInt(v string) int {
	i, err := strconv.Atoi(v)
	if err != nil {
		return 60
	}
	return i
}

func mustFloat(v string) float64 {
	f, err := strconv.ParseFloat(v, 64)
	if err != nil {
		return 0
	}
	return f
}

func mustBool(v string) bool {
	switch strings.ToLower(strings.TrimSpace(v)) {
	case "1", "true", "yes", "y", "on":
		return true
	default:
		return false
	}
}

func splitCSV(v string) []string {
	parts := strings.Split(v, ",")
	out := make([]string, 0, len(parts))

	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p != "" {
			out = append(out, p)
		}
	}

	return out
}
