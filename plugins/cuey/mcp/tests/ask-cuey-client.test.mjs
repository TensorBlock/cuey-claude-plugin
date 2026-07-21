import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  buildCandidateRequest,
  buildAskCueyMessages,
  buildFallbackSynthesis,
  buildSynthesisRequest,
  DEFAULT_MODELS,
  formatAskCueyResult,
  formatCueyErrorMessage,
  isUsableSynthesisResult,
  normalizeCueyRequest,
  parseSynthesisText,
  sanitizeCueyMarkdown,
  writeLatestAskCueyResult,
} from "../src/ask-cuey-client.mjs";

test("normalizeCueyRequest caps models at three and keeps defaults", () => {
  const request = normalizeCueyRequest({
    question: "What are the risks?",
    models: ["a", "b", "c", "d"],
    reasoningLevel: "advanced",
  });

  assert.equal(request.question, "What are the risks?");
  assert.deepEqual(request.models, ["a", "b", "c"]);
  assert.equal(request.reasoningLevel, "advanced");
});

test("normalizeCueyRequest uses the current Ask Cuey default model trio", () => {
  const request = normalizeCueyRequest({ question: "What are the risks?" });

  assert.deepEqual(DEFAULT_MODELS, [
    "grok-4.5-reasoning",
    "gpt-5.6-sol",
    "claude-opus-4-8",
  ]);
  assert.deepEqual(request.models, DEFAULT_MODELS);
});

test("normalizeCueyRequest maps advanced reasoning to Ask Cuey model aliases", () => {
  const request = normalizeCueyRequest({
    question: "What are the risks?",
    reasoningLevel: "advanced",
    models: ["grok-4.5", "gpt-5.6-sol", "claude-opus-4-8"],
  });

  assert.deepEqual(request.models, [
    "grok-4.5-reasoning",
    "gpt-5.6-sol",
    "claude-opus-4-8-think",
  ]);
});

test("buildAskCueyMessages includes relevant context and question", () => {
  const messages = buildAskCueyMessages({
    question: "Should we hire?",
    context: "ARR is $12M.",
    mode: "verify",
  });

  assert.equal(messages[0].role, "system");
  assert.equal(messages[1].role, "user");
  assert.match(messages[1].content, /ARR is \$12M/);
  assert.match(messages[1].content, /Should we hire\?/);
  assert.match(messages[1].content, /Cuey mode: verify/);
});

test("normalizeCueyRequest preserves structured Excel workbook context", () => {
  const request = normalizeCueyRequest({
    question: "Summarize this workbook",
    spreadsheet: {
      filename: "forecast.xlsx",
      context: "Sheets: Revenue, Assumptions\nRevenue!A1:B2\nYear | ARR\n2026 | 12000000",
      document_id: "doc-123",
    },
  });

  assert.deepEqual(request.spreadsheet, {
    filename: "forecast.xlsx",
    context: "Sheets: Revenue, Assumptions\nRevenue!A1:B2\nYear | ARR\n2026 | 12000000",
    documentId: "doc-123",
  });
});

test("buildAskCueyMessages labels attached Excel context separately", () => {
  const messages = buildAskCueyMessages({
    question: "What changed year over year?",
    mode: "summarize",
    spreadsheet: {
      filename: "forecast.xlsx",
      context: "Sheet Revenue, used range A1:B2\nYear | ARR\n2026 | 12000000",
    },
  });

  assert.match(messages[1].content, /Attached Excel workbook:/);
  assert.match(messages[1].content, /Filename: forecast\.xlsx/);
  assert.match(messages[1].content, /Sheet Revenue, used range A1:B2/);
  assert.match(messages[1].content, /What changed year over year\?/);
});

test("buildCandidateRequest sends anonymous id for public requests", () => {
  const request = buildCandidateRequest({
    apiBaseUrl: "https://staging-api.cuey.io/api/cuey",
    token: "",
    anonymousId: "anon-123",
    model: "gpt-5.5",
    messages: [{ role: "user", content: "Hello" }],
    metadata: { source: "test" },
  });

  assert.equal(request.url, "https://staging-api.cuey.io/api/cuey/chat/completions/public");
  assert.equal(request.headers["X-Cuey-Anonymous-Id"], "anon-123");
  assert.equal(request.headers.Authorization, undefined);
});

