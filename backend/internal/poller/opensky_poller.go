package poller

import (
	"context"
	"log"
	"time"

	"stratoagentic/backend/internal/flightcache"
	"stratoagentic/backend/internal/opensky"
	"stratoagentic/backend/internal/stream"
)

type OpenSkyPoller struct {
	Client   *opensky.Client
	Cache    *flightcache.Cache
	Hub      *stream.Hub
	Interval time.Duration

	LATMin float64
	LATMax float64
	LONMin float64
	LONMax float64
}

func (p *OpenSkyPoller) Run(ctx context.Context) {

	log.Printf(
		"opensky poller starting | interval=%s bbox=[lat:(%f,%f) lon:(%f,%f)]",
		p.Interval,
		p.LATMin,
		p.LATMax,
		p.LONMin,
		p.LONMax,
	)

	// Initial fetch immediately
	p.fetchAndBroadcast(ctx)

	ticker := time.NewTicker(p.Interval)
	defer ticker.Stop()

	for {
		select {

		case <-ctx.Done():
			log.Printf("opensky poller stopping: %v", ctx.Err())
			return

		case <-ticker.C:
			p.fetchAndBroadcast(ctx)

		}
	}
}

func (p *OpenSkyPoller) fetchAndBroadcast(ctx context.Context) {

	log.Printf(
		"opensky polling bbox lat=(%f,%f) lon=(%f,%f)",
		p.LATMin,
		p.LATMax,
		p.LONMin,
		p.LONMax,
	)

	flights, t, err := p.Client.GetStatesAllBBox(
		ctx,
		p.LATMin,
		p.LATMax,
		p.LONMin,
		p.LONMax,
	)

	if err != nil {

		log.Printf("opensky poll error: %v", err)

		p.Cache.MarkStale()

		if snap, ok := p.Cache.Get(); ok {
			p.Hub.Broadcast(snap)
		}

		return
	}

	log.Printf("opensky returned %d flights at time=%d", len(flights), t)

	p.Cache.SetFresh(t, flights)

	if snap, ok := p.Cache.Get(); ok {
		p.Hub.Broadcast(snap)
	}

	log.Printf("opensky broadcast snapshot flights=%d", len(flights))
}
