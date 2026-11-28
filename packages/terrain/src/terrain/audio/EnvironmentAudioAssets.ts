// Prepared from the approved-source manifest; URLs are bundled by Vite.
export const ENVIRONMENT_AUDIO_ASSETS = {
  "horse-hoof": {
    url: "https://mdn.alipayobjects.com/rms/afts/file/A*EjTKSZSvXXUAAAAAQMAAAAgAehQnAQ/horse-hoof.mp3",
    loop: false,
    gain: 1.0
  },
  "horse-mount": {
    url: "https://mdn.alipayobjects.com/rms/afts/file/A*qCBYS6EifPMAAAAAQwAAAAgAehQnAQ/horse-mount.mp3",
    loop: false,
    gain: 1.0
  },
  "horse-dismount": {
    url: "https://mdn.alipayobjects.com/rms/afts/file/A*JmrKRrO-tsMAAAAAQwAAAAgAehQnAQ/horse-dismount.mp3",
    loop: false,
    gain: 1.0
  },
  "horse-neigh": {
    url: "https://mdn.alipayobjects.com/rms/afts/file/A*WAYlR7dSSzYAAAAAQwAAAAgAehQnAQ/horse-neigh.mp3",
    loop: false,
    gain: 1.0
  },

  leaves: { url: new URL("../../integration/assets/audio/leaves.wav", import.meta.url).href, loop: true, gain: 1.0 },
  "step-grass-1": {
    url: new URL("../../integration/assets/audio/step-grass-1.wav", import.meta.url).href,
    loop: false,
    gain: 1.0
  },
  "step-grass-2": {
    url: new URL("../../integration/assets/audio/step-grass-2.wav", import.meta.url).href,
    loop: false,
    gain: 1.0
  },
  "step-grass-3": {
    url: new URL("../../integration/assets/audio/step-grass-3.wav", import.meta.url).href,
    loop: false,
    gain: 1.0
  },
  "step-grass-4": {
    url: new URL("../../integration/assets/audio/step-grass-4.wav", import.meta.url).href,
    loop: false,
    gain: 1.0
  },
  "step-dirt-1": {
    url: new URL("../../integration/assets/audio/step-dirt-1.wav", import.meta.url).href,
    loop: false,
    gain: 1.0
  },
  "step-dirt-2": {
    url: new URL("../../integration/assets/audio/step-dirt-2.wav", import.meta.url).href,
    loop: false,
    gain: 1.0
  },
  "step-dirt-3": {
    url: new URL("../../integration/assets/audio/step-dirt-3.wav", import.meta.url).href,
    loop: false,
    gain: 1.0
  },
  "step-dirt-4": {
    url: new URL("../../integration/assets/audio/step-dirt-4.wav", import.meta.url).href,
    loop: false,
    gain: 1.0
  },
  "step-water-1": {
    url: new URL("../../integration/assets/audio/step-water-1.wav", import.meta.url).href,
    loop: false,
    gain: 1.0
  },
  "step-water-2": {
    url: new URL("../../integration/assets/audio/step-water-2.wav", import.meta.url).href,
    loop: false,
    gain: 1.0
  },
  "step-water-3": {
    url: new URL("../../integration/assets/audio/step-water-3.wav", import.meta.url).href,
    loop: false,
    gain: 1.0
  },
  "step-water-4": {
    url: new URL("../../integration/assets/audio/step-water-4.wav", import.meta.url).href,
    loop: false,
    gain: 1.0
  },
  wind: { url: new URL("../../integration/assets/audio/wind.wav", import.meta.url).href, loop: true, gain: 1.0 },
  gust: { url: new URL("../../integration/assets/audio/gust.wav", import.meta.url).href, loop: true, gain: 1.0 },
  grass: {
    url: new URL("../../integration/assets/audio/grass.wav", import.meta.url).href,
    loop: true,
    gain: 14.931284905
  },
  shrub: { url: new URL("../../integration/assets/audio/shrub.wav", import.meta.url).href, loop: true, gain: 1.0 },
  stream: { url: new URL("../../integration/assets/audio/stream.wav", import.meta.url).href, loop: true, gain: 1.0 },
  lake: { url: new URL("../../integration/assets/audio/lake.wav", import.meta.url).href, loop: true, gain: 1.0 },
  "rain-light": {
    url: new URL("../../integration/assets/audio/rain-light.wav", import.meta.url).href,
    loop: true,
    gain: 1.0
  },
  "rain-heavy": {
    url: new URL("../../integration/assets/audio/rain-heavy.wav", import.meta.url).href,
    loop: true,
    gain: 1.0
  },
  "thunder-near": {
    url: new URL("../../integration/assets/audio/thunder-near.wav", import.meta.url).href,
    loop: false,
    gain: 1.0
  },
  "thunder-far": {
    url: new URL("../../integration/assets/audio/thunder-far.wav", import.meta.url).href,
    loop: false,
    gain: 1.0
  },
  ocean: { url: new URL("../../integration/assets/audio/ocean.wav", import.meta.url).href, loop: true, gain: 1.0 },
  "step-snow-1": {
    url: new URL("../../integration/assets/audio/step-snow-1.wav", import.meta.url).href,
    loop: false,
    gain: 1.0
  },
  "step-snow-2": {
    url: new URL("../../integration/assets/audio/step-snow-2.wav", import.meta.url).href,
    loop: false,
    gain: 1.0
  },
  "step-snow-3": {
    url: new URL("../../integration/assets/audio/step-snow-3.wav", import.meta.url).href,
    loop: false,
    gain: 1.0
  },
  "step-snow-4": {
    url: new URL("../../integration/assets/audio/step-snow-4.wav", import.meta.url).href,
    loop: false,
    gain: 1.0
  }
} as const;
export type EnvironmentAudioClip = keyof typeof ENVIRONMENT_AUDIO_ASSETS;

// Mix trims for quiet vegetation bodies. Keep the approved files and decode calibration unchanged.
export const ENVIRONMENT_AUDIO_MIX_TRIM_DB: Readonly<Partial<Record<EnvironmentAudioClip, number>>> = {
  leaves: 8,
  grass: 8,
  shrub: 14
};
