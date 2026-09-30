// Placeholder runtime config. In the Docker image, the entrypoint overwrites
// this with `window.VSCC_HOST = "<backend-ip>"` when the VSCC_HOST env var is
// set, and/or `window.VSCC_SAME_ORIGIN = true` when VSCC_SAME_ORIGIN=1 (reverse
// proxy). Otherwise the app targets the host it is served from; an https page
// always goes same-origin (see src/utils/backendUrls.ts).
