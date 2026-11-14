export function validateInput({ files, rootClass } = {}) {
  if (
    !files ||
    typeof files !== "object" ||
    Array.isArray(files) ||
    !Object.keys(files).length
  )
    throw new Error("Provide at least one Eiffel source file.");
  for (const [name, source] of Object.entries(files)) {
    if (!/^[a-zA-Z][a-zA-Z0-9_]*\.e$/.test(name) || typeof source !== "string")
      throw new Error("Source files must have .e basenames and text contents.");
  }
  if (!Object.hasOwn(files, rootClass))
    throw new Error("The root class must name a submitted .e file.");
}
