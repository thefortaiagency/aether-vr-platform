'use client';

import React from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, RoundedBox } from '@react-three/drei';
import { XR, createXRStore, useXR } from '@react-three/xr';
import * as THREE from 'three';
import { VRControllerScreenshot } from './VRControllerScreenshot';
import { VideoTextureSimple } from './VideoTextureSimple';

const CARD_HEIGHT = 1.35;
const CARD_DEPTH = 0.045;
const CARD_FRAME_PADDING = 0.12;
const MIN_CARD_SCALE = 0.75;
const MAX_CARD_SCALE = 2.75;

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

    const handleLoadedData = () => {
      setIsReady(true);
      video
        .play()
        .then(() => {
          // Autoplay succeeded
        })
        .catch((error) => {
          console.warn('[TechniqueCard] Autoplay blocked, waiting for user gesture', error);
        });
    };

    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('loadeddata', handleLoadedData);

    video.load();

    return () => {
      video.pause();
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('loadeddata', handleLoadedData);

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
  const frameWidth = videoWidth + CARD_FRAME_PADDING;
  const frameHeight = videoHeight + CARD_FRAME_PADDING;
  const haloWidth = frameWidth + 0.22;
  const haloHeight = frameHeight + 0.22;
  const highlightStrength = isInteracting ? 1 : isHovered ? 0.6 : 0.25;

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
        dragPlane.constant = -position[2];
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
          const pointer = event.intersections?.[0]?.point ?? event.point;
          if (pointer) {
            onPositionChange([pointer.x, pointer.y, position[2]]);
          } else if (event.ray) {
            dragPlane.constant = -position[2];
            raycaster.ray.origin.copy(event.ray.origin);
            raycaster.ray.direction.copy(event.ray.direction);
            if (raycaster.ray.intersectPlane(dragPlane, intersectionPoint)) {
              onPositionChange([intersectionPoint.x, intersectionPoint.y, position[2]]);
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
          <meshBasicMaterial
            map={texture && isReady ? texture : undefined}
            color={texture && isReady ? undefined : '#05070d'}
            toneMapped={false}
          />
        </mesh>
        <mesh
          position={[frameWidth / 2 + 0.28, 0, 0]}
          rotation={[0, 0, Math.PI / 2]}
          {...rotateHandleHandlers}
        >
          <torusGeometry args={[0.14, 0.028, 16, 48]} />
          <meshStandardMaterial
            color={glowColor}
            emissive={glowColor}
            emissiveIntensity={0.5 + highlightStrength * 0.4}
            metalness={0.2}
            roughness={0.35}
          />
        </mesh>
        <mesh
          position={[0, -(frameHeight / 2 + 0.26), 0]}
          {...scaleHandleHandlers}
        >
          <cylinderGeometry args={[0.11, 0.11, 0.08, 24]} />
          <meshStandardMaterial
            color={frameColor}
            emissive={glowColor}
            emissiveIntensity={0.35 + highlightStrength * 0.3}
            metalness={0.25}
            roughness={0.4}
          />
        </mesh>
      </group>
    </group>
  );
}
// Draggable 3D Video Panel for VR
const TECHNIQUE_CARD_PRESETS: TechniqueCardState[] = [
  {
    id: 'stance',
    position: [-2.2, 1.55, -3.25],
    rotation: [0, Math.PI / 12, 0],
    scale: 1.35,
    frameColor: '#111a2c',
    glowColor: '#38bdf8',
    videoUrl: '/video/latora30.mp4',
  },
  {
    id: 'hand-fight',
    position: [-0.9, 1.7, -3],
    rotation: [0, Math.PI / 28, 0],
    scale: 1.32,
    frameColor: '#101827',
    glowColor: '#22d3ee',
    videoUrl: '/video/latora30.mp4',
  },
  {
    id: 'setups',
    position: [0.5, 1.65, -2.9],
    rotation: [0, -Math.PI / 32, 0],
    scale: 1.28,
    frameColor: '#0f172a',
    glowColor: '#34d399',
    videoUrl: '/video/latora30.mp4',
  },
  {
    id: 'finishes',
    position: [1.95, 1.55, -3.15],
    rotation: [0, -Math.PI / 16, 0],
    scale: 1.34,
    frameColor: '#101820',
    glowColor: '#facc15',
    videoUrl: '/video/latora30.mp4',
  },
  {
    id: 'mat-returns',
    position: [-1.45, 0.65, -2.7],
    rotation: [0, Math.PI / 18, 0],
    scale: 1.18,
    frameColor: '#111726',
    glowColor: '#f472b6',
    videoUrl: '/video/latora30.mp4',
  },
  {
    id: 'chain',
    position: [1.1, 0.6, -2.65],
    rotation: [0, -Math.PI / 20, 0],
    scale: 1.22,
    frameColor: '#101a2b',
    glowColor: '#a855f7',
    videoUrl: '/video/latora30.mp4',
  },
];

// Main VR Scene Content
function VRSceneContent({ backgroundImageUrl, videoEnabled, onScreenshot, onBackgroundReady }: VRSceneProps) {
  const { isPresenting } = useXR();

  // Technique videos configuration - 6 videos in circle
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