test("buildCandidateRequest prefers bearer auth over anonymous id", () => {
  const request = buildCandidateRequest({
    apiBaseUrl: "https://staging-api.cuey.io/api/cuey",
    token: "token-123",
    anonymousId: "anon-123",
    model: "gpt-5.5",
    messages: [{ role: "user", content: "Hello" }],
    metadata: { source: "test" },
  });

  assert.equal(request.url, "https://staging-api.cuey.io/api/cuey/chat/completions");
  assert.equal(request.headers.Authorization, "Bearer token-123");
  assert.equal(request.headers["X-Cuey-Anonymous-Id"], undefined);
});

test("buildSynthesisRequest carries Ask Cuey detail metadata", () => {
  const body = buildSynthesisRequest({
    cueyMessageId: "compare:abc",
    candidateResponses: {
      "gpt-5.5": {
        content: "Answer",
        reasoning_content: "",
      },
    },
    metadata: {
      source: "ask_with_cuey",
      candidates_only_detail: true,
      current_turn: "What are the risks?",
    },
  });

  assert.equal(body.cuey_message_id, "compare:abc");
  assert.equal(body.response, "");
  assert.equal(body.metadata.source, "ask_with_cuey");
  assert.equal(body.metadata.candidates_only_detail, true);
  assert.equal(body.metadata.current_turn, "What are the risks?");
  assert.deepEqual(Object.keys(body.candidate_responses), ["gpt-5.5"]);
});

test("parseSynthesisText extracts model id, enhanced answer, and analysis", () => {
  const parsed = parseSynthesisText(`model_id: native/gemini-3.1-pro-preview

## Enhanced Answer {#judge-enhanced-answer}
Hire more slowly and fix churn first.

---

## Summary
The strongest response flags churn and CAC payback.`);

  assert.equal(parsed.modelId, "native/gemini-3.1-pro-preview");
  assert.equal(parsed.answer, "Hire more slowly and fix churn first.");
  assert.equal(parsed.analysis, "The strongest response flags churn and CAC payback.");
});

test("isUsableSynthesisResult rejects partial model metadata stream fragments", () => {
  assert.equal(isUsableSynthesisResult({ answer: "model_", raw: "model_" }), false);
  assert.equal(isUsableSynthesisResult({ answer: "model_id:", raw: "model_id:" }), false);
  assert.equal(
    isUsableSynthesisResult({ answer: "Fix churn before hiring 20 sales reps.", raw: "Fix churn before hiring 20 sales reps." }),
    true,
  );
});

test("buildFallbackSynthesis uses completed model content when synthesis is incomplete", () => {
  const fallback = buildFallbackSynthesis(
    [
      {
        modelId: "gpt-5.5",
        content: "Fix churn before hiring 20 sales reps.",
      },
    ],
    {
      answer: "model_",
      raw: "model_",
    },
  );

  assert.equal(fallback.answer, "Fix churn before hiring 20 sales reps.");
  assert.equal(fallback.fallbackModelId, "gpt-5.5");
  assert.equal(fallback.raw, "model_");
  assert.match(fallback.fallbackReason, /incomplete stream/);
});

test("formatCueyErrorMessage summarizes Cloudflare timeout HTML", () => {
  const html = `<!DOCTYPE html><html><head><title>tensorblock.co | 504: Gateway time-out</title></head>
    <body><h1>Gateway time-out</h1><span>Error code 504</span><script>noise()</script></body></html>`;
  const error = new Error(`HTTP 504: Gateway Timeout - ${html}`);
  error.status = 504;
  error.body = html;

  const message = formatCueyErrorMessage(error);

  assert.equal(message, "Cuey backend timed out (HTTP 504). Retry shortly.");
  assert.doesNotMatch(message, /<!DOCTYPE|<html|<script/i);
});

