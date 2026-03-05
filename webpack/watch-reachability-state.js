const { collectDirectSiteAssetLinks } = require('./reachability');

function cloneSet(values) {
  return new Set(values || []);
}

class WatchReachabilityState {
  constructor({ rootPath = 'index.html', basePath = '/' } = {}) {
    this.rootPath = rootPath;
    this.basePath = basePath;
    this.reset();
  }

  reset() {
    this.knownAssets = new Set();
    this.outgoingBySource = new Map();
    this.incomingByTarget = new Map();
    this.reachable = new Set();
    this.initialized = false;
  }

  setKnownAssets(assetPaths) {
    this.knownAssets = cloneSet(assetPaths);
    this.reachable = new Set(
      [...this.reachable].filter(assetPath => this.knownAssets.has(assetPath)),
    );

    const nextOutgoingBySource = new Map();
    for (const [sourcePath, targets] of this.outgoingBySource) {
      if (!this.knownAssets.has(sourcePath)) {
        continue;
      }

      nextOutgoingBySource.set(
        sourcePath,
        new Set(
          [...targets].filter(targetPath => this.knownAssets.has(targetPath)),
        ),
      );
    }

    this.outgoingBySource = nextOutgoingBySource;
    this.rebuildIncomingByTarget();
  }

  rebuild(readHtmlForAsset) {
    if (!this.knownAssets.has(this.rootPath)) {
      throw new Error(`Pagefind reachability root not found: ${this.rootPath}`);
    }

    this.outgoingBySource = new Map();
    this.incomingByTarget = new Map();
    this.reachable = new Set();

    const knownAssetPaths = [...this.knownAssets].sort();
    for (const sourcePath of knownAssetPaths) {
      const outgoingPaths = this.readOutgoingPaths(
        sourcePath,
        readHtmlForAsset,
      );
      this.outgoingBySource.set(sourcePath, outgoingPaths);
      this.addIncomingEdges(sourcePath, outgoingPaths);
    }

    this.reachable = this.collectClosure(new Set([this.rootPath]));
    this.initialized = true;
  }

  applyIncremental({ changedAssetPaths, removedAssetPaths, readHtmlForAsset }) {
    if (!this.initialized) {
      this.rebuild(readHtmlForAsset);
      return;
    }

    const normalizedChanged = new Set();
    for (const assetPath of changedAssetPaths || []) {
      if (this.knownAssets.has(assetPath)) {
        normalizedChanged.add(assetPath);
      }
    }

    const normalizedRemoved = new Set();
    for (const assetPath of removedAssetPaths || []) {
      if (
        !this.knownAssets.has(assetPath) &&
        !normalizedChanged.has(assetPath)
      ) {
        normalizedRemoved.add(assetPath);
      }
    }

    const previouslyReachableRoots = new Set();
    for (const assetPath of normalizedChanged) {
      if (this.reachable.has(assetPath)) {
        previouslyReachableRoots.add(assetPath);
      }
    }
    for (const assetPath of normalizedRemoved) {
      if (this.reachable.has(assetPath)) {
        previouslyReachableRoots.add(assetPath);
      }
    }

    const oldAffectedClosure = this.collectClosure(previouslyReachableRoots);

    for (const assetPath of normalizedRemoved) {
      this.removeAsset(assetPath);
    }

    const changedAssetList = [...normalizedChanged].sort();
    for (const assetPath of changedAssetList) {
      const outgoingPaths = this.readOutgoingPaths(assetPath, readHtmlForAsset);
      this.replaceOutgoing(assetPath, outgoingPaths);
    }

    const stillKnownRoots = new Set(
      [...previouslyReachableRoots].filter(assetPath =>
        this.knownAssets.has(assetPath),
      ),
    );
    const newAffectedClosure = this.collectClosure(stillKnownRoots);
    const affected = new Set([...oldAffectedClosure, ...newAffectedClosure]);

    if (affected.size === 0) {
      this.initialized = true;
      return;
    }

    for (const assetPath of affected) {
      this.reachable.delete(assetPath);
    }

    const seedPaths = new Set();
    for (const assetPath of stillKnownRoots) {
      if (affected.has(assetPath)) {
        seedPaths.add(assetPath);
      }
    }

    if (this.knownAssets.has(this.rootPath) && affected.has(this.rootPath)) {
      seedPaths.add(this.rootPath);
    }

    for (const assetPath of affected) {
      const incomingPaths = this.incomingByTarget.get(assetPath);
      if (!incomingPaths) {
        continue;
      }

      for (const sourcePath of incomingPaths) {
        if (this.reachable.has(sourcePath) && !affected.has(sourcePath)) {
          seedPaths.add(assetPath);
          break;
        }
      }
    }

    const restoredReachable = this.collectClosure(seedPaths, affected);
    for (const assetPath of restoredReachable) {
      this.reachable.add(assetPath);
    }

    this.initialized = true;
  }

