'use client';

import { useEffect, useRef, useState } from 'react';
import { useXR, useXREvent } from '@react-three/xr';
import { Text } from '@react-three/drei';
import * as THREE from 'three';

interface TwilioVideoLayerProps {
  position: [number, number, number];
  roomName: string;
  userName: string;
  onConnected?: () => void;
}

export function TwilioVideoLayer({ position: initialPosition, roomName, userName, onConnected }: TwilioVideoLayerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const roomRef = useRef<any>(null);
  const layerRef = useRef<any>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [participantName, setParticipantName] = useState('Coach');
  const [position, setPosition] = useState<[number, number, number]>(initialPosition);
  const [rotation3D, setRotation3D] = useState<[number, number, number]>([0, 0, 0]);
  const [scale, setScale] = useState(1);
  const [isDragging, setIsDragging] = useState(false);
  const [isVRActive, setIsVRActive] = useState(false);

  // Access XR state
  const { session, isPresenting } = useXR();

  // Track VR session changes
  useEffect(() => {
    setIsVRActive(isPresenting);
    console.log('🥽 VR Active:', isPresenting);
  }, [isPresenting]);

  // Connect to Twilio and create video element
  useEffect(() => {
    let mounted = true;
    let video: HTMLVideoElement | null = null;

    const connectToTwilio = async () => {
      try {
        console.log('🔄 Connecting to Twilio room:', roomName, 'as:', userName);

        // Dynamic import of Twilio Video
        const Video = await import('twilio-video');

        // Get token from API
        const response = await fetch('/api/twilio/video-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            room: roomName,
            identity: `${userName}-vr-${Date.now()}`
          })
        });

        if (!response.ok) {
          const errorData = await response.json();
          console.error('❌ Token API error:', response.status, errorData);
          throw new Error(`Failed to get token: ${response.status}`);
        }

        const { token } = await response.json();
        console.log('✅ Got token, connecting to room...');

        // Create video element
        video = document.createElement('video');
        video.autoplay = true;
        video.muted = true; // Mute for autoplay in VR headsets
        video.playsInline = true;
        video.setAttribute('playsinline', 'true');
        video.setAttribute('webkit-playsinline', 'true');

        // Position off-screen for traditional rendering
        video.style.position = 'absolute';
        video.style.left = '-9999px';
        video.style.opacity = '0';
        video.style.pointerEvents = 'none';

        document.body.appendChild(video);
        videoRef.current = video;
        console.log('📺 Video element created (muted, off-screen for VR)');

        // Connect to room
        const room = await Video.connect(token, {
          name: roomName,
          audio: true,
          video: { width: 640, height: 480 }
        });

        roomRef.current = room;

        if (!mounted) {
          room.disconnect();
          return;
        }

        console.log('🎥 Connected to Twilio room:', room.name);
        console.log('👥 Participants already in room:', room.participants.size);
        setIsConnected(true);
        onConnected?.();

        // Handle remote participants
        room.participants.forEach((participant) => {
          console.log('👤 Participant already in room:', participant.identity);
          attachParticipant(participant, video!);
        });

        room.on('participantConnected', (participant) => {
          console.log('✅ Participant connected:', participant.identity);
          attachParticipant(participant, video!);
        });

        room.on('participantDisconnected', (participant) => {
          console.log('👋 Participant disconnected:', participant.identity);
        });

      } catch (error) {
        console.error('❌ Twilio connection error:', error);
      }
    };

    const attachParticipant = (participant: any, videoElement: HTMLVideoElement) => {
      setParticipantName(participant.identity.split('-')[0] || 'Coach');

      console.log('🔗 Attaching participant:', participant.identity);
      participant.tracks.forEach((publication: any) => {
        if (publication.isSubscribed && publication.track) {
          console.log('✅ Attaching already-subscribed track:', publication.kind);
          attachTrack(publication.track, videoElement);
        }
      });

      participant.on('trackSubscribed', (track: any) => {
        console.log('🎬 Track subscribed event:', track.kind);
        attachTrack(track, videoElement);
      });
    };

    const attachTrack = (track: any, videoElement: HTMLVideoElement) => {
      console.log('🎯 attachTrack called:', track.kind);
      if (track.kind === 'video') {
        const element = track.attach();
        if (element instanceof HTMLVideoElement && videoElement) {
          console.log('✅ Setting srcObject for WebXR Layer');
          videoElement.srcObject = element.srcObject;

          const tryPlay = () => {
            console.log('🎬 Attempting to play video...');
            const playPromise = videoElement.play();

            if (playPromise !== undefined) {
              playPromise
                .then(() => {
                  console.log('🎥 Video playback started successfully');
                })
                .catch((err) => {
                  console.error('❌ Video play error:', err.name, err.message);
                  if (err.name === 'AbortError' || err.name === 'NotAllowedError') {
                    console.log('🔄 Retrying play in 500ms...');
                    setTimeout(tryPlay, 500);
                  }
                });
            }
          };

          videoElement.oncanplay = () => {
            console.log('✅ Video can play - attempting playback');
            tryPlay();
          };

          if (videoElement.readyState >= 3) {
            tryPlay();
          }
        }
      }
    };

    connectToTwilio();

    return () => {
      mounted = false;
      if (roomRef.current) {
        roomRef.current.disconnect();
      }
      if (video && video.parentNode) {
        video.parentNode.removeChild(video);
      }
      if (layerRef.current && session) {
        try {
          session.updateRenderState({ layers: [] });
        } catch (e) {
          console.warn('Could not clear XR layers:', e);
        }
      }
    };
  }, [roomName, userName, session]);

  // Create WebXR video layer when in VR mode
  useXREvent('sessionstart', () => {
    console.log('🥽 XR Session started - creating video layer');

    if (!videoRef.current || !session) {
      console.warn('⚠️ Video element or session not ready');
      return;
    }

    try {
      // Check if MediaBinding is supported
      if (!('XRMediaBinding' in window)) {
        console.error('❌ XRMediaBinding not supported in this browser');
        return;
      }

      // @ts-ignore - XRMediaBinding types not fully available
      const mediaBinding = new XRMediaBinding(session);

      // Create quad layer for video
      // @ts-ignore
      const layer = mediaBinding.createQuadLayer(videoRef.current, {
        space: session.requestReferenceSpace('local'),
        layout: 'mono',
      });

      // Position and size the layer
      const transform = {
        position: { x: position[0], y: position[1], z: position[2] },
        orientation: { x: 0, y: 0, z: 0, w: 1 }
      };
      layer.transform = new XRRigidTransform(transform.position, transform.orientation);
      layer.width = 2.0 * scale;  // 2 meters wide
      layer.height = 2.5 * scale; // 2.5 meters tall

      layerRef.current = layer;

      // Add layer to session
      session.updateRenderState({
        layers: [layer, ...(session.renderState.layers || [])]
      });

      console.log('✅ WebXR video layer created and added to session');
    } catch (error) {
      console.error('❌ Failed to create WebXR video layer:', error);
    }
  });

  // Clean up layer on session end
  useXREvent('sessionend', () => {
    console.log('🥽 XR Session ended - cleaning up video layer');
    layerRef.current = null;
  });

  // Update layer position when position/scale changes
  useEffect(() => {
    if (layerRef.current && session && isVRActive) {
      try {
        const transform = {
          position: { x: position[0], y: position[1], z: position[2] },
          orientation: { x: 0, y: 0, z: 0, w: 1 }
        };
        layerRef.current.transform = new XRRigidTransform(transform.position, transform.orientation);
        layerRef.current.width = 2.0 * scale;
        layerRef.current.height = 2.5 * scale;
        console.log('📐 Updated layer transform:', position, 'scale:', scale);
      } catch (error) {
        console.error('❌ Failed to update layer transform:', error);
      }
    }
  }, [position, scale, isVRActive, session]);

  // Fallback: Traditional 3D rendering when NOT in VR
  const baseSize = 2;
  const heightRatio = 2.5 / 2;

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
      setPosition([
        e.point.x - dragStart.current.x,
        e.point.y - dragStart.current.y,
        e.point.z - dragStart.current.z
      ]);
    }
  };

  const handleWheel = (e: any) => {
    e.stopPropagation();
    e.preventDefault();
    const delta = e.deltaY * -0.001;
    const newScale = Math.max(0.5, Math.min(3, scale + delta));
    setScale(newScale);
  };

  const handleZoomIn = (e: any) => {
    e.stopPropagation();
    const newScale = Math.min(3, scale + 0.2);
    setScale(newScale);
  };

  const handleZoomOut = (e: any) => {
    e.stopPropagation();
    const newScale = Math.max(0.5, scale - 0.2);
    setScale(newScale);
  };

  // Rotation handlers
  const handleRotateY = (direction: number) => (e: any) => {
    e.stopPropagation();
    setRotation3D(prev => [prev[0], prev[1] + (Math.PI / 6) * direction, prev[2]]);
    console.log('🔄 Coach Rotate Y:', direction > 0 ? 'clockwise' : 'counter-clockwise');
  };

  const handleRotateX = (direction: number) => (e: any) => {
    e.stopPropagation();
    setRotation3D(prev => [prev[0] + (Math.PI / 6) * direction, prev[1], prev[2]]);
    console.log('🔄 Coach Rotate X:', direction > 0 ? 'down' : 'up');
  };

  const handleResetRotation = (e: any) => {
    e.stopPropagation();
    setRotation3D([0, 0, 0]);
    console.log('🔄 Coach Reset rotation');
  };

  // When in VR mode with WebXR Layer, render minimal UI
  // When in desktop mode, render traditional video texture
  return (
    <group position={position} rotation={rotation3D} scale={[scale, scale, 1]}>
      {/* Video Screen - only visible when NOT using WebXR layer */}
      {!isVRActive && (
        <mesh
          castShadow
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
          onPointerMove={handlePointerMove}
          onWheel={handleWheel}
        >
          <planeGeometry args={[baseSize, baseSize * heightRatio]} />
          <meshStandardMaterial
            color={isDragging ? "#FFD700" : "#D4AF38"}
            emissive={isDragging ? "#FFD700" : "#D4AF38"}
            emissiveIntensity={isDragging ? 0.7 : 0.5}
          />
        </mesh>
      )}

      {/* Status Label */}
      <Text
        position={[0, (baseSize * heightRatio) / 2 + 0.2, 0.1]}
        fontSize={0.15}
        color={isConnected ? "#00FF00" : "#FFD700"}
        anchorX="center"
        outlineWidth={0.01}
        outlineColor="#000"
      >
        {isVRActive ? '🥽 VR Layer Active' : isConnected ? `🎯 ${participantName} LIVE` : '⏳ Connecting...'}
      </Text>

      {/* Instructions */}
      {!isDragging && !isVRActive && (
        <Text
          position={[0, -(baseSize * heightRatio) / 2 - 0.2, 0.1]}
          fontSize={0.08}
          color="#FFFFFF"
          anchorX="center"
          outlineWidth={0.005}
          outlineColor="#000"
        >
          Drag in 3D
        </Text>
      )}

      {/* Resize Controls - only in desktop mode */}
      {!isVRActive && (
        <>
          {/* Zoom In Button */}
          <group position={[baseSize / 2 - 0.15, (baseSize * heightRatio) / 2 + 0.3, 0.1]}>
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

          {/* Zoom Out Button */}
          <group position={[-baseSize / 2 + 0.15, (baseSize * heightRatio) / 2 + 0.3, 0.1]}>
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
            position={[0, (baseSize * heightRatio) / 2 + 0.3, 0.1]}
            fontSize={0.08}
            color="#FFD700"
            anchorX="center"
            outlineWidth={0.005}
            outlineColor="#000"
          >
            {(scale * 100).toFixed(0)}%
          </Text>
        </>
      )}

      {/* Holographic Frame */}
      <mesh position={[0, 0, -0.1]}>
        <planeGeometry args={[baseSize + 0.2, (baseSize * heightRatio) + 0.2]} />
        <meshStandardMaterial
          color={isDragging ? "#FFD700" : "#00ffff"}
          transparent
          opacity={isDragging ? 0.2 : 0.1}
          wireframe
        />
      </mesh>

      {/* Connection Status Indicator */}
      {isConnected && (
        <mesh position={[baseSize / 2 + 0.2, (baseSize * heightRatio) / 2 + 0.2, 0.1]}>
          <sphereGeometry args={[0.05, 16, 16]} />
          <meshStandardMaterial
            color="#00ff00"
            emissive="#00ff00"
            emissiveIntensity={1}
          />
        </mesh>
      )}

      {/* VR Mode Indicator */}
      {isVRActive && (
        <mesh position={[-baseSize / 2 - 0.2, (baseSize * heightRatio) / 2 + 0.2, 0.1]}>
          <sphereGeometry args={[0.05, 16, 16]} />
          <meshStandardMaterial
            color="#0000ff"
            emissive="#0000ff"
            emissiveIntensity={1}
          />
        </mesh>
      )}

      {/* Rotation Controls - Bottom Center */}
      {/* Rotate Left (Y-axis) */}
      <group position={[-baseSize / 2 + 0.3, -(baseSize * heightRatio) / 2 - 0.35, 0.1]}>
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
      <group position={[baseSize / 2 - 0.3, -(baseSize * heightRatio) / 2 - 0.35, 0.1]}>
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
      <group position={[-0.25, -(baseSize * heightRatio) / 2 - 0.35, 0.1]}>
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
      <group position={[0.25, -(baseSize * heightRatio) / 2 - 0.35, 0.1]}>
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
      <group position={[0, -(baseSize * heightRatio) / 2 - 0.35, 0.1]}>
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
      {!isDragging && !isVRActive && (
        <Text
          position={[0, -(baseSize * heightRatio) / 2 - 0.55, 0.1]}
          fontSize={0.06}
          color="#FFFFFF"
          anchorX="center"
          outlineWidth={0.005}
          outlineColor="#000"
        >
          360° Rotation • Drag in 3D
        </Text>
      )}
    </group>
  );
}
