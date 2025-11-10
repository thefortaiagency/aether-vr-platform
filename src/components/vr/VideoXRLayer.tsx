'use client';

import React, { useEffect, useRef } from 'react';
import { useXR } from '@react-three/xr';
import {
  createQuadLayer,
  supportsXRLayers,
} from '@/lib/xr-layers';

interface VideoXRLayerProps {
  videoUrl: string;
  position: [number, number, number];
  rotation?: [number, number, number];
  width?: number;
  height?: number;
  autoPlay?: boolean;
  loop?: boolean;
  onLayerCreated?: (layer: XRQuadLayer) => void;
}

/**
 * VideoXRLayer - Creates a quad video layer using WebXR Layers API
 *
 * This renders video directly in the XR compositor, bypassing Three.js
 * and saving ~4MB of GPU memory per video.
 */
export function VideoXRLayer({
  videoUrl,
  position,
  rotation = [0, 0, 0],
  width = 2.0,
  height = 1.5,
  autoPlay = true,
  loop = true,
  onLayerCreated,
}: VideoXRLayerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const layerRef = useRef<XRQuadLayer | null>(null);
  const { session } = useXR();

  useEffect(() => {
    if (!videoUrl || !session) return;

    // Check if Layers API is supported
    if (!supportsXRLayers()) {
      console.warn('[VIDEO XR LAYER] WebXR Layers API not supported');
      return;
    }

    let mounted = true;
    let video: HTMLVideoElement | null = null;

    const initializeLayer = async () => {
      try {
        console.log('[VIDEO XR LAYER] Initializing quad layer for:', videoUrl);

        // Create hidden video element
        video = document.createElement('video');
        video.src = videoUrl;
        video.loop = loop;
        video.muted = false; // Allow audio
        video.playsInline = true;
        video.crossOrigin = 'anonymous';
        video.style.display = 'none';
        document.body.appendChild(video);

        // Wait for video to be ready
        if (autoPlay) {
          // Start muted for autoplay, then unmute after play
          video.muted = true;
          await video.play();
          video.muted = false;
        }

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
          console.error('[VIDEO XR LAYER] No WebGL context found');
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

        console.log('[VIDEO XR LAYER] ✅ Layer created at', position);

        // Notify parent component
        if (onLayerCreated) {
          onLayerCreated(layer);
        }
      } catch (error) {
        console.error('[VIDEO XR LAYER] ❌ Initialization error:', error);
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
  }, [session, videoUrl, position, rotation, width, height, autoPlay, loop, onLayerCreated]);

  // This component doesn't render anything in Three.js
  // The layer is rendered directly by the XR compositor
  return null;
}
