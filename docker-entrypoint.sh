#!/bin/sh
# Runtime configuration for the prebuilt image, written into config.js, which
# index.html loads before the app bundle. No rebuild needed for either setting:
#   VSCC_HOST=<host>     two-host install: point the dashboard at the backend
#                        docker run -e VSCC_HOST=192.168.1.188 -p 80:80 vscc-dashboard
#   VSCC_SAME_ORIGIN=1   behind a reverse proxy: reach the backend through the
#                        page's own origin (/api, /mqtt, /DataExportVSC.json,
#                        /ws/stream). Automatic when the page is served over https.
CONFIG=/usr/share/nginx/html/config.js
cfg=""
if [ -n "$VSCC_HOST" ]; then
    # Sanitize before writing into a JS string literal: allow only host/IP chars
    # (letters, digits, dot, hyphen) so the value can't break out of the quotes
    # and inject script into config.js.
    if printf '%s' "$VSCC_HOST" | grep -qE '^[A-Za-z0-9.-]+$'; then
        cfg="window.VSCC_HOST = \"$VSCC_HOST\";"
    else
        echo "VSCC_HOST '$VSCC_HOST' is not a valid hostname/IP — ignoring." >&2
    fi
fi
case "$VSCC_SAME_ORIGIN" in
    1|true|yes) cfg="${cfg:+$cfg
}window.VSCC_SAME_ORIGIN = true;" ;;
esac
if [ -n "$cfg" ]; then
    printf '%s\n' "$cfg" > "$CONFIG"
fi
exec nginx -g 'daemon off;'
