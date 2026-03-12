package flightcache

import (
	"sync"
	"time"

	"stratoagentic/backend/internal/opensky"
)

type Snapshot struct {
	Time      int64                 `json:"time"`
	Flights   []opensky.StateVector `json:"flights"`
	Source    string                `json:"source,omitempty"`
	IsStale   bool                  `json:"isStale"`
	UpdatedAt time.Time             `json:"updatedAt"`
}

type Cache struct {
	mu       sync.RWMutex
	snapshot Snapshot
	hasValue bool
}

func New() *Cache {
	return &Cache{}
}

func (c *Cache) SetFresh(t int64, flights []opensky.StateVector) {
	c.mu.Lock()
	defer c.mu.Unlock()

	c.snapshot = Snapshot{
		Time:      t,
		Flights:   flights,
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
