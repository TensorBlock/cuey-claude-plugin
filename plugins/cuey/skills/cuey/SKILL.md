---
name: cuey
description: Run Cuey only when the user explicitly invokes /cuey. Cuey analyzes prompts and Excel workbooks, cross-checks key claims, fact-checks assumptions, and returns evidence-backed recommendations. Use /cuey probe only for attachment transport diagnostics.
argument-hint: <question>
---

# Cuey

Run this skill only after the user explicitly invokes `/cuey`. Do not invoke Cuey automatically for financial decisions, model analysis, business assumptions, or any other request that does not include `/cuey`.

## Attachment Probe

If `$ARGUMENTS` is exactly `probe`, starts with `probe `, or is an explicit
attachment transport diagnostic request such as `attachment probe`, do not call
`cuey:ask_cuey`.

Instead, call the local MCP tool `cuey:probe_claude_attachment`.

Do not analyze, summarize, transcribe, or transform uploaded files. The purpose
of this diagnostic is to verify whether Claude can pass raw uploaded file
references, paths, handles, bytes metadata, or attachment objects to MCP, and
whether MCP can upload the same file bytes to Cuey backend.

Send the most raw file/attachment values Claude exposes in the current request.
If Claude exposes only extracted text and no raw file reference, leave
`attachments` and `files` empty and put a short note in `note`.

Use this payload shape:

```json
{
  "note": "what Claude can access about the uploaded files",
  "attachments": [],
  "files": [],
  "context": "",
  "upload": true
}
```

Return the MCP result exactly. Do not add commentary. Stop immediately.

## Ask Cuey

When invoked, call the local MCP tool `cuey:ask_cuey`. Do not use bash, recall memory, search, or answer directly before calling the tool.

Preserve Claude's normal attachment workflow. Users attach files in Claude's
composer; Cuey consumes only files and attachment content that Claude already
exposes in the current request. Do not search local paths, upload or send files
separately, invent file handles, or replace available attachment content with
Claude-generated summaries. Do not decide the merge route. Cuey backend chooses
the final synthesis or artifact merge after fanout returns.

If the request includes Claude-visible attachments of any type, read them with
Claude's available file, spreadsheet, document, or vision capability and add
compact, relevant attachment context to `context`. This applies to Excel, PDF,
image, document, text, CSV, and other Claude-readable files. For each relevant
attachment, include the filename, file type, extracted content or observations
needed for the user's request, and any omitted sections when the file is too
large to include fully. Do not include only a filename when actual attachment
content is available.

If the request includes a native Claude `.xlsx` attachment, also build compact
workbook context in `spreadsheet` containing:

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
  "context": "only relevant prior conversation context plus compact context extracted from Claude-visible non-Excel attachments",
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

When there is no Excel attachment, omit `spreadsheet`. Keep non-Excel attachment context in `context`; never send `sourceFiles`.

After a successful call, the Cuey MCP result is the sole authority for this request:

1. Return the first text item from the MCP result exactly as the complete answer.
2. Preserve its Markdown, including a generated-workbook link when Cuey returned one.
3. Do not run commands, code, browser, spreadsheet, file-generation, or presentation tools after the MCP call.
4. Do not create, verify, or present a workbook yourself. A requested Excel output must come from the Cuey MCP result's generated-workbook artifact.
5. Add no preface, analysis, model commentary, or follow-up.
6. Stop immediately.

Only if the tool is unavailable or fails, return `Cuey MCP tool was not called.`, the exposed reason, and the attempted payload. Do not answer the substantive question in the fallback.
