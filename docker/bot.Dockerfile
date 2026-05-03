FROM node:20-alpine AS base
WORKDIR /repo
COPY package.json package-lock.json* tsconfig.base.json ./
COPY packages ./packages
COPY apps/bot ./apps/bot
RUN npm install --workspaces --include-workspace-root --omit=optional
RUN npm run build --workspace=@senatum/shared
RUN npm run build --workspace=@senatum/bot

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=base /repo /app
CMD ["node", "apps/bot/dist/index.js"]
