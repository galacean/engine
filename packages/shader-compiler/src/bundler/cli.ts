import { parseArgs } from "node:util";
import { precompile } from "./precompile";

/**
 * Entry point for the `shader-compiler-precompile` bin.
 *
 * Usage:
 *   shader-compiler-precompile <input-dir> <output-dir>
 *     [--target gles300|wgsl] [--clean] [--watch] [--only <file>] [--emit-index] [--emit-sources]
 */
function main(): Promise<void> {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      clean: { type: "boolean" },
      watch: { type: "boolean" },
      only: { type: "string" },
      "emit-index": { type: "boolean" },
      target: { type: "string" },
      "emit-sources": { type: "boolean" }
    }
  });

  const [input, output] = positionals;
  if (!input || !output) {
    console.error(
      "Usage: shader-compiler-precompile <input-dir> <output-dir> [--target gles300|wgsl] [--clean] [--watch] [--only <file>] [--emit-index] [--emit-sources]"
    );
    process.exit(1);
  }

  if (values.target && values.target !== "wgsl" && values.target !== "gles300")
    throw new Error("Unknown shader target " + values.target);
  return precompile({
    input,
    platformTarget: values.target === "wgsl" ? 1 : 0,
    output,
    clean: values.clean,
    watch: values.watch,
    only: values.only,
    emitIndex: values["emit-index"],
    emitSources: values["emit-sources"]
  });
}

Promise.resolve()
  .then(main)
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
