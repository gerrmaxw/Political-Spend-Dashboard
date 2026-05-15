#!/usr/bin/env bash
# Rebuild the .compiled.js files from their .jsx sources.
# Each compiled file is wrapped in an IIFE so multiple <script> tags can
# co-exist on the page without `const` redeclaration errors.
#
# Requires node + npm. Installs @babel/core and @babel/preset-react in a
# scratch dir under /tmp on first run.
set -euo pipefail

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
SCRATCH="${SCRATCH:-/tmp/babel-check}"

if [ ! -d "$SCRATCH/node_modules" ]; then
  mkdir -p "$SCRATCH" && cd "$SCRATCH"
  npm init -y > /dev/null
  npm install --silent --no-audit --no-fund @babel/core @babel/preset-react
fi

cd "$SCRATCH"
node -e '
const babel = require("@babel/core");
const fs = require("fs");
const path = require("path");
const DIR = "'"$DIR"'";
const files = ["components.jsx","overview.jsx","prospects.jsx","trend-detail.jsx","race-calendar.jsx","pac-completed.jsx","casestudy-health.jsx","app.jsx"];
for (const f of files) {
  const src = fs.readFileSync(path.join(DIR, f), "utf8");
  const out = babel.transformSync(src, { presets: [["@babel/preset-react", { runtime: "classic" }]], filename: f });
  const code = "(function(){\n" + out.code + "\n})();\n";
  const dest = path.join(DIR, f.replace(/\.jsx$/, ".compiled.js"));
  fs.writeFileSync(dest, code);
  console.log("compiled", f, "→", path.basename(dest), code.length, "bytes");
}
'
echo "done."
