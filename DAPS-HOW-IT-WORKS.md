# DAPS — Deep Space Archival and Positioning System

**NASA Space Apps Challenge — technical write-up**
*Everything below is written so it can be pasted into Gemini (or any document tool) and laid out as a polished PDF.*

---

## 1. What DAPS is, in one paragraph

DAPS is a deep-space navigation console. It renders a catalogue of **91 celestial bodies** (stars, exoplanets, the galactic centre) and **9 live hazard zones** on a 3D galactic grid anchored at **Sagittarius A\***, lets the user pick a departure point and a destination (from dropdowns *or* by clicking a star in space), and returns a **hazard-cleared flight path** whose waypoint selection is performed by a **Qiskit amplitude-amplification circuit running on the local Aer simulator**. The answer comes back as a glowing trajectory in 3D, a turn-by-turn step list, relativistic travel time from **Voyager-class speeds up to the speed of light**, and a full quantum telemetry readout — all in a calm, Google-Maps-style dark-space interface.

---

## 2. The problem it solves

Interstellar route planning is a constrained shortest-path problem:

- The direct line between two stars frequently cuts through a hazard volume (solar flare corridors, radiation belts, gamma-ray burst paths, micro-meteoroid storms, black-hole jets).
- The number of candidate waypoint combinations grows combinatorially.
- Every hazard constraint is a sphere-intersection test, so feasibility is cheap to *check* but expensive to *search*.

DAPS brute-forces a coarse candidate set, encodes it into **4 qubits (16 candidate routes)**, marks the feasible ones with a phase oracle, and uses **quantum amplitude amplification** with a **cost-biased initial state** to boost the probability of measuring a short, safe route. A classical repair pass then polishes the result, and a safety audit re-verifies the final path against every hazard sphere before it is ever shown.

---

## 3. Architecture

```
┌────────────────────────────────────────────────────────────────────┐
│  BROWSER — React 18 + TypeScript + Vite + Tailwind + Zustand       │
│                                                                    │
│  App.tsx ── full-screen <Canvas> (react-three-fiber)               │
│     ├─ GalaxyScene   restricted orbit controls, stars, route line  │
│     ├─ CelestialMap  InstancedMesh stars, Sgr A*, click → route    │
│     ├─ HazardZones   pulsing translucent danger spheres           │
│     ├─ NavigationHUD Google-Maps-style white cards overlay        │
│     └─ GalacticPanel collapsible right-docked 2D star map          │
│                                                                    │
│  store.ts — Zustand: all state + all Axios calls (one place)       │
└───────────────▲────────────────────────────────────────────────────┘
                │  Axios (JSON, CORS, localhost:8001)
┌───────────────┴────────────────────────────────────────────────────┐
│  SERVER — FastAPI (Python 3.11)                                    │
│                                                                    │
│  GET  /api/v1/map        → SPHEREx-mock catalogue (91 bodies)      │
│  GET  /api/v1/hazards    → live hazard field (9 zones, drifts)     │
│  POST /api/v1/navigate   → quantum-planned route                  │
│  GET  /api/v1/health     → readiness + quantum backend status     │
│                                                                    │
│  celestial_engine.py   catalogue + hazard field (astropy frames)   │
│  quantum_router.py     Qiskit Aer amplitude amplification         │
│  models.py             Pydantic contracts shared with the UI      │
└────────────────────────────────────────────────────────────────────┘
```

**Data flow for one route request:**

1. User picks A/B (or clicks a star → `selectDestination` fills B) and presses **Plot course**.
2. `store.ts` POSTs `{ start_id, end_id, speed_mode }` to `/api/v1/navigate`.
3. Backend generates a coarse set of candidate waypoint paths (≤ 16, ≤ 10 waypoints each).
4. Each candidate is tested against every hazard sphere → feasible set + cost (total length in light-years).
5. Quantum stage: 4-qubit circuit, cost-biased state prep → phase oracle over feasible routes → generalized Grover reflection → 2,048 shots on Aer (fixed seed for reproducibility).
6. Most frequent feasible bitstring selects the winning route; a deterministic **repair pass** pushes any surviving corner out of hazard spheres (≤ 60 bounded iterations).
7. Safety audit recomputes clearance margins and assigns a status: `optimal`, `compromised`, or `unreachable`, plus human-readable warnings.
8. Travel time is computed for the chosen speed mode with relativistic time dilation.
9. Response returns waypoints + quantum telemetry; the UI draws the blue trajectory, builds the step list, and fills the telemetry panel.

