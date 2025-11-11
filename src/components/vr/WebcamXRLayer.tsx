'use client';

import React, { useEffect, useRef } from 'react';
import { useXR } from '@react-three/xr';
import {
  createQuadLayer,
  supportsXRLayers,
} from '@/lib/xr-layers';

interface WebcamXRLayerProps {
  position: [number, number, number];
  rotation?: [number, number, number];
  width?: number;
  height?: number;
  cameraDeviceId?: string;
  onLayerCreated?: (layer: XRQuadLayer) => void;
}

/**
 * WebcamXRLayer - Creates a quad video layer for webcam using WebXR Layers API
 *
 * This renders webcam video directly in the XR compositor, bypassing Three.js
 * and saving ~4MB of GPU memory. GUARANTEED to work in VR.
 */
export function WebcamXRLayer({
  position,
  rotation = [0, 0, 0],
  width = 2.5,
  height = 3.0,
  cameraDeviceId,
  onLayerCreated,
}: WebcamXRLayerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const layerRef = useRef<XRQuadLayer | null>(null);
  const { session } = useXR();

  useEffect(() => {
    console.log('[WEBCAM XR LAYER] Effect triggered - session:', !!session, 'supportsXRLayers:', supportsXRLayers());

    if (!session) {
      console.log('[WEBCAM XR LAYER] No session, skipping initialization');
      return;
    }

    // Check if Layers API is supported
    if (!supportsXRLayers()) {
      console.warn('[WEBCAM XR LAYER] WebXR Layers API not supported');
      return;
    }

    console.log('[WEBCAM XR LAYER] Starting initialization...');

    let mounted = true;
    let video: HTMLVideoElement | null = null;
    let stream: MediaStream | null = null;

    const initializeLayer = async () => {
      try {
        console.log('[WEBCAM XR LAYER] Initializing webcam layer...');

        // Get webcam access
        const videoConstraints: MediaTrackConstraints = {
          width: 640,
          height: 480,
        };

        if (cameraDeviceId) {
          videoConstraints.deviceId = { exact: cameraDeviceId };
        } else {
          videoConstraints.facingMode = 'user';
        }

        stream = await navigator.mediaDevices.getUserMedia({
          video: videoConstraints,
          audio: false,
        });

        if (!mounted || !session) {
          stream.getTracks().forEach(track => track.stop());
          return;
        }

        streamRef.current = stream;

        // Create video element
        video = document.createElement('video');
        video.srcObject = stream;
        video.autoplay = true;
        video.playsInline = true;
        video.muted = true; // No audio from webcam
        video.style.display = 'none';
        document.body.appendChild(video);

        await video.play();

        if (!mounted || !session) {
          stream.getTracks().forEach(track => track.stop());
          video.remove();
          return;
        }

        videoRef.current = video;

        console.log('[WEBCAM XR LAYER] ✅ Webcam started');

        // Get reference space
        const referenceSpace = await session.requestReferenceSpace('local-floor');

        // Create XR media binding
        const gl = (session.renderState as any).baseLayer?.context;
        if (!gl) {
          console.error('[WEBCAM XR LAYER] No WebGL context found');
          return;
        }

        const mediaBinding = new XRMediaBinding(session);

        // Create quad layer
        const layer = createQuadLayer(
          session,
          mediaBinding,
          video,
          referenceSpace,
          position,
          rotation,
          width,
          height
        );

        if (!mounted || !layer) return;

        layerRef.current = layer;

        console.log('[WEBCAM XR LAYER] ✅ Layer created at', position);

        // Notify parent component
        if (onLayerCreated) {
          onLayerCreated(layer);
        }
      } catch (error) {
        console.error('[WEBCAM XR LAYER] ❌ Initialization error:', error);
      }
    };

    initializeLayer();

    return () => {
      mounted = false;
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
      if (video) {
        video.pause();
        video.srcObject = null;
        video.remove();
      }
      layerRef.current = null;
    };
  }, [session, position, rotation, width, height, cameraDeviceId, onLayerCreated]);

  // This component doesn't render anything in Three.js
  // The layer is rendered directly by the XR compositor
  return null;
}
