const STORAGE_KEY = "quizmaker.currentUserId";

export function getCurrentUserId(): string | null {
  if (typeof sessionStorage === "undefined") {
    return null;
  }
  const value = sessionStorage.getItem(STORAGE_KEY)?.trim();
  return value ? value : null;
}

export function rememberCurrentUserId(id: string): void {
  const trimmed = id.trim();
  if (!trimmed) {
    return;
  }
  sessionStorage.setItem(STORAGE_KEY, trimmed);
}

export function clearCurrentUserId(): void {
  sessionStorage.removeItem(STORAGE_KEY);
}

export function rememberUserIdFromPayload(payload: unknown): void {
  if (payload === null || typeof payload !== "object" || !("user" in payload)) {
    return;
  }
  const user = (payload as { user?: unknown }).user;
  if (user === null || typeof user !== "object" || !("id" in user)) {
    return;
  }
  const id = (user as { id?: unknown }).id;
  if (typeof id === "string") {
    rememberCurrentUserId(id);
  }
}
