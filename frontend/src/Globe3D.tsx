import React, { useEffect, useRef } from "react";
import * as Cesium from "cesium";
import "cesium/Build/Cesium/Widgets/widgets.css";
import { getGroundPlaneDataUrl, getPlaneDataUrl } from "./icons";
import type { FlightPoint } from "./types";

type Props = {
  points: FlightPoint[];
};

export default function Globe3D({ points }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<Cesium.Viewer | null>(null);
  const entitiesRef = useRef<Map<string, Cesium.Entity>>(new Map());
  const hasInitialZoomRef = useRef(false);

  useEffect(() => {
    if (!containerRef.current || viewerRef.current) return;

    const viewer = new Cesium.Viewer(containerRef.current, {
      timeline: false,
      animation: false,
      geocoder: false,
      baseLayerPicker: true,
      sceneModePicker: true,
      navigationHelpButton: false,
      homeButton: true,
      fullscreenButton: false,
      infoBox: false,
      selectionIndicator: false,
      requestRenderMode: true,
      maximumRenderTimeChange: Infinity,
      terrainProvider: new Cesium.EllipsoidTerrainProvider(),
    });

    viewer.scene.globe.depthTestAgainstTerrain = false;
    viewer.scene.globe.enableLighting = true;
    viewer.clock.shouldAnimate = false;

    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(-84.4277, 33.6407, 650000),
      orientation: {
        heading: 0,
        pitch: Cesium.Math.toRadians(-55),
        roll: 0,
      },
      duration: 0,
    });

    viewerRef.current = viewer;

    return () => {
      viewer.destroy();
      viewerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    const entityMap = entitiesRef.current;
    const entities = viewer.entities;

    for (const p of points) {
      const altitude = normalizeAltitudeMeters(p);
      const position = Cesium.Cartesian3.fromDegrees(p.lon, p.lat, altitude);

      let entity = entityMap.get(p.id);

      if (!entity) {
        entity = entities.add({
          id: p.id,
          position,
          billboard: {
            image: p.onGround
              ? getGroundPlaneDataUrl("#f59e0b")
              : getPlaneDataUrl("#67e8f9"),
            scale: p.onGround ? 0.75 : 0.85,
            verticalOrigin: Cesium.VerticalOrigin.CENTER,
            horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
            rotation: Cesium.Math.toRadians((p.track ?? 0) - 90),
            alignedAxis: Cesium.Cartesian3.UNIT_Z,
            scaleByDistance: new Cesium.NearFarScalar(50000, 1.0, 2500000, 0.45),
            translucencyByDistance: new Cesium.NearFarScalar(100000, 1.0, 3000000, 0.85),
            eyeOffset: new Cesium.Cartesian3(
              0,
              0,
              Math.max(80, Math.min(2000, altitude * 0.015))
            ),
          },
          point: {
            pixelSize: p.onGround ? 7 : 8,
            color: p.onGround
              ? Cesium.Color.fromCssColorString("#f59e0b")
              : Cesium.Color.fromCssColorString("#67e8f9"),
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 1,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
          label: {
            text: p.callsign || p.icao24,
            font: "12px sans-serif",
            showBackground: true,
            backgroundColor: Cesium.Color.fromCssColorString("#111827cc"),
            fillColor: Cesium.Color.WHITE,
            horizontalOrigin: Cesium.HorizontalOrigin.LEFT,
            pixelOffset: new Cesium.Cartesian2(10, -10),
            scale: 0.7,
            disableDepthTestDistance: 1500000,
          },
          polyline: p.onGround
            ? undefined
            : {
                positions: makeHeadingRayPositions(p, 18000),
                width: 2,
                material: Cesium.Color.fromCssColorString("#67e8f9").withAlpha(0.55),
                clampToGround: false,
              },
        });

        entityMap.set(p.id, entity);
      } else {
        entity.position = position as any;

        if (entity.billboard) {
          entity.billboard.image = (p.onGround
            ? getGroundPlaneDataUrl("#f59e0b")
            : getPlaneDataUrl("#67e8f9")) as any;
          entity.billboard.rotation = Cesium.Math.toRadians((p.track ?? 0) - 90) as any;
          entity.billboard.eyeOffset = new Cesium.Cartesian3(
            0,
            0,
            Math.max(80, Math.min(2000, altitude * 0.015))
          ) as any;
        }

        if (entity.point) {
          entity.point.color = (
            p.onGround
              ? Cesium.Color.fromCssColorString("#f59e0b")
              : Cesium.Color.fromCssColorString("#67e8f9")
          ) as any;
        }

        if (entity.label) {
          entity.label.text = (p.callsign || p.icao24) as any;
        }

        entity.polyline = p.onGround
          ? undefined
          : ({
              positions: makeHeadingRayPositions(p, 18000),
              width: 2,
              material: Cesium.Color.fromCssColorString("#67e8f9").withAlpha(0.55),
              clampToGround: false,
            } as any);
      }
    }

    const liveIds = new Set(points.map((p) => p.id));
    for (const [id, entity] of entityMap.entries()) {
      if (!liveIds.has(id)) {
        entities.remove(entity);
        entityMap.delete(id);
      }
    }

    if (!hasInitialZoomRef.current && points.length > 0) {
      flyToBounds(viewer, points);
      hasInitialZoomRef.current = true;
    }

    viewer.scene.requestRender();
  }, [points]);

  return (
    <div
      ref={containerRef}
      style={{
        height: 520,
        borderRadius: 16,
        overflow: "hidden",
      }}
    />
  );
}

