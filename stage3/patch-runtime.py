import pathlib
source = pathlib.Path('/runtime/src/shared.js').read_text()
# Export the low-level WASI application and filesystem, without loading a sysroot for execution.
needle = 'return API;\n\n})();'
assert source.count(needle) == 1
source = source.replace(needle, 'API.MemFS = MemFS; API.App = App; API.ProcExit = ProcExit;\nreturn API;\n\n})();\nexport default API;')
assert source.count('this.memfs = new MemFS({') == 1
source = source.replace('this.memfs = new MemFS({', 'this.memfs = new (options.MemFS || MemFS)({')
pathlib.Path('/out/toolchain/runtime.mjs').write_text(source)
