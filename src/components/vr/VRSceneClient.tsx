'use client';

import React from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, RoundedBox } from '@react-three/drei';
import { XR, createXRStore, useXR, Interactive } from '@react-three/xr';
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

// Create XR store OUTSIDE component to prevent recreation on re-renders
// Request 'layers' feature for WebXR Layers API support
const xrStore = createXRStore({
  foveation: 0, // Disable foveated rendering for better quality
});

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
  switch (type) {
    case 'plus':
      return (
        <group position={[0, 0.11, 0]}>
          <mesh raycast={() => null}>
            <boxGeometry args={[0.1, 0.02, 0.02]} />
            <meshStandardMaterial color="#111217" metalness={0.2} roughness={0.45} />
          </mesh>
          <mesh raycast={() => null} rotation={[0, 0, Math.PI / 2]}>
            <boxGeometry args={[0.1, 0.02, 0.02]} />
            <meshStandardMaterial color="#111217" metalness={0.2} roughness={0.45} />
          </mesh>
        </group>
      );
    case 'minus':
      return (
        <group position={[0, 0.11, 0]}>
          <mesh raycast={() => null}>
            <boxGeometry args={[0.1, 0.02, 0.02]} />
            <meshStandardMaterial color="#111217" metalness={0.2} roughness={0.45} />
          </mesh>
        </group>
      );
    case 'rotate-left':
      return (
        <group position={[0, 0.11, 0]}>
          <mesh raycast={() => null} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.07, 0.012, 18, 46, Math.PI * 1.25]} />
            <meshStandardMaterial color="#111217" metalness={0.25} roughness={0.4} />
          </mesh>
          <mesh raycast={() => null} position={[-0.065, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
            <coneGeometry args={[0.05, 0.11, 24]} />
            <meshStandardMaterial color="#111217" metalness={0.25} roughness={0.4} />
          </mesh>
        </group>
      );
    case 'rotate-right':
      return (
        <group position={[0, 0.11, 0]}>
          <mesh raycast={() => null} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.07, 0.012, 18, 46, Math.PI * 1.25]} />
            <meshStandardMaterial color="#111217" metalness={0.25} roughness={0.4} />
          </mesh>
          <mesh raycast={() => null} position={[0.065, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
            <coneGeometry args={[0.05, 0.11, 24]} />
            <meshStandardMaterial color="#111217" metalness={0.25} roughness={0.4} />
          </mesh>
        </group>
      );
    case 'play':
      return (
        <group position={[0, 0.11, 0]}>
          <mesh raycast={() => null} rotation={[0, 0, Math.PI / 2]}>
            <coneGeometry args={[0.11, 0.16, 24]} />
            <meshStandardMaterial color="#111217" metalness={0.25} roughness={0.4} />
          </mesh>
        </group>
      );
    case 'pause':
      return (
        <group position={[0, 0.11, 0]}>
          <mesh raycast={() => null} position={[-0.03, 0, 0]}>
            <boxGeometry args={[0.045, 0.16, 0.04]} />
            <meshStandardMaterial color="#111217" metalness={0.25} roughness={0.4} />
          </mesh>
          <mesh raycast={() => null} position={[0.03, 0, 0]}>
            <boxGeometry args={[0.045, 0.16, 0.04]} />
            <meshStandardMaterial color="#111217" metalness={0.25} roughness={0.4} />
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
    console.log('[VIDEO DEBUG] 🎮 requestPlay called', {
      url: videoUrl,
      hasVideo: !!video,
      videoPaused: video?.paused,
      videoEnded: video?.ended
    });

    if (!video) {
      return;
    }

    if (!video.paused && !video.ended) {
      console.log('[VIDEO DEBUG] ⚠️ Video already playing, skipping');
      return;
    }

    const attemptTime = Date.now();
    if (attemptTime - lastPlayAttemptRef.current < 250) {
      console.log('[VIDEO DEBUG] ⚠️ Play throttled (< 250ms since last attempt)');
      return;
    }

    lastPlayAttemptRef.current = attemptTime;

    console.log('[VIDEO DEBUG] 🚀 Calling video.play()');
    const playResult = video.play();
    if (playResult && typeof playResult.catch === 'function') {
      playResult
        .then(() => {
          console.log('[VIDEO DEBUG] ✅ video.play() succeeded');
        })
        .catch((error) => {
          console.warn('[VIDEO DEBUG] ❌ video.play() failed:', error);
        });
    }
  }, [videoUrl]);

  const requestPause = React.useCallback(() => {
    const video = videoRef.current;
    console.log('[VIDEO DEBUG] 🛑 requestPause called', {
      url: videoUrl,
      hasVideo: !!video,
      videoPaused: video?.paused,
      videoEnded: video?.ended,
      stack: new Error().stack
    });

    if (!video) {
      return;
    }

    if (video.paused || video.ended) {
      console.log('[VIDEO DEBUG] ⚠️ Video already paused/ended, skipping');
      return;
    }

    console.log('[VIDEO DEBUG] 🚨 Calling video.pause()');
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
    video.muted = true; // Must be muted for autoplay to work
    video.defaultMuted = true;
    video.autoplay = false;
    video.playsInline = true;
    video.setAttribute('playsinline', 'true');
    video.setAttribute('webkit-playsinline', 'true');
    video.setAttribute('loop', 'true');
    video.preload = 'auto';
    video.src = resolvedUrl;
    video.style.position = 'fixed';
    video.style.top = '10px';
    video.style.right = '10px';
    video.style.width = '200px';
    video.style.height = 'auto';
    video.style.zIndex = '9999';
    video.style.border = '3px solid red';
    video.style.pointerEvents = 'none';
    video.dataset.techniqueVideo = resolvedUrl;
    document.body.appendChild(video);

    const texture = new THREE.VideoTexture(video);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;

    console.log('[VIDEO DEBUG] 🎬 Created video texture', {
      url: resolvedUrl,
      textureUuid: texture.uuid,
      videoElement: video
    });

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
        console.log('[VIDEO DEBUG] ✅ Video loaded data', {
          url: resolvedUrl,
          readyState: video.readyState,
          duration: video.duration,
          videoWidth: video.videoWidth,
          videoHeight: video.videoHeight,
          paused: video.paused
        });

        // iOS/WebKit warmup: force GPU texture update
        const warmup = async () => {
          try {
            await video.play();
            setTimeout(() => {
              video.pause();
              video.currentTime = 0;
              setIsReady(true);
              markTextureDirty();
              console.log('[VIDEO DEBUG] 🔥 WebKit warmup complete');
            }, 50);
          } catch (error) {
            console.warn('[VIDEO DEBUG] ⚠️ Warmup failed, setting ready anyway:', error);
            setIsReady(true);
            markTextureDirty();
          }
        };

        warmup();
      }
    };

    const handleCanPlay = () => {
      console.log('[VIDEO DEBUG] ✅ Video can play', {
        url: resolvedUrl,
        readyState: video.readyState,
        paused: video.paused
      });
      setIsReady(true);
      markTextureDirty();
    };

    const handlePlay = () => {
      console.log('[VIDEO DEBUG] ▶️ Video playing', {
        url: resolvedUrl,
        currentTime: video.currentTime,
        paused: video.paused
      });
      setIsReady(true);
      setIsPlaying(true);
      markTextureDirty();
    };

    const handlePause = () => {
      console.log('[VIDEO DEBUG] ⏸️ Video paused', {
        url: resolvedUrl,
        currentTime: video.currentTime,
        readyState: video.readyState,
        muted: video.muted,
        paused: video.paused,
        ended: video.ended,
        error: video.error,
        networkState: video.networkState,
        stack: new Error().stack
      });
      setIsPlaying(false);
      markTextureDirty();
    };

    const handleError = () => {
      const mediaError = video.error;
      console.error('[VIDEO DEBUG] ❌ Video error', {
        code: mediaError?.code,
        message: mediaError?.message,
        url: resolvedUrl,
      });
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

    // Always mark texture as needing update when video has data, even if paused
    // This ensures the first frame shows when video is loaded but paused
    if (video.readyState >= 2) {
      texture.needsUpdate = true;

      // Debug: log texture state every 60 frames (~ once per second)
      if (Math.random() < 0.016) {
        console.log('[TEXTURE DEBUG] 🎨 Texture update', {
          url: resolvedUrl,
          textureUuid: texture.uuid,
          needsUpdate: texture.needsUpdate,
          videoCurrentTime: video.currentTime,
          videoPaused: video.paused,
          videoReadyState: video.readyState,
          textureImage: texture.image === video,
          videoWidth: video.videoWidth,
          videoHeight: video.videoHeight
        });
      }
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
  onPositionChange,
  onScaleChange,
  onRotationChange,
}: TechniqueCardProps) {
  const cardRef = React.useRef<THREE.Group>(null);
  const dragPlaneRef = React.useRef(new THREE.Plane(new THREE.Vector3(0, 1, 0), -position[1]));
  const intersectionPoint = React.useMemo(() => new THREE.Vector3(), []);
  const pointerIdRef = React.useRef<number | null>(null);
  const [isDragging, setIsDragging] = React.useState(false);
  const [isHovered, setIsHovered] = React.useState(false);
  const didDragRef = React.useRef(false);

  React.useEffect(() => {
    dragPlaneRef.current.constant = -position[1];
  }, [position[1]]);

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
      const didDrag = didDragRef.current;
      endDrag(event);

      if (!didDrag) {
        toggle();
      }
    },
    [endDrag, toggle]
  );

  const handlePointerMove = React.useCallback(
    (event: any) => {
      if (!isDragging) {
        return;
      }

      event.stopPropagation();
      const world = getWorldPoint(event);
      if (world) {
        onPositionChange([world.x, position[1], world.z]);
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
  const playbackOffsetY = controlOffsetY + 0.32;

  // Debug logging for render - only when isReady changes
  React.useEffect(() => {
    if (isReady) {
      console.log('[CARD DEBUG] ✅ Card ready', {
        videoUrl,
        hasTexture: !!texture,
        textureUuid: texture?.uuid,
        videoWidth,
        videoHeight
      });
    }
  }, [isReady, texture, videoUrl, videoWidth, videoHeight]);

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
        <RoundedBox
          args={[frameWidth + CARD_BORDER * 1.4, frameHeight + CARD_BORDER * 1.4, CARD_DEPTH * 0.6]}
          radius={0.065}
          smoothness={6}
          castShadow
          receiveShadow
          {...pointerHandlers}
        >
          <meshStandardMaterial
            color="#08090f"
            metalness={0.45}
            roughness={0.42}
            emissive="#101320"
            emissiveIntensity={0.18 + glowLevel * 0.55}
          />
        </RoundedBox>
        <mesh position={[0, 0, CARD_DEPTH / 2 + 0.001]} {...pointerHandlers}>
          <planeGeometry args={[videoWidth, videoHeight]} />
          <meshBasicMaterial
            map={texture && isReady ? texture : undefined}
            color={texture && isReady ? undefined : '#0f111a'}
            toneMapped={false}
            transparent={false}
            side={THREE.FrontSide}
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
    scale: 2.15,
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
