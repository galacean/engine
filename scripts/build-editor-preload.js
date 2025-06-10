#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const config = require('./editor-preload-config');

// Parse command line arguments
const args = process.argv.slice(2);
const versionArg = args.find(arg => arg.startsWith('--version='));
const ecosystemVersion = versionArg ? versionArg.split('=')[1] : '1.0.0';
const useNpmArg = args.includes('--use-npm');
const skipBuildArg = args.includes('--skip-build');
const buildOfficialArg = args.includes('--build-official');

// Get engine version from package.json
const enginePackageJson = require(path.join(process.cwd(), 'package.json'));
const engineVersion = enginePackageJson.version;

console.log(`Engine version: ${engineVersion}`);
console.log(`Ecosystem version: ${ecosystemVersion}`);
console.log(`Use npm: ${useNpmArg}`);
console.log(`Skip build: ${skipBuildArg}`);
console.log(`Build official: ${buildOfficialArg}`);

// Paths
const rootDir = process.cwd();
const outputEcosystemDir = path.join(rootDir, 'editor-preload-ecosystem');
const outputEcosystemDistDir = path.join(outputEcosystemDir, 'dist');
const outputEcosystemFile = path.join(outputEcosystemDistDir, 'browser.js');

console.log('Creating output directories...');
// Create ecosystem output directories
if (!fs.existsSync(outputEcosystemDir)) {
  fs.mkdirSync(outputEcosystemDir, { recursive: true });
}
if (!fs.existsSync(outputEcosystemDistDir)) {
  fs.mkdirSync(outputEcosystemDistDir, { recursive: true });
}

// Create package.json for ecosystem package
const ecosystemPackageJson = {
  name: "@galacean/editor-preload-ecosystem",
  version: ecosystemVersion,
  description: "Ecosystem packages preloaded for Galacean Editor",
  main: "dist/browser.js",
  files: ["dist"]
};

fs.writeFileSync(
  path.join(outputEcosystemDir, 'package.json'),
  JSON.stringify(ecosystemPackageJson, null, 2)
);

// Initialize output file with header
fs.writeFileSync(outputEcosystemFile, `// @galacean/editor-preload-ecosystem ${ecosystemVersion}\n`);

// Build first-party packages if needed
if (!skipBuildArg) {
  console.log('Building first-party packages...');
  try {
    execSync('pnpm b:all', { stdio: 'inherit', cwd: rootDir });
  } catch (error) {
    console.error('Failed to build first-party packages:', error);
    process.exit(1);
  }
}

// If buildOfficialArg is true, also build the official preload package
if (buildOfficialArg) {
  console.log('Building official preload package...');
  try {
    execSync('node ./scripts/build-official-preload.js', { stdio: 'inherit', cwd: rootDir });
  } catch (error) {
    console.error('Failed to build official preload package:', error);
    process.exit(1);
  }
}

