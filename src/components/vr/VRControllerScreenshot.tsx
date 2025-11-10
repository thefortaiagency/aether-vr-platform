'use client';

import { useEffect } from 'react';
import { useXR } from '@react-three/xr';

interface VRControllerScreenshotProps {
  onScreenshot: () => void;
}

export function VRControllerScreenshot({ onScreenshot }: VRControllerScreenshotProps) {
  const { controllers, isPresenting } = useXR();

  useEffect(() => {
    if (!isPresenting || controllers.length === 0) return;

    console.log('🎮 VR Controllers detected:', controllers.length);

    const handleButtonPress = (event: any) => {
      // Button index 0 is typically the trigger
      // Button index 1 is typically the grip
      // Button index 3 is typically the Y/B button on Quest controllers

      if (event.data.index === 3 || event.data.index === 1) { // Y/B button or grip
        console.log('📸 VR Controller button pressed - taking screenshot');
        onScreenshot();
      }
    };

    // Add listeners to all controllers
    const removeListeners: Array<() => void> = [];

    controllers.forEach((controller) => {
      if (controller.controller) {
        const xrController = controller.controller;

        // Listen for button press (selectstart is the generic button event)
        xrController.addEventListener('selectstart', handleButtonPress);

        removeListeners.push(() => {
          xrController.removeEventListener('selectstart', handleButtonPress);
        });

        console.log('✅ Added screenshot listener to VR controller');
      }
    });

    return () => {
      removeListeners.forEach(remove => remove());
    };
  }, [controllers, isPresenting, onScreenshot]);

  // This component doesn't render anything visible
  return null;
}
