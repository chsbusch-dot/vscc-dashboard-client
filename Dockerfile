# Build the dashboard and serve it as static files.
# Build:  docker build -t vscc-dashboard .
# Run:    docker run -d -p 80:80 vscc-dashboard
# The app targets the host it is served from (override with VITE_VSCC_HOST
# as a build arg if the backend lives elsewhere).

FROM oven/bun:1.4.4-alpine AS build
WORKDIR /app
ARG VITE_VSCC_HOST=
ENV VITE_VSCC_HOST=$VITE_VSCC_HOST
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build

FROM nginx:1.27-alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY docker-entrypoint.sh /docker-entrypoint-vscc.sh
RUN chmod +x /docker-entrypoint-vscc.sh
EXPOSE 80
# Entrypoint writes runtime config (VSCC_HOST env -> config.js) then starts nginx
ENTRYPOINT ["/docker-entrypoint-vscc.sh"]
