'use client';

import React from 'react';
import { Canvas } from '@react-three/fiber';
import { XR, createXRStore, useXR } from '@react-three/xr';
import * as THREE from 'three';
import { TwilioVideoTexture } from './TwilioVideoTexture';
// import { TwilioVideoLayer } from './TwilioVideoLayer'; // For VR headset testing
import { VideoTexture } from './VideoTexture';
import { VRControllerScreenshot } from './VRControllerScreenshot';
import { AvatarMirror } from './AvatarMirror';
import { BackgroundXRLayer } from './BackgroundXRLayer';
import { VideoXRLayer } from './VideoXRLayer';
import { updateLayerStack, supportsXRLayers } from '@/lib/xr-layers';

interface VRSceneProps {
  activeExercise: string;
  showCoach: boolean;
  videoEnabled: boolean;
  showMirror?: boolean; // Avatar mirror with pose tracking
  onVRStart: () => void;
  onVREnd: () => void;
  backgroundImageUrl?: string;
  roomName?: string;
  userName?: string;
  onScreenshot?: () => void; // Add screenshot callback
  cameraDeviceId?: string; // Camera selection for mirror
}

// Create XR store OUTSIDE component to prevent recreation on re-renders
// Request 'layers' feature for WebXR Layers API support
const xrStore = createXRStore({
  foveation: 0, // Disable foveated rendering for better quality
});

