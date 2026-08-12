import { createServer } from "./server.js";
import { createStore } from "./store.js";
import { PORT, ACTIVE_PROVIDER } from "./config.js";

// Last-resort safety net (Phase 7 — "basic error logging"): anything that
// escapes the per-route asyncHandler + global error middleware in
// server.ts still gets logged here instead of failing silently. Exits so
// the host's process supervisor (Render, in production) restarts with a
// clean process rather than one left in a possibly-inconsistent state.
process.on("unhandledRejection", (reason) => {
  console.error("[unhandledRejection]", reason);
  process.exit(1);
});
process.on("uncaughtException", (err) => {
  console.error("[uncaughtException]", err);
  process.exit(1);
});

const store = await createStore();
const app = createServer(store);

app.listen(PORT, () => {
  console.log(`TwinArchitect API listening on :${PORT} (LLM_PROVIDER=${ACTIVE_PROVIDER})`);
});
