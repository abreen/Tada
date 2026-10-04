import fs from 'fs';
import path from 'path';
import { getDevSiteVariables, getProdSiteVariables } from './site-variables';
import { getDistDir, getProdDistDir } from './utils/paths';
import { isFeatureEnabled } from './features';
import { runPagefind } from './pagefind';
import { makeLogger, printFlair } from './log';
import {
  generateBuildManifest,
  getNextVersion,
  MANIFEST_FILE_NAME,
} from './build-manifest';
import { buildSite, createBuildMeta, type TadaSnapshot } from './site-build';
import {
  BuildFailedError,
  diagnosticFromError,
  printDiagnostics,
} from './build-validation';
import { applyMutations, planFullWrite } from './output-publication';
import { checkTraceToolAvailability } from './utils/trace';
import type { BuildDiagnostic } from './build-types';
import type { SiteVariables } from './types';

const log = makeLogger(import.meta.url);

const SEARCH_INDEX_PREFIX = 'pagefind/';

function fail(diagnostics: BuildDiagnostic[]): never {
  printDiagnostics(diagnostics);
  const noun = diagnostics.length === 1 ? 'error' : 'errors';
  throw new BuildFailedError(`${diagnostics.length} ${noun}`);
}

async function indexSearch(
  outputDir: string,
  snapshot: TadaSnapshot,
): Promise<void> {
  if (isFeatureEnabled(snapshot.siteVariables, 'search')) {
    const meta = createBuildMeta(snapshot);
    await runPagefind({ distPath: outputDir, ...meta });
  }
}

/** Updates `dist/` in place to hold exactly this build's outputs. */
async function publishDev(snapshot: TadaSnapshot): Promise<void> {
  const distDir = getDistDir();
  const keep = isFeatureEnabled(snapshot.siteVariables, 'search')
    ? [SEARCH_INDEX_PREFIX]
    : [];
  applyMutations(distDir, planFullWrite(distDir, snapshot.outputs, keep));
  await indexSearch(distDir, snapshot);
}

/** Writes a new `dist-prod/v{N}/`; it counts as a version once its manifest is written. */
async function publishProd(snapshot: TadaSnapshot): Promise<void> {
  const prodBase = getProdDistDir();
  const version = getNextVersion(prodBase);
  const versionDir = path.join(prodBase, `v${version}`);
  // A directory without a manifest is left over from a failed build.
  fs.rmSync(versionDir, { recursive: true, force: true });
  try {
    applyMutations(versionDir, planFullWrite(versionDir, snapshot.outputs));
    await indexSearch(versionDir, snapshot);
    await generateBuildManifest(
      versionDir,
      path.join(versionDir, MANIFEST_FILE_NAME),
      version,
    );
  } catch (error) {
    try {
      fs.rmSync(versionDir, { recursive: true, force: true });
    } catch {
      // Without a manifest, the leftover directory is ignored and replaced.
    }
    throw error;
  }
  log.info`Built dist-prod/v${version}/`;
}

export async function runPipeline(
  mode: 'development' | 'production',
): Promise<void> {
  const isDev = mode === 'development';
  let siteVariables: SiteVariables;
  try {
    siteVariables = isDev ? getDevSiteVariables() : getProdSiteVariables();
  } catch (error) {
    fail([diagnosticFromError(error)]);
  }

  const traceToolAvailability = checkTraceToolAvailability();
  if (!traceToolAvailability.java) {
    log.warn`javac was not found; literate Java pages will not include execution output`;
  }

  let result: Awaited<ReturnType<typeof buildSite>>;
  try {
    result = await buildSite({
      siteVariables,
      mode,
      isWatchMode: false,
      traceCache: new Map(),
      traceToolAvailability,
    });
  } catch (error) {
    fail([diagnosticFromError(error)]);
  }
  if (!result.ok) {
    fail(result.diagnostics);
  }

  try {
    await (isDev ? publishDev(result.snapshot) : publishProd(result.snapshot));
  } catch (error) {
    fail([
      diagnosticFromError(
        new Error(`Failed to write output: ${(error as Error).message}`),
      ),
    ]);
  }
  printFlair();
}
