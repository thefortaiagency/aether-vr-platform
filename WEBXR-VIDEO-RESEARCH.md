# WebXR Video Display Research - Working Solutions & Key Findings

## Executive Summary

Displaying webcam video in WebXR/VR applications is challenging due to texture update issues. After researching working examples and community solutions, here are the key findings:

### Critical Issue
**Video textures often stop updating when entering WebXR/VR mode** - this is a widespread problem affecting THREE.js, React Three Fiber, and other WebXR frameworks.

---

## Working Solutions

### 1. **VideoTexture with Continuous `needsUpdate` (Your Current Approach)**

**Status**: ✅ Best general approach for React Three Fiber

**Key Pattern**:
```tsx
// Create VideoTexture
const texture = new THREE.VideoTexture(video);
texture.minFilter = THREE.LinearFilter;
texture.magFilter = THREE.LinearFilter;
texture.colorSpace = THREE.SRGBColorSpace;
texture.generateMipmaps = false;

// Update EVERY frame in useFrame hook
useFrame(() => {
  if (texture && video.readyState >= video.HAVE_CURRENT_DATA) {
    texture.needsUpdate = true;
  }
});
```

**Why It Works**:
- Forces texture update every frame
- Bypasses WebXR's texture caching issues
- Works in both desktop and VR modes

**Your Implementation**: `VideoTexture.tsx`, `TwilioVideoTexture.tsx`, `AvatarMirror.tsx` all use this pattern correctly.

---

### 2. **WebXR Layers API (Hardware-Accelerated)**

**Status**: ✅ Most performant, but limited browser support

