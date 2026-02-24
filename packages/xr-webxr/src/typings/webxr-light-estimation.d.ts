export {};

declare global {
  interface XRLightProbe extends EventTarget {
    addEventListener(type: "reflectionchange", listener: EventListenerOrEventListenerObject): void;
    removeEventListener(type: "reflectionchange", listener: EventListenerOrEventListenerObject): void;
  }

  interface XRLightEstimate {
    readonly sphericalHarmonicsCoefficients?: Float32Array;
    readonly primaryLightDirection?: DOMPointReadOnly;
    readonly primaryLightIntensity?: DOMPointReadOnly;
  }

  interface XRLightProbeInit {
    reflectionFormat?: string;
  }

  interface XRSession {
    readonly preferredReflectionFormat?: string;
    requestLightProbe(options?: XRLightProbeInit): Promise<XRLightProbe>;
  }

  interface XRFrame {
    getLightEstimate(lightProbe: XRLightProbe): XRLightEstimate | null;
  }

  interface XRWebGLBinding {
    getReflectionCubeMap(lightProbe: XRLightProbe): WebGLTexture | null;
  }
}
