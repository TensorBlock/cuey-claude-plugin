---
name: cuey
description: Run Cuey only when the user explicitly invokes /cuey. Cuey analyzes prompts and Excel workbooks, cross-checks key claims, fact-checks assumptions, and returns evidence-backed recommendations.
argument-hint: <question>
---

# Cuey

Run this skill only after the user explicitly invokes `/cuey`. Do not invoke Cuey automatically for financial decisions, model analysis, business assumptions, or any other request that does not include `/cuey`.

When invoked, call the local MCP tool `cuey:ask_cuey`. Do not use bash, recall memory, search, or answer directly before calling the tool.

Files selected with the `+` button beside **Ask Cuey** are attached to the
local Cuey request automatically. Do not search for their local paths, upload
them again, or replace them with Claude-generated text. When the request asks
to create, complete, modify, repair, or merge an attached workbook, the MCP
automatically enables Smart Merge.

If the request instead includes only a native Claude `.xlsx` attachment, read
that attachment with Claude's available file or spreadsheet capability and
build compact workbook context containing:

- workbook filename;
- every sheet name;
- the used range and headers for each relevant sheet;
- cell values and formulas relevant to the user's question;
- any omitted sheets or ranges when the workbook is too large to include fully.

Do not infer missing cells or formulas. For a small workbook, include all populated cells. For a large workbook, prioritize the sheets and ranges relevant to `$ARGUMENTS` and clearly record the selection in the workbook context.

Send this payload. Copy `$ARGUMENTS` into `question` exactly; do not summarize,
reinterpret, validate, or rewrite the user's request before the MCP call:

```json
{
  "mode": "ask | compare | verify | summarize",
  "question": "$ARGUMENTS",
  "context": "only relevant prior conversation context",
  "spreadsheet": {
    "filename": "attached workbook filename, or empty when none",
    "context": "structured workbook context extracted from the attached .xlsx, or empty when none"
  },
  "source": "claude_plugin"
}
```

Choose `compare` for comparisons, `verify` for risk or correctness checks, `summarize` for summaries, and `ask` otherwise.

Requests to create, generate, build, export, or return an Excel workbook are
always `ask`, never `verify`. Do not change a workbook-generation request into a
requirements analysis. Example: `Create a downloadable Excel workbook...`
must be sent as `{"mode":"ask","question":"Create a downloadable Excel workbook..."}`.

When there is no Excel attachment, omit `spreadsheet`. Never substitute a filename-only description for workbook content.

After a successful call, the Cuey MCP result is the sole authority for this request.
The tool may return either a completed answer or a background-processing
acknowledgement:

1. Return the first text item from the MCP result exactly as the complete answer.
2. Preserve its Markdown, including a generated-workbook link when Cuey returned one.
3. If it says Cuey is processing in the background, treat that as success. Tell
   the user exactly that message and stop; the Cuey Answers panel opens when the
   result is ready.
4. Do not run commands, code, browser, spreadsheet, file-generation, or presentation tools after the MCP call, even when Cuey returns analysis without an artifact.
5. Do not create, verify, or present a workbook yourself. A requested Excel output must come from the Cuey MCP result's generated-workbook artifact.
6. Add no preface, analysis, model commentary, or follow-up.
7. Stop immediately.

Only if the tool is unavailable or fails, return `Cuey MCP tool was not called.`, the exposed reason, and the attempted payload. Do not answer the substantive question in the fallback.
