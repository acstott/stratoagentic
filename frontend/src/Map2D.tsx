import React, { useEffect, useRef } from "react";
import maplibregl, { LngLatBoundsLike, Map } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { getGroundPlaneDataUrl, getPlaneDataUrl } from "./icons";
import type { FlightPoint } from "./types";

type Props = {
  points: FlightPoint[];
};

const ATL_CENTER: [number, number] = [-84.4277, 33.6407];
const DEFAULT_ZOOM = 8;

export default function Map2D({ points }: Props) {
  const mapRef = useRef<Map | null>(null);
  const divRef = useRef<HTMLDivElement | null>(null);
  const hasDoneInitialFitRef = useRef(false);

  useEffect(() => {
    if (!divRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: divRef.current,
      style: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
      center: ATL_CENTER,
      zoom: DEFAULT_ZOOM,
    });

    map.addControl(new maplibregl.NavigationControl(), "top-right");

    map.on("load", async () => {
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
            "text-allow-overlap": false,
          },
          paint: {
            "text-color": "#e5e7eb",
            "text-halo-color": "#111827",
            "text-halo-width": 1.25,
          },
        });
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

    if (!hasDoneInitialFitRef.current && points.length > 0) {
      const bounds = buildBounds(points);
      if (bounds) {
        map.fitBounds(bounds, {
          padding: 50,
          maxZoom: 10,
          duration: 1200,
        });
        hasDoneInitialFitRef.current = true;
      }
    }
  }, [points]);

  return (
    <div
      ref={divRef}
      style={{ height: 520, borderRadius: 16, overflow: "hidden" }}
    />
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

function buildBounds(points: FlightPoint[]): LngLatBoundsLike | null {
  if (!points.length) return null;

  let minLon = Number.POSITIVE_INFINITY;
  let minLat = Number.POSITIVE_INFINITY;
  let maxLon = Number.NEGATIVE_INFINITY;
  let maxLat = Number.NEGATIVE_INFINITY;

  for (const p of points) {
    minLon = Math.min(minLon, p.lon);
    minLat = Math.min(minLat, p.lat);
    maxLon = Math.max(maxLon, p.lon);
    maxLat = Math.max(maxLat, p.lat);
  }

  if (!Number.isFinite(minLon)) return null;

  const padLon = Math.max(0.08, (maxLon - minLon) * 0.15);
  const padLat = Math.max(0.06, (maxLat - minLat) * 0.15);

  return [
    [minLon - padLon, minLat - padLat],
    [maxLon + padLon, maxLat + padLat],
  ];
}