function normalizeAltitudeMeters(p: FlightPoint): number {
  if (p.onGround) return 20;
  if (typeof p.alt !== "number" || !Number.isFinite(p.alt)) return 2500;
  return Math.max(250, p.alt);
}

function flyToBounds(viewer: Cesium.Viewer, points: FlightPoint[]) {
  if (!points.length) return;

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

  const padLon = Math.max(0.15, (maxLon - minLon) * 0.25);
  const padLat = Math.max(0.12, (maxLat - minLat) * 0.25);

  const rect = Cesium.Rectangle.fromDegrees(
    minLon - padLon,
    minLat - padLat,
    maxLon + padLon,
    maxLat + padLat
  );

  viewer.camera.flyTo({
    destination: rect,
    duration: 1.2,
  });
}

function makeHeadingRayPositions(
  p: FlightPoint,
  distanceMeters: number
): Cesium.Cartesian3[] {
  const startAlt = normalizeAltitudeMeters(p);
  const end = projectForwardWgs84(
    p.lat,
    p.lon,
    p.track ?? 0,
    distanceMeters / 1000
  );

  return [
    Cesium.Cartesian3.fromDegrees(p.lon, p.lat, startAlt),
    Cesium.Cartesian3.fromDegrees(end.lon, end.lat, startAlt),
  ];
}

function projectForwardWgs84(
  latDeg: number,
  lonDeg: number,
  bearingDeg: number,
  distKm: number
) {
  const R = 6371;
  const phi1 = (latDeg * Math.PI) / 180;
  const lambda1 = (lonDeg * Math.PI) / 180;
  const theta = (bearingDeg * Math.PI) / 180;
  const delta = distKm / R;

  const sinPhi2 =
    Math.sin(phi1) * Math.cos(delta) +
    Math.cos(phi1) * Math.sin(delta) * Math.cos(theta);
  const phi2 = Math.asin(sinPhi2);

  const y = Math.sin(theta) * Math.sin(delta) * Math.cos(phi1);
  const x = Math.cos(delta) - Math.sin(phi1) * sinPhi2;
  const lambda2 = lambda1 + Math.atan2(y, x);

  const lat = (phi2 * 180) / Math.PI;
  const lon = (((lambda2 * 180) / Math.PI + 540) % 360) - 180;
  return { lat, lon };
}