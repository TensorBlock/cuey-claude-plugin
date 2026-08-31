---
name: cuey
description: Run Cuey only when the user explicitly invokes /cuey. Cuey analyzes prompts and Excel workbooks, cross-checks key claims, fact-checks assumptions, and returns evidence-backed recommendations. Use /cuey probe only for attachment feature diagnostics.
argument-hint: <question>
---

# Cuey

Run this skill only after the user explicitly invokes `/cuey`. Do not invoke Cuey automatically for financial decisions, model analysis, business assumptions, or any other request that does not include `/cuey`.

Before using any tool, classify the invocation:

1. If `$ARGUMENTS` is exactly `probe`, starts with `probe `, or is an explicit
   attachment feature diagnostic request such as `attachment probe`, follow
   **Attachment Feature Probe** and do not call `cuey:ask_cuey`.
2. Otherwise, follow **Ask Cuey**.

## Ask Cuey

Call the local MCP tool `cuey:start_cuey`, then poll `cuey:get_cuey_result` until Cuey returns the final result. Do not use claim, pending-request, handoff, or single-call `cuey:ask_cuey` tools: Cuey backend owns durable task state. If the current request has no attachments, do not use bash, recall memory, search, or answer directly before starting Cuey. If the current request has attachments, collect only the attachment feature matrix described below, then call `cuey:start_cuey` immediately.

An `@filename.ext` reference in `$ARGUMENTS` may identify a file in the Cuey
desktop file workspace. Pass every such reference to Cuey unchanged.
Do not search Claude's uploads directory, claim that the referenced file is
missing, or ask the user to upload it before the MCP call. The Cuey desktop
runtime, not Claude, decides whether the workspace file exists.

A `#CODE` reference in `$ARGUMENTS` may identify a generated file from a prior
Cuey result. Preserve every such code unchanged in `question`. Do not resolve
it yourself, treat it as a new attachment, or replace it with a filename. The
Cuey backend validates the reference and supplies the prior artifact to the
next fanout.

Preserve Claude's normal attachment workflow. Users attach files in Claude's composer; Cuey resolves the original local files through the user's authorized file bridge. Do not search local paths, upload or send files separately, invent file handles, read file contents for Ask Cuey, dump workbook cells, transcribe attachments, or replace attachments with Claude-generated summaries. Do not decide the merge route. Cuey backend chooses the final synthesis or artifact merge after fanout returns.

If the current request includes Claude-visible attachments of any type, collect only the current-message attachment feature matrix when Claude exposes file metadata. This is metadata only, not file contents. Use the same field set defined in **Attachment Feature Probe** when cheap and available: declared filename, MIME type, visible file UUID or handle, sandbox path presence, readable-by-Claude flag, size bytes, mtime, inode, SHA-256, magic/type detection, and cheap format metadata such as `.xlsx` sheet names, ZIP/OOXML entry count, CSV line count, JSON top-level keys, or PDF page/header signals. Pass this matrix as `attachmentFeatureMatrix` so the local Cuey runtime can ask the user's authorized file bridge to locate and upload the original local file. Do not include base64, raw bytes, file contents, extracted text, workbook cells, formulas, or Claude sandbox paths as upload sources.

Send this payload to `cuey:start_cuey`:

```json
{
  "mode": "ask | compare | verify | summarize",
  "question": "$ARGUMENTS",
  "context": "only relevant prior conversation context; do not include extracted attachment contents",
  "attachmentFeatureMatrix": [
    {
      "declaredFilename": "example.xlsx",
      "declaredMimeType": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "fileUuid": "if visible",
      "sandboxPathPresent": true,
      "sandboxPathReadableByClaude": true,
      "filesystem": {
        "sizeBytes": 123,
        "mode": "regular file",
        "mtime": "timestamp if available",
        "inode": "inode if available",
        "sha256": "lowercase sha256 if available",
        "magicMimeType": "detected type if available"
      },
      "formatMetadata": {
        "kind": "xlsx | pdf | png | jpeg | csv | text | zip | unknown",
        "availableFields": {}
      },
      "transport": {
        "rawBytesReadableByClaude": true,
        "sandboxPathVisibleToClaude": true,
        "localMcpPathReadableEstimate": false
      }
    }
  ],
  "worklog": false,
  "source": "claude_plugin"
}
```

Choose `compare` for comparisons, `verify` for risk or correctness checks, `summarize` for summaries, and `ask` otherwise.

Default to `"worklog": false`. Set `"worklog": true` only when the user is explicitly asking Cuey to perform a CFO, FP&A, finance, financial model, forecast, budget, board, investor, audit, reporting, variance, revenue, cost, cash, runway, or unit-economics artifact workflow where candidate worklogs are required for downstream merge. Ordinary file-understanding requests such as "analyze this file", "summarize this file", "explain this attachment", "review this spreadsheet", or "what is in this workbook" must keep `"worklog": false` even when the attachment is an Excel workbook. Those requests should produce a plain text synthesis unless Cuey backend independently returns a generated artifact.

Do not send `spreadsheet`, `sourceFiles`, raw `attachments`, raw `files`, `upload`, `base64`, `dataBase64`, `contentBase64`, `bytes`, `content`, extracted file text, workbook cells, formulas, `smart_merge`, `models`, `reasoningLevel`, agent names, or merge settings. Those choices belong to Cuey backend and the local Cuey runtime.

