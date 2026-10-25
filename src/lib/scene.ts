import type { CelestialBody, HazardZone, Vec3 } from '../store';

/**
 * Scene scale.
 *
 * The API works in lightyears anchored at Sagittarius A*, and the catalogue
 * spans roughly 40,000 ly. Rendering that directly gives awkward camera numbers,
 * so one scene unit is one kilolightyear: the disk is ~42 units across and the
 * Sun sits at x = -26.49.
 */
export const LY_PER_UNIT = 1_000;

/** Invisible pick target radius (scene units). Much larger than the markers so
 *  stars stay clickable when the whole galaxy is in frame. */
export const HIT_RADIUS = 0.55;

export function toScene(point: Vec3): [number, number, number] {
  return [point.x / LY_PER_UNIT, point.y / LY_PER_UNIT, point.z / LY_PER_UNIT];
}

export function sceneDistance(point: Vec3): number {
  return Math.hypot(point.x, point.y, point.z) / LY_PER_UNIT;
}

const SPECTRAL_TINTS: Record<string, string> = {
  O: '#9db4ff',
  B: '#a9c2ff',
  A: '#dbe6ff',
  F: '#fff4e0',
  G: '#ffe9a8',
  K: '#ffc08a',
  M: '#ff9a76',
};

/** Colour per catalogue object: spectral class for stars, cyan for exoplanets. */
export function bodyColor(body: CelestialBody): string {
  if (body.body_type === 'exoplanet' || body.body_type === 'planet') return '#7dd3fc';
  if (body.body_type === 'exotic') return '#f5f3ff';

  const letter = body.spectral_class?.charAt(0).toUpperCase();
  return (letter && SPECTRAL_TINTS[letter]) || '#cbd5e1';
}

/** Marker size per object type, in scene units. */
export function bodyVisualScale(body: CelestialBody): number {
  switch (body.body_type) {
    case 'exotic':
      return 0.3;
    case 'exoplanet':
    case 'planet':
      return 0.05;
    default: {
      const letter = body.spectral_class?.charAt(0).toUpperCase();
      const byClass: Record<string, number> = {
        O: 0.16,
        B: 0.15,
        A: 0.13,
        F: 0.12,
        G: 0.11,
        K: 0.1,
        M: 0.085,
      };
      return (letter && byClass[letter]) || 0.095;
    }
  }
}

/**
 * Hazard spheres need a floor and a ceiling in visual radius.
 *
 * Real radii run from 0.9 ly to ~300 ly; at 1 unit = 1,000 ly the small local
 * zones would be sub-pixel and invisible. Clamping keeps every zone legible while
 * the HUD and labels always report the true radius in lightyears.
 */
export function hazardVisualRadius(radiusLy: number): number {
  return Math.min(2.4, Math.max(0.3, radiusLy / LY_PER_UNIT));
}

export interface HazardPalette {
  shell: string;
  glow: string;
}

/** Deep orange/red family, with a cooler violet only for jet phenomena. */
export function hazardPalette(hazard: HazardZone): HazardPalette {
  switch (hazard.hazard_type) {
    case 'bh_jet':
      return { shell: '#e879f9', glow: '#f472b6' };
    case 'gamma_ray_burst':
      return { shell: '#c084fc', glow: '#f0abfc' };
    case 'radiation_belt':
      return { shell: '#f97316', glow: '#fbbf24' };
    case 'micro_meteoroid_storm':
      return { shell: '#fb923c', glow: '#fdba74' };
    case 'solar_flare':
    default:
      return { shell: '#f97316', glow: '#fb7185' };
  }
}

/** Scene-space position of Sagittarius A* — the origin of the coordinate grid. */
export const GALACTIC_ORIGIN: [number, number, number] = [0, 0, 0];
