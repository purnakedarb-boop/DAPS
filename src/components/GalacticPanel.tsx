import { useMemo } from 'react';

import { useDapsStore, type CelestialBody } from '../store';
import { bodyColor } from '../lib/scene';

/**
 * Right-docked 2D galactic map — the "map next to it" from Google Maps.
 *
 * Top-down projection of the galactic plane (x/y in light-years, z ignored),
 * rendered as one SVG: hazards as translucent circles, the active route as a
 * blue line, A/B markers for the endpoints. Clicking a star fills the
 * destination, exactly like clicking it in the 3D canvas.
 */
export function GalacticPanel() {
  const open = useDapsStore((state) => state.panelOpen);
  const close = useDapsStore((state) => state.setPanelOpen);

  if (!open) return null;

  return (
    <aside className="pointer-events-auto absolute bottom-4 right-4 top-4 z-20 flex w-[360px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-lg bg-white shadow-[0_1px_3px_rgba(60,64,67,0.3),0_4px_8px_3px_rgba(60,64,67,0.15)]">
      <header className="flex items-start gap-2 px-4 pb-3 pt-3.5">
        <div className="min-w-0 flex-1">
          <h2 className="text-[15px] font-medium leading-tight text-[#202124]">Galactic map</h2>
          <p className="text-[12px] text-[#5f6368]">Top-down · galactic plane · Sagittarius A* centre</p>
        </div>
        <button
          type="button"
          onClick={() => close(false)}
          aria-label="Close map"
          className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-[#5f6368] transition hover:bg-[#f1f3f4]"
        >
          <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" aria-hidden="true">
            <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
          </svg>
        </button>
      </header>

      <StarMap />

      <footer className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-[#e8eaed] px-4 py-2.5 text-[11px] text-[#5f6368]">
        <Legend dot="#dbe61a" label="Star" />
        <Legend dot="#7dd3fc" label="Planet" />
        <Legend dot="#f97316" label="Hazard" />
        <span className="flex items-center gap-1.5">
          <span className="h-[3px] w-4 rounded bg-[#4285f4]" />
          Route
        </span>
        <span className="ml-auto">click a star → destination</span>
      </footer>
    </aside>
  );
}

function Legend({ dot, label }: { dot: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="h-2 w-2 rounded-full" style={{ background: dot }} />
      {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// The map itself
// ---------------------------------------------------------------------------
const W = 344;
const H = 560;
const PAD = 26;

function StarMap() {
  const bodies = useDapsStore((state) => state.bodies);
  const hazards = useDapsStore((state) => state.hazards);
  const route = useDapsStore((state) => state.route);
  const startId = useDapsStore((state) => state.startId);
  const endId = useDapsStore((state) => state.endId);
  const hoveredBodyId = useDapsStore((state) => state.hoveredBodyId);
  const selectDestination = useDapsStore((state) => state.selectDestination);
  const setHoveredBody = useDapsStore((state) => state.setHoveredBody);

  const projection = useMemo(() => {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    const consider = (x: number, y: number) => {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    };

    for (const body of bodies) consider(body.coordinates.x, body.coordinates.y);
    for (const hazard of hazards) consider(hazard.center.x, hazard.center.y);
    if (bodies.length === 0) {
      minX = -25_000;
      maxX = 25_000;
      minY = -25_000;
      maxY = 25_000;
    }

    const spanX = Math.max(maxX - minX, 1);
    const spanY = Math.max(maxY - minY, 1);
    const scale = Math.min((W - 2 * PAD) / spanX, (H - 2 * PAD) / spanY);
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    return {
      scale,
      project: (x: number, y: number): [number, number] => [
        (x - centerX) * scale + W / 2,
        -(y - centerY) * scale + H / 2,
      ],
      min: { x: minX, y: minY },
      max: { x: maxX, y: maxY },
    };
  }, [bodies, hazards]);

  const gridLines = useMemo(() => {
    const lines: { x1: number; y1: number; x2: number; y2: number }[] = [];
    const step = 10_000; // one tick every 10,000 ly
    const startX = Math.ceil(projection.min.x / step) * step;
    const startY = Math.ceil(projection.min.y / step) * step;

    for (let x = startX; x <= projection.max.x; x += step) {
      const [px] = projection.project(x, 0);
      lines.push({ x1: px, y1: 0, x2: px, y2: H });
    }
    for (let y = startY; y <= projection.max.y; y += step) {
      const [, py] = projection.project(0, y);
      lines.push({ x1: 0, y1: py, x2: W, y2: py });
    }

    return lines;
  }, [projection]);

  const routePoints = route
    ? [route.start, ...route.waypoints].map((point) => projection.project(point.x, point.y))
    : [];

  const core = bodies.find((body) => body.body_type === 'exotic') ?? null;
  const startBody = bodies.find((body) => body.id === startId) ?? null;
  const endBody = bodies.find((body) => body.id === endId) ?? null;
  const [originX, originY] = projection.project(0, 0);
  const startPx = startBody
    ? projection.project(startBody.coordinates.x, startBody.coordinates.y)
    : null;
  const endPx = endBody ? projection.project(endBody.coordinates.x, endBody.coordinates.y) : null;

  return (
    <div className="relative mx-3 min-h-0 flex-1 overflow-hidden rounded-lg bg-[#0b1220]">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-full w-full" role="img" aria-label="Top-down galactic map">
        {/* coordinate grid */}
        {gridLines.map((line, index) => (
          <line
            key={index}
            {...line}
            stroke="#1e293b"
            strokeWidth={1}
            opacity={0.55}
            shapeRendering="crispEdges"
          />
        ))}

        {/* hazard zones */}
        {hazards.map((hazard) => {
          const [cx, cy] = projection.project(hazard.center.x, hazard.center.y);
          const radius = Math.max(4, Math.min(64, hazard.radius_ly * projection.scale));
          const tone = hazard.hazard_type === 'bh_jet' ? '#c084fc' : '#f97316';
          return (
            <g key={hazard.id}>
              <circle cx={cx} cy={cy} r={radius} fill={tone} opacity={0.16} />
              <circle cx={cx} cy={cy} r={radius} fill="none" stroke={tone} strokeWidth={1} opacity={0.55} />
            </g>
          );
        })}

        {/* active route */}
        {routePoints.length > 1 ? (
          <g>
            <polyline
              points={routePoints.map(([x, y]) => `${x},${y}`).join(' ')}
              fill="none"
              stroke="#4285f4"
              strokeWidth={6}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={0.35}
            />
            <polyline
              points={routePoints.map(([x, y]) => `${x},${y}`).join(' ')}
              fill="none"
              stroke="#4285f4"
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </g>
        ) : null}

        {/* celestial bodies */}
        {bodies.map((body: CelestialBody) => {
          const [cx, cy] = projection.project(body.coordinates.x, body.coordinates.y);
          const hovered = body.id === hoveredBodyId;
          const radius =
            body.body_type === 'exotic' ? 5 : body.body_type === 'star' ? 2.6 : 2;

          return (
            <circle
              key={body.id}
              cx={cx}
              cy={cy}
              r={hovered ? radius + 2 : radius}
              fill={bodyColor(body)}
              stroke={hovered ? '#ffffff' : 'transparent'}
              strokeWidth={1.5}
              className="cursor-pointer"
              onClick={() => selectDestination(body)}
              onPointerEnter={() => setHoveredBody(body.id)}
              onPointerLeave={() => setHoveredBody(null)}
            >
              <title>{body.name}</title>
            </circle>
          );
        })}

        {/* galactic centre */}
        <g>
          <circle cx={originX} cy={originY} r={4} fill="#f5f3ff" />
          <circle cx={originX} cy={originY} r={8} fill="none" stroke="#c4b5fd" strokeWidth={1.2} opacity={0.9} />
          <text x={originX + 12} y={originY + 4} className="map-label">
            {core ? core.name : 'Sgr A*'}
          </text>
        </g>

        {/* A / B endpoint markers */}
        {startPx ? (
          <g>
            <circle cx={startPx[0]} cy={startPx[1]} r={8} fill="#0f9d58" stroke="#ffffff" strokeWidth={1.5} />
            <text x={startPx[0]} y={startPx[1] + 3.5} textAnchor="middle" fill="#ffffff" fontSize={9.5} fontWeight={600}>
              A
            </text>
          </g>
        ) : null}
        {endPx ? (
          <g>
            <circle cx={endPx[0]} cy={endPx[1]} r={8} fill="#d93025" stroke="#ffffff" strokeWidth={1.5} />
            <text x={endPx[0]} y={endPx[1] + 3.5} textAnchor="middle" fill="#ffffff" fontSize={9.5} fontWeight={600}>
              B
            </text>
          </g>
        ) : null}

        {/* hovered label */}
        {bodies
          .filter((body) => body.id === hoveredBodyId)
          .map((body) => {
            const [cx, cy] = projection.project(body.coordinates.x, body.coordinates.y);
            return (
              <text
                key={`label-${body.id}`}
                x={cx + 10}
                y={cy - 8}
                fontSize={10.5}
                fill="#ffffff"
                stroke="#0b1220"
                strokeWidth={3}
                paintOrder="stroke"
              >
                {body.name}
              </text>
            );
          })}
      </svg>

      <p className="pointer-events-none absolute bottom-2 right-3 text-[10px] text-slate-500">
        1 grid = 10,000 ly
      </p>
    </div>
  );
}
