#!/bin/bash
# Kill only Alternassist Electron processes, not VS Code

pkill -f "Alternassist/node_modules/electron"
echo "Alternassist app killed (VS Code unaffected)"
