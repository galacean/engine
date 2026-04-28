import { parseArgs } from "node:util";
import { precompile } from "./precompile";

/**
 * Entry point for the `shaderlab-precompile` bin.
 *
 * Usage:
 *   shaderlab-precompile <input-dir> <output-dir> [--clean] [--watch] [--only <file>] [--emit-index]
 */
async function main(): Promise<void> {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      clean: { type: "boolean" },
      watch: { type: "boolean" },
      only: { type: "string" },
      "emit-index": { type: "boolean" }
    }
  });

  const [input, output] = positionals;
  if (!input || !output) {
    console.error(
      "Usage: shaderlab-precompile <input-dir> <output-dir> [--clean] [--watch] [--only <file>] [--emit-index]"
    );
    process.exit(1);
  }

  await precompile({
    input,
    output,
    clean: values.clean,
    watch: values.watch,
    only: values.only,
    emitIndex: values["emit-index"]
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
