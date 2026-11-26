export function createHeightfieldWaterCompileWorker(): Worker {
  return new Worker(new URL("../../compiler/heightfield/HeightfieldWaterCompileWorker.ts", import.meta.url), {
    type: "module"
  });
}
