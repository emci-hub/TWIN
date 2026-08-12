// Full quiz over HTTP — the literal "test script that runs a full quiz over
// HTTP" from docs/BUILD.md Phase 5. Spawns a real API server as a child
// process (so env vars like LLM_PROVIDER and the quota-cap demo below apply
// cleanly) and drives it purely with fetch, exactly like a real client.
//
// Uses LLM_PROVIDER=mock throughout — no real provider is called, no API
// key is needed, and nothing spends real money or the Claude build credit
// just from running this script. It still exercises the real quota guard
// and rate limiter, since "mock" goes through the exact same code path as
// "anthropic"/"openrouter" in server.ts.
//
// Run with: npm run test:http (from /api)

import { spawn, type ChildProcess } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const apiDir = join(__dirname, "..");

const PORT = 4010;
const BASE = `http://127.0.0.1:${PORT}`;

// A readiness poll, not an unbounded retry — capped, per docs/CORE.md's
// "no unbounded loops" rule.
const HEALTH_CHECK_MAX_ATTEMPTS = 30;

const TSX_BIN = join(apiDir, "node_modules", ".bin", "tsx");

function startServer(extraEnv: Record<string, string>): ChildProcess {
  // Run the local tsx binary directly (not via `npx tsx`) — npx spawns its
  // own wrapper process, and killing that wrapper doesn't reliably kill the
  // real server process underneath it, which left orphaned servers running
  // (and this script hanging) during development.
  return spawn(TSX_BIN, ["index.ts"], {
    cwd: apiDir,
    env: { ...process.env, PORT: String(PORT), ...extraEnv },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

async function stopServer(server: ChildProcess): Promise<void> {
  if (server.exitCode !== null || server.killed) return;
  server.kill("SIGTERM");
  const exited = await Promise.race([
    new Promise<boolean>((resolve) => server.once("exit", () => resolve(true))),
    sleep(2000).then(() => false),
  ]);
  if (!exited) {
    server.kill("SIGKILL"); // capped escalation, not an unbounded wait
  }
}

async function waitForHealth(): Promise<void> {
  for (let attempt = 0; attempt < HEALTH_CHECK_MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(`${BASE}/health`);
      if (res.ok) return;
    } catch {
      // server not up yet — fall through and retry
    }
    await sleep(200);
  }
  throw new Error(`server did not become healthy after ${HEALTH_CHECK_MAX_ATTEMPTS} attempts`);
}

interface Target {
  dim: string;
  direction: "+" | "-";
  strength: string;
}
interface Option {
  id: string;
  targets: Target[];
}
interface Question {
  id: string;
  options: Option[];
}

/** Always answers with whichever option pushes '+' for the question's dimension. */
function consistentPick(question: Question): string {
  const plus = question.options.find((o) => o.targets.some((t) => t.direction === "+"));
  return (plus ?? question.options[0]).id;
}

async function runFullQuiz(): Promise<void> {
  const sessionRes = await fetch(`${BASE}/session`, { method: "POST" });
  if (!sessionRes.ok) throw new Error(`POST /session failed: ${sessionRes.status}`);
  const sessionData = await sessionRes.json();
  const sessionId: string = sessionData.session_id;
  console.log(`session started: ${sessionId}`);

  let batch: Question[] = sessionData.batch;
  let done = false;
  let answeredCount = 0;
  const seenIds = new Set<string>();

  const MAX_ROUNDS = 200; // loop guard — never unbounded
  let round = 0;

  while (!done) {
    round += 1;
    if (round > MAX_ROUNDS) {
      throw new Error("full-quiz script exceeded its round guard — possible infinite loop");
    }
    if (batch.length === 0) break;

    for (const question of batch) {
      if (seenIds.has(question.id)) {
        throw new Error(`question_id ${question.id} was served twice — no-repeat rule violated`);
      }
      seenIds.add(question.id);

      const optionId = consistentPick(question);
      const answerRes = await fetch(`${BASE}/answer`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ session_id: sessionId, question_id: question.id, option_id: optionId }),
      });
      if (!answerRes.ok) {
        throw new Error(`POST /answer failed: ${answerRes.status} ${await answerRes.text()}`);
      }
      const answerData = await answerRes.json();
      answeredCount += 1;
      done = answerData.done;
      batch = answerData.batch;
      if (done) break;
    }
  }

  console.log(
    `quiz finished after ${answeredCount} answers, ${seenIds.size} unique question_ids, no repeats confirmed`,
  );

  const compileRes = await fetch(`${BASE}/compile`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ session_id: sessionId }),
  });
  if (!compileRes.ok) throw new Error(`POST /compile failed: ${compileRes.status}`);
  const compiled = await compileRes.json();
  console.log("--- compiled twin prompt ---");
  console.log(compiled.prompt);
  console.log(`included dimensions: ${compiled.included_dimensions.join(", ")}`);

  const chatRes = await fetch(`${BASE}/twin/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ session_id: sessionId, message: "hey, what's up?" }),
  });
  if (!chatRes.ok) {
    throw new Error(`POST /twin/chat failed: ${chatRes.status} ${await chatRes.text()}`);
  }
  const chatData = await chatRes.json();
  console.log("--- twin chat reply (mock provider — no real call/spend) ---");
  console.log(chatData);
}

async function runQuotaCapDemo(): Promise<void> {
  const sessionRes = await fetch(`${BASE}/session`, { method: "POST" });
  const { session_id: sessionId } = await sessionRes.json();

  const first = await fetch(`${BASE}/twin/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ session_id: sessionId, message: "hi" }),
  });
  console.log(`first /twin/chat call: ${first.status}`);
  if (first.status !== 200) {
    throw new Error(`expected the first call (within the cap) to succeed, got ${first.status}`);
  }

  const second = await fetch(`${BASE}/twin/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ session_id: sessionId, message: "hi again" }),
  });
  const secondBody = await second.json();
  console.log(`second /twin/chat call: ${second.status}`, secondBody);

  if (second.status !== 429) {
    throw new Error(`expected the second call to be refused with 429, got ${second.status}`);
  }
  if (!/twin's resting/i.test(secondBody.error ?? "")) {
    throw new Error('expected the friendly "twin\'s resting" refusal message');
  }
  console.log("quota guard confirmed: second call refused before ever reaching the provider");
}

async function withServer(env: Record<string, string>, run: () => Promise<void>): Promise<void> {
  const server = startServer(env);
  let stderr = "";
  server.stderr?.on("data", (chunk) => {
    stderr += chunk.toString();
  });
  try {
    await waitForHealth();
    await run();
  } catch (err) {
    if (stderr) console.error("--- server stderr ---\n" + stderr);
    throw err;
  } finally {
    await stopServer(server);
  }
}

async function main(): Promise<void> {
  console.log("=== Full quiz over HTTP (mock provider, normal limits) ===");
  await withServer({ LLM_PROVIDER: "mock" }, runFullQuiz);

  console.log("");
  console.log("=== Quota guard demo (MOCK_RPD=1) ===");
  await withServer({ LLM_PROVIDER: "mock", MOCK_RPD: "1" }, runQuotaCapDemo);

  console.log("");
  console.log("ALL CHECKS PASSED");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("FULL-QUIZ HTTP TEST FAILED:", err);
    process.exit(1);
  });
