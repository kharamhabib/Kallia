import { pb } from "./pocketbase";

const URL_KEY = "kallia.apiUrl";
const TOKEN_KEY = "kallia.token";
const USER_KEY = "kallia.user";

export interface AuthUser {
  id: string;
  email: string;
  role: "appadmin" | "creator" | "normal" | string;
  workspaceId?: string;
  projectId?: string;
  name?: string;
  avatar?: string;
  createdAt?: string;
}

export const getApiBase = (): string =>
  (localStorage.getItem(URL_KEY) || "").replace(/\/+$/, "") || window.location.origin;

export const getToken = (): string =>
  pb.authStore.token || localStorage.getItem(TOKEN_KEY) || "";

export const getUser = (): AuthUser | null => {
  if (pb.authStore.record) {
    const r = pb.authStore.record;
    const wsId = r.workspace_id || (r as any).workspaceId || r.project_id || (r as any).projectId || "";
    return {
      id: r.id,
      email: r.email || "",
      role: r.role || "creator",
      workspaceId: wsId,
      projectId: wsId,
      name: r.name || "",
      avatar: r.avatar || "",
      createdAt: r.created || "",
    };
  }
  try {
    const raw = localStorage.getItem(USER_KEY);
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
  pb.authStore.clear();
};

export const apiUrl = (path: string): string => getApiBase() + path;

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

export const updateUserProfile = async (data: { name?: string; avatar?: string }): Promise<AuthUser> => {
  const currentUser = getUser();
  if (!currentUser?.id) throw new Error("Usuário não autenticado");

  try {
    if (pb.authStore.record && pb.authStore.record.id === currentUser.id) {
      const updated = await pb.collection("users").update(currentUser.id, data);
      pb.authStore.save(pb.authStore.token, updated);
      const wsId = updated.workspace_id || (updated as any).workspaceId || updated.project_id || currentUser.workspaceId || "";
      const userObj: AuthUser = {
        id: updated.id,
        email: updated.email || currentUser.email,
        role: updated.role || currentUser.role,
        workspaceId: wsId,
        projectId: wsId,
        name: updated.name || data.name || currentUser.name,
        avatar: updated.avatar || data.avatar || currentUser.avatar,
        createdAt: updated.created || currentUser.createdAt,
      };
      localStorage.setItem(USER_KEY, JSON.stringify(userObj));
      return userObj;
    }
  } catch (err: any) {
    console.warn("PocketBase update fallback:", err);
  }

  const updatedUser: AuthUser = {
    ...currentUser,
    name: data.name !== undefined ? data.name : currentUser.name,
    avatar: data.avatar !== undefined ? data.avatar : currentUser.avatar,
  };
  localStorage.setItem(USER_KEY, JSON.stringify(updatedUser));
  return updatedUser;
};

export const changeUserPassword = async (oldPassword: string, newPassword: string, passwordConfirm: string): Promise<void> => {
  const currentUser = getUser();
  if (!currentUser?.id) throw new Error("Usuário não autenticado");
  if (!newPassword || newPassword.length < 6) throw new Error("A nova senha deve ter pelo menos 6 caracteres");
  if (newPassword !== passwordConfirm) throw new Error("A confirmação de senha não confere com a nova senha");

  if (pb.authStore.record && pb.authStore.record.id === currentUser.id) {
    await pb.collection("users").update(currentUser.id, {
      oldPassword,
      password: newPassword,
      passwordConfirm,
    });
    return;
  }

  const token = getToken();
  const res = await fetch(apiUrl("/api/auth/change-password"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ oldPassword, newPassword, passwordConfirm }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Falha ao alterar senha");
  }
};
