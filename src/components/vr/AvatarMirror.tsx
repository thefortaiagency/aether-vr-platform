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
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const detectorRef = useRef<poseDetection.PoseDetector | null>(null);

  // Store as arrays (tuples) for React Three Fiber - NOT Vector3 objects
  const mirrorPosition = position;
  const mirrorScale: [number, number, number] = [2.5, 3, 1]; // MUCH LARGER for VR visibility (2.5m wide x 3m tall)

  // Store material in STATE for manual control
  const [mirrorMaterial, setMirrorMaterial] = useState<THREE.MeshBasicMaterial | null>(null);

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

        // TEST: Try VideoTexture instead of CanvasTexture
        const texture = new THREE.VideoTexture(video);
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.colorSpace = THREE.SRGBColorSpace;

        console.log('[AvatarMirror] VideoTexture created (NO skeleton overlay for now)');

        // Create material with VideoTexture + bright fallback color to test
        const material = new THREE.MeshBasicMaterial({
          map: texture,
          color: 0x00ffff, // BRIGHT CYAN - if you see this, texture isn't rendering
          side: THREE.DoubleSide,
          toneMapped: false,
        });

        console.log('[AvatarMirror] Material created with VideoTexture + cyan fallback color');

        // Set material in state (texture updates automatically with video)
        setMirrorMaterial(material);
        console.log('[AvatarMirror] ✅ VideoTexture material ready');

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
    };
  }, [cameraDeviceId]); // Re-initialize when camera changes

  // Cleanup material on unmount
  useEffect(() => {
    return () => {
      if (mirrorMaterial) {
        console.log('[AvatarMirror] Disposing material on unmount');
        mirrorMaterial.dispose();
      }
    };
  }, [mirrorMaterial]);

  // VideoTexture updates automatically - no manual render loop needed for now
  // TODO: Re-add pose detection and skeleton overlay once VideoTexture works

  // Don't render anything until material is ready
  if (!mirrorMaterial) {
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

      {/* Video mirror plane */}
      <mesh ref={meshRef} scale={mirrorScale} material={mirrorMaterial}>
        <planeGeometry args={[1, 1]} />
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
