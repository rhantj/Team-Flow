FROM node:24-slim AS build
WORKDIR /app

# corepack이 package.json의 packageManager(pnpm@10.34.5)를 그대로 가져다 씀
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
# Nginx가 /api를 backend로 프록시하므로 빌드 시 상대경로 base URL 주입
# (apiClient는 /api/v1, ragApi는 /v1을 벗겨 /api로 사용 — 단일 값으로 둘 다 충족)
ARG VITE_API_BASE_URL=/api/v1
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
# 데모 로그인 버튼을 Docker에서도 보이게 함(임시 - 나중에 기능 제거 시 같이 정리).
# 끄고 싶으면 VITE_ENABLE_DEMO_AUTH=false로 빌드.
ARG VITE_ENABLE_DEMO_AUTH=true
ENV VITE_ENABLE_DEMO_AUTH=$VITE_ENABLE_DEMO_AUTH
RUN pnpm build

FROM nginx:1.27-alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 5173
CMD ["nginx", "-g", "daemon off;"]
