FROM node:24-alpine
WORKDIR /app

# corepack이 package.json의 packageManager(pnpm@10.34.5)를 그대로 가져다 씀
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .

EXPOSE 5173
CMD ["pnpm", "dev", "--host", "0.0.0.0"]