// Gymnasium Environment - Curved background screen for VR (not full 360°)
function Gymnasium({ backgroundImageUrl }: { backgroundImageUrl?: string }) {
  const [texture, setTexture] = React.useState<THREE.Texture | null>(null);

  React.useEffect(() => {
    if (typeof window === 'undefined') return;

    console.log('[GYMNASIUM] Background URL:', backgroundImageUrl);

    if (!backgroundImageUrl) {
      console.log('[GYMNASIUM] No background URL provided');
      setTexture(null);
      return;
    }

    console.log('[GYMNASIUM] Loading texture from:', backgroundImageUrl);
    const loader = new THREE.TextureLoader();

    let loadedTexture: THREE.Texture | null = null;

    loader.load(
      backgroundImageUrl,
      // onLoad - Success callback
      (tex) => {
        console.log('[GYMNASIUM] ✅ Texture loaded successfully');
        console.log('[GYMNASIUM] Image dimensions:', tex.image.width, 'x', tex.image.height);

        tex.colorSpace = THREE.SRGBColorSpace;
        tex.minFilter = THREE.LinearFilter;
        tex.magFilter = THREE.LinearFilter;
        tex.needsUpdate = true;

        loadedTexture = tex;
        setTexture(tex);
        console.log('[GYMNASIUM] ✅ Texture state updated, should render background');
      },
      // onProgress - Loading callback
      (xhr) => {
        const percentComplete = xhr.total > 0 ? (xhr.loaded / xhr.total) * 100 : 0;
        console.log('[GYMNASIUM] Loading progress:', percentComplete.toFixed(0) + '%');
      },
      // onError - Error callback
      (error) => {
        console.error('[GYMNASIUM] ❌ Failed to load texture:', error);
        console.error('[GYMNASIUM] ❌ URL was:', backgroundImageUrl);
      }
    );

    return () => {
      console.log('[GYMNASIUM] Cleanup - disposing texture');
      if (loadedTexture) {
        loadedTexture.dispose();
      }
    };
  }, [backgroundImageUrl]);

  console.log('[GYMNASIUM] Rendering - texture exists:', !!texture);

  return (
    <>
      {/* MINIMAL TEST - Only dark skybox, no texture */}
      <mesh>
        <sphereGeometry args={[50, 32, 32]} />
        <meshBasicMaterial color={0x1a1a2e} side={THREE.BackSide} />
      </mesh>

      {/* Simple floor - no shadows */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <planeGeometry args={[100, 100]} />
        <meshBasicMaterial color={0x0a0a15} />
      </mesh>
    </>
  );
}

// Draggable 3D Video Panel for VR
function VideoPanel({ position: initialPosition, rotation, title }: { position: [number, number, number], rotation?: [number, number, number], title: string }) {
  const meshRef = React.useRef<THREE.Mesh>(null);
  const [position, setPosition] = React.useState<[number, number, number]>(initialPosition);
  const [isDragging, setIsDragging] = React.useState(false);

  const handlePointerDown = () => {
    setIsDragging(true);
  };

  const handlePointerUp = () => {
    setIsDragging(false);
  };

  const handlePointerMove = (e: any) => {
    if (isDragging && e.point) {
      setPosition([e.point.x, e.point.y, e.point.z]);
    }
  };

  return (
    <group position={position} rotation={rotation}>
      {/* Video placeholder */}
      <mesh
        ref={meshRef}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerMove={handlePointerMove}
      >
        <planeGeometry args={[2, 1.2]} />
        <meshBasicMaterial
          color={isDragging ? "#FFD700" : "#1a1a1a"}
          opacity={isDragging ? 0.8 : 1}
          transparent
        />
      </mesh>

      {/* Glowing frame for VR visibility */}
      <mesh position={[0, 0, -0.01]}>
        <planeGeometry args={[2.1, 1.3]} />
        <meshBasicMaterial
          color={isDragging ? "#FFD700" : "#00FFFF"}
          emissive={isDragging ? "#FFD700" : "#00FFFF"}
          emissiveIntensity={0.5}
          transparent
          opacity={0.3}
        />
      </mesh>

      {/* Drag hint text */}
      {!isDragging && (
        <mesh position={[0, -0.7, 0.01]}>
          <planeGeometry args={[1.8, 0.2]} />
          <meshBasicMaterial color="#000" opacity={0.5} transparent />
        </mesh>
      )}
    </group>
  );
}

// Main VR Scene Content
function VRSceneContent({ backgroundImageUrl, showCoach, videoEnabled, showMirror = true, roomName, userName, onScreenshot, cameraDeviceId }: VRSceneProps) {
  const [layers, setLayers] = React.useState<{
    background: XREquirectLayer | null;
    technique: XRQuadLayer | null;
  }>({
    background: null,
    technique: null,
  });

  const { session } = useXR();

  // Update layer stack when layers change
  React.useEffect(() => {
    if (!session || !supportsXRLayers()) return;

    const layerArray = [
      layers.background,
      layers.technique,
    ].filter((layer): layer is XRLayer => layer !== null);

    if (layerArray.length > 0) {
      console.log('[VR SCENE] Updating layer stack with', layerArray.length, 'layers');
      updateLayerStack(session, layerArray);
    }
  }, [session, layers.background, layers.technique]);

  return (
    <>
      {/* VR Controller Screenshot Support - Press Y/B button or grip to take screenshot */}
      {onScreenshot && <VRControllerScreenshot onScreenshot={onScreenshot} />}

      {/* VERY BRIGHT lighting for VR visibility */}
      <ambientLight intensity={1.5} />

      {/* Main light from above */}
      <directionalLight position={[0, 20, 0]} intensity={2.0} castShadow />

      {/* Fill light to eliminate shadows */}
      <hemisphereLight intensity={1.0} color="#ffffff" groundColor="#666666" />

      {/* Reference spheres - ALWAYS VISIBLE for VR debugging */}
      {/* Front center - RED */}
      <mesh position={[0, 1.6, -3]}>
        <sphereGeometry args={[0.3]} />
        <meshBasicMaterial color="#ff0000" emissive="#ff0000" emissiveIntensity={2} />
      </mesh>

      {/* Left - GREEN */}
      <mesh position={[-3, 1.6, -3]}>
        <sphereGeometry args={[0.3]} />
        <meshBasicMaterial color="#00ff00" emissive="#00ff00" emissiveIntensity={2} />
      </mesh>

      {/* Right - BLUE */}
      <mesh position={[3, 1.6, -3]}>
        <sphereGeometry args={[0.3]} />
        <meshBasicMaterial color="#0000ff" emissive="#0000ff" emissiveIntensity={2} />
      </mesh>

      {/* Above - YELLOW */}
      <mesh position={[0, 3, -3]}>
        <sphereGeometry args={[0.3]} />
        <meshBasicMaterial color="#ffff00" emissive="#ffff00" emissiveIntensity={2} />
      </mesh>

      {/* 360° BACKGROUND - WebXR Layer (compositor-rendered, saves ~8MB GPU memory) */}
      {backgroundImageUrl && supportsXRLayers() && (
        <BackgroundXRLayer
          imageUrl={backgroundImageUrl}
          onLayerCreated={(layer) => {
            console.log('[VR SCENE] Background layer ready');
            setLayers((prev) => ({ ...prev, background: layer }));
          }}
        />
      )}

      {/* Fallback: Three.js background if Layers API not supported */}
      {backgroundImageUrl && !supportsXRLayers() && (
        <Gymnasium backgroundImageUrl={backgroundImageUrl} />
      )}

      {/* TEMPORARILY DISABLED - Coach video panel */}
      {/* {showCoach && roomName && userName ? (
        <TwilioVideoTexture
          position={[2.5, 1.5, -3]}
          roomName={roomName}
          userName={userName}
          onConnected={() => console.log('🎥 Connected to coach broadcast')}
        />
      ) : showCoach ? (
        <VideoPanel
          position={[2.5, 1.5, -3]}
          rotation={[0, -Math.PI / 6, 0]}
          title="Coach"
        />
      ) : null} */}

      {/* TEMPORARILY DISABLED - Technique video */}
      {/* {videoEnabled && supportsXRLayers() && (
        <VideoXRLayer
          videoUrl="/video/latora30.mp4"
          position={[-2.5, 1.5, -3]}
          rotation={[0, Math.PI / 6, 0]}
          width={1.2}
          height={2.0}
          onLayerCreated={(layer) => {
            console.log('[VR SCENE] Technique video layer ready');
            setLayers((prev) => ({ ...prev, technique: layer }));
          }}
        />
      )}

      {videoEnabled && !supportsXRLayers() && (
        <VideoTexture
          position={[-2.5, 1.5, -3]}
          rotation={[0, Math.PI / 6, 0]}
          videoUrl="/video/latora30.mp4"
          title="Wrestling Technique"
        />
      )} */}

      {/* TEMPORARILY DISABLED - BlazePose Mirror */}
      {/* {showMirror && (
        <AvatarMirror
          position={[0, 1.6, -2]}
          rotation={[0, 0, 0]}
          cameraDeviceId={cameraDeviceId}
        />
      )} */}
    </>
  );
}

// Main VR Scene Component with proper XR initialization
export default function VRSceneClient(props: VRSceneProps) {
  const { onVRStart, onVREnd } = props;

  React.useEffect(() => {
    // Listen to XR session events
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
        onCreated={(state) => {
          console.log('✅ Canvas created, WebGL ready');
        }}
      >
        {/* Wrap scene content with XR component and pass the store */}
        {/* Controllers and hands are enabled by default in v6 - no components needed! */}
        {/* User's avatar is their controllers/hands - Meta handles avatar rendering */}
        {/* Request 'layers' feature for WebXR Layers API support */}
        <XR
          store={xrStore}
          referenceSpace="local-floor"
          foveation={0}
        >
          <VRSceneContent {...props} />
        </XR>
      </Canvas>
    </div>
  );
}

// Export the XR store for use in VR buttons
export { xrStore };
