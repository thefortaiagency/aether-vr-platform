'use client';

import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useXR } from '@react-three/xr';
import * as THREE from 'three';

interface AudioSource {
  id: string;
  position: THREE.Vector3;
  stream: MediaStream;
}

export function SpatialAudioSystem({ sources }: { sources: AudioSource[] }) {
  const { camera } = useThree();
  const { isPresenting } = useXR();
  const audioContextRef = useRef<AudioContext | null>(null);
  const pannerNodesRef = useRef<Map<string, PannerNode>>(new Map());
  const audioElementsRef = useRef<Map<string, HTMLAudioElement>>(new Map());

  useEffect(() => {
    if (!isPresenting) return;

    // Create Web Audio API context
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    audioContextRef.current = audioContext;

    // Set up listener (camera position)
    const listener = audioContext.listener;

    // Set listener orientation (forward and up vectors)
    if (listener.forwardX) {
      listener.forwardX.value = 0;
      listener.forwardY.value = 0;
      listener.forwardZ.value = -1;
      listener.upX.value = 0;
      listener.upY.value = 1;
      listener.upZ.value = 0;
    }

    console.log('🔊 Spatial Audio System initialized');

    return () => {
      // Cleanup
      pannerNodesRef.current.forEach((panner) => {
        panner.disconnect();
      });
      audioElementsRef.current.forEach((audio) => {
        audio.pause();
        audio.srcObject = null;
      });
      audioContext.close();
    };
  }, [isPresenting]);

  useEffect(() => {
    if (!audioContextRef.current || !isPresenting) return;

    const audioContext = audioContextRef.current;

    sources.forEach((source) => {
      // Skip if already created
      if (pannerNodesRef.current.has(source.id)) return;

      // Create audio element
      const audio = document.createElement('audio');
      audio.srcObject = source.stream;
      audio.autoplay = true;
      audio.muted = false;
      audioElementsRef.current.set(source.id, audio);

      // Create media stream source
      const sourceNode = audioContext.createMediaStreamSource(source.stream);

      // Create panner for spatial audio
      const panner = audioContext.createPanner();
      panner.panningModel = 'HRTF'; // Head-Related Transfer Function for realistic 3D audio
      panner.distanceModel = 'inverse';
      panner.refDistance = 1;
      panner.maxDistance = 20;
      panner.rolloffFactor = 1;
      panner.coneInnerAngle = 120;
      panner.coneOuterAngle = 240;
      panner.coneOuterGain = 0.3;

      // Set initial position
      panner.positionX.value = source.position.x;
      panner.positionY.value = source.position.y;
      panner.positionZ.value = source.position.z;

      // Connect audio graph
      sourceNode.connect(panner);
      panner.connect(audioContext.destination);

      pannerNodesRef.current.set(source.id, panner);

      console.log(`🔊 Spatial audio source created: ${source.id}`);
    });

    // Remove sources that no longer exist
    const sourceIds = new Set(sources.map(s => s.id));
    pannerNodesRef.current.forEach((panner, id) => {
      if (!sourceIds.has(id)) {
        panner.disconnect();
        pannerNodesRef.current.delete(id);

        const audio = audioElementsRef.current.get(id);
        if (audio) {
          audio.pause();
          audio.srcObject = null;
          audioElementsRef.current.delete(id);
        }
      }
    });

  }, [sources, isPresenting]);

  // Update listener and panner positions every frame
  useFrame(() => {
    if (!audioContextRef.current || !isPresenting) return;

    const listener = audioContextRef.current.listener;

    // Update listener position to camera position
    if (listener.positionX) {
      listener.positionX.value = camera.position.x;
      listener.positionY.value = camera.position.y;
      listener.positionZ.value = camera.position.z;
    }

    // Update listener orientation based on camera rotation
    const forward = new THREE.Vector3(0, 0, -1);
    forward.applyQuaternion(camera.quaternion);

    const up = new THREE.Vector3(0, 1, 0);
    up.applyQuaternion(camera.quaternion);

    if (listener.forwardX) {
      listener.forwardX.value = forward.x;
      listener.forwardY.value = forward.y;
      listener.forwardZ.value = forward.z;
      listener.upX.value = up.x;
      listener.upY.value = up.y;
      listener.upZ.value = up.z;
    }

    // Update panner positions
    sources.forEach((source) => {
      const panner = pannerNodesRef.current.get(source.id);
      if (panner) {
        panner.positionX.value = source.position.x;
        panner.positionY.value = source.position.y;
        panner.positionZ.value = source.position.z;

        // Update panner orientation (pointing towards listener)
        const direction = new THREE.Vector3().subVectors(camera.position, source.position).normalize();
        panner.orientationX.value = direction.x;
        panner.orientationY.value = direction.y;
        panner.orientationZ.value = direction.z;
      }
    });
  });

  // Visual indicators for audio sources (debug)
  return (
    <group>
      {sources.map((source) => (
        <group key={source.id} position={source.position}>
          {/* Audio source indicator */}
          <mesh>
            <sphereGeometry args={[0.1, 16, 16]} />
            <meshStandardMaterial
              color="#00ffff"
              emissive="#00ffff"
              emissiveIntensity={0.5}
              transparent
              opacity={0.5}
            />
          </mesh>

          {/* Pulsing rings to show audio */}
          <mesh scale={[1.5, 1.5, 1.5]}>
            <ringGeometry args={[0.15, 0.2, 32]} />
            <meshStandardMaterial
              color="#00ffff"
              emissive="#00ffff"
              emissiveIntensity={0.3}
              transparent
              opacity={0.3}
              side={THREE.DoubleSide}
            />
          </mesh>
        </group>
      ))}
    </group>
  );
}
