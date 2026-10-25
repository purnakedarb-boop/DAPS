import axios from 'axios';
import { create } from 'zustand';

/**
 * Base URL of the DAPS FastAPI backend.
 *
 * Override with VITE_API_BASE_URL (e.g. in frontend/.env.local) when the API
 * runs somewhere other than the hackathon default.
 */
export const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8001'
).replace(/\/$/, '');

const api = axios.create({ baseURL: API_BASE_URL, timeout: 20_000 });

const HAZARD_POLL_MS = 60_000; // hazards drift hourly; a minute is plenty
const CATALOG_POLL_MS = 300_000; // the star field is static

// ---------------------------------------------------------------------------
// API types — kept in sync with the backend Pydantic models
// ---------------------------------------------------------------------------
export type BodyType = 'star' | 'planet' | 'exoplanet' | 'exotic';
export type HazardType =
  | 'solar_flare'
  | 'radiation_belt'
  | 'gamma_ray_burst'
  | 'micro_meteoroid_storm'
  | 'bh_jet';
export type Severity = 'low' | 'moderate' | 'high' | 'extreme';
export type SpeedMode = 'voyager' | 'parker' | 'fusion_ramjet' | 'antimatter' | 'c';
export type RouteStatus = 'optimal' | 'compromised' | 'unreachable';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface CelestialBody {
  id: string;
  catalog_id: string;
  name: string;
  body_type: BodyType;
  spectral_class: string | null;
  coordinates: Vec3;
  distance_from_sol_ly: number;
  distance_from_sgr_a_ly: number;
  has_exoplanet: boolean;
  habitability_score: number;
  infrared_magnitude: number;
  source: 'SPHEREx-MOCK' | 'REAL-CATALOG';
  notes: string | null;
}

export interface HazardZone {
  id: string;
  name: string;
  hazard_type: HazardType;
  center: Vec3;
  radius_ly: number;
  intensity: number;
  severity: Severity;
  active: boolean;
  detected_at: string;
  expires_at: string | null;
  source: string;
}

export interface TravelEstimate {
  speed_mode: string;
  label: string;
  speed_km_s: number;
  beta: number;
  gamma: number | null;
  time_years: number;
  time_ship_years: number;
  time_seconds: number;
  time_human: string;
  time_human_ship: string;
}

export interface SafetyReport {
  clearance_margin_ly: number;
  min_clearance_ly: number | null;
  hazards_avoided: string[];
  hazards_crossed: string[];
  origin_in_hazard: boolean;
  destination_in_hazard: boolean;
  compromised: boolean;
}

export interface QuantumStateCount {
  bitstring: string;
  path_index: number;
  cost_ly: number;
  feasible: boolean;
  probability: number;
  counts: number;
}

export interface QuantumTelemetry {
  backend: string;
  aer_available: boolean;
  qubits: number;
  candidates_evaluated: number;
  feasible_candidates: number;
  grover_iterations: number;
  shots: number;
  chosen_bitstring: string | null;
  chosen_probability: number;
  circuit_depth: number;
  sim_time_ms: number;
  top_states: QuantumStateCount[];
}

export interface NavigationRoute {
  route_id: string;
  status: RouteStatus;
  start: Vec3;
  end: Vec3;
  waypoints: Vec3[];
  segments: number;
  total_distance_ly: number;
  straight_line_ly: number;
  travel: TravelEstimate;
  safety: SafetyReport;
  quantum: QuantumTelemetry;
  warnings: string[];
  generated_at: string;
}

export const SPEED_MODES: ReadonlyArray<{
  value: SpeedMode;
  label: string;
  detail: string;
}> = [
  { value: 'voyager', label: 'Voyager 1', detail: '17 km/s' },
  { value: 'parker', label: 'Parker Solar Probe', detail: '163 km/s' },
  { value: 'fusion_ramjet', label: 'Fusion ramjet', detail: '0.05 c' },
  { value: 'antimatter', label: 'Antimatter torch', detail: '0.5 c' },
  { value: 'c', label: 'Speed of light', detail: '1.0 c' },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
interface FastApiValidationError {
  msg?: string;
  loc?: (string | number)[];
}

/** Turn an Axios/FastAPI failure into one readable line for the HUD. */
export function describeError(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    const detail = (error.response?.data as { detail?: unknown } | undefined)?.detail;

    if (typeof detail === 'string') {
      return status ? `HTTP ${status} · ${detail}` : detail;
    }
    if (Array.isArray(detail)) {
      const messages = (detail as FastApiValidationError[])
        .map((entry) => entry.msg)
        .filter((message): message is string => Boolean(message));
      if (messages.length > 0) return messages.join(' · ');
    }
    if (status) return `HTTP ${status} · ${error.message}`;
    return error.message;
  }
  return error instanceof Error ? error.message : 'Unknown error';
}

