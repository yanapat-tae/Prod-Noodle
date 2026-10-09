#!/usr/bin/env bash
set -euo pipefail
# This installer intentionally supports Linux x64 (GitHub ubuntu runner).
[[ "$(uname -s)" == Linux && "$(uname -m)" == x86_64 ]] || { echo 'Use the official Gitleaks release for this OS/architecture' >&2; exit 1; }
install_dir="${1:?Provide a tool directory outside the repository}"
mkdir -p "$install_dir"
archive="$install_dir/gitleaks.tar.gz"
curl --fail --silent --show-error --location --max-time 120 \
  'https://github.com/gitleaks/gitleaks/releases/download/v8.30.1/gitleaks_8.30.1_linux_x64.tar.gz' -o "$archive"
printf '%s  %s\n' '551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb' "$archive" | sha256sum -c -
tar --no-same-owner -xzf "$archive" -C "$install_dir" gitleaks
"$install_dir/gitleaks" version
