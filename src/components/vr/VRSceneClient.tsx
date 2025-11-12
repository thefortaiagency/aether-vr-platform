'use client';

import React from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Text, OrbitControls } from '@react-three/drei';
import { XR, createXRStore, useXR } from '@react-three/xr';
import * as THREE from 'three';
import { VRControllerScreenshot } from './VRControllerScreenshot';

const CARD_BASE_SIZE: [number, number] = [1.6, 0.95];
const CARD_DEPTH = 0.06;

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
  onBackgroundReady?: (ready: boolean) => void;
}

// Create XR store OUTSIDE component to prevent recreation on re-renders
// Request 'layers' feature for WebXR Layers API support
const xrStore = createXRStore({
  foveation: 0, // Disable foveated rendering for better quality
});

// Gymnasium Environment - renders a true 360° panorama by wrapping the user in a sphere
function PanoramaBackground({
  backgroundImageUrl,
  onReady,
}: {
  backgroundImageUrl?: string;
  onReady?: (ready: boolean) => void;
}) {
  const { scene } = useThree();
  const [texture, setTexture] = React.useState<THREE.Texture | null>(null);
  const previousBackgroundRef = React.useRef<THREE.Texture | null>(null);
  const previousEnvironmentRef = React.useRef<THREE.Texture | null>(null);
  const activeTextureRef = React.useRef<THREE.Texture | null>(null);

  React.useEffect(() => {
    let disposed = false;
    let pendingTexture: THREE.Texture | null = null;

    // Cache any existing background/environment so we can restore it on cleanup
    if (!previousBackgroundRef.current) {
      previousBackgroundRef.current = scene.background as THREE.Texture | null;
    }

    if (!previousEnvironmentRef.current) {
      previousEnvironmentRef.current = scene.environment as THREE.Texture | null;
    }

    if (!backgroundImageUrl) {
      const activeTexture = activeTextureRef.current;

      if (scene.background === activeTexture) {
        scene.background = previousBackgroundRef.current;
      }

      if (scene.environment === activeTexture) {
        scene.environment = previousEnvironmentRef.current;
      }

      setTexture(null);
      onReady?.(false);
      return () => {
        if (pendingTexture) {
          pendingTexture.dispose();
        }
      };
    }

    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin('anonymous');

    loader.load(
      backgroundImageUrl,
      (loaded) => {
        if (disposed) {
          loaded.dispose();
          return;
        }

        loaded.colorSpace = THREE.SRGBColorSpace;
        loaded.wrapS = THREE.ClampToEdgeWrapping;
        loaded.wrapT = THREE.ClampToEdgeWrapping;
        loaded.minFilter = THREE.LinearFilter;
        loaded.magFilter = THREE.LinearFilter;
        loaded.mapping = THREE.EquirectangularReflectionMapping;
        loaded.needsUpdate = true;

        pendingTexture = loaded;
        activeTextureRef.current = loaded;
        setTexture(loaded);

        scene.background = loaded;
        scene.environment = loaded;

        onReady?.(true);

        console.log('[VR BACKGROUND] Panorama loaded', {
          url: backgroundImageUrl,
          texture: loaded.uuid,
        });
      },
      undefined,
      (error) => {
        console.error('[VR BACKGROUND] Failed to load panorama', error);
        setTexture(null);
        onReady?.(false);
      }
    );

    return () => {
      disposed = true;
      const pending = pendingTexture;
      pendingTexture = null;

      const activeTexture = activeTextureRef.current;

      if (pending && pending !== activeTexture) {
        pending.dispose();
      }

      // Restore previous background/environment if we were the active panorama
      if (scene.background === activeTexture) {
        scene.background = previousBackgroundRef.current;
      }

      if (scene.environment === activeTexture) {
        scene.environment = previousEnvironmentRef.current;
      }

      if (activeTexture) {
        activeTexture.dispose();
        activeTextureRef.current = null;
      }

      onReady?.(false);
    };
  }, [backgroundImageUrl, onReady, scene]);

  if (!texture) {
    return null;
  }

  return (
    <mesh scale={-1} frustumCulled={false} rotation={[0, Math.PI, 0]}>
      <sphereGeometry args={[60, 128, 64]} />
      <meshBasicMaterial
        map={texture}
        side={THREE.BackSide}
        toneMapped={false}
        depthWrite={false}
      />
    </mesh>
  );
}

