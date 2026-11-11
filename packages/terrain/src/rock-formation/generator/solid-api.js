import initialize from "manifold-3d";
import wasm from "manifold-3d/manifold.wasm?url";
let ready;
/** WASM is fetched/initialized only when a worker actually needs a solid operation. */
export function loadSolidAPI() {
  return (ready ??= initialize({ locateFile: () => wasm }).then((api) => {
    api.setup();
    return api;
  }));
}
