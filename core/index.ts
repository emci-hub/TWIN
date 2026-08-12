// Single import surface for /api (and later /web, /ios via the API) to pull
// from — so callers do `import { ... } from "../core/index.js"` instead of
// reaching into individual files. /core stays the only place scoring/twin
// logic is implemented; this file just re-exports it.

export {
  createDimensionState,
  applyEvidence,
  computeValue,
  computeConfidence,
  scoreDimension,
  STRENGTH_ORDER,
  STRENGTH_WEIGHTS,
  type Direction,
  type Strength,
  type DimensionState,
  type DimensionScore,
} from "./scoring.js";

export {
  evaluateEvidence,
  gateAnswer,
  getSourceEntry,
  MAX_DIMENSIONS_PER_ANSWER,
  type RawEvidence,
  type GatedEvidence,
  type DroppedEvidence,
  type DropReason,
  type EvidenceSourceEntry,
  type EvidenceSourceRegistry,
  type GateResult,
} from "./evidence-gate.js";

export {
  ProfileBuilder,
  DIMENSION_IDS,
  type Profile,
  type DimensionProfile,
} from "./profile.js";

export {
  QuizSession,
  QUESTION_BANK,
  DEFAULT_QUIZ_CONFIG,
  selectQuickStart,
  selectSharpenBatch,
  shouldStop,
  computeOverallConfidence,
  computeEffectiveConfidence,
  type Question,
  type Option,
  type QuizConfig,
  type QuizPhase,
  type StopReason,
  type StopCheck,
} from "./question-delivery.js";

export {
  compileTwinPrompt,
  getHedgePhrase,
  findBannedWords,
  CONFIDENCE_THRESHOLD,
  BANNED_WORDS,
  DIMENSIONS_CONTENT,
  type CompiledTwin,
  type CompiledDimensionLine,
  type TwinCopy,
  type HedgeBand,
  type DimensionCopy,
} from "./twin-compiler.js";
