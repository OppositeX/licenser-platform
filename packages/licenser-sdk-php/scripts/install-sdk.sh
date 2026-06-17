#!/usr/bin/env bash
# install-sdk.sh
# Copy the Licenser SDK into a target plugin and replace the namespace placeholder.
#
# Usage: ./install-sdk.sh <target-dir> <namespace>
#   <target-dir>  Where the SDK should be installed (e.g. ../my-plugin/includes/licenser-sdk)
#   <namespace>   PHP namespace to replace __LICENSER_NAMESPACE__ with.
#                 Pass the parent only — the SDK appends \Licenser automatically because
#                 every file declares `namespace __LICENSER_NAMESPACE__\Licenser;`.
#                 Backslashes must be shell-escaped (e.g. 'Gloo\\CanvasStudio').
#
# Example (from packages/licenser-sdk-php/):
#   ./scripts/install-sdk.sh ../../../canvas-studio/includes/licenser-sdk 'Gloo\\CanvasStudio'
#
# The output is byte-identical to unpacking a zip built with scripts/build-release.php
# and running scripts/setup.php — both paths ship the same whitelist of files.

set -euo pipefail

TARGET_DIR="${1:-}"
NAMESPACE="${2:-}"

if [[ -z "$TARGET_DIR" || -z "$NAMESPACE" ]]; then
	echo "Usage: $0 <target-dir> <namespace>"
	echo "  e.g.  $0 ../my-plugin/includes/licenser-sdk 'Gloo\\\\MyPlugin'"
	exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SDK_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

if [[ ! -f "$SDK_DIR/SDK.php" ]]; then
	echo "SDK source not found at: $SDK_DIR (expected SDK.php)" >&2
	exit 1
fi

mkdir -p "$TARGET_DIR/scripts"

# Whitelist of files shipped to consumers. Mirrors scripts/build-release.php so the
# two distribution paths stay in sync. Dev tooling (build-release.php, install-sdk.sh,
# composer.json) is intentionally excluded — those only make sense inside this repo.
SDK_FILES=(SDK.php Client.php Cache.php Config.php Cron.php Updater.php FeedbackModal.php AdminUI.php README.md)

for f in "${SDK_FILES[@]}"; do
	if [[ -f "$SDK_DIR/$f" ]]; then
		cp "$SDK_DIR/$f" "$TARGET_DIR/$f"
	fi
done
cp "$SDK_DIR/scripts/setup.php" "$TARGET_DIR/scripts/setup.php"

# Replace placeholder. We use perl for portable in-place edits across macOS/Linux.
find "$TARGET_DIR" -type f \( -name '*.php' -o -name '*.md' \) -print0 | while IFS= read -r -d '' file; do
	perl -pi -e "s/__LICENSER_NAMESPACE__/${NAMESPACE//\\/\\\\}/g" "$file"
done

echo "Licenser SDK installed in: $TARGET_DIR"
echo "Namespace prefix:          $NAMESPACE"
