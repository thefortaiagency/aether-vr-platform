'use client';

import React from 'react';
import { Canvas } from '@react-three/fiber';
import { XR, createXRStore } from '@react-three/xr';

interface VRSceneProps {
  activeExercise: string;
  showCoach: boolean;
  videoEnabled: boolean;
  onVRStart: () => void;
  onVREnd: () => void;
  backgroundImageUrl?: string;
  roomName?: string;
  userName?: string;
  onScreenshot?: () => void;
}

const xrStore = createXRStore({
  foveation: 0,
});

function SimpleScene({ backgroundImageUrl }: { backgroundImageUrl?: string }) {
  return (
    <>
      <ambientLight intensity={0.8} />
      <directionalLight position={[0, 20, 0]} intensity={1.5} />

      {/* Simple box to test rendering */}
      <mesh position={[0, 1.5, -2]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="gold" />
      </mesh>

      {/* Floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[200, 200]} />
        <meshStandardMaterial color="#333" transparent opacity={0} />
      </mesh>

      {/* 360° background sphere (if provided) */}
      {backgroundImageUrl && (
        <mesh>
          <sphereGeometry args={[50, 64, 64]} />
          <meshBasicMaterial color="#444" side={2} />
        </mesh>
      )}
    </>
  );
}

export default function VRSceneSimple(props: VRSceneProps) {
  const { onVRStart, onVREnd, backgroundImageUrl } = props;

  React.useEffect(() => {
    const unsubscribe = xrStore.subscribe((state) => {
      if (state.session) {
        console.log('✅ XR Session started');
        onVRStart();
      } else {
        console.log('⏹️ XR Session ended');
        onVREnd();
      }
    });

    return () => {
      unsubscribe();
    };
  }, [onVRStart, onVREnd]);

  return (
    <div className="w-full h-full">
      <Canvas
        shadows
        camera={{ position: [0, 1.6, 3], fov: 75 }}
        gl={{
          antialias: true,
          alpha: true,
          powerPreference: 'high-performance',
        }}
        style={{ background: 'transparent' }}
        onCreated={() => {
          console.log('✅ Canvas created, WebGL ready');
        }}
      >
        <XR store={xrStore} referenceSpace="local-floor" foveation={0}>
          <SimpleScene backgroundImageUrl={backgroundImageUrl} />
        </XR>
      </Canvas>
    </div>
  );
}

export { xrStore };