---

## 4. The quantum part (exact mechanics)

| Setting | Value |
|---|---|
| Qubits | 4 → **16 candidate routes** |
| Shots | 2,048 (Aer statevector sampling, seed `20261023`) |
| Marked set cap | 6 (keeps circuit depth modest) |
| Max Grover iterations | 3 (adaptive, see below) |
| Backend | `qiskit-aer` local simulator — **no hardware queue, ~10 ms** |
| Fallback | if Aer is missing → classical argmin over the same feasible set, with a warning; correctness is unchanged |

**How the circuit works — not textbook Grover:**

1. **Cost-biased initial state.** A `StatePreparation` gate loads amplitudes weighted by *inverse cost*, so short routes start with more amplitude than long ones.
2. **Phase oracle.** Feasible routes (clear of every hazard) get their phase flipped — infeasible ones are untouched.
3. **Generalized reflection.** The diffusion operator reflects about the *prepared* state (state-prep → X-all → phase-kickback → inverse state-prep), which is the correct amplitude-amplification reflection for a non-uniform initial distribution.
4. **Iteration count.** With `θ = asin(√marked_mass)` from the prepared amplitudes, iterations are `clamp(round(π/(4θ) − 0.5), 1, 3)` — the exact angle that rotates the marked amplitude to ~90°, capped so depth stays small.
5. **Measurement.** 2,048 shots → histogram → the **most frequent feasible bitstring** is decoded to a route index; its probability is reported as `chosen_probability`.

The UI surfaces all of it live: `qubits · candidates · feasible · grover iterations · shots · chosen P · circuit depth · sim time · bitstring`.

---

## 5. Physics & safety model

- **Coordinate frame:** galactocentric, origin at Sagittarius A\*, units in light-years. Real anchor stars are placed with astropy's ICRS→galactic transformations, so the Sun sits at ≈ −26,490 ly on the galactic x-axis.
- **Hazards** are translucent spheres with center, radius, intensity, severity (`low…extreme`) and detection/expiry timestamps. The field drifts hourly — the UI re-polls every 60 s (catalogue every 5 min).
- **Safety audit:** for each segment, distance from every hazard centre is compared to radius + clearance margin. Reported per route: minimum clearance, hazards avoided, hazards crossed, and warnings (e.g. "destination is inside Sgr A\* Core Radiation Zone; the final 150.93 ly is the unavoidable approach stub and is exempt").
- **Speed modes (Voyager → c):** Voyager 1 17 km/s · Parker Solar Probe 163 km/s · Fusion ramjet 0.05 c · Antimatter torch 0.5 c · Speed of light 1.0 c. Travel time uses γ for the ship clock (`time_human_ship`) alongside coordinate time; non-relativistic modes report plain kinematics.
- **Honesty note:** the catalogue is a labelled mock (`source: SPHEREx-MOCK`) built on real star positions, and hazard radii are exaggerated visually in the 3D scene (the HUD always reports the true light-year values).

---

## 6. Frontend, file by file

