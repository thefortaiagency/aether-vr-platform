'use client';

import { useEffect, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Text } from '@react-three/drei';
import * as THREE from 'three';

interface VideoTextureProps {
  position: [number, number, number];
  rotation?: [number, number, number];
  videoUrl: string;
  title?: string;
}

export function VideoTexture({ position: initialPosition, rotation, videoUrl, title = 'Technique Video' }: VideoTextureProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const textureRef = useRef<THREE.VideoTexture | null>(null);
  const [videoTexture, setVideoTexture] = useState<THREE.VideoTexture | null>(null);
  const [position, setPosition] = useState<[number, number, number]>(initialPosition);
  const [rotation3D, setRotation3D] = useState<[number, number, number]>(rotation || [0, 0, 0]);
  const [scale, setScale] = useState(1);
  const [isDragging, setIsDragging] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isMuted, setIsMuted] = useState(true);

  useEffect(() => {
    let mounted = true;
    let video: HTMLVideoElement | null = null;

    const setupVideo = async () => {
      try {
        console.log('📹 Setting up video texture for:', videoUrl);

        // Create video element
        video = document.createElement('video');
        video.crossOrigin = 'anonymous';
        video.loop = true;
        video.muted = true; // Required for autoplay in VR
        video.playsInline = true;
        video.setAttribute('playsinline', 'true');
        video.setAttribute('webkit-playsinline', 'true');

        // Position off-screen instead of display:none (fixes black texture in VR)
        video.style.position = 'absolute';
        video.style.left = '-9999px';
        video.style.opacity = '0';
        video.style.pointerEvents = 'none';

        document.body.appendChild(video);
        videoRef.current = video;

        // Set video source
        video.src = videoUrl;

        // Create texture but don't set it to state yet (wait for video to load)
        const texture = new THREE.VideoTexture(video);
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.format = THREE.RGBAFormat;
        texture.colorSpace = THREE.SRGBColorSpace; // Fix color space for VR
        texture.generateMipmaps = false; // Performance optimization
        textureRef.current = texture;

        console.log('✅ Video texture created with sRGB color space (waiting for video load)');

        // Event listeners
        video.onloadstart = () => {
          console.log('🔄 Video load started for:', videoUrl);
        };

        video.onloadedmetadata = () => {
          console.log('📦 Video metadata loaded, duration:', video!.duration, 'seconds');
        };

        video.onloadeddata = () => {
          console.log('📊 Video data loaded, size:', video!.videoWidth, 'x', video!.videoHeight);
          setIsLoaded(true);
          if (textureRef.current) {
            textureRef.current.needsUpdate = true;
            // Now it's safe to render the texture
            setVideoTexture(textureRef.current);
            console.log('✅ Video texture ready to render');
          }
        };

        video.oncanplay = () => {
          console.log('✅ Video can play');
          if (textureRef.current) {
            textureRef.current.needsUpdate = true;
          }
        };

        video.onplaying = () => {
          console.log('▶️ Video is playing');
          setIsPlaying(true);
          if (textureRef.current) {
            textureRef.current.needsUpdate = true;
          }
        };

        video.onpause = () => {
          console.log('⏸️ Video paused');
          setIsPlaying(false);
        };

        video.onerror = (e) => {
          console.error('❌ Video error:', {
            error: video!.error,
            code: video!.error?.code,
            message: video!.error?.message,
            src: video!.src,
            networkState: video!.networkState,
            readyState: video!.readyState
          });
        };

        video.onstalled = () => {
          console.warn('⚠️ Video stalled (network issue?)');
        };

        video.onsuspend = () => {
          console.warn('⏸️ Video suspend (paused by browser)');
        };

        video.onwaiting = () => {
          console.warn('⏳ Video waiting for data...');
        };

        video.onprogress = () => {
          if (video!.buffered.length > 0) {
            const buffered = (video!.buffered.end(0) / video!.duration) * 100;
            console.log('📶 Video buffered:', buffered.toFixed(1) + '%');
          }
        };

        // Load the video
        console.log('🎬 Starting video load from:', videoUrl);
        video.load();

      } catch (error) {
        console.error('❌ Video setup error:', error);
      }
    };

    setupVideo();

    return () => {
      mounted = false;
      if (video) {
        video.pause();
        try {
          if (video.parentNode && document.body.contains(video)) {
            video.parentNode.removeChild(video);
          }
        } catch (error) {
          console.warn('Video element cleanup warning:', error);
        }
      }
      if (textureRef.current) {
        textureRef.current.dispose();
      }
    };
  }, [videoUrl]);

  // Update texture every frame
  useFrame(() => {
    if (textureRef.current && videoRef.current && videoRef.current.readyState >= videoRef.current.HAVE_CURRENT_DATA) {
      textureRef.current.needsUpdate = true;
    }
  });

  // Drag handlers with 3D movement
  const dragStart = useRef<{ x: number, y: number, z: number } | null>(null);

  const handlePointerDown = (e: any) => {
    setIsDragging(true);
    if (e.point) {
      dragStart.current = {
        x: e.point.x - position[0],
        y: e.point.y - position[1],
        z: e.point.z - position[2]
      };
    }
  };

  const handlePointerUp = () => {
    setIsDragging(false);
    dragStart.current = null;
  };

  const handlePointerMove = (e: any) => {
    if (isDragging && e.point && dragStart.current) {
      // Full 3D movement - X, Y, and Z axes
      setPosition([
        e.point.x - dragStart.current.x,
        e.point.y - dragStart.current.y,
        e.point.z - dragStart.current.z
      ]);
    }
  };

  // Resize handler (mouse wheel)
  const handleWheel = (e: any) => {
    e.stopPropagation();
    e.preventDefault();
    const delta = e.deltaY * -0.001;
    const newScale = Math.max(0.5, Math.min(3, scale + delta));
    setScale(newScale);
    console.log('📏 Resizing:', newScale.toFixed(2) + 'x');
  };

  // Resize button handlers
  const handleZoomIn = (e: any) => {
    e.stopPropagation();
    const newScale = Math.min(3, scale + 0.2);
    setScale(newScale);
    console.log('➕ Zoom in:', newScale.toFixed(2) + 'x');
  };

  const handleZoomOut = (e: any) => {
    e.stopPropagation();
    const newScale = Math.max(0.5, scale - 0.2);
    setScale(newScale);
    console.log('➖ Zoom out:', newScale.toFixed(2) + 'x');
  };

  // Play/pause handler
  const handleClick = (e: any) => {
    e.stopPropagation();
    if (videoRef.current && isLoaded) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play()
          .then(() => {
            console.log('🎬 Video playback started');
            // Auto-unmute when user clicks to play (user interaction allows audio)
            if (isMuted && videoRef.current) {
              videoRef.current.muted = false;
              setIsMuted(false);
              console.log('🔊 Audio enabled (user interaction)');
            }
          })
          .catch(err => console.error('❌ Play error:', err));
      }
    }
  };

  // Toggle mute handler
  const handleMuteToggle = (e: any) => {
    e.stopPropagation();
    if (videoRef.current) {
      videoRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
      console.log(isMuted ? '🔊 Audio unmuted' : '🔇 Audio muted');
    }
  };

  // Rotation handlers
  const handleRotateY = (direction: number) => (e: any) => {
    e.stopPropagation();
    setRotation3D(prev => [prev[0], prev[1] + (Math.PI / 6) * direction, prev[2]]);
    console.log('🔄 Rotate Y:', direction > 0 ? 'clockwise' : 'counter-clockwise');
  };

  const handleRotateX = (direction: number) => (e: any) => {
    e.stopPropagation();
    setRotation3D(prev => [prev[0] + (Math.PI / 6) * direction, prev[1], prev[2]]);
    console.log('🔄 Rotate X:', direction > 0 ? 'down' : 'up');
  };

  const handleResetRotation = (e: any) => {
    e.stopPropagation();
    setRotation3D(rotation || [0, 0, 0]);
    console.log('🔄 Reset rotation');
  };

  const baseWidth = 3.2;
  const baseHeight = 2;

  return (
    <group position={position} rotation={rotation3D} scale={[scale, scale, 1]}>
      {/* Video Screen */}
      <mesh
        ref={meshRef}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerMove={handlePointerMove}
        onWheel={handleWheel}
        onClick={handleClick}
      >
        <planeGeometry args={[baseWidth, baseHeight]} />
        {videoTexture ? (
          <meshBasicMaterial
            map={videoTexture}
            toneMapped={false}
            side={THREE.DoubleSide}
          />
        ) : (
          <meshStandardMaterial
            color={isDragging ? "#FFD700" : "#1a1a1a"}
            emissive={isDragging ? "#FFD700" : "#444444"}
            emissiveIntensity={isDragging ? 0.5 : 0.2}
          />
        )}
      </mesh>

      {/* Title Label */}
      <Text
        position={[0, baseHeight / 2 + 0.2, 0.02]}
        fontSize={0.12}
        color="#FFD700"
        anchorX="center"
        outlineWidth={0.01}
        outlineColor="#000"
      >
        {title}
      </Text>

      {/* Status */}
      <Text
        position={[0, baseHeight / 2 + 0.4, 0.02]}
        fontSize={0.08}
        color={isPlaying ? "#00FF00" : "#FFD700"}
        anchorX="center"
        outlineWidth={0.005}
        outlineColor="#000"
      >
        {isPlaying ? '▶️ Playing' : isLoaded ? '⏸️ Paused' : '⏳ Loading...'}
      </Text>

      {/* Instructions */}
      {!isDragging && (
        <Text
          position={[0, -baseHeight / 2 - 0.2, 0.02]}
          fontSize={0.08}
          color="#FFFFFF"
          anchorX="center"
          outlineWidth={0.005}
          outlineColor="#000"
        >
          Click to {isPlaying ? 'Pause' : 'Play'} • Drag in 3D
        </Text>
      )}

      {/* Resize Controls - Top Corners */}
      {/* Zoom In Button - Top Right */}
      <group position={[baseWidth / 2 - 0.15, baseHeight / 2 + 0.3, 0.02]}>
        <mesh onClick={handleZoomIn}>
          <circleGeometry args={[0.12, 32]} />
          <meshStandardMaterial
            color="#00FF00"
            emissive="#00FF00"
            emissiveIntensity={0.5}
            transparent
            opacity={0.3}
          />
        </mesh>
        <Text
          position={[0, 0, 0.01]}
          fontSize={0.15}
          color="#FFFFFF"
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.01}
          outlineColor="#000"
        >
          +
        </Text>
      </group>

      {/* Zoom Out Button - Top Left */}
      <group position={[-baseWidth / 2 + 0.15, baseHeight / 2 + 0.3, 0.02]}>
        <mesh onClick={handleZoomOut}>
          <circleGeometry args={[0.12, 32]} />
          <meshStandardMaterial
            color="#FF6B6B"
            emissive="#FF6B6B"
            emissiveIntensity={0.5}
            transparent
            opacity={0.3}
          />
        </mesh>
        <Text
          position={[0, 0, 0.01]}
          fontSize={0.15}
          color="#FFFFFF"
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.01}
          outlineColor="#000"
        >
          −
        </Text>
      </group>

      {/* Scale Indicator */}
      <Text
        position={[0, baseHeight / 2 + 0.3, 0.02]}
        fontSize={0.08}
        color="#FFD700"
        anchorX="center"
        outlineWidth={0.005}
        outlineColor="#000"
      >
        {(scale * 100).toFixed(0)}%
      </Text>

      {/* Audio Status - bottom right */}
      {isPlaying && (
        <Text
          position={[baseWidth / 2 - 0.3, -baseHeight / 2 + 0.2, 0.02]}
          fontSize={0.1}
          color={isMuted ? "#FF6B6B" : "#00FF00"}
          anchorX="center"
          outlineWidth={0.005}
          outlineColor="#000"
        >
          {isMuted ? '🔇' : '🔊'}
        </Text>
      )}

      {/* Golden Frame */}
      <lineSegments>
        <edgesGeometry attach="geometry" args={[new THREE.PlaneGeometry(baseWidth, baseHeight)]} />
        <lineBasicMaterial
          attach="material"
          color={isDragging ? "#FFD700" : "#D4AF37"}
          linewidth={3}
        />
      </lineSegments>

      {/* Play/Pause Indicator */}
      {isLoaded && (
        <mesh position={[baseWidth / 2 - 0.2, baseHeight / 2 - 0.1, 0.02]}>
          <sphereGeometry args={[0.05, 16, 16]} />
          <meshStandardMaterial
            color={isPlaying ? "#00ff00" : "#FFD700"}
            emissive={isPlaying ? "#00ff00" : "#FFD700"}
            emissiveIntensity={1}
          />
        </mesh>
      )}

      {/* Drag Indicator */}
      {isDragging && (
        <mesh position={[-baseWidth / 2 + 0.2, baseHeight / 2 - 0.1, 0.02]}>
          <sphereGeometry args={[0.05, 16, 16]} />
          <meshStandardMaterial
            color="#FFD700"
            emissive="#FFD700"
            emissiveIntensity={1}
          />
        </mesh>
      )}

      {/* Audio Toggle Button - clickable sphere bottom right */}
      {isPlaying && (
        <mesh
          position={[baseWidth / 2 - 0.3, -baseHeight / 2 + 0.2, 0.02]}
          onClick={handleMuteToggle}
        >
          <sphereGeometry args={[0.08, 16, 16]} />
          <meshStandardMaterial
            color={isMuted ? "#FF6B6B" : "#00FF00"}
            emissive={isMuted ? "#FF6B6B" : "#00FF00"}
            emissiveIntensity={0.5}
            transparent
            opacity={0.3}
          />
        </mesh>
      )}

      {/* Rotation Controls - Bottom Center */}
      {/* Rotate Left (Y-axis) */}
      <group position={[-baseWidth / 2 + 0.3, -baseHeight / 2 - 0.35, 0.02]}>
        <mesh onClick={handleRotateY(-1)}>
          <circleGeometry args={[0.1, 32]} />
          <meshStandardMaterial
            color="#00BFFF"
            emissive="#00BFFF"
            emissiveIntensity={0.5}
            transparent
            opacity={0.3}
          />
        </mesh>
        <Text
          position={[0, 0, 0.01]}
          fontSize={0.12}
          color="#FFFFFF"
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.01}
          outlineColor="#000"
        >
          ↶
        </Text>
      </group>

      {/* Rotate Right (Y-axis) */}
      <group position={[baseWidth / 2 - 0.3, -baseHeight / 2 - 0.35, 0.02]}>
        <mesh onClick={handleRotateY(1)}>
          <circleGeometry args={[0.1, 32]} />
          <meshStandardMaterial
            color="#00BFFF"
            emissive="#00BFFF"
            emissiveIntensity={0.5}
            transparent
            opacity={0.3}
          />
        </mesh>
        <Text
          position={[0, 0, 0.01]}
          fontSize={0.12}
          color="#FFFFFF"
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.01}
          outlineColor="#000"
        >
          ↷
        </Text>
      </group>

      {/* Rotate Up (X-axis) */}
      <group position={[-0.25, -baseHeight / 2 - 0.35, 0.02]}>
        <mesh onClick={handleRotateX(-1)}>
          <circleGeometry args={[0.1, 32]} />
          <meshStandardMaterial
            color="#9370DB"
            emissive="#9370DB"
            emissiveIntensity={0.5}
            transparent
            opacity={0.3}
          />
        </mesh>
        <Text
          position={[0, 0, 0.01]}
          fontSize={0.12}
          color="#FFFFFF"
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.01}
          outlineColor="#000"
        >
          ⤴
        </Text>
      </group>

      {/* Rotate Down (X-axis) */}
      <group position={[0.25, -baseHeight / 2 - 0.35, 0.02]}>
        <mesh onClick={handleRotateX(1)}>
          <circleGeometry args={[0.1, 32]} />
          <meshStandardMaterial
            color="#9370DB"
            emissive="#9370DB"
            emissiveIntensity={0.5}
            transparent
            opacity={0.3}
          />
        </mesh>
        <Text
          position={[0, 0, 0.01]}
          fontSize={0.12}
          color="#FFFFFF"
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.01}
          outlineColor="#000"
        >
          ⤵
        </Text>
      </group>

      {/* Reset Rotation Button - Center Bottom */}
      <group position={[0, -baseHeight / 2 - 0.35, 0.02]}>
        <mesh onClick={handleResetRotation}>
          <circleGeometry args={[0.08, 32]} />
          <meshStandardMaterial
            color="#FFD700"
            emissive="#FFD700"
            emissiveIntensity={0.5}
            transparent
            opacity={0.3}
          />
        </mesh>
        <Text
          position={[0, 0, 0.01]}
          fontSize={0.08}
          color="#FFFFFF"
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.01}
          outlineColor="#000"
        >
          ⟲
        </Text>
      </group>

      {/* Rotation Instructions */}
      {!isDragging && (
        <Text
          position={[0, -baseHeight / 2 - 0.55, 0.02]}
          fontSize={0.06}
          color="#FFFFFF"
          anchorX="center"
          outlineWidth={0.005}
          outlineColor="#000"
        >
          360° Rotation • Click to Play
        </Text>
      )}
    </group>
  );
}
