export {};

declare global {
  interface XRLightProbe extends EventTarget {}

  interface XRLightEstimate {
    readonly sphericalHarmonicsCoefficients?: Float32Array;
    readonly primaryLightDirection?: DOMPointReadOnly;
    readonly primaryLightIntensity?: DOMPointReadOnly;
  }

  interface XRLightProbeInit {
    reflectionFormat?: string;
  }

  interface XRSession {
    requestLightProbe(options?: XRLightProbeInit): Promise<XRLightProbe>;
  }

  interface XRFrame {
    getLightEstimate(lightProbe: XRLightProbe): XRLightEstimate | null;
  }
}