test("formatAskCueyResult does not expose raw HTML for failed model responses", () => {
  const formatted = formatAskCueyResult({
    synthesis: {
      answer: "Use the completed model responses and retry the failed model if needed.",
    },
    candidates: [
      {
        modelId: "gpt-5.5",
        content: "",
        error: "<!DOCTYPE html><html><title>504: Gateway time-out</title><body>Cloudflare</body></html>",
      },
      {
        modelId: "claude-sonnet-4-6",
        content: "Fix churn before scaling sales.",
      },
    ],
  });

  assert.match(formatted, /gpt-5\.5: Failed - Cuey backend timed out \(HTTP 504\)/);
  assert.match(formatted, /claude-sonnet-4-6: Completed/);
  assert.doesNotMatch(formatted, /<!DOCTYPE|<html|Cloudflare/i);
});

test("formatAskCueyResult keeps happy path focused on synthesis", () => {
  const formatted = formatAskCueyResult({
    synthesis: {
      answer: "Fix churn before hiring 20 sales reps.",
    },
    candidates: [
      {
        modelId: "gpt-5.5",
        content: "Raw GPT answer",
      },
      {
        modelId: "claude-sonnet-4-6",
        content: "Raw Claude answer",
      },
      {
        modelId: "native/gemini-3.1-pro-preview",
        content: "Raw Gemini answer",
      },
    ],
  });

  assert.equal(formatted, "Fix churn before hiring 20 sales reps.");
  assert.doesNotMatch(formatted, /Cuey completed|Synthesis:|Model responses|Raw GPT|Raw Claude|Raw Gemini/);
});

test("formatAskCueyResult returns synthesis without analysis and strips Cuey anchors", () => {
  const formatted = formatAskCueyResult({
    synthesis: {
      answer: "## Hire slowly {#section-1}\n\nFix churn first. {#para-1-1}",
      analysis: "- GPT focused on CAC. {#list-1-1}",
    },
    candidates: [
      {
        modelId: "gpt-5.5",
        content: "Raw GPT answer",
      },
    ],
  });

  assert.match(formatted, /## Hire slowly\n\nFix churn first\./);
  assert.doesNotMatch(formatted, /GPT focused on CAC|Model differences/);
  assert.doesNotMatch(formatted, /\{#/);
});

test("sanitizeCueyMarkdown removes generated reference tags", () => {
  assert.equal(
    sanitizeCueyMarkdown("Text {#para-1-1}\n- Item {#list-1-1}"),
    "Text\n- Item",
  );
});

test("writeLatestAskCueyResult stores original model answers for the overlay", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "cuey-result-"));
  const resultPath = path.join(dir, "latest-ask-cuey-result.json");
  try {
    await writeLatestAskCueyResult(
      {
        request: {
          question: "Should we hire?",
        },
        cueyMessageId: "compare:test",
        synthesis: {
          answer: "Fix churn first.",
        },
        candidates: [
          {
            modelId: "gpt-5.5",
            content: "Raw GPT answer",
            reasoningContent: "",
          },
        ],
      },
      resultPath,
    );

    const parsed = JSON.parse(await readFile(resultPath, "utf8"));
    assert.equal(parsed.schemaVersion, 1);
    assert.equal(parsed.request.question, "Should we hire?");
    assert.equal(parsed.synthesis.answer, "Fix churn first.");
    assert.equal(parsed.candidates[0].modelId, "gpt-5.5");
    assert.equal(parsed.candidates[0].content, "Raw GPT answer");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("writeLatestAskCueyResult records workbook presence without persisting cell context", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "cuey-result-"));
  const resultPath = path.join(dir, "latest-ask-cuey-result.json");
  try {
    await writeLatestAskCueyResult(
      {
        request: {
          question: "Summarize this workbook",
          spreadsheet: {
            filename: "forecast.xlsx",
            context: "private workbook cells",
            documentId: "doc-123",
          },
        },
        synthesis: { answer: "Revenue increased." },
        candidates: [],
      },
      resultPath,
    );

    const parsed = JSON.parse(await readFile(resultPath, "utf8"));
    assert.deepEqual(parsed.request.spreadsheet, {
      filename: "forecast.xlsx",
      documentId: "doc-123",
      hasContext: true,
    });
    assert.doesNotMatch(await readFile(resultPath, "utf8"), /private workbook cells/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
