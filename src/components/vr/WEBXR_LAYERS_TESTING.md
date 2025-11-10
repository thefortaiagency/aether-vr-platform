# WebXR Layers API - Testing Guide

## What We Implemented

The **WebXR Layers API** provides native video rendering in VR headsets, solving the issue where THREE.VideoTexture doesn't update properly in immersive VR mode.

### Problem It Solves
- **Before**: Coach video connected successfully but appeared as black/frozen screen in VR
- **After**: Video renders natively on VR compositor, bypassing Three.js texture update issues

### How It Works

#### Desktop Mode (Fallback)
```
User → TwilioVideoLayer → Traditional Three.js Rendering
                       → meshStandardMaterial
                       → Full UI controls visible
```

#### VR Mode (WebXR Layers)
```
User → Enter VR → sessionstart event
                → XRMediaBinding.createQuadLayer(video)
                → session.updateRenderState({ layers: [layer] })
                → Native VR compositor rendering
```

## Testing Checklist

### 1. Desktop Mode Testing (No VR Headset)

**Navigate to VR Training Room**:
```
http://localhost:3000/vVRTraining?room=test-room
```

**Expected Behavior**:
- [ ] Coach panel appears on right side
- [ ] Status shows "⏳ Connecting..." then "🎯 Coach LIVE"
- [ ] Green sphere indicator when connected
- [ ] Can drag panel in 3D space (X, Y, Z)
- [ ] +/- buttons work for zoom (transparent buttons)
- [ ] Scale indicator shows percentage
- [ ] Instructions text: "Drag in 3D"

**Console Logs to Watch For**:
```
🔄 Connecting to Twilio room: test-room
✅ Got token, connecting to room...
📺 Video element created (muted, off-screen for VR)
🎥 Connected to Twilio room: test-room
👥 Participants already in room: 0
🥽 VR Active: false
```

### 2. VR Mode Testing (With Headset)

**Prerequisites**:
- Meta Quest 2/3/Pro OR any WebXR-compatible headset
- Same WiFi network as development machine
- Chrome/Edge browser on headset

**Steps**:
1. Put on VR headset
2. Open browser and navigate to `http://[YOUR-LOCAL-IP]:3000/vVRTraining?room=test-room`
3. Click "Enter VR" button (top right)
4. Look for coach panel

**Expected Behavior**:
- [ ] Panel appears at position (2.5, 1.5, -3) meters
- [ ] Status changes to "🥽 VR Layer Active"
- [ ] Blue sphere indicator appears (VR mode active)
- [ ] Video plays smoothly in VR
- [ ] No black screen or frozen frames
- [ ] Can point and drag with VR controllers

**Console Logs to Watch For**:
```
🥽 VR Active: true
🥽 XR Session started - creating video layer
✅ WebXR video layer created and added to session
📐 Updated layer transform: [2.5, 1.5, -3] scale: 1
```

**Error Logs to Watch For**:
```
❌ XRMediaBinding not supported in this browser
❌ Failed to create WebXR video layer: [error details]
```

### 3. Coach Broadcast → VR Viewer Workflow

**Setup** (requires 2 devices):

**Device 1 - Coach (Desktop/Phone)**:
1. Navigate to: `http://localhost:3000/vVRTraining?room=test-room`
2. Allow camera/mic permissions
3. Ensure camera is broadcasting

**Device 2 - Viewer (VR Headset)**:
1. Navigate to: `http://[LOCAL-IP]:3000/vVRTraining?room=test-room`
2. Click "Enter VR"
3. Look for coach video panel

**Expected Behavior**:
- [ ] Coach sees self in preview
- [ ] VR viewer sees coach's video stream
- [ ] Video updates in real-time (not frozen)
- [ ] Audio works (muted by default, can be unmuted)
- [ ] Both see "🎯 Coach LIVE" status
- [ ] Participant name extracts correctly

**Console Logs - Coach Side**:
```
👤 Local participant joined
📹 Publishing video track
```

