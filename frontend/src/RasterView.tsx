import React, { useEffect, useRef, useState } from "react";
import maplibregl, { LngLatBoundsLike, Map } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { getPlaneDataUrl } from "./icons";
import type { FlightPoint } from "./types";
import { classifyFlight, FLIGHT_COLORS } from "./flightStyle";

type RasterTile = {
  file: string;
  tileX: number;
  tileY: number;
  pixelX: number;
  pixelY: number;
  width: number;
  height: number;
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
};

type RasterIndex = {
  tiles: RasterTile[];
};

type Props = {
  points: FlightPoint[];
};

type FlightColorKey = keyof typeof FLIGHT_COLORS;

const ATL_CENTER: [number, number] = [-84.4277, 33.6407];
const DEFAULT_ZOOM = 8;
const FIXED_ICON_SIZE = 0.82;

export default function RasterView({ points }: Props) {
  const mapRef = useRef<Map | null>(null);
  const divRef = useRef<HTMLDivElement | null>(null);
  const hasFitRasterRef = useRef(false);
  const rasterReadyRef = useRef(false);
  const pendingPointsRef = useRef<FlightPoint[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isRasterReady, setIsRasterReady] = useState(false);

  useEffect(() => {
    if (!divRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: divRef.current,
      style: {
        version: 8,
        sources: {},
        layers: [
          {
            id: "background",
            type: "background",
            paint: {
              "background-color": "#0b1020",
            },
          },
        ],
      },
      center: ATL_CENTER,
      zoom: DEFAULT_ZOOM,
    });

    map.addControl(new maplibregl.NavigationControl(), "top-right");

    map.on("load", async () => {
      try {
        await loadPlaneIcons(map);

        if (!map.getSource("flights")) {
          map.addSource("flights", {
            type: "geojson",
            data: emptyFeatureCollection(),
          });
        }

        const res = await fetch("/raster/tile_index.json");
        if (!res.ok) {
          throw new Error(`tile_index.json returned ${res.status}`);
        }

        const index = (await res.json()) as RasterIndex;
        if (!index.tiles || index.tiles.length === 0) {
          throw new Error("tile_index.json contained no tiles");
        }

        for (const tile of index.tiles) {
          const sourceId = `raster-src-${tile.tileX}-${tile.tileY}`;
          const layerId = `raster-layer-${tile.tileX}-${tile.tileY}`;

          if (!map.getSource(sourceId)) {
            map.addSource(sourceId, {
              type: "image",
              url: `/raster/${tile.file}`,
              coordinates: [
                [tile.minLon, tile.maxLat],
                [tile.maxLon, tile.maxLat],
                [tile.maxLon, tile.minLat],
                [tile.minLon, tile.minLat],
              ],
            });
          }

          if (!map.getLayer(layerId)) {
            map.addLayer({
              id: layerId,
              type: "raster",
              source: sourceId,
              paint: {
                "raster-opacity": 0.97,
                "raster-fade-duration": 0,
              },
            });
          }
        }

        if (!map.getLayer("flights-symbols")) {
          map.addLayer({
            id: "flights-symbols",
            type: "symbol",
            source: "flights",
            layout: {
              "icon-image": ["coalesce", ["get", "iconImage"], "plane-default"],
              "icon-size": FIXED_ICON_SIZE,
              "icon-rotate": ["-", ["coalesce", ["get", "track"], 0], 90],
              "icon-rotation-alignment": "map",
              "icon-allow-overlap": true,
              "icon-ignore-placement": true,
              "text-field": ["coalesce", ["get", "callsign"], ["get", "icao24"]],
              "text-size": 11,
              "text-offset": [0, 1.3],
              "text-anchor": "top",
              "text-optional": true,
            },
            paint: {
              "text-color": "#e5e7eb",
              "text-halo-color": "#111827",
              "text-halo-width": 1.25,
            },
          });
        }

        if (!hasFitRasterRef.current) {
          const bounds = buildRasterBounds(index.tiles);
          if (bounds) {
            await fitMapToBounds(map, bounds);
            hasFitRasterRef.current = true;
          }
        }

        await waitForMapIdle(map);

        rasterReadyRef.current = true;
        setIsRasterReady(true);
        setError(null);

        syncFlightsToMap(map, pendingPointsRef.current);
      } catch (err) {
        console.error("Failed to load raster tiles:", err);
        setError(err instanceof Error ? err.message : "Unknown raster loading error");
      }
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      rasterReadyRef.current = false;
    };
  }, []);

  useEffect(() => {
    pendingPointsRef.current = points;

    const map = mapRef.current;
    if (!map || !rasterReadyRef.current) return;

    syncFlightsToMap(map, points);
  }, [points]);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <div
        ref={divRef}
        style={{
          width: "100%",
          height: "100%",
          borderRadius: 16,
          overflow: "hidden",
        }}
      />

      {!error && !isRasterReady && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
            color: "#cbd5e1",
            background: "rgba(11, 16, 32, 0.42)",
            textAlign: "center",
            fontSize: 14,
            borderRadius: 16,
            pointerEvents: "none",
          }}
        >
          Loading raster and fitting view…
        </div>
      )}

      {error && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
            color: "#fca5a5",
            background: "rgba(11, 16, 32, 0.78)",
            textAlign: "center",
            fontSize: 14,
            borderRadius: 16,
          }}
        >
          Raster tiles unavailable: {error}
        </div>
      )}
    </div>
  );
}

