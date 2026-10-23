import pkg from '../package.json';

const bump = process.argv[2];
const [major, minor, patch] = pkg.version.split('.').map(Number);

let version: string;
if (bump === 'patch') {
  version = `${major}.${minor}.${patch + 1}`;
} else if (bump === 'minor') {
  version = `${major}.${minor + 1}.0`;
} else if (bump === 'major') {
  version = `${major + 1}.0.0`;
} else {
  console.error('Usage: bun run scripts/check-changelog.ts patch|minor|major');
  process.exit(1);
}

const changelog = await Bun.file(`${import.meta.dir}/../CHANGELOG.md`).text();
if (!changelog.split(/\r?\n/).includes(`## ${version}`)) {
  console.error(`Error: CHANGELOG.md has no "## ${version}" section.`);
  process.exit(1);
}
