// Writes spec/proofread-rules.md, the list of rules in the installed Harper
import fs from 'fs';
import { LocalLinter } from 'harper.js';
import { binary } from 'harper.js/binary';

const { version } = (await import('harper.js/package.json')) as {
  version: string;
};

const linter = new LocalLinter({ binary });
const descriptions = await linter.getLintDescriptions();
const defaults = await linter.getDefaultLintConfig();

// Table cells cannot hold line breaks or unescaped pipes
function toCell(markdown: string): string {
  return markdown
    .trim()
    .replace(/\s*\n\s*/g, ' ')
    .replace(/\|/g, '\\|');
}

const rows = Object.keys(descriptions)
  .sort()
  .map(
    name =>
      `| \`${name}\` | ${defaults[name] ? 'Yes' : 'No'} | ${toCell(descriptions[name])} |`,
  );

const markdown = `# Proofreading rules

The rules Harper ${version} checks for, which the \`rules\` option of
[proofreading](proofread.md) turns on or off by name.

This file is generated; run \`bun run harper-rules\` after updating \`harper.js\`.

| Name | Enabled by default | Description |
| --- | --- | --- |
${rows.join('\n')}
`;

fs.writeFileSync(
  new URL('../spec/proofread-rules.md', import.meta.url),
  markdown,
);
console.log(`Wrote ${rows.length} rules for Harper ${version}`);
