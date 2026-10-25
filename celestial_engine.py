"""
celestial_engine.py — mock SPHEREx catalogue and live hazard field for DAPS.

Two data sources, both deterministic:

1. **Real anchors** — a dozen well-known stars whose ICRS (right ascension,
   declination) coordinates and distances are public catalogue values.  Astropy
   rotates each one into galactic longitude/latitude; the engine then shifts the
   result by the Sun's offset from Sagittarius A* (R0 = 8.122 kpc,
   z_sun = 20.8 pc) to get galactocentric Cartesian lightyears.  Values are
   rounded catalogue data and flagged ``REAL-CATALOG`` so nobody mistakes the
   mock for an ephemeris.

2. **Synthetic SPHEREx-like survey** — 50 stars drawn with NumPy from an
   exponential stellar disk with 4-arm log-spiral modulation and a thin/thick
   vertical profile.  Their names are pseudo-ICRS designations produced by
   rotating the generated position back through Astropy, which is exactly how a
   real near-infrared survey would label a detection.  Exoplanet companions are
   attached to a subset of hosts.

Coordinate frame
----------------
Standard galactocentric orientation: +X points from the Sun towards Sgr A*,
+Y towards galactic longitude 90 deg, +Z towards the north galactic pole.  The
Sun therefore sits at ``(-R0, 0, +z_sun)`` and Sgr A* at the origin:

    X = d*cos(b)*cos(l) - R0
    Y = d*cos(b)*sin(l)
    Z = d*sin(b) + z_sun

Hazards
-------
Radii are deliberately two-scale.  Local hazards are lightyears across so that
a 4 ly hop is actually navigable; galactic hazards are hundreds of lightyears
across.  A single scale would make every local route impossible (a 150 ly sphere
centred on Sgr A* would swallow the entire solar neighbourhood).

The field drifts on an hourly bucket: centre, radius and intensity all move a
few percent per hour.  Repeated calls therefore show "dynamic" hazards, while
every response inside the same hour is byte-identical — essential for a
demo and for reproducible debugging.
"""

from __future__ import annotations

import math
import os
from datetime import datetime, timedelta, timezone
from functools import lru_cache

import numpy as np
from astropy import units as u
from astropy.coordinates import SkyCoord

# ---------------------------------------------------------------------------
# Frame constants (IAU / GRAVITY-collaboration values, converted via Astropy)
# ---------------------------------------------------------------------------
KPC_TO_LY: float = (1.0 * u.kpc).to_value(u.lyr)      # 3261.5637...
AU_TO_LY: float = (1.0 * u.au).to_value(u.lyr)        # 1.5813e-5

R0_KPC: float = 8.122        # Sun's distance from the galactic centre
Z_SUN_KPC: float = 0.0208    # Sun's height above the midplane (20.8 pc)

R0_LY: float = R0_KPC * KPC_TO_LY
Z_SUN_LY: float = Z_SUN_KPC * KPC_TO_LY

SGR_A_STAR: tuple[float, float, float] = (0.0, 0.0, 0.0)
# +X points from the Sun towards the centre, so the Sun has a negative X and
# sits just above the midplane.
SOL: tuple[float, float, float] = (-R0_LY, 0.0, Z_SUN_LY)

DEFAULT_SEED = int(os.getenv("DAPS_SEED", "20261023"))

HOUR = 3600.0


# ---------------------------------------------------------------------------
# Sexagesimal helpers for the real-star table
# ---------------------------------------------------------------------------
def _hms(hours: float, minutes: float, seconds: float) -> float:
    """Right ascension h m s -> decimal degrees."""
    return (hours + minutes / 60.0 + seconds / 3600.0) * 15.0


def _dms(sign: int, deg: float, minutes: float, seconds: float) -> float:
    """Declination d m s -> decimal degrees."""
    dec = deg + minutes / 60.0 + seconds / 3600.0
    return -dec if sign < 0 else dec


def _galactic_of(ra_deg: float, dec_deg: float) -> tuple[float, float]:
    """ICRS RA/Dec (degrees) -> galactic (l, b) in degrees, via a pure rotation."""
    coord = SkyCoord(ra=ra_deg * u.deg, dec=dec_deg * u.deg, frame="icrs").galactic
    return float(coord.l.deg), float(coord.b.deg)


