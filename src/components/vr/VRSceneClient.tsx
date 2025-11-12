'use client';

import React from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, RoundedBox } from '@react-three/drei';
import { XR, createXRStore, useXR } from '@react-three/xr';
import * as THREE from 'three';
import { VRControllerScreenshot } from './VRControllerScreenshot';

const CARD_HEIGHT = 1.05;
const CARD_DEPTH = 0.045;
const CARD_FRAME_PADDING = 0.14;

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

        loaded.flipY = false;
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
    <mesh frustumCulled={false} rotation={[0, Math.PI, 0]}>
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
  position: [number, number, number];
  rotation: [number, number, number];
  scale: number;
  frameColor: string;
  glowColor: string;
  videoUrl: string;
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

interface TechniqueCardProps extends TechniqueCardState {
  onPositionChange: (position: [number, number, number]) => void;
  onScaleChange: (scale: number) => void;
  onRotationChange: (rotation: [number, number, number]) => void;
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
  position,
  rotation,
  scale,
  frameColor,
  glowColor,
  videoUrl,
  onPositionChange,
  onScaleChange,
  onRotationChange,
}: TechniqueCardProps) {
  const cardRef = React.useRef<THREE.Group>(null);
  const dragPlane = React.useMemo(
    () => new THREE.Plane(new THREE.Vector3(0, 0, 1), -position[2]),
    [position[2]]
  );
  const intersectionPoint = React.useMemo(() => new THREE.Vector3(), []);
  const raycaster = React.useMemo(() => new THREE.Raycaster(), []);
  const [isDragging, setIsDragging] = React.useState(false);
  const [isHovered, setIsHovered] = React.useState(false);
  const lastPointerId = React.useRef<number | null>(null);
  const dragMoved = React.useRef(false);
  const rotateDuringDrag = React.useRef(false);
  const pointerDeltaRef = React.useRef<{ x: number; y: number } | null>(null);

  const { texture, isReady, dimensions, togglePlayback } = useTechniqueVideoTexture(videoUrl);

  const videoAspect = React.useMemo(() => {
    if (!dimensions.width || !dimensions.height) {
      return 16 / 9;
    }
    return dimensions.width / dimensions.height;
  }, [dimensions]);

  const safeAspect = clamp(videoAspect, 0.5, 2.5);
  const videoHeight = CARD_HEIGHT;
  const videoWidth = videoHeight * safeAspect;
  const frameWidth = videoWidth + CARD_FRAME_PADDING;
  const frameHeight = videoHeight + CARD_FRAME_PADDING;
  const haloWidth = frameWidth + 0.22;
  const haloHeight = frameHeight + 0.22;
  const highlightStrength = isDragging ? 1 : isHovered ? 0.6 : 0.25;

  const getClientPosition = React.useCallback((event: any) => {
    const native = event?.nativeEvent;
    if (native && typeof native.clientX === 'number' && typeof native.clientY === 'number') {
      return { x: native.clientX, y: native.clientY };
    }
    if (typeof event?.clientX === 'number' && typeof event?.clientY === 'number') {
      return { x: event.clientX, y: event.clientY };
    }
    return null;
  }, []);

  const releasePointerCapture = React.useCallback((event: any) => {
    if (lastPointerId.current !== null && event?.target?.releasePointerCapture) {
      try {
        event.target.releasePointerCapture(lastPointerId.current);
      } catch (error) {
        // Some XR controllers do not support releasePointerCapture
      }
    }
    lastPointerId.current = null;
  }, []);

  const handlePointerDown = (event: any) => {
    event.stopPropagation();
    setIsDragging(true);
    dragMoved.current = false;
    rotateDuringDrag.current = false;
    pointerDeltaRef.current = getClientPosition(event);

    if (typeof event.pointerId === 'number') {
      lastPointerId.current = event.pointerId;
      if (event.target?.setPointerCapture) {
        try {
          event.target.setPointerCapture(event.pointerId);
        } catch (error) {
          // Ignore setPointerCapture errors in XR
        }
      }
    } else {
      lastPointerId.current = null;
    }
  };

  const handlePointerUp = (event: any) => {
    event.stopPropagation();
    releasePointerCapture(event);
    setIsDragging(false);
    pointerDeltaRef.current = null;

    const shouldToggle = !dragMoved.current && !rotateDuringDrag.current;
    dragMoved.current = false;
    rotateDuringDrag.current = false;

    if (shouldToggle && isReady) {
      togglePlayback();
    }
  };

  const handlePointerMove = (event: any) => {
    if (!isDragging) return;
    event.stopPropagation();

    const pointerInfo = getClientPosition(event);

    if (event.shiftKey && pointerInfo && pointerDeltaRef.current) {
      const deltaX = pointerInfo.x - pointerDeltaRef.current.x;
      if (Math.abs(deltaX) > 0.001) {
        const nextRotation: [number, number, number] = [
          rotation[0],
          rotation[1] - deltaX * 0.01,
          rotation[2],
        ];
        onRotationChange(nextRotation);
        rotateDuringDrag.current = true;
      }
      dragMoved.current = true;
    } else if (cardRef.current) {
      const pointer = event.intersections?.[0]?.point ?? event.point;
      if (pointer) {
        onPositionChange([pointer.x, pointer.y, position[2]]);
        dragMoved.current = true;
      } else if (event.ray) {
        dragPlane.constant = -position[2];
        raycaster.ray.origin.copy(event.ray.origin);
        raycaster.ray.direction.copy(event.ray.direction);
        if (raycaster.ray.intersectPlane(dragPlane, intersectionPoint)) {
          onPositionChange([intersectionPoint.x, intersectionPoint.y, position[2]]);
          dragMoved.current = true;
        }
      }
    }

    pointerDeltaRef.current = pointerInfo ?? pointerDeltaRef.current;
  };

  const adjustScale = (delta: number) => {
    const next = clamp(scale + delta, 0.55, 2.1);
    onScaleChange(next);
  };

  const handleWheel = (event: any) => {
    event.stopPropagation();
    const delta = event.deltaY ?? 0;
    if (delta === 0) return;
    adjustScale(delta < 0 ? 0.05 : -0.05);
  };

  const handlePointerCancel = (event: any) => {
    releasePointerCapture(event);
    setIsDragging(false);
    pointerDeltaRef.current = null;
    dragMoved.current = false;
    rotateDuringDrag.current = false;
  };

  const pointerHandlers = {
    onPointerDown: handlePointerDown,
    onPointerUp: handlePointerUp,
    onPointerMove: handlePointerMove,
    onPointerCancel: handlePointerCancel,
    onPointerOver: () => setIsHovered(true),
    onPointerOut: () => {
      setIsHovered(false);
      pointerDeltaRef.current = null;
    },
    onWheel: handleWheel,
    onContextMenu: (event: any) => event.preventDefault(),
  };

  return (
    <group ref={cardRef} position={position} rotation={rotation} scale={scale}>
      <group>
        <mesh position={[0, 0, -CARD_DEPTH]} renderOrder={-2}>
          <planeGeometry args={[haloWidth, haloHeight]} />
          <meshBasicMaterial
            color={glowColor}
            transparent
            opacity={0.08 + highlightStrength * 0.18}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
        <RoundedBox
          args={[frameWidth, frameHeight, CARD_DEPTH]}
          radius={0.08}
          smoothness={6}
          castShadow
          receiveShadow
          {...pointerHandlers}
        >
          <meshStandardMaterial
            color={frameColor}
            metalness={0.3}
            roughness={0.45}
            emissive={glowColor}
            emissiveIntensity={0.22 + highlightStrength * 0.5}
          />
        </RoundedBox>
        <mesh position={[0, 0, CARD_DEPTH / 2 + 0.001]} {...pointerHandlers}>
          <planeGeometry args={[videoWidth, videoHeight]} />
          {texture && isReady ? (
            <meshBasicMaterial map={texture} toneMapped={false} />
          ) : (
            <meshStandardMaterial color="#05070d" roughness={0.9} metalness={0.1} />
          )}
        </mesh>
      </group>
    </group>
  );
}
// Draggable 3D Video Panel for VR
const TECHNIQUE_CARD_PRESETS: TechniqueCardState[] = [
  {
    id: 'stance',
    position: [-2.15, 1.5, -3.15],
    rotation: [0, Math.PI / 12, 0],
    scale: 1.05,
    frameColor: '#111a2c',
    glowColor: '#38bdf8',
    videoUrl: '/video/latora30.mp4',
  },
  {
    id: 'hand-fight',
    position: [-0.85, 1.65, -2.95],
    rotation: [0, Math.PI / 28, 0],
    scale: 1,
    frameColor: '#101827',
    glowColor: '#22d3ee',
    videoUrl: '/video/latora30.mp4',
  },
  {
    id: 'setups',
    position: [0.55, 1.6, -2.85],
    rotation: [0, -Math.PI / 32, 0],
    scale: 1,
    frameColor: '#0f172a',
    glowColor: '#34d399',
    videoUrl: '/video/latora30.mp4',
  },
  {
    id: 'finishes',
    position: [1.85, 1.45, -3.05],
    rotation: [0, -Math.PI / 16, 0],
    scale: 1.05,
    frameColor: '#101820',
    glowColor: '#facc15',
    videoUrl: '/video/latora30.mp4',
  },
  {
    id: 'mat-returns',
    position: [-1.4, 0.6, -2.65],
    rotation: [0, Math.PI / 18, 0],
    scale: 0.92,
    frameColor: '#111726',
    glowColor: '#f472b6',
    videoUrl: '/video/latora30.mp4',
  },
  {
    id: 'chain',
    position: [1.05, 0.55, -2.6],
    rotation: [0, -Math.PI / 20, 0],
    scale: 0.95,
    frameColor: '#101a2b',
    glowColor: '#a855f7',
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

  const updateCardRotation = React.useCallback(
    (id: string, rotation: [number, number, number]) => {
      setCards((prev) =>
        prev.map((card) => (card.id === id ? { ...card, rotation } : card))
      );
    },
    []
  );

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
            onRotationChange={(next) => updateCardRotation(card.id, next)}
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