function pickDefaultIds(bodies: CelestialBody[]): { startId: string; endId: string } {
  const sol = bodies.find((body) => body.name === 'Sol');
  const sgrA = bodies.find((body) => body.body_type === 'exotic');
  const startId = sol?.id ?? bodies[0]?.id ?? '';
  const endId = sgrA?.id ?? bodies[bodies.length - 1]?.id ?? '';
  return { startId, endId };
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------
interface DapsState {
  // data
  bodies: CelestialBody[];
  hazards: HazardZone[];
  catalogLoading: boolean;
  catalogError: string | null;
  lastSyncedAt: number | null;

  // flight plan
  startId: string | null;
  endId: string | null;
  speedMode: SpeedMode;
  hoveredBodyId: string | null;

  // route
  route: NavigationRoute | null;
  routeLoading: boolean;
  routeError: string | null;

  // right-side 2D map + camera controls
  panelOpen: boolean;
  /** Bumped on every zoom click; the scene reacts to changes of this object. */
  zoomReq: { dir: 1 | -1; seq: number } | null;

  // actions
  fetchCatalog: () => Promise<void>;
  fetchHazards: () => Promise<void>;
  startPolling: () => () => void;

  setStart: (id: string) => void;
  setEnd: (id: string) => void;
  swapEndpoints: () => void;
  setSpeedMode: (mode: SpeedMode) => void;
  setHoveredBody: (id: string | null) => void;
  selectDestination: (body: CelestialBody) => void;
  plotCourse: () => Promise<void>;
  clearRoute: () => void;
  setPanelOpen: (open: boolean) => void;
  requestZoom: (dir: 1 | -1) => void;
}

export const useDapsStore = create<DapsState>()((set, get) => ({
  bodies: [],
  hazards: [],
  catalogLoading: false,
  catalogError: null,
  lastSyncedAt: null,

  startId: null,
  endId: null,
  speedMode: 'fusion_ramjet',
  hoveredBodyId: null,

  route: null,
  routeLoading: false,
  routeError: null,

  panelOpen: true,
  zoomReq: null,

  fetchCatalog: async () => {
    set({ catalogLoading: true, catalogError: null });
    try {
      const { data } = await api.get<CelestialBody[]>('/api/v1/map');
      const bodies = [...data].sort(
        (a, b) => a.distance_from_sol_ly - b.distance_from_sol_ly,
      );

      const state = get();
      const defaults = pickDefaultIds(bodies);
      const startId = state.startId ?? defaults.startId;
      const endId = state.endId ?? defaults.endId;

      set({
        bodies,
        startId,
        endId,
        catalogLoading: false,
        lastSyncedAt: Date.now(),
      });

      // First load: show a plotted course straight away so the console is never
      // an empty star field. Subsequent polls leave the user's route alone.
      if (!get().route && !get().routeLoading && startId && endId) {
        void get().plotCourse();
      }
    } catch (error) {
      set({ catalogLoading: false, catalogError: describeError(error) });
    }
  },

  fetchHazards: async () => {
    try {
      const { data } = await api.get<HazardZone[]>('/api/v1/hazards');
      set({ hazards: data, lastSyncedAt: Date.now() });
    } catch (error) {
      set({ catalogError: describeError(error) });
    }
  },

  startPolling: () => {
    const hazardTimer = window.setInterval(() => {
      void get().fetchHazards();
    }, HAZARD_POLL_MS);
    const catalogTimer = window.setInterval(() => {
      void get().fetchCatalog();
    }, CATALOG_POLL_MS);

    return () => {
      window.clearInterval(hazardTimer);
      window.clearInterval(catalogTimer);
    };
  },

  setStart: (id) => set({ startId: id, route: null, routeError: null }),
  setEnd: (id) => set({ endId: id, route: null, routeError: null }),

  swapEndpoints: () => {
    const { startId, endId } = get();
    set({ startId: endId, endId: startId, route: null, routeError: null });
  },

  setSpeedMode: (mode) => set({ speedMode: mode, route: null, routeError: null }),
  setHoveredBody: (id) => set({ hoveredBodyId: id }),

  selectDestination: (body) => set({ endId: body.id, route: null, routeError: null }),

  plotCourse: async () => {
    const { bodies, startId, endId, speedMode } = get();
    const start = bodies.find((body) => body.id === startId);
    const end = bodies.find((body) => body.id === endId);

    if (!start || !end) {
      set({ routeError: 'Pick a departure point and a destination first.' });
      return;
    }
    if (start.id === end.id) {
      set({ routeError: 'Departure and destination must be different objects.' });
      return;
    }

    set({ routeLoading: true, routeError: null });
    try {
      const { data } = await api.post<NavigationRoute>('/api/v1/navigate', {
        start_coord: start.coordinates,
        end_coord: end.coordinates,
        speed_mode: speedMode,
        clearance_margin_ly: 0.25,
      });
      set({ route: data, routeLoading: false });
    } catch (error) {
      set({ routeLoading: false, routeError: describeError(error) });
    }
  },

  clearRoute: () => set({ route: null, routeError: null }),

  setPanelOpen: (open) => set({ panelOpen: open }),

  requestZoom: (dir) =>
    set((state) => ({ zoomReq: { dir, seq: (state.zoomReq?.seq ?? 0) + 1 } })),
}));
