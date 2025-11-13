'use client';

import React from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, RoundedBox, Text, useTexture } from '@react-three/drei';
import { XR, createXRStore, useXR, Interactive } from '@react-three/xr';
import type { XRStore } from '@react-three/xr';
import * as THREE from 'three';
import { VRControllerScreenshot } from './VRControllerScreenshot';

const CARD_HEIGHT = 1.85;
const CARD_DEPTH = 0.03;
const CARD_BORDER = 0.02;
const CARD_BASE_HEIGHT = 1.55;
const CARD_RING_RADIUS = 6;
const MIN_CARD_SCALE = 0.75;
const MAX_CARD_SCALE = 3.8;

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

let xrStoreSingleton: XRStore | null = null;

function resolveDomOverlayRoot(): HTMLElement | undefined {
  if (typeof document === 'undefined') {
    return undefined;
  }

  const explicitOverlay = document.querySelector<HTMLElement>('[data-xr-overlay-root]');
  if (explicitOverlay) {
    explicitOverlay.dataset.xrDomOverlay = 'true';
    return explicitOverlay;
  }

  const reactRoot = document.getElementById('root');
  if (reactRoot instanceof HTMLElement) {
    reactRoot.dataset.xrDomOverlay = 'true';
    return reactRoot;
  }

  return undefined;
}

export function getXRStore(): XRStore {
  if (!xrStoreSingleton) {
    const domOverlayRoot = resolveDomOverlayRoot();
    xrStoreSingleton = createXRStore({
      foveation: 0,
      domOverlay: domOverlayRoot ?? true,
      handTracking: true,
      layers: true,
      hitTest: true,
    });
  }

  return xrStoreSingleton;
}

// Create XR store OUTSIDE component to prevent recreation on re-renders
// Request 'layers' feature for WebXR Layers API support
const xrStore = getXRStore();

// Gymnasium Environment - renders a true 360° panorama by wrapping the user in a sphere
const PANORAMA_ROTATION: [number, number, number] = [0, Math.PI, Math.PI];

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
    <mesh frustumCulled={false} rotation={PANORAMA_ROTATION}>
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
  label: string;
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

interface TechniqueCardProps extends TechniqueCardState {
  onPositionChange: (position: [number, number, number]) => void;
  onScaleChange: (scale: number) => void;
  onRotationChange: (rotation: [number, number, number]) => void;
}

type ControlButtonType =
  | 'plus'
  | 'minus'
  | 'rotate-left'
  | 'rotate-right'
  | 'play'
  | 'pause';

function ControlIcon({ type }: { type: ControlButtonType }) {
  const iconColor = "#00ff00"; // Bright green for visibility
  switch (type) {
    case 'plus':
      return (
        <group position={[0, 0.11, 0]}>
          <mesh raycast={() => null}>
            <boxGeometry args={[0.1, 0.02, 0.02]} />
            <meshStandardMaterial color={iconColor} metalness={0.2} roughness={0.45} />
          </mesh>
          <mesh raycast={() => null} rotation={[0, 0, Math.PI / 2]}>
            <boxGeometry args={[0.1, 0.02, 0.02]} />
            <meshStandardMaterial color={iconColor} metalness={0.2} roughness={0.45} />
          </mesh>
        </group>
      );
    case 'minus':
      return (
        <group position={[0, 0.11, 0]}>
          <mesh raycast={() => null}>
            <boxGeometry args={[0.1, 0.02, 0.02]} />
            <meshStandardMaterial color={iconColor} metalness={0.2} roughness={0.45} />
          </mesh>
        </group>
      );
    case 'rotate-left':
      return (
        <group position={[0, 0.11, 0]}>
          <mesh raycast={() => null} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.07, 0.012, 18, 46, Math.PI * 1.25]} />
            <meshStandardMaterial color={iconColor} metalness={0.25} roughness={0.4} />
          </mesh>
          <mesh raycast={() => null} position={[-0.065, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
            <coneGeometry args={[0.05, 0.11, 24]} />
            <meshStandardMaterial color={iconColor} metalness={0.25} roughness={0.4} />
          </mesh>
        </group>
      );
    case 'rotate-right':
      return (
        <group position={[0, 0.11, 0]}>
          <mesh raycast={() => null} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.07, 0.012, 18, 46, Math.PI * 1.25]} />
            <meshStandardMaterial color={iconColor} metalness={0.25} roughness={0.4} />
          </mesh>
          <mesh raycast={() => null} position={[0.065, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
            <coneGeometry args={[0.05, 0.11, 24]} />
            <meshStandardMaterial color={iconColor} metalness={0.25} roughness={0.4} />
          </mesh>
        </group>
      );
    case 'play':
      return (
        <group position={[0, 0.11, 0]}>
          <mesh raycast={() => null} rotation={[0, 0, Math.PI / 2]}>
            <coneGeometry args={[0.11, 0.16, 24]} />
            <meshStandardMaterial color={iconColor} metalness={0.25} roughness={0.4} />
          </mesh>
        </group>
      );
    case 'pause':
      return (
        <group position={[0, 0.11, 0]}>
          <mesh raycast={() => null} position={[-0.03, 0, 0]}>
            <boxGeometry args={[0.045, 0.16, 0.04]} />
            <meshStandardMaterial color={iconColor} metalness={0.25} roughness={0.4} />
          </mesh>
          <mesh raycast={() => null} position={[0.03, 0, 0]}>
            <boxGeometry args={[0.045, 0.16, 0.04]} />
            <meshStandardMaterial color={iconColor} metalness={0.25} roughness={0.4} />
          </mesh>
        </group>
      );
    default:
      return null;
  }
}