Requests to create, generate, build, export, or return an Excel workbook are always `ask`, never `verify`. Do not change a workbook-generation request into a requirements analysis. Example: `Create a downloadable Excel workbook...` must be sent as `{"mode":"ask","question":"Create a downloadable Excel workbook..."}`.

Never send a separate attachment-content context or `sourceFiles`.

`cuey:start_cuey` returns JSON with `status: "running"` and a `taskId`. Call `cuey:get_cuey_result` with `{"taskId":"...","waitSeconds":90}`. That call waits for a Cuey status revision or the final result, so do not add an artificial delay or call another tool while it is pending. If it returns `status: "running"` or only says that Cuey accepted or is continuing the task, immediately make the same 90-second `cuey:get_cuey_result` call again with the same `taskId`. Do not answer, summarize, continue the workflow, create files, run commands, or call other tools while Cuey is running. The only acceptable next step after a running or status-only response is another long `cuey:get_cuey_result` poll.

After Cuey returns a final successful MCP result from `cuey:get_cuey_result`, that result is the sole authority for this request:

1. Return the first text item exactly as the complete answer. A status-only
   message saying Cuey accepted the task, picked up the task, is continuing it
   in the desktop app, or should be checked in Cuey Answers / Cuey for Claude is
   not a final successful result while a `taskId` is known; poll again instead
   of returning that handoff text.
2. Preserve its Markdown, including a generated-workbook link when Cuey returned one.
3. Do not run commands, code, browser, spreadsheet, file-generation, or presentation tools after the MCP call.
4. Do not create, verify, or present a workbook yourself. A requested Excel output must come from the Cuey MCP result's generated-workbook artifact.
5. Add no preface, analysis, model commentary, or follow-up.
6. Stop immediately.

If `cuey:start_cuey` succeeds but later polling fails, times out, or Claude cannot continue polling, do not answer the substantive question. Return one short handoff message in the user's language saying Cuey started the task and the user should open Cuey Answers / Cuey for Claude to check progress or the final result. Do not expose local file paths, request IDs, raw payloads, or technical diagnostics.

If the Cuey polling flow is unavailable or fails before Cuey starts, do not answer the substantive question. Return one short failure message in the user's language that says Cuey MCP was not called or did not complete, plus the exposed reason if Claude provides one. Do not expose local file paths, request IDs, raw payloads, or technical diagnostics unless the user explicitly asks for debugging details.

## Attachment Feature Probe

This section applies only to `/cuey probe` requests.

Do not search for `ask_cuey`. Do not call `cuey:ask_cuey`. Do not build an Ask Cuey payload. Do not summarize, analyze, transcribe, upload, base64 encode, or transform the attachments.

Call only the local MCP tool `cuey:probe_claude_attachment`.

The purpose of this diagnostic is to produce an attachment feature matrix for the current user message. It answers one question only: what file identifiers, metadata, sandbox paths, byte access, and format-specific features can Claude observe before Cuey tries any local file matching or backend upload.

Send only raw file/attachment values from the same user message that invoked this probe. Never use attachments from earlier turns, prior probes, chat history, memory, cached tool results, or previous Cuey responses. If the current message contains a visible image but Claude exposes no raw file bytes, path, or handle for that image, leave `attachments` and `files` empty and state that the current image was visible but no raw attachment transport was exposed.

For each current-message attachment that exposes a readable sandbox path, collect as many features as possible with Claude's normal file/shell tools. Do not include file contents. Prefer metadata and hashes:

- declared filename, MIME type, file UUID or handle when visible;
- sandbox path, whether a path is present, and whether Claude can read it;
- `stat` fields: size bytes, mode, mtime, inode when available;
- SHA-256 of the exact bytes when Claude can read the file;
- magic/type detection from `file` or first-byte inspection;
- type-specific metadata when cheap: image dimensions for PNG/JPEG, PDF page estimate, ZIP/OOXML entry count, `.xlsx` sheet names if readable from `xl/workbook.xml`, CSV/text line count and encoding guess;
- transport feasibility flags: `raw_bytes_readable_by_claude`, `sandbox_path_visible_to_claude`, `local_mcp_path_readable_estimate` (`false` for `/root/.claude/uploads/...` sandbox paths).

Use this payload shape. Do not include `upload`, `base64`, `dataBase64`, `contentBase64`, `bytes`, `content`, or file contents anywhere in the payload:

```json
{
  "note": "what Claude can access about the current-message uploaded files",
  "featureMatrix": [
    {
      "inputMode": "composer_file_picker | drag_drop | pasted_inline_image | unknown",
      "declaredFilename": "example.xlsx",
      "declaredMimeType": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "fileUuid": "if visible",
      "sandboxPathPresent": true,
      "sandboxPath": "/root/.claude/uploads/...",
      "sandboxPathReadableByClaude": true,
      "filesystem": {
        "sizeBytes": 123,
        "mode": "regular file",
        "mtime": "timestamp if available",
        "inode": "inode if available",
        "sha256": "lowercase sha256 if available",
        "magicMimeType": "detected type if available"
      },
      "formatMetadata": {
        "kind": "xlsx | pdf | png | jpeg | csv | text | zip | unknown",
        "availableFields": {}
      },
      "transport": {
        "rawBytesReadableByClaude": true,
        "sandboxPathVisibleToClaude": true,
        "localMcpPathReadableEstimate": false
      }
    }
  ],
  "attachments": [
    {
      "filename": "example.png",
      "mimeType": "image/png",
      "path": "raw sandbox path or handle if available"
    }
  ],
  "files": [],
  "context": ""
}
```

Return the MCP result exactly and stop.
