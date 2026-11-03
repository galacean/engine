import motion from "../../assets/sowing/sowing-motion.json";

export const SOWING_MOTION = Object.freeze({
  duration: motion.duration,
  settledAt: motion.settledAt,
  sinkAt: motion.sinkAt,
  seedDelay: 0.028
});

/** Sample the baked Blender clip. Animation time never advances the farming simulation. */
export function sampleSowingMotion(seconds: number, seedIndex = 0) {
  const time = Math.max(0, seconds - seedIndex * SOWING_MOTION.seedDelay);
  const index = Math.min(motion.frames.length - 1, time * motion.fps);
  const first = motion.frames[Math.floor(index)];
  const second = motion.frames[Math.min(motion.frames.length - 1, Math.floor(index) + 1)];
  const alpha = index % 1;
  return {
    position: first.position.map((v, i) => v + (second.position[i] - v) * alpha) as [number, number, number],
    scale: Math.max(0, Math.min(1, first.scale + (second.scale - first.scale) * alpha)),
    visible: time > 0 && time < motion.duration,
    phase: time < motion.settledAt ? "falling" : time < motion.sinkAt ? "resting" : "sinking"
  };
}

export function sowingSeedVariant(cropId: string): "small" | "grain" | "pumpkin" {
  if (["pumpkin", "melon", "watermelon"].includes(cropId)) return "pumpkin";
  return cropId === "wheat" || cropId === "rice" ? "grain" : "small";
}
