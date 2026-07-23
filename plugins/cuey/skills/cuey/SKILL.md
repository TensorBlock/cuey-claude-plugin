---
name: cuey
description: Run Cuey only when the user explicitly invokes /cuey. Cuey analyzes prompts and Excel workbooks, cross-checks key claims, fact-checks assumptions, and returns evidence-backed recommendations.
argument-hint: <question>
---

# Cuey

Run this skill only after the user explicitly invokes `/cuey`. Do not invoke Cuey automatically for financial decisions, model analysis, business assumptions, or any other request that does not include `/cuey`.

When invoked, call the local MCP tool `cuey:ask_cuey`. Do not use bash, recall memory, search, or answer directly before calling the tool.

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
  "models": ["grok-4.5-reasoning", "gpt-5.6-terra", "claude-opus-4-8"],
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
