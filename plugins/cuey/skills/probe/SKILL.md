---
name: probe
description: Diagnostic skill for Cuey attachment transport. Use only when the user explicitly invokes /cuey:probe to test whether Claude can pass uploaded file references to MCP.
argument-hint: <short test note>
---

# Cuey Probe

Run this skill only after the user explicitly invokes `/cuey:probe`.

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

Prefer actual file bytes when Claude can expose them. For each current-message
attachment, first try to include inline `base64`, `dataBase64`, or
`contentBase64` content along with filename and MIME type. If Claude exposes
only a file path or handle for the current-message attachment, pass that raw
reference. If Claude exposes only extracted text and no raw file reference or
bytes, leave `attachments` and `files` empty and put a short note in `note`.

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
