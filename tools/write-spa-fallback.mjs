/**
 * Copy the built index to 404.html.
 *
 * The build output is served from a static host that answers an unknown path
 * with 404.html, so the fallback has to carry the same hashed bundles as the
 * index or a deep link loads nothing.
 */
import { copyFileSync, existsSync } from 'fs';

const OUTPUT_DIR = process.argv[2] ?? 'docs';
const index = `${OUTPUT_DIR}/index.html`;

if (!existsSync(index)) {
  console.error(`No index.html in ${OUTPUT_DIR}. Build before running this.`);
  process.exit(1);
}

copyFileSync(index, `${OUTPUT_DIR}/404.html`);
console.log(`${OUTPUT_DIR}/404.html written from index.html`);
