import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

export const DEFAULT_API_BASE_URL = "https://staging-api.cuey.io/api/cuey";
export const LATEST_RESULT_PATH = path.join(
  homedir(),
  "Library",
  "Application Support",
  "Cuey",
  "Claude",
  "latest-ask-cuey-result.json",
);

export const DEFAULT_MODELS = [
  "grok-4.5-reasoning",
  "gpt-5.6-sol",
  "claude-opus-4-8",
];

export const ADVANCED_REASONING_MODEL_ALIASES = {
  "claude-opus-4-8": "claude-opus-4-8-think",
  "claude-sonnet-4-6": "claude-sonnet-4-6-think",
  "native/gemini-3.1-pro-preview": "native/gemini-3.1-pro-preview-think",
  "grok-4.3": "grok-4.3-reasoning",
  "grok-4.5": "grok-4.5-reasoning",
};

export const COMPARE_OUTPUT_FORMAT_PROMPT = `Answer in Markdown. Add tags after each element:

## Heading {#section-1}
Paragraph text {#para-1-1}
Next paragraph {#para-1-2}

### Sub {#section-1-1}
Content {#para-1-1-1}

- Item {#list-1-1}
- Item {#list-1-2}

\`\`\`code
\`\`\` {#code-1}

Tags: {#section-N}, {#para-X-Y}, {#list-X-Y}, {#code-N}`;

const DEFAULT_TIMEOUT_MS = 120000;
const DEFAULT_SYNTHESIS_TIMEOUT_MS = 90000;
const DEFAULT_SYNTHESIS_ATTEMPTS = 2;
const MAX_ERROR_MESSAGE_LENGTH = 260;

function cleanBaseUrl(value) {
  return String(value || DEFAULT_API_BASE_URL).replace(/\/+$/, "");
}

function cleanModelId(value) {
  return String(value || "").trim();
}

function resolveModelForReasoningLevel(modelId, reasoningLevel) {
  const id = cleanModelId(modelId);
  if (reasoningLevel !== "advanced") return id;
  return ADVANCED_REASONING_MODEL_ALIASES[id] || id;
}

function normalizeModels(models, reasoningLevel = "standard") {
  const source = Array.isArray(models) && models.length > 0 ? models : DEFAULT_MODELS;
  const seen = new Set();
  const out = [];
  for (const model of source) {
    const id = resolveModelForReasoningLevel(
      typeof model === "string" ? model : model?.id || model?.key,
      reasoningLevel,
    );
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    if (out.length >= 3) break;
  }
  return out.length > 0 ? out : DEFAULT_MODELS;
}

function normalizeReasoningLevel(value) {
  const normalized = String(value || "standard").trim().toLowerCase();
  return normalized === "advanced" ? "advanced" : "standard";
}

function requestHeaders({ token, anonymousId, json = true } = {}) {
  const headers = {};
  if (json) headers["Content-Type"] = "application/json";
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  } else if (anonymousId) {
    headers["X-Cuey-Anonymous-Id"] = anonymousId;
  }
  return headers;
}

