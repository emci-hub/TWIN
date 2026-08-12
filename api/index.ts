import { createServer } from "./server.js";
import { createStore } from "./store.js";
import { PORT, ACTIVE_PROVIDER } from "./config.js";

const store = await createStore();
const app = createServer(store);

app.listen(PORT, () => {
  console.log(`TwinArchitect API listening on :${PORT} (LLM_PROVIDER=${ACTIVE_PROVIDER})`);
});
