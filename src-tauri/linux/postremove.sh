#!/bin/sh
# clobmap (.deb/.rpm postremove): drop the `clobmap-cli` PATH symlink added by
# postinstall. Best-effort — never fails the package removal.
rm -f /usr/local/bin/clobmap-cli 2>/dev/null || true
exit 0
