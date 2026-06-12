# Build the dashboard and serve it as static files.
# Build:  docker build -t vscc-dashboard .
# Run:    docker run -d -p 80:80 vscc-dashboard
# The app targets the host it is served from (override with VITE_VSCC_HOST
# as a build arg if the backend lives elsewhere).

FROM node:22-alpine AS build
WORKDIR /app
ARG VITE_VSCC_HOST=
ENV VITE_VSCC_HOST=$VITE_VSCC_HOST
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:1.27-alpine
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
