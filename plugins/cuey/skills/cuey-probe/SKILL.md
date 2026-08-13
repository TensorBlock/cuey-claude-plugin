---
name: cuey-probe
description: Diagnostic skill for Cuey attachment transport. Use only when the user explicitly invokes /cuey-probe to test whether Claude can pass uploaded file references to MCP.
argument-hint: <short test note>
---

# Cuey Probe

Run this skill only after the user explicitly invokes `/cuey-probe`.

Call the local MCP tool `cuey:probe_claude_attachment`.

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
content along with filename and MIME type. Do not skip base64 solely because the
file is a PDF, image, workbook, or moderately large test file.

If Claude exposes a `/root/.claude/uploads/...` sandbox path, do not pass that
path as the only transport. That path is readable by Claude's sandbox, but not
by the local Cuey MCP runtime. First read that current-message file in Claude's
sandbox and pass its bytes inline as base64. Include the path only as metadata
alongside the base64.

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

Return the MCP result exactly. Do not add commentary.
