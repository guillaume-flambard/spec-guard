import { runAction } from './main.js';

// No top-level await: the bundle is CommonJS, because `typescript` reaches for
// `require` at runtime and an ESM bundle turns that into a hard failure.
//
// process.exitCode rather than process.exit(), for the same reason the CLI does
// it: an immediate exit truncates stdout, and stdout is where the workflow
// commands live.
void runAction().then((code) => {
  process.exitCode = code;
});
