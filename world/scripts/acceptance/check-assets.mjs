import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
const root = path.resolve(import.meta.dirname, "../../..");
const mapping = JSON.parse(fs.readFileSync(path.join(root, "world/migration/files.json")));
let manifests = 0,
  references = 0;
for (const file of Object.values(mapping)) {
  assert.ok(fs.existsSync(path.join(root, file)), `Missing migrated file: ${file}`);
  if (!file.endsWith(".json")) continue;
  let data;
  try {
    data = JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
  } catch {
    continue;
  }
  if (!data || typeof data !== "object") continue;
  // This catalog is a virtual-project JSON payload. AssetAssemblySourceLibrary
  // consumes it with resourcesRegistered=true, so its paths are not fetched relative to this file.
  if (file.endsWith("/plant-project-production-catalog.json")) continue;
  const records = [
    ...(Array.isArray(data.files) ? data.files : []),
    ...(Array.isArray(data.generatedResources) ? data.generatedResources : [])
  ];
  if (!records.length) continue;
  manifests++;
  for (const record of records) {
    if (typeof record.path !== "string" || /^[a-z]+:/i.test(record.path)) continue;
    const target = path.resolve(root, path.dirname(file), record.path);
    references++;
    assert.ok(fs.existsSync(target), `${file}: missing ${record.path}`);
    if (file.startsWith("packages/"))
      assert.ok(
        !target.startsWith(path.join(root, "world") + path.sep),
        `${file}: package resource depends on World: ${record.path}`
      );
  }
}
console.log(
  `${Object.keys(mapping).length} migration destinations and ${references} resource paths across ${manifests} manifests exist; package manifests do not depend on World.`
);
