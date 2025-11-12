'use client';

import React from 'react';
import { Canvas } from '@react-three/fiber';
import { Text } from '@react-three/drei';
import { XR, createXRStore } from '@react-three/xr';
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
}

// Create XR store OUTSIDE component to prevent recreation on re-renders
// Request 'layers' feature for WebXR Layers API support
const xrStore = createXRStore({
  foveation: 0, // Disable foveated rendering for better quality
});

// Gymnasium Environment - Curved background screen for VR (full 360° equirect image)
function EquirectBackground({ backgroundImageUrl }: { backgroundImageUrl?: string }) {
  const textureRef = React.useRef<THREE.Texture | null>(null);
  const [ready, setReady] = React.useState(false);

  React.useEffect(() => {
    if (!backgroundImageUrl) {
      textureRef.current = null;
      setReady(false);
      return;
    }

    let disposed = false;
    const loader = new THREE.TextureLoader();

    loader.setCrossOrigin('anonymous');
    loader.load(
      backgroundImageUrl,
      (tex) => {
        if (disposed) return;
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.wrapS = THREE.ClampToEdgeWrapping;
        tex.wrapT = THREE.ClampToEdgeWrapping;
        tex.mapping = THREE.EquirectangularReflectionMapping;
        textureRef.current = tex;
        setReady(true);
      },
      undefined,
      (error) => {
        console.error('[VR BACKGROUND] Failed to load 360 asset', error);
        textureRef.current = null;
        setReady(false);
      }
    );

    return () => {
      disposed = true;
      if (textureRef.current) {
        textureRef.current.dispose();
        textureRef.current = null;
      }
    };
  }, [backgroundImageUrl]);

  return (
    <mesh>
      <sphereGeometry args={[60, 64, 64]} />
      <meshBasicMaterial
        map={ready ? textureRef.current ?? undefined : undefined}
        color={ready ? 0xffffff : 0x101020}
        side={THREE.BackSide}
        toneMapped={false}
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
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

interface TechniqueCardProps extends TechniqueCardState {
  onPositionChange: (position: [number, number, number]) => void;
  onScaleChange: (scale: number) => void;
}

function TechniqueCard({
  title,
  description,
  position,
  rotation,
  scale,
  color,
  onPositionChange,
  onScaleChange,
}: TechniqueCardProps) {
  const cardRef = React.useRef<THREE.Group>(null);
  const dragPlane = React.useMemo(() => new THREE.Plane(new THREE.Vector3(0, 0, 1), position[2]), [position]);
  const intersectionPoint = React.useMemo(() => new THREE.Vector3(), []);
  const raycaster = React.useMemo(() => new THREE.Raycaster(), []);
  const [isDragging, setIsDragging] = React.useState(false);
  const lastPointerId = React.useRef<number | null>(null);

  const handlePointerDown = (event: any) => {
    event.stopPropagation();
    setIsDragging(true);
    lastPointerId.current = event.pointerId ?? null;
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
      return;
    }

    if (event.ray) {
      raycaster.ray.origin.copy(event.ray.origin);
      raycaster.ray.direction.copy(event.ray.direction);
      raycaster.ray.intersectPlane(dragPlane, intersectionPoint);
      if (!Number.isNaN(intersectionPoint.x)) {
        onPositionChange([intersectionPoint.x, intersectionPoint.y, position[2]]);
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

  return (
    <group ref={cardRef} position={position} rotation={rotation} scale={scale}>
      <group>
        <mesh
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
          onPointerMove={handlePointerMove}
          onPointerCancel={handlePointerUp}
          onWheel={handleWheel}
        >
          <boxGeometry args={[CARD_BASE_SIZE[0], CARD_BASE_SIZE[1], CARD_DEPTH]} />
          <meshStandardMaterial
            color={color}
            metalness={0.1}
            roughness={0.35}
            transparent
            opacity={isDragging ? 0.75 : 0.95}
          />
        </mesh>

        {/* Front face */}
        <mesh position={[0, 0, CARD_DEPTH / 2 + 0.002]}>
          <planeGeometry args={[CARD_BASE_SIZE[0] * 0.96, CARD_BASE_SIZE[1] * 0.86]} />
          <meshBasicMaterial color="#0f172a" opacity={0.92} transparent />
        </mesh>

        <Text
          position={[0, CARD_BASE_SIZE[1] * 0.23, CARD_DEPTH / 2 + 0.01]}
          fontSize={0.12}
          maxWidth={CARD_BASE_SIZE[0] * 0.8}
          color="white"
          anchorX="center"
          anchorY="middle"
        >
          {title}
        </Text>

        <Text
          position={[0, -CARD_BASE_SIZE[1] * 0.05, CARD_DEPTH / 2 + 0.01]}
          fontSize={0.085}
          maxWidth={CARD_BASE_SIZE[0] * 0.82}
          lineHeight={1.2}
          color="#9ca3af"
          anchorX="center"
          anchorY="middle"
        >
          {description}
        </Text>

        <group position={[CARD_BASE_SIZE[0] / 2 + 0.05, 0, CARD_DEPTH / 2 + 0.015]}>
          <mesh
            position={[0, 0.18, 0]}
            scale={[0.3, 0.3, 0.3]}
            onPointerDown={(event: any) => {
              event.stopPropagation();
              adjustScale(0.08);
            }}
          >
            <boxGeometry args={[0.25, 0.1, 0.05]} />
            <meshStandardMaterial color="#22d3ee" emissive="#0891b2" emissiveIntensity={0.8} />
            <Text position={[0, 0, 0.03]} fontSize={0.07} color="#0f172a" anchorX="center" anchorY="middle">
              +
            </Text>
          </mesh>
          <mesh
            position={[0, -0.18, 0]}
            scale={[0.3, 0.3, 0.3]}
            onPointerDown={(event: any) => {
              event.stopPropagation();
              adjustScale(-0.08);
            }}
          >
            <boxGeometry args={[0.25, 0.1, 0.05]} />
            <meshStandardMaterial color="#facc15" emissive="#ca8a04" emissiveIntensity={0.7} />
            <Text position={[0, 0, 0.03]} fontSize={0.07} color="#0f172a" anchorX="center" anchorY="middle">
              -
            </Text>
          </mesh>
        </group>
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
  },
  {
    id: 'hand-fight',
    title: 'Hand Fighting',
    description: 'Win inside ties. Snap, club, and clear wrists until you feel the opening.',
    position: [-0.8, 1.7, -3],
    rotation: [0, Math.PI / 26, 0],
    scale: 1,
    color: '#1f2a44',
  },
  {
    id: 'setup',
    title: 'Shot Setups',
    description: 'Change levels, fake high, shoot through. Eyes up and trail leg tight.',
    position: [0.6, 1.55, -3],
    rotation: [0, -Math.PI / 26, 0],
    scale: 1,
    color: '#1d3557',
  },
  {
    id: 'finish',
    title: 'Finish Mechanics',
    description: 'Cut the corner, head in the ribs, climb the body. Never stay on your knees.',
    position: [2, 1.45, -3.1],
    rotation: [0, -Math.PI / 18, 0],
    scale: 1,
    color: '#14213d',
  },
  {
    id: 'mat-return',
    title: 'Mat Return',
    description: 'Lift with legs, block hips, return with control. Land them flat every time.',
    position: [-1.3, 0.65, -2.8],
    rotation: [0, Math.PI / 20, 0],
    scale: 0.95,
    color: '#1c1f3a',
  },
  {
    id: 'chain',
    title: 'Chain Wrestling',
    description: 'Two steps ahead. Flow from setups to finishes to rides without pausing.',
    position: [1.1, 0.7, -2.9],
    rotation: [0, -Math.PI / 28, 0],
    scale: 0.98,
    color: '#192742',
  },
];

// Main VR Scene Content
function VRSceneContent({ backgroundImageUrl, onScreenshot }: VRSceneProps) {
  const [cards, setCards] = React.useState<TechniqueCardState[]>(() => TECHNIQUE_CARD_PRESETS);

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

      <EquirectBackground backgroundImageUrl={backgroundImageUrl} />

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
        <planeGeometry args={[120, 120]} />
        <meshStandardMaterial color="#0b1120" />
      </mesh>

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