**Source**: [THREE.js WebXR Layers Example](https://threejs.org/examples/webxr_vr_layers.html)

**Key Pattern**:
```javascript
// Create video element
const video = document.createElement('video');
video.src = 'video.webm';
video.loop = true;

// Create XR Media Binding
const mediaBinding = new XRMediaBinding(session);

// Create equirect layer (for 360 video)
const equirectLayer = mediaBinding.createEquirectLayer(video, {
  space: refSpace,
  layout: 'stereo-left-right',
  transform: new XRRigidTransform({}, { x: 0, y: .28, z: 0, w: .96 })
});

// OR create quad layer (for flat video)
const quadLayer = mediaBinding.createQuadLayer(video, {
  space: refSpace,
  width: 2.0,
  height: 1.5
});

// Update render state with layers
session.updateRenderState({
  layers: [session.renderState.baseLayer, equirectLayer]
});
```

**Why It Works**:
- Video rendered directly by XR compositor (bypasses THREE.js)
- Smooth playback even if app framerate drops
- Saves GPU memory (~4MB per video)

**Limitations**:
- Only supported on Meta Quest browsers and some desktop VR
- Not available in AR or inline sessions
- Requires WebXR Layers polyfill for broader support

**Your Implementation**: `VideoXRLayer.tsx` implements this pattern correctly.

---

### 3. **WebRTC Video Streaming**

**Status**: ✅ Works for live camera/screen sharing

**Source**: [gregfagan/xr-remote-display](https://github.com/gregfagan/blog/blob/main/xr-remote-display/README.md)

**Key Pattern**:
```javascript
// Capture desktop/camera
const stream = await navigator.mediaDevices.getDisplayMedia({
  video: { frameRate: 30 }
});

// Create WebRTC connection
const rtcConnection = new RTCPeerConnection();
stream.getTracks().forEach(track => {
  rtcConnection.addTrack(track, stream);
});

// Exchange SDP/ICE via WebSocket
// Then attach remote stream to video element
videoElement.srcObject = remoteStream;
await videoElement.play();

// Create VideoTexture as normal
const texture = new THREE.VideoTexture(videoElement);
```

**Why It Works**:
- Real-time streaming with low latency
- Works with MediaStream (camera) or screen capture
- Video element automatically updates from stream

**Use Cases**:
- Coach video feed (your `TwilioVideoTexture.tsx`)
- Screen mirroring in VR
- Multi-user video conferencing

---

## Common Problems & Solutions

### Problem 1: Video Texture Stops Updating in VR Mode

**Symptoms**:
- Video plays fine in desktop browser
- Freezes on last frame when entering VR
- Audio continues playing

**Causes**:
- WebXR implementations don't auto-update textures
- Browser optimization disables video decode in VR
- Texture caching issues

**Solutions**:
1. **Force continuous updates**:
   ```tsx
   useFrame(() => {
     if (texture && video.readyState >= 2) {
       texture.needsUpdate = true;
     }
   });
   ```

2. **Video element setup**:
   ```javascript
   video.crossOrigin = 'anonymous';
   video.playsInline = true;
   video.setAttribute('playsinline', 'true');
   video.setAttribute('webkit-playsinline', 'true');

   // Position off-screen (NOT display:none)
   video.style.position = 'absolute';
   video.style.left = '-9999px';
   video.style.opacity = '0';
   ```

3. **Material configuration**:
   ```javascript
   material.toneMapped = false; // Prevent color shifts
   material.side = THREE.DoubleSide; // Visible from both sides
   ```

**References**:
- [THREE.js Forum - Video texture not updating in VR](https://discourse.threejs.org/t/video-texture-no-longer-updating-after-entering-webxr-mode/43068)
- [WebKit Bug #260259](https://bugs.webkit.org/show_bug.cgi?id=260259)

---

### Problem 2: CanvasTexture Frozen in VR

**Symptoms**:
- Animated canvas works in desktop
- Freezes when entering VR (Quest 2, etc.)

**Cause**:
- XR render loop runs twice per frame (once per eye)
- Canvas animations may rely on `requestAnimationFrame` which conflicts with XR loop

**Solutions**:
1. **Use VideoTexture instead of CanvasTexture** (recommended)
2. **Optimize canvas updates**:
   ```tsx
   useFrame((state, delta, xrFrame) => {
     const xrview = xrFrame?.views?.[0];

     // Only render once per frame (not per eye)
     if (xrview?.eye === 'left') {
       updateCanvas();
       canvasTexture.needsUpdate = true;
     }
   });
   ```

**References**:
- [THREE.js Forum - CanvasTexture in WebXR](https://discourse.threejs.org/t/animated-canvas-canvastexture-dont-work-in-webxr-why/81587)

---

### Problem 3: Camera Access Overrides Video Texture

**Symptoms**:
- Video texture works normally
- Becomes camera feed when enabling `camera-access` feature

**Cause**:
- WebXR `camera-access` feature provides device camera as texture
- Conflicts with custom video sources

**Solution**:
- Don't use `camera-access` feature if displaying custom video
- Or use separate texture for camera feed

**References**:
- [THREE.js Issue #26452](https://github.com/mrdoob/three.js/issues/26452)

---

### Problem 4: Camera Pauses When Entering XR

**Symptoms**:
- MediaStream-based video feed goes black immediately after `sessionstart`
- No JavaScript errors and video resumes when XR session ends

**Cause**:
- Quest browsers automatically suspend camera capture unless the WebXR session is created with the `camera-access` optional feature

**Solution**:
- Ensure every call to `navigator.xr.requestSession` (and `offerSession`) adds `camera-access` to `optionalFeatures`
- Patch session helpers if the framework does not expose `camera-access`

**Implementation Tip**:
- Wrap the browser's `requestSession` so it injects `camera-access` into the options object before delegating to the original method.

---

### Problem 5: Black Texture in VR

**Symptoms**:
- Video element exists and plays
- Texture appears black in VR

**Causes & Solutions**:

1. **Color Space Mismatch**:
   ```javascript
   texture.colorSpace = THREE.SRGBColorSpace; // ✅ Correct
   // Not: THREE.LinearSRGBColorSpace
   ```

2. **Video Element Hidden with `display: none`**:
   ```javascript
   // ❌ Wrong - causes black texture
   video.style.display = 'none';

   // ✅ Correct - position off-screen
   video.style.position = 'absolute';
   video.style.left = '-9999px';
   video.style.opacity = '0';
   ```

3. **Video Not Playing**:
   ```javascript
   // Must call play() for MediaStream
   video.srcObject = stream;
   await video.play(); // Critical!
   ```

4. **CORS Issues**:
   ```javascript
   video.crossOrigin = 'anonymous';
   ```

---

## Performance Optimization

### GPU Memory Considerations (Quest 2)

**Video Resolution Impact**:
- 640x480 = ~1.2MB GPU memory
- 320x240 = ~300KB GPU memory (1/4 size)
- Multiple videos can quickly exhaust Quest 2's 4GB shared memory

**Optimization Strategies**:

1. **Lower resolution for non-critical videos**:
   ```javascript
   // Your AvatarMirror.tsx correctly uses 320x240
   const constraints = {
     video: { width: 320, height: 240 }
   };
   ```

2. **Use WebXR Layers for high-quality video**:
   - Offloads to hardware compositor
   - Saves ~4MB per video
   - Smoother playback

3. **Disable mipmaps**:
   ```javascript
   texture.generateMipmaps = false;
   ```

4. **Use appropriate filters**:
   ```javascript
   texture.minFilter = THREE.LinearFilter; // Not NearestFilter
   texture.magFilter = THREE.LinearFilter;
   ```

---

## Browser-Specific Issues

### Meta Quest Browser (Chromium-based)
- ✅ VideoTexture works with continuous updates
- ✅ WebXR Layers API supported
- ⚠️ Some older firmware versions had video bugs (fixed in 3.2.5+)

### Apple Vision Pro (Safari WebXR)
- ⚠️ Known bug: Video freezes on entering XR mode
- Workaround: Force video.play() on session start
- Status: Reported as blocker bug

### Firefox Reality / Wolvic
- ✅ VideoTexture works
- ❌ WebXR Layers not fully supported

---

## React Three Fiber Specific Patterns

### Video Texture Hook (Drei)
```tsx
import { useVideoTexture } from '@react-three/drei';

function VideoPlane() {
  const texture = useVideoTexture('/video.mp4');
  return (
    <mesh>
      <planeGeometry args={[16, 9]} />
      <meshBasicMaterial map={texture} toneMapped={false} />
    </mesh>
  );
}
```

**Limitations**:
- May not work correctly in XR without manual `needsUpdate`
- Recommended to create VideoTexture manually for XR use

### Your Current Implementation Analysis

**✅ What You're Doing Right**:
1. Using `useFrame` to update texture every frame
2. Correct color space (`THREE.SRGBColorSpace`)
3. Proper video element setup (off-screen, not hidden)
4. `playsInline` for mobile/VR compatibility
5. Lower resolution for AvatarMirror (320x240)

**🔄 Potential Improvements**:
1. **Add XR-specific checks**:
   ```tsx
   import { useXRSession } from '@react-three/xr';

   const xrSession = useXRSession();

   useFrame(() => {
     if (texture && video.readyState >= 2) {
       texture.needsUpdate = true;

       // Extra update for XR mode
       if (xrSession && meshRef.current) {
         const material = meshRef.current.material;
         if (material.map) {
           material.map.needsUpdate = true;
           material.needsUpdate = true;
         }
       }
     }
   });
   ```

2. **Add error recovery**:
   ```tsx
   useEffect(() => {
     const handleVisibilityChange = () => {
       if (document.visibilityState === 'visible' && videoRef.current) {
         videoRef.current.play().catch(console.error);
       }
     };

     document.addEventListener('visibilitychange', handleVisibilityChange);
     return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
   }, []);
   ```

3. **Optimize update frequency** (optional):
   ```tsx
   // Only update texture if video time changed (saves GPU cycles)
   const lastTimeRef = useRef(0);

   useFrame(() => {
     if (texture && video.currentTime !== lastTimeRef.current) {
       texture.needsUpdate = true;
       lastTimeRef.current = video.currentTime;
     }
   });
   ```

---

## Working GitHub Examples

### 1. Immersive Web Samples - Stereo Video
**URL**: https://github.com/immersive-web/webxr-samples/blob/main/stereo-video.html
**Tech**: Vanilla THREE.js + WebXR
**Pattern**: VideoTexture with manual update loop
**Notes**: Official W3C example, guaranteed to work

### 2. VR-cam WebXR Video Player
**URL**: https://github.com/VR-cam/WebXR-video-player
**Tech**: Babylon.js
**Features**: Local files + WebRTC streaming
**Notes**: Production-ready player with VR controls

### 3. THREE.js WebXR Layers Example
**URL**: https://threejs.org/examples/webxr_vr_layers.html
**Tech**: THREE.js + WebXR Layers API
**Pattern**: Hardware-accelerated video rendering
**Notes**: Best performance, limited browser support

### 4. Agora WebXR
**URL**: https://github.com/digitallysavvy/AgoraWebXR
**Tech**: A-Frame + Agora SDK
**Features**: Live video broadcasting in VR/AR
**Notes**: Multi-user video conferencing

---

## Key Takeaways

### What Works Consistently
1. **VideoTexture + continuous `needsUpdate`** - Most compatible
2. **WebXR Layers API** - Best performance (Quest browsers)
3. **WebRTC MediaStream** - Live video feeds
4. **Off-screen video elements** - Prevents render issues

### What Doesn't Work
1. **CanvasTexture without special handling** - Freezes in VR
2. **`display: none` on video element** - Causes black texture
3. **Relying on automatic texture updates** - Doesn't work in XR
4. **High-res video (>640x480)** - Memory issues on Quest 2

### Common Mistakes to Avoid
1. Not calling `video.play()` after setting `srcObject`
2. Wrong color space (use `SRGBColorSpace`, not `LinearSRGBColorSpace`)
3. Forgetting `crossOrigin='anonymous'` for external videos
4. Using `display: none` instead of off-screen positioning
5. Not updating texture every frame in XR mode

---

## Recommended Approach for Your Platform

Based on your current implementation and requirements:

### For Pre-recorded Training Videos
Use: **VideoTexture** (your current approach in `VideoTexture.tsx`)
- ✅ Works reliably
- ✅ Easy to control (play/pause/seek)
- ✅ Good browser support

### For Coach Live Video Feed
Use: **WebRTC + VideoTexture** (your `TwilioVideoTexture.tsx`)
- ✅ Real-time communication
- ✅ Two-way audio/video
- ✅ Works with Twilio

### For Wrestler Self-View (Mirror)
Use: **VideoTexture + Lower Resolution** (your `AvatarMirror.tsx`)
- ✅ 320x240 resolution (good memory usage)
- ✅ Can add pose detection overlay
- 🔄 Consider switching from CanvasTexture to VideoTexture for base layer

### Future Enhancement
Consider: **WebXR Layers API** (your `VideoXRLayer.tsx`)
- Use as progressive enhancement
- Fallback to VideoTexture if not supported
- Best for high-quality coach video on Quest

---

## Testing Checklist

When implementing video in WebXR:
- [ ] Video plays in desktop mode
- [ ] Video continues playing after entering VR
- [ ] Texture updates in real-time (check with seek/timestamp)
- [ ] Audio plays correctly
- [ ] Video visible from expected viewing angle
- [ ] Proper cleanup on component unmount
- [ ] Memory usage acceptable on Quest 2 (check browser DevTools)
- [ ] Handles page visibility changes (tab switching)
- [ ] Recovers from network errors (for streams)
- [ ] Color/brightness looks correct (color space)

---

## Additional Resources

### Official Docs
- [WebXR Device API](https://immersive-web.github.io/webxr/)
- [WebXR Layers Spec](https://immersive-web.github.io/layers/)
- [THREE.js WebXR Guide](https://threejs.org/docs/#manual/en/introduction/How-to-use-WebXR)

### Community Resources
- [THREE.js Forum WebXR Section](https://discourse.threejs.org/c/webxr/12)
- [@react-three/xr Documentation](https://github.com/pmndrs/xr)
- [WebXR Samples Repository](https://github.com/immersive-web/webxr-samples)

### Known Issues
- [THREE.js #26452 - VideoTexture Camera Access](https://github.com/mrdoob/three.js/issues/26452)
- [WebKit #260259 - Video Freeze Bug](https://bugs.webkit.org/show_bug.cgi?id=260259)
- [@react-three/xr #214 - Video/IFrame Support](https://github.com/pmndrs/xr/issues/214)

---

## Conclusion

Your current implementation is on the right track. The key pattern that works consistently across all WebXR platforms is:

```tsx
// 1. Create VideoTexture
const texture = new THREE.VideoTexture(video);
texture.colorSpace = THREE.SRGBColorSpace;
texture.generateMipmaps = false;

// 2. Update every frame
useFrame(() => {
  if (texture && video.readyState >= 2) {
    texture.needsUpdate = true;
  }
});

// 3. Use meshBasicMaterial
<meshBasicMaterial map={texture} toneMapped={false} />
```

The main issue you're likely facing is that video textures stop updating when entering VR mode. The solution is already in your code - just ensure it's consistently applied across all video components, and verify that the update loop runs in XR sessions.

If standard VideoTexture still has issues, consider the WebXR Layers API as a fallback for high-quality video on supported devices (Quest browsers).
