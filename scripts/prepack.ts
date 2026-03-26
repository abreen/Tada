import { Glob } from 'bun';
import { unlink } from 'node:fs/promises';

const glob = new Glob('**/*.class');

let count = 0;
for await (const path of glob.scan()) {
  await unlink(path);
  count++;
}

if (count > 0) {
  console.log(`Removed ${count} Java .class file${count > 1 ? 's' : ''}.`);
}
