#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
plugin_dir="$repo_root/plugins/cuey"
output_dir="$repo_root/dist/cuey"
archive="$repo_root/dist/CueyClaudePlugin.zip"

rm -rf "$output_dir" "$archive"
mkdir -p "$output_dir"
cp -R "$plugin_dir/." "$output_dir/"

(cd "$repo_root/dist" && /usr/bin/zip -qry -X "$(basename "$archive")" "cuey")

archive_entries="$(/usr/bin/unzip -Z1 "$archive")"
grep -qx 'cuey/.claude-plugin/plugin.json' <<<"$archive_entries"
grep -qx 'cuey/skills/cuey/SKILL.md' <<<"$archive_entries"
if grep -Eq '^cuey/(\.mcp\.json|mcp/)' <<<"$archive_entries"; then
  echo "Cuey plugin must stay skill-only; the Cuey installer owns the global MCP runtime." >&2
  exit 1
fi

echo "$archive"
