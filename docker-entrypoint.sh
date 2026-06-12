#!/bin/sh
# Runtime configuration for the prebuilt image: write the backend host (if given)
# into config.js, which index.html loads before the app bundle. Lets a two-host
# install point the dashboard at the backend without rebuilding:
#   docker run -e VSCC_HOST=192.168.1.188 -p 80:80 vscc-dashboard
if [ -n "$VSCC_HOST" ]; then
    # Sanitize before writing into a JS string literal: allow only host/IP chars
    # (letters, digits, dot, hyphen) so the value can't break out of the quotes
    # and inject script into config.js.
    if printf '%s' "$VSCC_HOST" | grep -qE '^[A-Za-z0-9.-]+$'; then
        echo "window.VSCC_HOST = \"$VSCC_HOST\";" > /usr/share/nginx/html/config.js
    else
        echo "VSCC_HOST '$VSCC_HOST' is not a valid hostname/IP — ignoring." >&2
    fi
fi
exec nginx -g 'daemon off;'
