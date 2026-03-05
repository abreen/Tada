const watchStateByCompiler = new WeakMap();
const buildDeltaByCompiler = new WeakMap();

function cloneSet(values) {
  return new Set(values || []);
}

function getEmptyBuildDelta() {
  return {
    changedSourceFiles: new Set(),
    changedHtmlAssetPaths: new Set(),
    removedHtmlAssetPaths: new Set(),
    templatesChanged: false,
  };
}

function setWatchState(compiler, watchState) {
  watchStateByCompiler.set(compiler, {
    contentFiles: cloneSet(watchState?.contentFiles),
    buildContentFiles: cloneSet(watchState?.buildContentFiles),
    changedContentFiles: cloneSet(watchState?.changedContentFiles),
    templatesChanged: Boolean(watchState?.templatesChanged),
    structureChanged: Boolean(watchState?.structureChanged),
  });
}

function getWatchState(compiler) {
  const state = watchStateByCompiler.get(compiler);
  if (!state) {
    return null;
  }

  return {
    contentFiles: cloneSet(state.contentFiles),
    buildContentFiles: cloneSet(state.buildContentFiles),
    changedContentFiles: cloneSet(state.changedContentFiles),
    templatesChanged: state.templatesChanged,
    structureChanged: state.structureChanged,
  };
}

function setBuildDelta(compiler, buildDelta) {
  buildDeltaByCompiler.set(compiler, {
    changedSourceFiles: cloneSet(buildDelta?.changedSourceFiles),
    changedHtmlAssetPaths: cloneSet(buildDelta?.changedHtmlAssetPaths),
    removedHtmlAssetPaths: cloneSet(buildDelta?.removedHtmlAssetPaths),
    templatesChanged: Boolean(buildDelta?.templatesChanged),
  });
}

function mergeIntoSet(target, values) {
  if (!values) {
    return;
  }

  for (const value of values) {
    target.add(value);
  }
}

function updateBuildDelta(compiler, buildDelta) {
  const current = getBuildDelta(compiler);
  mergeIntoSet(current.changedSourceFiles, buildDelta?.changedSourceFiles);
  mergeIntoSet(
    current.changedHtmlAssetPaths,
    buildDelta?.changedHtmlAssetPaths,
  );
  mergeIntoSet(
    current.removedHtmlAssetPaths,
    buildDelta?.removedHtmlAssetPaths,
  );
  current.templatesChanged =
    current.templatesChanged || Boolean(buildDelta?.templatesChanged);
  buildDeltaByCompiler.set(compiler, current);
}

function getBuildDelta(compiler) {
  const delta = buildDeltaByCompiler.get(compiler);
  if (!delta) {
    return getEmptyBuildDelta();
  }

  return {
    changedSourceFiles: cloneSet(delta.changedSourceFiles),
    changedHtmlAssetPaths: cloneSet(delta.changedHtmlAssetPaths),
    removedHtmlAssetPaths: cloneSet(delta.removedHtmlAssetPaths),
    templatesChanged: delta.templatesChanged,
  };
}

module.exports = {
  getBuildDelta,
  getWatchState,
  setBuildDelta,
  setWatchState,
  updateBuildDelta,
};
