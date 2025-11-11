'use client';

import { useEffect, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface VideoTextureProps {
  position: [number, number, number];
  rotation?: [number, number, number];
  videoUrl: string;
  title?: string;
}

export function VideoTextureSimple({ position, rotation, videoUrl }: VideoTextureProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const textureRef = useRef<THREE.VideoTexture | null>(null);
  const [videoTexture, setVideoTexture] = useState<THREE.VideoTexture | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

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

  if (!videoTexture || !isLoaded) {
    console.log('[SIMPLE] Not rendering - waiting for video');
    return null;
  }

  console.log('[SIMPLE] Rendering video panel');

  return (
    <mesh position={position} rotation={rotation}>
      <planeGeometry args={[3.2, 2]} />
      <meshBasicMaterial
        map={videoTexture}
        toneMapped={false}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}
