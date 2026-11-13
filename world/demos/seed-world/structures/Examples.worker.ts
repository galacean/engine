import { generateStructureExamples } from "@galacean/engine-terrain/rock-ridge/features/arrangement/growth/diversity.mjs";
self.onmessage = ({ data }) => {
  try {
    self.postMessage({ id: data.id, result: generateStructureExamples(data.seed) });
  } catch (error) {
    self.postMessage({ id: data.id, error: String(error) });
  }
};
