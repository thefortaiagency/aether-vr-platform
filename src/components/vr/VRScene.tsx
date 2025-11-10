import React from 'react';
import VRSceneSimple from './VRSceneSimple';

interface VRSceneProps {
  activeExercise: string;
  showCoach: boolean;
  videoEnabled: boolean;
  showMirror?: boolean;
  onVRStart: () => void;
  onVREnd: () => void;
  backgroundImageUrl?: string;
  roomName?: string;
  userName?: string;
  onScreenshot?: () => void;
}

// Simple wrapper component - using simplified version for testing
export default function VRScene(props: VRSceneProps) {
  return <VRSceneSimple {...props} />;
}
