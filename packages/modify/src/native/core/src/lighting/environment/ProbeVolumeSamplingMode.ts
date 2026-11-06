/** Runtime quality level used to sample diffuse probe lighting. */
export enum ProbeVolumeSamplingMode {
  /** Sample one SH value per renderer on CPU. Intended for low-end mobile devices. */
  PerRenderer,
  /** Sample probes per vertex and interpolate irradiance across the primitive. */
  PerVertex,
  /** Sample probes per fragment. Highest quality and texture bandwidth cost. */
  PerFragment
}
