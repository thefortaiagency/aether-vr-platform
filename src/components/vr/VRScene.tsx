import React from 'react';
import VRSceneClient from './VRSceneClient';

interface VRSceneProps {
  activeExercise: string;
  showCoach: boolean;
  videoEnabled: boolean;
  onVRStart: () => void;
  onVREnd: () => void;
  backgroundImageUrl?: string;
  roomName?: string;
  userName?: string;
}

// Simple wrapper component (no Next.js dynamic import needed)
export default function VRScene(props: VRSceneProps) {
  return <VRSceneClient {...props} />;
}
