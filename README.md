# Cuey Claude Plugin

Official TensorBlock Marketplace source for the Cuey Claude Plugin.

The `cuey` plugin provides the `/cuey` command. It invokes Cuey's local MCP server, fans a request out to the configured models, and returns the synthesized response directly in Claude.

## Repository layout

```text
.claude-plugin/marketplace.json  Claude Marketplace catalog
plugins/cuey/                    Self-contained Cuey Plugin
scripts/build-plugin.sh          Builds an uploadable Plugin ZIP
```

## Validate locally

```bash
npm test --prefix plugins/cuey/mcp
scripts/build-plugin.sh
```

The build creates `dist/CueyClaudePlugin.zip` for manual plugin upload. Organization deployments should connect this private repository as a GitHub-synced Claude Marketplace and install `cuey` by default.
