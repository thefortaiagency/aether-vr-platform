const CAMERA_ACCESS_FEATURE = 'camera-access';
const PATCH_FLAG = '__aether_xr_camera_access_patched__';

type XRSystemWithPatch = XRSystem & {
  [PATCH_FLAG]?: boolean;
  offerSession?: (mode: XRSessionMode, init?: XRSessionInit) => Promise<XRSession>;
};

type MutableSessionInit = XRSessionInit & {
  optionalFeatures?: string[];
  requiredFeatures?: string[];
};

function normalizeSessionInit(init?: XRSessionInit): MutableSessionInit {
  const base: MutableSessionInit = init ? { ...init } : { requiredFeatures: ['local-floor'], optionalFeatures: [] };

  const optional = new Set(base.optionalFeatures ?? []);
  optional.add(CAMERA_ACCESS_FEATURE);
  base.optionalFeatures = Array.from(optional);

  const required = base.requiredFeatures ? Array.from(base.requiredFeatures) : [];
  if (required.length === 0) {
    required.push('local-floor');
  } else if (!required.includes('local-floor')) {
    required.push('local-floor');
  }
  base.requiredFeatures = required;

  return base;
}

function wrapSessionMethod<K extends 'requestSession' | 'offerSession'>(xr: XRSystemWithPatch, method: K) {
  const original = xr[method];
  if (typeof original !== 'function') return;

  xr[method] = (async function patchedSessionRequest(this: XRSystem, mode: XRSessionMode, init?: XRSessionInit) {
    const patchedInit = normalizeSessionInit(init);
    return original.call(this, mode, patchedInit);
  }) as XRSystem[K];

  console.log(`[WebXR] Patched navigator.xr.${method} to enforce "${CAMERA_ACCESS_FEATURE}" feature`);
}

export function ensureCameraAccessFeature() {
  if (typeof navigator === 'undefined' || typeof window === 'undefined') {
    return;
  }

  const xr = navigator.xr as XRSystemWithPatch | undefined;
  if (!xr) {
    console.warn('[WebXR] navigator.xr is not available – camera-access feature cannot be enforced');
    return;
  }

  if (xr[PATCH_FLAG]) {
    return;
  }

  wrapSessionMethod(xr, 'requestSession');
  wrapSessionMethod(xr, 'offerSession');

  xr[PATCH_FLAG] = true;
}
