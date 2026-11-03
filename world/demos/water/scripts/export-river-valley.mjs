import { cp, mkdir, mkdtemp, rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const directory = dirname(fileURLToPath(import.meta.url));
const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i < 0 ? fallback : process.argv[i + 1];
};
const sourceProject = arg("--source-project", undefined);
if (!sourceProject) throw new Error("--source-project must point to the external Unity project");
const source = resolve(sourceProject);
const output = resolve(arg("--output", join(directory, "../assets/valley")));
const editor = arg("--unity-editor", "/Applications/Unity/Hub/Editor/2021.3.45f1/Unity.app/Contents/MacOS/Unity");
const scratch = await mkdtemp(join(tmpdir(), "river-valley-export-"));
const raw = join(scratch, "Export");
const references = arg("--reference-output", undefined);
const run = (command, args) =>
  new Promise((yes, no) => {
    const child = spawn(command, args, { stdio: "inherit" });
    child.on("error", no);
    child.on("exit", (code) =>
      code === 0 ? yes() : no(new Error(`${command} exited ${code}; temporary project: ${scratch}`))
    );
  });
try {
  await Promise.all(
    ["Assets", "Packages", "ProjectSettings"].map((p) => cp(join(source, p), join(scratch, p), { recursive: true }))
  );
  await mkdir(join(scratch, "Assets/Editor"), { recursive: true });
  await cp(join(directory, "unity/RiverValleyExporter.cs"), join(scratch, "Assets/Editor/RiverValleyExporter.cs"));
  console.log(`Export project: ${scratch}`);
  await run(editor, [
    "-batchmode",
    "-nographics",
    "-projectPath",
    scratch,
    "-executeMethod",
    "RiverValleyExporter.Export",
    "-valleyOutput",
    raw,
    "-logFile",
    join(scratch, "export.log")
  ]);
  await run("python3", [join(directory, "pack-river-valley.py"), "--raw", raw, "--source", source, "--output", output]);
  if (references) {
    await cp(
      join(directory, "unity/RiverValleyReferenceCapture.cs"),
      join(scratch, "Assets/Editor/RiverValleyReferenceCapture.cs")
    );
    await run(editor, [
      "-batchmode",
      "-projectPath",
      scratch,
      "-executeMethod",
      "RiverValleyReferenceCapture.Capture",
      "-valleyOutput",
      resolve(references),
      "-logFile",
      join(scratch, "reference.log")
    ]);
  }
  console.log(`River valley assets: ${output}`);
  if (!process.argv.includes("--keep-project")) await rm(scratch, { recursive: true, force: true });
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
