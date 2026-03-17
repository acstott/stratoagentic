/**
 * Normalized flight record produced by the backend and
 * derived from OpenSky state vectors but simplified for renderin
 */
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
  vertRate: number | null;
};

/**
 * Snapshot returned by: GET /api/flights/latest
 * streamed via WebSocket
 */
export type Snapshot = {
  time: number;
  flights: FlightPoint[];

  source?: string;
  isStale: boolean;
  updatedAt: string;
};