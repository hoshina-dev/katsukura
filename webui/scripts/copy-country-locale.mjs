/**
 * Copies the English locale file from i18n-iso-countries into the project so
 * that country names can be overridden without touching node_modules.
 *
 * Run:  pnpm copy:country-locale
 *
 * After running, edit src/libs/data/countries-en.json to fix any names.
 * Re-run any time you upgrade i18n-iso-countries to refresh the base data
 * (your overrides live as a separate patch applied on top — see countries.ts).
 */

import { copyFileSync, mkdirSync } from "fs";
import { createRequire } from "module";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const src = require.resolve("i18n-iso-countries/langs/en.json");
const dest = resolve(__dirname, "../src/libs/data/countries-en.json");

mkdirSync(dirname(dest), { recursive: true });
copyFileSync(src, dest);

console.log(`Copied:\n  ${src}\n→ ${dest}`);
console.log(
  "Edit src/libs/data/countries-en.json to override any country names.",
);
