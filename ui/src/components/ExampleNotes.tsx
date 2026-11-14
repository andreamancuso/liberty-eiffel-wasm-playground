import type { Example } from "../examples";
export function ExampleNotes({ example }: { example: Example }) {
  const selected = example.id;
  return (
    <aside id="notes" aria-labelledby="example-title" key={selected}>
      <span className="section-kicker">
        {selected === "my-program" ? "Make it yours" : "Explore Eiffel"}
      </span>
      <h2 id="example-title">{example.title}</h2>
      <p>{example.summary}</p>
      <h3>What to expect</h3>
      <p>{example.expected}</p>
      <div className="try-this">
        <h3>Try this</h3>
        <p>{example.experiment}</p>
      </div>
      {example.hints && (
        <details className="hints">
          <summary>More contract experiments</summary>
          {example.hints.map((hint) => (
            <p key={hint}>{hint}</p>
          ))}
        </details>
      )}
    </aside>
  );
}
