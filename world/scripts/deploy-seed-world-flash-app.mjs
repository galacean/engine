import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const registryScript = fileURLToPath(new URL("./seed-world-flash-registry.py", import.meta.url));

export function callFlashRegistry(asapPython, asapServiceDir, request) {
  const child = spawnSync(asapPython, [registryScript, asapServiceDir], {
    cwd: asapServiceDir,
    input: JSON.stringify(request),
    encoding: "utf8",
    timeout: 30000
  });
  const prefix = "SEED_WORLD_REGISTRY ";
  const resultLine = child.stdout?.split("\n").findLast((line) => line.startsWith(prefix));
  if (child.status !== 0 || !resultLine) {
    throw new Error(`ASAP registry ${request.operation} failed (${child.error?.code || child.status})`);
  }
  const result = JSON.parse(resultLine.slice(prefix.length));
  if (result.error) throw new Error(`ASAP registry ${request.operation}: ${result.error}`);
  return result;
}

function pack(source, archive) {
  const result = spawnSync("tar", ["-czf", archive, "-C", source, "--", ...readdirSync(source)], {
    encoding: "utf8",
    env: { ...process.env, COPYFILE_DISABLE: "1" }
  });
  if (result.status !== 0) throw new Error(`Could not pack ${source}: ${result.stderr || result.error?.message}`);
}

export function deploySeedWorldFlashApp(item, version, { callAsap, appKey, timeout }) {
  const staging = mkdtempSync(join(tmpdir(), `seed-world-${item.artifactId}-${version}-`));
  try {
    const dist = join(staging, "dist");
    cpSync(item.projectDir, dist, { recursive: true });
    const entry = join(dist, "index.html");
    const html = readFileSync(entry, "utf8");
    if (!html.includes("</head>")) throw new Error("Flash App index.html requires a closing head tag");
    const script = `<script>window.artifactId = ${JSON.stringify(item.artifactId)}; window.artifactVersion = ${JSON.stringify(version)};</script>`;
    writeFileSync(entry, html.replace("</head>", () => script + "</head>"));

    const backup = `backup_${version}.tar.gz`;
    const release = `release_v1.0.0_${Date.now()}.tar.gz`;
    const prefix = `leopard/sandbox/workspace/${item.artifactId}-${version}`;
    const upload = (archive) => callAsap({
      operation: "upload", local_file: join(staging, archive), object_name: `${prefix}/${archive}`
    });

    pack(item.sourceDir, join(staging, backup));
    pack(dist, join(staging, release));
    upload(backup);
    upload(release);
    const output = callAsap({
      operation: "deploy", object_name: `${prefix}/${release}`, app_key: appKey, timeout
    });
    if (!output?.entry_url) throw new Error("ASAP deployment did not return an Entry URL");
    return { entryUrl: output.entry_url, backupOss: `${prefix}/${backup}` };
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}
