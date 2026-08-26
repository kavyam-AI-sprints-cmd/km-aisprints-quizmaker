const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateLoginFields(username: string, password: string): string | null {
  if (!username.trim()) return "Username is required";
  if (password.length < 8) return "Password must be at least 8 characters";
  return null;
}

export type RegisterFields = {
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  password: string;
  confirmPassword: string;
};

export function validateRegisterFields(fields: RegisterFields): string | null {
  if (!fields.firstName.trim()) return "First name is required";
  if (!fields.lastName.trim()) return "Last name is required";
  if (!fields.username.trim()) return "Username is required";
  if (fields.username.trim().length < 3 || fields.username.trim().length > 50) {
    return "Username must be between 3 and 50 characters";
  }
  if (!fields.email.trim()) return "Email is required";
  if (!EMAIL_PATTERN.test(fields.email.trim())) return "Email is invalid";
  if (fields.password.length < 8) return "Password must be at least 8 characters";
  if (fields.password !== fields.confirmPassword) return "Passwords do not match";
  return null;
}

export async function errorMessageFromResponse(response: Response): Promise<string> {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    try {
      const payload: unknown = await response.json();
      if (
        payload !== null &&
        typeof payload === "object" &&
        "error" in payload &&
        typeof payload.error === "string"
      ) {
        return payload.error;
      }
    } catch {
      // Ignore malformed JSON and fall through to a generic message.
    }
  }
  if (response.status === 404) {
    return "The auth API route was not found. Restart npm run dev and try again.";
  }
  return `Request failed (${response.status})`;
}
