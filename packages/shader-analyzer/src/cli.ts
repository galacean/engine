import { lstatSync, readFileSync } from "node:fs";
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
const HELP = `${USAGE}

Options:
  --json                    Print machine-readable diagnostics.
  --include-root directory  Resolve shader includes below this directory.
  -h, --help                Show this help.

Input:
  file                      Analyze one ShaderLab file.
  - or omitted              Read ShaderLab source from stdin.

Exit codes:
  0  No error diagnostics (warnings may be present).
  1  At least one error diagnostic.
  2  Invalid command-line usage.

Examples:
  galacean-shader-analyzer Assets/Shaders/PBR.shader
  galacean-shader-analyzer --json --include-root Assets/Shaders Assets/Shaders/PBR.shader
  galacean-shader-analyzer --json -`;

try {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(HELP);
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
  const includeRoot = options.includeRoot
    ? resolve(options.includeRoot)
    : options.file === "-"
      ? undefined
      : dirname(resolve(options.file));
  const includeMap = includeRoot ? createLazyIncludeMap(includeRoot) : undefined;
  const sourceFile = includeRoot && options.file !== "-" ? sourceFilePath(options.file, includeRoot) : undefined;
  const diagnostics = ShaderAnalyzer.analyze(source, {
    sourceFile,
    includeMap
  }).diagnostics;

  if (options.json) {
    console.log(JSON.stringify({ file: options.file, diagnostics }, null, 2));
  } else {
    for (const diagnostic of diagnostics) {
      const { line, column } = diagnostic.range.start;
      console.log(
        `${diagnostic.sourceFile ?? options.file}:${line}:${column} ${diagnostic.severity} ${formatDiagnostic(diagnostic)}`
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

function createLazyIncludeMap(root: string): IncludeMap {
  const cache = Object.create(null) as Record<string, string | undefined>;
  return new Proxy(cache, {
    get(target, includeName): string | undefined {
      if (typeof includeName !== "string") return undefined;
      if (Object.prototype.hasOwnProperty.call(target, includeName)) return target[includeName];

      let path = root;
      try {
        let stats: ReturnType<typeof lstatSync> | undefined;
        for (const segment of includeName.split("/")) {
          path = join(path, segment);
          stats = lstatSync(path);
          if (stats.isSymbolicLink()) {
            target[includeName] = undefined;
            return undefined;
          }
        }
        const source = stats?.isFile() ? readFileSync(path, "utf8") : undefined;
        target[includeName] = source;
        return source;
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code !== "ENOENT" && code !== "ENOTDIR") throw error;
        target[includeName] = undefined;
        return undefined;
      }
    }
  });
}

function sourceFilePath(file: string, includeRoot: string): string {
  const sourceFile = relative(includeRoot, resolve(file));
  if (sourceFile === ".." || sourceFile.startsWith(`..${sep}`)) {
    throw new Error(`Shader file must be inside the include root '${includeRoot}'.`);
  }
  return toIncludeKey(sourceFile);
}

function toIncludeKey(path: string): string {
  return sep === "/" ? path : path.split(sep).join("/");
}
