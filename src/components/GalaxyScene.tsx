import { Line, OrbitControls, Stars } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';

import { CelestialMap } from './CelestialMap';
import { HazardZones } from './HazardZones';
import { useDapsStore } from '../store';
import { toScene } from '../lib/scene';

/**
 * The scene graph.
 *
 * Coordinates arrive in lightyears; everything is scaled by 1/1000 into scene
 * units (kilo-lightyears) before it reaches three.js. Controls are deliberately
 * constrained — no panning, bounded zoom, and a polar limit that keeps the camera
 * above the galactic plane — so it is impossible to lose the galaxy entirely.
 */
export function GalaxyScene() {
  return (
    <>
      <color attach="background" args={['#020617']} />

      <ambientLight intensity={0.5} />
      <hemisphereLight args={['#1e293b', '#020617', 0.65]} />

      <Stars radius={140} depth={80} count={5000} factor={5} saturation={0} fade speed={0.25} />

      <OrbitControls
        makeDefault
        target={[-6, 0, 0]}
        enablePan={false}
        enableDamping
        dampingFactor={0.06}
        rotateSpeed={0.45}
        zoomSpeed={0.7}
        minDistance={1.5}
        maxDistance={140}
        minPolarAngle={0.15}
        maxPolarAngle={Math.PI * 0.88}
      />

      <ZoomController />

      <group name="catalog">
        <CelestialMap />
      </group>

      <group name="hazards">
        <HazardZones />
      </group>

      <group name="route">
        <RouteTrajectory />
      </group>
    </>
  );
}

/** Glowing flight path through the returned waypoints, plus a travelling pulse. */
function RouteTrajectory() {
  const route = useDapsStore((state) => state.route);

  const geometry = useMemo(() => {
    if (!route || route.waypoints.length < 2) return null;

    const waypoints = route.waypoints.map(
      (point) => new THREE.Vector3(...toScene(point)),
    );
    // Tension stays tiny on purpose: the rendered curve has to remain on the
    // polyline the backend proved clear, so this only rounds the corners.
    const curve = new THREE.CatmullRomCurve3(waypoints, false, 'catmullrom', 0.04);
    const smooth = curve.getPoints(Math.max(64, waypoints.length * 32));
    const compromised = route.status !== 'optimal';

    return {
      waypoints,
      smooth,
      color: compromised ? '#f9ab00' : '#4285f4',
      glow: compromised ? '#fbbc04' : '#8ab4f8',
    };
  }, [route]);

  if (!geometry) return null;

  return (
    <group>
      <Line
        points={geometry.smooth}
        color={geometry.glow}
        lineWidth={8}
        transparent
        opacity={0.14}
        raycast={() => null}
      />
      <Line
        points={geometry.smooth}
        color={geometry.color}
        lineWidth={2.2}
        transparent
        opacity={0.95}
        raycast={() => null}
      />

      {geometry.waypoints.map((point, index) => (
        <mesh key={`waypoint-${index}`} position={point} raycast={() => null}>
          <sphereGeometry args={[0.07, 12, 12]} />
          <meshBasicMaterial color={geometry.color} toneMapped={false} />
        </mesh>
      ))}

      <TravellingPulse points={geometry.smooth} color={geometry.color} />
    </group>
  );
}

interface TravellingPulseProps {
  points: THREE.Vector3[];
  color: string;
}

function TravellingPulse({ points, color }: TravellingPulseProps) {
  const pulse = useRef<THREE.Mesh>(null);
  const curve = useMemo(
    () => new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.04),
    [points],
  );

  useFrame(({ clock }) => {
    if (!pulse.current) return;
    const progress = (clock.getElapsedTime() * 0.07) % 1;
    pulse.current.position.copy(curve.getPointAt(progress));
  });

  return (
    <mesh ref={pulse} raycast={() => null}>
      <sphereGeometry args={[0.11, 16, 16]} />
      <meshBasicMaterial color={color} toneMapped={false} />
    </mesh>
  );
}

/**
 * Google-Maps-style +/− buttons: dolly the camera toward or away from the
 * control target, clamped by the same min/max distance OrbitControls uses.
 */
function ZoomController() {
  const zoomReq = useDapsStore((state) => state.zoomReq);
  const camera = useThree((state) => state.camera);
  const controls = useThree((state) => state.controls) as unknown as {
    target: THREE.Vector3;
    minDistance: number;
    maxDistance: number;
    update: () => void;
  } | null;

  useEffect(() => {
    if (!zoomReq || !controls) return;

    const offset = camera.position.clone().sub(controls.target);
    const factor = zoomReq.dir === 1 ? 0.78 : 1.28;
    const distance = THREE.MathUtils.clamp(
      offset.length() * factor,
      controls.minDistance,
      controls.maxDistance,
    );

    camera.position.copy(controls.target).add(offset.setLength(distance));
    controls.update();
  }, [zoomReq, controls, camera]);

  return null;
}
