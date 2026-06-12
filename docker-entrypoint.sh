#!/bin/sh
# Runtime configuration for the prebuilt image: write the backend host (if given)
# into config.js, which index.html loads before the app bundle. Lets a two-host
# install point the dashboard at the backend without rebuilding:
#   docker run -e VSCC_HOST=192.168.1.188 -p 80:80 vscc-dashboard
if [ -n "$VSCC_HOST" ]; then
    echo "window.VSCC_HOST = \"$VSCC_HOST\";" > /usr/share/nginx/html/config.js
fi
exec nginx -g 'daemon off;'
