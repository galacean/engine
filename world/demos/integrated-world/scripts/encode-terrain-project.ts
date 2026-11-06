import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  packTerrainProjectCompression,
  parseTerrainProjectCompressionProfile
} from "./compression/TerrainProjectCompressionPacker.ts";

interface CliArgs {
  project: string;
  profile: string;
  manifest?: string;
}

const args = parseArgs(process.argv.slice(2).filter((value) => value !== "--"));
const projectPath = resolve(args.project);
const profile = parseTerrainProjectCompressionProfile(JSON.parse(readFileSync(resolve(args.profile), "utf8")));
const summary = await packTerrainProjectCompression({
  projectPath,
  profile,
  manifestPath: resolve(args.manifest ?? resolve(dirname(projectPath), "brotli-manifest.json"))
});
console.log(JSON.stringify(summary, null, 2));

function parseArgs(values: string[]): CliArgs {
  const parsed: Partial<CliArgs> = {};
  for (let index = 0; index < values.length; index += 2) {
    const key = values[index];
    const value = values[index + 1];
    if (!value) throw new Error(`Missing value for ${key}`);
    if (key === "--project") parsed.project = value;
    else if (key === "--profile") parsed.profile = value;
    else if (key === "--manifest") parsed.manifest = value;
    else throw new Error(`Unknown argument ${key}`);
  }
  if (!parsed.project || !parsed.profile) {
    throw new Error(
      "Usage: encode-terrain-project --project <project.json> --profile <compression-profile.json> [--manifest <report.json>]"
    );
  }
  return parsed as CliArgs;
}