  getReachablePaths() {
    return [...this.reachable].sort();
  }

  readOutgoingPaths(sourcePath, readHtmlForAsset) {
    if (!this.knownAssets.has(sourcePath)) {
      return new Set();
    }

    const html = readHtmlForAsset(sourcePath);
    const { htmlAssetPaths } = collectDirectSiteAssetLinks({
      html,
      fromAssetPath: sourcePath,
      knownAssets: this.knownAssets,
      basePath: this.basePath,
    });
    return new Set(htmlAssetPaths);
  }

  addIncomingEdges(sourcePath, outgoingPaths) {
    for (const targetPath of outgoingPaths) {
      let incomingPaths = this.incomingByTarget.get(targetPath);
      if (!incomingPaths) {
        incomingPaths = new Set();
        this.incomingByTarget.set(targetPath, incomingPaths);
      }
      incomingPaths.add(sourcePath);
    }
  }

  rebuildIncomingByTarget() {
    this.incomingByTarget = new Map();
    for (const [sourcePath, outgoingPaths] of this.outgoingBySource) {
      this.addIncomingEdges(sourcePath, outgoingPaths);
    }
  }

  removeOutgoingEdges(sourcePath) {
    const outgoingPaths = this.outgoingBySource.get(sourcePath);
    if (!outgoingPaths) {
      return;
    }

    for (const targetPath of outgoingPaths) {
      const incomingPaths = this.incomingByTarget.get(targetPath);
      if (!incomingPaths) {
        continue;
      }

      incomingPaths.delete(sourcePath);
      if (incomingPaths.size === 0) {
        this.incomingByTarget.delete(targetPath);
      }
    }
  }

  replaceOutgoing(sourcePath, outgoingPaths) {
    this.removeOutgoingEdges(sourcePath);
    if (!this.knownAssets.has(sourcePath)) {
      this.outgoingBySource.delete(sourcePath);
      return;
    }

    this.outgoingBySource.set(sourcePath, outgoingPaths);
    this.addIncomingEdges(sourcePath, outgoingPaths);
  }

  removeAsset(assetPath) {
    this.removeOutgoingEdges(assetPath);
    this.outgoingBySource.delete(assetPath);
    this.incomingByTarget.delete(assetPath);
    this.reachable.delete(assetPath);
  }

  collectClosure(rootPaths, allowedPaths = null) {
    const pending = [...rootPaths];
    const visited = new Set();

    while (pending.length > 0) {
      const currentPath = pending.pop();
      if (visited.has(currentPath)) {
        continue;
      }
      if (allowedPaths && !allowedPaths.has(currentPath)) {
        continue;
      }

      visited.add(currentPath);
      const outgoingPaths = this.outgoingBySource.get(currentPath);
      if (!outgoingPaths) {
        continue;
      }

      for (const targetPath of outgoingPaths) {
        if (allowedPaths && !allowedPaths.has(targetPath)) {
          continue;
        }
        if (!visited.has(targetPath)) {
          pending.push(targetPath);
        }
      }
    }

    return visited;
  }
}

module.exports = WatchReachabilityState;