def galactic_to_sgr_a(l_deg: float, b_deg: float, distance_ly: float) -> tuple[float, float, float]:
    """Heliocentric galactic (l, b, d) -> galactocentric Cartesian lightyears."""
    l, b = math.radians(l_deg), math.radians(b_deg)
    d = float(distance_ly)
    x = d * math.cos(b) * math.cos(l) - R0_LY
    y = d * math.cos(b) * math.sin(l)
    z = d * math.sin(b) + Z_SUN_LY
    return (x, y, z)


# ---------------------------------------------------------------------------
# Real anchor stars: (name, RA h/m/s, Dec sign/d/m/s, distance ly, class,
# habitability, companions [(designation, semi-major axis AU), ...])
# Distances from Gaia DR3 / Hipparcos; positions rounded to arcseconds.
# ---------------------------------------------------------------------------
_ANCHORS: list[dict] = [
    {
        "name": "Proxima Centauri",
        "ra": _hms(14, 29, 42.95),
        "dec": _dms(-1, 62, 40, 46.1),
        "distance_ly": 4.2465,
        "spectral_class": "M5.5Ve",
        "habitability": 0.62,
        "companions": [("Proxima Centauri b", 0.0485)],
    },
    {
        "name": "Alpha Centauri A",
        "ra": _hms(14, 39, 36.49),
        "dec": _dms(-1, 60, 50, 2.3),
        "distance_ly": 4.365,
        "spectral_class": "G2V",
        "habitability": 0.35,
        "companions": [],
    },
    {
        "name": "Alpha Centauri B",
        "ra": _hms(14, 39, 35.08),
        "dec": _dms(-1, 60, 50, 15.1),
        "distance_ly": 4.365,
        "spectral_class": "K1V",
        "habitability": 0.30,
        "companions": [],
    },
    {
        "name": "Barnard's Star",
        "ra": _hms(17, 57, 48.50),
        "dec": _dms(1, 4, 41, 36.2),
        "distance_ly": 5.9629,
        "spectral_class": "M4.0Ve",
        "habitability": 0.20,
        "companions": [("Barnard's Star b", 0.404),
                       ("Barnard's Star c", 0.077)],
    },
    {
        "name": "Wolf 359",
        "ra": _hms(10, 56, 28.92),
        "dec": _dms(1, 7, 0, 52.0),
        "distance_ly": 7.8558,
        "spectral_class": "M6.0V",
        "habitability": 0.12,
        "companions": [],
    },
    {
        "name": "Lalande 21185",
        "ra": _hms(11, 3, 20.19),
        "dec": _dms(1, 35, 58, 11.6),
        "distance_ly": 8.3044,
        "spectral_class": "M2.0V",
        "habitability": 0.22,
        "companions": [("Lalande 21185 b", 0.0788)],
    },
    {
        "name": "Sirius A",
        "ra": _hms(6, 45, 8.92),
        "dec": _dms(-1, 16, 42, 58.0),
        "distance_ly": 8.601,
        "spectral_class": "A1V",
        "habitability": 0.05,
        "companions": [],
    },
    {
        "name": "Epsilon Eridani",
        "ra": _hms(3, 32, 55.84),
        "dec": _dms(-1, 9, 27, 29.7),
        "distance_ly": 10.4749,
        "spectral_class": "K2V",
        "habitability": 0.48,
        "companions": [("Epsilon Eridani b", 3.5)],
    },
    {
        "name": "Tau Ceti",
        "ra": _hms(1, 44, 4.08),
        "dec": _dms(-1, 15, 56, 14.9),
        "distance_ly": 11.9118,
        "spectral_class": "G8.5V",
        "habitability": 0.55,
        "companions": [("Tau Ceti e", 0.552), ("Tau Ceti f", 1.35)],
    },
    {
        "name": "Altair",
        "ra": _hms(19, 50, 46.99),
        "dec": _dms(1, 8, 52, 5.9),
        "distance_ly": 16.730,
        "spectral_class": "A7Vn",
        "habitability": 0.04,
        "companions": [],
    },
    {
        "name": "Vega",
        "ra": _hms(18, 36, 56.34),
        "dec": _dms(1, 38, 47, 1.3),
        "distance_ly": 25.045,
        "spectral_class": "A0Va",
        "habitability": 0.03,
        "companions": [],
    },
    {
        "name": "Fomalhaut",
        "ra": _hms(22, 57, 39.05),
        "dec": _dms(-1, 29, 37, 20.1),
        "distance_ly": 25.126,
        "spectral_class": "A3Va",
        "habitability": 0.10,
        "companions": [("Fomalhaut b", 115.0)],
    },
]

