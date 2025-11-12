'use client';

import React from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, RoundedBox } from '@react-three/drei';
import { XR, createXRStore, useXR } from '@react-three/xr';
import * as THREE from 'three';
import { VRControllerScreenshot } from './VRControllerScreenshot';

const CARD_HEIGHT = 1.45;
const CARD_DEPTH = 0.03;
const CARD_BORDER = 0.06;
const CARD_BASE_HEIGHT = 1.55;
const CARD_RING_RADIUS = 3.25;
const MIN_CARD_SCALE = 0.6;
const MAX_CARD_SCALE = 3.4;

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
    <mesh frustumCulled={false} rotation={[Math.PI, Math.PI, 0]}>
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
  const [dimensions, setDimensions] = React.useState<{ width: number; height: number }>({
    width: 16,
    height: 9,
  });

  React.useEffect(() => {
    setIsReady(false);
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

    const ensurePlaying = () => {
      if (!video.paused) {
        return;
      }

      video
        .play()
        .then(() => {
          // Autoplay succeeded
        })
        .catch((error) => {
          console.warn('[TechniqueCard] Autoplay blocked, waiting for user gesture', error);
        });
    };

    const handleLoadedData = () => {
      setIsReady(true);
      ensurePlaying();
    };

    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('loadeddata', handleLoadedData);

    const resumeFromInteraction = () => {
      if (!videoRef.current) {
        return;
      }
      ensurePlaying();
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        resumeFromInteraction();
      }
    };

    window.addEventListener('pointerdown', resumeFromInteraction, { passive: true });
    window.addEventListener('pointerup', resumeFromInteraction, { passive: true });
    document.addEventListener('visibilitychange', handleVisibility);

    video.load();

    return () => {
      video.pause();
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('loadeddata', handleLoadedData);

      window.removeEventListener('pointerdown', resumeFromInteraction);
      window.removeEventListener('pointerup', resumeFromInteraction);
      document.removeEventListener('visibilitychange', handleVisibility);

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

  return {
    texture,
    isReady,
    dimensions,
  };
}

function TechniqueCard({
  position,
  rotation,
  scale,
  videoUrl,
  onPositionChange,
  onScaleChange,
  onRotationChange,
}: TechniqueCardProps) {
  const cardRef = React.useRef<THREE.Group>(null);
  const dragPlane = React.useMemo(
    () => new THREE.Plane(new THREE.Vector3(0, 1, 0), -position[1]),
    [position[1]]
  );
  const intersectionPoint = React.useMemo(() => new THREE.Vector3(), []);
  const raycaster = React.useMemo(() => new THREE.Raycaster(), []);
  const [isInteracting, setIsInteracting] = React.useState(false);
  const [isHovered, setIsHovered] = React.useState(false);
  const activePointerId = React.useRef<number | null>(null);
  const pointerOriginRef = React.useRef<{
    client?: { x: number; y: number };
    world?: THREE.Vector3;
  } | null>(null);
  const interactionModeRef = React.useRef<'drag' | 'rotate' | 'scale' | null>(null);
  const rotationStartRef = React.useRef<[number, number, number]>(rotation);
  const scaleStartRef = React.useRef<number>(scale);

  const { texture, isReady, dimensions } = useTechniqueVideoTexture(videoUrl);

  const videoAspect = React.useMemo(() => {
    if (!dimensions.width || !dimensions.height) {
      return 16 / 9;
    }
    return dimensions.width / dimensions.height;
  }, [dimensions]);

  const safeAspect = clamp(videoAspect, 0.5, 2.5);
  const videoHeight = CARD_HEIGHT;
  const videoWidth = videoHeight * safeAspect;
  const frameWidth = videoWidth + CARD_BORDER * 2;
  const frameHeight = videoHeight + CARD_BORDER * 2;
  const highlightStrength = isInteracting ? 1 : isHovered ? 0.55 : 0.2;

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

  const getWorldPoint = React.useCallback(
    (event: any) => {
      const toVector = (input: any) => {
        if (input instanceof THREE.Vector3) {
          return input.clone();
        }
        if (input && typeof input.x === 'number' && typeof input.y === 'number' && typeof input.z === 'number') {
          return new THREE.Vector3(input.x, input.y, input.z);
        }
        return null;
      };

      const directPoint = toVector(event?.point);
      if (directPoint) {
        return directPoint;
      }

      const intersectionPoint = toVector(event?.intersections?.[0]?.point);
      if (intersectionPoint) {
        return intersectionPoint;
      }

      if (event?.ray) {
        const target = new THREE.Vector3();
        dragPlane.constant = -position[1];
        if (event.ray.intersectPlane(dragPlane, target)) {
          return target.clone();
        }
      }

      return null;
    },
    [dragPlane, position[2]]
  );

  const releasePointerCapture = React.useCallback((event: any) => {
    if (activePointerId.current !== null && event?.target?.releasePointerCapture) {
      try {
        event.target.releasePointerCapture(activePointerId.current);
      } catch (error) {
        // Some XR controllers do not support releasePointerCapture
      }
    }
    activePointerId.current = null;
  }, []);

  const beginInteraction = React.useCallback(
    (event: any, mode: 'drag' | 'rotate' | 'scale') => {
      event.stopPropagation();
      interactionModeRef.current = mode;
      setIsInteracting(true);
      const clientPosition = getClientPosition(event);
      const worldPoint = getWorldPoint(event);
      pointerOriginRef.current = {
        client: clientPosition ?? undefined,
        world: worldPoint ? worldPoint.clone() : undefined,
      };
      rotationStartRef.current = [...rotation] as [number, number, number];
      scaleStartRef.current = scale;

      if (typeof event.pointerId === 'number') {
        activePointerId.current = event.pointerId;
        if (event.target?.setPointerCapture) {
          try {
            event.target.setPointerCapture(event.pointerId);
          } catch (error) {
            // Ignore setPointerCapture errors in XR
          }
        }
      } else {
        activePointerId.current = null;
      }
    },
    [getClientPosition, getWorldPoint, rotation, scale]
  );

  const endInteraction = React.useCallback(
    (event: any) => {
      releasePointerCapture(event);
      interactionModeRef.current = null;
      setIsInteracting(false);
      pointerOriginRef.current = null;
    },
    [releasePointerCapture]
  );

  const handlePointerDown = (event: any) => {
    const native = event?.nativeEvent as PointerEvent | undefined;
    if (native?.ctrlKey) {
      beginInteraction(event, 'scale');
      return;
    }
    if (native?.button === 2) {
      beginInteraction(event, 'rotate');
      return;
    }
    beginInteraction(event, 'drag');
  };

  const handlePointerUp = (event: any) => {
    if (interactionModeRef.current) {
      event.stopPropagation();
    }
    endInteraction(event);
  };

  const handlePointerMove = (event: any) => {
    if (!interactionModeRef.current) return;
    event.stopPropagation();

    const pointerInfo = getClientPosition(event);
    const worldPoint = getWorldPoint(event);
    const origin = pointerOriginRef.current;

    switch (interactionModeRef.current) {
      case 'rotate': {
        if (pointerInfo && origin?.client) {
          const deltaX = pointerInfo.x - origin.client.x;
          const start = rotationStartRef.current;
          const nextRotation: [number, number, number] = [
            start[0],
            start[1] - deltaX * 0.01,
            start[2],
          ];
          onRotationChange(nextRotation);
        } else if (worldPoint && origin?.world && cardRef.current) {
          const start = rotationStartRef.current;
          const startLocal = origin.world.clone();
          const currentLocal = worldPoint.clone();
          cardRef.current.worldToLocal(startLocal);
          cardRef.current.worldToLocal(currentLocal);
          const deltaX = currentLocal.x - startLocal.x;
          const nextRotation: [number, number, number] = [
            start[0],
            start[1] - deltaX * 1.2,
            start[2],
          ];
          onRotationChange(nextRotation);
        }
        break;
      }
      case 'scale': {
        if (pointerInfo && origin?.client) {
          const deltaY = pointerInfo.y - origin.client.y;
          const startScale = scaleStartRef.current;
          const nextScale = clamp(startScale - deltaY * 0.0035, MIN_CARD_SCALE, MAX_CARD_SCALE);
          onScaleChange(nextScale);
        } else if (worldPoint && origin?.world && cardRef.current) {
          const startScale = scaleStartRef.current;
          const startLocal = origin.world.clone();
          const currentLocal = worldPoint.clone();
          cardRef.current.worldToLocal(startLocal);
          cardRef.current.worldToLocal(currentLocal);
          const deltaY = currentLocal.y - startLocal.y;
          const nextScale = clamp(startScale + deltaY * 1.6, MIN_CARD_SCALE, MAX_CARD_SCALE);
          onScaleChange(nextScale);
        }
        break;
      }
      case 'drag': {
        if (cardRef.current) {
          const world = getWorldPoint(event);
          if (world) {
            onPositionChange([world.x, position[1], world.z]);
          } else if (event.ray) {
            dragPlane.constant = -position[1];
            raycaster.ray.origin.copy(event.ray.origin);
            raycaster.ray.direction.copy(event.ray.direction);
            if (raycaster.ray.intersectPlane(dragPlane, intersectionPoint)) {
              onPositionChange([intersectionPoint.x, position[1], intersectionPoint.z]);
            }
          }
        }
        break;
      }
      default:
        break;
    }
  };

  const adjustScale = (delta: number) => {
    const next = clamp(scale + delta, MIN_CARD_SCALE, MAX_CARD_SCALE);
    onScaleChange(next);
  };

  const handleWheel = (event: any) => {
    event.stopPropagation();
    const delta = event.deltaY ?? 0;
    if (delta === 0) return;
    adjustScale(delta < 0 ? 0.05 : -0.05);
  };

  const handlePointerCancel = (event: any) => {
    if (interactionModeRef.current) {
      event.stopPropagation();
    }
    endInteraction(event);
  };

  const handleDoubleClick = (event: any) => {
    event.stopPropagation();
    onScaleChange(clamp(scale * 1.5, MIN_CARD_SCALE, MAX_CARD_SCALE));
  };

  const pointerHandlers = {
    onPointerDown: handlePointerDown,
    onPointerUp: handlePointerUp,
    onPointerMove: handlePointerMove,
    onPointerCancel: handlePointerCancel,
    onPointerOver: () => setIsHovered(true),
    onPointerOut: () => {
      setIsHovered(false);
      pointerOriginRef.current = null;
    },
    onWheel: handleWheel,
    onDoubleClick: handleDoubleClick,
    onContextMenu: (event: any) => event.preventDefault(),
  };

  const rotateHandleHandlers = {
    onPointerDown: (event: any) => beginInteraction(event, 'rotate'),
    onPointerMove: handlePointerMove,
    onPointerUp: handlePointerUp,
    onPointerCancel: handlePointerCancel,
    onPointerOver: () => setIsHovered(true),
    onPointerOut: () => {
      setIsHovered(false);
      pointerOriginRef.current = null;
    },
  };

  const scaleHandleHandlers = {
    onPointerDown: (event: any) => beginInteraction(event, 'scale'),
    onPointerMove: handlePointerMove,
    onPointerUp: handlePointerUp,
    onPointerCancel: handlePointerCancel,
    onPointerOver: () => setIsHovered(true),
    onPointerOut: () => {
      setIsHovered(false);
      pointerOriginRef.current = null;
    },
  };

  return (
    <group ref={cardRef} position={position} rotation={rotation} scale={scale}>
      <group>
        <RoundedBox
          args={[frameWidth + 0.12, frameHeight + 0.12, CARD_DEPTH * 0.6]}
          radius={0.1}
          smoothness={6}
          raycast={() => null}
        >
          <meshBasicMaterial
            color="#fde68a"
            transparent
            opacity={0.18 + highlightStrength * 0.15}
            depthWrite={false}
            toneMapped={false}
          />
        </RoundedBox>
        <RoundedBox
          args={[frameWidth, frameHeight, CARD_DEPTH]}
          radius={0.07}
          smoothness={8}
          castShadow
          receiveShadow
          {...pointerHandlers}
        >
          <meshStandardMaterial
            color="#111217"
            metalness={0.55}
            roughness={0.38}
            emissive="#d4af37"
            emissiveIntensity={0.25 + highlightStrength * 0.45}
          />
        </RoundedBox>
        <mesh position={[0, 0, CARD_DEPTH / 2 + 0.0006]} {...pointerHandlers}>
          <planeGeometry args={[videoWidth, videoHeight]} />
          <meshBasicMaterial
            map={texture && isReady ? texture : undefined}
            color={texture && isReady ? undefined : '#111827'}
            toneMapped={false}
            side={THREE.DoubleSide}
          />
        </mesh>
        <mesh
          position={[0, frameHeight / 2 + 0.32, 0]}
          rotation={[Math.PI / 2, 0, 0]}
          {...rotateHandleHandlers}
        >
          <torusGeometry args={[0.22, 0.04, 16, 56]} />
          <meshStandardMaterial
            color="#fcd34d"
            emissive="#fbbf24"
            emissiveIntensity={0.6 + highlightStrength * 0.4}
            metalness={0.35}
            roughness={0.28}
          />
        </mesh>
        <mesh position={[0, -(frameHeight / 2 + 0.28), 0]} {...scaleHandleHandlers}>
          <sphereGeometry args={[0.14, 24, 24]} />
          <meshStandardMaterial
            color="#fcd34d"
            emissive="#facc15"
            emissiveIntensity={0.45 + highlightStrength * 0.3}
            metalness={0.3}
            roughness={0.32}
          />
        </mesh>
      </group>
    </group>
  );
}
// Draggable 3D Video Panel for VR
const TECHNIQUE_CARD_IDS = [
  'stance',
  'hand-fight',
  'setups',
  'finishes',
  'mat-returns',
  'chain',
] as const;

const TECHNIQUE_CARD_PRESETS: TechniqueCardState[] = TECHNIQUE_CARD_IDS.map((id, index) => {
  const theta = (index / TECHNIQUE_CARD_IDS.length) * Math.PI * 2;
  const x = Math.sin(theta) * CARD_RING_RADIUS;
  const z = -Math.cos(theta) * CARD_RING_RADIUS;
  const rotationY = Math.atan2(x, -z);

  return {
    id,
    position: [x, CARD_BASE_HEIGHT, z],
    rotation: [0, rotationY, 0],
    scale: 1.4,
    videoUrl: '/video/latora30.mp4',
  };
});

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
          target={[0, CARD_BASE_HEIGHT, 0]}
          minPolarAngle={Math.PI / 6}
          maxPolarAngle={(2 * Math.PI) / 3}
        />
      )}

      <group>
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
        camera={{ position: [0, CARD_BASE_HEIGHT, CARD_RING_RADIUS + 1.5], fov: 70 }}
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
          state.camera.lookAt(0, CARD_BASE_HEIGHT, 0);
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
