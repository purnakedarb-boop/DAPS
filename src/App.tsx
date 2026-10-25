import { Canvas } from '@react-three/fiber';
import { Suspense, useEffect } from 'react';

import { GalacticPanel } from './components/GalacticPanel';
import { GalaxyScene } from './components/GalaxyScene';
import { NavigationHUD } from './components/NavigationHUD';
import { useDapsStore } from './store';

export default function App() {
  const fetchCatalog = useDapsStore((state) => state.fetchCatalog);
  const fetchHazards = useDapsStore((state) => state.fetchHazards);
  const startPolling = useDapsStore((state) => state.startPolling);

  useEffect(() => {
    void fetchCatalog();
    void fetchHazards();
    const stopPolling = startPolling();
    return stopPolling;
  }, [fetchCatalog, fetchHazards, startPolling]);

  return (
    <div className="relative h-dvh w-screen overflow-hidden bg-slate-950 text-slate-100">
      <Canvas
        camera={{ position: [4, 34, 52], fov: 50, near: 0.05, far: 2000 }}
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
        onCreated={({ gl }) => gl.setClearColor('#020617')}
      >
        <Suspense fallback={null}>
          <GalaxyScene />
        </Suspense>
      </Canvas>

      {/* Vignette keeps the HUD readable without dimming the 3D content. */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_42%,rgba(2,6,23,0.82))]" />

      <NavigationHUD />
      <GalacticPanel />
    </div>
  );
}
