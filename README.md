# DAPS Frontend

3D galaxy console for the Deep Space Archival and Positioning System: a
React 19 + TypeScript app rendered with `@react-three/fiber` / drei, styled
with Tailwind 4, and driven by a Zustand store that talks to the FastAPI +
Qiskit backend on `http://127.0.0.1:8001`.

## Prerequisites

```bash
# backend (from the repository root)
.venv/bin/uvicorn main:app --host 127.0.0.1 --port 8001
```

The backend CORS policy allows any `localhost` / `127.0.0.1` origin, so no dev
proxy is configured. To point the app at a different API location, set
`VITE_API_BASE_URL` in `frontend/.env.local`.

## Run

```bash
npm install
npm run dev        # http://localhost:5173
```

## Checks

```bash
npm run typecheck  # tsc --noEmit
npm run build      # typecheck + production bundle
npm run preview    # serve the production bundle
```

## Layout

| Path | Role |
| --- | --- |
| `src/App.tsx` | full-screen `Canvas`, vignette, HUD mount, data polling |
| `src/store.ts` | Zustand store — catalogue/hazard fetch, flight plan, route |
| `src/lib/scene.ts` | ly → scene-unit scaling, colours, hazard visuals |
| `src/components/GalaxyScene.tsx` | scene graph, constrained `OrbitControls`, route line |
| `src/components/CelestialMap.tsx` | instanced stars/planets, Sgr A* marker, picking |
| `src/components/HazardZones.tsx` | pulsing translucent hazard spheres |
| `src/components/NavigationHUD.tsx` | glassmorphism controls + route/quantum readout |
