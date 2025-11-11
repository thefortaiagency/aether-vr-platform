# WebXR Webcam Mirror Troubleshooting Guide

## Problem Statement

**Goal**: Display webcam video feed in VR headset (Meta Quest 2) at vr.aethervtc.ai

**Current Status**:
- ✅ Webcam mirror works on desktop (visible before entering VR)
- ❌ Webcam mirror NOT visible in VR headset
- ✅ Reference cubes (red/green/blue) ARE visible in VR
- ✅ No JavaScript errors
- ⚠️ Meta Quest browsers pause camera streams unless the XR session requests the `camera-access` optional feature

**Environment**:
- Platform: Standalone Vite + React + Three.js (NOT Next.js)
- Target: Meta Quest 2 browser
- Framework: React Three Fiber + @react-three/xr
- Deployment: Vercel at vr.aethervtc.ai
- Repository: github.com/thefortaiagency/aether-vr-platform

---

## Key Files & Locations

### 1. Main App Entry
**File**: `src/VRTraining.tsx`
- Line 22: `const [showMirror, setShowMirror] = useState(true);`
- Line 190: Passes `showMirror={showMirror}` to VRSceneClient
- Line 266-271: Toggle button for mirror visibility

### 2. VR Scene Component
**File**: `src/components/vr/VRSceneClient.tsx`
- Line 295-303: Renders AvatarMirror component
```tsx
{/* Webcam Mirror - Use AvatarMirror for both desktop AND VR */}
{showMirror && (
  <AvatarMirror
    position={[0, 1.6, -2]}
    rotation={[0, 0, 0]}
    cameraDeviceId={cameraDeviceId}
  />
)}
```

### 3. Webcam Mirror Component
**File**: `src/components/vr/AvatarMirror.tsx` (245 lines)

**Key sections**:
- Line 36-177: Initialization effect (getUserMedia, VideoTexture creation)
- Line 72-86: Video element creation and DOM insertion
- Line 92-106: VideoTexture material creation
- Line 192-205: VR session handling (force video.play())
- Line 217-247: useFrame loop (texture.needsUpdate every frame)
- Line 254-274: Render (debug spheres + video plane)

**Current Implementation**:
- Uses `THREE.VideoTexture` attached via `<primitive object={material} attach="material" />`
- Video element added to DOM (positioned off-screen)
- `texture.needsUpdate = true` every frame in useFrame
- VR session awareness via `useXR()` hook
- Force `video.play()` when entering VR

---

## What We've Tried (Chronologically)

### Attempt 1: CanvasTexture Approach
- **Method**: Draw video to canvas, use CanvasTexture
- **Result**: Material uniforms crash (decorative JSX elements caused crash)
- **Status**: Abandoned

### Attempt 2: VideoTexture with Manual Updates
- **Method**: Create VideoTexture, set needsUpdate every frame
- **Result**: Works on desktop, not in VR
- **Issue**: Material not applying or rendering transparent

### Attempt 3: Add Video to DOM
- **Method**: Append video element to document.body (positioned off-screen)
- **Reason**: Some browsers require video in DOM for texture to work
- **Result**: Still not visible in VR

### Attempt 4: WebXR Layers API (Hardware Accelerated)
- **Method**: Use XRMediaBinding.createQuadLayer for hardware rendering
- **Created**: `WebcamXRLayer.tsx` component
- **Issue**: XR Layers API was force-disabled in `xr-layers.ts` (line 38: `return false`)
- **Result**: Re-enabled but causes camera permission issues during VR transition

### Attempt 5: Keep AvatarMirror for Both Modes
- **Method**: Don't switch components - keep camera stream alive during VR transition
- **Reason**: Switching components causes camera permission re-request which fails in VR
- **Current**: This is the active approach
- **Result**: STILL not visible in VR
- **Observation**: Without WebXR `camera-access` the Quest suspends the MediaStream when immersive mode starts, so the mirror never receives new frames

---

## Current Code State

### AvatarMirror.tsx - Key Code Sections

