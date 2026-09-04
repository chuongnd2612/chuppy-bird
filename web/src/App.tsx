import { Route, Routes } from 'react-router-dom';

function Placeholder({ name }: { name: string }) {
  return (
    <main className="page">
      <h1>{name}</h1>
      <p className="muted">Coming in the next step.</p>
    </main>
  );
}

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Placeholder name="Projects" />} />
      <Route path="/login" element={<Placeholder name="Sign in" />} />
      <Route path="/p/:project" element={<Placeholder name="Board" />} />
      <Route path="/p/:project/wi/:id" element={<Placeholder name="Work item" />} />
      <Route path="*" element={<Placeholder name="Not found" />} />
    </Routes>
  );
}
