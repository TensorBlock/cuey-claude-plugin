---
name: cuey
description: Run Cuey only when the user explicitly invokes /cuey. Cuey analyzes prompts and Excel workbooks, cross-checks key claims, fact-checks assumptions, and returns evidence-backed recommendations.
argument-hint: <question>
---

# Cuey

Run this skill only after the user explicitly invokes `/cuey`. Do not invoke Cuey automatically for financial decisions, model analysis, business assumptions, or any other request that does not include `/cuey`.

When invoked, call the local MCP tool `cuey:ask_cuey`. Do not use bash, recall memory, search, or answer directly before calling the tool.

Cuey has no separate file intake path in Claude. Use only files and attachments
that Claude already exposes in the current request. Do not search local paths,
send files separately, invent file handles, or replace attachments with
Claude-generated summaries when actual workbook context is available. Do not
decide the merge route. Cuey backend chooses the final synthesis or artifact
merge after fanout returns.

If the request includes a native Claude `.xlsx` attachment, read that attachment
with Claude's available file or spreadsheet capability and build compact
workbook context containing:

- workbook filename;
- every sheet name;
- the used range and headers for each relevant sheet;
- cell values and formulas relevant to the user's question;
- any omitted sheets or ranges when the workbook is too large to include fully.

Do not infer missing cells or formulas. For a small workbook, include all populated cells. For a large workbook, prioritize the sheets and ranges relevant to `$ARGUMENTS` and clearly record the selection in the workbook context.

Send this payload:

```json
{
  "mode": "ask | compare | verify | summarize",
  "question": "$ARGUMENTS",
  "context": "only relevant prior conversation context",
  "spreadsheet": {
    "filename": "attached workbook filename, or empty when none",
    "context": "structured workbook context extracted from the attached .xlsx, or empty when none"
  },
  "worklog": true,
  "source": "claude_plugin"
}
```

Choose `compare` for comparisons, `verify` for risk or correctness checks, `summarize` for summaries, and `ask` otherwise.

Set `"worklog": true` only when the request is clearly a CFO, FP&A, finance,
financial model, forecast, budget, board, investor, audit, reporting, variance,
revenue, cost, cash, runway, or unit-economics task where generated artifacts
should include candidate worklogs. For ordinary questions, normal summaries,
and simple Excel generation, omit `worklog` or set it to `false`.

Do not send `sourceFiles`, `smart_merge`, `models`, `reasoningLevel`, agent
names, or merge settings. Those choices belong to Cuey backend.

Requests to create, generate, build, export, or return an Excel workbook are
always `ask`, never `verify`. Do not change a workbook-generation request into a
requirements analysis. Example: `Create a downloadable Excel workbook...`
must be sent as `{"mode":"ask","question":"Create a downloadable Excel workbook..."}`.

When there is no Excel attachment, omit `spreadsheet`. Never substitute a filename-only description for workbook content.

After a successful call, the Cuey MCP result is the sole authority for this request:

1. Return the first text item from the MCP result exactly as the complete answer.
2. Preserve its Markdown, including a generated-workbook link when Cuey returned one.
3. Do not run commands, code, browser, spreadsheet, file-generation, or presentation tools after the MCP call.
4. Do not create, verify, or present a workbook yourself. A requested Excel output must come from the Cuey MCP result's generated-workbook artifact.
5. Add no preface, analysis, model commentary, or follow-up.
6. Stop immediately.

Only if the tool is unavailable or fails, return `Cuey MCP tool was not called.`, the exposed reason, and the attempted payload. Do not answer the substantive question in the fallback.