function decodeHtmlEntities(value) {
  return String(value || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

function stripHtml(value) {
  return decodeHtmlEntities(value)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ");
}

export function sanitizeCueyMarkdown(value) {
  return String(value || "")
    .replace(/\s*\{#[^}]+\}/g, "")
    .trim();
}

export function formatCueyErrorMessage(errorLike) {
  const status = errorLike?.status || "";
  const rawMessage = typeof errorLike === "string"
    ? errorLike
    : errorLike?.message || String(errorLike || "Request failed");
  const rawBody = typeof errorLike?.body === "string" ? errorLike.body : "";
  const combined = [rawMessage, rawBody].filter(Boolean).join(" ");
  const statusFromText = combined.match(/\bHTTP\s+(\d{3})\b/i)?.[1]
    || combined.match(/Error code\s+(\d{3})/i)?.[1]
    || status;
  const hasHtml = /<!doctype html|<html[\s>]/i.test(combined);
  const isGatewayTimeout = String(statusFromText) === "504" || /gateway time-?out/i.test(combined);
  const isTimedOut = errorLike?.name === "AbortError" || /aborted|timed out|timeout/i.test(combined);

  if (isGatewayTimeout) {
    return "Cuey backend timed out (HTTP 504). Retry shortly.";
  }
  if (hasHtml || /cloudflare/i.test(combined)) {
    return statusFromText
      ? `Cuey backend returned HTTP ${statusFromText}. Retry shortly.`
      : "Cuey backend returned an HTML error page. Retry shortly.";
  }
  if (isTimedOut) {
    return "Cuey request timed out. Retry shortly or use fewer models.";
  }

  const cleaned = stripHtml(combined).replace(/\s+/g, " ").trim();
  if (!cleaned) return "Request failed.";
  return cleaned.length > MAX_ERROR_MESSAGE_LENGTH
    ? `${cleaned.slice(0, MAX_ERROR_MESSAGE_LENGTH).trim()}...`
    : cleaned;
}

async function fetchJson(url, { method = "POST", headers = {}, body, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await response.text();
    if (!response.ok) {
      const error = new Error(`HTTP ${response.status}: ${response.statusText}${text ? ` - ${text.slice(0, 1000)}` : ""}`);
      error.status = response.status;
      error.body = text;
      throw error;
    }
    if (!text) return {};
    try {
      return JSON.parse(text);
    } catch (error) {
      error.message = `Invalid JSON response: ${error.message}`;
      error.body = text;
      throw error;
    }
  } finally {
    clearTimeout(timer);
  }
}

function extractCompletionText(json) {
  const message = json?.choices?.[0]?.message;
  const content = message?.content ?? json?.content ?? json?.text ?? "";
  return typeof content === "string" ? content.trim() : "";
}

function extractReasoningText(json) {
  const message = json?.choices?.[0]?.message;
  const content = message?.reasoning_content ?? message?.reasoningContent ?? json?.reasoning_content ?? json?.reasoningContent ?? "";
  return typeof content === "string" ? content.trim() : "";
}

export function buildAskCueyMessages({ question, context, mode } = {}) {
  const q = String(question || "").trim();
  const ctx = String(context || "").trim();
  const normalizedMode = String(mode || "ask").trim().toLowerCase() || "ask";
  const userParts = [];
  if (ctx) {
    userParts.push("Relevant context:");
    userParts.push(ctx);
    userParts.push("");
  }
  userParts.push(`Cuey mode: ${normalizedMode}`);
  userParts.push("");
  userParts.push("Question:");
  userParts.push(q);

  return [
    { role: "system", content: COMPARE_OUTPUT_FORMAT_PROMPT },
    { role: "user", content: userParts.join("\n") },
  ];
}

export function normalizeCueyRequest(input = {}) {
  const question = String(input.question || input.prompt || input.request || "").trim();
  if (!question) throw new Error("Missing question");
  const reasoningLevel = normalizeReasoningLevel(input.reasoningLevel || input.reasoning_level);
  return {
    mode: String(input.mode || "ask").trim().toLowerCase() || "ask",
    question,
    context: String(input.context || "").trim(),
    models: normalizeModels(input.models, reasoningLevel),
    reasoningLevel,
    source: String(input.source || "claude_skill").trim() || "claude_skill",
  };
}

export function buildCandidateRequest({ apiBaseUrl, token, anonymousId, model, messages, metadata }) {
  const url = token
    ? `${apiBaseUrl}/chat/completions`
    : `${apiBaseUrl}/chat/completions/public`;
  const body = {
    model,
    messages,
    stream: false,
    temperature: 1,
    metadata,
  };

  return {
    url,
    body,
    headers: requestHeaders({ token, anonymousId: token ? "" : anonymousId, json: true }),
  };
}

async function runCandidate({ apiBaseUrl, token, anonymousId, model, messages, metadata, timeoutMs }) {
  const request = buildCandidateRequest({ apiBaseUrl, token, anonymousId, model, messages, metadata });

  const json = await fetchJson(request.url, {
    headers: request.headers,
    body: request.body,
    timeoutMs,
  });
  const content = extractCompletionText(json);
  if (!content) throw new Error("Empty model response");
  return {
    modelId: model,
    content,
    reasoningContent: extractReasoningText(json),
  };
}

function normalizeCandidatesForBackend(candidateResults) {
  const out = {};
  for (const item of candidateResults) {
    if (!item || item.error || !item.content) continue;
    out[item.modelId] = {
      content: item.content,
      reasoning_content: item.reasoningContent || "",
    };
  }
  return out;
}

export function buildSynthesisRequest({ cueyMessageId, candidateResponses, metadata } = {}) {
  const body = {
    cuey_message_id: cueyMessageId,
    response: "",
    candidate_responses: candidateResponses,
  };
  if (metadata) body.metadata = metadata;
  return body;
}

export async function writeLatestAskCueyResult(result, resultPath = LATEST_RESULT_PATH) {
  const payload = {
    schemaVersion: 1,
    writtenAt: new Date().toISOString(),
    request: result?.request || null,
    cueyMessageId: result?.cueyMessageId || null,
    synthesis: result?.synthesis || null,
    candidates: (result?.candidates || []).map((candidate) => ({
      modelId: candidate?.modelId || "",
      content: candidate?.content || "",
      reasoningContent: candidate?.reasoningContent || "",
      error: candidate?.error || "",
    })),
  };

  await mkdir(path.dirname(resultPath), { recursive: true });
  await writeFile(resultPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return resultPath;
}

function extractSseDataBlocks(src) {
  const normalized = String(src || "").replace(/\r\n/g, "\n");
  const blocks = normalized.split("\n\n");
  const out = [];
  for (const block of blocks) {
    const lines = block.split("\n");
    const data = lines
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).replace(/^\s/, ""))
      .join("\n")
      .trim();
    if (data) out.push(data);
  }
  return out;
}

function extractTextFromStreamJson(value) {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(extractTextFromStreamJson).join("");
  if (typeof value !== "object") return "";

  for (const key of ["content", "text", "chunk", "delta"]) {
    if (typeof value[key] === "string") return value[key];
  }
  const choice = value.choices?.[0];
  if (choice) {
    return extractTextFromStreamJson(choice.delta || choice.message || choice.text || choice);
  }
  return extractTextFromStreamJson(value.message || value.data);
}

function parseSseText(raw) {
  if (!String(raw || "").includes("data:")) return String(raw || "");
  let text = "";
  for (const block of extractSseDataBlocks(raw)) {
    if (block === "[DONE]") continue;
    try {
      text += extractTextFromStreamJson(JSON.parse(block));
    } catch (_) {
      text += block;
    }
  }
  return text.trim();
}

function trimLines(lines) {
  return Array.isArray(lines) ? lines.join("\n").replace(/^\s*---+\s*/g, "").trim() : "";
}

export function parseSynthesisText(streamText) {
  const src = String(streamText || "")
    .replace(/<cuey_memory_refs>[\s\S]*?<\/cuey_memory_refs>/g, "")
    .replace(/\r\n/g, "\n")
    .trim();
  if (!src) return { modelId: "", answer: "", analysis: "", raw: "" };

  const before = [];
  const enhanced = [];
  const summary = [];
  let modelId = "";
  let section = "before";

  for (const line of src.split("\n")) {
    const trimmed = line.trim();
    if (!modelId) {
      const match = trimmed.match(/^model_id\s*:\s*(.+)$/i);
      if (match) {
        modelId = match[1].trim();
        continue;
      }
    }
    if (/^##\s*Enhanced Answer\b/i.test(trimmed)) {
      section = "enhanced";
      continue;
    }
    if (/^##\s*Summary\b/i.test(trimmed)) {
      section = "summary";
      continue;
    }
    if (section === "enhanced" && /^---+\s*$/.test(trimmed)) continue;
    if (section === "enhanced") enhanced.push(line);
    else if (section === "summary") summary.push(line);
    else before.push(line);
  }

  const fallback = before.filter((line) => !/^model_id\s*:/i.test(line.trim()));
  return {
    modelId,
    answer: trimLines(enhanced.length > 0 ? enhanced : fallback),
    analysis: trimLines(summary),
    raw: src,
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function looksLikePartialSynthesisMetadata(value) {
  const compact = String(value || "").replace(/\s+/g, "").toLowerCase();
  if (!compact) return true;
  return "model_id:".startsWith(compact) || compact === "modelid:";
}

export function isUsableSynthesisResult(synthesis) {
  const text = String(synthesis?.answer || synthesis?.raw || "").trim();
  if (!text) return false;
  if (looksLikePartialSynthesisMetadata(text)) return false;
  return true;
}

export function buildFallbackSynthesis(candidates = [], invalidSynthesis = null, error = null) {
  const candidate = candidates.find((item) => item?.content && !item?.error)
    || candidates.find((item) => item?.content);
  return {
    modelId: "",
    answer: candidate?.content || "Cuey synthesis was incomplete. Review the original model answers.",
    analysis: "",
    raw: invalidSynthesis?.raw || invalidSynthesis?.answer || "",
    fallbackReason: error ? formatCueyErrorMessage(error) : "Cuey synthesis returned an incomplete stream.",
    fallbackModelId: candidate?.modelId || "",
  };
}

async function synthesize({ apiBaseUrl, token, anonymousId, cueyMessageId, candidateResponses, metadata, timeoutMs }) {
  const url = `${apiBaseUrl}/chat/completions/auto/detail/stream`;
  const body = buildSynthesisRequest({ cueyMessageId, candidateResponses, metadata });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: requestHeaders({ token, anonymousId, json: true }),
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const raw = await response.text();
    if (!response.ok) {
      const error = new Error(`HTTP ${response.status}: ${response.statusText}${raw ? ` - ${raw.slice(0, 1000)}` : ""}`);
      error.status = response.status;
      error.body = raw;
      throw error;
    }
    const parsedText = parseSseText(raw);
    return parseSynthesisText(parsedText || raw);
  } finally {
    clearTimeout(timer);
  }
}

async function synthesizeWithRetries(args, attempts = DEFAULT_SYNTHESIS_ATTEMPTS) {
  let lastSynthesis = null;
  let lastError = null;
  const maxAttempts = Math.max(1, Number(attempts) || DEFAULT_SYNTHESIS_ATTEMPTS);

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const synthesis = await synthesize(args);
      if (isUsableSynthesisResult(synthesis)) return synthesis;
      lastSynthesis = synthesis;
    } catch (err) {
      lastError = err;
      if (attempt === maxAttempts) throw err;
    }

    if (attempt < maxAttempts) await sleep(500);
  }

  if (lastError) throw lastError;
  return lastSynthesis;
}

export async function runAskCuey(input = {}, options = {}) {
  const request = normalizeCueyRequest(input);
  const apiBaseUrl = cleanBaseUrl(options.apiBaseUrl || process.env.CUEY_API_BASE_URL);
  const token = String(options.token || process.env.CUEY_AUTH_TOKEN || "").trim();
  const anonymousId = token
    ? ""
    : String(options.anonymousId || process.env.CUEY_ANONYMOUS_ID || "cuey-claude-mcp-local").trim();
  const cueyMessageId = `compare:${randomUUID()}`;
  const messages = buildAskCueyMessages(request);
  const metadata = {
    source: "ask_with_cuey",
    platform: "claude_desktop",
    integration: "claude_mcp",
    candidates_only_detail: true,
    current_turn: request.question,
    cuey_source: request.source,
    cuey_mode: request.mode,
    reasoning_level: request.reasoningLevel,
  };

  const candidateSettled = await Promise.allSettled(
    request.models.map((model) =>
      runCandidate({
        apiBaseUrl,
        token,
        anonymousId,
        model,
        messages,
        metadata,
        timeoutMs: Number(options.candidateTimeoutMs || process.env.CUEY_CANDIDATE_TIMEOUT_MS || DEFAULT_TIMEOUT_MS),
      }),
    ),
  );

  const candidates = candidateSettled.map((result, index) => {
    const modelId = request.models[index];
    if (result.status === "fulfilled") return result.value;
    return {
      modelId,
      content: "",
      reasoningContent: "",
      error: formatCueyErrorMessage(result.reason),
    };
  });
  const candidateResponses = normalizeCandidatesForBackend(candidates);
  if (Object.keys(candidateResponses).length === 0) {
    const error = new Error("All Cuey candidate models failed");
    error.candidates = candidates;
    throw error;
  }

  let synthesis;
  try {
    synthesis = await synthesizeWithRetries(
      {
        apiBaseUrl,
        token,
        anonymousId,
        cueyMessageId,
        candidateResponses,
        metadata,
        timeoutMs: Number(options.synthesisTimeoutMs || process.env.CUEY_SYNTHESIS_TIMEOUT_MS || DEFAULT_SYNTHESIS_TIMEOUT_MS),
      },
      options.synthesisAttempts || process.env.CUEY_SYNTHESIS_ATTEMPTS || DEFAULT_SYNTHESIS_ATTEMPTS,
    );
  } catch (err) {
    synthesis = buildFallbackSynthesis(candidates, null, err);
  }

  if (!isUsableSynthesisResult(synthesis)) {
    synthesis = buildFallbackSynthesis(candidates, synthesis);
  }

  return {
    request,
    cueyMessageId,
    candidates,
    synthesis,
  };
}

export function formatAskCueyResult(result) {
  const lines = [];
  lines.push(sanitizeCueyMarkdown(result?.synthesis?.answer || result?.synthesis?.raw || "No synthesis returned."));

  const candidates = result?.candidates || [];
  const failedCandidates = candidates.filter((candidate) => candidate?.error);

  if (failedCandidates.length > 0) {
    lines.push("");
    lines.push("Model status:");
  }
  for (const [index, candidate] of candidates.entries()) {
    if (failedCandidates.length === 0) continue;
    const errorMessage = candidate.error ? formatCueyErrorMessage(candidate.error) : "";
    lines.push(`${index + 1}. ${candidate.modelId}: ${errorMessage ? `Failed - ${errorMessage}` : "Completed"}`);
  }
  return lines.join("\n").trim();
}
