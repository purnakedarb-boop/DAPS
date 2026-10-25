import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';

import { useDapsStore, type HazardZone } from '../store';
import { hazardPalette, hazardVisualRadius, toScene } from '../lib/scene';

/**
 * Active hazard spheres.
 *
 * Each zone is a translucent MeshStandardMaterial shell (so the lights and the
 * galactic core tint it) plus a faint wireframe outline for structure. Radii are
 * clamped into a legible range — see `hazardVisualRadius` — while the HUD always
 * quotes the true radius in lightyears.
 */
export function HazardZones() {
  const hazards = useDapsStore((state) => state.hazards);

  return (
    <>
      {hazards
        .filter((hazard) => hazard.active)
        .map((hazard) => (
          <HazardBubble key={hazard.id} hazard={hazard} />
        ))}
    </>
  );
}

interface HazardBubbleProps {
  hazard: HazardZone;
}

function HazardBubble({ hazard }: HazardBubbleProps) {
  const shell = useRef<THREE.Mesh>(null);
  const radius = hazardVisualRadius(hazard.radius_ly);
  const palette = hazardPalette(hazard);

  // Stable per-hazard phase so the zones breathe out of sync instead of pulsing
  // as one object.
  const phase = useMemo(
    () =>
      hazard.id
        .split('')
        .reduce((accumulator, character) => accumulator + character.charCodeAt(0), 0) %
      6.283,
    [hazard.id],
  );

  useFrame(({ clock }) => {
    if (!shell.current) return;
    const pulse = 1 + 0.055 * Math.sin(clock.getElapsedTime() * 0.55 + phase);
    shell.current.scale.setScalar(pulse);
  });

  return (
    <group position={toScene(hazard.center)}>
      <mesh ref={shell} raycast={() => null}>
        <sphereGeometry args={[radius, 32, 32]} />
        <meshStandardMaterial
          color={palette.shell}
          emissive={palette.glow}
          emissiveIntensity={0.6}
          transparent
          opacity={0.05 + hazard.intensity * 0.1}
          depthWrite={false}
          roughness={1}
          metalness={0}
          side={THREE.DoubleSide}
        />
      </mesh>

      <mesh raycast={() => null} scale={1.002}>
        <sphereGeometry args={[radius, 20, 14]} />
        <meshBasicMaterial
          color={palette.glow}
          wireframe
          transparent
          opacity={0.12}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}