# Cygnus X-1 (an X-ray binary driving a relativistic jet) is reused as a hazard.
_CYG_X1_RA = _hms(19, 58, 21.7)
_CYG_X1_DEC = _dms(1, 35, 12, 6.0)
_CYG_X1_DISTANCE_LY = 7240.0

# Spectral classes with rough main-sequence absolute magnitudes (M_V) sampled in
# proportions that resemble a magnitude-limited near-infrared survey: M dwarfs
# dominate by count even though they are faint.
_SPECTRAL_POPULATION = [
    ("M", 0.62, 8.5),
    ("K", 0.22, 5.9),
    ("G", 0.10, 4.4),
    ("F", 0.05, 3.0),
    ("A", 0.012, 1.0),
    ("B", 0.003, -2.5),
]

_HABITABILITY_BY_CLASS = {
    "G": 0.60,
    "K": 0.55,
    "F": 0.45,
    "M": 0.35,
    "A": 0.10,
    "B": 0.02,
    "O": 0.01,
}


def _spectral_sample(rng: np.random.Generator) -> tuple[str, float]:
    """Draw a spectral class and its absolute magnitude from the population."""
    u_draw = rng.random()
    cumulative = 0.0
    for letter, weight, abs_mag in _SPECTRAL_POPULATION:
        cumulative += weight
        if u_draw <= cumulative:
            subtype = int(rng.integers(0, 10))
            luminosity = "V" if rng.random() > 0.06 else "III"
            return f"{letter}{subtype}{luminosity}", float(abs_mag) + rng.normal(0.0, 0.4)
    return "M5V", 9.0


def _designation(l_deg: float, b_deg: float, distance_ly: float) -> str:
    """Build a SPHEREx-style JHHMMSS+DDMMSS name from a galactic position."""
    icrs = SkyCoord(
        l=l_deg * u.deg, b=b_deg * u.deg, distance=distance_ly * u.lyr, frame="galactic"
    ).icrs
    ra = icrs.ra.deg / 15.0  # degrees -> hours
    dec = icrs.dec.deg
    hh = int(ra)
    mm = int((ra - hh) * 60.0)
    ss = int((((ra - hh) * 60.0) - mm) * 60.0)
    sign = "+" if dec >= 0 else "-"
    dec = abs(dec)
    dd = int(dec)
    dm = int((dec - dd) * 60.0)
    ds = int((((dec - dd) * 60.0) - dm) * 60.0)
    return f"SPX J{hh:02d}{mm:02d}{ss:02d}{sign}{dd:02d}{dm:02d}{ds:02d}"


def _severity(intensity: float) -> str:
    if intensity >= 0.85:
        return "extreme"
    if intensity >= 0.65:
        return "high"
    if intensity >= 0.4:
        return "moderate"
    return "low"