type TechniqueCardState = {
  id: string;
  title: string;
  description: string;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: number;
  color: string;
  videoUrl: string;
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

interface TechniqueCardProps extends TechniqueCardState {
  onPositionChange: (position: [number, number, number]) => void;
  onScaleChange: (scale: number) => void;
}

function useTechniqueVideoTexture(videoUrl: string) {
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const textureRef = React.useRef<THREE.VideoTexture | null>(null);
  const [texture, setTexture] = React.useState<THREE.VideoTexture | null>(null);
  const [isReady, setIsReady] = React.useState(false);
  const [isPlaying, setIsPlaying] = React.useState(false);
  const [isMuted, setIsMuted] = React.useState(true);
  const [dimensions, setDimensions] = React.useState<{ width: number; height: number }>({
    width: 16,
    height: 9,
  });

  React.useEffect(() => {
    setIsReady(false);
    setIsPlaying(false);
    setIsMuted(true);
    setTexture(null);

    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.loop = true;
    video.muted = true;
    video.playsInline = true;
    video.setAttribute('playsinline', 'true');
    video.setAttribute('webkit-playsinline', 'true');
    video.preload = 'auto';
    video.src = videoUrl;
    video.style.position = 'absolute';
    video.style.width = '1px';
    video.style.height = '1px';
    video.style.opacity = '0';
    video.style.pointerEvents = 'none';
    document.body.appendChild(video);

    const texture = new THREE.VideoTexture(video);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;

    videoRef.current = video;
    textureRef.current = texture;
    setTexture(texture);

    const handleLoadedMetadata = () => {
      if (video.videoWidth && video.videoHeight) {
        setDimensions({ width: video.videoWidth, height: video.videoHeight });
      }
    };

    const handleLoadedData = () => {
      setIsReady(true);
      video
        .play()
        .then(() => {
          setIsPlaying(true);
        })
        .catch((error) => {
          console.warn('[TechniqueCard] Autoplay blocked, waiting for user gesture', error);
        });
    };

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleVolumeChange = () => setIsMuted(video.muted);

    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('loadeddata', handleLoadedData);
    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    video.addEventListener('volumechange', handleVolumeChange);

    video.load();

    return () => {
      video.pause();
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('loadeddata', handleLoadedData);
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('volumechange', handleVolumeChange);

      if (video.parentNode) {
        video.parentNode.removeChild(video);
      }

      texture.dispose();
      videoRef.current = null;
      textureRef.current = null;
    };
  }, [videoUrl]);

  useFrame(() => {
    if (textureRef.current) {
      textureRef.current.needsUpdate = true;
    }
  });

  const togglePlayback = React.useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    if (video.paused) {
      video
        .play()
        .then(() => {
          setIsPlaying(true);
        })
        .catch((error) => console.warn('[TechniqueCard] play() failed', error));
    } else {
      video.pause();
    }
  }, []);

  const toggleMute = React.useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    video.muted = !video.muted;
    setIsMuted(video.muted);
  }, []);

  return {
    texture,
    isReady,
    isPlaying,
    isMuted,
    dimensions,
    togglePlayback,
    toggleMute,
  };
}