#### Video Element Creation (Lines 72-86)
```tsx
// Create video element and add to DOM (required for VR)
const video = document.createElement('video');
video.srcObject = stream;
video.autoplay = true;
video.playsInline = true;

// Position off-screen (NOT display:none - that breaks textures)
video.style.position = 'absolute';
video.style.left = '-9999px';
video.style.opacity = '0';
video.style.pointerEvents = 'none';

// Add to DOM (required for texture to work in some VR browsers)
document.body.appendChild(video);
videoRef.current = video;
```

#### VideoTexture Material Creation (Lines 100-106)
```tsx
// Create material with VideoTexture (white = no color tint)
const material = new THREE.MeshBasicMaterial({
  map: texture,
  color: 0xffffff, // White = no tint
  side: THREE.DoubleSide,
  toneMapped: false,
});
```

#### VR Session Handling (Lines 192-205)
```tsx
// Force video playback when entering XR mode (WebKit bug workaround)
useEffect(() => {
  const video = videoRef.current;
  if (!video) return;

  if (session) {
    console.log('[AvatarMirror] XR session started - forcing video playback');
    video.play().catch((err) => {
      console.error('[AvatarMirror] Failed to resume video in VR:', err);
    });
  } else {
    console.log('[AvatarMirror] XR session ended');
  }
}, [session]);
```

#### Frame Update Loop (Lines 229-247)
```tsx
useFrame(() => {
  const texture = textureRef.current;
  const video = videoRef.current;

  if (texture && video && video.readyState >= video.HAVE_CURRENT_DATA) {
    texture.needsUpdate = true; // CRITICAL for VR mode

    // In XR mode, also force material update
    if (session && meshRef.current && meshRef.current.material) {
      const mat = meshRef.current.material as THREE.MeshBasicMaterial;
      if (mat.map) {
        mat.map.needsUpdate = true;
        mat.needsUpdate = true; // Force material shader update
      } else {
        console.warn('[AvatarMirror] Material has no texture map in VR!');
      }
    }
  }
});
```

#### Render (Lines 254-274)
```tsx
return (
  <group position={mirrorPosition} rotation={rotation}>
    {/* DEBUG: Bright markers to show mirror position */}
    <mesh position={[0, 0, 0.01]}>
      <sphereGeometry args={[0.2]} />
      <meshBasicMaterial color={0xff0000} />
    </mesh>
    <mesh position={[1, 0, 0.01]}>
      <sphereGeometry args={[0.2]} />
      <meshBasicMaterial color={0x00ff00} />
    </mesh>
    <mesh position={[-1, 0, 0.01]}>
      <sphereGeometry args={[0.2]} />
      <meshBasicMaterial color={0x0000ff} />
    </mesh>

    {/* Video mirror plane - Using VideoTexture material */}
    <mesh ref={meshRef} scale={mirrorScale}>
      <planeGeometry args={[1, 1]} />
      <primitive object={mirrorMaterial} attach="material" />
    </mesh>
  </group>
);
```

---

## What Works vs What Doesn't

### ✅ Works
1. Camera access granted on desktop
2. Video element plays on desktop
3. VideoTexture displays on desktop
4. Debug spheres visible in VR (position is correct)
5. Reference cubes visible in VR (THREE.js rendering works)
6. No JavaScript errors
7. VR session detection (useXR hook works)

### ❌ Doesn't Work
1. VideoTexture not visible in VR headset
2. Video plane not showing (but debug spheres at same position ARE visible)
3. Material with VideoTexture map not rendering in VR

---

## Debugging Steps

### 1. Check Browser Console (in VR)
Connect Quest 2 to computer and run:
```bash
adb logcat | grep chromium
```

Or use Chrome Remote Debugging:
1. Go to `chrome://inspect` on desktop
2. Connect Quest 2 via USB
3. Find "vr.aethervtc.ai" under Remote Target
4. Click "Inspect"

**Look for**:
- `[AvatarMirror] ✅ Webcam started and playing`
- `[AvatarMirror] XR session started - forcing video playback`
- `[AvatarMirror] Material has no texture map in VR!` (warning)
- Any errors related to getUserMedia or VideoTexture

