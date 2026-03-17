package flightcache

import (
	"strings"
	"sync"
	"time"

	"stratoagentic/backend/internal/opensky"
)

type FlightPoint struct {
	ID       string   `json:"id"`
	Icao24   string   `json:"icao24"`
	Callsign string   `json:"callsign"`
	Country  string   `json:"country"`
	Lat      float64  `json:"lat"`
	Lon      float64  `json:"lon"`
	OnGround bool     `json:"onGround"`
	Alt      *float64 `json:"alt"`
	Vel      *float64 `json:"vel"`
	Track    *float64 `json:"track"`
	VertRate *float64 `json:"vertRate"`
}

type Snapshot struct {
	Time      int64         `json:"time"`
	Flights   []FlightPoint `json:"flights"`
	Source    string        `json:"source,omitempty"`
	IsStale   bool          `json:"isStale"`
	UpdatedAt time.Time     `json:"updatedAt"`
}

type Cache struct {
	mu       sync.RWMutex
	snapshot Snapshot
	hasValue bool
}

func New() *Cache {
	return &Cache{}
}

func (c *Cache) SetFresh(t int64, states []opensky.StateVector) {
	c.mu.Lock()
	defer c.mu.Unlock()

	c.snapshot = Snapshot{
		Time:      t,
		Flights:   normalizeFlights(states),
		Source:    "opensky",
		IsStale:   false,
		UpdatedAt: time.Now().UTC(),
	}
	c.hasValue = true
}

func (c *Cache) MarkStale() {
	c.mu.Lock()
	defer c.mu.Unlock()

	if !c.hasValue {
		return
	}

	c.snapshot.IsStale = true
	c.snapshot.UpdatedAt = time.Now().UTC()
}

func (c *Cache) Get() (Snapshot, bool) {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.snapshot, c.hasValue
}

func normalizeFlights(states []opensky.StateVector) []FlightPoint {
	out := make([]FlightPoint, 0, len(states))

	for _, s := range states {
		if s.Latitude == nil || s.Longitude == nil {
			continue
		}

		out = append(out, FlightPoint{
			ID:       s.Icao24,
			Icao24:   s.Icao24,
			Callsign: strings.TrimSpace(s.Callsign),
			Country:  s.OriginCountry,
			Lat:      *s.Latitude,
			Lon:      *s.Longitude,
			OnGround: s.OnGround,
			Alt:      preferredAltitude(s),
			Vel:      cloneFloat64(s.Velocity),
			Track:    cloneFloat64(s.TrueTrack),
			VertRate: cloneFloat64(s.VerticalRate),
		})
	}

	return out
}

func preferredAltitude(s opensky.StateVector) *float64 {
	if s.GeoAltitude != nil {
		return cloneFloat64(s.GeoAltitude)
	}
	if s.BaroAltitude != nil {
		return cloneFloat64(s.BaroAltitude)
	}
	return nil
}

func cloneFloat64(v *float64) *float64 {
	if v == nil {
		return nil
	}
	x := *v
	return &x
}
