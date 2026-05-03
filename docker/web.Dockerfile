FROM node:20-alpine AS build
WORKDIR /repo
COPY package.json package-lock.json* tsconfig.base.json ./
COPY packages ./packages
COPY apps/web ./apps/web
RUN npm install --workspaces --include-workspace-root --omit=optional
RUN npm run build --workspace=@senatum/shared
RUN npm run build --workspace=@senatum/web

FROM nginx:1.27-alpine
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html
RUN printf 'server {\n  listen 80;\n  server_name _;\n  root /usr/share/nginx/html;\n  index index.html;\n  location / { try_files $uri $uri/ /index.html; }\n}\n' \
  > /etc/nginx/conf.d/default.conf
EXPOSE 80