// Handle second-party packages
if (useNpmArg) {
  // Install from npm
  console.log('Installing second-party packages from npm...');
  
  const tempDir = path.join(rootDir, 'temp-install');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }
  
  // Create package.json for temp install
  const tempPackageJson = {
    name: "temp-install",
    private: true,
    dependencies: {}
  };
  
  // Collect all package names from second-party configs
  config.secondParty.forEach(pkg => {
    if (pkg.isMonorepo && pkg.packages) {
      pkg.packages.forEach(subPkg => {
        tempPackageJson.dependencies[subPkg.name] = ecosystemVersion;
      });
    } else {
      tempPackageJson.dependencies[pkg.name] = ecosystemVersion;
    }
  });
  
  fs.writeFileSync(
    path.join(tempDir, 'package.json'),
    JSON.stringify(tempPackageJson, null, 2)
  );
  
  // Install packages
  try {
    execSync('npm install', { stdio: 'inherit', cwd: tempDir });
  } catch (error) {
    console.error('Failed to install second-party packages:', error);
    process.exit(1);
  }
  
  // Concatenate second-party packages
  console.log('Concatenating second-party packages for ecosystem preload...');
  config.secondParty.forEach(pkg => {
    if (pkg.isMonorepo && pkg.packages) {
      pkg.packages.forEach(subPkg => {
        const browserFile = path.join(tempDir, 'node_modules', subPkg.name, subPkg.browserPath);
        
        if (fs.existsSync(browserFile)) {
          const content = fs.readFileSync(browserFile);
          fs.appendFileSync(outputEcosystemFile, content);
          console.log(`Added ${subPkg.name} to ecosystem package (${browserFile})`);
        } else {
          console.warn(`Warning: ${browserFile} not found for ${subPkg.name}`);
        }
      });
    } else {
      const browserFile = path.join(tempDir, 'node_modules', pkg.name, pkg.browserPath);
      
      if (fs.existsSync(browserFile)) {
        const content = fs.readFileSync(browserFile);
        fs.appendFileSync(outputEcosystemFile, content);
        console.log(`Added ${pkg.name} to ecosystem package (${browserFile})`);
      } else {
        console.warn(`Warning: ${browserFile} not found for ${pkg.name}`);
      }
    }
  });
} else {
  // Build from source
  console.log('Building second-party packages from source...');
  
  config.secondParty.forEach(pkg => {
    const repoDir = path.join(rootDir, path.basename(pkg.repo, '.git'));
    
    // Clone repo if it doesn't exist
    if (!fs.existsSync(repoDir)) {
      console.log(`Cloning ${pkg.name} from ${pkg.repo}...`);
      const cloneCmd = pkg.branch 
        ? `git clone ${pkg.repo} ${repoDir} -b ${pkg.branch}`
        : `git clone ${pkg.repo} ${repoDir}`;
      
      try {
        execSync(cloneCmd, { stdio: 'inherit' });
      } catch (error) {
        console.error(`Failed to clone ${pkg.name}:`, error);
        return;
      }
    }
    
    // Link engine
    console.log(`Linking engine to ${pkg.name}...`);
    try {
      execSync('pnpm link ../packages/galacean', { 
        stdio: 'inherit', 
        cwd: repoDir 
      });
    } catch (error) {
      console.warn(`Warning: Failed to link engine to ${pkg.name}:`, error);
    }
    
    // Install dependencies
    console.log(`Installing dependencies for ${pkg.name}...`);
    try {
      execSync('pnpm install', { stdio: 'inherit', cwd: repoDir });
    } catch (error) {
      console.error(`Failed to install dependencies for ${pkg.name}:`, error);
      return;
    }
    
    // Build package
    if (!skipBuildArg) {
      console.log(`Building ${pkg.name}...`);
      try {
        execSync(pkg.buildCommand, { stdio: 'inherit', cwd: repoDir });
      } catch (error) {
        console.error(`Failed to build ${pkg.name}:`, error);
        return;
      }
    }
    
    // Concatenate browser files
    if (pkg.isMonorepo && pkg.packages) {
      pkg.packages.forEach(subPkg => {
        const packageDir = path.join(repoDir, subPkg.packagePath);
        const browserFile = path.join(packageDir, subPkg.browserPath);
        
        if (fs.existsSync(browserFile)) {
          const content = fs.readFileSync(browserFile);
          fs.appendFileSync(outputEcosystemFile, content);
          console.log(`Added ${subPkg.name} to ecosystem package (${browserFile})`);
        } else {
          console.warn(`Warning: ${browserFile} not found for ${subPkg.name}`);
        }
      });
    } else {
      const packageDir = pkg.packagePath === '.' ? repoDir : path.join(repoDir, pkg.packagePath);
      const browserFile = path.join(packageDir, pkg.browserPath);
      
      if (fs.existsSync(browserFile)) {
        const content = fs.readFileSync(browserFile);
        fs.appendFileSync(outputEcosystemFile, content);
        console.log(`Added ${pkg.name} to ecosystem package (${browserFile})`);
      } else {
        console.warn(`Warning: ${browserFile} not found for ${pkg.name}`);
      }
    }
  });
}

// Output file stats
const ecosystemStats = fs.statSync(outputEcosystemFile);
console.log(`\nCreated ${outputEcosystemFile} (${(ecosystemStats.size / 1024 / 1024).toFixed(2)} MB)`);
console.log('Done!');
