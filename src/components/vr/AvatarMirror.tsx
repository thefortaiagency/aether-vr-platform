'use client';

import React, { useRef, useEffect, useState } from 'react';
import { useFrame } from '@react-three/fiber';
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
  const meshRef = useRef<THREE.Mesh>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const detectorRef = useRef<poseDetection.PoseDetector | null>(null);
  const frameCountRef = useRef(0);
  const poseIntervalRef = useRef(4); // Run pose detection every 4 frames (22.5 FPS) - reduced for Quest 2 GPU
  const lastPoseRef = useRef<poseDetection.Keypoint[] | null>(null);

  // Store as arrays (tuples) for React Three Fiber - NOT Vector3 objects
  const mirrorPosition = position;
  const mirrorScale: [number, number, number] = [2.5, 3, 1]; // MUCH LARGER for VR visibility (2.5m wide x 3m tall)

  // CRITICAL: Store texture in STATE, not ref, so R3F can properly track it and reinitialize material
  const [canvasTexture, setCanvasTexture] = useState<THREE.CanvasTexture | null>(null);

  // Initialize webcam and pose detector (client-side only)
  useEffect(() => {
    let mounted = true;
    let stream: MediaStream | null = null;

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

        // Create video element
        const video = document.createElement('video');
        video.srcObject = stream;
        video.autoplay = true;
        video.playsInline = true;
        videoRef.current = video;

        // Create canvas for rendering - match lower resolution
        const canvas = document.createElement('canvas');
        canvas.width = 320;
        canvas.height = 240;
        canvasRef.current = canvas;

        // Draw initial frame to canvas before creating texture
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.fillStyle = '#000000';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        }

        // Start video playback
        await video.play();
        console.log('[AvatarMirror] ✅ Webcam started and playing');

        // Create CanvasTexture AFTER video is playing
        const texture = new THREE.CanvasTexture(canvas);
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.needsUpdate = true; // CRITICAL: Force initial texture upload

        console.log('[AvatarMirror] CanvasTexture created');

        // CRITICAL: Set texture in STATE so R3F can properly initialize material uniforms
        setCanvasTexture(texture);
        console.log('[AvatarMirror] ✅ Texture set in state, material will reinitialize');

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
      if (detectorRef.current) {
        detectorRef.current.dispose();
      }
      // Dispose texture and canvas to prevent memory leaks
      if (canvasTexture) {
        canvasTexture.dispose();
        setCanvasTexture(null);
      }
      if (canvasRef.current) {
        canvasRef.current.width = 1;
        canvasRef.current.height = 1;
        canvasRef.current = null;
      }
    };
  }, [cameraDeviceId, canvasTexture]); // Re-initialize when camera changes

  // Render loop - throttled pose detection for VR performance
  useFrame(async () => {
    try {
      if (!canvasRef.current || !videoRef.current || !canvasTexture || !detectorRef.current) {
        return;
      }

      const canvas = canvasRef.current;
      const video = videoRef.current;
      const ctx = canvas.getContext('2d');

      // CRITICAL: Ensure video is actually playing and texture is ready
      if (!ctx || video.readyState < 2) return;

      // CRITICAL: Verify texture is properly initialized
      if (!canvasTexture.image || canvasTexture.image !== canvas) {
        console.warn('[AvatarMirror] Texture not properly initialized, skipping frame');
        return;
      }

      // Draw video frame EVERY frame (90+ FPS in VR)
      // Mirror for WebXR (CSS transforms don't work in WebGL textures)
      ctx.save();
      ctx.scale(-1, 1);
      ctx.translate(-canvas.width, 0); // CRITICAL: translate after scale for WebXR
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      ctx.restore();

      // Pose detection EVERY 4th frame (22.5 FPS) - reduced for Quest 2 GPU memory
      frameCountRef.current++;
      if (frameCountRef.current % poseIntervalRef.current === 0) {
        try {
          // Detect pose
          const poses = await detectorRef.current.estimatePoses(video);

          // Defensive checks for pose detection results
          if (poses && Array.isArray(poses) && poses.length > 0) {
            const pose = poses[0];
            // Only cache if keypoints exist and are valid
            if (pose && pose.keypoints && Array.isArray(pose.keypoints) && pose.keypoints.length > 0) {
              lastPoseRef.current = pose.keypoints;
            }
          }
        } catch (error) {
          // Silently continue if detection fails
          console.warn('[AvatarMirror] Pose detection error:', error);
        }
      }

      // Draw skeleton using latest detected pose (even on non-detection frames)
      if (lastPoseRef.current && Array.isArray(lastPoseRef.current) && lastPoseRef.current.length > 0) {
        drawSkeleton(ctx, lastPoseRef.current, canvas.width, canvas.height);
      }

      // Update texture - CRITICAL: Only if texture is properly initialized
      if (canvasTexture && canvasTexture.image === canvas) {
        canvasTexture.needsUpdate = true;
      }
    } catch (error) {
      // Catch any errors in the render loop to prevent crashes
      console.warn('[AvatarMirror] Render loop error:', error);
    }
  });

  // Don't render anything until texture is ready
  if (!canvasTexture) {
    return null;
  }

  return (
    <group position={mirrorPosition} rotation={rotation}>
      {/* Main mirror surface */}
      <mesh ref={meshRef} scale={mirrorScale}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial
          map={canvasTexture}
          side={THREE.DoubleSide}
          toneMapped={false}
        />
      </mesh>

      {/* BRIGHT NEON FRAME - Unmissable in VR */}
      <lineSegments scale={mirrorScale}>
        <edgesGeometry attach="geometry" args={[new THREE.PlaneGeometry(1, 1)]} />
        <lineBasicMaterial
          attach="material"
          color="#00FF00" // BRIGHT NEON GREEN
          linewidth={5}
        />
      </lineSegments>

      {/* LARGE Corner spheres for visibility */}
      {[
        [-0.5, 0.5, 0.01],
        [0.5, 0.5, 0.01],
        [-0.5, -0.5, 0.01],
        [0.5, -0.5, 0.01],
      ].map((pos, i) => (
        <mesh
          key={i}
          position={[pos[0] * mirrorScale[0], pos[1] * mirrorScale[1], pos[2]]}
        >
          <sphereGeometry args={[0.15]} /> {/* 3x larger spheres */}
          <meshBasicMaterial color="#FF00FF" emissive="#FF00FF" emissiveIntensity={2} /> {/* BRIGHT MAGENTA */}
        </mesh>
      ))}

      {/* BRIGHT Label */}
      <mesh position={[0, mirrorScale[1] * 0.6, 0.02]}>
        <planeGeometry args={[mirrorScale[0] * 0.8, 0.3]} />
        <meshBasicMaterial color="#00FF00" emissive="#00FF00" emissiveIntensity={1} />
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
