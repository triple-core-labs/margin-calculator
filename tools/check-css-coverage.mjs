/**
 * Fail the build when a class used in a template has no rule in the shipped CSS.
 *
 * A utility class that the framework never generated produces no error of any
 * kind: the element simply keeps its browser defaults, which is how white text
 * once landed on a white control. This compares every class name written in a
 * template against the class names the built stylesheet and the component
 * stylesheets actually define.
 *
 * Usage: node tools/check-css-coverage.mjs [outputDir]
 */
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, extname } from 'path';

const OUTPUT_DIR = process.argv[2] ?? 'docs';
const SOURCE_DIR = 'src';

/** Classes the framework uses as markers and deliberately gives no rules of their own. */
const MARKERS = new Set(['group', 'peer']);

function walk(dir) {
  const found = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      found.push(...walk(path));
    } else {
      found.push(path);
    }
  }
  return found;
}

function templateClasses(files) {
  const used = new Map();
  const staticAttr = /\bclass\s*=\s*"([^"]*)"/g;
  const boundClass = /\[class\.([^\]]+)\]/g;

  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    const add = (name) => {
      if (!name || name.includes('{{')) return;
      if (!used.has(name)) used.set(name, file);
    };
    for (const match of source.matchAll(staticAttr)) {
      match[1].split(/\s+/).forEach(add);
    }
    for (const match of source.matchAll(boundClass)) {
      add(match[1]);
    }
  }
  return used;
}

function definedClasses(files) {
  const defined = new Set();
  const selector = /\.((?:[\\][\s\S]|[A-Za-z0-9_-])+)/g;

  for (const file of files) {
    const css = readFileSync(file, 'utf8');
    for (const match of css.matchAll(selector)) {
      defined.add(match[1].replace(/\\/g, ''));
    }
  }
  return defined;
}

const templates = walk(SOURCE_DIR).filter((f) => ['.html', '.ts'].includes(extname(f)));
const componentStyles = walk(SOURCE_DIR).filter((f) => extname(f) === '.css');
const builtStyles = walk(OUTPUT_DIR).filter((f) => extname(f) === '.css');

if (builtStyles.length === 0) {
  console.error(`No stylesheet found in ${OUTPUT_DIR}. Build before running this check.`);
  process.exit(1);
}

const used = templateClasses(templates);
const defined = definedClasses([...builtStyles, ...componentStyles]);
const missing = [...used].filter(([name]) => !defined.has(name) && !MARKERS.has(name));

if (missing.length > 0) {
  console.error(`${missing.length} class name(s) used in a template have no rule in the built CSS:`);
  for (const [name, file] of missing) {
    console.error(`  ${name}  (${file})`);
  }
  process.exit(1);
}

console.log(`${used.size} template class names, all present in the built CSS.`);
