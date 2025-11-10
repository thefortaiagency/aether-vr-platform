'use client';

import React, { useRef, useEffect, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { VRM, VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import * as poseDetection from '@tensorflow-models/pose-detection';
import * as tf from '@tensorflow/tfjs-core';
import '@tensorflow/tfjs-backend-webgl';
import '@tensorflow/tfjs-backend-webgpu';

interface VRMAvatarProps {
  position?: [number, number, number];
  rotation?: [number, number, number];
  modelUrl?: string;
}

export function VRMAvatar({
  position = [0, 0, -2],
  rotation = [0, 0, 0],
  modelUrl = '/models/avatar.vrm' // Default VRM model path
}: VRMAvatarProps) {
  const groupRef = useRef<THREE.Group>(null);
  const vrmRef = useRef<VRM | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const detectorRef = useRef<poseDetection.PoseDetector | null>(null);
  const frameCountRef = useRef(0);
  const poseIntervalRef = useRef(2); // Run pose detection every 2 frames
  const lastPoseRef = useRef<poseDetection.Keypoint[] | null>(null);

  const [isReady, setIsReady] = useState(false);

  // Load VRM model
  useEffect(() => {
    let mounted = true;

    const loadVRM = async () => {
      try {
        console.log('[VRMAvatar] Loading VRM model from:', modelUrl);

        // Load GLTF with VRM extension
        const loader = new GLTFLoader();
        loader.register((parser) => new VRMLoaderPlugin(parser));

        loader.load(
          modelUrl,
          (gltf) => {
            if (!mounted) return;

            const vrm = gltf.userData.vrm as VRM;

            if (vrm) {
              // Disable frustum culling for VRM
              VRMUtils.removeUnnecessaryVertices(gltf.scene);
              VRMUtils.removeUnnecessaryJoints(gltf.scene);

              vrmRef.current = vrm;

              // Add VRM to scene
              if (groupRef.current) {
                groupRef.current.add(vrm.scene);
              }

              console.log('[VRMAvatar] ✅ VRM model loaded');
              setIsReady(true);
            }
          },
          (progress) => {
            console.log('[VRMAvatar] Loading progress:',
              Math.round((progress.loaded / progress.total) * 100) + '%'
            );
          },
          (error) => {
            console.error('[VRMAvatar] ❌ Failed to load VRM:', error);
          }
        );
      } catch (error) {
        console.error('[VRMAvatar] ❌ VRM loading error:', error);
      }
    };

    loadVRM();

    return () => {
      mounted = false;
      if (vrmRef.current) {
        VRMUtils.deepDispose(vrmRef.current.scene);
      }
    };
  }, [modelUrl]);

  // Initialize webcam and pose detector
  useEffect(() => {
    let mounted = true;
    let stream: MediaStream | null = null;

    const initializePoseTracking = async () => {
      try {
        console.log('[VRMAvatar] Initializing webcam for pose tracking...');

        // Get webcam access
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: 640,
            height: 480,
            facingMode: 'user'
          },
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

        await video.play();
        console.log('[VRMAvatar] ✅ Webcam started');

        // Initialize TensorFlow backend
        console.log('[VRMAvatar] Initializing TensorFlow backend...');
        await tf.ready();

        // Try WebGPU first, fallback to WebGL
        try {
          await tf.setBackend('webgpu');
          console.log('[VRMAvatar] ✅ Using WebGPU backend');
        } catch (error) {
          console.warn('[VRMAvatar] WebGPU unavailable, using WebGL');
          await tf.setBackend('webgl');
        }

        // Detect platform for optimal runtime
        const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
        const runtime = isMobile ? 'tfjs' : 'mediapipe';

        console.log(`[VRMAvatar] Loading BlazePose (${runtime} runtime)...`);

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
        console.log('[VRMAvatar] ✅ BlazePose loaded');

      } catch (error) {
        console.error('[VRMAvatar] ❌ Pose tracking initialization error:', error);
      }
    };

    initializePoseTracking();

    return () => {
      mounted = false;
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
      if (detectorRef.current) {
        detectorRef.current.dispose();
      }
    };
  }, []);

  // Animation loop - pose detection and VRM bone updates
  useFrame(() => {
    if (!vrmRef.current || !videoRef.current || !detectorRef.current) return;

    const video = videoRef.current;
    if (video.readyState < 2) return;

    // Throttled pose detection (every 2 frames for performance)
    frameCountRef.current++;
    if (frameCountRef.current % poseIntervalRef.current === 0) {
      detectPose();
    }

    // Apply pose to VRM bones
    if (lastPoseRef.current && vrmRef.current) {
      applyPoseToVRM(vrmRef.current, lastPoseRef.current);
    }

    // Update VRM (required for animations)
    vrmRef.current.update(0.016); // ~60 FPS delta
  });

  // Pose detection function
  const detectPose = async () => {
    if (!detectorRef.current || !videoRef.current) return;

    try {
      const poses = await detectorRef.current.estimatePoses(videoRef.current);

      if (poses && poses.length > 0) {
        const pose = poses[0];
        if (pose.keypoints && pose.keypoints.length > 0) {
          lastPoseRef.current = pose.keypoints;
        }
      }
    } catch (error) {
      console.warn('[VRMAvatar] Pose detection error:', error);
    }
  };

  // Don't render until VRM is loaded
  if (!isReady) {
    return null;
  }

  return (
    <group ref={groupRef} position={position} rotation={rotation}>
      {/* VRM model will be added to this group */}
    </group>
  );
}

// Map BlazePose keypoints to VRM bone rotations
function applyPoseToVRM(vrm: VRM, keypoints: poseDetection.Keypoint[]) {
  if (!vrm.humanoid) return;

  // Get humanoid bones
  const humanoid = vrm.humanoid;

  // Helper function to get keypoint by name
  const getKeypoint = (name: string): poseDetection.Keypoint | undefined => {
    return keypoints.find(kp => kp.name === name);
  };

  // Calculate confidence threshold
  const minConfidence = 0.3;

  try {
    // HEAD - Use nose position
    const nose = getKeypoint('nose');
    const leftEye = getKeypoint('left_eye');
    const rightEye = getKeypoint('right_eye');

    if (nose && leftEye && rightEye &&
        nose.score > minConfidence &&
        leftEye.score > minConfidence &&
        rightEye.score > minConfidence) {

      const headBone = humanoid.getNormalizedBoneNode('head');
      if (headBone) {
        // Calculate head rotation from eye positions
        const eyeMidX = (leftEye.x + rightEye.x) / 2;
        const eyeMidY = (leftEye.y + rightEye.y) / 2;

        // Pitch (up/down)
        const pitch = (nose.y - eyeMidY) * 0.01;
        // Yaw (left/right)
        const yaw = (nose.x - eyeMidX) * 0.01;

        headBone.rotation.x = THREE.MathUtils.lerp(headBone.rotation.x, pitch, 0.3);
        headBone.rotation.y = THREE.MathUtils.lerp(headBone.rotation.y, yaw, 0.3);
      }
    }

    // SPINE - Use shoulder and hip positions
    const leftShoulder = getKeypoint('left_shoulder');
    const rightShoulder = getKeypoint('right_shoulder');
    const leftHip = getKeypoint('left_hip');
    const rightHip = getKeypoint('right_hip');

    if (leftShoulder && rightShoulder && leftHip && rightHip &&
        leftShoulder.score > minConfidence &&
        rightShoulder.score > minConfidence &&
        leftHip.score > minConfidence &&
        rightHip.score > minConfidence) {

      const spineBone = humanoid.getNormalizedBoneNode('spine');
      if (spineBone) {
        // Calculate spine bend
        const shoulderMidY = (leftShoulder.y + rightShoulder.y) / 2;
        const hipMidY = (leftHip.y + rightHip.y) / 2;
        const spineBend = (shoulderMidY - hipMidY) * 0.002;

        spineBone.rotation.x = THREE.MathUtils.lerp(spineBone.rotation.x, spineBend, 0.2);
      }
    }

    // LEFT ARM - Shoulder, elbow, wrist
    const leftElbow = getKeypoint('left_elbow');
    const leftWrist = getKeypoint('left_wrist');

    if (leftShoulder && leftElbow && leftWrist &&
        leftShoulder.score > minConfidence &&
        leftElbow.score > minConfidence &&
        leftWrist.score > minConfidence) {

      const leftUpperArm = humanoid.getNormalizedBoneNode('leftUpperArm');
      const leftLowerArm = humanoid.getNormalizedBoneNode('leftLowerArm');

      if (leftUpperArm) {
        // Calculate shoulder angle
        const shoulderAngle = Math.atan2(
          leftElbow.y - leftShoulder.y,
          leftElbow.x - leftShoulder.x
        );
        leftUpperArm.rotation.z = THREE.MathUtils.lerp(
          leftUpperArm.rotation.z,
          -shoulderAngle,
          0.3
        );
      }

      if (leftLowerArm) {
        // Calculate elbow angle
        const elbowAngle = Math.atan2(
          leftWrist.y - leftElbow.y,
          leftWrist.x - leftElbow.x
        );
        leftLowerArm.rotation.z = THREE.MathUtils.lerp(
          leftLowerArm.rotation.z,
          -elbowAngle,
          0.3
        );
      }
    }

    // RIGHT ARM - Shoulder, elbow, wrist
    const rightElbow = getKeypoint('right_elbow');
    const rightWrist = getKeypoint('right_wrist');

    if (rightShoulder && rightElbow && rightWrist &&
        rightShoulder.score > minConfidence &&
        rightElbow.score > minConfidence &&
        rightWrist.score > minConfidence) {

      const rightUpperArm = humanoid.getNormalizedBoneNode('rightUpperArm');
      const rightLowerArm = humanoid.getNormalizedBoneNode('rightLowerArm');

      if (rightUpperArm) {
        const shoulderAngle = Math.atan2(
          rightElbow.y - rightShoulder.y,
          rightElbow.x - rightShoulder.x
        );
        rightUpperArm.rotation.z = THREE.MathUtils.lerp(
          rightUpperArm.rotation.z,
          -shoulderAngle,
          0.3
        );
      }

      if (rightLowerArm) {
        const elbowAngle = Math.atan2(
          rightWrist.y - rightElbow.y,
          rightWrist.x - rightElbow.x
        );
        rightLowerArm.rotation.z = THREE.MathUtils.lerp(
          rightLowerArm.rotation.z,
          -elbowAngle,
          0.3
        );
      }
    }

    // LEFT LEG - Hip, knee, ankle
    const leftKnee = getKeypoint('left_knee');
    const leftAnkle = getKeypoint('left_ankle');

    if (leftHip && leftKnee && leftAnkle &&
        leftHip.score > minConfidence &&
        leftKnee.score > minConfidence &&
        leftAnkle.score > minConfidence) {

      const leftUpperLeg = humanoid.getNormalizedBoneNode('leftUpperLeg');
      const leftLowerLeg = humanoid.getNormalizedBoneNode('leftLowerLeg');

      if (leftUpperLeg) {
        const hipAngle = Math.atan2(
          leftKnee.y - leftHip.y,
          leftKnee.x - leftHip.x
        );
        leftUpperLeg.rotation.z = THREE.MathUtils.lerp(
          leftUpperLeg.rotation.z,
          -hipAngle - Math.PI / 2,
          0.3
        );
      }

      if (leftLowerLeg) {
        const kneeAngle = Math.atan2(
          leftAnkle.y - leftKnee.y,
          leftAnkle.x - leftKnee.x
        );
        leftLowerLeg.rotation.z = THREE.MathUtils.lerp(
          leftLowerLeg.rotation.z,
          -kneeAngle - Math.PI / 2,
          0.3
        );
      }
    }

    // RIGHT LEG - Hip, knee, ankle
    const rightKnee = getKeypoint('right_knee');
    const rightAnkle = getKeypoint('right_ankle');

    if (rightHip && rightKnee && rightAnkle &&
        rightHip.score > minConfidence &&
        rightKnee.score > minConfidence &&
        rightAnkle.score > minConfidence) {

      const rightUpperLeg = humanoid.getNormalizedBoneNode('rightUpperLeg');
      const rightLowerLeg = humanoid.getNormalizedBoneNode('rightLowerLeg');

      if (rightUpperLeg) {
        const hipAngle = Math.atan2(
          rightKnee.y - rightHip.y,
          rightKnee.x - rightHip.x
        );
        rightUpperLeg.rotation.z = THREE.MathUtils.lerp(
          rightUpperLeg.rotation.z,
          -hipAngle - Math.PI / 2,
          0.3
        );
      }

      if (rightLowerLeg) {
        const kneeAngle = Math.atan2(
          rightAnkle.y - rightKnee.y,
          rightKnee.x - rightKnee.x
        );
        rightLowerLeg.rotation.z = THREE.MathUtils.lerp(
          rightLowerLeg.rotation.z,
          -kneeAngle - Math.PI / 2,
          0.3
        );
      }
    }

  } catch (error) {
    console.warn('[VRMAvatar] Error applying pose to VRM:', error);
  }
}
