import { pb } from "./pocketbase";

const URL_KEY = "kallia.apiUrl";
const TOKEN_KEY = "kallia.token";
const USER_KEY = "kallia.user";

const LEGACY_TOKEN_KEY = "wacalls.token";
const LEGACY_USER_KEY = "wacalls.user";
const LEGACY_URL_KEY = "wacalls.apiUrl";

export interface AuthUser {
  id: string;
  email: string;
  role: "appadmin" | "creator" | "normal" | string;
  projectId?: string;
  name?: string;
  avatar?: string;
  createdAt?: string;
}

export const getApiBase = (): string =>
  (localStorage.getItem(URL_KEY) || localStorage.getItem(LEGACY_URL_KEY) || "").replace(/\/+$/, "") || window.location.origin;

export const getToken = (): string =>
  pb.authStore.token || localStorage.getItem(TOKEN_KEY) || localStorage.getItem(LEGACY_TOKEN_KEY) || "";

export const getUser = (): AuthUser | null => {
  if (pb.authStore.record) {
    const r = pb.authStore.record;
    return {
      id: r.id,
      email: r.email || "",
      role: r.role || "creator",
      projectId: r.project_id || (r as any).projectId || "",
      name: r.name || "",
      avatar: r.avatar || "",
      createdAt: r.created || "",
    };
  }
  try {
    const raw = localStorage.getItem(USER_KEY) || localStorage.getItem(LEGACY_USER_KEY);
    return JSON.parse(raw || "null");
  } catch {
    return null;
  }
};

export const isAuthed = (): boolean => !!getToken();

export const setAuth = (url: string, token: string, user: any): void => {
  localStorage.setItem(URL_KEY, url.replace(/\/+$/, ""));
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  try {
    pb.authStore.save(token, user);
  } catch {
    // ignore
  }
};

export const clearAuth = (): void => {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem(LEGACY_TOKEN_KEY);
  localStorage.removeItem(LEGACY_USER_KEY);
  pb.authStore.clear();
};

export const apiUrl = (path: string): string => getApiBase() + path;

// checkAuth verifica se o token JWT atual ainda é válido
export const checkAuth = async (): Promise<boolean> => {
  const token = getToken();
  if (!token) return false;

  // Se o PocketBase tiver um model/record válido e não expirado
  if (pb.authStore.isValid && pb.authStore.record) {
    return true;
  }

  try {
    const r = await fetch(apiUrl("/api/auth/me"), {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (r.status === 401 || r.status === 403) {
      clearAuth();
      return false;
    }
    return r.ok;
  } catch {
    return pb.authStore.isValid;
  }
};
