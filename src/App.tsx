import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

function App() {
  const [pong, setPong] = useState<string>("…");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    invoke<string>("ping")
      .then(setPong)
      .catch((e) => setError(String(e)));
  }, []);

  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-50 dark:bg-neutral-950">
      <div className="text-center">
        <h1 className="text-3xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
          clobmap
        </h1>
        <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">
          {error ? `IPC error: ${error}` : `frontend ↔ rust: ${pong}`}
        </p>
      </div>
    </main>
  );
}

export default App;