@lru_cache(maxsize=1)
def get_catalog(seed: int = DEFAULT_SEED):
    """
    Build the full celestial catalogue once and cache it.

    Returns a tuple of :class:`models.CelestialBody`.  Imported lazily to keep
    :mod:`models` free of any dependency on this module.
    """
    from models import CelestialBody, Coordinate  # local import avoids a cycle

    rng = np.random.default_rng(seed)
    bodies: list[CelestialBody] = []

    def add(
        name: str,
        catalog_id: str,
        body_type: str,
        coords: tuple[float, float, float],
        spectral: str | None,
        habitability: float,
        infrared_magnitude: float,
        source: str,
        has_exoplanet: bool = False,
        notes: str | None = None,
    ) -> None:
        distance_sol = float(np.linalg.norm(np.subtract(coords, SOL)))
        distance_sgr = float(np.linalg.norm(coords))
        bodies.append(
            CelestialBody(
                id=f"body-{len(bodies):03d}",
                catalog_id=catalog_id,
                name=name,
                body_type=body_type,
                spectral_class=spectral,
                coordinates=Coordinate(x=float(coords[0]), y=float(coords[1]), z=float(coords[2])),
                distance_from_sol_ly=distance_sol,
                distance_from_sgr_a_ly=distance_sgr,
                has_exoplanet=has_exoplanet,
                habitability_score=float(np.clip(habitability, 0.0, 1.0)),
                infrared_magnitude=float(infrared_magnitude),
                source=source,
                notes=notes,
            )
        )

    # -- Origin marker and the Sun's own position --------------------------
    add(
        "Sagittarius A*", "SGR-A*", "exotic", SGR_A_STAR, None, 0.0, 20.0,
        "REAL-CATALOG",
        notes="Galactic centre / supermassive black hole; origin of the grid.",
    )
    add(
        "Sol", "SOL", "star", SOL, "G2V", 0.30, -26.7, "REAL-CATALOG",
        has_exoplanet=True, notes="Home system; reference for distance_from_sol_ly.",
    )

    # -- Real nearby anchors ------------------------------------------------
    for anchor_index, anchor in enumerate(_ANCHORS):
        l_deg, b_deg = _galactic_of(anchor["ra"], anchor["dec"])
        coords = galactic_to_sgr_a(l_deg, b_deg, anchor["distance_ly"])
        companions = anchor["companions"]
        # Apparent K-band magnitude from the distance modulus, using a rough
        # absolute magnitude for the anchor's spectral class.
        abs_mag = {"M": 9.0, "K": 6.0, "G": 4.6, "F": 3.0, "A": 1.2}.get(
            anchor["spectral_class"][0], 5.0
        )
        d_pc = anchor["distance_ly"] / 3.261563777
        app_mag = abs_mag + 5.0 * math.log10(max(d_pc, 0.1) / 10.0)
        add(
            anchor["name"],
            f"SPX-ANC-{anchor_index:04d}",
            "star",
            coords,
            anchor["spectral_class"],
            anchor["habitability"],
            float(app_mag),
            "REAL-CATALOG",
            has_exoplanet=bool(companions),
            notes="Approximate ICRS position and Gaia/Hipparcos distance.",
        )
        for designation, semi_major_au in companions:
            offset_dir = rng.normal(size=3)
            offset_dir /= np.linalg.norm(offset_dir)
            offset = offset_dir * float(semi_major_au) * AU_TO_LY
            add(
                designation,
                f"SPX-EXO-{len(bodies):04d}",
                "exoplanet",
                tuple(np.add(coords, offset)),
                None,
                min(0.95, anchor["habitability"] + 0.25),
                12.0,
                "REAL-CATALOG",
                notes=f"Orbital semi-major axis {semi_major_au:g} AU (not to scale).",
            )

    # -- Synthetic SPHEREx-like survey --------------------------------------
    target_stars = 50
    stars: list[dict] = []
    attempts = 0
    while len(stars) < target_stars and attempts < 64:
        attempts += 1
        batch = 64
        # Exponential disk in galactocentric cylindrical coordinates.
        r_kpc = rng.gamma(shape=2.2, scale=1.5, size=batch)
        r_kpc = np.clip(r_kpc, 0.15, 14.0)

        # 65% of stars are pulled onto one of four log-spiral arms.
        pitch = math.radians(14.0)
        arm_index = rng.integers(0, 4, size=batch)
        arm_theta = arm_index * (math.pi / 2.0) + (1.0 / math.tan(pitch)) * np.log(
            r_kpc / 2.2 + 1e-6
        )
        theta = np.where(
            rng.random(batch) < 0.65,
            arm_theta + rng.normal(0.0, 0.16, size=batch),
            rng.uniform(0.0, 2.0 * math.pi, size=batch),
        )
        # Thin disk plus a 15% thick-disk component.
        z_kpc = np.where(
            rng.random(batch) < 0.15,
            rng.normal(0.0, 0.85, size=batch),
            rng.normal(0.0, 0.28, size=batch),
        )

        x_kpc = r_kpc * np.cos(theta)
        y_kpc = r_kpc * np.sin(theta)

        # Convert to heliocentric galactic coordinates: the Sun is at X = -R0.
        xs = x_kpc + R0_KPC
        ys = y_kpc
        zs = z_kpc - Z_SUN_KPC
        d_ly = np.linalg.norm(np.stack([xs, ys, zs], axis=1), axis=1) * KPC_TO_LY

        for i in range(batch):
            if len(stars) >= target_stars:
                break
            # Keep the local bubble itself for the real anchors (30 ly floor) and
            # drop anything so far that a mock survey would never resolve it.
            if d_ly[i] < 30.0 or d_ly[i] > 45_000.0:
                continue
            l_deg = math.degrees(math.atan2(ys[i], xs[i])) % 360.0
            b_deg = math.degrees(math.atan2(zs[i], math.hypot(xs[i], ys[i])))
            stars.append(
                {
                    "l_deg": l_deg,
                    "b_deg": b_deg,
                    "distance_ly": float(d_ly[i]),
                    # Galactocentric coordinates in lightyears (grid frame).
                    "x_ly": float(x_kpc[i] * KPC_TO_LY),
                    "y_ly": float(y_kpc[i] * KPC_TO_LY),
                    "z_ly": float(z_kpc[i] * KPC_TO_LY),
                    "abs_z_kpc": float(abs(z_kpc[i])),
                    "r_kpc": float(r_kpc[i]),
                }
            )

    planet_hosts = set(rng.choice(len(stars), size=12, replace=False).tolist())
    for idx, star in enumerate(stars):
        spectral, abs_mag = _spectral_sample(rng)
        letter = spectral[0]
        # Distance modulus: apparent magnitude = M + 5*log10(d_pc / 10).
        d_pc = star["distance_ly"] / 3.261563777
        app_mag = abs_mag + 5.0 * math.log10(max(d_pc, 0.1) / 10.0) + rng.normal(0.0, 0.3)

        habitability = _HABITABILITY_BY_CLASS.get(letter, 0.05)
        habitability *= math.exp(-star["abs_z_kpc"] / 0.45)  # thicker disk -> older, drier
        habitability += rng.normal(0.0, 0.06)
        has_planets = idx in planet_hosts
        if has_planets:
            habitability += 0.12

        coords = (star["x_ly"], star["y_ly"], star["z_ly"])
        name = _designation(star["l_deg"], star["b_deg"], star["distance_ly"])
        add(
            name,
            f"SPX-{len(bodies):04d}",
            "star",
            coords,
            spectral,
            habitability,
            float(app_mag),
            "SPHEREx-MOCK",
            has_exoplanet=has_planets,
            notes=f"Galactic radius {star['r_kpc']:.1f} kpc; synthetic disk model.",
        )

        if has_planets:
            n_planets = int(rng.integers(1, 3))
            for p in range(n_planets):
                semi_major = float(rng.uniform(0.05, 3.0))
                direction = rng.normal(size=3)
                direction /= np.linalg.norm(direction)
                offset = direction * semi_major * AU_TO_LY
                add(
                    f"{name} {'bcdef'[p]}",
                    f"SPX-EXO-{len(bodies):04d}",
                    "exoplanet",
                    tuple(np.add(coords, offset)),
                    None,
                    habitability + rng.normal(0.0, 0.08),
                    14.0 + p,
                    "SPHEREx-MOCK",
                    notes=f"Orbital semi-major axis {semi_major:.2f} AU (not to scale).",
                )

    return tuple(bodies)


