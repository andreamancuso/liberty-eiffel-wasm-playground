import assert from "node:assert/strict";
import { initialize, translate } from "/out/runtime/eiffel/translator.mjs";
let stdout = [],
  stderr = [];
let { module } = await initialize({ stdout, stderr });
assert.equal(module.callMain(["-version"]), 0);
assert.match([...stdout, ...stderr].join("\n"), /Liberty/i);
stdout = [];
stderr = [];
({ module } = await initialize({ stdout, stderr }));
const result = translate(
  module,
  {
    rootClass: "hello.e",
    files: {
      "hello.e":
        'class HELLO create {} make feature {} make do io.put_string("Node compiler smoke%N") end end',
    },
  },
  stdout,
  stderr,
);
console.log(
  JSON.stringify(
    { ...result, artifacts: Object.keys(result.artifacts) },
    null,
    2,
  ),
);
assert.equal(result.exitCode, 0);
assert.ok(result.artifacts["hello.c"] && result.artifacts["hello.h"]);
console.log(
  "PASS: WASM compiler version and Eiffel-to-C translation under Node.",
);
