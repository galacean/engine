export interface CameraDepthTextureTarget {
  depthTextureMode: number;
}

export interface CameraDepthTexturePrePassLease {
  readonly consumerId: string;
  readonly active: boolean;
  destroy(): void;
}

interface CameraDepthTexturePrePassState {
  readonly baseline: number;
  readonly prePassMode: number;
  readonly consumers: Map<number, string>;
}

const states = new WeakMap<CameraDepthTextureTarget, CameraDepthTexturePrePassState>();
let nextLeaseId = 1;

/**
 * Acquires a shared depth-prepass requirement for a Camera-like target.
 *
 * The first consumer captures the caller-owned baseline, every active consumer keeps PrePass enabled,
 * and the final release restores that baseline without allowing one consumer to disable another.
 */
export function acquireCameraDepthTexturePrePass(
  target: CameraDepthTextureTarget,
  prePassMode: number,
  consumerId: string
): CameraDepthTexturePrePassLease {
  let state = states.get(target);
  if (!state) {
    state = {
      baseline: target.depthTextureMode,
      prePassMode,
      consumers: new Map<number, string>()
    };
    states.set(target, state);
  } else if (state.prePassMode !== prePassMode) {
    throw new Error("Camera depth-texture consumers must agree on the PrePass mode value.");
  }

  const leaseId = nextLeaseId++;
  state.consumers.set(leaseId, consumerId);
  target.depthTextureMode = prePassMode;

  let active = true;
  return Object.freeze({
    consumerId,
    get active() {
      return active;
    },
    destroy: () => {
      if (!active) return;
      active = false;
      const currentState = states.get(target);
      if (currentState !== state || !state.consumers.delete(leaseId)) return;

      if (state.consumers.size > 0) {
        target.depthTextureMode = state.prePassMode;
        return;
      }
      if (target.depthTextureMode === state.prePassMode) {
        target.depthTextureMode = state.baseline;
      }
      states.delete(target);
    }
  });
}