function TechniqueCard({
  title,
  description,
  position,
  rotation,
  scale,
  color,
  videoUrl,
  onPositionChange,
  onScaleChange,
}: TechniqueCardProps) {
  const cardRef = React.useRef<THREE.Group>(null);
  const dragPlane = React.useMemo(() => new THREE.Plane(new THREE.Vector3(0, 0, 1), position[2]), [position]);
  const intersectionPoint = React.useMemo(() => new THREE.Vector3(), []);
  const raycaster = React.useMemo(() => new THREE.Raycaster(), []);
  const [isDragging, setIsDragging] = React.useState(false);
  const lastPointerId = React.useRef<number | null>(null);
  const dragMoved = React.useRef(false);

  const {
    texture,
    isReady,
    isPlaying,
    isMuted,
    dimensions,
    togglePlayback,
    toggleMute,
  } = useTechniqueVideoTexture(videoUrl);

  const videoAspect = React.useMemo(() => {
    if (!dimensions.width || !dimensions.height) {
      return 16 / 9;
    }
    return dimensions.width / dimensions.height;
  }, [dimensions]);

  const maxVideoWidth = CARD_BASE_SIZE[0] * 0.9;
  const maxVideoHeight = CARD_BASE_SIZE[1] * 0.55;
  let videoWidth = maxVideoWidth;
  let videoHeight = videoWidth / videoAspect;

  if (videoHeight > maxVideoHeight) {
    videoHeight = maxVideoHeight;
    videoWidth = videoHeight * videoAspect;
  }

  const handlePointerDown = (event: any) => {
    event.stopPropagation();
    setIsDragging(true);
    lastPointerId.current = event.pointerId ?? null;
    dragMoved.current = false;
  };

  const handlePointerUp = (event: any) => {
    event.stopPropagation();
    setIsDragging(false);
    if (lastPointerId.current !== null && event.target?.releasePointerCapture) {
      try {
        event.target.releasePointerCapture(lastPointerId.current);
      } catch (err) {
        // Some XR inputs do not support releasePointerCapture
      }
    }
    lastPointerId.current = null;
  };

  const handlePointerMove = (event: any) => {
    if (!isDragging) return;
    event.stopPropagation();

    if (!cardRef.current) return;

    const pointer = event.intersections?.[0]?.point ?? event.point;

    if (pointer) {
      onPositionChange([pointer.x, pointer.y, position[2]]);
      dragMoved.current = true;
      return;
    }

    if (event.ray) {
      raycaster.ray.origin.copy(event.ray.origin);
      raycaster.ray.direction.copy(event.ray.direction);
      raycaster.ray.intersectPlane(dragPlane, intersectionPoint);
      if (!Number.isNaN(intersectionPoint.x)) {
        onPositionChange([intersectionPoint.x, intersectionPoint.y, position[2]]);
        dragMoved.current = true;
      }
    }
  };

  const adjustScale = (delta: number) => {
    const next = clamp(scale + delta, 0.6, 1.8);
    onScaleChange(next);
  };

  const handleWheel = (event: any) => {
    event.stopPropagation();
    const delta = event.deltaY ?? 0;
    if (delta === 0) return;
    adjustScale(delta < 0 ? 0.05 : -0.05);
  };

  const handleCardClick = React.useCallback(
    (event: any) => {
      event.stopPropagation();
      if (dragMoved.current) {
        dragMoved.current = false;
        return;
      }
      togglePlayback();
    },
    [togglePlayback]
  );

  const statusLabel = React.useMemo(() => {
    if (!isReady) return 'Loading';
    return isPlaying ? 'Playing' : 'Paused';
  }, [isPlaying, isReady]);

  const cardFrontZ = CARD_DEPTH / 2 + 0.002;

  const pointerHandlers = {
    onPointerDown: handlePointerDown,
    onPointerUp: handlePointerUp,
    onPointerMove: handlePointerMove,
    onPointerCancel: handlePointerUp,
    onWheel: handleWheel,
  };

  return (
    <group ref={cardRef} position={position} rotation={rotation} scale={scale}>
      <group>
        <mesh {...pointerHandlers}>
          <boxGeometry args={[CARD_BASE_SIZE[0], CARD_BASE_SIZE[1], CARD_DEPTH]} />
          <meshStandardMaterial
            color={color}
            metalness={0.15}
            roughness={0.25}
            emissive={isPlaying ? '#1c64f2' : '#0f172a'}
            emissiveIntensity={isPlaying ? 0.35 : 0.2}
            transparent
            opacity={isDragging ? 0.75 : 0.92}
          />
        </mesh>
        <mesh
          position={[0, 0.05, cardFrontZ]}
          {...pointerHandlers}
          onClick={handleCardClick}
        >
          <planeGeometry args={[videoWidth, videoHeight]} />
          {texture ? (
            <meshBasicMaterial map={texture} toneMapped={false} />
          ) : (
            <meshStandardMaterial
              color="#111827"
              emissive="#1f2937"
              emissiveIntensity={0.4}
              transparent
              opacity={0.8}
            />
          )}
        </mesh>
      </group>
      <Text
        position={[0, CARD_BASE_SIZE[1] / 2 - 0.1, cardFrontZ + 0.01]}
        fontSize={0.14}
        color="#f8fafc"
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.01}
        outlineColor="#000000"
      >
        {title}
      </Text>
      <Text
        position={[0, CARD_BASE_SIZE[1] / 2 - 0.34, cardFrontZ + 0.01]}
        fontSize={0.085}
        color="#e2e8f0"
        maxWidth={1.3}
        lineHeight={1.35}
        anchorX="center"
        anchorY="top"
        outlineWidth={0.006}
        outlineColor="#000000"
      >
        {description}
      </Text>
      <Text
        position={[0, -CARD_BASE_SIZE[1] / 2 + 0.18, cardFrontZ + 0.01]}
        fontSize={0.075}
        color="#cbd5f5"
        anchorX="center"
        anchorY="bottom"
        outlineWidth={0.005}
        outlineColor="#000000"
      >
        Drag to move • Scroll to resize • Tap video to play/pause
      </Text>
      <Text
        position={[CARD_BASE_SIZE[0] / 2 - 0.12, -CARD_BASE_SIZE[1] / 2 + 0.2, cardFrontZ + 0.01]}
        fontSize={0.07}
        color="#38bdf8"
        anchorX="right"
        anchorY="bottom"
        outlineWidth={0.004}
        outlineColor="#000000"
      >
        {scale.toFixed(2)}x
      </Text>
      <Text
        position={[-CARD_BASE_SIZE[0] / 2 + 0.12, -CARD_BASE_SIZE[1] / 2 + 0.2, cardFrontZ + 0.01]}
        fontSize={0.07}
        color={isPlaying ? '#34d399' : '#facc15'}
        anchorX="left"
        anchorY="bottom"
        outlineWidth={0.004}
        outlineColor="#000000"
      >
        {statusLabel}
      </Text>
      <group
        position={[CARD_BASE_SIZE[0] / 2 - 0.18, CARD_BASE_SIZE[1] / 2 - 0.22, cardFrontZ + 0.01]}
        onClick={(event) => {
          event.stopPropagation();
          toggleMute();
        }}
        onPointerDown={(event) => event.stopPropagation()}
        onPointerUp={(event) => event.stopPropagation()}
        onPointerMove={(event) => event.stopPropagation()}
      >
        <mesh>
          <circleGeometry args={[0.09, 24]} />
          <meshStandardMaterial
            color={isMuted ? '#f97316' : '#34d399'}
            emissive={isMuted ? '#f97316' : '#34d399'}
            emissiveIntensity={0.4}
            transparent
            opacity={0.65}
          />
        </mesh>
        <Text
          position={[0, 0, 0.01]}
          fontSize={0.1}
          color="#0f172a"
          anchorX="center"
          anchorY="middle"
        >
          {isMuted ? '🔇' : '🔊'}
        </Text>
      </group>
    </group>
  );
}
// Draggable 3D Video Panel for VR
const TECHNIQUE_CARD_PRESETS: TechniqueCardState[] = [
  {
    id: 'stance',
    title: 'Athletic Stance',
    description: 'Knees bent, chest over toes, hands ready. Drive from hips and keep weight centered.',
    position: [-2.2, 1.5, -3.2],
    rotation: [0, Math.PI / 14, 0],
    scale: 1,
    color: '#1f2937',
    videoUrl: '/video/latora30.mp4',
  },
  {
    id: 'hand-fight',
    title: 'Hand Fighting',
    description: 'Win inside ties. Snap, club, and clear wrists until you feel the opening.',
    position: [-0.8, 1.7, -3],
    rotation: [0, Math.PI / 26, 0],
    scale: 1,
    color: '#1f2a44',
    videoUrl: '/video/latora30.mp4',
  },
  {
    id: 'setup',
    title: 'Shot Setups',
    description: 'Change levels, fake high, shoot through. Eyes up and trail leg tight.',
    position: [0.6, 1.55, -3],
    rotation: [0, -Math.PI / 26, 0],
    scale: 1,
    color: '#1d3557',
    videoUrl: '/video/latora30.mp4',
  },
  {
    id: 'finish',
    title: 'Finish Mechanics',
    description: 'Cut the corner, head in the ribs, climb the body. Never stay on your knees.',
    position: [2, 1.45, -3.1],
    rotation: [0, -Math.PI / 18, 0],
    scale: 1,
    color: '#14213d',
    videoUrl: '/video/latora30.mp4',
  },
  {
    id: 'mat-return',
    title: 'Mat Return',
    description: 'Lift with legs, block hips, return with control. Land them flat every time.',
    position: [-1.3, 0.65, -2.8],
    rotation: [0, Math.PI / 20, 0],
    scale: 0.95,
    color: '#1c1f3a',
    videoUrl: '/video/latora30.mp4',
  },
  {
    id: 'chain',
    title: 'Chain Wrestling',
    description: 'Two steps ahead. Flow from setups to finishes to rides without pausing.',
    position: [1.1, 0.7, -2.9],
    rotation: [0, -Math.PI / 28, 0],
    scale: 0.98,
    color: '#192742',
    videoUrl: '/video/latora30.mp4',
  },
];

