# Cuey Claude Plugin

Official TensorBlock Marketplace source for the Cuey Claude Plugin.

The `cuey` plugin provides the `/cuey` skill. It calls the `cuey:ask_cuey` MCP tool, which fans a request out to Cuey's model trio and returns the synthesized response directly in Claude. The plugin is skill-only: the MCP runtime is installed and updated by Cuey for Claude Setup (the macOS installer), which owns the single global `cuey` server registration.

## Install in Claude Desktop

1. Run Cuey for Claude Setup (installs the overlay and the global Cuey MCP server).
2. In Claude, open Directory → Plugins → Personal → + → "Add from a repository" and paste this repository's URL.
3. Install `cuey` from the TensorBlock marketplace card, then start a new conversation and type `/cuey`.

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
