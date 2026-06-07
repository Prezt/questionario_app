#!/usr/bin/env bash
# Generate pencil-shaped favicons in tab-specific colors.
# Output: public/favicon-{red,amber,blue,green,purple}-32.png + matching .ico
#         public/logo-192.png (default red)
# Default favicon.ico is a copy of the red one.
set -eo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# Parallel arrays (bash 3.2 has no assoc arrays on macOS).
NAMES=(red amber blue green purple)
HEXES=("#cc2222" "#ea580c" "#3b82f6" "#16a34a" "#9333ea")

render_svg() {
  local body="$1"
  local out="$2"
  cat > "$TMP/pencil.svg" <<EOF
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <g transform="rotate(110 256 256)">
    <!-- eraser -->
    <rect x="46" y="191" width="40" height="130" rx="10" fill="#ec4c8a"/>
    <!-- metal ferrule -->
    <rect x="86" y="191" width="32" height="130" fill="#c0c0c0"/>
    <!-- body -->
    <rect x="118" y="191" width="270" height="130" fill="$body"/>
    <!-- wood cone -->
    <polygon points="388,191 388,321 466,256" fill="#f0d2a0"/>
    <!-- graphite point -->
    <polygon points="442,225 442,287 478,256" fill="#222222"/>
  </g>
</svg>
EOF
  rsvg-convert --width="$out" --height="$out" "$TMP/pencil.svg" -o "$TMP/pencil-${out}.png"
}

i=0
for name in "${NAMES[@]}"; do
  body="${HEXES[$i]}"
  for size in 16 32 48 192; do
    render_svg "$body" "$size"
    cp "$TMP/pencil-${size}.png" "$TMP/${name}-${size}.png"
  done

  cp "$TMP/${name}-32.png" "$ROOT/public/favicon-${name}-32.png"

  magick \
    "$TMP/${name}-16.png" \
    "$TMP/${name}-32.png" \
    "$TMP/${name}-48.png" \
    "$ROOT/public/favicon-${name}.ico"

  i=$((i + 1))
done

# Default favicon = red (Estude is the default tab)
cp "$ROOT/public/favicon-red.ico" "$ROOT/public/favicon.ico"
cp "$ROOT/public/favicon-red-32.png" "$ROOT/public/favicon-32.png"

# Apple touch icon = 192px red pencil
cp "$TMP/red-192.png" "$ROOT/public/logo-192.png"

echo "Generated:"
ls -la "$ROOT/public/favicon"*.ico "$ROOT/public/favicon"*-32.png "$ROOT/public/logo-192.png"
