export type StateVector = {
  icao24: string;
  callsign: string | null;
  origin_country: string;

  time_position: number | null;
  last_contact: number;

  longitude: number | null;
  latitude: number | null;
  baro_altitude: number | null;
  on_ground: boolean;
  velocity: number | null;
  true_track: number | null;
  vertical_rate: number | null;

  geo_altitude: number | null;
  squawk: string | null;
  spi: boolean;
  position_source: number;
};

export type Snapshot = {
  time: number;
  flights: StateVector[];
  source?: string;
  isStale: boolean;
  updatedAt: string;
};

export type FlightPoint = {
  id: string;
  icao24: string;
  callsign: string;
  country: string;
  lat: number;
  lon: number;
  onGround: boolean;
  alt: number | null;
  vel: number | null;
  track: number | null;
};