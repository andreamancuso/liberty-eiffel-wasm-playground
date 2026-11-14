import { useLayoutEffect, useEffect, useRef } from "react";
import { EditorState, Compartment } from "@codemirror/state";
import {
  EditorView,
  lineNumbers,
  highlightActiveLineGutter,
  highlightActiveLine,
  keymap,
} from "@codemirror/view";
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
} from "@codemirror/commands";
import { searchKeymap, highlightSelectionMatches } from "@codemirror/search";
import {
  StreamLanguage,
  syntaxHighlighting,
  defaultHighlightStyle,
  indentUnit,
} from "@codemirror/language";
import { eiffel } from "@codemirror/legacy-modes/mode/eiffel";
import type { SourceLocation } from "./diagnostics";

const states = new Map<string, EditorState>();
const editable = new Compartment(),
  callbacks = new Compartment();
export function forgetEditors(projectId: string) {
  for (const key of states.keys())
    if (key.startsWith(projectId + "/")) states.delete(key);
}
export function Editor({
  projectId,
  filename,
  text,
  readOnly,
  onChange,
  onRun,
  jump,
}: {
  projectId: string;
  filename: string;
  text: string;
  readOnly: boolean;
  onChange: (text: string) => void;
  onRun: () => void;
  jump: (SourceLocation & { serial: number }) | null;
}) {
  const container = useRef<HTMLDivElement>(null),
    view = useRef<EditorView | null>(null);
  const change = useRef(onChange),
    run = useRef(onRun);
  change.current = onChange;
  run.current = onRun;
  useLayoutEffect(() => {
    const key = projectId + "/" + filename;
    const handlers = [
      keymap.of([
        {
          key: "Mod-Enter",
          run: () => {
            run.current();
            return true;
          },
        },
        ...defaultKeymap,
        ...historyKeymap,
        ...searchKeymap,
        indentWithTab,
      ]),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) change.current(update.state.doc.toString());
      }),
    ];
    const editability = [
      EditorState.readOnly.of(readOnly),
      EditorView.editable.of(!readOnly),
    ];
    let state = states.get(key);
    if (!state || state.doc.toString() !== text)
      state = EditorState.create({
        doc: text,
        extensions: [
          lineNumbers(),
          highlightActiveLineGutter(),
          highlightActiveLine(),
          history(),
          highlightSelectionMatches(),
          StreamLanguage.define(eiffel),
          syntaxHighlighting(defaultHighlightStyle),
          indentUnit.of("   "),
          callbacks.of(handlers),
          // CodeMirror's Escape then Tab escape hatch remains available with tab indentation.
          editable.of(editability),
          EditorView.contentAttributes.of({
            "aria-label": "Eiffel source",
            spellcheck: "false",
          }),
          EditorView.theme({
            "&": { fontSize: "14px" },
            ".cm-content": {
              fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace",
              minHeight: "310px",
            },
            ".cm-scroller": { overflow: "auto" },
            "&.cm-focused": {
              outline: "2px solid #35634b",
              outlineOffset: "-2px",
            },
            ".cm-gutters": {
              backgroundColor: "#f6f7f4",
              color: "#778074",
              borderRight: "1px solid #e1e5df",
            },
          }),
        ],
      });
    state = state.update({
      effects: [
        editable.reconfigure(editability),
        callbacks.reconfigure(handlers),
      ],
    }).state;
    view.current = new EditorView({ state, parent: container.current! });
    return () => {
      states.set(key, view.current!.state);
      view.current!.destroy();
      view.current = null;
    };
    // File switches deliberately keep each file's selection and undo history.
  }, [projectId, filename]);
  useEffect(() => {
    view.current?.dispatch({
      effects: editable.reconfigure([
        EditorState.readOnly.of(readOnly),
        EditorView.editable.of(!readOnly),
      ]),
    });
  }, [readOnly, projectId, filename]);
  useEffect(() => {
    const editor = view.current;
    if (editor && editor.state.doc.toString() !== text)
      editor.dispatch({
        changes: { from: 0, to: editor.state.doc.length, insert: text },
      });
  }, [text]);
  useEffect(() => {
    const editor = view.current;
    if (
      !editor ||
      !jump ||
      jump.file !== filename ||
      jump.line > editor.state.doc.lines
    )
      return;
    const line = editor.state.doc.line(jump.line),
      pos = Math.min(line.to, line.from + jump.column - 1);
    editor.dispatch({
      selection: { anchor: pos },
      effects: EditorView.scrollIntoView(pos, { y: "center" }),
    });
    editor.focus();
  }, [jump, filename]);
  return <div id="source" ref={container} className="editor" />;
}
