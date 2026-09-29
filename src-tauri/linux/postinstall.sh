#!/bin/sh
# clobmap (.deb/.rpm postinstall): expose the bundled CLI as `clobmap-cli` on
# PATH. The GUI binary is `clobmap` (/usr/bin/clobmap); the CLI sidecar is
# `clobmap-cli`, so no shadowing of the app launcher. Best-effort — never fails
# the package install.
set -e
mkdir -p /usr/local/bin 2>/dev/null || true
for cand in /usr/bin/clobmap-cli /usr/lib/clobmap/clobmap-cli; do
  if [ -x "$cand" ]; then
    ln -sf "$cand" /usr/local/bin/clobmap-cli 2>/dev/null || true
    break
  fi
done
exit 0