### 2. Check Video Element State
Add to useFrame loop (line 230):
```tsx
console.log('[DEBUG]', {
  videoReady: video?.readyState,
  videoPlaying: !video?.paused,
  textureExists: !!texture,
  materialExists: !!mirrorMaterial,
  materialHasMap: !!(mirrorMaterial?.map),
  inVR: !!session
});
```

### 3. Check Material Attachment
Add after line 273:
```tsx
useEffect(() => {
  if (meshRef.current) {
    console.log('[DEBUG] Mesh material:', meshRef.current.material);
    console.log('[DEBUG] Material map:', (meshRef.current.material as any)?.map);
  }
}, [mirrorMaterial]);
```

### 4. Test with Solid Color
Replace line 273 with solid color to confirm mesh renders:
```tsx
<meshBasicMaterial color={0xff00ff} side={THREE.DoubleSide} />
```
If magenta plane appears in VR → mesh renders, problem is VideoTexture material.

### 5. Check Render Order
Add to mesh (line 271):
```tsx
<mesh ref={meshRef} scale={mirrorScale} renderOrder={999}>
```

---

## Research References

### Working WebXR Video Examples
1. **W3C Immersive Web Samples**: https://github.com/immersive-web/webxr-samples/blob/main/stereo-video.html
2. **THREE.js WebXR Video Layer**: https://threejs.org/examples/webxr_vr_layers.html
3. **VR-cam Player**: https://github.com/VR-cam/WebXR-video-player

### Known Issues
1. **VideoTexture stops updating in VR**: https://discourse.threejs.org/t/video-texture-no-longer-updating-after-entering-webxr-mode/43068
2. **WebKit Video Bug**: https://bugs.webkit.org/show_bug.cgi?id=260259
3. **React Three Fiber XR Video Issue**: https://github.com/pmndrs/xr/issues/214

### Key Findings from Research
- VideoTexture REQUIRES `texture.needsUpdate = true` every frame in VR
- Video element must be in DOM but NOT `display: none`
- Color space must be `THREE.SRGBColorSpace`
- Some browsers pause video when entering VR (need to call `video.play()` again)
- WebXR Layers API is hardware-accelerated alternative but has limited browser support

---

## Potential Solutions to Try

### Solution 1: Force Material Rebuild in VR
When VR session starts, recreate the material entirely:

```tsx
useEffect(() => {
  if (!session || !videoRef.current || !mirrorMaterial) return;

  const video = videoRef.current;
  const texture = new THREE.VideoTexture(video);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.colorSpace = THREE.SRGBColorSpace;

  const newMaterial = new THREE.MeshBasicMaterial({
    map: texture,
    color: 0xffffff,
    side: THREE.DoubleSide,
    toneMapped: false,
  });

  setMirrorMaterial(newMaterial);
  console.log('[AvatarMirror] Material rebuilt for VR session');
}, [session]);
```

### Solution 2: Use useTexture Hook from Drei
Replace manual VideoTexture creation with React Three Fiber's texture system:

```tsx
import { useVideoTexture } from '@react-three/drei';

// Inside component:
const texture = useVideoTexture(videoRef.current?.srcObject);
```

### Solution 3: Manually Set Material in useFrame
Instead of using `<primitive>`, manually update mesh material in useFrame:

```tsx
useFrame(() => {
  if (meshRef.current && mirrorMaterial) {
    meshRef.current.material = mirrorMaterial;
  }
});
```

### Solution 4: Use Data URL Instead of MediaStream
Convert video to data URL and update texture manually:

```tsx
useFrame(() => {
  if (!canvasRef.current || !videoRef.current) return;

  const canvas = canvasRef.current;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(videoRef.current, 0, 0);

  const dataUrl = canvas.toDataURL();
  // Load as regular texture
});
```

### Solution 5: Force WebGL Texture Upload
Manually force texture upload to GPU:

```tsx
useFrame(({ gl }) => {
  if (texture && video && video.readyState >= 2) {
    texture.needsUpdate = true;

    // Force WebGL texture upload
    gl.initTexture(texture);
    gl.setTexture2D(texture, 0);
  }
});
```

