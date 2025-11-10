# Aether VR Training Platform

Standalone VR training platform for Aether Wrestling. Built with React Three Fiber and WebXR for Meta Quest 2/3.

## Features

- **VR Training Environment** - Immersive 3D training space
- **BlazePose Mirror** - Real-time pose detection and visualization
- **Technique Videos** - Spatial video playback in VR
- **Twilio Video** - Multi-participant video conferencing
- **Spatial Audio** - 3D positional audio
- **Hand Tracking** - MediaPipe hand tracking (optional)

## Tech Stack

- React 19
- Three.js + React Three Fiber
- WebXR API
- TensorFlow.js (BlazePose)
- Twilio Video SDK
- Vite

## Development

```bash
npm install
npm run dev
```

## Environment Variables

Copy `.env.example` to `.env` and fill in your credentials.

## Deployment

Deployed to Vercel at: https://vr.aethervtc.ai

```bash
npm run build
vercel deploy
```

## URL Parameters

- `room` - Video room name
- `token` - Auth token from main platform

Example: `https://vr.aethervtc.ai?room=training-1&token=xxx`
