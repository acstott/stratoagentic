package opensky

// Docs: /states/all returns {"time": <unix>, "states": [ ... ]}
// Each state is a fixed-position array of 17 fields. See StateVector struct below for details
// Official docs describe the fields and ordering. :contentReference[oaicite:2]{index=2}

type StatesResponse struct {
	Time   int64           `json:"time"`
	States [][]interface{} `json:"states"`
}

type StateVector struct {
	Icao24        string `json:"icao24"`
	Callsign      string `json:"callsign"`
	OriginCountry string `json:"origin_country"`

	TimePosition *int64 `json:"time_position"`
	LastContact  int64  `json:"last_contact"`

	Longitude    *float64 `json:"longitude"`
	Latitude     *float64 `json:"latitude"`
	BaroAltitude *float64 `json:"baro_altitude"`
	OnGround     bool     `json:"on_ground"`
	Velocity     *float64 `json:"velocity"`
	TrueTrack    *float64 `json:"true_track"`
	VerticalRate *float64 `json:"vertical_rate"`

	GeoAltitude *float64 `json:"geo_altitude"`
	Squawk      *string  `json:"squawk"`
	Spi         bool     `json:"spi"`
	PositionSrc int      `json:"position_source"`
}
