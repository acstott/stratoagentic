import React, { useEffect, useRef } from "react";
import * as Cesium from "cesium";
import "cesium/Build/Cesium/Widgets/widgets.css";

import type { FlightPoint } from "./types";
import { getPlaneDataUrl } from "./icons";
import {
  ATL,
  classifyFlight,
  FLIGHT_COLORS,
  globeCenteredAltitudeMeters,
  globeVectorLengthMeters,
  normalizeAltitudeMeters,
  projectForwardWgs84,
  vectorEndAltitudeMeters,
  type FlightCategory,
} from "./flightStyle";

type Props = {
  points: FlightPoint[];
};

type OverlayState = {
  dataSource: Cesium.CustomDataSource;
};

export default function Globe3D({ points }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<Cesium.Viewer | null>(null);
  const overlayRef = useRef<OverlayState | null>(null);

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

    const dataSource = new Cesium.CustomDataSource("flight-vectors");
    viewer.dataSources.add(dataSource);

    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(
        ATL.lon,
        ATL.lat,
        globeCenteredAltitudeMeters()
      ),
      orientation: {
        heading: 0,
        pitch: Cesium.Math.toRadians(-42),
        roll: 0,
      },
      duration: 0,
    });

    viewerRef.current = viewer;
    overlayRef.current = { dataSource };

    viewer.scene.requestRender();

    return () => {
      viewer.dataSources.remove(dataSource, true);
      overlayRef.current = null;
      viewer.destroy();
      viewerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const viewer = viewerRef.current;
    const overlay = overlayRef.current;
    if (!viewer || !overlay) return;

    syncCesiumVectors(overlay.dataSource, points);
    viewer.scene.requestRender();
  }, [points]);

  return (
    <div
      ref={containerRef}
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        overflow: "hidden",
      }}
    />
  );
}

function syncCesiumVectors(
  dataSource: Cesium.CustomDataSource,
  points: FlightPoint[]
) {
  const entities = dataSource.entities;
  entities.removeAll();

  addAtlRing(entities);

  for (const p of points) {
    const category = classifyFlight(p);

    if (category === "parked") {
      addParkedPlaneEntity(entities, p);
      continue;
    }

    addVectorEntity(entities, p, category);
    addPlaneBillboardEntity(entities, p, category);
  }
}

function addVectorEntity(
  entities: Cesium.EntityCollection,
  p: FlightPoint,
  category: FlightCategory
) {
  const positions = buildVectorPositions(p, category);
  const color = Cesium.Color.fromCssColorString(FLIGHT_COLORS[category]);

  entities.add({
    id: `${p.id}-vector`,
    polyline: {
      positions,
      width: category === "arrival" ? 2.5 : 3.0,
      material: color.withAlpha(category === "arrival" ? 0.95 : 0.88),
      clampToGround: false,
      arcType: Cesium.ArcType.NONE,
    },
  });
}

function addPlaneBillboardEntity(
  entities: Cesium.EntityCollection,
  p: FlightPoint,
  category: FlightCategory
) {
  const startAltitude = normalizeAltitudeMeters(p.alt, p.onGround);
  const image = getPlaneDataUrl(FLIGHT_COLORS[category]);

  entities.add({
    id: `${p.id}-plane`,
    position: Cesium.Cartesian3.fromDegrees(p.lon, p.lat, startAltitude),
    billboard: {
      image,
      scale: 0.55,
      verticalOrigin: Cesium.VerticalOrigin.CENTER,
      horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
      rotation: Cesium.Math.toRadians((p.track ?? 0) - 90),
    },
  });
}

function addParkedPlaneEntity(
  entities: Cesium.EntityCollection,
  p: FlightPoint
) {
  entities.add({
    id: `${p.id}-parked`,
    position: Cesium.Cartesian3.fromDegrees(p.lon, p.lat, 0),
    billboard: {
      image: getPlaneDataUrl(FLIGHT_COLORS.parked),
      scale: 0.5,
      verticalOrigin: Cesium.VerticalOrigin.CENTER,
      horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
      rotation: Cesium.Math.toRadians((p.track ?? 0) - 90),
    },
  });
}

function buildVectorPositions(
  p: FlightPoint,
  category: FlightCategory
): Cesium.Cartesian3[] {
  const startAlt = normalizeAltitudeMeters(p.alt, p.onGround);
  const endAlt = vectorEndAltitudeMeters(startAlt, category);
  const lengthMeters = globeVectorLengthMeters(p, category);

  const endWgs84 = projectForwardWgs84(
    p.lat,
    p.lon,
    p.track ?? 0,
    lengthMeters / 1000
  );

  return [
    Cesium.Cartesian3.fromDegrees(p.lon, p.lat, startAlt),
    Cesium.Cartesian3.fromDegrees(endWgs84.lon, endWgs84.lat, endAlt),
  ];
}

function addAtlRing(entities: Cesium.EntityCollection) {
  const ringPositions = buildAtlRingPositions({
    centerLat: ATL.lat,
    centerLon: ATL.lon,
    radiusKm: 10,
    heightMeters: 120,
    samples: 96,
  });

  entities.add({
    id: "atl-ring",
    polyline: {
      positions: ringPositions,
      width: 1.5,
      material: Cesium.Color.fromCssColorString("#94a3b8").withAlpha(0.22),
      clampToGround: false,
      arcType: Cesium.ArcType.NONE,
    },
  });
}

function buildAtlRingPositions(args: {
  centerLat: number;
  centerLon: number;
  radiusKm: number;
  heightMeters: number;
  samples: number;
}): Cesium.Cartesian3[] {
  const { centerLat, centerLon, radiusKm, heightMeters, samples } = args;
  const positions: Cesium.Cartesian3[] = [];

  for (let i = 0; i <= samples; i += 1) {
    const bearing = (i / samples) * 360;
    const pt = projectForwardWgs84(centerLat, centerLon, bearing, radiusKm);
    positions.push(
      Cesium.Cartesian3.fromDegrees(pt.lon, pt.lat, heightMeters)
    );
  }

  return positions;
}