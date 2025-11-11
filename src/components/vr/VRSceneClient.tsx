'use client';

import React, { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { XR, createXRStore, useXR } from '@react-three/xr';
import * as THREE from 'three';
import { TwilioVideoTexture } from './TwilioVideoTexture';
// import { TwilioVideoLayer } from './TwilioVideoLayer'; // For VR headset testing
import { VideoTextureSimple } from './VideoTextureSimple';
import { VRCoachChatbot } from './VRCoachChatbot';
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

// Gymnasium Environment - 360° background sphere
function Gymnasium({ backgroundImageUrl }: { backgroundImageUrl?: string }) {
  const [texture, setTexture] = React.useState<THREE.Texture | null>(null);
  const [isReady, setIsReady] = React.useState(false);
  const textureRef = React.useRef<THREE.Texture | null>(null);

  React.useEffect(() => {
    if (!backgroundImageUrl) return;

    let mounted = true;
    console.log('[GYMNASIUM] 🎨 Loading background:', backgroundImageUrl);

    const loader = new THREE.TextureLoader();

    loader.load(
      backgroundImageUrl,
      // Success
      (tex) => {
        if (!mounted) {
          console.log('[GYMNASIUM] ⚠️ Unmounted, disposing texture');
          tex.dispose();
          return;
        }

        try {
          console.log('[GYMNASIUM] ✅ Texture loaded:', tex.image.width, 'x', tex.image.height);

          tex.colorSpace = THREE.SRGBColorSpace;
          tex.minFilter = THREE.LinearFilter;
          tex.magFilter = THREE.LinearFilter;
          tex.needsUpdate = true;

          textureRef.current = tex;
          setTexture(tex);

          // Small delay to ensure texture is fully ready
          setTimeout(() => {
            if (mounted) {
              setIsReady(true);
              console.log('[GYMNASIUM] ✅ Ready to render');
            }
          }, 100);

        } catch (error) {
          console.error('[GYMNASIUM] ❌ Error setting up texture:', error);
        }
      },
      // Progress
      undefined,
      // Error
      (error) => {
        if (!mounted) return;
        console.error('[GYMNASIUM] ❌ Failed to load:', error);
      }
    );

    return () => {
      mounted = false;
      if (textureRef.current) {
        textureRef.current.dispose();
        textureRef.current = null;
      }
    };
  }, [backgroundImageUrl]);

  // Absolutely do not render until ready
  if (!isReady || !texture) {
    console.log('[GYMNASIUM] Not ready yet - isReady:', isReady, 'texture:', !!texture);
    return null;
  }

  console.log('[GYMNASIUM] 🎬 Rendering background sphere at [0, 0, 0], radius 50');
  console.log('[GYMNASIUM] 🔍 Texture details:', {
    width: texture.image?.width,
    height: texture.image?.height,
    format: texture.format,
    colorSpace: texture.colorSpace
  });

  try {
    return (
      <mesh position={[0, 0, 0]}>
        <sphereGeometry args={[50, 60, 40]} />
        <meshBasicMaterial
          map={texture}
          side={THREE.BackSide}
          toneMapped={false}
        />
      </mesh>
    );
  } catch (error) {
    console.error('[GYMNASIUM] ❌ Render error:', error);
    return null;
  }
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
  // DEBUG: Log props on every render
  console.log('[VR SCENE CONTENT] 🎬 Rendering with props:', {
    backgroundImageUrl,
    showCoach,
    videoEnabled,
    showMirror,
    roomName,
    userName
  });

  const [layers, setLayers] = React.useState<{
    background: XREquirectLayer | null;
    technique: XRQuadLayer | null;
    webcam: XRQuadLayer | null;
  }>({
    background: null,
    technique: null,
    webcam: null,
  });

  const { session } = useXR();

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

  // Calculate positions for 6 videos in a circle
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

  return (
    <>
      {/* Bright VR lighting - like a well-lit gymnasium */}
      <ambientLight intensity={2.5} />
      <directionalLight position={[0, 10, 0]} intensity={2.0} />
      <directionalLight position={[5, 5, 5]} intensity={1.5} />
      <directionalLight position={[-5, 5, -5]} intensity={1.5} />
      <pointLight position={[0, 3, 0]} intensity={2.0} distance={20} />

      {/* 360° Wrestling Room Background */}
      {backgroundImageUrl && (
        <Gymnasium backgroundImageUrl={backgroundImageUrl} />
      )}

      {/* Technique Videos in Circle Formation */}
      {videoEnabled && techniqueVideos.map((video, index) => {
        const x = Math.sin(video.angle) * radius;
        const z = Math.cos(video.angle) * radius;
        console.log(`[VIDEO ${index}] ${video.name} at [${x.toFixed(2)}, ${videoHeight}, ${-z.toFixed(2)}]`);
        return (
          <group key={`technique-${index}`} position={[x, videoHeight, -z]}>
            {/* Debug box to verify positioning */}
            <mesh>
              <boxGeometry args={[2, 1.5, 0.1]} />
              <meshBasicMaterial color="#FFD700" wireframe />
            </mesh>
            <VideoTextureSimple
              position={[0, 0, 0]}
              rotation={[0, -video.angle, 0]}
              videoUrl="/videos/double-leg.mp4"
            />
          </group>
        );
      })}

      {/* VR Coach Chatbot - Floating above at angle */}
      <VRCoachChatbot position={[1.5, 2.2, -1.5]} />
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
    <div className="w-full h-full" style={{ width: '100%', height: '100%', position: 'relative' }}>
      <Canvas
        shadows
        camera={{ position: [0, 1.6, 0.1], fov: 75, near: 0.01, far: 1000 }}
        gl={{
          antialias: true,
          alpha: true,
          powerPreference: 'high-performance',
        }}
        style={{
          width: '100%',
          height: '100%',
          display: 'block'
        }}
        onCreated={(state) => {
          console.log('✅ Canvas created, WebGL ready');
          console.log('📐 Canvas size:', state.gl.domElement.width, 'x', state.gl.domElement.height);
          console.log('📐 Viewport:', state.viewport.width, 'x', state.viewport.height);

          // Camera starts at [0, 1.6, 0.1] looking forward
          // User can look around with mouse/VR to see 360° environment
          state.camera.lookAt(0, 1.6, -5);
          console.log('📷 Camera looking forward into 360° environment');
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
