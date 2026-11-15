import { useState } from "react";
import { Editor } from "./Editor";
import { useRun } from "./hooks/useRun";
import { useWorkspace } from "./hooks/useWorkspace";
import { ExampleChooser } from "./components/ExampleChooser";
import { ExampleNotes } from "./components/ExampleNotes";
import { FileControls } from "./components/FileControls";
import { ProjectDialog } from "./components/ProjectDialog";
import { RunControls } from "./components/RunControls";
import { OutputPanel } from "./components/OutputPanel";

export default function App() {
  const execution = useRun();
  const workspace = useWorkspace(execution.busy, execution.clear);
  const [notesVisible, setNotesVisible] = useState(true);
  const { project, example, selected, update, editorKey } = workspace;
  const run = () => execution.run(project);
  return (
    <>
      <header className="page-header">
        <div>
          <h1>Liberty Eiffel playground</h1>
        </div>
      </header>
      <main>
        <ExampleChooser
          selected={selected}
          busy={execution.busy}
          notesVisible={notesVisible}
          choose={workspace.choose}
          toggleNotes={() => setNotesVisible((value) => !value)}
        />
        {workspace.notice && (
          <p className="saving-notice" role="status">
            {workspace.notice}
          </p>
        )}
        <div className={`playground ${notesVisible ? "" : "without-notes"}`}>
          {notesVisible && <ExampleNotes key={selected} example={example} />}
          <section className="workspace" aria-label="Eiffel project">
            <FileControls
              project={project}
              busy={execution.busy}
              update={update}
              setDialog={workspace.setDialog}
            />
            <div
              role="tabpanel"
              id="editor-panel"
              aria-labelledby={`file-${project.activeFile}`}
            >
              <Editor
                key={editorKey}
                projectId={editorKey}
                filename={project.activeFile}
                text={project.files[project.activeFile]}
                readOnly={execution.busy}
                onChange={(text) =>
                  update((current) => ({
                    ...current,
                    files: { ...current.files, [current.activeFile]: text },
                  }))
                }
                onRun={run}
                jump={workspace.jump}
              />
            </div>
            <p className="editor-help">
              Ctrl / ⌘ Enter to run · Esc, then Tab to leave the editor
            </p>
            <RunControls
              project={project}
              execution={execution}
              reset={workspace.reset}
              update={update}
              run={run}
            />
            <OutputPanel
              project={project}
              execution={execution}
              onJump={workspace.showLocation}
            />
          </section>
        </div>
      </main>
      <footer>
        <a href="https://beyond-tabs.com">Beyond Tabs</a>
        <span>·</span>
        <a href="https://github.com/andreamancuso/liberty-eiffel-wasm-playground">
          Source
        </a>
      </footer>
      {workspace.dialog && (
        <ProjectDialog
          kind={workspace.dialog}
          project={project}
          example={example}
          onClose={() => workspace.setDialog(null)}
          onConfirm={workspace.confirmDialog}
        />
      )}
    </>
  );
}
