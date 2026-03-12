import React, { useEffect, useMemo, useState } from "react";
import Globe3D from "./Globe3D";
import Map2D from "./Map2D";
import RasterView from "./RasterView";
import { useInterpolatedFlights } from "./useInterpolatedFlights";
import { connectSnapshotStream } from "./ws";
import type { FlightPoint, Snapshot, StateVector } from "./types";

type ViewMode = "map2d" | "globe" | "raster";

export default function App() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [status, setStatus] = useState("connecting");
  const [view, setView] = useState<ViewMode>("map2d");

  useEffect(() => {
    let closed = false;

    fetch("/api/flights/latest")
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data: Snapshot) => {
        if (closed) return;
        setSnapshot(data);
        setStatus("connected");
      })
      .catch((err) => {
        console.warn("initial snapshot fetch failed", err);
      });

    const ws = connectSnapshotStream((data) => {
      if (closed) return;
      setSnapshot(data);
      setStatus("connected");
    });

    const prevOnClose = ws.onclose;
    ws.onclose = (ev) => {
      prevOnClose?.call(ws, ev);
      if (!closed) setStatus("disconnected");
    };

    const prevOnError = ws.onerror;
    ws.onerror = (ev) => {
      prevOnError?.call(ws, ev);
      if (!closed) setStatus("error");
    };

    return () => {
      closed = true;
      ws.close();
    };
  }, []);

  const rawPoints: FlightPoint[] = useMemo(() => {
    const flights = snapshot?.flights ?? [];

    return flights
      .filter(
        (f: StateVector) =>
          typeof f.latitude === "number" && typeof f.longitude === "number"
      )
      .map((f: StateVector) => ({
        id: f.icao24,
        icao24: f.icao24,
        callsign: (f.callsign ?? "").trim(),
        country: f.origin_country,
        lat: f.latitude as number,
        lon: f.longitude as number,
        onGround: f.on_ground,
        alt: f.geo_altitude ?? f.baro_altitude,
        vel: f.velocity,
        track: f.true_track,
      }));
  }, [snapshot]);

  const points = useInterpolatedFlights({
    points: rawPoints,
    durationMs: 1200,
  });

  const airborneCount = useMemo(
    () => rawPoints.filter((p) => !p.onGround).length,
    [rawPoints]
  );

  return (
    <div style={styles.page}>
      <div style={styles.shell}>
        <header style={styles.header}>
          <h1 style={styles.title}>StratoAgentic (ATL) — Live State Vectors</h1>
          <div style={styles.subtleRow}>
            <span>
              Status: <strong>{status}</strong>
            </span>
            {snapshot && (
              <>
                <span>|</span>
                <span>OpenSky time: {snapshot.time}</span>
                <span>|</span>
                <span>Last update: {formatRelative(snapshot.updatedAt)}</span>
              </>
            )}
          </div>
        </header>

        <section style={styles.metricsRow}>
          <div style={styles.metricCard}>
            <div style={styles.metricLabel}>Total in bbox</div>
            <div style={styles.metricValue}>{rawPoints.length}</div>
          </div>

          <div style={styles.metricCard}>
            <div style={styles.metricLabel}>Airborne</div>
            <div style={styles.metricValue}>{airborneCount}</div>
          </div>

          <div style={styles.metricCard}>
            <div style={styles.metricLabel}>BBox (lamin, lamax, lomin, lomax)</div>
            <div style={styles.metricSmall}>33.2 , 34.3 , -85.3 , -83.7</div>
          </div>
        </section>

        <section style={styles.panel}>
          <div style={styles.toolbar}>
            <div style={styles.toolbarLeft}>
              <span style={styles.toolbarLabel}>View:</span>

              <button
                onClick={() => setView("map2d")}
                disabled={view === "map2d"}
                style={{
                  ...styles.toggleBtn,
                  ...(view === "map2d" ? styles.toggleBtnActive : {}),
                }}
              >
                2D Map
              </button>

              <button
                onClick={() => setView("globe")}
                disabled={view === "globe"}
                style={{
                  ...styles.toggleBtn,
                  ...(view === "globe" ? styles.toggleBtnActive : {}),
                }}
              >
                3D Globe
              </button>

              <button
                onClick={() => setView("raster")}
                disabled={view === "raster"}
                style={{
                  ...styles.toggleBtn,
                  ...(view === "raster" ? styles.toggleBtnActive : {}),
                }}
              >
                Tiles Raster
              </button>
            </div>

            <div style={styles.toolbarRight}>
              <span style={styles.subtleText}>
                Rendering: {points.length} positions
              </span>
            </div>
          </div>

          <div style={styles.mapFrame}>
            {!snapshot ? (
              <div style={styles.loadingBox}>
                Waiting for flight positions…
                <div style={styles.loadingSubtext}>
                  Backend WS endpoint is /stream.
                </div>
              </div>
            ) : view === "globe" ? (
              <Globe3D points={points} />
            ) : view === "raster" ? (
              <RasterView points={points} />
            ) : (
              <Map2D points={points} />
            )}
          </div>
        </section>

        <section style={styles.panel}>
          <div style={styles.tableHeader}>Live sample (first 200)</div>

          <div style={styles.tableWrap}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Callsign</th>
                  <th style={styles.th}>ICAO24</th>
                  <th style={styles.th}>Country</th>
                  <th style={styles.th}>Lat</th>
                  <th style={styles.th}>Lon</th>
                  <th style={styles.th}>Alt(m)</th>
                  <th style={styles.th}>Vel(m/s)</th>
                  <th style={styles.th}>Track</th>
                  <th style={styles.th}>On ground</th>
                </tr>
              </thead>
              <tbody>
                {rawPoints.slice(0, 200).map((p) => (
                  <tr key={p.id}>
                    <td style={styles.td}>{p.callsign || "—"}</td>
                    <td style={styles.td}>{p.icao24}</td>
                    <td style={styles.td}>{p.country}</td>
                    <td style={styles.td}>{fmt(p.lat)}</td>
                    <td style={styles.td}>{fmt(p.lon)}</td>
                    <td style={styles.td}>{fmtNullable(p.alt)}</td>
                    <td style={styles.td}>{fmtNullable(p.vel)}</td>
                    <td style={styles.td}>{fmtNullable(p.track)}</td>
                    <td style={styles.td}>{String(p.onGround)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}

function fmt(n: number): string {
  return n.toFixed(3);
}

function fmtNullable(n: number | null): string {
  return typeof n === "number" ? n.toFixed(1) : "-";
}

function formatRelative(iso: string): string {
  const t = new Date(iso).getTime();
  const diffSec = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (diffSec < 60) return `${diffSec}s ago`;
  const min = Math.round(diffSec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  return `${hr}h ago`;
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    background:
      "linear-gradient(180deg, #0b1020 0%, #111827 45%, #0b1020 100%)",
    color: "#e5e7eb",
    fontFamily:
      'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    padding: "24px",
  },
  shell: {
    maxWidth: "1280px",
    margin: "0 auto",
  },
  header: {
    marginBottom: "16px",
  },
  title: {
    margin: 0,
    fontSize: "24px",
    fontWeight: 800,
    color: "#f3f4f6",
  },
  subtleRow: {
    display: "flex",
    gap: "8px",
    alignItems: "center",
    marginTop: "10px",
    color: "#9ca3af",
    fontSize: "14px",
    flexWrap: "wrap",
  },
  metricsRow: {
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    gap: "12px",
    marginBottom: "12px",
  },
  metricCard: {
    background: "rgba(17, 24, 39, 0.82)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: "14px",
    padding: "14px 16px",
    boxShadow: "0 10px 30px rgba(0,0,0,0.22)",
  },
  metricLabel: {
    color: "#9ca3af",
    fontSize: "14px",
    marginBottom: "6px",
  },
  metricValue: {
    color: "#e5e7eb",
    fontSize: "20px",
    fontWeight: 800,
  },
  metricSmall: {
    color: "#d1d5db",
    fontSize: "13px",
    fontWeight: 600,
  },
  panel: {
    background: "rgba(17, 24, 39, 0.82)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: "14px",
    padding: "12px",
    boxShadow: "0 10px 30px rgba(0,0,0,0.22)",
    marginBottom: "12px",
  },
  toolbar: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "12px",
    marginBottom: "10px",
    flexWrap: "wrap",
  },
  toolbarLeft: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    flexWrap: "wrap",
  },
  toolbarRight: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
  },
  toolbarLabel: {
    color: "#9ca3af",
    fontSize: "14px",
  },
  subtleText: {
    color: "#9ca3af",
    fontSize: "14px",
  },
  toggleBtn: {
    background: "#374151",
    color: "#e5e7eb",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: "10px",
    padding: "8px 14px",
    cursor: "pointer",
    fontWeight: 600,
  },
  toggleBtnActive: {
    background: "#4b5563",
  },
  mapFrame: {
    borderRadius: "14px",
    overflow: "hidden",
  },
  loadingBox: {
    minHeight: "520px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "column",
    color: "#d1d5db",
    background: "#0f172a",
  },
  loadingSubtext: {
    marginTop: "8px",
    color: "#9ca3af",
    fontSize: "14px",
  },
  tableHeader: {
    color: "#f3f4f6",
    fontWeight: 700,
    fontSize: "16px",
    marginBottom: "12px",
  },
  tableWrap: {
    overflowX: "auto",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: "13px",
  },
  th: {
    textAlign: "left",
    color: "#d1d5db",
    borderBottom: "1px solid rgba(255,255,255,0.08)",
    padding: "10px 8px",
    whiteSpace: "nowrap",
  },
  td: {
    color: "#e5e7eb",
    borderBottom: "1px solid rgba(255,255,255,0.05)",
    padding: "10px 8px",
    whiteSpace: "nowrap",
  },
};