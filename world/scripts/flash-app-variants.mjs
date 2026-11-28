import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
import { SEED_WORLD_TEMPLATE_IDS } from "./seed-world-template-bundles.mjs";

export const FLASH_APP_DEFAULT_TEMPLATE_META = "seed-world-default-template";
export const DEFAULT_FLASH_APPS_CATALOG_RELATIVE = "world/demos/seed-world/flash-apps.json";

/**
 * Loads and validates the repository's 6-template Flash App catalog (`world/demos/seed-world/flash-apps.json`).
 */
export function loadFlashAppsCatalog(catalogPath) {
  if (!existsSync(catalogPath)) {
    throw new Error(`Missing Seed World Flash Apps catalog: ${catalogPath}`);
  }
  const parsed = JSON.parse(readFileSync(catalogPath, "utf8"));
  if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.apps) || parsed.apps.length === 0) {
    throw new Error(`Invalid Flash Apps catalog in ${catalogPath}: expected non-empty apps array`);
  }

  const seen = new Set();
  const apps = parsed.apps.map((entry, index) => {
    if (!entry || typeof entry !== "object") {
      throw new Error(`Invalid Flash App entry at index ${index} in ${catalogPath}`);
    }
    const templateId = typeof entry.templateId === "string" ? entry.templateId.trim() : "";
    if (!SEED_WORLD_TEMPLATE_IDS.includes(templateId)) {
      throw new Error(
        `Unknown templateId "${templateId}" in ${catalogPath}; expected one of: ${SEED_WORLD_TEMPLATE_IDS.join(", ")}`
      );
    }
    if (seen.has(templateId)) {
      throw new Error(`Duplicate templateId "${templateId}" in ${catalogPath}`);
    }
    seen.add(templateId);

    const title = typeof entry.title === "string" ? entry.title.trim() : "";
    if (!title) {
      throw new Error(`Flash App "${templateId}" in ${catalogPath} is missing a non-empty title`);
    }

    const artifactId =
      entry.artifactId === null || entry.artifactId === undefined
        ? null
        : typeof entry.artifactId === "string" && entry.artifactId.trim()
          ? entry.artifactId.trim()
          : null;
    const type =
      entry.type === null || entry.type === undefined
        ? null
        : entry.type === "game" || entry.type === "miniapp"
          ? entry.type
          : (() => {
              throw new Error(`Flash App "${templateId}" has invalid type "${entry.type}"; expected game, miniapp, or null`);
            })();

    return {
      templateId,
      title,
      artifactId,
      type,
      reuseExisting: Boolean(entry.reuseExisting)
    };
  });

  const missingTemplates = SEED_WORLD_TEMPLATE_IDS.filter((id) => !seen.has(id));
  if (missingTemplates.length > 0) {
    throw new Error(`Flash Apps catalog ${catalogPath} is missing template(s): ${missingTemplates.join(", ")}`);
  }

  return {
    schemaVersion: parsed.schemaVersion ?? 1,
    apps
  };
}

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/**
 * Rewrites a Flash App root `index.html` with a single-template default meta tag and app-specific `<title>`.
 * Preserves all script/module/asset references verbatim so shared runtime chunks and CDN URLs remain identical.
 */
