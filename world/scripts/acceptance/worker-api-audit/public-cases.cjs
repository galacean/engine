const cases = [];
const add = (tool, publicPlan, id = tool) => cases.push({ id: "public." + id, tool, publicPlan, scope: "public" });
const read = (file_path, limit = 20) => ({ name: "read", input: { file_path, offset: null, column: null, limit } });
add("glob", [{ name: "glob", input: { pattern: "**/*.d.ts", path: "declare" } }]);
add("grep", [{ name: "grep", input: { pattern: "timeHours", path: "declare", include: "*.d.ts" } }]);
add("read", [read("declare/editor/world/tools/time.update.d.ts")]);
add("read", [read("Scene/SeedWorld.scene", 1)], "read-large-scene-line");
add("write", [
  { name: "write", input: { file_path: "Audit/audit-public.txt", content: "Audit version one\nSecond line\n" } }
]);
add("edit", [
  read("Audit/audit-public.txt"),
  {
    name: "edit",
    input: {
      file_path: "Audit/audit-public.txt",
      old_string: "version one",
      new_string: "version two",
      replace_all: false
    }
  },
  read("Audit/audit-public.txt")
]);
add(
  "write",
  [
    read("Audit/audit-public.txt"),
    { name: "write", input: { file_path: "Audit/audit-public.txt", content: "Audit version two\nSecond line\n" } }
  ],
  "write-unchanged"
);
add("delete", [read("Audit/audit-public.txt"), { name: "delete", input: { file_path: "Audit/audit-public.txt" } }]);
add("execute", [{ name: "execute", input: { code: "return await tools.time.get();" } }]);
add("snapshot", [{ name: "snapshot", input: {} }]);
add("snapshot", [{ name: "snapshot", input: {} }], "snapshot-repeat");
add("read", [{ name: "snapshot", input: {} }, read("__SNAPSHOT__", null)], "read-snapshot");
add("search_assets", [{ name: "search_assets", input: { query: "木 桌", maxResults: 3, offset: 0 } }]);
cases.push({
  id: "public.read_asset_descriptions",
  tool: "read_asset_descriptions",
  scope: "public",
  publicPlan: [
    {
      name: "read_asset_descriptions",
      input: { descriptionPaths: ["/oss/assets/model/prop/furniture-desk/describe.json"], offset: 0 }
    }
  ]
});
cases.push({
  id: "public.source_text",
  tool: "source_text",
  scope: "public",
  publicPlan: [
    {
      name: "source_text",
      input: { action: "read", path: "/oss/assets/model/prop/furniture-desk/describe.json", offset: 1, limit: 30 }
    }
  ]
});
module.exports = cases;
if (require.main === module) process.stdout.write(JSON.stringify(cases, null, 2));
