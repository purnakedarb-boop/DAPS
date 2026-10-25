import { useMemo, type ReactNode } from 'react';

import {
  SPEED_MODES,
  useDapsStore,
  type NavigationRoute,
  type RouteStatus,
  type SpeedMode,
} from '../store';

/**
 * Google-Maps-style overlay: white Material cards, Roboto, Google blue.
 * The overlay itself swallows no pointer events; each card opts back in, so the
 * 3D canvas stays draggable in the gaps.
 */
export function NavigationHUD() {
  return (
    <div className="pointer-events-none absolute inset-0 z-10">
      <TopLeftCluster />
      <LivePill />
      <BottomRightControls />
      <Attribution />
      <HoveredBodyPill />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Top-left: search card + results card
// ---------------------------------------------------------------------------
function TopLeftCluster() {
  const panelOpen = useDapsStore((state) => state.panelOpen);

  return (
    <div
      className="daps-scroll pointer-events-auto absolute left-4 top-4 flex max-h-[calc(100dvh-6rem)] w-[400px] max-w-[calc(100vw-2rem)] flex-col gap-2 overflow-y-auto"
      style={{ marginRight: panelOpen ? 376 : 0 }}
    >
      <SearchCard />
      <ResultsCard />
    </div>
  );
}

function SearchCard() {
  const bodies = useDapsStore((state) => state.bodies);
  const startId = useDapsStore((state) => state.startId);
  const endId = useDapsStore((state) => state.endId);
  const speedMode = useDapsStore((state) => state.speedMode);
  const routeLoading = useDapsStore((state) => state.routeLoading);
  const catalogLoading = useDapsStore((state) => state.catalogLoading);
  const catalogError = useDapsStore((state) => state.catalogError);

  const setStart = useDapsStore((state) => state.setStart);
  const setEnd = useDapsStore((state) => state.setEnd);
  const swapEndpoints = useDapsStore((state) => state.swapEndpoints);
  const setSpeedMode = useDapsStore((state) => state.setSpeedMode);
  const plotCourse = useDapsStore((state) => state.plotCourse);

  const groups = useMemo(
    () => [
      { label: 'Stars', items: bodies.filter((body) => body.body_type === 'star') },
      {
        label: 'Exoplanets',
        items: bodies.filter(
          (body) => body.body_type === 'exoplanet' || body.body_type === 'planet',
        ),
      },
      {
        label: 'Galactic centre',
        items: bodies.filter((body) => body.body_type === 'exotic'),
      },
    ],
    [bodies],
  );

  const start = bodies.find((body) => body.id === startId) ?? null;
  const end = bodies.find((body) => body.id === endId) ?? null;
  const canPlot = Boolean(start && end) && start?.id !== end?.id && !routeLoading;

  return (
    <section className="rounded-lg bg-white shadow-[0_1px_3px_rgba(60,64,67,0.3),0_4px_8px_3px_rgba(60,64,67,0.15)]">
      <div className="flex items-center gap-3 px-4 pt-3">
        <DirectionsIcon />
        <h1 className="text-[15px] font-medium text-[#202124]">Directions</h1>
        <span className="text-[12px] text-[#5f6368]">DAPS · deep-space routing</span>
      </div>

      <div className="relative mt-2 px-4 pb-3">
        <div className="absolute left-[26px] top-[26px] h-[22px] w-[2px] bg-[#dadce0]" />
        <EndpointRow marker="A" markerClass="bg-[#0f9d58]" label="Choose departure point">
          <select
            aria-label="Departure"
            className="daps-select"
            value={startId ?? ''}
            disabled={bodies.length === 0}
            onChange={(event) => setStart(event.target.value)}
          >
            {groups.map((group) =>
              group.items.length > 0 ? (
                <optgroup key={group.label} label={group.label}>
                  {group.items.map((body) => (
                    <option key={body.id} value={body.id}>
                      {body.name}
                    </option>
                  ))}
                </optgroup>
              ) : null,
            )}
          </select>
        </EndpointRow>

        <EndpointRow marker="B" markerClass="bg-[#d93025]" label="Choose destination">
          <select
            aria-label="Destination"
            className="daps-select"
            value={endId ?? ''}
            disabled={bodies.length === 0}
            onChange={(event) => setEnd(event.target.value)}
          >
            {groups.map((group) =>
              group.items.length > 0 ? (
                <optgroup key={group.label} label={group.label}>
                  {group.items.map((body) => (
                    <option key={body.id} value={body.id}>
                      {body.name}
                    </option>
                  ))}
                </optgroup>
              ) : null,
            )}
          </select>
        </EndpointRow>

        <button
          type="button"
          onClick={swapEndpoints}
          aria-label="Swap departure and destination"
          title="Swap"
          className="absolute right-3 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full text-[#5f6368] transition hover:bg-[#f1f3f4] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#1a73e8]"
        >
          <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" aria-hidden="true">
            <path
              d="M7 4v14m0 0-3-3m3 3 3-3M17 20V6m0 0-3 3m3-3 3 3"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>

      <div className="flex gap-1 border-b border-[#e8eaed] px-3 pb-3">
        {SPEED_MODES.map((mode) => (
          <SpeedChip
            key={mode.value}
            mode={mode}
            selected={speedMode === mode.value}
            onSelect={() => setSpeedMode(mode.value)}
          />
        ))}
      </div>

      <div className="p-3">
        <button
          type="button"
          onClick={() => void plotCourse()}
          disabled={!canPlot}
          className="flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-[#1a73e8] text-[14px] font-medium text-white transition hover:bg-[#1b66c9] hover:shadow-[0_1px_3px_rgba(60,64,67,0.3)] disabled:cursor-not-allowed disabled:bg-[#dadce0] disabled:text-[#80868b]"
        >
          {routeLoading ? (
            <>
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
              Computing route…
            </>
          ) : (
            <>
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden="true">
                <path
                  d="M3 17c4-1 5-9 9-10m0 0-2-2m2 2-2 2M12 7c4 1 5 9 9 10m0 0-2-2m2 2-2 2"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              Plot course
            </>
          )}
        </button>

        {catalogLoading && bodies.length === 0 ? (
          <p className="pt-2 text-center text-[12px] text-[#5f6368]">Acquiring catalogue…</p>
        ) : null}
        {catalogError ? (
          <p className="pt-2 text-[12px] leading-snug text-[#c5221f]">
            Backend unreachable — {catalogError}
          </p>
        ) : null}
      </div>
    </section>
  );
}

function EndpointRow({
  marker,
  markerClass,
  label,
  children,
}: {
  marker: 'A' | 'B';
  markerClass: string;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="group flex h-[42px] items-center gap-3 border-b border-[#e8eaed] last:border-b-0">
      <span
        className={cn(
          'grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full text-[10px] font-medium text-white',
          markerClass,
        )}
      >
        {marker}
      </span>
      <div className="relative min-w-0 flex-1">{children}</div>
      <span className="sr-only">{label}</span>
    </div>
  );
}

function SpeedChip({
  mode,
  selected,
  onSelect,
}: {
  mode: (typeof SPEED_MODES)[number];
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      title={`${mode.label} · ${mode.detail}`}
      className={cn(
        'flex min-w-0 flex-1 flex-col items-center gap-1 rounded-lg px-1 py-1.5 transition',
        selected ? 'bg-[#e8f0fe] text-[#1a73e8]' : 'text-[#5f6368] hover:bg-[#f1f3f4]',
      )}
    >
      <SpeedIcon value={mode.value} />
      <span className="w-full truncate text-center text-[10px] font-medium leading-tight">
        {mode.label.split(' ')[0]}
      </span>
    </button>
  );
}

function SpeedIcon({ value }: { value: SpeedMode }) {
  const common = { className: 'h-[18px] w-[18px]', fill: 'none', 'aria-hidden': true } as const;

  switch (value) {
    case 'voyager':
      return (
        <svg {...common} viewBox="0 0 24 24">
          <circle cx="12" cy="8" r="3.2" stroke="currentColor" strokeWidth="1.6" />
          <path d="M4 20c2-4 5-6 8-6s6 2 8 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      );
    case 'parker':
      return (
        <svg {...common} viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.6" />
          <path d="M12 3v2m0 14v2M3 12h2m14 0h2M5.6 5.6l1.4 1.4m10 10 1.4 1.4m0-12.8-1.4 1.4m-10 10-1.4 1.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      );
    case 'fusion_ramjet':
      return (
        <svg {...common} viewBox="0 0 24 24">
          <path d="M12 3c3 2.5 4.5 6 4.5 10L12 17l-4.5-4C7.5 9 9 5.5 12 3Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
          <path d="M10 17v4m4-4v4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      );
    case 'antimatter':
      return (
        <svg {...common} viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="1.6" fill="currentColor" />
          <ellipse cx="12" cy="12" rx="9" ry="3.6" stroke="currentColor" strokeWidth="1.4" />
          <ellipse cx="12" cy="12" rx="9" ry="3.6" stroke="currentColor" strokeWidth="1.4" transform="rotate(60 12 12)" />
          <ellipse cx="12" cy="12" rx="9" ry="3.6" stroke="currentColor" strokeWidth="1.4" transform="rotate(120 12 12)" />
        </svg>
      );
    case 'c':
    default:
      return (
        <svg {...common} viewBox="0 0 24 24">
          <path d="M13 3 4 14h6l-1 7 9-11h-6l1-7Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
        </svg>
      );
  }
}

// ---------------------------------------------------------------------------
// Results card
// ---------------------------------------------------------------------------
function ResultsCard() {
  const route = useDapsStore((state) => state.route);
  const loading = useDapsStore((state) => state.routeLoading);
  const routeError = useDapsStore((state) => state.routeError);
  const bodies = useDapsStore((state) => state.bodies);

  if (!route && !loading && !routeError) return null;

  return (
    <section
      aria-live="polite"
      className="rounded-lg bg-white text-[#202124] shadow-[0_1px_3px_rgba(60,64,67,0.3),0_4px_8px_3px_rgba(60,64,67,0.15)]"
    >
      {route ? (
        <RouteDetails route={route} bodies={bodies} />
      ) : (
        <div className="flex items-center gap-3 px-4 py-4">
          {loading ? (
            <>
              <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-[#1a73e8]/30 border-t-[#1a73e8]" />
              <p className="text-[13px] text-[#5f6368]">
                Solving route on the quantum backend…
              </p>
            </>
          ) : (
            <p className="text-[13px] text-[#5f6368]">{routeError}</p>
          )}
        </div>
      )}
    </section>
  );
}

function RouteDetails({ route, bodies }: { route: NavigationRoute; bodies: CelestialBodyLite[] }) {
  const steps = useMemo(() => buildSteps(route, bodies), [route, bodies]);
  const shown = steps.slice(0, 6);
  const hidden = steps.length - shown.length;

  return (
    <>
      <div className="flex items-start justify-between gap-3 px-4 pt-3">
        <div className="min-w-0">
          <p className="text-[22px] font-medium leading-tight text-[#1a73e8]">
            {route.travel.time_human}
          </p>
          <p className="mt-0.5 truncate text-[13px] text-[#5f6368]">
            {formatLy(route.total_distance_ly)} via {route.waypoints.length} waypoints ·{' '}
            {route.travel.label}
          </p>
        </div>
        <StatusChip status={route.status} />
      </div>

      <div className="mt-3 border-t border-[#e8eaed]">
        {shown.map((step, index) => (
          <StepRow key={index} step={step} last={index === shown.length - 1 && hidden === 0} />
        ))}
        {hidden > 0 ? (
          <p className="px-4 py-2 text-[13px] text-[#5f6368]">+{hidden} more steps</p>
        ) : null}
      </div>

      {route.safety.hazards_avoided.length > 0 || route.safety.hazards_crossed.length > 0 ? (
        <div className="border-t border-[#e8eaed] px-4 py-3">
          <p className="text-[12px] font-medium text-[#5f6368]">Hazards</p>
          <ul className="mt-1.5 space-y-1.5">
            {route.safety.hazards_avoided.map((name) => (
              <li key={name} className="flex items-center gap-2 text-[13px]">
                <Dot className="bg-[#0f9d58]" />
                <span className="truncate">{name}</span>
                <span className="ml-auto shrink-0 text-[12px] text-[#0f9d58]">avoided</span>
              </li>
            ))}
            {route.safety.hazards_crossed.map((name) => (
              <li key={name} className="flex items-center gap-2 text-[13px]">
                <Dot className="bg-[#f9ab00]" />
                <span className="truncate">{name}</span>
                <span className="ml-auto shrink-0 text-[12px] text-[#b06000]">crossed</span>
              </li>
            ))}
          </ul>
          {route.safety.min_clearance_ly !== null ? (
            <p className="mt-2 text-[12px] text-[#5f6368]">
              Minimum clearance {formatLy(route.safety.min_clearance_ly)}
            </p>
          ) : null}
        </div>
      ) : null}

      {route.warnings.length > 0 ? (
        <ul className="space-y-1 border-t border-[#e8eaed] px-4 py-3">
          {route.warnings.slice(0, 3).map((warning) => (
            <li key={warning} className="flex gap-2 text-[12.5px] leading-snug text-[#b06000]">
              <WarningIcon />
              {warning}
            </li>
          ))}
        </ul>
      ) : null}

      <details className="border-t border-[#e8eaed] px-4 py-2.5">
        <summary className="flex cursor-pointer list-none items-center gap-2 text-[13px] font-medium text-[#1a73e8]">
          <ChevronIcon />
          Quantum telemetry
        </summary>
        <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1">
          <TelemetryRow k="Backend" v={route.quantum.backend.split(' (')[0] ?? route.quantum.backend} />
          <TelemetryRow k="Qubits" v={String(route.quantum.qubits)} />
          <TelemetryRow k="Candidates" v={String(route.quantum.candidates_evaluated)} />
          <TelemetryRow k="Feasible" v={String(route.quantum.feasible_candidates)} />
          <TelemetryRow k="Grover iters" v={String(route.quantum.grover_iterations)} />
          <TelemetryRow k="Shots" v={route.quantum.shots.toLocaleString('en-US')} />
          <TelemetryRow k="Chosen P" v={formatPercent(route.quantum.chosen_probability)} />
          <TelemetryRow k="Circuit depth" v={String(route.quantum.circuit_depth)} />
          <TelemetryRow k="Sim time" v={`${route.quantum.sim_time_ms.toFixed(1)} ms`} />
          <TelemetryRow k="Bitstring" v={route.quantum.chosen_bitstring ?? '—'} />
        </dl>
      </details>
    </>
  );
}

// ---------------------------------------------------------------------------
// Steps
// ---------------------------------------------------------------------------
type StepIcon = 'depart' | 'continue' | 'avoid' | 'arrive' | 'exposed';

interface Step {
  icon: StepIcon;
  title: string;
  detail?: string;
}

type CelestialBodyLite = { name: string; coordinates: { x: number; y: number; z: number } };

function buildSteps(route: NavigationRoute, bodies: CelestialBodyLite[]): Step[] {
  const startName = nearestName(bodies, route.start) ?? 'origin';
  const endName = nearestName(bodies, route.end) ?? 'destination';

  const steps: Step[] = [
    { icon: 'depart', title: `Depart ${startName}`, detail: 'Join the plotted trajectory' },
  ];

  const points = [route.start, ...route.waypoints.slice(1, -1)];
  for (let index = 1; index < route.waypoints.length - 1; index += 1) {
    const leg = distanceBetween(route.waypoints[index - 1]!, route.waypoints[index]!);
    steps.push({
      icon: 'continue',
      title: `Continue to waypoint ${index}`,
      detail: formatLy(leg),
    });
  }
  void points;

  for (const name of route.safety.hazards_avoided.slice(0, 2)) {
    steps.push({ icon: 'avoid', title: `Clear ${name}`, detail: 'hazard zone avoided' });
  }
  for (const name of route.safety.hazards_crossed.slice(0, 1)) {
    steps.push({ icon: 'exposed', title: `Cross ${name}`, detail: 'exposure expected' });
  }

  steps.push({
    icon: 'arrive',
    title: `Arrive ${endName}`,
    detail: `${formatLy(route.straight_line_ly)} direct line from origin`,
  });

  return steps;
}

function StepRow({ step, last }: { step: Step; last: boolean }) {
  return (
    <div className="flex gap-3 px-4 py-2">
      <div className="flex w-7 shrink-0 flex-col items-center">
        <span
          className={cn(
            'grid h-7 w-7 place-items-center rounded-full',
            step.icon === 'exposed' ? 'bg-[#fef7e0] text-[#b06000]' : 'bg-[#f1f3f4] text-[#5f6368]',
          )}
        >
          <StepGlyph icon={step.icon} />
        </span>
        {!last ? <span className="mt-1 w-[2px] flex-1 bg-[#dadce0]" /> : null}
      </div>
      <div className="min-w-0 pb-1">
        <p className="truncate text-[14px] leading-snug text-[#202124]">{step.title}</p>
        {step.detail ? <p className="text-[12.5px] text-[#5f6368]">{step.detail}</p> : null}
      </div>
    </div>
  );
}

function StepGlyph({ icon }: { icon: StepIcon }) {
  const common = { className: 'h-[15px] w-[15px]', fill: 'none', 'aria-hidden': true } as const;

  switch (icon) {
    case 'depart':
      return (
        <svg {...common} viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="5" stroke="currentColor" strokeWidth="2" />
        </svg>
      );
    case 'continue':
      return (
        <svg {...common} viewBox="0 0 24 24">
          <path d="M12 20v-9m0 0-4 4m4-4 4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'avoid':
      return (
        <svg {...common} viewBox="0 0 24 24">
          <path d="M12 3 5 6v5c0 4.4 2.9 8.4 7 9.7 4.1-1.3 7-5.3 7-9.7V6l-7-3Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        </svg>
      );
    case 'exposed':
      return (
        <svg {...common} viewBox="0 0 24 24">
          <path d="M12 4 2.8 20h18.4L12 4Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
          <path d="M12 10v4.5m0 2.5v.1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      );
    case 'arrive':
    default:
      return (
        <svg {...common} viewBox="0 0 24 24">
          <path d="M12 21s-6.5-5.6-6.5-10a6.5 6.5 0 1 1 13 0c0 4.4-6.5 10-6.5 10Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
          <circle cx="12" cy="11" r="2" stroke="currentColor" strokeWidth="1.8" />
        </svg>
      );
  }
}

// ---------------------------------------------------------------------------
// Corner widgets
// ---------------------------------------------------------------------------
function LivePill() {
  const bodies = useDapsStore((state) => state.bodies);
  const hazards = useDapsStore((state) => state.hazards);
  const catalogError = useDapsStore((state) => state.catalogError);
  const online = bodies.length > 0 && !catalogError;

  return (
    <div className="pointer-events-auto absolute right-4 top-4 flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-[13px] text-[#3c4043] shadow-[0_1px_3px_rgba(60,64,67,0.3),0_4px_8px_3px_rgba(60,64,67,0.15)]">
      <span
        className={cn(
          'h-2 w-2 rounded-full',
          online ? 'bg-[#0f9d58]' : catalogError ? 'bg-[#d93025]' : 'bg-[#f9ab00]',
        )}
      />
      {online ? 'Live' : catalogError ? 'Offline' : 'Linking'}
      <span className="text-[#5f6368]">
        {bodies.length} objects · {hazards.length} hazards
      </span>
    </div>
  );
}

function BottomRightControls() {
  const panelOpen = useDapsStore((state) => state.panelOpen);
  const setPanelOpen = useDapsStore((state) => state.setPanelOpen);
  const requestZoom = useDapsStore((state) => state.requestZoom);

  return (
    <div
      className="pointer-events-auto absolute bottom-10 flex flex-col items-end gap-2 transition-all"
      style={{ right: panelOpen ? 376 : 16 }}
    >
      {!panelOpen ? (
        <button
          type="button"
          onClick={() => setPanelOpen(true)}
          title="Show 2D galactic map"
          className="grid h-[52px] w-[52px] place-items-center gap-0.5 rounded-lg bg-white text-[#3c4043] shadow-[0_1px_3px_rgba(60,64,67,0.3),0_4px_8px_3px_rgba(60,64,67,0.15)] transition hover:bg-[#f8f9fa]"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden="true">
            <path d="m9 4-5 2v14l5-2 6 2 5-2V4l-5 2-6-2Zm0 0v14m6-12v14" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
          </svg>
          <span className="text-[10px] font-medium">2D map</span>
        </button>
      ) : null}

      <div className="overflow-hidden rounded-lg bg-white shadow-[0_1px_3px_rgba(60,64,67,0.3),0_4px_8px_3px_rgba(60,64,67,0.15)]">
        <button
          type="button"
          onClick={() => requestZoom(1)}
          aria-label="Zoom in"
          className="grid h-10 w-10 place-items-center text-[#3c4043] transition hover:bg-[#f1f3f4]"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden="true">
            <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>
        <div className="h-px bg-[#e8eaed]" />
        <button
          type="button"
          onClick={() => requestZoom(-1)}
          aria-label="Zoom out"
          className="grid h-10 w-10 place-items-center text-[#3c4043] transition hover:bg-[#f1f3f4]"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden="true">
            <path d="M5 12h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}

function Attribution() {
  return (
    <p className="pointer-events-none absolute bottom-1 left-4 rounded bg-white/85 px-1.5 py-0.5 text-[11px] leading-tight text-[#5f6368]">
      DAPS map data · SPHEREx mock catalogue · Qiskit Aer routing · NASA Space Apps
    </p>
  );
}

function HoveredBodyPill() {
  const hoveredBodyId = useDapsStore((state) => state.hoveredBodyId);
  const bodies = useDapsStore((state) => state.bodies);
  const hovered = bodies.find((body) => body.id === hoveredBodyId) ?? null;

  if (!hovered) return null;

  return (
    <div className="pointer-events-none absolute bottom-10 left-1/2 -translate-x-1/2 rounded-full bg-white px-4 py-2 text-[13px] text-[#202124] shadow-[0_1px_3px_rgba(60,64,67,0.3),0_4px_8px_3px_rgba(60,64,67,0.15)]">
      {hovered.name}
      <span className="text-[#5f6368]">
        {' '}
        · {hovered.spectral_class ?? hovered.body_type} · {formatLy(hovered.distance_from_sol_ly)}{' '}
        from Sol
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Small pieces
// ---------------------------------------------------------------------------
function DirectionsIcon() {
  return (
    <span className="grid h-7 w-7 place-items-center rounded-full bg-[#e8f0fe] text-[#1a73e8]">
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden="true">
        <path
          d="M3 17c4-1 5-9 9-10m0 0-2-2m2 2-2 2M12 7c4 1 5 9 9 10m0 0-2-2m2 2-2 2"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

function StatusChip({ status }: { status: RouteStatus }) {
  const styles: Record<RouteStatus, string> = {
    optimal: 'bg-[#e6f4ea] text-[#0f9d58]',
    compromised: 'bg-[#fef7e0] text-[#b06000]',
    unreachable: 'bg-[#fce8e6] text-[#d93025]',
  };
  const copy: Record<RouteStatus, string> = {
    optimal: 'Optimal',
    compromised: 'Compromised',
    unreachable: 'Unreachable',
  };

  return (
    <span
      className={cn(
        'shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium',
        styles[status],
      )}
    >
      {copy[status]}
    </span>
  );
}

function TelemetryRow({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex min-w-0 items-baseline justify-between gap-2 border-b border-[#f1f3f4] py-1">
      <dt className="shrink-0 text-[12px] text-[#5f6368]">{k}</dt>
      <dd className="truncate text-right text-[12px] text-[#202124]" title={v}>
        {v}
      </dd>
    </div>
  );
}

function Dot({ className }: { className: string }) {
  return <span className={cn('h-2 w-2 shrink-0 rounded-full', className)} />;
}

function WarningIcon() {
  return (
    <svg viewBox="0 0 24 24" className="mt-[2px] h-4 w-4 shrink-0" fill="none" aria-hidden="true">
      <path d="M12 4 2.8 20h18.4L12 4Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M12 10v4.5m0 2.5v.1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden="true">
      <path d="m6 9 6 6 6-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------
function nearestName(
  bodies: CelestialBodyLite[],
  point: { x: number; y: number; z: number },
): string | null {
  let best: string | null = null;
  let bestDistance = Infinity;

  for (const body of bodies) {
    const distance = distanceBetween(body.coordinates, point);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = body.name;
    }
  }

  return bestDistance < 50 ? best : null;
}

function distanceBetween(
  a: { x: number; y: number; z: number },
  b: { x: number; y: number; z: number },
): number {
  return Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
}

function formatLy(value: number): string {
  if (!Number.isFinite(value)) return '—';
  if (value >= 1_000) return `${Math.round(value).toLocaleString('en-US')} ly`;
  if (value >= 1) return `${value.toFixed(2)} ly`;
  return `${value.toFixed(3)} ly`;
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ');
}
