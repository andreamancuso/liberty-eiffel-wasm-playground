import {
  contractFailure,
  sourceLocations,
  type SourceLocation,
} from "../diagnostics";
import type { Project } from "../projects";
import type { Execution } from "../hooks/useRun";
import { statusMessages } from "../run-status";
interface Props {
  project: Project;
  execution: Execution;
  onJump: (location: SourceLocation) => void;
}
export function OutputPanel({ project, execution, onJump }: Props) {
  const { result, stdout, stderr, busy } = execution;
  let details = "";
  if (result?.status === "compiler_error" || result?.status === "invalid_input")
    details = result.diagnostics ?? "";
  if (result?.status === "unsupported_feature")
    details = "rescue/retry is not supported yet.";
  const errorText = [stderr, details].filter(Boolean).join("\n");
  const failure = contractFailure(errorText);
  const failed = result && !["success", "cancelled"].includes(result.status);
  const locations = sourceLocations(errorText, project.files);
  let outputText = stdout;
  if (!outputText && !busy)
    outputText = result ? "No output." : "Your output will appear here.";
  return (
    <>
      <section className="output" aria-labelledby="output-title">
        <h2 id="output-title">Output</h2>
        <pre id="stdout">{outputText}</pre>
      </section>
      <section id="errors" className="errors" hidden={!errorText && !failed}>
        <h2>{failure ?? "Errors"}</h2>
        <div className="source-links">
          {locations.map((location) => (
            <button
              key={`${location.file}:${location.line}:${location.column}`}
              onClick={() => {
                onJump(location);
              }}
            >
              {location.file}:{location.line}:{location.column}
            </button>
          ))}
        </div>
        {failure ? (
          <details>
            <summary>Show Eiffel trace</summary>
            <pre id="diagnostics">{errorText}</pre>
          </details>
        ) : (
          <pre id="diagnostics">
            {errorText ||
              statusMessages[result?.status ?? ""] ||
              "Your program could not be compiled."}
          </pre>
        )}
      </section>
    </>
  );
}
