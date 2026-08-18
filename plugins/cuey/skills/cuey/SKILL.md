---
name: cuey
description: Run Cuey only when the user explicitly invokes /cuey. Cuey analyzes prompts and Excel workbooks, cross-checks key claims, fact-checks assumptions, and returns evidence-backed recommendations. Use /cuey probe only for attachment feature diagnostics.
argument-hint: <question>
---

# Cuey

Run this skill only after the user explicitly invokes `/cuey`. Do not invoke Cuey automatically for financial decisions, model analysis, business assumptions, or any other request that does not include `/cuey`.

Before using any tool, classify the invocation using this routing table:

1. If `$ARGUMENTS` is exactly `probe https` or starts with `probe https `,
   this is an HTTPS attachment probe. You must follow **HTTPS Attachment Probe**
   and must not call `cuey:ask_cuey`.
2. If `$ARGUMENTS` is exactly `probe`, starts with `probe `, or is an explicit
   attachment feature diagnostic request such as `attachment probe`, this is a
   probe request. You must follow **Attachment Feature Probe** and must not call
   `cuey:ask_cuey`.
3. Otherwise, this is a normal Cuey request. Follow **Ask Cuey** and call
   `cuey:ask_cuey`.

## HTTPS Attachment Probe

This section applies only to `/cuey probe https`. It validates the direct,
large-file transport path. Do not search for or call `cuey:ask_cuey`, do not
build an Ask Cuey payload, and do not analyze the attachment.

Use exactly one raw attachment from the current user message. Never reuse an
attachment from an earlier message. Claude must have a readable raw file path
for that current attachment, normally under `/root/.claude/uploads/...`. If no
such path is available, say that direct upload cannot be tested for this
attachment and stop.

1. Read the file size with `stat -c%s` and SHA-256 with `sha256sum` in the
   Claude sandbox. Do not base64 encode or chunk the file.
2. Call only `cuey:probe_claude_attachment_https` with:

```json
{
  "action": "begin",
  "filename": "original filename",
  "mimeType": "original MIME type",
  "sizeBytes": 123,
  "sha256": "lowercase sha256"
}
```

3. From the returned `upload_url`, `headers`, and `probe_token`, use the
   following exit-safe `curl` command in the Claude sandbox to stream the exact
   original file. It preserves S3's error details without exposing the upload
   URL or probe token:

```bash
response_headers="$(mktemp)"
response_body="$(mktemp)"

set +e
http_status="$(curl --http1.1 --fail-with-body --silent --show-error \
  --request PUT \
  --upload-file "$ATTACHMENT_PATH" \
  -H "Content-Type: $MIME_TYPE" \
  -H "x-amz-meta-cuey-sha256: $SHA256" \
  --dump-header "$response_headers" \
  --output "$response_body" \
  --write-out '%{http_code}' \
  "$UPLOAD_URL")"
curl_exit=$?
set -e

if [ "$curl_exit" -ne 0 ]; then
  s3_request_id="$(awk 'tolower($1) == "x-amz-request-id:" {gsub(/\r/, "", $2); print $2}' "$response_headers")"
  s3_host_id="$(awk 'tolower($1) == "x-amz-id-2:" {gsub(/\r/, "", $2); print $2}' "$response_headers")"
  s3_error_code="$(sed -n 's:.*<Code>\([^<]*\)</Code>.*:\1:p' "$response_body")"
  s3_error_message="$(sed -n 's:.*<Message>\([^<]*\)</Message>.*:\1:p' "$response_body")"
  printf 'cuey_s3_upload_failed\nhttp_status=%s\ncurl_exit=%s\ns3_error_code=%s\ns3_error_message=%s\ns3_request_id=%s\ns3_host_id=%s\n' \
    "$http_status" "$curl_exit" "$s3_error_code" "$s3_error_message" "$s3_request_id" "$s3_host_id"
  exit 0
fi
```

4. If and only if the command succeeded, call only
   `cuey:probe_claude_attachment_https` again:

```json
{
  "action": "complete",
  "probeToken": "token returned by begin"
}
```

The upload URL and probe token are short-lived secrets. Use them only in tool
calls and commands; never include either in the user-visible answer. On an
upload failure, return only the printed `cuey_s3_upload_failed` diagnostic and
stop; do not call `complete`. On success, return the completion result exactly
and stop. This probe does not run fanout, persist a Cuey document, or produce a
normal Ask Cuey answer.

## Attachment Feature Probe

This section applies only to probe requests.

Do not search for `ask_cuey`. Do not call `cuey:ask_cuey`. Do not build an
Ask Cuey payload. Do not summarize, analyze, transcribe, upload, or transform
the attachments.

Call only the local MCP tool `cuey:probe_claude_attachment`.

The purpose of this diagnostic is to produce an attachment feature matrix for
the current user message. It answers one question only: what file identifiers,
metadata, sandbox paths, byte access, and format-specific features can Claude
observe before Cuey tries any local file matching or backend upload.

Send only raw file/attachment values from the same user message that invoked
this probe. Never use attachments from earlier turns, prior probes, chat
history, memory, cached tool results, or previous Cuey responses. If the current
message contains a visible image but Claude exposes no raw file bytes, path, or
handle for that image, leave `attachments` and `files` empty and state that
the current image was visible but no raw attachment transport was exposed.

For each current-message attachment that exposes a readable sandbox path,
collect as many features as possible with Claude's normal file/shell tools.
Do not base64 encode the file and do not include file contents. Prefer metadata
and hashes:

- declared filename, MIME type, file UUID or handle when visible;
- sandbox path, whether a path is present, and whether Claude can read it;
- `stat` fields: size bytes, mode, mtime, inode when available;
- SHA-256 of the exact bytes when Claude can read the file;
- magic/type detection from `file` or first-byte inspection;
- type-specific metadata when cheap: image dimensions for PNG/JPEG, PDF page
  estimate, ZIP/OOXML entry count, `.xlsx` sheet names if readable from
  `xl/workbook.xml`, CSV/text line count and encoding guess;
- transport feasibility flags: `raw_bytes_readable_by_claude`,
  `inline_base64_possible_estimate`, `local_mcp_path_readable_estimate`
  (`false` for `/root/.claude/uploads/...` sandbox paths).

Use this payload shape. `upload` must be `false` or omitted:

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
        "inlineBase64PossibleEstimate": true,
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
  "context": "",
  "upload": false
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
