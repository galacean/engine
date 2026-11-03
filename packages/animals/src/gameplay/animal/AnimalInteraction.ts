/** Metre/second gameplay settings shared by authoring, runtime and deterministic fixtures. */
export interface AnimalInteractionConfig {
  approachDistance: number;
  approachSpeed: number;
  approachCooldown: number;
  clickDistance: number;
  biteDistance: number;
  minimumCropMaturity: number;
  feedingSeconds: number;
  feedingReachHeightRatio: number;
}

/** Defaults keep player threats local and each continuous bite observable. */
export const DEFAULT_ANIMAL_INTERACTION: Readonly<AnimalInteractionConfig> = Object.freeze({
  approachDistance: 3,
  approachSpeed: 1.8,
  approachCooldown: 5,
  clickDistance: 5,
  biteDistance: 1.5,
  minimumCropMaturity: 0,
  feedingSeconds: 10,
  feedingReachHeightRatio: 1
});

/** Resolve sparse saved settings; zero explicitly disables an interaction distance. */
export function animalInteractionConfig(input?: Partial<AnimalInteractionConfig>): AnimalInteractionConfig {
  const config = { ...DEFAULT_ANIMAL_INTERACTION, ...input };
  for (const [key, value] of Object.entries(config))
    if (
      !Number.isFinite(value) ||
      value < 0 ||
      (key === "minimumCropMaturity" && value > 1) ||
      (["feedingSeconds", "feedingReachHeightRatio"].includes(key) && value === 0)
    )
      throw new Error(`Invalid animal interaction setting: ${key}`);
  return config;
}

/** Check closing velocity rather than camera speed, so passing or departing people do not frighten animals. */
export function isAnimalApproach(
  animal: Readonly<{ x: number; z: number }>,
  player: Readonly<{ x: number; z: number }>,
  previous: Readonly<{ x: number; z: number }>,
  seconds: number,
  config: AnimalInteractionConfig
): boolean {
  if (!(seconds > 0) || config.approachDistance === 0) return false;
  const dx = animal.x - player.x,
    dz = animal.z - player.z;
  const distance = Math.hypot(dx, dz);
  const vx = player.x - previous.x,
    vz = player.z - previous.z;
  // A camera teleport is not an approaching character.
  if (distance > config.approachDistance || Math.hypot(vx, vz) > config.approachDistance * 2) return false;
  return distance > 0 && (vx * dx + vz * dz) / (distance * seconds) >= config.approachSpeed;
}
