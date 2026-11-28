export function createRiverCompileWorker(): Worker {
  return new Worker(new URL("../../compiler/river/RiverCompileWorker.ts", import.meta.url), {
    type: "module"
  });
}
