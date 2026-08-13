---
name: cuey
description: Run Cuey only when the user explicitly invokes /cuey. Cuey analyzes prompts and Excel workbooks, cross-checks key claims, fact-checks assumptions, and returns evidence-backed recommendations. Use /cuey probe only for attachment transport diagnostics.
argument-hint: <question>
---

# Cuey

Run this skill only after the user explicitly invokes `/cuey`. Do not invoke Cuey automatically for financial decisions, model analysis, business assumptions, or any other request that does not include `/cuey`.

Before using any tool, classify the invocation using this routing table:

1. If `$ARGUMENTS` is exactly `probe`, starts with `probe `, or is an explicit
   attachment transport diagnostic request such as `attachment probe`, this is
   a probe request. You must follow **Attachment Probe** and must not call
   `cuey:ask_cuey`.
2. Otherwise, this is a normal Cuey request. Follow **Ask Cuey** and call
   `cuey:ask_cuey`.

## Attachment Probe

This section applies only to probe requests.

Do not search for `ask_cuey`. Do not call `cuey:ask_cuey`. Do not build an
Ask Cuey payload. Do not summarize the attachments yourself.

Call only the local MCP tool `cuey:probe_claude_attachment`.

Do not analyze, summarize, transcribe, or transform uploaded files. The purpose
of this diagnostic is to verify whether Claude can pass raw uploaded file
references, paths, handles, bytes metadata, or attachment objects to MCP, and
whether MCP can upload the same file bytes to Cuey backend.

Send only raw file/attachment values from the same user message that invoked
this probe. Never use attachments from earlier turns, prior probes, chat
history, memory, cached tool results, or previous Cuey responses. If the current
message contains a visible image but Claude exposes no raw file bytes, path, or
handle for that image, leave `attachments` and `files` empty and state that
the current image was visible but no raw attachment transport was exposed.

Prefer actual file bytes whenever Claude can read them. For each
current-message attachment, first use Claude's available file access to read the
attachment bytes and include inline `base64`, `dataBase64`, or `contentBase64`
content along with filename and MIME type. Apply this to any current-message
attachment type Claude can expose, including documents, spreadsheets, images,
PDFs, text files, CSVs, archives, and other binary files.

If Claude exposes a `/root/.claude/uploads/...` sandbox path, do not pass that
path as the only transport. That path is readable by Claude's sandbox, but not
by the local Cuey MCP runtime. First read that current-message file in Claude's
sandbox and pass its bytes inline as base64. Include the path only as metadata
alongside the base64.

Do not run a size preflight and then decide to send a sandbox path instead of
bytes. For this probe, attempt the MCP call with inline base64 when Claude can
read the current-message attachment bytes. If the attachment is too large for a
single inline MCP tool call, stop and report that this file requires chunked
upload or an official file-handle transport path. In that failure case, do not
retry with a `/root/.claude/uploads/...` path-only payload.

Only if Claude exposes a non-sandbox file path or handle that the MCP runtime
can read may you pass a path or handle without base64. If Claude exposes only
extracted text and no raw file reference or bytes, leave `attachments` and
`files` empty and put a short note in `note`.

Use this payload shape:

```json
{
  "note": "what Claude can access about the uploaded files",
  "attachments": [
    {
      "filename": "example.png",
      "mimeType": "image/png",
      "path": "raw path or handle if available",
      "base64": "raw file bytes as base64 if Claude can expose them"
    }
  ],
  "files": [],
  "context": "",
  "upload": true
}
```

Return the MCP result exactly. Do not add commentary. Stop immediately.

## Ask Cuey

This section applies only to normal Cuey requests. If this is a probe request,
do not execute this section.

Call the local MCP tool `cuey:ask_cuey`. Do not use bash, recall memory, search,
or answer directly before calling the tool.

Preserve Claude's normal attachment workflow. Users attach files in Claude's
composer. For normal `/cuey` requests, Cuey receives compact context extracted
by Claude, not raw uploaded files, paths, handles, bytes, or `sourceFiles`. Raw
attachment transport is experimental and belongs only to `/cuey probe`.

If the request includes Claude-visible non-Excel attachments, add only compact,
relevant context that Claude can already extract naturally. Include filename,
file type, extracted text or observations needed for the user's request, and
any omitted sections when the file is too large to include fully. Do not search
local paths, upload or send files separately, invent file handles, or send raw
file bytes in normal `/cuey`.

Do not decide the merge route. Cuey backend chooses the final synthesis or
artifact merge after fanout returns.

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
  "context": "only relevant prior conversation context plus compact Claude-extracted context from non-Excel attachments",
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
