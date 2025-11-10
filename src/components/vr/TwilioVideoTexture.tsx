'use client';

import { useEffect, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Text } from '@react-three/drei';
import * as THREE from 'three';

interface TwilioVideoTextureProps {
  position: [number, number, number];
  roomName: string;
  userName: string;
  onConnected?: () => void;
}

export function TwilioVideoTexture({ position: initialPosition, roomName, userName, onConnected }: TwilioVideoTextureProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const textureRef = useRef<THREE.VideoTexture | null>(null);
  const [videoTexture, setVideoTexture] = useState<THREE.VideoTexture | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [participantName, setParticipantName] = useState('Coach');
  const [position, setPosition] = useState<[number, number, number]>(initialPosition);
  const [rotation3D, setRotation3D] = useState<[number, number, number]>([0, 0, 0]);
  const [scale, setScale] = useState(1);
  const [isDragging, setIsDragging] = useState(false);
  const roomRef = useRef<any>(null);

  useEffect(() => {
    let mounted = true;
    let video: HTMLVideoElement | null = null;

    const connectToTwilio = async () => {
      try {
        console.log('🔄 [VR COACH] Connecting to Twilio room:', roomName, 'as:', userName);
        console.log('🔄 [VR COACH] Component mounted, starting connection...');

        // Dynamic import of Twilio Video
        const Video = await import('twilio-video');
        console.log('✅ [VR COACH] Twilio Video SDK loaded');

        // Get token from API
        console.log('🔑 [VR COACH] Requesting token for room:', roomName);
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
          console.error('❌ [VR COACH] Token API error:', response.status, errorData);
          throw new Error(`Failed to get token: ${response.status}`);
        }

        const { token } = await response.json();
        console.log('✅ [VR COACH] Got token, connecting to room...');

        // Create video element
        video = document.createElement('video');
        video.autoplay = true;
        video.muted = true; // Start muted for autoplay to work
        video.playsInline = true;
        video.setAttribute('playsinline', 'true'); // Extra for iOS/VR
        video.setAttribute('webkit-playsinline', 'true'); // Safari/WebKit
        video.width = 640;
        video.height = 480;

        // Position off-screen instead of display:none (fixes black texture in VR)
        video.style.position = 'absolute';
        video.style.left = '-9999px';
        video.style.opacity = '0';
        video.style.pointerEvents = 'none';

        document.body.appendChild(video);
        videoRef.current = video;
        console.log('📺 [AUDIO] Video element created (starting muted for autoplay)');

        // Unmute after a short delay to allow autoplay to succeed first
        setTimeout(() => {
          if (video) {
            video.muted = false;
            console.log('🔊 [AUDIO] Video unmuted - wrestler can now hear coach');
          }
        }, 1000);

        // Connect to room
        // Try to enable video if camera is available, otherwise just audio
        console.log('🎥 [AUDIO] Attempting to connect with audio + video (camera)...');
        const room = await Video.connect(token, {
          name: roomName,
          audio: true,
          video: { width: 640, height: 480 }
        }).catch(async (error) => {
          // If video fails (no camera), try audio-only
          console.warn('⚠️ [AUDIO] Camera not available, connecting audio-only:', error.message);
          return Video.connect(token, {
            name: roomName,
            audio: true,
            video: false
          });
        });

        roomRef.current = room;

        if (!mounted) {
          room.disconnect();
          return;
        }

        console.log('🎥 [VR COACH] Connected to Twilio room:', room.name);
        console.log('👥 [VR COACH] Participants already in room:', room.participants.size);
        console.log('👤 [VR COACH] Local participant identity:', room.localParticipant.identity);

        // Check what tracks the wrestler is publishing
        const audioTracks = Array.from(room.localParticipant.audioTracks.values());
        const videoTracks = Array.from(room.localParticipant.videoTracks.values());
        console.log('🎤 [AUDIO] Wrestler is publishing:', {
          audio: audioTracks.length > 0 ? '✅ Microphone active' : '❌ No microphone',
          video: videoTracks.length > 0 ? '✅ Camera active' : '❌ No camera'
        });

        if (videoTracks.length === 0) {
          console.log('💡 [AUDIO] TIP: Coach won\'t see wrestler video. Use a phone/tablet camera pointed at the wrestler.');
        }

        setIsConnected(true);
        onConnected?.();

        // Handle remote participants - ONLY attach coaches, ignore other viewers!
        let coachAttached = false;
        room.participants.forEach((participant) => {
          console.log('👤 Participant already in room:', participant.identity);

          // Only attach if this is a coach and we haven't attached one yet
          if (participant.identity.startsWith('Coach-') && !coachAttached) {
            console.log('🎯 Attaching COACH participant:', participant.identity);
            console.log('📹 Tracks:', Array.from(participant.tracks.values()).map((p: any) => ({
              kind: p.kind,
              isSubscribed: p.isSubscribed,
              trackName: p.trackName
            })));
            attachParticipant(participant, video!);
            coachAttached = true;
          } else {
            console.log('⏭️ Skipping participant (not coach or already attached):', participant.identity);
          }
        });

        room.on('participantConnected', (participant) => {
          console.log('✅ Participant connected:', participant.identity);

          // Only attach coaches, and only if we haven't attached one yet
          if (participant.identity.startsWith('Coach-') && !coachAttached) {
            console.log('🎯 Attaching COACH participant:', participant.identity);
            attachParticipant(participant, video!);
            coachAttached = true;
          } else {
            console.log('⏭️ Skipping participant (not coach or already attached):', participant.identity);
          }
        });

        room.on('participantDisconnected', (participant) => {
          console.log('👋 [VR COACH] Participant disconnected:', participant.identity);

          // If a coach disconnected, try to find another coach or reconnect
          if (participant.identity.startsWith('Coach-')) {
            console.log('⚠️ [VR COACH] Coach disconnected! Looking for other coaches...');
            coachAttached = false;

            // Check if there are other coaches in the room
            let foundNewCoach = false;
            room.participants.forEach((p) => {
              if (p.identity.startsWith('Coach-') && !foundNewCoach) {
                console.log('🔄 [VR COACH] Found replacement coach:', p.identity);
                attachParticipant(p, video!);
                foundNewCoach = true;
                coachAttached = true;
              }
            });

            if (!foundNewCoach) {
              console.log('⏳ [VR COACH] No other coaches found, waiting for reconnection...');
              setParticipantName('Coach (Reconnecting...)');
            }
          }
        });

        // Create video texture
        console.log('🎬 [VR COACH] Creating video texture...');
        console.log('🎬 [VR COACH] Video element exists:', !!video);
        console.log('🎬 [VR COACH] Component mounted:', mounted);

        if (video && mounted) {
          const texture = new THREE.VideoTexture(video);
          texture.minFilter = THREE.LinearFilter;
          texture.magFilter = THREE.LinearFilter;
          texture.format = THREE.RGBAFormat;
          texture.colorSpace = THREE.SRGBColorSpace; // Fix color space for VR
          texture.generateMipmaps = false; // Performance optimization
          texture.needsUpdate = true;
          textureRef.current = texture;
          setVideoTexture(texture);
          console.log('✅ [VR COACH] Video texture created with sRGB color space');
          console.log('✅ [VR COACH] Texture dimensions:', video.videoWidth, 'x', video.videoHeight);
        } else {
          console.error('❌ [VR COACH] Cannot create texture - video:', !!video, 'mounted:', mounted);
        }

      } catch (error) {
        console.error('❌ [VR COACH] Twilio connection error:', error);
      }
    };

    const attachParticipant = (participant: any, videoElement: HTMLVideoElement) => {
      setParticipantName(participant.identity.split('-')[0] || 'Coach');

      console.log('🔗 Attaching participant:', participant.identity);
      participant.tracks.forEach((publication: any) => {
        console.log('📦 Track publication:', {
          kind: publication.kind,
          isSubscribed: publication.isSubscribed,
          trackName: publication.trackName,
          hasTrack: !!publication.track
        });

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
      console.log('🎯 [VR COACH] attachTrack called:', track.kind);

      if (track.kind === 'audio') {
        // Attach audio track to a separate audio element
        const audioElement = track.attach();
        audioElement.autoplay = true;
        document.body.appendChild(audioElement);
        console.log('🔊 [AUDIO] Coach audio track attached and playing');
        return;
      }

      if (track.kind === 'video') {
        const element = track.attach();
        console.log('📹 [VR COACH] Video track attached, element type:', element.constructor.name);
        // Use the video element's stream
        if (element instanceof HTMLVideoElement && videoElement) {
          console.log('✅ [VR COACH] Setting srcObject...');
          try {
            console.log('✅ [VR COACH] Source has video tracks:', element.srcObject && (element.srcObject as MediaStream).getVideoTracks().length);
          } catch (e) {
            console.log('✅ [VR COACH] Source object exists:', !!element.srcObject);
          }

          // Set the source
          videoElement.srcObject = element.srcObject;

          // Add metadata listener BEFORE playing
          videoElement.addEventListener('loadedmetadata', () => {
            console.log('📊 Video metadata loaded, size:', videoElement.videoWidth, 'x', videoElement.videoHeight);

            // Recreate texture if video now has dimensions but texture was created at 0x0
            if (videoElement.videoWidth > 0 && videoElement.videoHeight > 0) {
              console.log('🔄 Recreating texture with actual video dimensions...');

              // Dispose old texture
              if (textureRef.current) {
                textureRef.current.dispose();
              }

              // Create new texture with proper dimensions
              const newTexture = new THREE.VideoTexture(videoElement);
              newTexture.minFilter = THREE.LinearFilter;
              newTexture.magFilter = THREE.LinearFilter;
              newTexture.format = THREE.RGBAFormat;
              newTexture.colorSpace = THREE.SRGBColorSpace;
              newTexture.generateMipmaps = false;
              newTexture.needsUpdate = true;

              textureRef.current = newTexture;
              setVideoTexture(newTexture);

              console.log('✅ Texture recreated with dimensions:', videoElement.videoWidth, 'x', videoElement.videoHeight);
            }
          }, { once: true });

          // DEBUG: Add comprehensive video state monitoring
          const debugInterval = setInterval(() => {
            console.log('🔍 VIDEO STATE:', {
              readyState: videoElement.readyState,
              paused: videoElement.paused,
              currentTime: videoElement.currentTime.toFixed(2),
              videoWidth: videoElement.videoWidth,
              videoHeight: videoElement.videoHeight,
              srcObject: !!videoElement.srcObject,
              tracks: videoElement.srcObject instanceof MediaStream ?
                videoElement.srcObject.getVideoTracks().length : 0,
              textureExists: !!textureRef.current,
              textureImage: textureRef.current?.image === videoElement
            });
          }, 2000);

          // Clean up debug interval when component unmounts
          setTimeout(() => clearInterval(debugInterval), 30000); // Stop after 30s

          // Play IMMEDIATELY after setting srcObject (critical for MediaStream!)
          console.log('🎬 Attempting to play video...');
          videoElement.play()
            .then(() => {
              console.log('🎥 Video playback started successfully');
              if (textureRef.current) {
                textureRef.current.needsUpdate = true;
              }
            })
            .catch((err) => {
              console.error('❌ Video play error:', err.name, err.message);
            });

          // Add playing event listener for continuous updates
          videoElement.addEventListener('playing', () => {
            console.log('▶️ Video is now playing');
            if (textureRef.current) {
              textureRef.current.needsUpdate = true;
            }
          }, { once: true });
        }
      }
    };

    connectToTwilio();

    return () => {
      console.log('🧹 [VR COACH] Cleanup called - NOT disconnecting room to keep video alive');
      mounted = false;

      // DON'T disconnect the room - this was causing the coach to disconnect!
      // The room will stay connected as long as the page is open
      // This fixes the issue where React strict mode was disconnecting/reconnecting

      // Only remove video element if it exists and is still in DOM
      if (video) {
        try {
          // Don't remove if video is still playing - keep it alive!
          if (!video.paused && video.currentTime > 0) {
            console.log('✅ [VR COACH] Video still playing, keeping it alive');
            return;
          }

          if (video.parentNode && document.body.contains(video)) {
            video.parentNode.removeChild(video);
          }
        } catch (error) {
          console.warn('[VR COACH] Video cleanup warning:', error);
        }
      }
    };
  }, [roomName, userName]);

  // Update texture only
  const frameCountRef = useRef(0);
  useFrame((state) => {
    // Continuously update video texture - use videoTexture from state, not ref!
    if (videoTexture && videoRef.current && videoRef.current.readyState >= videoRef.current.HAVE_CURRENT_DATA) {
      videoTexture.needsUpdate = true;

      // ALSO update the material's map if mesh exists
      if (meshRef.current) {
        const material = (meshRef.current as any).material;
        if (material && material.map) {
          material.map.needsUpdate = true;
          // Force material update if texture changed
          if (material.map !== videoTexture) {
            console.log('⚠️ Material has DIFFERENT texture than state!');
            material.map = videoTexture;
            material.needsUpdate = true;
          }
        }
      }

      // Debug every 60 frames (roughly once per second at 60fps)
      frameCountRef.current++;
      if (frameCountRef.current % 60 === 0) {
        const material = meshRef.current ? (meshRef.current as any).material : null;
        console.log('🔄 USEFRAME UPDATE:', {
          frame: frameCountRef.current,
          readyState: videoRef.current.readyState,
          currentTime: videoRef.current.currentTime.toFixed(2),
          textureNeedsUpdate: videoTexture.needsUpdate,
          videoPlaying: !videoRef.current.paused,
          materialHasMap: !!material?.map,
          materialMapSameAsState: material?.map === videoTexture,
          materialMapImage: material?.map?.image?.tagName,
          materialMapImageDimensions: material?.map?.image ?
            `${material.map.image.videoWidth}x${material.map.image.videoHeight}` : 'N/A'
        });
      }
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
    console.log('📏 Coach video resizing:', newScale.toFixed(2) + 'x');
  };

  // Resize button handlers
  const handleZoomIn = (e: any) => {
    e.stopPropagation();
    const newScale = Math.min(3, scale + 0.2);
    setScale(newScale);
    console.log('➕ Coach zoom in:', newScale.toFixed(2) + 'x');
  };

  const handleZoomOut = (e: any) => {
    e.stopPropagation();
    const newScale = Math.max(0.5, scale - 0.2);
    setScale(newScale);
    console.log('➖ Coach zoom out:', newScale.toFixed(2) + 'x');
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

  const baseSize = 2;
  const heightRatio = 2.5 / 2;

  return (
    <group position={position} rotation={rotation3D} scale={[scale, scale, 1]}>
      {/* Video Screen */}
      <mesh
        ref={meshRef}
        castShadow
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerMove={handlePointerMove}
        onWheel={handleWheel}
      >
        <planeGeometry args={[baseSize, baseSize * heightRatio]} />
        {videoTexture ? (
          <meshBasicMaterial
            map={videoTexture}
            side={THREE.DoubleSide}
            toneMapped={false}
          />
        ) : (
          <meshStandardMaterial
            color={isDragging ? "#FFD700" : "#1a1a1a"}
            emissive={isDragging ? "#FFD700" : "#D4AF38"}
            emissiveIntensity={isDragging ? 0.7 : 0.5}
          />
        )}
      </mesh>

      {/* Status Label */}
      <Text
        position={[0, (baseSize * heightRatio) / 2 + 0.2, 0.1]}
        fontSize={0.15}
        color={isConnected ? "#00FF00" : "#FFD700"}
        anchorX="center"
        outlineWidth={0.01}
        outlineColor="#000"
      >
        {isConnected ? `🎯 ${participantName} LIVE` : '⏳ Connecting...'}
      </Text>

      {/* Instructions */}
      {!isDragging && (
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

      {/* Resize Controls - Top Corners */}
      {/* Zoom In Button - Top Right */}
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

      {/* Zoom Out Button - Top Left */}
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

      {/* Drag Indicator */}
      {isDragging && (
        <mesh position={[-baseSize / 2 - 0.2, (baseSize * heightRatio) / 2 + 0.2, 0.1]}>
          <sphereGeometry args={[0.05, 16, 16]} />
          <meshStandardMaterial
            color="#FFD700"
            emissive="#FFD700"
            emissiveIntensity={1}
          />
        </mesh>
      )}

      {/* Rotation Controls - Bottom Center */}
      {/* Rotate Left (Y-axis) */}
      <group position={[-baseSize / 2 + 0.3, -(baseSize * heightRatio) / 2 - 0.35, 0.1]}>
        <mesh onClick={handleRotateY(-1)}>
          <circleGeometry args={[0.1, 32]} />
          <meshStandardMaterial color="#00BFFF" emissive="#00BFFF" emissiveIntensity={0.5} transparent opacity={0.3} />
        </mesh>
        <Text position={[0, 0, 0.01]} fontSize={0.12} color="#FFFFFF" anchorX="center" anchorY="middle" outlineWidth={0.01} outlineColor="#000">↶</Text>
      </group>

      {/* Rotate Right (Y-axis) */}
      <group position={[baseSize / 2 - 0.3, -(baseSize * heightRatio) / 2 - 0.35, 0.1]}>
        <mesh onClick={handleRotateY(1)}>
          <circleGeometry args={[0.1, 32]} />
          <meshStandardMaterial color="#00BFFF" emissive="#00BFFF" emissiveIntensity={0.5} transparent opacity={0.3} />
        </mesh>
        <Text position={[0, 0, 0.01]} fontSize={0.12} color="#FFFFFF" anchorX="center" anchorY="middle" outlineWidth={0.01} outlineColor="#000">↷</Text>
      </group>

      {/* Rotate Up (X-axis) */}
      <group position={[-0.25, -(baseSize * heightRatio) / 2 - 0.35, 0.1]}>
        <mesh onClick={handleRotateX(-1)}>
          <circleGeometry args={[0.1, 32]} />
          <meshStandardMaterial color="#9370DB" emissive="#9370DB" emissiveIntensity={0.5} transparent opacity={0.3} />
        </mesh>
        <Text position={[0, 0, 0.01]} fontSize={0.12} color="#FFFFFF" anchorX="center" anchorY="middle" outlineWidth={0.01} outlineColor="#000">⤴</Text>
      </group>

      {/* Rotate Down (X-axis) */}
      <group position={[0.25, -(baseSize * heightRatio) / 2 - 0.35, 0.1]}>
        <mesh onClick={handleRotateX(1)}>
          <circleGeometry args={[0.1, 32]} />
          <meshStandardMaterial color="#9370DB" emissive="#9370DB" emissiveIntensity={0.5} transparent opacity={0.3} />
        </mesh>
        <Text position={[0, 0, 0.01]} fontSize={0.12} color="#FFFFFF" anchorX="center" anchorY="middle" outlineWidth={0.01} outlineColor="#000">⤵</Text>
      </group>

      {/* Reset Rotation Button */}
      <group position={[0, -(baseSize * heightRatio) / 2 - 0.35, 0.1]}>
        <mesh onClick={handleResetRotation}>
          <circleGeometry args={[0.08, 32]} />
          <meshStandardMaterial color="#FFD700" emissive="#FFD700" emissiveIntensity={0.5} transparent opacity={0.3} />
        </mesh>
        <Text position={[0, 0, 0.01]} fontSize={0.08} color="#FFFFFF" anchorX="center" anchorY="middle" outlineWidth={0.01} outlineColor="#000">⟲</Text>
      </group>

      {/* Rotation Instructions */}
      {!isDragging && (
        <Text position={[0, -(baseSize * heightRatio) / 2 - 0.55, 0.1]} fontSize={0.06} color="#FFFFFF" anchorX="center" outlineWidth={0.005} outlineColor="#000">
          360° Rotation • Drag in 3D
        </Text>
      )}
    </group>
  );
}