### Solution 6: Switch to WebXR Layers API (Hardware Accelerated)
Use the XRMediaBinding approach (already created in `WebcamXRLayer.tsx`):
- Enable XR Layers API (`xr-layers.ts` line 35)
- Use WebcamXRLayer only in VR mode
- Requires re-requesting camera permission in VR (may fail)

### Solution 7: Check if Texture is Being Disposed
Add logging to track texture lifecycle:

```tsx
useEffect(() => {
  const texture = textureRef.current;
  if (!texture) return;

  console.log('[DEBUG] Texture created:', texture.uuid);

  return () => {
    console.log('[DEBUG] Texture disposing:', texture.uuid);
  };
}, [textureRef.current]);
```

---

## Testing Checklist

When testing any solution:

- [ ] Refresh page and grant camera permission
- [ ] Confirm video shows on desktop
- [ ] Enter VR mode
- [ ] Check for 3 debug spheres (red/green/blue) in VR
- [ ] Check browser console for errors/warnings
- [ ] Test with solid color material (magenta test)
- [ ] Check if video element is still playing in VR
- [ ] Verify texture.needsUpdate is being called
- [ ] Check material.map exists
- [ ] Test on multiple Quest 2 devices if possible

---

## Environment Setup

### Local Development
```bash
cd /Users/thefortob/Development/00-PRODUCTION/aether-vr-platform
npm install
npm run dev
# Opens at localhost:5173
```

### Deploy to Vercel
```bash
git add -A
git commit -m "Description of changes"
git push origin master
# Vercel auto-deploys to vr.aethervtc.ai
```

### Remote Debugging Quest 2
1. Enable Developer Mode on Quest 2
2. Connect via USB-C
3. Run: `adb devices` to verify connection
4. Chrome → `chrome://inspect` → Find vr.aethervtc.ai
5. Click Inspect to open DevTools

---

## Questions to Answer

1. **Does the video element continue playing in VR?**
   - Check `video.paused` and `video.readyState` in console

2. **Is the texture being updated?**
   - Log `texture.needsUpdate` calls
   - Check if `useFrame` is being called in VR

3. **Is the material attached to the mesh?**
   - Log `meshRef.current.material` in VR session

4. **Is the mesh being rendered at all?**
   - Test with solid color material

5. **Is this a React Three Fiber XR mode issue?**
   - Compare with vanilla THREE.js WebXR example

6. **Is the position correct?**
   - Debug spheres are visible, so position is fine

7. **Is the scale too small/large?**
   - Current: `[2.5, 3, 1]` (2.5m wide x 3m tall) - should be huge

8. **Is there a render order issue?**
   - Try different renderOrder values

---

## Next Steps

1. **Immediate**: Add detailed logging to understand current state in VR
2. **Test**: Solid color material to confirm mesh renders
3. **Try**: Solution 1 (rebuild material on VR session start)
4. **Research**: Compare with working W3C WebXR video example
5. **Fallback**: Use WebXR Layers API if VideoTexture fundamentally broken

---

## Contact & Resources

- **Repository**: github.com/thefortaiagency/aether-vr-platform
- **Deployment**: vr.aethervtc.ai
- **Research Doc**: `/WEBXR-VIDEO-RESEARCH.md` (comprehensive solutions research)
- **Working Components**: `VideoXRLayer.tsx`, `BackgroundXRLayer.tsx` (XR Layers API examples)

---

## Current Hypothesis

The most likely issue is that **VideoTexture material is not being properly attached or updated in WebXR rendering mode**, even though:
- The mesh exists and renders (debug spheres prove this)
- The texture is being updated every frame
- The material has the texture map
- The video is playing

**Possible causes**:
1. React Three Fiber's material attachment via `<primitive>` may not work correctly in XR mode
2. WebXR rendering path might bypass or invalidate the VideoTexture
3. Texture upload to GPU might be failing silently in VR
4. Material shader compilation might differ in XR stereo rendering

**Recommended first test**: Replace `<primitive object={mirrorMaterial} attach="material" />` with manual material assignment in useFrame loop.
