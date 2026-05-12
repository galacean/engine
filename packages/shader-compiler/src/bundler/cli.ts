import { parseArgs } from "node:util";
import { precompile } from "./precompile";

/**
 * Entry point for the `shader-compiler-precompile` bin.
 *
 * Usage:
 *   shader-compiler-precompile <input-dir> <output-dir>
 *     [--clean] [--watch] [--only <file>] [--emit-index] [--emit-sources]
 */
async function main(): Promise<void> {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      clean: { type: "boolean" },
      watch: { type: "boolean" },
      only: { type: "string" },
      "emit-index": { type: "boolean" },
      "emit-sources": { type: "boolean" }
    }
  });

  const [input, output] = positionals;
  if (!input || !output) {
    console.error(
      "Usage: shader-compiler-precompile <input-dir> <output-dir> [--clean] [--watch] [--only <file>] [--emit-index] [--emit-sources]"
    );
    process.exit(1);
  }

  await precompile({
    input,
    output,
    clean: values.clean,
    watch: values.watch,
    only: values.only,
    emitIndex: values["emit-index"],
    emitSources: values["emit-sources"]
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
