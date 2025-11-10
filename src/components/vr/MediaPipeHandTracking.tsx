'use client';

import { useEffect, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Sphere, Line, Text } from '@react-three/drei';
import { useXR } from '@react-three/xr';
import * as THREE from 'three';

interface HandLandmark {
  x: number;
  y: number;
  z: number;
}

interface HandAnalysis {
  stanceScore: number;
  handPosition: 'high' | 'low' | 'optimal';
  elbowAngle: number;
  feedback: string[];
}

export function MediaPipeHandTracking() {
  const { isPresenting } = useXR();
  const [leftHand, setLeftHand] = useState<HandLandmark[]>([]);
  const [rightHand, setRightHand] = useState<HandLandmark[]>([]);
  const [analysis, setAnalysis] = useState<HandAnalysis | null>(null);
  const handsRef = useRef<any>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (!isPresenting) return;

    let mounted = true;
    let animationFrame: number;

    const initializeHandTracking = async () => {
      try {
        // Dynamic import of MediaPipe
        const { Hands } = await import('@mediapipe/hands');
        const { Camera } = await import('@mediapipe/camera_utils');

        // Create video element for camera feed
        const video = document.createElement('video');
        video.style.display = 'none';
        document.body.appendChild(video);
        videoRef.current = video;

        // Initialize MediaPipe Hands
        const hands = new Hands({
          locateFile: (file) => {
            return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
          }
        });

        hands.setOptions({
          maxNumHands: 2,
          modelComplexity: 1,
          minDetectionConfidence: 0.7,
          minTrackingConfidence: 0.7
        });

        hands.onResults((results) => {
          if (!mounted) return;

          const leftLandmarks: HandLandmark[] = [];
          const rightLandmarks: HandLandmark[] = [];

          if (results.multiHandLandmarks && results.multiHandedness) {
            results.multiHandLandmarks.forEach((landmarks, index) => {
              const handedness = results.multiHandedness![index];
              const isLeft = handedness.label === 'Left';

              const convertedLandmarks = landmarks.map((lm) => ({
                x: (lm.x - 0.5) * 2, // Convert to -1 to 1 range
                y: (0.5 - lm.y) * 2, // Flip Y and convert
                z: lm.z * 2
              }));

              if (isLeft) {
                leftLandmarks.push(...convertedLandmarks);
              } else {
                rightLandmarks.push(...convertedLandmarks);
              }
            });
          }

          setLeftHand(leftLandmarks);
          setRightHand(rightLandmarks);

          // Analyze wrestling stance
          if (leftLandmarks.length > 0 && rightLandmarks.length > 0) {
            const analysisResult = analyzeWrestlingStance(leftLandmarks, rightLandmarks);
            setAnalysis(analysisResult);
          }
        });

        handsRef.current = hands;

        // Start camera
        const camera = new Camera(video, {
          onFrame: async () => {
            if (mounted && handsRef.current) {
              await handsRef.current.send({ image: video });
            }
          },
          width: 640,
          height: 480
        });

        camera.start();

        console.log('✅ MediaPipe Hand Tracking initialized');

      } catch (error) {
        console.error('❌ Hand tracking initialization error:', error);
      }
    };

    initializeHandTracking();

    return () => {
      mounted = false;
      if (animationFrame) {
        cancelAnimationFrame(animationFrame);
      }
      if (videoRef.current && videoRef.current.parentNode) {
        videoRef.current.parentNode.removeChild(videoRef.current);
      }
    };
  }, [isPresenting]);

  // Analyze wrestling stance from hand positions
  const analyzeWrestlingStance = (left: HandLandmark[], right: HandLandmark[]): HandAnalysis => {
    const feedback: string[] = [];
    let stanceScore = 100;

    // Get wrist positions (landmark 0)
    const leftWrist = left[0];
    const rightWrist = right[0];

    // Check hand height (should be around chest level for wrestling stance)
    const avgHandHeight = (leftWrist.y + rightWrist.y) / 2;
    let handPosition: 'high' | 'low' | 'optimal' = 'optimal';

    if (avgHandHeight > 0.3) {
      handPosition = 'high';
      feedback.push('Lower your hands to chest level');
      stanceScore -= 15;
    } else if (avgHandHeight < -0.2) {
      handPosition = 'low';
      feedback.push('Raise your hands higher');
      stanceScore -= 15;
    } else {
      feedback.push('✓ Hand height is optimal');
    }

    // Check hand spacing
    const handDistance = Math.abs(leftWrist.x - rightWrist.x);
    if (handDistance < 0.3) {
      feedback.push('Widen your stance - hands too close');
      stanceScore -= 10;
    } else if (handDistance > 0.8) {
      feedback.push('Narrow your stance - hands too wide');
      stanceScore -= 10;
    } else {
      feedback.push('✓ Hand spacing is good');
    }

    // Estimate elbow angle (simplified)
    const leftElbow = left[7]; // Elbow landmark
    const leftShoulder = left[11]; // Approximate shoulder

    const elbowVector = new THREE.Vector3(
      leftElbow.x - leftWrist.x,
      leftElbow.y - leftWrist.y,
      leftElbow.z - leftWrist.z
    );

    const shoulderVector = new THREE.Vector3(
      leftShoulder.x - leftElbow.x,
      leftShoulder.y - leftElbow.y,
      leftShoulder.z - leftElbow.z
    );

    const elbowAngle = elbowVector.angleTo(shoulderVector) * (180 / Math.PI);

    if (elbowAngle < 70 || elbowAngle > 120) {
      feedback.push('Adjust elbow bend - aim for 90 degrees');
      stanceScore -= 10;
    } else {
      feedback.push('✓ Elbow position looks good');
    }

    return {
      stanceScore: Math.max(0, stanceScore),
      handPosition,
      elbowAngle,
      feedback
    };
  };

  // Render hand landmarks in 3D
  const renderHand = (landmarks: HandLandmark[], color: string) => {
    if (landmarks.length === 0) return null;

    // MediaPipe hand connections
    const connections = [
      [0, 1], [1, 2], [2, 3], [3, 4], // Thumb
      [0, 5], [5, 6], [6, 7], [7, 8], // Index
      [0, 9], [9, 10], [10, 11], [11, 12], // Middle
      [0, 13], [13, 14], [14, 15], [15, 16], // Ring
      [0, 17], [17, 18], [18, 19], [19, 20], // Pinky
      [5, 9], [9, 13], [13, 17] // Palm
    ];

    return (
      <group>
        {/* Render landmarks */}
        {landmarks.map((landmark, i) => (
          <Sphere key={i} args={[0.01]} position={[landmark.x, landmark.y + 1.5, landmark.z]}>
            <meshStandardMaterial
              color={color}
              emissive={color}
              emissiveIntensity={0.5}
            />
          </Sphere>
        ))}

        {/* Render connections */}
        {connections.map((connection, i) => {
          const start = landmarks[connection[0]];
          const end = landmarks[connection[1]];
          if (!start || !end) return null;

          const points = [
            new THREE.Vector3(start.x, start.y + 1.5, start.z),
            new THREE.Vector3(end.x, end.y + 1.5, end.z)
          ];

          return (
            <Line
              key={i}
              points={points}
              color={color}
              lineWidth={2}
            />
          );
        })}
      </group>
    );
  };

  return (
    <group>
      {/* Render hands */}
      {renderHand(leftHand, '#00ff00')}
      {renderHand(rightHand, '#0099ff')}

      {/* Display analysis */}
      {analysis && isPresenting && (
        <group position={[0, 2, -1]}>
          {/* Score display */}
          <Text
            position={[0, 0.5, 0]}
            fontSize={0.2}
            color={analysis.stanceScore > 80 ? '#00ff00' : analysis.stanceScore > 60 ? '#ffaa00' : '#ff0000'}
            anchorX="center"
            outlineWidth={0.02}
            outlineColor="#000"
          >
            Stance Score: {Math.round(analysis.stanceScore)}%
          </Text>

          {/* Feedback */}
          {analysis.feedback.map((text, i) => (
            <Text
              key={i}
              position={[0, 0.2 - i * 0.15, 0]}
              fontSize={0.1}
              color={text.startsWith('✓') ? '#00ff00' : '#ffaa00'}
              anchorX="center"
              outlineWidth={0.01}
              outlineColor="#000"
              maxWidth={2}
            >
              {text}
            </Text>
          ))}
        </group>
      )}
    </group>
  );
}