@lru_cache(maxsize=64)
def _hazards_for_bucket(bucket: int):
    """Hazard field for a given hour bucket — deterministic and time-drifting."""
    from models import Coordinate, HazardZone  # local import avoids a cycle

    # Everything below is a deterministic function of the bucket, so no RNG is
    # needed: the drift is a set of phase-shifted sinusoids that advance one
    # 24th of a cycle per hour.
    phase = 2.0 * math.pi * (bucket % 24) / 24.0
    detected = datetime.fromtimestamp(bucket * HOUR, tz=timezone.utc)
    expires = detected + timedelta(hours=2)

    sol = np.array(SOL, dtype=float)
    centre_sgr = np.zeros(3)
    cyg_l, cyg_b = _galactic_of(_CYG_X1_RA, _CYG_X1_DEC)
    cyg = np.array(galactic_to_sgr_a(cyg_l, cyg_b, _CYG_X1_DISTANCE_LY))

    # (name, type, centre, radius, intensity, drift amplitude as a fraction of r)
    #
    # Local zones are placed *off* the solar position: a hazard that engulfs the
    # departable origin would make every route out of Sol trivially infeasible.
    seeds: list[tuple[str, str, np.ndarray, float, float, float]] = [
        ("Solar Flare Corridor", "solar_flare", sol + np.array([3.2, 1.6, 0.4]), 2.2, 0.82, 0.06),
        ("Inner-System Radiation Belt", "radiation_belt", sol + np.array([-1.7, 1.2, -0.4]), 0.9, 0.55, 0.05),
        ("Heliopause Debris Field", "micro_meteoroid_storm", sol + np.array([110.0, 120.0, 30.0]), 55.0, 0.35, 0.03),
        ("Sgr A* Core Radiation Zone", "radiation_belt", centre_sgr + np.array([0.0, 0.0, 0.0]), 160.0, 1.00, 0.02),
        ("Sgr A* Relativistic Jet Lobe", "bh_jet", centre_sgr + np.array([0.0, 0.0, 420.0]), 300.0, 0.90, 0.02),
        ("Cygnus X-1 Jet", "bh_jet", cyg, 220.0, 0.75, 0.03),
    ]

    # Three procedural zones strung along the Sol -> Sgr A* corridor.  The first
    # two genuinely straddle the direct line (so the router has something to
    # avoid); the third sits well off-axis as ambient scenery.
    corridor = centre_sgr - sol
    perp = np.array([0.0, 0.0, 1.0])
    for t, offset, radius, hazard_type, intensity in (
        (0.32, 40.0, 90.0, "gamma_ray_burst", 0.55),
        (0.55, -60.0, 120.0, "micro_meteoroid_storm", 0.45),
        (0.72, 260.0, 140.0, "radiation_belt", 0.68),
    ):
        centre = sol + corridor * t + perp * offset
        seeds.append(
            (
                f"Corridor Anomaly {int(t * 100):02d}",
                hazard_type,
                centre,
                radius,
                intensity,
                0.02,
            )
        )

    hazards = []
    for index, (name, hazard_type, centre, radius, intensity, drift_fraction) in enumerate(seeds):
        # Each hazard drifts on its own phase, at a scale proportional to its own
        # radius, so local and galactic hazards both stay plausible.
        wobble = np.array(
            [
                math.sin(phase + index * 0.7),
                math.cos(phase * 0.8 + index * 1.3),
                math.sin(phase * 0.6 + index * 2.1),
            ]
        )
        drift = wobble * drift_fraction * radius
        radius_t = radius * (1.0 + 0.08 * math.sin(phase * 2.0 + index))
        intensity_t = float(np.clip(intensity + 0.05 * math.sin(phase + index * 0.5), 0.05, 1.0))
        centre_t = centre + drift

        # Safety net for future edits: never let a zone swallow the Sun, or every
        # departure from Sol becomes infeasible by construction.
        if float(np.linalg.norm(centre_t - sol)) < radius_t * 1.05:
            centre_t = sol + _unit_vector(centre_t - sol) * radius_t * 1.05

        hazards.append(
            HazardZone(
                id=f"hazard-{index:02d}",
                name=name,
                hazard_type=hazard_type,  # type: ignore[arg-type]
                center=Coordinate(x=float(centre_t[0]), y=float(centre_t[1]), z=float(centre_t[2])),
                radius_ly=float(radius_t),
                intensity=intensity_t,
                severity=_severity(intensity_t),  # type: ignore[arg-type]
                active=True,
                detected_at=detected,
                expires_at=expires,
                source="SPHEREx-MOCK/telemetry",
            )
        )
    return tuple(hazards)


def current_bucket(now: datetime | None = None) -> int:
    """Hour bucket used as the hazard cache key."""
    moment = now or datetime.now(timezone.utc)
    return int(moment.timestamp() // HOUR)


def get_hazards(now: datetime | None = None):
    """Active hazards for the current hour (cached per bucket)."""
    return list(_hazards_for_bucket(current_bucket(now)))


def sun_position() -> tuple[float, float, float]:
    return SOL


def _unit_vector(vector: np.ndarray) -> np.ndarray:
    norm = float(np.linalg.norm(vector))
    if norm < 1e-12:
        return np.array([1.0, 0.0, 0.0])
    return vector / norm


def origin() -> tuple[float, float, float]:
    return SGR_A_STAR
