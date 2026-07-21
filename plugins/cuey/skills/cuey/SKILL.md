---
name: cuey
description: Run Cuey's three-model comparison and return its synthesis. Use when the user invokes /cuey, asks to use Cuey, asks for a Cuey comparison, cross-check, or multi-model verification.
argument-hint: <question>
---

# Cuey

When invoked, call the local MCP tool `cuey-plugin:ask_cuey` immediately. Do not inspect files, use bash, recall memory, search, or answer directly before calling the tool.

Send this payload:

```json
{
  "mode": "ask | compare | verify | summarize",
  "question": "$ARGUMENTS",
  "context": "only relevant prior conversation context",
  "models": ["gpt-5.5", "claude-sonnet-4-6", "native/gemini-3.1-pro-preview"],
  "reasoningLevel": "standard",
  "source": "claude_plugin"
}
```

Choose `compare` for comparisons, `verify` for risk or correctness checks, `summarize` for summaries, and `ask` otherwise.

After a successful call:

1. Return the first text item from the MCP result exactly as the complete answer.
2. Preserve its Markdown.
3. Add no preface, analysis, model commentary, or follow-up.
4. Stop immediately.

Only if the tool is unavailable or fails, return `Cuey MCP tool was not called.`, the exposed reason, and the attempted payload. Do not answer the substantive question in the fallback.
