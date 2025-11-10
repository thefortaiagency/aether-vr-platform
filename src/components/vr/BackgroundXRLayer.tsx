'use client';

import React, { useEffect, useRef } from 'react';
import { useXR } from '@react-three/xr';
import * as THREE from 'three';
import {
  createBackgroundLayer,
  supportsXRLayers,
} from '@/lib/xr-layers';

interface BackgroundXRLayerProps {
  imageUrl?: string;
  onLayerCreated?: (layer: XREquirectLayer) => void;
}

/**
 * BackgroundXRLayer - Creates a 360° equirectangular background using WebXR Layers API
 *
 * This renders the background directly in the XR compositor, bypassing Three.js
 * and saving ~8MB of GPU memory.
 */
export function BackgroundXRLayer({
  imageUrl,
  onLayerCreated,
}: BackgroundXRLayerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const layerRef = useRef<XREquirectLayer | null>(null);
  const { session } = useXR();

  useEffect(() => {
    if (!imageUrl || !session) return;

    // Check if Layers API is supported
    if (!supportsXRLayers()) {
      console.warn('[BACKGROUND XR LAYER] WebXR Layers API not supported');
      return;
    }

    let mounted = true;
    let video: HTMLVideoElement | null = null;

    const initializeLayer = async () => {
      try {
        console.log('[BACKGROUND XR LAYER] Initializing equirect layer for:', imageUrl);

        // Create hidden video element for background
        video = document.createElement('video');
        video.src = imageUrl;
        video.loop = true;
        video.muted = true;
        video.playsInline = true;
        video.crossOrigin = 'anonymous';
        video.style.display = 'none';
        document.body.appendChild(video);

        // Wait for video to be ready
        await video.play();

        if (!mounted || !session) {
          video.remove();
          return;
        }

        videoRef.current = video;

        // Get reference space
        const referenceSpace = await session.requestReferenceSpace('local-floor');

        // Create XR media binding
        const gl = (session.renderState as any).baseLayer?.context;
        if (!gl) {
          console.error('[BACKGROUND XR LAYER] No WebGL context found');
          return;
        }

        const mediaBinding = new XRMediaBinding(session);

        // Create equirect layer
        const layer = createBackgroundLayer(
          session,
          mediaBinding,
          video,
          referenceSpace
        );

        if (!mounted || !layer) return;

        layerRef.current = layer;

        console.log('[BACKGROUND XR LAYER] ✅ Layer created successfully');

        // Notify parent component
        if (onLayerCreated) {
          onLayerCreated(layer);
        }
      } catch (error) {
        console.error('[BACKGROUND XR LAYER] ❌ Initialization error:', error);
      }
    };

    initializeLayer();

    return () => {
      mounted = false;
      if (video) {
        video.pause();
        video.src = '';
        video.remove();
      }
      layerRef.current = null;
    };
  }, [session, imageUrl, onLayerCreated]);

  // This component doesn't render anything in Three.js
  // The layer is rendered directly by the XR compositor
  return null;
}
