const ACCESS_TOKEN_KEY = "workflow.accessToken";
const REFRESH_TOKEN_KEY = "workflow.refreshToken";
const TEST_SESSION_KEY = "workflow.testSessionId";

export const tokenStore = {
  getAccessToken(): string | null {
    return localStorage.getItem(ACCESS_TOKEN_KEY);
  },
  getRefreshToken(): string | null {
    return localStorage.getItem(REFRESH_TOKEN_KEY);
  },
  getTestSessionId(): string | null {
    return localStorage.getItem(TEST_SESSION_KEY);
  },
  setTokens(accessToken: string, refreshToken: string, testSessionId?: string | null) {
    localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
    localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
    if (testSessionId !== undefined) {
      if (testSessionId) {
        localStorage.setItem(TEST_SESSION_KEY, testSessionId);
      } else {
        localStorage.removeItem(TEST_SESSION_KEY);
      }
    }
  },
  clear() {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    localStorage.removeItem(TEST_SESSION_KEY);
  },
};
