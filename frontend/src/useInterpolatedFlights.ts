import { useEffect, useMemo, useRef, useState } from "react";
import type { FlightPoint } from "./types";

type UseInterpolatedFlightsArgs = {
  points: FlightPoint[];
  durationMs?: number;
};

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function lerpAngle(a: number, b: number, t: number) {
  const delta = ((((b - a) % 360) + 540) % 360) - 180;
  return (a + delta * t + 360) % 360;
}

export function useInterpolatedFlights({
  points,
  durationMs = 1200,
}: UseInterpolatedFlightsArgs): FlightPoint[] {
  const [rendered, setRendered] = useState<FlightPoint[]>(points);

  const previousRef = useRef<Map<string, FlightPoint>>(new Map());
  const frameRef = useRef<number | null>(null);
  const startRef = useRef<number>(0);

  const pointsKey = useMemo(
    () =>
      points
        .map(
          (p) =>
            `${p.id}:${p.lat}:${p.lon}:${p.alt ?? "na"}:${p.track ?? "na"}:${p.onGround}`
        )
        .join("|"),
    [points]
  );

  useEffect(() => {
    const prevMap = new Map(rendered.map((p) => [p.id, p]));
    previousRef.current = prevMap;
    startRef.current = performance.now();

    if (frameRef.current != null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }

    const animate = (now: number) => {
      const elapsed = now - startRef.current;
      const t = Math.min(1, elapsed / durationMs);

      const next: FlightPoint[] = points.map((target) => {
        const prev = prevMap.get(target.id);
        if (!prev) return target;

        return {
          ...target,
          lat: lerp(prev.lat, target.lat, t),
          lon: lerp(prev.lon, target.lon, t),
          alt:
            typeof prev.alt === "number" && typeof target.alt === "number"
              ? lerp(prev.alt, target.alt, t)
              : target.alt,
          vel:
            typeof prev.vel === "number" && typeof target.vel === "number"
              ? lerp(prev.vel, target.vel, t)
              : target.vel,
          track:
            typeof prev.track === "number" &&
            typeof target.track === "number"
              ? lerpAngle(prev.track, target.track, t)
              : target.track,
        };
      });

      setRendered(next);

      if (t < 1) {
        frameRef.current = requestAnimationFrame(animate);
      } else {
        frameRef.current = null;
      }
    };

    frameRef.current = requestAnimationFrame(animate);

    return () => {
      if (frameRef.current != null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
    };
  }, [pointsKey, durationMs]);

  useEffect(() => {
    if (points.length === 0) {
      setRendered([]);
    }
  }, [points.length]);

  return rendered;
}