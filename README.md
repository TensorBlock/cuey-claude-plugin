# Cuey Claude Plugin

Official TensorBlock Marketplace source for the Cuey Claude Plugin.

The `cuey` plugin provides the `/cuey` skill. Cuey is an agentic financial intelligence system: it analyzes prompts and Excel workbooks, cross-checks key claims, fact-checks assumptions, and returns evidence-backed recommendations directly in Claude. The plugin is skill-only: the MCP runtime is installed and updated by Cuey for Claude Setup (the macOS installer), which owns the single global `cuey` server registration.

## Install in Claude Desktop

1. Run Cuey for Claude Setup (installs the overlay and the global Cuey MCP server).
2. In Claude's Home tab, open Settings > Plugins > Add > Marketplace and paste this repository's URL. Enable automatic sync.
3. Install `cuey` from the TensorBlock marketplace card, then start a new Chat or Cowork conversation and type `/cuey`.

## Repository layout

```text
.claude-plugin/marketplace.json  Claude Marketplace catalog
plugins/cuey/                    Skill-only Cuey Plugin
scripts/build-plugin.sh          Builds an uploadable Plugin ZIP
```

## Validate locally

```bash
scripts/build-plugin.sh
```

The build creates `dist/CueyClaudePlugin.zip` for manual plugin upload where git-synced marketplaces are unavailable.
