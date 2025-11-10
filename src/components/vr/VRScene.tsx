'use client';

import React from 'react';
import dynamic from 'next/dynamic';

interface VRSceneProps {
  activeExercise: string;
  showCoach: boolean;
  videoEnabled: boolean;
  onVRStart: () => void;
  onVREnd: () => void;
  backgroundImageUrl?: string;
  roomName?: string;
  userName?: string;
}

// Dynamically import the actual VR scene to prevent SSR issues
const VRSceneClient = dynamic(() => import('./VRSceneClient'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full bg-transparent flex items-center justify-center">
      <div className="text-white text-xl">Loading VR...</div>
    </div>
  ),
});

// Main wrapper component
export default function VRScene(props: VRSceneProps) {
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="w-full h-full bg-transparent flex items-center justify-center">
        <div className="text-white text-xl">Loading VR...</div>
      </div>
    );
  }

  return <VRSceneClient {...props} />;
}
