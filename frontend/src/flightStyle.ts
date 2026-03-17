import type { FlightPoint } from "./types";

export type FlightCategory = "arrival" | "departure" | "parked";

export const ATL = {
  lat: 33.6407,
  lon: -84.4277,
};

export const FLIGHT_COLORS: Record<FlightCategory, string> = {
  arrival: "#67e8f9",
  departure: "#8b5cf6",
  parked: "#f59e0b",
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

function toDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

export function headingDeltaDeg(a: number, b: number): number {
  const d = ((((a - b) % 360) + 540) % 360) - 180;
  return Math.abs(d);
}

export function bearingDeg(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const phi1 = toRad(lat1);
  const phi2 = toRad(lat2);
  const lambda1 = toRad(lon1);
  const lambda2 = toRad(lon2);

  const y = Math.sin(lambda2 - lambda1) * Math.cos(phi2);
  const x =
    Math.cos(phi1) * Math.sin(phi2) -
    Math.sin(phi1) * Math.cos(phi2) * Math.cos(lambda2 - lambda1);

  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

export function distanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) ** 2;

  return 2 * R * Math.asin(Math.sqrt(a));
}

export function normalizeAltitudeMeters(
  alt: number | null | undefined,
  onGround = false
): number {
  if (onGround) return 0;
  if (typeof alt !== "number" || !Number.isFinite(alt)) return 2500;
  return Math.max(250, alt);
}

export function altitudeVisualScale(
  alt: number | null | undefined,
  onGround: boolean
): number {
  if (onGround) return 0.78;

  const meters = normalizeAltitudeMeters(alt, false);
  return clamp(0.82 + meters / 18000, 0.82, 1.42);
}

export function forwardVectorLengthMeters(p: FlightPoint): number {
  const vel =
    typeof p.vel === "number" && Number.isFinite(p.vel) ? p.vel : 140;

  return clamp(vel * 45, 6000, 40000);
}

export function globeVectorLengthMeters(
  p: FlightPoint,
  category: FlightCategory
): number {
  const base = forwardVectorLengthMeters(p);

  if (category === "arrival") {
    return clamp(base * 0.26, 5000, 12000);
  }

  if (category === "departure") {
    return clamp(base * 0.34, 7000, 17000);
  }

  return 0;
}

export function vectorEndAltitudeMeters(
  startAltitudeMeters: number,
  category: FlightCategory
): number {
  if (category === "arrival") {
    return Math.max(50, startAltitudeMeters - 1800);
  }

  if (category === "departure") {
    return startAltitudeMeters + 2400;
  }

  return 0;
}

export function globeCenteredAltitudeMeters(): number {
  return 120000;
}

export function classifyFlight(p: FlightPoint): FlightCategory {
  if (p.onGround) return "parked";

  const alt = normalizeAltitudeMeters(p.alt, p.onGround);
  const dist = distanceKm(p.lat, p.lon, ATL.lat, ATL.lon);
  const track = p.track ?? 0;

  const towardAirport = bearingDeg(p.lat, p.lon, ATL.lat, ATL.lon);
  const awayFromAirport = bearingDeg(ATL.lat, ATL.lon, p.lat, p.lon);

  const isPointingTowardATL = headingDeltaDeg(track, towardAirport) <= 45;
  const isPointingAwayFromATL = headingDeltaDeg(track, awayFromAirport) <= 45;

  const vertRate =
    typeof p.vertRate === "number" && Number.isFinite(p.vertRate)
      ? p.vertRate
      : null;

  if (dist <= 90 && isPointingTowardATL && alt <= 6000) {
    if (vertRate === null || vertRate <= 3) return "arrival";
  }

  if (dist <= 90 && isPointingAwayFromATL && alt <= 8000) {
    if (vertRate === null || vertRate >= -3) return "departure";
  }

  if (dist <= 160 && isPointingTowardATL) {
    if (vertRate === null || vertRate <= 0) return "arrival";
  }

  return "departure";
}

export function projectForwardWgs84(
  latDeg: number,
  lonDeg: number,
  bearingDegValue: number,
  distKm: number
): { lat: number; lon: number } {
  const R = 6371;
  const phi1 = toRad(latDeg);
  const lambda1 = toRad(lonDeg);
  const theta = toRad(bearingDegValue);
  const delta = distKm / R;

  const sinPhi2 =
    Math.sin(phi1) * Math.cos(delta) +
    Math.cos(phi1) * Math.sin(delta) * Math.cos(theta);

  const phi2 = Math.asin(sinPhi2);

  const y = Math.sin(theta) * Math.sin(delta) * Math.cos(phi1);
  const x = Math.cos(delta) - Math.sin(phi1) * sinPhi2;
  const lambda2 = lambda1 + Math.atan2(y, x);

  const lat = toDeg(phi2);
  const lon = ((toDeg(lambda2) + 540) % 360) - 180;

  return { lat, lon };
}