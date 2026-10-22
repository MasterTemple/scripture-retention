// Runs the README's TypeScript examples as one program and checks each `// → value` (the
// value as JSON). Run `npm run pack:wasm` in the crate first.
import { readFileSync, writeFileSync } from "node:fs";

const readme = readFileSync(new URL("../../README.md", import.meta.url), "utf8");
const blocks = [...readme.matchAll(/```ts\n([\s\S]*?)```/g)].map((m) => m[1]!);
const imports: string[] = [];
const body: string[] = [];
for (const line of blocks.join("\n").split("\n")) {
  if (line.startsWith("import ")) imports.push(line);
  else {
    const check = /^(.*?);\s*\/\/ → (.*)$/.exec(line);
    body.push(check ? `__check(${check[1]}, ${JSON.stringify(check[2])});` : line);
  }
}
const program = [
  ...imports,
  "let __failed = 0, __checked = 0;",
  "function __check(value: unknown, expected: string) {",
  "  __checked++;",
  "  const got = JSON.stringify(value);",
  "  if (got !== expected) { __failed++; console.error(`expected ${expected}, got ${got}`); }",
  "}",
  ...body,
  "console.log(__failed ? `${__failed} of ${__checked} README examples differ` : `All ${__checked} README examples hold.`);",
  "process.exit(__failed ? 1 : 0);",
].join("\n");
const file = new URL("./.readme-run.ts", import.meta.url);
writeFileSync(file, program);
await import(file.href);
