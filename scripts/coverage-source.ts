import { createInstrumenter } from 'istanbul-lib-instrument';

export function instrumentCoverageSource(source: string, filePath: string) {
  const transpiler = new Bun.Transpiler({ loader: 'ts', target: 'bun' });
  const instrumenter = createInstrumenter({
    esModules: true,
    compact: false,
    produceSourceMap: false,
    parserPlugins: ['typescript'],
  });
  const instrumented = instrumenter.instrumentSync(source, filePath);
  const code = transpiler.transformSync(instrumented);
  return { code, coverage: instrumenter.lastFileCoverage() };
}
