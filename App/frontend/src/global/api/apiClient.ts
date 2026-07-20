import { tokenStore } from "./tokenStore";

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8080/api/v1";

export const AUTH_LOGOUT_EVENT = "workflow-ai:auth-logout";

export interface ApiEnvelope<T> {
  success: boolean;
  data: T;
  error?: { code: string; message: string } | null;
}

export class ApiRequestError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

let refreshPromise: Promise<boolean> | null = null;

async function readJsonEnvelope<T>(response: Response): Promise<ApiEnvelope<T> | null> {
  const contentType = response.headers.get("Content-Type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) return null;
  try {
    return (await response.json()) as ApiEnvelope<T>;
  } catch {
    return null;
  }
}

async function refreshTokens(): Promise<boolean> {
  const refreshToken = tokenStore.getRefreshToken();
  if (!refreshToken) return false;
  try {
    const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });
    if (!response.ok) return false;
    const body = (await response.json()) as ApiEnvelope<{ accessToken: string; refreshToken: string }>;
    if (!body.success) return false;
    tokenStore.setTokens(body.data.accessToken, body.data.refreshToken);
    return true;
  } catch {
    return false;
  }
}

export async function apiFetch<T>(path: string, options: RequestInit = {}, retry = true): Promise<T> {
  const accessToken = tokenStore.getAccessToken();
  const headers = new Headers(options.headers);
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
  if (options.body && !(options.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });

  if (response.status === 401 && retry && accessToken) {
    if (!refreshPromise) {
      refreshPromise = refreshTokens().finally(() => {
        refreshPromise = null;
      });
    }
    const refreshed = await refreshPromise;
    if (refreshed) {
      return apiFetch<T>(path, options, false);
    }
    throw new ApiRequestError("인증이 만료되었습니다. 다시 로그인해주세요.", 401, "UNAUTHORIZED");
  }

  const body = await readJsonEnvelope<T>(response);
  if (!response.ok) {
    const message = body?.error?.message ?? (response.status === 404 ? "요청한 항목을 찾을 수 없습니다." : "요청에 실패했습니다.");
    throw new ApiRequestError(message, response.status, body?.error?.code);
  }
  if (!body) {
    throw new ApiRequestError("서버 응답을 읽을 수 없습니다.", response.status);
  }
  if (!body.success) {
    throw new ApiRequestError(body.error?.message ?? "요청에 실패했습니다.", response.status, body.error?.code);
  }
  return body.data;
}
