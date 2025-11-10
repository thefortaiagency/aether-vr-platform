'use client';

import React from 'react';

export default function VRButton() {
  const [mounted, setMounted] = React.useState(false);
  const [xrStore, setXrStore] = React.useState<any>(null);

  React.useEffect(() => {
    setMounted(true);

    // Dynamically import the XR store on client-side
    import('./VRSceneClient').then((module) => {
      setXrStore(module.xrStore);
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