**Console Logs - VR Viewer Side**:
```
👤 Participant already in room: Coach-web-[timestamp]
🔗 Attaching participant: Coach
🎯 attachTrack called: video
✅ Setting srcObject for WebXR Layer
🎥 Video playback started successfully
```

### 4. Position & Scale Updates in VR

**Test Dynamic Updates**:
1. Enter VR mode
2. Use VR controllers to grab and move panel
3. Try +/- buttons (if visible in VR)

**Expected Behavior**:
- [ ] Layer position updates when dragged
- [ ] Layer scale updates when zoomed
- [ ] Console shows: `📐 Updated layer transform: [x, y, z] scale: X`
- [ ] No lag or stuttering during movement

### 5. Mode Switching Test

**Test Seamless Transition**:
1. Start in desktop mode (see traditional rendering)
2. Click "Enter VR"
3. Observe mode switch
4. Exit VR
5. Observe return to desktop mode

**Expected Behavior**:
- [ ] UI elements disappear in VR (only status text remains)
- [ ] Video continues playing during transition
- [ ] No connection drops or resets
- [ ] Controls reappear when exiting VR

## Browser Support

### Supported Browsers

**Desktop Testing**:
- ✅ Chrome 90+
- ✅ Edge 90+
- ⚠️ Firefox (WebXR supported, but XRMediaBinding may not be)
- ❌ Safari (no WebXR support)

**VR Headset Testing**:
- ✅ Meta Quest Browser (recommended)
- ✅ Chrome (sideloaded on Quest)
- ⚠️ Firefox Reality (check XRMediaBinding support)

### Feature Detection

The component checks for XRMediaBinding support:
```typescript
if (!('XRMediaBinding' in window)) {
  console.error('❌ XRMediaBinding not supported in this browser');
  return;
}
```

If unsupported, it falls back to desktop rendering.

## Troubleshooting

### Issue: "XRMediaBinding not supported"

**Cause**: Browser doesn't support WebXR Layers API
**Solution**:
- Use Meta Quest Browser or Chrome
- Check browser version (need Chrome 90+)
- Enable WebXR flags if needed

### Issue: Black screen in VR

**Possible Causes**:
1. Layer not added to renderState
2. Video not playing (autoplay blocked)
3. srcObject not set correctly

**Debug Steps**:
```javascript
// Check if layer was created
console.log('Layer ref:', layerRef.current);

// Check video element state
console.log('Video ready state:', videoRef.current?.readyState);
console.log('Video playing:', !videoRef.current?.paused);

// Check XR session state
console.log('XR session:', session);
console.log('Render state layers:', session?.renderState.layers);
```

### Issue: Video position wrong in VR

**Cause**: XRRigidTransform not updating
**Solution**:
- Check console for "📐 Updated layer transform" logs
- Verify position state is updating
- Check if useEffect dependencies are correct

### Issue: Twilio connection fails

**Cause**: Token API error or network issue
**Solution**:
- Check `/api/twilio/video-token` endpoint
- Verify Twilio credentials in .env.local
- Check browser console for API errors

## Performance Notes

### Desktop Mode
- Traditional Three.js rendering
- Texture updates every frame via useFrame
- Higher CPU usage

### VR Mode
- Native compositor rendering
- No texture updates needed
- Better performance
- Lower latency

## Next Steps

Once basic functionality is confirmed:

1. **Add VR Hand Tracking**: Enable grabbing with VR hands instead of just controllers
2. **Multi-layer Support**: Show both coach and technique videos as WebXR layers
3. **Audio Controls**: Add spatial audio positioning
4. **Advanced Positioning**: Add snap-to-grid or preset positions
5. **Recording**: Record VR sessions with video overlays

## Code References

**Main Component**: `components/vr/TwilioVideoLayer.tsx`
- Lines 93-140: Twilio connection logic
- Lines 143-175: WebXR layer creation
- Lines 178-189: Layer position/scale updates
- Lines 192-311: Fallback desktop rendering

**Integration**: `components/vr/VRSceneClient.tsx`
- Lines 152-157: TwilioVideoLayer usage

**Backup**: `components/vr/TwilioVideoTexture.tsx.backup`
- Original implementation for reference
