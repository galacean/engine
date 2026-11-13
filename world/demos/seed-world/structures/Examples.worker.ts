import { generateMountainExamples } from "@galacean/engine-terrain/rock-ridge/features/arrangement/mountain-examples.mjs";
self.onmessage = ({ data }) => {
  try {
    self.postMessage({ id: data.id, result: generateMountainExamples(data.seed) });
  } catch (error) {
    self.postMessage({ id: data.id, error: String(error) });
  }
};
