import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  FLASH_APP_DEFAULT_TEMPLATE_META,
  readBoundFlashAppTemplate,
  resolveAppTemplate
} from "../../demos/seed-world/src/planning/spatial/FlashAppTemplateBinding";
import {
  DEFAULT_FLASH_APPS_CATALOG_RELATIVE,
  deriveFlashAppVariants,
  injectFlashAppTemplateIntoHtml,
  loadFlashAppsCatalog
} from "../../scripts/flash-app-variants.mjs";
import {
  assertPublisherSupportsContextPath,
  isValidAlipayUidForDb,
  parseDeployStdout,
  resolveAppReleasePlan,
  resolvePerAppContextPath,
  saveLocalState,
  selectTargetApps
} from "../../scripts/publish-seed-world-flash-apps.mjs";
import { SEED_WORLD_TEMPLATE_IDS } from "../../scripts/seed-world-template-bundles.mjs";

const repoRoot = path.resolve(__dirname, "../../..");
const tempDirs: string[] = [];

function makeTempDir(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    fs.rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

describe("Seed World 6-app Flash publishing", () => {
  it("resolves each standalone demo/Flash App strictly from its bound <meta> tag without URL ?template=", async () => {
    const fakeDoc = (content?: string) => ({
      querySelector: (selector: string) =>
        selector === `meta[name="${FLASH_APP_DEFAULT_TEMPLATE_META}"]` && content !== undefined
          ? ({ content } as HTMLMetaElement)
          : null
    });

    expect(readBoundFlashAppTemplate(fakeDoc(undefined))).toBeUndefined();
    expect(readBoundFlashAppTemplate(fakeDoc("unknown-style"))).toBeUndefined();
    expect(readBoundFlashAppTemplate(fakeDoc("original"))).toBe("original");
    expect(readBoundFlashAppTemplate(fakeDoc("oil-paint"))).toBe("oil-paint");

    expect(resolveAppTemplate(fakeDoc(undefined))).toBe("original");
    expect(resolveAppTemplate(fakeDoc("unknown-style"))).toBe("original");
    expect(resolveAppTemplate(fakeDoc("original"))).toBe("original");
    expect(resolveAppTemplate(fakeDoc("sakura-pearl"))).toBe("sakura-pearl");
    expect(resolveAppTemplate(fakeDoc("oil-paint"))).toBe("oil-paint");

    // Verify all 6 standalone demo HTML entries exist, match demos.json, and are built by default vite.config.mjs.
    const catalog = loadFlashAppsCatalog(path.join(repoRoot, DEFAULT_FLASH_APPS_CATALOG_RELATIVE));
    const demosJson = JSON.parse(fs.readFileSync(path.join(repoRoot, "world/demos.json"), "utf8")) as Array<{
      entry: string;
      title: string;
    }>;
    for (const app of catalog.apps) {
      const htmlFile = app.templateId === "original" ? "index.html" : `${app.templateId}.html`;
      const htmlPath = path.join(repoRoot, "world/demos/seed-world", htmlFile);
      expect(fs.existsSync(htmlPath), htmlFile).toBe(true);
      const html = fs.readFileSync(htmlPath, "utf8");
      expect(html).toContain(`<meta name="${FLASH_APP_DEFAULT_TEMPLATE_META}" content="${app.templateId}" />`);
      expect(html).toContain(`<title>${app.title}</title>`);
      expect(demosJson.some((d) => d.entry === `demos/seed-world/${htmlFile}` && d.title === app.title)).toBe(true);
    }

    const viteConfig = (await import("../../vite.config.mjs")).default;
    expect(viteConfig.build.rollupOptions.input).toEqual(
      SEED_WORLD_TEMPLATE_IDS.map((id) =>
        path.join(repoRoot, "world/demos/seed-world", id === "original" ? "index.html" : `${id}.html`)
      )
    );
  });

  it("loads and validates the 6-template flash-apps.json catalog", () => {
    const catalog = loadFlashAppsCatalog(path.join(repoRoot, DEFAULT_FLASH_APPS_CATALOG_RELATIVE));
    expect(catalog.apps.map((a) => a.templateId)).toEqual([...SEED_WORLD_TEMPLATE_IDS]);

    const original = catalog.apps.find((a) => a.templateId === "original")!;
    expect(original.artifactId).toBe("flashapp-a3c0e021cb8cadb0");
    expect(original.reuseExisting).toBe(true);
    expect(original.title).toBe("Seed World AIChat");

    const others = catalog.apps.filter((a) => a.templateId !== "original");
    expect(others).toHaveLength(5);
    for (const app of others) {
      expect(app.reuseExisting).toBe(false);
      expect(app.title.startsWith("Seed World · ")).toBe(true);
    }
  });

  it("injects default-template meta and title and derives all 6 lightweight variant directories", () => {
    const baseDir = makeTempDir("sw-flash-base-");
    const variantsRoot = makeTempDir("sw-flash-variants-");
    fs.mkdirSync(path.join(baseDir, "assets"), { recursive: true });
    fs.writeFileSync(path.join(baseDir, "assets/index-abc12345.js"), "console.log('ok');\n", "utf8");
    const baseHtml = `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <title>Seed World</title>
    <script type="module" src="./assets/index-abc12345.js"></script>
  </head>
  <body></body>
</html>
`;
    fs.writeFileSync(path.join(baseDir, "index.html"), baseHtml, "utf8");

    const injected = injectFlashAppTemplateIntoHtml(baseHtml, {
      templateId: "oil-paint",
      title: "Seed World · 秋林油画"
    });
    expect(injected).toContain('<meta name="seed-world-default-template" content="oil-paint" />');
    expect(injected).toContain("<title>Seed World · 秋林油画</title>");
    expect(injected).toContain('src="./assets/index-abc12345.js"');

    const catalog = loadFlashAppsCatalog(path.join(repoRoot, DEFAULT_FLASH_APPS_CATALOG_RELATIVE));
    const derived = deriveFlashAppVariants({ baseOutputDir: baseDir, variantsRoot, catalog });
    expect(derived).toHaveLength(6);

    for (const item of derived) {
      const html = fs.readFileSync(path.join(item.dir, "index.html"), "utf8");
      expect(html).toContain(`<meta name="seed-world-default-template" content="${item.templateId}" />`);
      expect(html).toContain(`<title>${item.title}</title>`);
      expect(fs.existsSync(path.join(item.dir, "assets/index-abc12345.js"))).toBe(true);
    }
  });

  it("builds 6-app publish plans, guards original ID mismatch, mints 5 IDs only with --init-missing, and restores app-context.local.json", async () => {
    const catalog = loadFlashAppsCatalog(path.join(repoRoot, DEFAULT_FLASH_APPS_CATALOG_RELATIVE));
    const subset = selectTargetApps(catalog, "original,oil-paint");
    expect(subset.map((a) => a.templateId)).toEqual(["original", "oil-paint"]);

    // Guard: mismatched publisher context for `original` must fail
    expect(() =>
      resolveAppReleasePlan({
        catalog,
        state: { schemaVersion: 1, alipayUid: "2099123456789", apps: {} },
        publisherContext: { artifactId: "flashapp-wrong00000000000", artifactVersion: "4" },
        targetApps: catalog.apps,
        options: {
          engineRoot: repoRoot,
          execute: false,
          initMissing: false,
          skipDbInit: false,
          allowContextMismatch: false,
          type: null,
          titleOverrides: {}
        }
      })
    ).toThrow(/does not match catalog "original"/);

    // Guard: --execute without --init-missing fails when new templates lack artifactId
    const unmintedCatalog = {
      ...catalog,
      apps: catalog.apps.map((app) =>
        app.templateId === "original" ? { ...app, type: null } : { ...app, artifactId: null, type: null }
      )
    };
    expect(() =>
      resolveAppReleasePlan({
        catalog: unmintedCatalog,
        state: { schemaVersion: 1, alipayUid: "2099123456789", apps: {} },
        publisherContext: { artifactId: "flashapp-a3c0e021cb8cadb0", artifactVersion: "52" },
        targetApps: unmintedCatalog.apps,
        options: {
          engineRoot: repoRoot,
          execute: true,
          initMissing: false,
          skipDbInit: false,
          allowContextMismatch: false,
          type: "game",
          titleOverrides: {}
        }
      })
    ).toThrow(/has no artifactId yet/);

    // Mint 5 new IDs + align original online version + inherit online type
    let seq = 1;
    const plan = resolveAppReleasePlan({
      catalog: unmintedCatalog,
      state: { schemaVersion: 1, alipayUid: "2099123456789", apps: {} },
      publisherContext: { artifactId: "flashapp-a3c0e021cb8cadb0", artifactVersion: "52" },
      targetApps: unmintedCatalog.apps,
      options: {
        engineRoot: repoRoot,
        execute: true,
        initMissing: true,
        skipDbInit: false,
        allowContextMismatch: false,
        type: null,
        titleOverrides: {}
      },
      mintId: () => `flashapp-000000000000000${seq++}`,
      onlineInfoByTemplate: {
        original: { latestVersion: 55, type: "miniapp" }
      }
    });

    expect(plan.newlyMinted).toHaveLength(5);
    const origPlan = plan.items.find((i) => i.templateId === "original")!;
    expect(origPlan.artifactId).toBe("flashapp-a3c0e021cb8cadb0");
    expect(origPlan.targetVersion).toBe("56");
    expect(origPlan.type).toBe("miniapp");
    expect(origPlan.needsDbInit).toBe(false);

    const oilPlan = plan.items.find((i) => i.templateId === "oil-paint")!;
    expect(oilPlan.artifactId).toBe("flashapp-0000000000000005");
    expect(oilPlan.targetVersion).toBe("1");
    expect(oilPlan.type).toBe("miniapp");
    expect(oilPlan.needsDbInit).toBe(true);

    expect(isValidAlipayUidForDb("2099123456789")).toBe(true);
    expect(isValidAlipayUidForDb("2088123456789")).toBe(false);

    const parsedOut = parseDeployStdout(`
Artifact ID: flashapp-a3c0e021cb8cadb0
Version: 56
Entry URL: https://render.lingguangcontent.com/test/index.html
Backup OSS: leopard/sandbox/workspace/flashapp-a3c0e021cb8cadb0-56/backup_56.tar.gz
`);
    expect(parsedOut.artifactId).toBe("flashapp-a3c0e021cb8cadb0");
    expect(parsedOut.version).toBe("56");
    expect(parsedOut.entryUrl).toBe("https://render.lingguangcontent.com/test/index.html");

    // Per-app FLASH_APP_CONTEXT_PATH isolation + preflight guard on app-context.cjs
    const fakePublisher = makeTempDir("sw-fake-pugc-");
    const scriptsDir = path.join(fakePublisher, "scripts");
    fs.mkdirSync(scriptsDir, { recursive: true });
    fs.writeFileSync(path.join(scriptsDir, "app-context.cjs"), "const APP_CONTEXT_PATH = 'legacy';\n", "utf8");
    expect(() => assertPublisherSupportsContextPath(fakePublisher)).toThrow(/FLASH_APP_CONTEXT_PATH/);
    fs.writeFileSync(
      path.join(scriptsDir, "app-context.cjs"),
      "const APP_CONTEXT_PATH = process.env.FLASH_APP_CONTEXT_PATH || 'app-context.local.json';\n",
      "utf8"
    );
    expect(() => assertPublisherSupportsContextPath(fakePublisher)).not.toThrow();

    const statePath = path.join(makeTempDir("sw-state-"), "nested/apps-state.local.json");
    expect(
      resolvePerAppContextPath(
        statePath,
        fakePublisher,
        { templateId: "original", artifactId: "flashapp-a3c0e021cb8cadb0", reuseExisting: true },
        { artifactId: "flashapp-a3c0e021cb8cadb0" }
      )
    ).toBe(path.join(scriptsDir, "app-context.local.json"));
    expect(
      resolvePerAppContextPath(
        statePath,
        fakePublisher,
        { templateId: "oil-paint", artifactId: "flashapp-aa964a26bde230fb", reuseExisting: false },
        { artifactId: "flashapp-a3c0e021cb8cadb0" }
      )
    ).toBe(path.join(path.dirname(statePath), "contexts/oil-paint.local.json"));

    // Heterogeneous catalog types (`original`=game, 5 new=miniapp) resolve cleanly without --type,
    // reject conflicting global --type on multi-app runs, and allow --type on single-template runs.
    const heteroPlan = resolveAppReleasePlan({
      catalog,
      state: { schemaVersion: 1, alipayUid: "2099123456789", apps: {} },
      publisherContext: { artifactId: "flashapp-a3c0e021cb8cadb0", artifactVersion: "53" },
      targetApps: catalog.apps,
      options: {
        engineRoot: repoRoot,
        execute: false,
        initMissing: false,
        skipDbInit: false,
        allowContextMismatch: false,
        type: null,
        titleOverrides: {}
      }
    });
    expect(heteroPlan.items.find((i) => i.templateId === "original")?.type).toBe("game");
    expect(heteroPlan.items.find((i) => i.templateId === "oil-paint")?.type).toBe("miniapp");

    expect(() =>
      resolveAppReleasePlan({
        catalog,
        state: { schemaVersion: 1, alipayUid: "2099123456789", apps: {} },
        publisherContext: { artifactId: "flashapp-a3c0e021cb8cadb0", artifactVersion: "53" },
        targetApps: catalog.apps,
        options: {
          engineRoot: repoRoot,
          execute: false,
          initMissing: false,
          skipDbInit: false,
          allowContextMismatch: false,
          type: "miniapp",
          titleOverrides: {}
        }
      })
    ).toThrow(/Global --type miniapp conflicts with per-app declared type/);

    const singleOverridePlan = resolveAppReleasePlan({
      catalog,
      state: { schemaVersion: 1, alipayUid: "2099123456789", apps: {} },
      publisherContext: { artifactId: "flashapp-a3c0e021cb8cadb0", artifactVersion: "53" },
      targetApps: selectTargetApps(catalog, "oil-paint"),
      options: {
        engineRoot: repoRoot,
        execute: false,
        initMissing: false,
        skipDbInit: false,
        allowContextMismatch: false,
        type: "game",
        titleOverrides: {}
      }
    });
    expect(singleOverridePlan.items[0].type).toBe("game");

    // Local state file containing private alipayUid is written with 0600 permissions.
    saveLocalState(statePath, { schemaVersion: 1, alipayUid: "2099123456789", apps: {} });
    expect(fs.statSync(statePath).mode & 0o777).toBe(0o600);
  });
});