| File | Responsibility |
|---|---|
| `App.tsx` | Full-screen react-three-fiber `Canvas`, vignette, HUD + panel mount, initial fetch + polling |
| `store.ts` | **All state and all network calls**: bodies, hazards, A/B endpoints, speed mode, route, errors, panel open, zoom commands; Axios to `127.0.0.1:8001`; error normalization from FastAPI |
| `components/GalaxyScene.tsx` | Ambient + hemisphere lighting, `Stars` backdrop, **restricted OrbitControls** (no pan, bounded zoom, polar limits — you can't lose the galaxy), Google-blue glowing route line (drei `Line`) with a travelling pulse, camera zoom controller wired to the +/− buttons |
| `components/CelestialMap.tsx` | `InstancedMesh` stars/exoplanets tinted by spectral class (O→M), **Sagittarius A\* highlighted at (0, 0, 0)** with pulsing rings, `onClick` raycasting → auto-fills the destination |
| `components/HazardZones.tsx` | Translucent `MeshStandardMaterial` spheres, deep orange/red (violet for black-hole jets), slow sine pulse on opacity and scale |
| `components/NavigationHUD.tsx` | The Google-Maps-style overlay (see §7) |
| `components/GalacticPanel.tsx` | Right-docked, closable **2D top-down galactic map** (see §7) |
| `lib/scene.ts` | Scene scale (1 unit = 1,000 ly), spectral palette, marker sizes, hazard radius clamping |

---

## 7. The interface — "Google Maps, but for the galaxy"

The UI was deliberately built from Google's design system rather than generic "sci-fi HUD" tropes:

- **Type:** Roboto (with Google Sans/Product Sans first if installed) loaded from Google Fonts; 14 px body, 22 px blue travel time.
- **Cards:** pure white, 8 px radius, Material elevation shadows (`0 1px 3px rgba(60,64,67,.3), 0 4px 8px 3px rgba(60,64,67,.15)`), floating over the dark map — exactly Maps' chrome.
- **Palette:** Google blue `#1a73e8`, ink `#202124`, secondary `#5f6368`, hairline `#e8eaed`, green `#0f9d58`, red `#d93025`, amber `#f9ab00`, hover `#f1f3f4`.

**Left column (top):** the *Directions* card — green **A** / red **B** markers with a connector rail, Maps-style selects with chevrons, a swap button, five transport-style speed chips (Voyager · Parker · Fusion · Antimatter · Speed) and the blue **Plot course** button.

**Left column (results):** big blue travel time, `26,859 ly via 6 waypoints · Fusion ramjet`, an *Optimal/Compromised* status pill, then a **turn-by-turn step list** with circular icons and connectors (Depart Sol → Continue to waypoint n → Clear <hazard> → Arrive Sagittarius A\*), a hazard list with avoided/crossed states, warnings, and a collapsible **Quantum telemetry** disclosure.

**Corners:** top-right *Live · 91 objects · 9 hazards* pill; bottom-right stacked **+ / − zoom** buttons (actually driving the 3D camera) plus a **2D map** button when the panel is closed; bottom-left Google-style attribution line; bottom-center a pill showing the hovered star with its spectral class and distance from Sol.

**Right dock:** the **Galactic map** panel — white Maps-style side panel with a dark SVG star map inside: 10,000-ly grid, hazard circles, the blue route polyline with glow, **A/B endpoint markers**, the labelled galactic centre, hover labels, and click-to-set-destination on any star. The X closes it (state persists in the store) and the map returns via the 2D button.

---

## 8. Sample result (live run)

| Field | Value |
|---|---|
| Route | Sol → Sagittarius A\* (fusion ramjet 0.05 c) |
| Distance | 26,859 ly (via 6 waypoints) |
| Travel time | **537.2 thousand yr** |
| Status | Optimal |
| Hazards avoided | Corridor Anomaly 32, Corridor Anomaly 55, Solar Flare Corridor |
| Minimum clearance | 0.405 ly |
| Quantum | 4 qubits · 16 candidates · adaptive Grover iterations · 2,048 shots · Aer ~10 ms |

A second live check (Sol → Tau Ceti) returned `optimal`, 11.91 ly, ~238 yr — the whole loop runs in tens of milliseconds server-side.

---

## 9. Running it

```bash
# backend (Python 3.11+)
pip install -r requirements.txt
uvicorn main:app --reload --port 8001     # docs at http://127.0.0.1:8001/docs

# frontend
cd frontend && npm install && npm run dev  # http://localhost:5173
```

Verified: `npm run typecheck` ✓ · `npm run build` ✓ · browser end-to-end against the live API ✓ (route plotting, dropdown switching, panel toggle, zoom).

---

## 10. Why it stands out

1. **The quantum step is real, not decorative** — a genuine cost-biased amplitude-amplification circuit with a derived iteration count, deterministic seed, and honest telemetry (including a graceful classical fallback).
2. **Safety is enforced twice** — the oracle only marks feasible routes, and a post-hoc audit re-verifies clearance before rendering, with explicit warnings when geometry forces an exemption.
3. **Familiar UI for an unfamiliar domain** — Google Maps conventions (A/B directions, turn-by-turn steps, side map panel) make interstellar route planning immediately legible to a first-time viewer.
4. **Honest data provenance** — mock-but-labelled SPHEREx catalogue on real astropy frames; every exaggeration in the visuals is disclosed while the numbers stay true.