function ControlButton({
  position,
  type,
  onActivate,
}: {
  position: [number, number, number];
  type: ControlButtonType;
  onActivate: () => void;
}) {
  const [hovered, setHovered] = React.useState(false);

  const handleActivate = React.useCallback(() => {
    onActivate();
  }, [onActivate]);

  const handlePointerDown = React.useCallback(
    (event: any) => {
      event.stopPropagation();
      handleActivate();
    },
    [handleActivate]
  );

  const handlePointerOver = React.useCallback((event: any) => {
    event.stopPropagation();
    setHovered(true);
  }, []);

  const handlePointerOut = React.useCallback((event: any) => {
    event.stopPropagation();
    setHovered(false);
  }, []);

  const handlePointerUp = React.useCallback((event: any) => {
    event.stopPropagation();
  }, []);

  return (
    <group position={position}>
      <Interactive
        onSelect={handleActivate}
        onSqueeze={handleActivate}
        onHover={() => setHovered(true)}
        onBlur={() => setHovered(false)}
      >
        <group>
          <mesh
            onPointerDown={handlePointerDown}
            onPointerUp={handlePointerUp}
            onPointerOver={handlePointerOver}
            onPointerOut={handlePointerOut}
            onPointerCancel={handlePointerOut}
            castShadow
            receiveShadow
          >
            <cylinderGeometry args={[0.16, 0.16, 0.08, 32]} />
            <meshStandardMaterial
              color={hovered ? '#f8d970' : '#d4af37'}
              emissive="#c28e0e"
              emissiveIntensity={hovered ? 0.75 : 0.45}
              metalness={0.82}
              roughness={0.28}
            />
          </mesh>
          <ControlIcon type={type} />
        </group>
      </Interactive>
    </group>
  );
}

function useTechniqueVideoTexture(videoUrl: string) {
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const textureRef = React.useRef<THREE.VideoTexture | null>(null);
  const lastPlayAttemptRef = React.useRef(0);
  const [texture, setTexture] = React.useState<THREE.VideoTexture | null>(null);
  const [isReady, setIsReady] = React.useState(false);
  const [isPlaying, setIsPlaying] = React.useState(false);
  const [dimensions, setDimensions] = React.useState<{ width: number; height: number }>({
    width: 16,
    height: 9,
  });

  const resolvedUrl = React.useMemo(() => {
    if (typeof window === 'undefined') {
      return videoUrl;
    }

    try {
      return new URL(videoUrl, window.location.origin).toString();
    } catch (error) {
      console.warn('[TechniqueCard] Failed to resolve video URL, falling back to raw value', {
        videoUrl,
        error,
      });
      return videoUrl;
    }
  }, [videoUrl]);

  const markTextureDirty = React.useCallback(() => {
    if (textureRef.current) {
      textureRef.current.needsUpdate = true;
    }
  }, []);

  const requestPlay = React.useCallback(() => {
    const video = videoRef.current;
    if (!video || (!video.paused && !video.ended)) {
      return;
    }

    const attemptTime = Date.now();
    if (attemptTime - lastPlayAttemptRef.current < 250) {
      return;
    }

    lastPlayAttemptRef.current = attemptTime;
    video.play()?.catch(() => {});
  }, [videoUrl]);

  const requestPause = React.useCallback(() => {
    const video = videoRef.current;
    if (!video || video.paused || video.ended) {
      return;
    }
    video.pause();
  }, [videoUrl]);

  const togglePlayback = React.useCallback(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    if (video.paused || video.ended) {
      requestPlay();
    } else {
      requestPause();
    }
  }, [requestPause, requestPlay]);

  React.useEffect(() => {
    setIsReady(false);
    setTexture(null);
    setIsPlaying(false);

    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.setAttribute('crossorigin', 'anonymous');
    video.loop = true;
    video.muted = false; // Enable audio
    video.defaultMuted = false;
    video.autoplay = false;
    video.playsInline = true;
    video.setAttribute('playsinline', 'true');
    video.setAttribute('webkit-playsinline', 'true');
    video.setAttribute('loop', 'true');
    video.preload = 'auto';
    video.src = resolvedUrl;
    video.style.position = 'absolute';
    video.style.width = '1px';
    video.style.height = '1px';
    video.style.opacity = '0';
    video.style.pointerEvents = 'none';
    video.dataset.techniqueVideo = resolvedUrl;
    document.body.appendChild(video);

    const texture = new THREE.VideoTexture(video);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;

    videoRef.current = video;
    textureRef.current = texture;
    setTexture(texture);
    lastPlayAttemptRef.current = 0;

    const updateDimensions = () => {
      if (video.videoWidth && video.videoHeight) {
        setDimensions({ width: video.videoWidth, height: video.videoHeight });
      }
    };

    const markTextureDirty = () => {
      if (textureRef.current) {
        textureRef.current.needsUpdate = true;
      }
    };

    const handleLoadedData = () => {
      updateDimensions();
      if (video.readyState >= 2) {
        // iOS/WebKit warmup: force GPU texture update
        const warmup = async () => {
          try {
            await video.play();
            setTimeout(() => {
              video.pause();
              video.currentTime = 0;
              setIsReady(true);
              markTextureDirty();
            }, 50);
          } catch (error) {
            setIsReady(true);
            markTextureDirty();
          }
        };
        warmup();
      }
    };

    const handleCanPlay = () => {
      setIsReady(true);
      markTextureDirty();
    };

    const handlePlay = () => {
      setIsReady(true);
      setIsPlaying(true);
      markTextureDirty();
    };

    const handlePause = () => {
      setIsPlaying(false);
      markTextureDirty();
    };

    const handleError = () => {
      // Silently handle errors
    };

    video.addEventListener('loadedmetadata', updateDimensions);
    video.addEventListener('loadeddata', handleLoadedData);
    video.addEventListener('canplay', handleCanPlay);
    video.addEventListener('playing', handlePlay);
    video.addEventListener('pause', handlePause);
    video.addEventListener('error', handleError);

    video.load();

    return () => {
      video.pause();
      video.removeEventListener('loadedmetadata', updateDimensions);
      video.removeEventListener('loadeddata', handleLoadedData);
      video.removeEventListener('canplay', handleCanPlay);
      video.removeEventListener('playing', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('error', handleError);

      if (video.parentNode) {
        video.parentNode.removeChild(video);
      }

      texture.dispose();
      videoRef.current = null;
      textureRef.current = null;
      lastPlayAttemptRef.current = 0;
      setIsPlaying(false);
    };
  }, [markTextureDirty, resolvedUrl]);

  useFrame(() => {
    const video = videoRef.current;
    const texture = textureRef.current;

    if (!video || !texture) {
      return;
    }

    // Always mark texture as needing update when video has data
    if (video.readyState >= 2) {
      texture.needsUpdate = true;
    }
  });

  return {
    texture,
    isReady,
    isPlaying,
    dimensions,
    play: requestPlay,
    pause: requestPause,
    toggle: togglePlayback,
  };
}

