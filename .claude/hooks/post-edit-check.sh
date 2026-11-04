#!/usr/bin/env bash
# PostToolUse(Edit|Write): cheapest syntax check that can still fail. Exit 2 = show error to the agent.
f=$(python3 -c 'import json,sys; print(json.load(sys.stdin).get("tool_input",{}).get("file_path",""))' 2>/dev/null)
[ -f "$f" ] || exit 0
case "$f" in
  *.js|*.mjs|*.cjs) node --check "$f" 2>&1 || exit 2 ;;
  *.py) python3 -m py_compile "$f" 2>&1 || exit 2 ;;
  *.json) python3 -c "import json,sys; json.load(open(sys.argv[1]))" "$f" 2>&1 || exit 2 ;;
esac
exit 0
