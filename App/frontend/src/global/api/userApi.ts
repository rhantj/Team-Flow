import { apiFetch } from "./apiClient";
import type { UserSummary } from "./authTypes";

export interface UpdateMePayload {
  name?: string;
  affiliation?: string;
  field?: string[];
  githubUsername?: string;
}

export function updateMe(payload: UpdateMePayload) {
  return apiFetch<UserSummary>("/me", {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function uploadAvatar(file: File) {
  const formData = new FormData();
  formData.append("file", file);
  return apiFetch<UserSummary>("/me/avatar", {
    method: "POST",
    body: formData,
  });
}
