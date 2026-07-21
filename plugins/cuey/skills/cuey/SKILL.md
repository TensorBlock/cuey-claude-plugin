---
name: cuey
description: Run Cuey's three-model comparison and return its synthesis. Use when the user invokes /cuey, asks to use Cuey, asks for a Cuey comparison, cross-check, or multi-model verification.
argument-hint: <question>
---

# Cuey

When invoked, call the local MCP tool `cuey-plugin:ask_cuey`. Do not use bash, recall memory, search, or answer directly before calling the tool.

If the current request includes an Excel `.xlsx` attachment, read that attachment first with Claude's available file or spreadsheet capability. Build compact workbook context containing:

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
  "models": ["grok-4.5-reasoning", "gpt-5.6-sol", "claude-opus-4-8"],
  "reasoningLevel": "standard",
  "source": "claude_plugin"
}
```

Choose `compare` for comparisons, `verify` for risk or correctness checks, `summarize` for summaries, and `ask` otherwise.

When there is no Excel attachment, omit `spreadsheet`. Never substitute a filename-only description for workbook content.

After a successful call:

1. Return the first text item from the MCP result exactly as the complete answer.
2. Preserve its Markdown.
3. Add no preface, analysis, model commentary, or follow-up.
4. Stop immediately.

Only if the tool is unavailable or fails, return `Cuey MCP tool was not called.`, the exposed reason, and the attempted payload. Do not answer the substantive question in the fallback.
