import {
  VirtualProjectFiles as AgentProjectFiles,
  type ProjectFileProvider
} from "@galacean/engine-project/project-files/virtual-project-files";
import type { AgentApiDeclarationModule, AgentScriptApiCatalog } from "./agent-types";
import { agentSkillFiles } from "./agent-skills";
import { canonicalKnowledgePaths } from "./agent-knowledge-paths";
import { contentView, resolveProjectFile } from "@galacean/engine-project/project-files/project-file-view";

export { AgentProjectFiles };

/** execute contracts live under declare/editor/; Script declarations use declare/engine/. */
const declarationPath = (id: string) => `declare/editor/${id.replace(/^declare\//, "")}`;

export function createAgentProjectFiles(
  catalog: AgentScriptApiCatalog,
  providers: readonly ProjectFileProvider[] = []
): AgentProjectFiles {
  const skillFiles = agentSkillFiles(catalog.skills ?? []);
  const externalPaths = new Set(providers.flatMap((provider) => [...provider.paths()]));
  const modulePath = (id: string) => (externalPaths.has(id) ? id : declarationPath(id));
  for (const document of catalog.documents ?? [])
    if (!/^(?:skills|declare)\//.test(document.path))
      throw new Error(`Knowledge must live under skills/ or declare/: '${document.path}'`);
  const paths = new Set([
    ...externalPaths,
    ...skillFiles.keys(),
    ...(catalog.documents ?? []).map((document) => document.path),
    ...catalog.modules.map((module) => modulePath(module.id))
  ]);
  // Cache only derived host knowledge, keyed by its current source. Project
  // documents and provider reads remain live and are never rewritten.
  const knowledge = new Map<string, { source: string; content: string }>();
  const publish = (path: string, source: string) => {
    const previous = knowledge.get(path);
    if (previous?.source === source) return previous.content;
    const content = canonicalKnowledgePaths(source, path, paths);
    knowledge.set(path, { source, content });
    return content;
  };
  const provider: ProjectFileProvider = {
    *paths() {
      yield* skillFiles.keys();
      for (const document of catalog.documents ?? []) yield document.path;
      for (const module of catalog.modules) if (!externalPaths.has(modulePath(module.id))) yield modulePath(module.id);
    },
    read(path) {
      if (skillFiles.has(path)) return skillFiles.get(path);
      return (
        catalog.documents?.find((document) => document.path === path)?.content ??
        (externalPaths.has(path) ? undefined : catalog.modules.find((module) => modulePath(module.id) === path)?.source)
      );
    }
  };
  const isKnowledge = (path: string) =>
    (path.startsWith("skills/") || path.startsWith("declare/")) && path.endsWith(".md");
  const mounted = [provider, ...providers].map(
    (source): ProjectFileProvider => ({
      paths: () => source.paths(),
      missing: (path) => source.missing?.(path),
      directories: source.directories ? () => source.directories!() : undefined,
      prepare: source.prepare ? (path, signal) => source.prepare!(path, signal) : undefined,
      read(path) {
        const content = source.read(path);
        return isKnowledge(path) && typeof content === "string" ? publish(path, content) : content;
      },
      async open(path, signal) {
        const view = await resolveProjectFile(source, path, signal);
        if (!isKnowledge(path) || view.kind !== "text") return view;
        // Only managed Markdown needs whole-document parsing. Other files retain
        // the provider's streaming/cancellation behavior, including binary views.
        const chunks: string[] = [];
        for await (const chunk of view.chunks) {
          signal?.throwIfAborted();
          chunks.push(chunk);
        }
        signal?.throwIfAborted();
        return contentView(publish(path, chunks.join("")), signal);
      }
    })
  );
  const files = new AgentProjectFiles(mounted);
  files.list();
  return files;
}

export function projectDeclarationModules(
  files: AgentProjectFiles,
  modules: readonly AgentApiDeclarationModule[]
): AgentApiDeclarationModule[] {
  // Declaration collection is one operation: enumerate providers once, while
  // rebuilding on the next execution so edits and provider changes stay visible.
  const snapshot = files.snapshot();
  return modules.map((module) => ({
    ...module,
    source: snapshot.read(snapshot.kind(declarationPath(module.id)) === "file" ? declarationPath(module.id) : module.id)
  }));
}
