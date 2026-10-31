/**
 * Version policy for the editor preload packages.
 *
 * The ecosystem bundle is assembled from packages resolved through an engine compatibility alias
 * (`engine-<major>.<minor>`), and the same alias is the CDN path segment the host reads. The alias
 * itself is a moving npm dist-tag, so the bundle can silently ship packages that belong to another
 * engine line. The only compatibility declaration available without a network round trip is the
 * `@galacean/engine` peer range each installed package carries, so the build reads those back and
 * records them: the packages decide whether the artifact may be published for this engine.
 */

const fs = require("node:fs");
const path = require("node:path");

/** Packages whose engine peer range is asserted against the built engine. */
const peerPackage = "@galacean/engine";

/**
 * CDN path segment and npm dist-tag that identify one engine line.
 * @param {string} engineVersion - Exact engine version, e.g. "2.0.0-alpha.43"
 * @returns {string} Compatibility alias, e.g. "engine-2.0"
 */
function getEcosystemAlias(engineVersion) {
  return `engine-${engineVersion.split(".").slice(0, 2).join(".")}`;
}

/**
 * Read back the packages an npm install actually resolved, including their engine peer range.
 * @param {string} nodeModulesDir - node_modules directory of the install
 * @param {{ name: string }[]} packages - Packages that must be present in the bundle
 * @returns {{ name: string, version: string, peerRange: string|null }[]} Resolved packages
 */
function readResolvedPackages(nodeModulesDir, packages) {
  return packages.map(({ name }) => {
    const packageJsonPath = path.join(nodeModulesDir, name, "package.json");
    if (!fs.existsSync(packageJsonPath)) {
      throw new Error(`${name} is not installed at ${packageJsonPath}`);
    }
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
    return { name, version: packageJson.version, peerRange: packageJson.peerDependencies?.[peerPackage] ?? null };
  });
}

/**
 * Test one engine version against one peer range, e.g. ">=1.5.0-0 || >=2.0.0-0".
 *
 * A hand-rolled parser: `semver` is not a direct dependency of this package, so the alternative is
 * a build that breaks when its hoisting changes. Ranges the parser does not understand are reported
 * as unsupported so the caller can fail instead of guessing.
 *
 * @param {string} engineVersion - Exact engine version
 * @param {string} range - Peer range as published by the package
 * @returns {"satisfied"|"not-satisfied"|"unsupported"} Verdict
 */
function testPeerRange(engineVersion, range) {
  const parse = (version) =>
    version
      .split("-")[0]
      .split("+")[0]
      .split(".")
      .map((part) => Number(part));
  const compare = (a, b) => {
    for (let i = 0; i < 3; i++) {
      if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) < (b[i] ?? 0) ? -1 : 1;
    }
    return 0;
  };
  const matchesBound = (bound) => {
    const [, operator, boundVersion] = bound.match(/^(>=|<=|>|<)(\d+\.\d+\.\d+.*)$/);
    const order = compare(parse(engineVersion), parse(boundVersion));
    switch (operator) {
      case ">=":
        return order >= 0;
      case ">":
        return order > 0;
      case "<=":
        return order <= 0;
      default:
        return order < 0;
    }
  };

  const clauses = range.split("||").map((clause) => clause.trim());

  for (const clause of clauses) {
    const bounds = clause.split(/\s+/).filter(Boolean);
    // Bare versions and caret/tilde ranges need range semantics this parser does not model.
    if (!bounds.length || bounds.some((bound) => !/^(>=|<=|>|<)\d+\.\d+\.\d+/.test(bound))) return "unsupported";
    if (bounds.every(matchesBound)) return "satisfied";
  }

  return "not-satisfied";
}

/**
 * Verify that the resolved ecosystem packages declare themselves compatible with this engine.
 * @param {{ name: string, version: string, peerRange: string|null }[]} resolvedPackages - Packages read back from the install
 * @param {string} engineVersion - Exact engine version the bundle targets
 * @returns {{ compatible: boolean, declarations: { name: string, version: string, peerRange: string }[], problems: string[] }} Verdict
 */
function verifyEcosystemPackages(resolvedPackages, engineVersion) {
  const declarations = resolvedPackages.filter(({ peerRange }) => peerRange);
  const problems = [];

  if (!declarations.length) {
    problems.push(
      `no resolved package declares a "${peerPackage}" peer range, so nothing states which engine line this bundle is built for`
    );
  }

  for (const { name, version, peerRange } of declarations) {
    const verdict = testPeerRange(engineVersion, peerRange);
    if (verdict === "not-satisfied") {
      problems.push(
        `${name}@${version} declares "${peerPackage}": "${peerRange}", which ${engineVersion} does not satisfy`
      );
    }
    if (verdict === "unsupported") {
      problems.push(`${name}@${version} declares an unsupported "${peerPackage}" range "${peerRange}"`);
    }
  }

  return { compatible: problems.length === 0, declarations, problems };
}

module.exports = { getEcosystemAlias, readResolvedPackages, testPeerRange, verifyEcosystemPackages };