function TechniqueCard({
  position,
  rotation,
  scale,
  videoUrl,
  label,
  onPositionChange,
  onScaleChange,
  onRotationChange,
}: TechniqueCardProps) {
  const cardRef = React.useRef<THREE.Group>(null);
  const materialRef = React.useRef<THREE.MeshBasicMaterial>(null);
  // Drag plane perpendicular to Z axis to allow full 3D movement (up/down/left/right)
  const dragPlaneRef = React.useRef(new THREE.Plane(new THREE.Vector3(0, 0, 1), -position[2]));
  const intersectionPoint = React.useMemo(() => new THREE.Vector3(), []);
  const pointerIdRef = React.useRef<number | null>(null);
  const [isDragging, setIsDragging] = React.useState(false);
  const [isHovered, setIsHovered] = React.useState(false);
  const didDragRef = React.useRef(false);

  React.useEffect(() => {
    dragPlaneRef.current.constant = -position[2];
  }, [position[2]]);

  const { texture, isReady, isPlaying, dimensions, play, pause, toggle } =
    useTechniqueVideoTexture(videoUrl);

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
  const glowLevel = isDragging ? 0.5 : isHovered ? 0.28 : 0.14;

  const releasePointerCapture = React.useCallback((event: any) => {
    if (pointerIdRef.current !== null && event?.target?.releasePointerCapture) {
      try {
        event.target.releasePointerCapture(pointerIdRef.current);
      } catch (error) {
        // Some XR controllers do not support releasePointerCapture
      }
    }
    pointerIdRef.current = null;
  }, []);

  const getWorldPoint = React.useCallback(
    (event: any) => {
      if (event?.point) {
        return event.point.clone();
      }
      if (event?.intersections?.[0]?.point) {
        return event.intersections[0].point.clone();
      }
      if (event?.ray) {
        const plane = dragPlaneRef.current;
        plane.constant = -position[1];
        if (event.ray.intersectPlane(plane, intersectionPoint)) {
          return intersectionPoint.clone();
        }
      }
      return null;
    },
    [intersectionPoint, position[1]]
  );

  const handlePointerDown = React.useCallback(
    (event: any) => {
      event.stopPropagation();
      setIsDragging(true);
      didDragRef.current = false;
      setIsHovered(true);

      const pointerId =
        typeof event.pointerId === 'number'
          ? event.pointerId
          : typeof event?.nativeEvent?.pointerId === 'number'
          ? event.nativeEvent.pointerId
          : null;

      if (pointerId !== null) {
        pointerIdRef.current = pointerId;
        if (event.target?.setPointerCapture) {
          try {
            event.target.setPointerCapture(pointerId);
          } catch (error) {
            // Ignore setPointerCapture errors in XR
          }
        }
      }
    },
    []
  );

  const endDrag = React.useCallback(
    (event: any) => {
      if (event) {
        releasePointerCapture(event);
      }
      setIsDragging(false);
    },
    [releasePointerCapture]
  );

  const handlePointerUp = React.useCallback(
    (event: any) => {
      event.stopPropagation();
      endDrag(event);
      // Removed toggle() - use play/pause button instead
    },
    [endDrag]
  );

  const handlePointerMove = React.useCallback(
    (event: any) => {
      if (!isDragging) {
        return;
      }

      event.stopPropagation();
      const world = getWorldPoint(event);
      if (world) {
        // Allow full 3D movement - cards can move up/down/left/right/forward/back
        onPositionChange([world.x, world.y, world.z]);
        didDragRef.current = true;
      }
    },
    [getWorldPoint, isDragging, onPositionChange, position]
  );

  const handlePointerCancel = React.useCallback(
    (event: any) => {
      endDrag(event);
    },
    [endDrag]
  );

  const handlePointerOver = React.useCallback(() => {
    setIsHovered(true);
  }, []);

  const handlePointerOut = React.useCallback(() => {
    if (!isDragging) {
      setIsHovered(false);
    }
  }, [isDragging]);

  const adjustScale = React.useCallback(
    (delta: number) => {
      onScaleChange(clamp(scale + delta, MIN_CARD_SCALE, MAX_CARD_SCALE));
    },
    [onScaleChange, scale]
  );

  const handleWheel = React.useCallback(
    (event: any) => {
      event.stopPropagation();
      const deltaY = event.deltaY ?? 0;
      if (!deltaY) return;
      adjustScale(deltaY < 0 ? 0.12 : -0.12);
    },
    [adjustScale]
  );

  const handleDoubleClick = React.useCallback(
    (event: any) => {
      event.stopPropagation();
      const nextScale =
        scale < 1.9
          ? clamp(scale * 1.6, MIN_CARD_SCALE, MAX_CARD_SCALE)
          : clamp(scale * 0.7, MIN_CARD_SCALE, MAX_CARD_SCALE);
      onScaleChange(nextScale);
    },
    [onScaleChange, scale]
  );

  const rotateBy = React.useCallback(
    (radians: number) => {
      onRotationChange([rotation[0], rotation[1] + radians, rotation[2]]);
    },
    [onRotationChange, rotation]
  );

  const pointerHandlers = React.useMemo(
    () => ({
      onPointerDown: handlePointerDown,
      onPointerUp: handlePointerUp,
      onPointerMove: handlePointerMove,
      onPointerCancel: handlePointerCancel,
      onPointerOver: handlePointerOver,
      onPointerOut: handlePointerOut,
      onWheel: handleWheel,
      onDoubleClick: handleDoubleClick,
      onContextMenu: (event: any) => {
        if (event && typeof event.preventDefault === 'function') {
          event.preventDefault();
        }
      },
    }),
    [
      handlePointerDown,
      handlePointerUp,
      handlePointerMove,
      handlePointerCancel,
      handlePointerOver,
      handlePointerOut,
      handleWheel,
      handleDoubleClick,
    ]
  );

  const controlOffsetX = frameWidth / 2 + 0.32;
  const controlOffsetY = frameHeight / 2 + 0.32;
  const controlZ = CARD_DEPTH / 2 + 0.12;
  const playbackOffsetY = controlOffsetY; // Align with rotate buttons

  // Force material to update when texture changes
  React.useEffect(() => {
    const material = materialRef.current;
    if (material && texture && isReady) {
      material.map = texture;
      material.needsUpdate = true;
    }
  }, [texture, isReady, videoUrl]);

  return (
    <group ref={cardRef} position={position} rotation={rotation} scale={scale}>
      <group>
        <RoundedBox
          args={[frameWidth + CARD_BORDER * 4, frameHeight + CARD_BORDER * 4, CARD_DEPTH * 0.45]}
          radius={0.07}
          smoothness={8}
        >
          <meshStandardMaterial
            color="#d4af37"
            metalness={0.85}
            roughness={0.28}
            emissive="#c28e0e"
            emissiveIntensity={0.25 + glowLevel}
          />
        </RoundedBox>
        {/* Dark inner frame - positioned BEHIND video */}
        <RoundedBox
          args={[frameWidth + CARD_BORDER * 1.4, frameHeight + CARD_BORDER * 1.4, CARD_DEPTH * 0.6]}
          radius={0.065}
          smoothness={6}
          position={[0, 0, -CARD_DEPTH * 0.1]}
          castShadow
          receiveShadow
        >
          <meshStandardMaterial
            color="#08090f"
            metalness={0.45}
            roughness={0.42}
            emissive="#101320"
            emissiveIntensity={0.18 + glowLevel * 0.55}
          />
        </RoundedBox>
        {/* Video plane - in front of dark frame */}
        <mesh position={[0, 0, CARD_DEPTH / 2 + 0.1]} {...pointerHandlers}>
          <planeGeometry args={[videoWidth, videoHeight]} />
          <meshBasicMaterial
            ref={materialRef}
            map={texture && isReady ? texture : undefined}
            toneMapped={false}
            side={THREE.FrontSide}
            needsUpdate={true}
          />
        </mesh>

        <ControlButton
          position={[0, playbackOffsetY, controlZ]}
          type={isPlaying ? 'pause' : 'play'}
          onActivate={() => {
            if (isPlaying) {
              pause();
            } else {
              play();
            }
          }}
        />
        <ControlButton
          position={[-controlOffsetX, controlOffsetY, controlZ]}
          type="rotate-left"
          onActivate={() => rotateBy(Math.PI / 12)}
        />
        <ControlButton
          position={[controlOffsetX, controlOffsetY, controlZ]}
          type="rotate-right"
          onActivate={() => rotateBy(-Math.PI / 12)}
        />
        <ControlButton
          position={[-controlOffsetX, -controlOffsetY, controlZ]}
          type="plus"
          onActivate={() => adjustScale(0.18)}
        />
        <ControlButton
          position={[controlOffsetX, -controlOffsetY, controlZ]}
          type="minus"
          onActivate={() => adjustScale(-0.18)}
        />

        {/* Label below card */}
        <Text
          position={[0, -(frameHeight / 2 + 0.4), CARD_DEPTH / 2 + 0.1]}
          fontSize={0.15}
          color="#d4af37"
          anchorX="center"
          anchorY="middle"
          maxWidth={frameWidth}
          textAlign="center"
          outlineWidth={0.01}
          outlineColor="#000000"
        >
          {label}
        </Text>
      </group>
    </group>
  );
}

