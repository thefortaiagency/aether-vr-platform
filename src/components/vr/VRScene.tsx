import React from 'react';
import VRSceneClient from './VRSceneClient';

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
  cameraDeviceId?: string;
}

// Wrapper component - fixed AvatarMirror controllers bug
export default function VRScene(props: VRSceneProps) {
  return <VRSceneClient {...props} />;
}
