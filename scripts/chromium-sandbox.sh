#!/bin/sh
set -eu
: "${VOCAB_CHROMIUM_EXECUTABLE:?A pinned Chromium executable is required}"
: "${VOCAB_NETWORK_POLICY:?A loopback network policy is required}"
exec /usr/bin/sandbox-exec -f "$VOCAB_NETWORK_POLICY" "$VOCAB_CHROMIUM_EXECUTABLE" "$@"