// Main VR Scene Content
function VRSceneContent({ backgroundImageUrl, onScreenshot, onBackgroundReady }: VRSceneProps) {
  const [cards, setCards] = React.useState<TechniqueCardState[]>(() => TECHNIQUE_CARD_PRESETS);
  const { isPresenting } = useXR();

  const updateCardPosition = React.useCallback((id: string, position: [number, number, number]) => {
    setCards((prev) =>
      prev.map((card) => (card.id === id ? { ...card, position } : card))
    );
  }, []);

  const updateCardScale = React.useCallback((id: string, scale: number) => {
    setCards((prev) =>
      prev.map((card) => (card.id === id ? { ...card, scale } : card))
    );
  }, []);

  return (
    <>
      {/* VR Controller Screenshot Support - Press Y/B button or grip to take screenshot */}
      {onScreenshot && <VRControllerScreenshot onScreenshot={onScreenshot} />}

      {/* Good lighting for VR */}
      <ambientLight intensity={1.0} />
      <directionalLight position={[0, 10, 0]} intensity={1.0} />

      <PanoramaBackground backgroundImageUrl={backgroundImageUrl} onReady={onBackgroundReady} />

      {!isPresenting && (
        <OrbitControls
          makeDefault
          enablePan={false}
          enableZoom={false}
          target={[0, 1.35, -3]}
          minPolarAngle={Math.PI / 6}
          maxPolarAngle={(2 * Math.PI) / 3}
        />
      )}

      <group position={[0, 1.35, -3]}>
        {cards.map((card) => (
          <TechniqueCard
            key={card.id}
            {...card}
            onPositionChange={(next) => updateCardPosition(card.id, next)}
            onScaleChange={(next) => updateCardScale(card.id, next)}
          />
        ))}
      </group>
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
        <XR store={xrStore} referenceSpace="local-floor" foveation={0}>
          <VRSceneContent {...props} />
        </XR>
      </Canvas>
    </div>
  );
}

// Export the XR store for use in VR buttons
export { xrStore };