function syncFlightsToMap(map: Map, points: FlightPoint[]) {
  const source = map.getSource("flights") as maplibregl.GeoJSONSource | undefined;
  if (!source) return;

  source.setData({
    type: "FeatureCollection",
    features: points.map((p) => {
      const rawCategory = String(classifyFlight(p));
      const colorKey = resolveColorKey(rawCategory);
      const iconImage = resolveIconId(rawCategory);

      return {
        type: "Feature" as const,
        geometry: {
          type: "Point" as const,
          coordinates: [p.lon, p.lat],
        },
        properties: {
          id: p.id,
          icao24: p.icao24,
          callsign: p.callsign || p.icao24,
          onGround: p.onGround,
          alt: p.alt,
          vel: p.vel,
          track: p.track ?? 0,
          vertRate: p.vertRate ?? null,
          category: rawCategory,
          colorKey,
          iconImage,
        },
      };
    }),
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image(48, 48);
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

async function loadPlaneIcons(map: Map) {
  const parkedKey = resolveColorKey("parked");
  const arrivalKey = resolveColorKey("arrival");
  const departureKey = resolveColorKey("departure");
  const defaultKey = parkedKey ?? firstFlightColorKey();

  const [arrival, departure, parked, fallback] = await Promise.all([
    loadImage(getPlaneDataUrl(FLIGHT_COLORS[arrivalKey ?? defaultKey])),
    loadImage(getPlaneDataUrl(FLIGHT_COLORS[departureKey ?? defaultKey])),
    loadImage(getPlaneDataUrl(FLIGHT_COLORS[parkedKey ?? defaultKey])),
    loadImage(getPlaneDataUrl(FLIGHT_COLORS[defaultKey])),
  ]);

  if (!map.hasImage("plane-arrival")) {
    map.addImage("plane-arrival", arrival, { pixelRatio: 2 });
  }

  if (!map.hasImage("plane-departure")) {
    map.addImage("plane-departure", departure, { pixelRatio: 2 });
  }

  if (!map.hasImage("plane-parked")) {
    map.addImage("plane-parked", parked, { pixelRatio: 2 });
  }

  if (!map.hasImage("plane-default")) {
    map.addImage("plane-default", fallback, { pixelRatio: 2 });
  }
}

function resolveIconId(category: string): string {
  const lower = category.toLowerCase();

  if (lower.includes("park") || lower.includes("ground")) {
    return "plane-parked";
  }

  if (lower.includes("arrival") || lower.includes("low")) {
    return "plane-arrival";
  }

  if (
    lower.includes("departure") ||
    lower.includes("medium") ||
    lower.includes("high") ||
    lower.includes("airborne")
  ) {
    return "plane-departure";
  }

  return "plane-default";
}

function resolveColorKey(category: string): FlightColorKey | undefined {
  const lower = category.toLowerCase();
  const keys = Object.keys(FLIGHT_COLORS) as FlightColorKey[];

  const exact = keys.find((k) => k.toLowerCase() === lower);
  if (exact) return exact;

  if (lower.includes("park") || lower.includes("ground")) {
    return keys.find((k) => {
      const v = k.toLowerCase();
      return v.includes("park") || v.includes("ground");
    });
  }

  if (lower.includes("arrival") || lower.includes("low")) {
    return keys.find((k) => {
      const v = k.toLowerCase();
      return v.includes("arrival") || v.includes("low");
    });
  }

  if (lower.includes("departure") || lower.includes("medium") || lower.includes("mid")) {
    return keys.find((k) => {
      const v = k.toLowerCase();
      return v.includes("departure") || v.includes("medium") || v.includes("mid");
    });
  }

  if (lower.includes("high") || lower.includes("airborne")) {
    return keys.find((k) => {
      const v = k.toLowerCase();
      return v.includes("high") || v.includes("airborne");
    });
  }

  return undefined;
}

function firstFlightColorKey(): FlightColorKey {
  return Object.keys(FLIGHT_COLORS)[0] as FlightColorKey;
}

function emptyFeatureCollection() {
  return {
    type: "FeatureCollection" as const,
    features: [],
  };
}

function buildRasterBounds(tiles: RasterTile[]): LngLatBoundsLike | null {
  if (!tiles.length) return null;

  let minLon = Number.POSITIVE_INFINITY;
  let minLat = Number.POSITIVE_INFINITY;
  let maxLon = Number.NEGATIVE_INFINITY;
  let maxLat = Number.NEGATIVE_INFINITY;

  for (const tile of tiles) {
    minLon = Math.min(minLon, tile.minLon);
    minLat = Math.min(minLat, tile.minLat);
    maxLon = Math.max(maxLon, tile.maxLon);
    maxLat = Math.max(maxLat, tile.maxLat);
  }

  if (!Number.isFinite(minLon)) return null;

  return [
    [minLon, minLat],
    [maxLon, maxLat],
  ];
}

function waitForMapIdle(map: Map): Promise<void> {
  return new Promise((resolve) => {
    map.once("idle", () => resolve());
  });
}

function fitMapToBounds(map: Map, bounds: LngLatBoundsLike): Promise<void> {
  return new Promise((resolve) => {
    let settled = false;

    const finish = () => {
      if (settled) return;
      settled = true;
      resolve();
    };

    map.fitBounds(bounds, {
      padding: 40,
      duration: 1000,
      maxZoom: 12,
    });

    map.once("moveend", finish);
    window.setTimeout(finish, 1400);
  });
}