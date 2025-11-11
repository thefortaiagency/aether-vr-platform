'use client';

import React, { useRef, useEffect, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { useXR } from '@react-three/xr';
import * as THREE from 'three';
import * as poseDetection from '@tensorflow-models/pose-detection';
import * as tf from '@tensorflow/tfjs-core';
import '@tensorflow/tfjs-backend-webgl';
// Optional: WebGPU backend for better performance
import '@tensorflow/tfjs-backend-webgpu';

interface AvatarMirrorProps {
  position?: [number, number, number];
  rotation?: [number, number, number];
  cameraDeviceId?: string; // Allow external camera selection
}

export function AvatarMirror({
  position = [0, 1.5, -2],
  rotation = [0, 0, 0],
  cameraDeviceId
}: AvatarMirrorProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const materialRef = useRef<THREE.MeshBasicMaterial | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const canvasContextRef = useRef<CanvasRenderingContext2D | null>(null);
  const detectorRef = useRef<poseDetection.PoseDetector | null>(null);
  const videoTrackRef = useRef<MediaStreamTrack | null>(null);

  // XR session tracking for video playback management
  const { session } = useXR();

  // Store as arrays (tuples) for React Three Fiber - NOT Vector3 objects
  const mirrorPosition = position;
  const mirrorScale: [number, number, number] = [2.5, 3, 1]; // MUCH LARGER for VR visibility (2.5m wide x 3m tall)

  // Store TEXTURE in ref - let R3F handle material cloning for XR stereo
  const [mirrorTexture, setMirrorTexture] = useState<THREE.CanvasTexture | null>(null);

  // Initialize webcam and pose detector (client-side only)
  useEffect(() => {
    let mounted = true;
    let stream: MediaStream | null = null;
    let cleanupTrackListeners: (() => void) | null = null;

    const initializeMirror = async () => {
      try {
        console.log('[AvatarMirror] Initializing webcam...');

        // Get webcam access - LOWER resolution for VR (Quest 2 GPU memory limit)
        // 320x240 = 1/4 the memory of 640x480 (saves ~900KB GPU memory)
        const videoConstraints: MediaTrackConstraints = {
          width: 320,
          height: 240,
        };

        // Use specific camera if deviceId provided, otherwise default to user-facing
        if (cameraDeviceId) {
          videoConstraints.deviceId = { exact: cameraDeviceId };
        } else {
          videoConstraints.facingMode = 'user';
        }

        stream = await navigator.mediaDevices.getUserMedia({
          video: videoConstraints,
          audio: false
        });

        if (!mounted) {
          stream.getTracks().forEach(track => track.stop());
          return;
        }

        const [videoTrack] = stream.getVideoTracks();
        videoTrackRef.current = videoTrack ?? null;

        if (videoTrack) {
          const handleTrackEnded = () => {
            console.warn('[AvatarMirror] ⚠️ Video track ended inside XR', {
              readyState: videoTrack.readyState,
              muted: videoTrack.muted,
            });
          };
          const handleTrackMute = () => {
            console.warn('[AvatarMirror] ⚠️ Video track muted', {
              readyState: videoTrack.readyState,
            });
          };
          const handleTrackUnmute = () => {
            console.log('[AvatarMirror] ✅ Video track unmuted', {
              readyState: videoTrack.readyState,
            });
          };

          videoTrack.addEventListener('ended', handleTrackEnded);
          videoTrack.addEventListener('mute', handleTrackMute);
          videoTrack.addEventListener('unmute', handleTrackUnmute);

          cleanupTrackListeners = () => {
            videoTrack.removeEventListener('ended', handleTrackEnded);
            videoTrack.removeEventListener('mute', handleTrackMute);
            videoTrack.removeEventListener('unmute', handleTrackUnmute);
          };

          console.log('[AvatarMirror] ✅ Video track ready', {
            id: videoTrack.id,
            label: videoTrack.label,
            readyState: videoTrack.readyState,
          });
        } else {
          console.warn('[AvatarMirror] ⚠️ No video track found on webcam stream');
        }

        // Create video element and add to DOM (required for VR)
        const video = document.createElement('video');
        video.srcObject = stream;
        video.autoplay = true;
        video.playsInline = true;

        // Position off-screen (NOT display:none - that breaks textures)
        video.style.position = 'absolute';
        video.style.left = '-9999px';
        video.style.opacity = '0';
        video.style.pointerEvents = 'none';

        // Add to DOM (required for texture to work in some VR browsers)
        document.body.appendChild(video);
        videoRef.current = video;

        // Start video playback FIRST
        await video.play();
        console.log('[AvatarMirror] ✅ Webcam started and playing');

        // Wait for video to have at least one frame ready
        await new Promise<void>((resolve) => {
          const checkVideoReady = () => {
            if (video.readyState >= 2) { // HAVE_CURRENT_DATA
              resolve();
            } else {
              requestAnimationFrame(checkVideoReady);
            }
          };
          checkVideoReady();
        });
        console.log('[AvatarMirror] ✅ Video has frame data ready');

        // Create draw canvas that mirrors the video stream for XR compatibility
        const canvas = document.createElement('canvas');
        const width = video.videoWidth || videoConstraints.width || 320;
        const height = video.videoHeight || videoConstraints.height || 240;
        canvas.width = width;
        canvas.height = height;

        const context = canvas.getContext('2d');
        if (!context) {
          throw new Error('Failed to acquire 2D context for mirror canvas');
        }

        context.fillStyle = '#000000';
        context.fillRect(0, 0, width, height);

        canvasRef.current = canvas;
        canvasContextRef.current = context;

        // Use CanvasTexture instead of VideoTexture to avoid XR clone issues
        const texture = new THREE.CanvasTexture(canvas);
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.generateMipmaps = false;

        console.log('[AvatarMirror] CanvasTexture created from mirror canvas');

        // Store texture in state - R3F will create material declaratively
        setMirrorTexture(texture);
        console.log('[AvatarMirror] ✅ CanvasTexture ready for mirror');

        // Initialize TensorFlow backend with WebGPU fallback
        console.log('[AvatarMirror] Initializing TensorFlow backend...');
        await tf.ready();

        // Try WebGPU first (2-3x faster), fallback to WebGL
        try {
          await tf.setBackend('webgpu');
          console.log('[AvatarMirror] ✅ Using WebGPU backend (2-3x faster)');
        } catch (error) {
          console.warn('[AvatarMirror] WebGPU unavailable, falling back to WebGL');
          await tf.setBackend('webgl');
        }
        console.log('[AvatarMirror] ✅ TensorFlow backend ready:', tf.getBackend());

        // Detect platform for optimal runtime selection
        const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
        const runtime = isMobile ? 'tfjs' : 'mediapipe';

        console.log(`[AvatarMirror] Platform: ${isMobile ? 'Mobile' : 'Desktop'}, using ${runtime} runtime`);

        // Initialize BlazePose detector with optimal settings
        console.log(`[AvatarMirror] Loading BlazePose (${runtime} runtime)...`);
        const detectorConfig: poseDetection.BlazePoseTfjsModelConfig | poseDetection.BlazePoseMediaPipeModelConfig =
          runtime === 'mediapipe'
            ? {
                runtime: 'mediapipe',
                modelType: 'lite',
                enableSmoothing: true,
                solutionPath: 'https://cdn.jsdelivr.net/npm/@mediapipe/pose'
              }
            : {
                runtime: 'tfjs',
                modelType: 'lite',
                enableSmoothing: true,
              };

        const detector = await poseDetection.createDetector(
          poseDetection.SupportedModels.BlazePose,
          detectorConfig
        );

        if (!mounted) return;

        detectorRef.current = detector;
        console.log('[AvatarMirror] ✅ BlazePose loaded');

      } catch (error) {
        console.error('[AvatarMirror] ❌ Initialization error:', error);
      }
    };

    initializeMirror();

    return () => {
      mounted = false;
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
      if (cleanupTrackListeners) {
        cleanupTrackListeners();
      }
      if (videoRef.current && videoRef.current.parentNode) {
        videoRef.current.parentNode.removeChild(videoRef.current);
      }
      canvasRef.current = null;
      canvasContextRef.current = null;
      if (detectorRef.current) {
        detectorRef.current.dispose();
      }
      videoTrackRef.current = null;
    };
  }, [cameraDeviceId]); // Re-initialize when camera changes

  // Cleanup texture on unmount
  useEffect(() => {
    return () => {
      if (mirrorTexture) {
        console.log('[AvatarMirror] Disposing texture on unmount');
        mirrorTexture.dispose();
      }
    };
  }, [mirrorTexture]);

  // Force video playback when entering XR mode (harden video resume)
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (session) {
      console.log('[AvatarMirror] XR session started - forcing video playback');
      console.log('[AvatarMirror] Video state before play:', {
        paused: video.paused,
        readyState: video.readyState,
        currentTime: video.currentTime,
        muted: video.muted
      });

      // Ensure video is muted and playsinline (Quest requirement)
      video.muted = true;
      video.setAttribute('playsinline', 'true');
      video.setAttribute('webkit-playsinline', 'true');

      video.play()
        .then(() => {
          console.log('[AvatarMirror] ✅ Video playing in VR session');
        })
        .catch((err) => {
          console.error('[AvatarMirror] ❌ Failed to resume video in VR:', err);
        });
    } else {
      console.log('[AvatarMirror] XR session ended');
    }
  }, [session]);

  // CRITICAL: VideoTexture requires manual needsUpdate every frame in VR
  // Research: https://discourse.threejs.org/t/video-texture-no-longer-updating-after-entering-webxr-mode/43068
  const textureRef = useRef<THREE.CanvasTexture | null>(null);

  useEffect(() => {
    if (mirrorTexture) {
      textureRef.current = mirrorTexture;
    }
  }, [mirrorTexture]);

  useFrame(() => {
    const texture = textureRef.current;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvasContextRef.current;
    const videoTrack = videoTrackRef.current;

    if (texture && video && video.readyState >= video.HAVE_CURRENT_DATA) {
      if (canvas && context) {
        const targetWidth = video.videoWidth || canvas.width;
        const targetHeight = video.videoHeight || canvas.height;

        if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
          canvas.width = targetWidth;
          canvas.height = targetHeight;
          console.log('[AvatarMirror] Resized mirror canvas to match video', {
            width: targetWidth,
            height: targetHeight
          });
          const refreshedContext = canvas.getContext('2d');
          if (refreshedContext) {
            canvasContextRef.current = refreshedContext;
          }
        }

        // Draw current video frame into the mirror canvas
        const drawContext = canvasContextRef.current;
        if (drawContext) {
          drawContext.drawImage(video, 0, 0, canvas.width, canvas.height);
        }
      }

      texture.needsUpdate = true; // CRITICAL for VR mode

      if (materialRef.current && materialRef.current.map !== texture) {
        console.warn('[AvatarMirror] ⚠️ Material map mismatch detected in XR – auto-repairing');
        materialRef.current.map = texture;
        materialRef.current.needsUpdate = true;
      }

      if (videoTrack && videoTrack.readyState !== 'live' && Math.random() < 0.032) {
        console.warn('[AvatarMirror] ⚠️ Video track not live during frame', {
          readyState: videoTrack.readyState,
          muted: videoTrack.muted,
        });
      }

      if (session && materialRef.current && Math.random() < 0.016) {
        console.log('[AvatarMirror] VR Frame State:', {
          textureUUID: texture.uuid,
          textureImage: texture.image ? 'exists' : 'missing',
          materialUUID: materialRef.current.uuid,
          materialMap: materialRef.current.map ? materialRef.current.map.uuid : 'missing',
          materialMapMatchesTexture: materialRef.current.map === texture,
          videoPlaying: !video.paused,
          videoReadyState: video.readyState
        });
      }
    }
  });

  // Don't render anything until texture is ready
  if (!mirrorTexture) {
    return null;
  }

  return (
    <group position={mirrorPosition} rotation={rotation}>
      {/* DEBUG: Bright markers to show mirror position */}
      <mesh position={[0, 0, 0.01]}>
        <sphereGeometry args={[0.2]} />
        <meshBasicMaterial color={0xff0000} />
      </mesh>
      <mesh position={[1, 0, 0.01]}>
        <sphereGeometry args={[0.2]} />
        <meshBasicMaterial color={0x00ff00} />
      </mesh>
      <mesh position={[-1, 0, 0.01]}>
        <sphereGeometry args={[0.2]} />
        <meshBasicMaterial color={0x0000ff} />
      </mesh>

      {/* Video mirror plane - R3F handles material cloning for XR stereo */}
      <mesh scale={mirrorScale}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial
          ref={materialRef}
          map={mirrorTexture}
          toneMapped={false}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  );
}

