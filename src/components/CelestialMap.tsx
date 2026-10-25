import { Billboard, Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';

import { useDapsStore, type CelestialBody } from '../store';
import {
  bodyColor,
  bodyVisualScale,
  HIT_RADIUS,
  toScene,
} from '../lib/scene';

/**
 * The catalogue layer.
 *
 * All 90 non-core objects are drawn with two InstancedMeshes: one visible mesh
 * (per-instance colour and scale) and one invisible pick mesh with a much larger
 * radius, because a 0.09-unit star is a 2-pixel target when the whole galaxy is
 * in frame. Raycasting the pick mesh yields `instanceId`, which maps back to the
 * body array and fills the destination in the store.
 */
export function CelestialMap() {
  const bodies = useDapsStore((state) => state.bodies);
  const startId = useDapsStore((state) => state.startId);
  const endId = useDapsStore((state) => state.endId);
  const hoveredBodyId = useDapsStore((state) => state.hoveredBodyId);
  const selectDestination = useDapsStore((state) => state.selectDestination);
  const setHoveredBody = useDapsStore((state) => state.setHoveredBody);

  const markers = useMemo(
    () => bodies.filter((body) => body.body_type !== 'exotic'),
    [bodies],
  );
  const core = useMemo(
    () => bodies.find((body) => body.body_type === 'exotic') ?? null,
    [bodies],
  );
  const sol = useMemo(() => bodies.find((body) => body.name === 'Sol') ?? null, [bodies]);

  const start = bodies.find((body) => body.id === startId) ?? null;
  const end = bodies.find((body) => body.id === endId) ?? null;
  const hovered = bodies.find((body) => body.id === hoveredBodyId) ?? null;

  return (
    <group>
      <InstancedBodies
        bodies={markers}
        onSelect={selectDestination}
        onHover={setHoveredBody}
      />

      {core ? (
        <GalacticCore body={core} onSelect={selectDestination} onHover={setHoveredBody} />
      ) : null}

      {start ? <SelectionRing body={start} color="#22d3ee" /> : null}
      {end ? <SelectionRing body={end} color="#c084fc" /> : null}

      <BodyLabels pinned={[core, sol]} hovered={hovered} />
    </group>
  );
}

interface InstancedBodiesProps {
  bodies: CelestialBody[];
  onSelect: (body: CelestialBody) => void;
  onHover: (id: string | null) => void;
}

function InstancedBodies({ bodies, onSelect, onHover }: InstancedBodiesProps) {
  const visualRef = useRef<THREE.InstancedMesh>(null);
  const pickRef = useRef<THREE.InstancedMesh>(null);

  const starGeometry = useMemo(() => new THREE.IcosahedronGeometry(1, 2), []);
  const starMaterial = useMemo(() => new THREE.MeshBasicMaterial({ toneMapped: false }), []);
  const pickGeometry = useMemo(() => new THREE.SphereGeometry(1, 8, 8), []);
  const pickMaterial = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0,
        depthWrite: false,
        colorWrite: false,
      }),
    [],
  );

  useEffect(
    () => () => {
      starGeometry.dispose();
      starMaterial.dispose();
      pickGeometry.dispose();
      pickMaterial.dispose();
    },
    [starGeometry, starMaterial, pickGeometry, pickMaterial],
  );

  useLayoutEffect(() => {
    const visual = visualRef.current;
    const pick = pickRef.current;
    if (!visual || !pick) return;

    const dummy = new THREE.Object3D();
    const tint = new THREE.Color();

    bodies.forEach((body, index) => {
      const [x, y, z] = toScene(body.coordinates);

      dummy.position.set(x, y, z);
      dummy.scale.setScalar(bodyVisualScale(body));
      dummy.updateMatrix();
      visual.setMatrixAt(index, dummy.matrix);
      visual.setColorAt(index, tint.set(bodyColor(body)));

      dummy.scale.setScalar(HIT_RADIUS);
      dummy.updateMatrix();
      pick.setMatrixAt(index, dummy.matrix);
    });

    visual.instanceMatrix.needsUpdate = true;
    if (visual.instanceColor) visual.instanceColor.needsUpdate = true;
    pick.instanceMatrix.needsUpdate = true;

    // Bounding volumes are computed from the geometry, not the instances, so we
    // widen them and disable frustum culling below to avoid stars vanishing
    // when the orbit target drifts off the origin.
    visual.computeBoundingSphere();
    pick.computeBoundingSphere();
  }, [bodies]);

  if (bodies.length === 0) return null;

  return (
    <>
      <instancedMesh
        ref={visualRef}
        args={[starGeometry, starMaterial, bodies.length]}
        frustumCulled={false}
        raycast={() => null}
      />

      <instancedMesh
        ref={pickRef}
        args={[pickGeometry, pickMaterial, bodies.length]}
        frustumCulled={false}
        onClick={(event) => {
          event.stopPropagation();
          if (event.instanceId === undefined) return;
          const body = bodies[event.instanceId];
          if (body) onSelect(body);
        }}
        onPointerOver={(event) => {
          event.stopPropagation();
          if (event.instanceId === undefined) return;
          const body = bodies[event.instanceId];
          if (!body) return;
          onHover(body.id);
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={() => {
          onHover(null);
          document.body.style.cursor = 'auto';
        }}
      />
    </>
  );
}

interface CoreProps {
  body: CelestialBody;
  onSelect: (body: CelestialBody) => void;
  onHover: (id: string | null) => void;
}

/** Sagittarius A*: the origin of the grid, rendered as a bright core with rings. */
function GalacticCore({ body, onSelect, onHover }: CoreProps) {
  const innerRing = useRef<THREE.Mesh>(null);
  const outerRing = useRef<THREE.Mesh>(null);
  const position = toScene(body.coordinates);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (innerRing.current) innerRing.current.rotation.z = t * 0.12;
    if (outerRing.current) outerRing.current.rotation.z = -t * 0.08;
  });

  return (
    <group position={position}>
      <mesh
        onClick={(event) => {
          event.stopPropagation();
          onSelect(body);
        }}
        onPointerOver={(event) => {
          event.stopPropagation();
          onHover(body.id);
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={() => {
          onHover(null);
          document.body.style.cursor = 'auto';
        }}
      >
        <sphereGeometry args={[0.26, 32, 32]} />
        <meshStandardMaterial
          color="#f8fafc"
          emissive="#a78bfa"
          emissiveIntensity={2.6}
          roughness={0.35}
          metalness={0.15}
          toneMapped={false}
        />
      </mesh>

      <mesh ref={innerRing} rotation={[Math.PI / 2.3, 0.2, 0]} raycast={() => null}>
        <torusGeometry args={[0.46, 0.015, 16, 96]} />
        <meshBasicMaterial color="#c4b5fd" transparent opacity={0.75} toneMapped={false} />
      </mesh>

      <mesh ref={outerRing} rotation={[Math.PI / 1.7, -0.5, 0]} raycast={() => null}>
        <torusGeometry args={[0.64, 0.008, 12, 96]} />
        <meshBasicMaterial color="#818cf8" transparent opacity={0.45} toneMapped={false} />
      </mesh>

      <pointLight color="#c4b5fd" intensity={60} distance={40} decay={2} />
    </group>
  );
}

interface SelectionRingProps {
  body: CelestialBody;
  color: string;
}

/** Camera-facing ring marking the chosen departure/destination. */
function SelectionRing({ body, color }: SelectionRingProps) {
  const group = useRef<THREE.Group>(null);
  const position = toScene(body.coordinates);

  useFrame(({ clock }) => {
    if (!group.current) return;
    const scale = 1 + 0.06 * Math.sin(clock.getElapsedTime() * 2.2);
    group.current.scale.setScalar(scale);
  });

  return (
    <group position={position}>
      <Billboard>
        <group ref={group}>
          <mesh raycast={() => null}>
            <ringGeometry args={[0.34, 0.39, 48]} />
            <meshBasicMaterial
              color={color}
              transparent
              opacity={0.9}
              side={THREE.DoubleSide}
              toneMapped={false}
            />
          </mesh>
        </group>
      </Billboard>
    </group>
  );
}

interface BodyLabelsProps {
  pinned: (CelestialBody | null)[];
  hovered: CelestialBody | null;
}

function BodyLabels({ pinned, hovered }: BodyLabelsProps) {
  const labels = [...pinned.filter((body): body is CelestialBody => Boolean(body))];
  if (hovered && !labels.some((body) => body.id === hovered.id)) {
    labels.push(hovered);
  }

  return (
    <>
      {labels.map((body) => (
        <Html
          key={body.id}
          position={toScene(body.coordinates)}
          center
          zIndexRange={[30, 0]}
          className="pointer-events-none"
        >
          <div className="whitespace-nowrap rounded-full border border-white/15 bg-slate-950/75 px-2 py-0.5 text-[10px] font-medium tracking-[0.14em] text-slate-200 shadow-lg backdrop-blur-sm">
            {body.body_type === 'exotic' ? 'SGR A*' : body.name.toUpperCase()}
          </div>
        </Html>
      ))}
    </>
  );
}
