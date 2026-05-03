FROM node:20-alpine AS base
WORKDIR /repo
COPY package.json package-lock.json* tsconfig.base.json ./
COPY packages ./packages
COPY apps/api ./apps/api
RUN npm install --workspaces --include-workspace-root --omit=optional
RUN npm run build --workspace=@senatum/shared
RUN npm run build --workspace=@senatum/api

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=base /repo /app
EXPOSE 7001
CMD ["node", "apps/api/dist/index.js"]
