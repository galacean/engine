/** Shared by attachment storage and the photo dock. Change maxPhotos to 3 or 4 as needed. */
export const SEED_WORLD_PHOTO_CONFIG = {
  maxPhotos: 2,
  backdropOpacity: 0.7,
  tapSlop: 7,
  removeDistance: 116,
  returnDistance: 92,
  dragMinOpacity: 0.35,
  discardDuration: 460,
  tiltDegrees: [-3, 2.5, -1.5, 3.5]
} as const;
