import React, { useEffect, useRef, useState } from "react";
import maplibregl, { LngLatBoundsLike, Map } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { getGroundPlaneDataUrl, getPlaneDataUrl } from "./icons";
import type { FlightPoint } from "./types";

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

const ATL_CENTER: [number, number] = [-84.4277, 33.6407];
const DEFAULT_ZOOM = 8;

export default function RasterView({ points }: Props) {
  const mapRef = useRef<Map | null>(null);
  const divRef = useRef<HTMLDivElement | null>(null);
  const hasFitRasterRef = useRef(false);
  const [error, setError] = useState<string | null>(null);

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

        if (!map.getLayer("flights-symbols")) {
          map.addLayer({
            id: "flights-symbols",
            type: "symbol",
            source: "flights",
            layout: {
              "icon-image": [
                "case",
                ["get", "onGround"],
                "plane-ground",
                "plane-air",
              ],
              "icon-size": [
                "interpolate",
                ["linear"],
                ["zoom"],
                5, 0.45,
                7, 0.6,
                10, 0.85,
                13, 1.05,
              ],
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
            map.addLayer(
              {
                id: layerId,
                type: "raster",
                source: sourceId,
                paint: {
                  "raster-opacity": 0.97,
                  "raster-fade-duration": 0,
                },
              },
              "flights-symbols"
            );
          }
        }

        if (!hasFitRasterRef.current) {
          const bounds = buildRasterBounds(index.tiles);
          if (bounds) {
            map.fitBounds(bounds, {
              padding: 40,
              duration: 1000,
              maxZoom: 12,
            });
            hasFitRasterRef.current = true;
          }
        }

        setError(null);
      } catch (err) {
        console.error("Failed to load raster tiles:", err);
        setError(err instanceof Error ? err.message : "Unknown raster loading error");
      }
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const source = map.getSource("flights") as maplibregl.GeoJSONSource | undefined;
    if (!source) return;

    source.setData({
      type: "FeatureCollection",
      features: points.map((p) => ({
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: [p.lon, p.lat],
        },
        properties: {
          id: p.id,
          icao24: p.icao24,
          callsign: p.callsign,
          onGround: p.onGround,
          alt: p.alt,
          vel: p.vel,
          track: p.track ?? 0,
        },
      })),
    });
  }, [points]);

  return (
    <div style={{ position: "relative" }}>
      <div
        ref={divRef}
        style={{ height: 520, borderRadius: 16, overflow: "hidden" }}
      />
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

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image(48, 48);
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

async function loadPlaneIcons(map: Map) {
  const [air, ground] = await Promise.all([
    loadImage(getPlaneDataUrl("#67e8f9")),
    loadImage(getGroundPlaneDataUrl("#f59e0b")),
  ]);

  if (!map.hasImage("plane-air")) {
    map.addImage("plane-air", air, { pixelRatio: 2 });
  }

  if (!map.hasImage("plane-ground")) {
    map.addImage("plane-ground", ground, { pixelRatio: 2 });
  }
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