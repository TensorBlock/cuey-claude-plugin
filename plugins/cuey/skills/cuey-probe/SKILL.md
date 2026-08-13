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

Return the MCP result exactly. Do not add commentary.
