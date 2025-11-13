'use client';

import React from 'react';
import type { XRStore } from '@react-three/xr';

export default function VRButton() {
  const [mounted, setMounted] = React.useState(false);
  const [xrStore, setXrStore] = React.useState<XRStore | null>(null);

  React.useEffect(() => {
    setMounted(true);

    // Dynamically import the XR store on client-side
    import('./VRSceneClient').then((module) => {
      const store = typeof module.getXRStore === 'function' ? module.getXRStore() : module.xrStore;
      setXrStore(store ?? null);
    });
  }, []);

  if (!mounted || !xrStore) return null;

  return (
    <button
      onClick={() => xrStore.enterVR()}
      className="px-6 py-3 bg-[#D4AF37] text-black font-bold rounded-lg hover:bg-[#F4CF57] transition-colors shadow-lg"
    >
      🥽 Enter VR
    </button>
  );
}