export function injectFlashAppTemplateIntoHtml(indexHtml, { templateId, title }) {
  if (!SEED_WORLD_TEMPLATE_IDS.includes(templateId)) {
    throw new Error(`Unsupported Seed World templateId: ${templateId}`);
  }
  if (!title || typeof title !== "string") {
    throw new Error(`Flash App "${templateId}" requires a non-empty title`);
  }

  const metaTag = `<meta name="${FLASH_APP_DEFAULT_TEMPLATE_META}" content="${escapeHtml(templateId)}" />`;
  const existingMetaRe = new RegExp(
    `<meta\\s+[^>]*name=["']${FLASH_APP_DEFAULT_TEMPLATE_META}["'][^>]*>`,
    "iu"
  );

  let html = indexHtml;
  if (existingMetaRe.test(html)) {
    html = html.replace(existingMetaRe, metaTag);
  } else if (/<meta\s+name=["']viewport["'][^>]*>/iu.test(html)) {
    html = html.replace(/(<meta\s+name=["']viewport["'][^>]*>)/iu, `$1\n    ${metaTag}`);
  } else if (/<\/head>/iu.test(html)) {
    html = html.replace(/<\/head>/iu, `    ${metaTag}\n  </head>`);
  } else {
    throw new Error("Flash App index.html is missing </head>; cannot inject default template meta");
  }

  const titleTag = `<title>${escapeHtml(title)}</title>`;
  if (/<title>[\s\S]*?<\/title>/iu.test(html)) {
    html = html.replace(/<title>[\s\S]*?<\/title>/iu, titleTag);
  } else if (/<\/head>/iu.test(html)) {
    html = html.replace(/<\/head>/iu, `    ${titleTag}\n  </head>`);
  }

  return html;
}

/**
 * Derives all per-template Flash App runtime directories under `variantsRoot/<templateId>` from a single
 * shared base build (`baseOutputDir`), differentiating only `index.html`.
 */
export function deriveFlashAppVariants({ baseOutputDir, variantsRoot, catalog }) {
  const baseIndexPath = resolve(baseOutputDir, "index.html");
  if (!existsSync(baseIndexPath)) {
    throw new Error(`Base Flash App build is missing ${baseIndexPath}`);
  }
  const baseIndexHtml = readFileSync(baseIndexPath, "utf8");
  const baseFiles = listRelativeFiles(baseOutputDir);

  rmSync(variantsRoot, { recursive: true, force: true });
  mkdirSync(variantsRoot, { recursive: true });

  const derived = [];
  for (const app of catalog.apps) {
    const variantDir = resolve(variantsRoot, app.templateId);
    cpSync(baseOutputDir, variantDir, { recursive: true, verbatimSymlinks: true });
    const variantHtml = injectFlashAppTemplateIntoHtml(baseIndexHtml, app);
    writeFileSync(resolve(variantDir, "index.html"), variantHtml, "utf8");
    const inspection = inspectFlashAppVariant(variantDir, app, baseFiles);
    derived.push({
      templateId: app.templateId,
      title: app.title,
      dir: variantDir,
      ...inspection
    });
  }
  return derived;
}

export function inspectFlashAppVariant(variantDir, app, expectedFiles) {
  const indexPath = resolve(variantDir, "index.html");
  if (!existsSync(indexPath)) {
    throw new Error(`Derived Flash App "${app.templateId}" is missing ${indexPath}`);
  }
  const html = readFileSync(indexPath, "utf8");
  const expectedMeta = `<meta name="${FLASH_APP_DEFAULT_TEMPLATE_META}" content="${escapeHtml(app.templateId)}" />`;
  if (!html.includes(expectedMeta)) {
    throw new Error(`Derived Flash App "${app.templateId}" index.html is missing ${expectedMeta}`);
  }
  const expectedTitle = `<title>${escapeHtml(app.title)}</title>`;
  if (!html.includes(expectedTitle)) {
    throw new Error(`Derived Flash App "${app.templateId}" index.html is missing ${expectedTitle}`);
  }
  if (/\b(?:src|href)=["']\/assets\//u.test(html) || /\b(?:src|href)=["']\.\.\//u.test(html)) {
    throw new Error(`Derived Flash App "${app.templateId}" index.html contains non-relative asset URLs`);
  }
  if (!/\bsrc=["']\.\/assets\/[^"']+\.js["']/u.test(html)) {
    throw new Error(`Derived Flash App "${app.templateId}" index.html is missing ./assets/*.js entry module`);
  }

  const actualFiles = listRelativeFiles(variantDir);
  if (expectedFiles && JSON.stringify(actualFiles) !== JSON.stringify(expectedFiles)) {
    throw new Error(`Derived Flash App "${app.templateId}" file set differs from base Flash App build`);
  }

  let totalBytes = 0;
  for (const rel of actualFiles) {
    totalBytes += statSync(resolve(variantDir, rel)).size;
  }
  return { fileCount: actualFiles.length, totalBytes };
}

function listRelativeFiles(rootDir) {
  const files = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const fullPath = resolve(dir, entry.name);
      if (entry.isDirectory()) walk(fullPath);
      else if (entry.isFile()) files.push(relative(rootDir, fullPath).split(sep).join("/"));
    }
  };
  walk(rootDir);
  files.sort();
  return files;
}
