package httpapi

import (
	"log"
	"net/http"

	"stratoagentic/backend/internal/flightcache"
	"stratoagentic/backend/internal/stream"

	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin:     func(r *http.Request) bool { return true },
}

func NewWSHandler(hub *stream.Hub, cache *flightcache.Cache) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			log.Printf("websocket upgrade error: %v", err)
			return
		}

		// Send latest cached snapshot first, before registering with the hub,
		// to avoid concurrent writes between initial sync and broadcast.
		if snap, ok := cache.Get(); ok {
			if err := conn.WriteJSON(snap); err != nil {
				log.Printf("websocket initial snapshot write error: %v", err)
				_ = conn.Close()
				return
			}
		}

		hub.Add(conn)
		defer func() {
			hub.Remove(conn)
		}()

		// Keep the connection open until the client disconnects.
		// Incoming messages are ignored for now.
		for {
			if _, _, err := conn.ReadMessage(); err != nil {
				return
			}
		}
	}
}
