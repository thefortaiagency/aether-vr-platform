'use client';

import { useEffect, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useXR } from '@react-three/xr';
import * as THREE from 'three';

interface VideoTextureProps {
  position: [number, number, number];
  rotation?: [number, number, number];
  videoUrl: string;
  title?: string;
}

export function VideoTextureSimple({ position: initialPosition, rotation = [0, 0, 0], videoUrl, title }: VideoTextureProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const textureRef = useRef<THREE.VideoTexture | null>(null);
  const meshRef = useRef<THREE.Mesh>(null);
  const groupRef = useRef<THREE.Group>(null);
  const [videoTexture, setVideoTexture] = useState<THREE.VideoTexture | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  // Movable/Resizable state
  const [position, setPosition] = useState<[number, number, number]>(initialPosition);
  const [scale, setScale] = useState(1);
  const [isDragging, setIsDragging] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  const { camera } = useThree();
  const { isPresenting } = useXR();

  useEffect(() => {
    let mounted = true;
    let video: HTMLVideoElement | null = null;

    const setupVideo = async () => {
      try {
        console.log('📹 [SIMPLE] Setting up video:', videoUrl);

        video = document.createElement('video');
        video.crossOrigin = 'anonymous';
        video.loop = true;
        video.muted = true;
        video.playsInline = true;
        video.style.position = 'absolute';
        video.style.left = '-9999px';
        video.style.opacity = '0';

        document.body.appendChild(video);
        videoRef.current = video;
        video.src = videoUrl;

        const texture = new THREE.VideoTexture(video);
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.format = THREE.RGBAFormat;
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.generateMipmaps = false;
        textureRef.current = texture;

        video.onloadeddata = () => {
          if (!mounted) return;
          console.log('📊 [SIMPLE] Video data loaded');
          setIsLoaded(true);
          setVideoTexture(texture);

          // Auto-play
          video!.play().catch(err => console.error('Play error:', err));
        };

        video.load();

      } catch (error) {
        console.error('❌ [SIMPLE] Video setup error:', error);
      }
    };

    setupVideo();

    return () => {
      mounted = false;
      if (video) {
        video.pause();
        if (video.parentNode) video.parentNode.removeChild(video);
      }
      if (textureRef.current) {
        textureRef.current.dispose();
      }
    };
  }, [videoUrl]);

  useFrame(() => {
    if (textureRef.current && videoRef.current && videoRef.current.readyState >= videoRef.current.HAVE_CURRENT_DATA) {
      textureRef.current.needsUpdate = true;
    }
  });

  // Handle pointer down (start drag)
  const handlePointerDown = (e: any) => {
    e.stopPropagation();
    setIsDragging(true);
  };

  // Handle pointer up (end drag)
  const handlePointerUp = (e: any) => {
    e.stopPropagation();
    setIsDragging(false);
  };

  // Handle pointer move (drag)
  const handlePointerMove = (e: any) => {
    if (isDragging && e.point) {
      e.stopPropagation();
      setPosition([e.point.x, e.point.y, e.point.z]);
    }
  };

  // Handle mouse wheel (resize)
  const handleWheel = (e: any) => {
    e.stopPropagation();
    const delta = e.delta;
    setScale(prev => Math.max(0.5, Math.min(3, prev + delta * 0.001)));
  };

  if (!videoTexture || !isLoaded) {
    console.log('[SIMPLE] Not rendering - waiting for video');
    return null;
  }

  console.log('[SIMPLE] Rendering video panel');

  const baseWidth = 3.2;
  const baseHeight = 2;

  return (
    <group
      ref={groupRef}
      position={position}
      rotation={rotation}
      scale={scale}
    >
      {/* Video mesh */}
      <mesh
        ref={meshRef}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerMove={handlePointerMove}
        onPointerEnter={() => setIsHovered(true)}
        onPointerLeave={() => setIsHovered(false)}
        onWheel={handleWheel}
      >
        <planeGeometry args={[baseWidth, baseHeight]} />
        <meshBasicMaterial
          map={videoTexture}
          toneMapped={false}
          side={THREE.DoubleSide}
          opacity={isDragging ? 0.7 : 1}
          transparent
        />
      </mesh>

      {/* Glowing frame when hovered or dragging */}
      {(isHovered || isDragging) && (
        <mesh position={[0, 0, -0.01]}>
          <planeGeometry args={[baseWidth + 0.1, baseHeight + 0.1]} />
          <meshBasicMaterial
            color={isDragging ? 0xFFD700 : 0x00FFFF}
            emissive={isDragging ? 0xFFD700 : 0x00FFFF}
            emissiveIntensity={0.5}
            transparent
            opacity={0.3}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}

      {/* Title label when in VR */}
      {isPresenting && title && (
        <mesh position={[0, baseHeight / 2 + 0.3, 0.01]}>
          <planeGeometry args={[baseWidth, 0.2]} />
          <meshBasicMaterial color={0x000000} opacity={0.5} transparent />
        </mesh>
      )}
    </group>
  );
}