// Coach Image Component
function CoachImage() {
  const texture = useTexture('/latora.jpg');

  return (
    <mesh position={[0, 0.2, CARD_DEPTH / 2 + 0.11]}>
      <planeGeometry args={[2.5, 1.0]} />
      <meshBasicMaterial map={texture} transparent={true} side={THREE.DoubleSide} />
    </mesh>
  );
}

// Coach Andy Chatbot Card - Voice-activated AI coach
interface CoachChatCardProps {
  position: [number, number, number];
  scale: number;
  rotation: [number, number, number];
  onPositionChange: (position: [number, number, number]) => void;
  onScaleChange: (scale: number) => void;
  onRotationChange: (rotation: [number, number, number]) => void;
}

function CoachChatCard({
  position,
  scale,
  rotation,
  onPositionChange,
  onScaleChange,
  onRotationChange,
}: CoachChatCardProps) {
  const [coachResponse, setCoachResponse] = React.useState("Hey wrestler! Ask me anything about technique.");
  const [isListening, setIsListening] = React.useState(false);
  const [isProcessing, setIsProcessing] = React.useState(false);
  const mediaRecorderRef = React.useRef<MediaRecorder | null>(null);
  const audioChunksRef = React.useRef<Blob[]>([]);
  const listeningTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);
  const audioStreamRef = React.useRef<MediaStream | null>(null);

  // Drag handling
  const cardRef = React.useRef<THREE.Group>(null);
  const dragPlaneRef = React.useRef(new THREE.Plane(new THREE.Vector3(0, 0, 1), -position[2]));
  const intersectionPoint = React.useMemo(() => new THREE.Vector3(), []);
  const pointerIdRef = React.useRef<number | null>(null);
  const [isDragging, setIsDragging] = React.useState(false);
  const [isHovered, setIsHovered] = React.useState(false);
  const didDragRef = React.useRef(false);

  React.useEffect(() => {
    dragPlaneRef.current.constant = -position[2];
  }, [position[2]]);

  // Cleanup MediaRecorder on unmount
  React.useEffect(() => {
    return () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
      if (audioStreamRef.current) {
        audioStreamRef.current.getTracks().forEach(track => track.stop());
      }
      if (listeningTimeoutRef.current) {
        clearTimeout(listeningTimeoutRef.current);
      }
    };
  }, []);

  const handleMicClick = React.useCallback(async (e?: any) => {
    if (e) {
      e.stopPropagation();
    }

    // If currently recording, stop and send
    if (isListening && mediaRecorderRef.current) {
      console.log('🛑 Stopping recording...');
      if (listeningTimeoutRef.current) {
        clearTimeout(listeningTimeoutRef.current);
        listeningTimeoutRef.current = null;
      }
      mediaRecorderRef.current.stop();
      setIsListening(false);
      return;
    }

    // If processing, ignore click
    if (isProcessing) {
      console.log('⏳ Already processing, ignoring click');
      return;
    }

    // Start new recording
    try {
      console.log('🎤 Requesting microphone access...');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioStreamRef.current = stream;

      console.log('✅ Microphone access granted, starting recording...');

      audioChunksRef.current = [];
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus'
      });

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
          console.log('📦 Audio chunk received:', event.data.size, 'bytes');
        }
      };

      mediaRecorder.onstop = async () => {
        console.log('🎬 Recording stopped, processing audio...');
        setIsListening(false);
        setIsProcessing(true);
        setCoachResponse("Processing...");

        // Stop all tracks
        if (audioStreamRef.current) {
          audioStreamRef.current.getTracks().forEach(track => track.stop());
          audioStreamRef.current = null;
        }

        if (audioChunksRef.current.length === 0) {
          console.error('❌ No audio data recorded');
          setCoachResponse("No audio captured. Try again!");
          setIsProcessing(false);
          return;
        }

        // Combine all audio chunks into single blob
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        console.log('🎵 Audio blob created:', audioBlob.size, 'bytes');

        try {
          console.log('📡 Sending audio to Whisper API...');
          // Use environment variable or fall back to current origin
          const apiUrl = import.meta.env.VITE_API_URL || window.location.origin;
          const response = await fetch(`${apiUrl}/api/vr-voice-chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'audio/webm' },
            body: audioBlob,
          });

          const data = await response.json();
          console.log('✅ Server response:', data);

          if (data.transcript) {
            setCoachResponse(`You: "${data.transcript}"\n\n${data.response}`);
          } else {
            setCoachResponse(data.response || "Keep working hard!");
          }

          // Play audio if available
          if (data.audioUrl) {
            console.log('🔊 Playing Coach Andy audio...');
            const audio = new Audio(data.audioUrl);
            audio.play().catch((err) => {
              console.error('❌ Audio playback error:', err);
            });
          }
        } catch (error) {
          console.error('❌ Server error:', error);
          setCoachResponse("Connection error. Is the server running?");
        } finally {
          setIsProcessing(false);
          audioChunksRef.current = [];
        }
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start();
      setIsListening(true);
      setCoachResponse("Listening... Speak now!");

      // Auto-stop after 5 seconds
      listeningTimeoutRef.current = setTimeout(() => {
        console.log('⏱️ Auto-stop timeout (5 seconds)');
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
          mediaRecorderRef.current.stop();
        }
      }, 5000);

    } catch (error: any) {
      console.error('❌ Microphone error:', error);
      if (error.name === 'NotAllowedError') {
        setCoachResponse("Mic blocked! Grant permission in browser settings.");
      } else {
        setCoachResponse(`Mic error: ${error.message}`);
      }
      setIsListening(false);
    }
  }, [isListening, isProcessing]);

  const cardWidth = 3.5;
  const cardHeight = 2.0;
  const frameWidth = cardWidth + CARD_BORDER * 2;
  const frameHeight = cardHeight + CARD_BORDER * 2;
  const glowLevel = isDragging ? 0.5 : isHovered ? 0.28 : 0.14;

  // Drag handlers
  const releasePointerCapture = React.useCallback((event: any) => {
    if (pointerIdRef.current !== null && event?.target?.releasePointerCapture) {
      try {
        event.target.releasePointerCapture(pointerIdRef.current);
      } catch (error) {
        // Some XR controllers do not support releasePointerCapture
      }
    }
    pointerIdRef.current = null;
  }, []);

  const getWorldPoint = React.useCallback(
    (event: any) => {
      if (event?.point) {
        return event.point.clone();
      }
      if (event?.intersections?.[0]?.point) {
        return event.intersections[0].point.clone();
      }
      if (event?.ray) {
        const plane = dragPlaneRef.current;
        if (event.ray.intersectPlane(plane, intersectionPoint)) {
          return intersectionPoint.clone();
        }
      }
      return null;
    },
    [intersectionPoint]
  );

  const handlePointerDown = React.useCallback(
    (event: any) => {
      event.stopPropagation();
      setIsDragging(true);
      didDragRef.current = false;
      setIsHovered(true);

      const pointerId =
        typeof event.pointerId === 'number'
          ? event.pointerId
          : typeof event?.nativeEvent?.pointerId === 'number'
          ? event.nativeEvent.pointerId
          : null;

      if (pointerId !== null) {
        pointerIdRef.current = pointerId;
        if (event.target?.setPointerCapture) {
          try {
            event.target.setPointerCapture(pointerId);
          } catch (error) {
            // Ignore setPointerCapture errors in XR
          }
        }
      }
    },
    []
  );

  const endDrag = React.useCallback(
    (event: any) => {
      if (event) {
        releasePointerCapture(event);
      }
      setIsDragging(false);
    },
    [releasePointerCapture]
  );

  const handlePointerUp = React.useCallback(
    (event: any) => {
      event.stopPropagation();
      endDrag(event);
    },
    [endDrag]
  );

  const handlePointerMove = React.useCallback(
    (event: any) => {
      if (!isDragging) {
        return;
      }

      event.stopPropagation();
      const world = getWorldPoint(event);
      if (world) {
        onPositionChange([world.x, world.y, world.z]);
        didDragRef.current = true;
      }
    },
    [getWorldPoint, isDragging, onPositionChange]
  );

  const handlePointerCancel = React.useCallback(
    (event: any) => {
      endDrag(event);
    },
    [endDrag]
  );

  const handlePointerOver = React.useCallback(() => {
    setIsHovered(true);
  }, []);

  const handlePointerOut = React.useCallback(() => {
    if (!isDragging) {
      setIsHovered(false);
    }
  }, [isDragging]);

  return (
    <group ref={cardRef} position={position} rotation={rotation} scale={scale}>
      {/* Golden outer frame */}
      <RoundedBox
        args={[frameWidth + CARD_BORDER * 4, frameHeight + CARD_BORDER * 4, CARD_DEPTH * 0.45]}
        radius={0.07}
        smoothness={8}
      >
        <meshStandardMaterial
          color="#d4af37"
          metalness={0.85}
          roughness={0.28}
          emissive="#c28e0e"
          emissiveIntensity={isListening ? 0.9 : (0.25 + glowLevel)}
        />
      </RoundedBox>

      {/* Draggable area - invisible plane for dragging */}
      <mesh
        position={[0, 0, CARD_DEPTH / 2 + 0.1]}
        onPointerDown={(e) => {
          e.stopPropagation();
          if (e.nativeEvent?.stopImmediatePropagation) e.nativeEvent.stopImmediatePropagation();
          if (e.nativeEvent?.preventDefault) e.nativeEvent.preventDefault();
          handlePointerDown(e);
        }}
        onPointerUp={(e) => {
          e.stopPropagation();
          if (e.nativeEvent?.stopImmediatePropagation) e.nativeEvent.stopImmediatePropagation();
          if (e.nativeEvent?.preventDefault) e.nativeEvent.preventDefault();
          handlePointerUp(e);
        }}
        onPointerMove={(e) => {
          e.stopPropagation();
          handlePointerMove(e);
        }}
        onPointerCancel={(e) => {
          e.stopPropagation();
          handlePointerCancel(e);
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          handlePointerOver();
        }}
        onPointerOut={(e) => {
          e.stopPropagation();
          handlePointerOut();
        }}
      >
        <planeGeometry args={[frameWidth, frameHeight]} />
        <meshBasicMaterial transparent opacity={0} />
      </mesh>

      {/* Dark inner frame */}
      <RoundedBox
        args={[frameWidth + CARD_BORDER * 1.4, frameHeight + CARD_BORDER * 1.4, CARD_DEPTH * 0.6]}
        radius={0.065}
        smoothness={6}
        position={[0, 0, -CARD_DEPTH * 0.1]}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial
          color="#08090f"
          metalness={0.45}
          roughness={0.42}
          emissive="#101320"
          emissiveIntensity={0.3}
        />
      </RoundedBox>

      {/* Text display area */}
      <mesh position={[0, 0, CARD_DEPTH / 2 + 0.1]}>
        <planeGeometry args={[cardWidth, cardHeight]} />
        <meshBasicMaterial color="#0a0b10" />
      </mesh>

      {/* Coach title */}
      <Text
        position={[0, cardHeight / 2 - 0.2, CARD_DEPTH / 2 + 0.12]}
        fontSize={0.16}
        color="#d4af37"
        anchorX="center"
        anchorY="middle"
        maxWidth={cardWidth - 0.4}
      >
        LATORA LEG CAMP
      </Text>

      {/* Coach Andy Image */}
      <CoachImage />

      {/* Coach response text - below image */}
      <Text
        position={[0, -0.5, CARD_DEPTH / 2 + 0.12]}
        fontSize={0.11}
        color="#ffffff"
        anchorX="center"
        anchorY="middle"
        maxWidth={cardWidth - 0.4}
        textAlign="center"
        lineHeight={1.2}
        outlineWidth={0.01}
        outlineColor="#000000"
      >
        {coachResponse}
      </Text>

      {/* Microphone button */}
      <Interactive
        onSelect={(e) => {
          e?.stopPropagation?.();
          e?.preventDefault?.();
          handleMicClick();
        }}
        onSqueeze={(e) => {
          e?.stopPropagation?.();
          e?.preventDefault?.();
          handleMicClick();
        }}
      >
        <group position={[0, -cardHeight / 2 - 0.45, CARD_DEPTH / 2 + 0.12]}>
          <mesh
            onClick={(e) => {
              e.stopPropagation();
              e.nativeEvent?.stopImmediatePropagation?.();
              if (e.nativeEvent?.preventDefault) e.nativeEvent.preventDefault();
            }}
            onPointerDown={(e) => {
              e.stopPropagation();
              e.nativeEvent?.stopImmediatePropagation?.();
              if (e.nativeEvent?.preventDefault) e.nativeEvent.preventDefault();
              handleMicClick(e);
            }}
            onPointerUp={(e) => {
              e.stopPropagation();
              e.nativeEvent?.stopImmediatePropagation?.();
              if (e.nativeEvent?.preventDefault) e.nativeEvent.preventDefault();
            }}
            onPointerEnter={(e) => {
              e.stopPropagation();
            }}
            onPointerLeave={(e) => {
              e.stopPropagation();
            }}
            castShadow
            receiveShadow
          >
            <cylinderGeometry args={[0.2, 0.2, 0.08, 32]} />
            <meshStandardMaterial
              color={isListening ? '#ff4444' : isProcessing ? '#ffaa00' : '#44ff44'}
              emissive={isListening ? '#ff0000' : isProcessing ? '#ff8800' : '#00ff00'}
              emissiveIntensity={isListening ? 0.9 : isProcessing ? 0.7 : 0.5}
              metalness={0.7}
              roughness={0.3}
            />
          </mesh>

          {/* Microphone icon */}
          <mesh position={[0, 0.11, 0]}>
            <cylinderGeometry args={[0.05, 0.05, 0.15, 16]} />
            <meshStandardMaterial color="#111217" metalness={0.25} roughness={0.4} />
          </mesh>
          <mesh position={[0, 0.025, 0]}>
            <sphereGeometry args={[0.06, 16, 16]} />
            <meshStandardMaterial color="#111217" metalness={0.25} roughness={0.4} />
          </mesh>
        </group>
      </Interactive>
    </group>
  );
}

// Draggable 3D Video Panel for VR - ALL Cloudflare Stream videos (26 videos in numerical order)
const TECHNIQUE_CARDS_DATA = [
  { id: 'latora-1', label: '1', videoUrl: 'https://customer-gozi8qaaq1gycqie.cloudflarestream.com/d73bbb83d1be4f88fd829a2d5f49b37f/manifest/video.m3u8' },
  { id: 'latora-3', label: '3', videoUrl: 'https://customer-gozi8qaaq1gycqie.cloudflarestream.com/ca43a60a724a3d682490bfee8e0bb965/manifest/video.m3u8' },
  { id: 'latora-4', label: '4', videoUrl: 'https://customer-gozi8qaaq1gycqie.cloudflarestream.com/29fb5fadfb051b4db93725f893db934a/manifest/video.m3u8' },
  { id: 'latora-5', label: '5', videoUrl: 'https://customer-gozi8qaaq1gycqie.cloudflarestream.com/5cdbae66f8ee0443d77fcae0bceef3c3/manifest/video.m3u8' },
  { id: 'latora-7', label: '7', videoUrl: 'https://customer-gozi8qaaq1gycqie.cloudflarestream.com/2873ac9fa68aebe40b468ac8fed3a464/manifest/video.m3u8' },
  { id: 'latora-8', label: '8', videoUrl: 'https://customer-gozi8qaaq1gycqie.cloudflarestream.com/c0dcd8134f3bfb758ad714b5ec23e45d/manifest/video.m3u8' },
  { id: 'latora-9', label: '9', videoUrl: 'https://customer-gozi8qaaq1gycqie.cloudflarestream.com/631286cc03ab2740a61bd91e5c32c367/manifest/video.m3u8' },
  { id: 'latora-10', label: '10', videoUrl: 'https://customer-gozi8qaaq1gycqie.cloudflarestream.com/c82782d6c1e7510af33f6a4ad4316da2/manifest/video.m3u8' },
  { id: 'latora-11', label: '11', videoUrl: 'https://customer-gozi8qaaq1gycqie.cloudflarestream.com/ca81241e5191d111efa9b61a071fd6f6/manifest/video.m3u8' },
  { id: 'latora-12', label: '12', videoUrl: 'https://customer-gozi8qaaq1gycqie.cloudflarestream.com/f15aa06d795b0bfb8b5f5ed58c83a05b/manifest/video.m3u8' },
  { id: 'latora-13', label: '13', videoUrl: 'https://customer-gozi8qaaq1gycqie.cloudflarestream.com/575a880bd5aa1f5d3ca6d6b70b863912/manifest/video.m3u8' },
  { id: 'latora-14', label: '14', videoUrl: 'https://customer-gozi8qaaq1gycqie.cloudflarestream.com/37478d9b5def9d87b54089f3ed25abe8/manifest/video.m3u8' },
  { id: 'latora-16', label: '16', videoUrl: 'https://customer-gozi8qaaq1gycqie.cloudflarestream.com/3b38446f416732b63a88da593cf924d4/manifest/video.m3u8' },
  { id: 'latora-17', label: '17', videoUrl: 'https://customer-gozi8qaaq1gycqie.cloudflarestream.com/adb7f414e7fa2cd2f732487fc02c9cc6/manifest/video.m3u8' },
  { id: 'latora-18', label: '18', videoUrl: 'https://customer-gozi8qaaq1gycqie.cloudflarestream.com/608b4a61372622c7cb80e596c85121a6/manifest/video.m3u8' },
  { id: 'latora-19', label: '19', videoUrl: 'https://customer-gozi8qaaq1gycqie.cloudflarestream.com/f7a669ca97fc4016c2058e0b7e0f20f3/manifest/video.m3u8' },
  { id: 'latora-20', label: '20', videoUrl: 'https://customer-gozi8qaaq1gycqie.cloudflarestream.com/0b1cd41fcb5bcbbaf21ce5b4a5fd90f7/manifest/video.m3u8' },
  { id: 'latora-21', label: '21', videoUrl: 'https://customer-gozi8qaaq1gycqie.cloudflarestream.com/ca7f17ed70094a93542b4ed81b3dfa92/manifest/video.m3u8' },
  { id: 'latora-22', label: '22', videoUrl: 'https://customer-gozi8qaaq1gycqie.cloudflarestream.com/d9900e316d59f37a7277f732e1056b50/manifest/video.m3u8' },
  { id: 'latora-23', label: '23', videoUrl: 'https://customer-gozi8qaaq1gycqie.cloudflarestream.com/2312097c1d89808166bf2f3abf17cb1f/manifest/video.m3u8' },
  { id: 'latora-25', label: '25', videoUrl: 'https://customer-gozi8qaaq1gycqie.cloudflarestream.com/65a5beada7fe08cde3eafafcb3437dc5/manifest/video.m3u8' },
  { id: 'latora-26', label: '26', videoUrl: 'https://customer-gozi8qaaq1gycqie.cloudflarestream.com/a33ed8a91bdbcd5b5fa02a9f063af7e4/manifest/video.m3u8' },
  { id: 'latora-27', label: '27', videoUrl: 'https://customer-gozi8qaaq1gycqie.cloudflarestream.com/aca2f7cd37a92a8584cc5557885e5464/manifest/video.m3u8' },
  { id: 'latora-28', label: '28', videoUrl: 'https://customer-gozi8qaaq1gycqie.cloudflarestream.com/10f96e361fb7bc9fba72e03cab627bf2/manifest/video.m3u8' },
  { id: 'latora-29', label: '29', videoUrl: 'https://customer-gozi8qaaq1gycqie.cloudflarestream.com/92f373dcd7f6ef1ffd56f82cade76d2b/manifest/video.m3u8' },
  { id: 'latora-30', label: '30', videoUrl: 'https://customer-gozi8qaaq1gycqie.cloudflarestream.com/62021d0ebac3c0d19e2e82ab015a823b/manifest/video.m3u8' },
] as const;

const TECHNIQUE_CARD_PRESETS: TechniqueCardState[] = TECHNIQUE_CARDS_DATA.map((card, index) => {
  // Circular layout: 27 total positions in 2 rows (26 videos + 1 coach position at index 0)
  // Top row: 14 cards (indices 0-13)
  // Bottom row: 13 cards (indices 14-25, plus coach makes 14)
  const totalPositions = 27;
  const cardsPerRow = Math.ceil(totalPositions / 2); // 14 cards in top row
  const radius = 8; // 8 meters from center - increased to prevent overlapping

  // Video cards start at position 1 (position 0 reserved for coach)
  const cardPosition = index + 1;

  // Determine which row (0 = top, 1 = bottom)
  const row = cardPosition < cardsPerRow ? 0 : 1;
  const positionInRow = row === 0 ? cardPosition : cardPosition - cardsPerRow;
  const cardsInThisRow = row === 0 ? cardsPerRow : (totalPositions - cardsPerRow);

  // Height for each row
  const topRowHeight = CARD_BASE_HEIGHT + 2.0; // Higher
  const bottomRowHeight = CARD_BASE_HEIGHT + 1.0; // Lower
  const y = row === 0 ? topRowHeight : bottomRowHeight;

  // Calculate angle for this card in its row (in radians)
  // Offset top row by half the bottom row spacing to center cards between bottom cards
  const bottomRowSpacing = (Math.PI * 2) / (totalPositions - cardsPerRow); // 2π / 13
  const angleOffset = row === 0 ? bottomRowSpacing / 2 : 0; // Offset top row only
  const angle = (positionInRow / cardsInThisRow) * Math.PI * 2 + angleOffset;

  // Calculate position on circle
  // In Three.js: -Z is forward, +X is right, +Y is up
  const x = radius * Math.sin(angle);
  const z = -radius * Math.cos(angle);

  // Calculate rotation to face inward toward center
  // atan2 gives us the angle from center to the card, add PI to flip 180° inward
  const rotationY = Math.atan2(x, z) + Math.PI;

  return {
    id: card.id,
    label: card.label,
    position: [x, y, z],
    rotation: [0, rotationY, 0], // Properly face inward toward center
    scale: 0.5,
    videoUrl: card.videoUrl,
  };
});

// Main VR Scene Content
function VRSceneContent({ backgroundImageUrl, onScreenshot, onBackgroundReady }: VRSceneProps) {
  const [cards, setCards] = React.useState<TechniqueCardState[]>(() => TECHNIQUE_CARD_PRESETS);
  const [coachCardState, setCoachCardState] = React.useState({
    position: [0, CARD_BASE_HEIGHT + 1.5, -3] as [number, number, number], // Inside the circle (straight ahead, 3m away)
    scale: 0.5,
    rotation: [0, 0, 0] as [number, number, number],
  });
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

  const updateCoachPosition = React.useCallback((position: [number, number, number]) => {
    setCoachCardState((prev) => ({ ...prev, position }));
  }, []);

  const updateCoachScale = React.useCallback((scale: number) => {
    setCoachCardState((prev) => ({ ...prev, scale }));
  }, []);

  const updateCoachRotation = React.useCallback((rotation: [number, number, number]) => {
    setCoachCardState((prev) => ({ ...prev, rotation }));
  }, []);

  // Keyboard shortcut to export all card positions (Press 'P' to export)
  React.useEffect(() => {
    const handleKeyPress = (event: KeyboardEvent) => {
      if (event.key === 'p' || event.key === 'P') {
        console.log('========== VR CARD POSITIONS EXPORT ==========');
        console.log('Coach Card:', {
          position: coachCardState.position,
          rotation: coachCardState.rotation,
          scale: coachCardState.scale,
        });
        console.log('\nTechnique Cards:');
        cards.forEach((card, index) => {
          console.log(`${index + 1}. ${card.label}:`, {
            id: card.id,
            position: card.position,
            rotation: card.rotation,
            scale: card.scale,
          });
        });
        console.log('============================================');

        // Also log as copyable code
        console.log('\n// Copyable preset data:');
        console.log('const COACH_PRESET = ', JSON.stringify(coachCardState, null, 2));
        console.log('const CARDS_PRESET = ', JSON.stringify(cards, null, 2));
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [cards, coachCardState]);

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

        {/* Coach Andy chatbot card */}
        <CoachChatCard
          position={coachCardState.position}
          scale={coachCardState.scale}
          rotation={coachCardState.rotation}
          onPositionChange={updateCoachPosition}
          onScaleChange={updateCoachScale}
          onRotationChange={updateCoachRotation}
        />
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
