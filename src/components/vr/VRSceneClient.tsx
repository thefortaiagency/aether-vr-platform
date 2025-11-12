'use client';

import React from 'react';
import { Canvas } from '@react-three/fiber';
import { XR, createXRStore, useXR } from '@react-three/xr';
import * as THREE from 'three';
import { TwilioVideoTexture } from './TwilioVideoTexture';
// import { TwilioVideoLayer } from './TwilioVideoLayer'; // For VR headset testing
import { VideoTexture } from './VideoTexture';
import { VideoTextureSimple } from './VideoTextureSimple';
import { VRControllerScreenshot } from './VRControllerScreenshot';
import { AvatarMirror } from './AvatarMirror';
import { WebcamXRLayer } from './WebcamXRLayer';
import { BackgroundXRLayer } from './BackgroundXRLayer';
import { VideoXRLayer } from './VideoXRLayer';
import { updateLayerStack, supportsXRLayers } from '@/lib/xr-layers';
import { ensureCameraAccessFeature } from '@/lib/xr-camera-access';

if (typeof window !== 'undefined') {
  ensureCameraAccessFeature();
}

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
    webcam: XRQuadLayer | null;
  }>({
    background: null,
    technique: null,
    webcam: null,
  });

  const { session, isPresenting } = useXR();
  const showXrEnvironment = Boolean(session && isPresenting);

  // Technique videos configuration
  const radius = 4; // 4 meters from center
  const videoHeight = 1.6; // Eye level
  const techniqueVideos = [
    { name: "Single Leg", angle: 0 },
    { name: "Double Leg", angle: Math.PI / 3 },
    { name: "Cradle", angle: (2 * Math.PI) / 3 },
    { name: "Escape", angle: Math.PI },
    { name: "Standup", angle: (4 * Math.PI) / 3 },
    { name: "Switch", angle: (5 * Math.PI) / 3 },
  ];

  // Update layer stack when layers change
  React.useEffect(() => {
    if (!session || !supportsXRLayers()) return;

    const layerArray = [
      layers.background,
      layers.technique,
      layers.webcam,
    ].filter((layer): layer is XRLayer => layer !== null);

    if (layerArray.length > 0) {
      console.log('[VR SCENE] Updating layer stack with', layerArray.length, 'layers');
      updateLayerStack(session, layerArray);
    }
  }, [session, layers.background, layers.technique, layers.webcam]);

  return (
    <>
      {/* VR Controller Screenshot Support - Press Y/B button or grip to take screenshot */}
      {onScreenshot && <VRControllerScreenshot onScreenshot={onScreenshot} />}

      {/* Good lighting for VR */}
      <ambientLight intensity={1.0} />
      <directionalLight position={[0, 10, 0]} intensity={1.0} />

      {showXrEnvironment && (
        <>
          {/* Dark skybox sphere for immersion */}
          <mesh>
            <sphereGeometry args={[50, 32, 32]} />
            <meshBasicMaterial color={0x0a0a15} side={THREE.BackSide} />
          </mesh>

          {/* Floor */}
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
            <planeGeometry args={[100, 100]} />
            <meshBasicMaterial color={0x1a1a2e} />
          </mesh>
        </>
      )}

      {/* 6 Technique Videos in Circle Formation - Movable/Resizable */}
      {videoEnabled && techniqueVideos.map((video, index) => {
        const x = Math.sin(video.angle) * radius;
        const z = Math.cos(video.angle) * radius;
        return (
          <VideoTextureSimple
            key={`technique-${index}`}
            position={[x, videoHeight, -z]}
            rotation={[0, -video.angle, 0]}
            videoUrl="/video/latora30.mp4"
            title={video.name}
          />
        );
      })}

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

      {/* TEMPORARILY DISABLED - Gymnasium background */}
      {/* {backgroundImageUrl && !supportsXRLayers() && (
        <Gymnasium backgroundImageUrl={backgroundImageUrl} />
      )} */}

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

      {/* Webcam Mirror - Use AvatarMirror for both desktop AND VR */}
      {/* XR Layers causes camera permission issues when transitioning to VR */}
      {showMirror && (
        <AvatarMirror
          position={[0, 1.6, -2]}
          rotation={[0, 0, 0]}
          cameraDeviceId={cameraDeviceId}
          onXRLayerChange={(layer) => {
            setLayers((prev) => ({ ...prev, webcam: layer }));
          }}
        />
      )}
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
          state.gl.setClearColor(new THREE.Color(0x000000), 0);
          state.scene.background = null;
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
