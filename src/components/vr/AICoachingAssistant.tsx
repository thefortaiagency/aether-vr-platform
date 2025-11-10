'use client';

import { useState, useEffect, useRef } from 'react';
import { Text, Html } from '@react-three/drei';
import { useXR } from '@react-three/xr';
import * as THREE from 'three';

interface CoachingTip {
  type: 'stance' | 'movement' | 'technique' | 'positioning';
  severity: 'info' | 'warning' | 'critical';
  message: string;
  timestamp: number;
}

interface AICoachingAssistantProps {
  exercise: string;
  handData?: any;
  enabled: boolean;
}

export function AICoachingAssistant({ exercise, handData, enabled }: AICoachingAssistantProps) {
  const { isPresenting } = useXR();
  const [tips, setTips] = useState<CoachingTip[]>([]);
  const [currentTip, setCurrentTip] = useState<CoachingTip | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const videoCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const analysisIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!enabled || !isPresenting) return;

    // Create canvas for capturing VR view
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 480;
    videoCanvasRef.current = canvas;

    // Start periodic analysis (every 3 seconds to avoid rate limits)
    analysisIntervalRef.current = setInterval(() => {
      analyzeForm();
    }, 3000);

    return () => {
      if (analysisIntervalRef.current) {
        clearInterval(analysisIntervalRef.current);
      }
    };
  }, [enabled, isPresenting, exercise]);

  const analyzeForm = async () => {
    if (!videoCanvasRef.current || isAnalyzing) return;

    setIsAnalyzing(true);

    try {
      // Capture current view
      const canvas = videoCanvasRef.current;
      const imageData = canvas.toDataURL('image/jpeg', 0.8);

      // Send to AI for analysis
      const response = await fetch('/api/ai/analyze-wrestling-form', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image: imageData,
          exercise,
          handData
        })
      });

      if (!response.ok) throw new Error('Analysis failed');

      const { tips: newTips } = await response.json();

      // Add new tips
      const tipsWithTimestamp = newTips.map((tip: Omit<CoachingTip, 'timestamp'>) => ({
        ...tip,
        timestamp: Date.now()
      }));

      setTips((prev) => [...tipsWithTimestamp, ...prev].slice(0, 10));

      // Set current tip to the most important one
      const criticalTip = tipsWithTimestamp.find((t: CoachingTip) => t.severity === 'critical');
      const warningTip = tipsWithTimestamp.find((t: CoachingTip) => t.severity === 'warning');
      setCurrentTip(criticalTip || warningTip || tipsWithTimestamp[0] || null);

    } catch (error) {
      console.error('❌ AI analysis error:', error);
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Rule-based coaching (fallback when AI is not available)
  useEffect(() => {
    if (!enabled || !handData) return;

    const localTips: CoachingTip[] = [];

    // Analyze stance based on exercise
    if (exercise === 'stance') {
      if (handData.stanceScore < 70) {
        localTips.push({
          type: 'stance',
          severity: 'warning',
          message: 'Keep your hands up and maintain a low center of gravity',
          timestamp: Date.now()
        });
      }

      if (handData.handPosition === 'high') {
        localTips.push({
          type: 'positioning',
          severity: 'critical',
          message: 'Your hands are too high - lower them to chest level',
          timestamp: Date.now()
        });
      }
    }

    if (exercise === 'takedown') {
      localTips.push({
        type: 'technique',
        severity: 'info',
        message: 'Remember: Level change → Penetration step → Finish',
        timestamp: Date.now()
      });
    }

    if (exercise === 'defense') {
      localTips.push({
        type: 'technique',
        severity: 'info',
        message: 'Keep your hips back and hands active for sprawl defense',
        timestamp: Date.now()
      });
    }

    if (localTips.length > 0) {
      setTips((prev) => [...localTips, ...prev].slice(0, 10));
      if (!currentTip || Date.now() - currentTip.timestamp > 5000) {
        setCurrentTip(localTips[0]);
      }
    }

  }, [exercise, handData, enabled]);

  // Auto-rotate tips every 5 seconds
  useEffect(() => {
    if (tips.length === 0) return;

    const interval = setInterval(() => {
      const nextTip = tips[Math.floor(Math.random() * tips.length)];
      setCurrentTip(nextTip);
    }, 5000);

    return () => clearInterval(interval);
  }, [tips]);

  if (!enabled || !isPresenting || !currentTip) return null;

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return '#ff0000';
      case 'warning': return '#ffaa00';
      case 'info': return '#00ff00';
      default: return '#ffffff';
    }
  };

  return (
    <group position={[0, 2.5, -2]}>
      {/* AI Coach Badge */}
      <mesh position={[-1.2, 0.3, 0]}>
        <sphereGeometry args={[0.1, 16, 16]} />
        <meshStandardMaterial
          color="#D4AF38"
          emissive="#D4AF38"
          emissiveIntensity={isAnalyzing ? 1 : 0.3}
        />
      </mesh>

      <Text
        position={[-0.9, 0.3, 0]}
        fontSize={0.08}
        color="#FFD700"
        anchorX="left"
        outlineWidth={0.01}
        outlineColor="#000"
      >
        AI COACH
      </Text>

      {/* Current Tip Display */}
      <mesh position={[0, 0, -0.05]}>
        <planeGeometry args={[2.5, 0.6]} />
        <meshStandardMaterial
          color="#000000"
          transparent
          opacity={0.8}
        />
      </mesh>

      {/* Severity Indicator */}
      <mesh position={[-1.2, 0, 0]}>
        <circleGeometry args={[0.08, 16]} />
        <meshStandardMaterial
          color={getSeverityColor(currentTip.severity)}
          emissive={getSeverityColor(currentTip.severity)}
          emissiveIntensity={0.5}
        />
      </mesh>

      {/* Tip Text */}
      <Text
        position={[0, 0, 0]}
        fontSize={0.12}
        color={getSeverityColor(currentTip.severity)}
        anchorX="center"
        anchorY="middle"
        maxWidth={2.2}
        outlineWidth={0.01}
        outlineColor="#000"
      >
        {currentTip.message}
      </Text>

      {/* Type Label */}
      <Text
        position={[0, -0.25, 0]}
        fontSize={0.06}
        color="#888888"
        anchorX="center"
        outlineWidth={0.005}
        outlineColor="#000"
      >
        {currentTip.type.toUpperCase()}
      </Text>

      {/* Analyzing Indicator */}
      {isAnalyzing && (
        <Text
          position={[1.1, 0.3, 0]}
          fontSize={0.06}
          color="#00ffff"
          anchorX="right"
        >
          Analyzing...
        </Text>
      )}
    </group>
  );
}
