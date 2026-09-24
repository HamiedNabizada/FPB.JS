# Build the web app, then serve the static files with nginx.
#
# The built page loads its stylesheets from ../css, which the web build writes
# next to dist/web (dist/css). Both folders end up in the web root, so /css
# resolves the same way as on the development server.

FROM node:22-alpine AS build
WORKDIR /app

COPY package*.json ./
# Without the prepare script: it would build the library as well
RUN npm ci --ignore-scripts

COPY . .
RUN npm run build:web

FROM nginx:alpine
COPY --from=build /app/dist/web /usr/share/nginx/html
COPY --from=build /app/dist/css /usr/share/nginx/html/css

EXPOSE 80
