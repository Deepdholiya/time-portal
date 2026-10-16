// Thin fetch wrapper. Every request sends the session cookie; errors become ApiError with the server's message and code.
export class ApiError extends Error {
  status: number;
  code?: string;
  data?: unknown;
  constructor(status: number, message: string, code?: string, data?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.data = data;
  }
}

export type Query = Record<string, string | number | boolean | null | undefined | (string | number)[]>;

export function qs(q?: Query) {
  if (!q) return "";
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) {
    if (v === undefined || v === null || v === "" || (Array.isArray(v) && !v.length)) continue;
    p.set(k, Array.isArray(v) ? v.join(",") : String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : "";
}

/** Session problems the app shell reacts to (sign-in, forced password change, MFA). */
export const SESSION_CODES = ["UNAUTHENTICATED", "MFA_REQUIRED", "PASSWORD_CHANGE_REQUIRED", "MFA_SETUP_REQUIRED"];

export async function api<T = unknown>(path: string, opts: { method?: string; body?: unknown; query?: Query; form?: FormData } = {}): Promise<T> {
  const res = await fetch(`/api${path}${qs(opts.query)}`, {
    method: opts.method ?? (opts.body !== undefined || opts.form ? "POST" : "GET"),
    credentials: "include",
    headers: opts.form ? undefined : opts.body !== undefined ? { "content-type": "application/json" } : undefined,
    body: opts.form ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined),
  });
  const type = res.headers.get("content-type") ?? "";
  const data = type.includes("json") ? await res.json().catch(() => null) : null;
  if (!res.ok) {
    const code = data?.code ?? (res.status === 401 ? "UNAUTHENTICATED" : undefined);
    const err = new ApiError(res.status, data?.error ?? `Request failed (${res.status})`, code, data);
    if (code && SESSION_CODES.includes(code) && !path.startsWith("/auth/")) window.dispatchEvent(new CustomEvent("tp:session", { detail: code }));
    throw err;
  }
  return data as T;
}

export const get = <T = unknown>(path: string, query?: Query) => api<T>(path, { query });
export const post = <T = unknown>(path: string, body: unknown = {}) => api<T>(path, { method: "POST", body });
export const put = <T = unknown>(path: string, body: unknown = {}) => api<T>(path, { method: "PUT", body });
export const patch = <T = unknown>(path: string, body: unknown = {}) => api<T>(path, { method: "PATCH", body });
export const del = <T = unknown>(path: string, body?: unknown) => api<T>(path, { method: "DELETE", body });
export const upload = <T = unknown>(path: string, form: FormData) => api<T>(path, { method: "POST", form });

/** Opens a file download (Excel/CSV/PDF) using the session cookie. */
export function download(path: string, query?: Query) {
  const a = document.createElement("a");
  a.href = `/api${path}${qs(query)}`;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}
