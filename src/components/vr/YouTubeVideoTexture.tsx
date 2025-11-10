'use client';

import { useEffect, useRef, useState } from 'react';
import { Text, Html } from '@react-three/drei';
import * as THREE from 'three';

interface YouTubeVideoTextureProps {
  position: [number, number, number];
  rotation?: [number, number, number];
  videoUrl: string;
  title?: string;
}

export function YouTubeVideoTexture({ position: initialPosition, rotation, videoUrl, title = 'Technique Video' }: YouTubeVideoTextureProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const [position, setPosition] = useState<[number, number, number]>(initialPosition);
  const [scale, setScale] = useState(1);
  const [isDragging, setIsDragging] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);

  // Extract video ID from YouTube URL
  const getVideoId = (url: string) => {
    const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\s]+)/);
    return match ? match[1] : null;
  };

  const videoId = getVideoId(videoUrl);
  const embedUrl = videoId ? `https://www.youtube.com/embed/${videoId}?autoplay=0&controls=1&modestbranding=1` : null;

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

  const handleClick = () => {
    setIsPlaying(!isPlaying);
  };

  // Resize handler (mouse wheel)
  const handleWheel = (e: any) => {
    e.stopPropagation();
    const delta = e.deltaY * -0.001;
    setScale(prev => Math.max(0.5, Math.min(3, prev + delta)));
  };

  const baseWidth = 3.2;
  const baseHeight = 2;

  return (
    <group position={position} rotation={rotation}>
      {/* Video Card Background */}
      <mesh
        ref={meshRef}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerMove={handlePointerMove}
        onWheel={handleWheel}
        onClick={handleClick}
      >
        <planeGeometry args={[baseWidth * scale, baseHeight * scale]} />
        <meshStandardMaterial
          color={isDragging ? "#FFD700" : "#1a1a1a"}
          opacity={isDragging ? 0.9 : 1}
          transparent
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* YouTube iframe overlay */}
      {embedUrl && (
        <Html
          transform
          position={[0, 0, 0.01]}
          distanceFactor={1.5 / scale}
          style={{
            width: `${640 * scale}px`,
            height: `${400 * scale}px`,
            pointerEvents: isPlaying ? 'auto' : 'none',
          }}
        >
          <div
            style={{
              width: '100%',
              height: '100%',
              background: '#000',
              borderRadius: '8px',
              overflow: 'hidden',
              border: isDragging ? '2px solid #FFD700' : '2px solid #D4AF37',
            }}
          >
            {isPlaying ? (
              <iframe
                width="100%"
                height="100%"
                src={`${embedUrl}&autoplay=1`}
                title={title}
                frameBorder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                style={{ display: 'block' }}
              />
            ) : (
              <div
                style={{
                  width: '100%',
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: `linear-gradient(rgba(0,0,0,0.7), rgba(0,0,0,0.7)), url(https://img.youtube.com/vi/${videoId}/maxresdefault.jpg)`,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                  cursor: 'pointer',
                }}
                onClick={() => setIsPlaying(true)}
              >
                <div
                  style={{
                    width: '80px',
                    height: '80px',
                    background: 'rgba(212, 175, 55, 0.9)',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'transform 0.2s',
                  }}
                >
                  <div
                    style={{
                      width: '0',
                      height: '0',
                      borderLeft: '30px solid white',
                      borderTop: '20px solid transparent',
                      borderBottom: '20px solid transparent',
                      marginLeft: '8px',
                    }}
                  />
                </div>
              </div>
            )}
          </div>
        </Html>
      )}

      {/* Title Label */}
      <Text
        position={[0, (baseHeight * scale) / 2 + 0.2, 0.02]}
        fontSize={0.12 * scale}
        color="#FFD700"
        anchorX="center"
        outlineWidth={0.01}
        outlineColor="#000"
      >
        {title}
      </Text>

      {/* Instructions */}
      {!isPlaying && !isDragging && (
        <Text
          position={[0, -(baseHeight * scale) / 2 - 0.2, 0.02]}
          fontSize={0.08 * scale}
          color="#FFFFFF"
          anchorX="center"
          outlineWidth={0.005}
          outlineColor="#000"
        >
          Click to Play • Drag to Move • Scroll to Resize
        </Text>
      )}

      {/* Golden Frame */}
      <lineSegments>
        <edgesGeometry attach="geometry" args={[new THREE.PlaneGeometry(baseWidth * scale, baseHeight * scale)]} />
        <lineBasicMaterial
          attach="material"
          color={isDragging ? "#FFD700" : "#D4AF37"}
          linewidth={3}
        />
      </lineSegments>

      {/* Drag Indicator */}
      {isDragging && (
        <mesh position={[(baseWidth * scale) / 2 - 0.2, (baseHeight * scale) / 2 - 0.1, 0.02]}>
          <sphereGeometry args={[0.05 * scale, 16, 16]} />
          <meshStandardMaterial
            color="#FFD700"
            emissive="#FFD700"
            emissiveIntensity={1}
          />
        </mesh>
      )}
    </group>
  );
}
