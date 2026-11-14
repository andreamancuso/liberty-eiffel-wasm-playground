import { examples } from "../examples";
interface Props {
  selected: string;
  busy: boolean;
  notesVisible: boolean;
  choose: (id: string) => void;
  toggleNotes: () => void;
}
export function ExampleChooser({
  selected,
  busy,
  notesVisible,
  choose,
  toggleNotes,
}: Props) {
  return (
    <div className="example-bar">
      <label htmlFor="example">Explore</label>
      <select
        id="example"
        value={selected}
        disabled={busy}
        onChange={(event) => choose(event.target.value)}
      >
        <optgroup label="Examples">
          {examples
            .filter((item) => item.id !== "my-program")
            .map((item) => (
              <option key={item.id} value={item.id}>
                {item.title}
              </option>
            ))}
        </optgroup>
        <optgroup label="Your workspace">
          <option value="my-program">My program</option>
        </optgroup>
      </select>
      <button
        className="text-button"
        onClick={toggleNotes}
        aria-expanded={notesVisible}
        aria-controls="notes"
      >
        {notesVisible ? "Hide notes" : "Show notes"}
      </button>
    </div>
  );
}
