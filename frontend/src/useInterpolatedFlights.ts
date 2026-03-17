import { useEffect, useMemo, useRef, useState } from "react";
import type { FlightPoint } from "./types";

type UseInterpolatedFlightsArgs = {
  points: FlightPoint[];
  durationMs?: number;
};

type FlightPointMap = Map<string, FlightPoint>;

export function useInterpolatedFlights({
  points,
  durationMs = 1200,
}: UseInterpolatedFlightsArgs): FlightPoint[] {
  const previousPointsRef = useRef<FlightPointMap>(new Map());
  const targetPointsRef = useRef<FlightPointMap>(new Map());
  const animationFrameRef = useRef<number | null>(null);
  const animationStartRef = useRef<number>(0);

  const [progress, setProgress] = useState(1);

  useEffect(() => {
    const prevMap = targetPointsRef.current.size
      ? targetPointsRef.current
      : previousPointsRef.current;

    const nextPrevMap: FlightPointMap = new Map();
    const nextTargetMap: FlightPointMap = new Map();

    for (const point of points) {
      const prev = prevMap.get(point.id) ?? point;
      nextPrevMap.set(point.id, prev);
      nextTargetMap.set(point.id, point);
    }

    previousPointsRef.current = nextPrevMap;
    targetPointsRef.current = nextTargetMap;

    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
    }

    animationStartRef.current = performance.now();
    setProgress(0);

    const tick = (now: number) => {
      const elapsed = now - animationStartRef.current;
      const nextProgress = Math.min(1, elapsed / durationMs);
      setProgress(nextProgress);

      if (nextProgress < 1) {
        animationFrameRef.current = requestAnimationFrame(tick);
      } else {
        animationFrameRef.current = null;
      }
    };

    animationFrameRef.current = requestAnimationFrame(tick);

    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [points, durationMs]);

  return useMemo(() => {
    const eased = easeInOutCubic(progress);
    const out: FlightPoint[] = [];

    for (const [id, target] of targetPointsRef.current.entries()) {
      const previous = previousPointsRef.current.get(id) ?? target;

      out.push({
        ...target,
        lat: interpolate(previous.lat, target.lat, eased),
        lon: interpolateLon(previous.lon, target.lon, eased),
        alt: interpolateNullable(previous.alt, target.alt, eased),
        vel: interpolateNullable(previous.vel, target.vel, eased),
        track: interpolateTrack(previous.track, target.track, eased),

        // Preserve backend-provided metadata / classification inputs directly.
        onGround: target.onGround,
        callsign: target.callsign,
        country: target.country,
        icao24: target.icao24,
        vertRate: target.vertRate ?? null,
      });
    }

    return out;
  }, [progress, points]);
}

function interpolate(start: number, end: number, t: number): number {
  return start + (end - start) * t;
}

function interpolateNullable(
  start: number | null | undefined,
  end: number | null | undefined,
  t: number
): number | null {
  if (typeof end !== "number") return null;
  if (typeof start !== "number") return end;
  return interpolate(start, end, t);
}

function interpolateTrack(
  start: number | null | undefined,
  end: number | null | undefined,
  t: number
): number | null {
  if (typeof end !== "number") return null;
  if (typeof start !== "number") return end;

  let delta = end - start;
  if (delta > 180) delta -= 360;
  if (delta < -180) delta += 360;

  const value = start + delta * t;
  return ((value % 360) + 360) % 360;
}

function interpolateLon(start: number, end: number, t: number): number {
  let delta = end - start;
  if (delta > 180) delta -= 360;
  if (delta < -180) delta += 360;

  const value = start + delta * t;
  return ((value + 540) % 360) - 180;
}

function easeInOutCubic(t: number): number {
  if (t < 0.5) {
    return 4 * t * t * t;
  }
  return 1 - Math.pow(-2 * t + 2, 3) / 2;
}