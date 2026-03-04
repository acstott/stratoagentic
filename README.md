
**StratoAgentic** is a geospatial visualization prototype for monitoring
aircraft telemetry within a defined airspace region

The system demonstrates techniques commonly used in large-scale
geospatial and simulation platforms, including:

-   **AOI-scoped data streaming**
-   **Zoom-gated rendering on a 3D globe**
-   **Real-time telemetry ingestion**
-   **Server-side geospatial APIs**
-   **3D geospatial visualization using Cesium**

The application renders aircraft activity near **Atlanta
Hartsfield--Jackson International Airport (ATL)** on a 3D globe using
**Cesium**, with **Go backend** to aggregate and normalise flight
telemetry data

This project is a **portfolio demonstration for geospatial
infrastructure engineering** of how to efficiently visualise 
distributed telemetry systems via modern web and cloud-native tooling

------------------------------------------------------------------------

# Architecture Overview

StratoAgentic comprises full stack:

    stratoagentic/
    │
    ├── web/        # React + Webpack + Cesium frontend
    │
    ├── server/     # Go API service
    │
    └── README.md

### Frontend

The frontend is built with:

-   **React**
-   **CesiumJS**
-   **Webpack**
-   **TypeScript**

Features:

-   Rendering a **3D globe**
-   Constraining the camera to an **Area of Interest (AOI)** around ATL
-   Loading aircraft overlays only when zoomed sufficiently close
-   Displaying aircraft positions and trails
-   Polling the backend for updated telemetry

### Backend

The backend is written in **Go** and provides:

-   Flight telemetry ingestion
-   Data normalization
-   API endpoints for the frontend

Example endpoints:

    /api/healthz
    /api/flights

The backend proxies and / or ingests data from:

-   OpenSky Network
-   Sample telemetry datasets

------------------------------------------------------------------------

# Key Concepts Demonstrated

### AOI-Scoped Rendering

Rather than attempting to render global datasets, StratoAgentic focuses
on a **specific geographic region**:

**Atlanta Hartsfield--Jackson International Airport (ATL)**

Restricting the rendering region drastically improves performance and
keeps the visualization focused

### Zoom-Gated Data Loading

Aircraft data is only requested when the user zooms close enough to the
area of interest

Example logic:

-   **Zoomed out:** no aircraft rendered
-   **Zoomed in:** aircraft entities are loaded and updated periodically

This pattern prevents unnecessary network requests and keeps rendering
efficient.

### Streaming Telemetry Visualization

Aircraft states are polled periodically and mapped into Cesium entities:

-   position
-   altitude
-   heading
-   velocity

Short trails are maintained for visual realism

------------------------------------------------------------------------

# Technology Stack

Frontend

-   React
-   CesiumJS
-   TypeScript
-   Webpack

Backend

-   Go
-   REST API

Geospatial Concepts

-   WGS84 coordinates
-   Bounding box queries
-   AOI (Area of Interest) rendering
-   Real-time telemetry visualization

------------------------------------------------------------------------

# Project Structure 

```
stratoagentic/
├─ README.md
├─ .gitignore
├─ .env.example
├─ docker-compose.yml
│
├─ backend/
│  ├─ Dockerfile
│  ├─ go.mod
│  ├─ go.sum
│  ├─ cmd/
│  │  └─ api/
│  │     └─ main.go
│  ├─ internal/
│  │  ├─ config/
│  │  │  └─ config.go
│  │  ├─ db/
│  │  │  ├─ db.go
│  │  │  └─ migrate.go
│  │  ├─ httpapi/
│  │  │  ├─ router.go
│  │  │  └─ ws.go
│  │  ├─ opensky/
│  │  │  ├─ client.go
│  │  │  └─ models.go
│  │  └─ stream/
│  │     ├─ hub.go
│  │     └─ poller.go
│  └─ migrations/
│     └─ 001_init.sql
│
└─ frontend/
   ├─ Dockerfile
   ├─ package.json
   ├─ package-lock.json
   ├─ tsconfig.json
   ├─ webpack.config.ts
   ├─ public/
   │  └─ index.html
   └─ src/
      ├─ index.tsx
      ├─ App.tsx
      ├─ api.ts
      ├─ types.ts
      └─ styles.css
```

# Running the Project

## Backend

    cd server
    go run main.go

The API will start on:

    http://localhost:8080

------------------------------------------------------------------------

## Frontend

    cd web
    npm install
    npm run dev

Open:

    http://localhost:3000

------------------------------------------------------------------------

# Future Enhancements

Potential improvements include:

-   3D aircraft models
-   Flight trajectory prediction
-   Vector tile support for large telemetry datasets
-   Historical flight playback
-   Multi-airport monitoring
-   Integration with GeoServer / PostGIS

------------------------------------------------------------------------

# Project Motivation

StratoAgentic explores how **distributed telemetry systems operating in
atmospheric environments** can be visualized in real time.

While this prototype focuses on aircraft near ATL, the architecture
could support:

-   UAV / drone monitoring
-   satellite telemetry
-   logistics and mobility networks
-   simulation environments

------------------------------------------------------------------------

# License

This project is licensed under the **MIT License** (see LICENSE file for more details)
