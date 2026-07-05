import "./App.css";

// Pre-MVP shell. M1 replaces this with the recent-projects screen
// (docs/DESIGN.md §6.1).
function App() {
  return (
    <main className="app-shell">
      <h1>OKF Editor</h1>
      <p>
        A local-first, schema-aware editor for Open Knowledge Format bundles.
      </p>
      <p className="status">Pre-MVP — see docs/PLAN.md for the roadmap.</p>
    </main>
  );
}

export default App;