// BlazePose skeleton connections (fallback definition)
const BLAZEPOSE_CONNECTIONS = [
  [0, 1], [0, 4], [1, 2], [2, 3], [3, 7], [0, 5], [4, 5], [5, 6], [6, 8],
  [9, 10], [11, 12], [11, 13], [13, 15], [15, 17], [15, 19], [15, 21],
  [17, 19], [12, 14], [14, 16], [16, 18], [16, 20], [16, 22], [18, 20],
  [11, 23], [12, 24], [23, 24], [23, 25], [24, 26], [25, 27], [26, 28],
  [27, 29], [28, 30], [29, 31], [30, 32], [27, 31], [28, 32]
];

// Draw BlazePose skeleton
function drawSkeleton(
  ctx: CanvasRenderingContext2D,
  keypoints: poseDetection.Keypoint[],
  width: number,
  height: number
) {
  // Extra defensive checks
  if (!keypoints || !Array.isArray(keypoints) || keypoints.length === 0) return;

  try {
    const minConfidence = 0.3;

    // Mirror X coordinates
    const mirroredKeypoints = keypoints.map(kp => ({
      ...kp,
      x: width - kp.x
    }));

    if (!mirroredKeypoints || mirroredKeypoints.length === 0) return;

    // Draw connections - use hardcoded connections (browser build doesn't include util.getAdjacentPairs)
    const connections = BLAZEPOSE_CONNECTIONS;

  ctx.strokeStyle = '#00FF00';
  ctx.lineWidth = 3;

  connections.forEach(([i, j]) => {
    const kp1 = mirroredKeypoints[i];
    const kp2 = mirroredKeypoints[j];

    if (
      kp1 && kp2 &&
      kp1.score !== undefined && kp1.score > minConfidence &&
      kp2.score !== undefined && kp2.score > minConfidence
    ) {
      ctx.beginPath();
      ctx.moveTo(kp1.x, kp1.y);
      ctx.lineTo(kp2.x, kp2.y);
      ctx.stroke();
    }
  });

    // Draw keypoints
    ctx.fillStyle = '#FF0000';
    mirroredKeypoints.forEach(kp => {
      if (kp && kp.score !== undefined && kp.score > minConfidence) {
        ctx.beginPath();
        ctx.arc(kp.x, kp.y, 5, 0, 2 * Math.PI);
        ctx.fill();
      }
    });
  } catch (error) {
    // Silently handle drawing errors to prevent crashes
    console.warn('[AvatarMirror] Skeleton drawing error:', error);
  }
}
