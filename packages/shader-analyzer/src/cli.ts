import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import type { IncludeMap } from "@galacean/engine-shader-parser/internal/analyzer";
import { ShaderAnalyzer } from "./ShaderAnalyzer";
import { DiagnosticSeverity, formatDiagnostic } from "./Diagnostic";

interface CliOptions {
  file: string;
  includeRoot?: string;
  json: boolean;
  help: boolean;
}

const USAGE = "Usage: galacean-shader-analyzer [--json] [--include-root directory] [file|-]";

try {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(USAGE);
  } else {
    run(options);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  console.error(USAGE);
  process.exitCode = 2;
}

function run(options: CliOptions): void {
  const source = readFileSync(options.file === "-" ? 0 : options.file, "utf8");
  const includeRoot = options.includeRoot ? resolve(options.includeRoot) : undefined;
  const includeMap = includeRoot ? readIncludeMap(includeRoot) : undefined;
  const basePathForIncludeKey =
    includeRoot && options.file !== "-" ? sourceBasePath(options.file, includeRoot) : undefined;
  const diagnostics = new ShaderAnalyzer().analyze(source, {
    file: options.file,
    includeMap,
    basePathForIncludeKey
  }).diagnostics;

  if (options.json) {
    console.log(JSON.stringify({ file: options.file, diagnostics }, null, 2));
  } else {
    for (const diagnostic of diagnostics) {
      const { line, column } = diagnostic.range.start;
      console.log(
        `${diagnostic.file ?? options.file}:${line}:${column} ${diagnostic.severity} ${formatDiagnostic(diagnostic)}`
      );
    }
  }
  if (diagnostics.some((diagnostic) => diagnostic.severity === DiagnosticSeverity.Error)) process.exitCode = 1;
}

function parseArgs(args: string[]): CliOptions {
  let file = "-";
  let includeRoot: string | undefined;
  let json = false;
  let help = false;
  let hasFile = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--json") {
      json = true;
    } else if (arg === "--include-root") {
      includeRoot = args[++i];
      if (!includeRoot) throw new Error("--include-root requires a directory.");
    } else if (arg === "--help" || arg === "-h") {
      help = true;
    } else if (arg.startsWith("-") && arg !== "-") {
      throw new Error(`Unknown option '${arg}'.`);
    } else if (hasFile) {
      throw new Error("Only one shader file may be analyzed at a time.");
    } else {
      file = arg;
      hasFile = true;
    }
  }
  return { file, includeRoot, json, help };
}

function readIncludeMap(root: string): IncludeMap {
  const includeMap: Record<string, string> = {};
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory() && entry.name !== ".git" && entry.name !== "node_modules") visit(path);
      else if (entry.isFile()) includeMap[toIncludeKey(relative(root, path))] = readFileSync(path, "utf8");
    }
  };
  visit(root);
  return includeMap;
}

function sourceBasePath(file: string, includeRoot: string): string | undefined {
  const sourceDirectory = dirname(resolve(file));
  const relativeDirectory = relative(includeRoot, sourceDirectory);
  if (relativeDirectory.startsWith("..")) return undefined;
  const suffix = relativeDirectory ? `${toIncludeKey(relativeDirectory)}/` : "";
  return `shaders://root/${suffix}`;
}

function toIncludeKey(path: string): string {
  return sep === "/" ? path : path.split(sep).join("/");
}
