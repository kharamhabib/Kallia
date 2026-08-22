import { getClientId } from "./client-id";
import { apiUrl, getToken, clearAuth } from "./auth";

const baseHeaders = (): HeadersInit => {
  const headers: Record<string, string> = {
    "X-Client-Id": getClientId(),
    "Content-Type": "application/json",
  };
  const token = getToken();
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  return headers;
};

// Em 401 (token JWT expirado ou ausente) limpa a auth e recarrega para o login.
const guard = (status: number) => {
  if (status === 401) {
    clearAuth();
    location.reload();
  }
};

const parseResponse = async <T>(r: Response): Promise<T> => {
  if (r.status === 204) return {} as T;
  const text = await r.text().catch(() => "");
  if (!text || !text.trim()) return {} as T;
  return JSON.parse(text) as T;
};

const parseError = async (r: Response, path: string): Promise<Error> => {
  const text = await r.text().catch(() => "");
  if (text) {
    try {
      const obj = JSON.parse(text);
      if (obj.error) return new Error(obj.error);
      if (obj.message) return new Error(obj.message);
    } catch {}
  }
  return new Error(text || `Erro na requisição ${path} (${r.status})`);
};

export const apiGet = async <T>(path: string): Promise<T> => {
  const r = await fetch(apiUrl(path), { headers: baseHeaders() });
  if (!r.ok) {
    guard(r.status);
    throw await parseError(r, path);
  }
  return parseResponse<T>(r);
};

export const apiPost = async <T>(path: string, body: unknown): Promise<T> => {
  const r = await fetch(apiUrl(path), { method: "POST", headers: baseHeaders(), body: JSON.stringify(body) });
  if (!r.ok) {
    guard(r.status);
    throw await parseError(r, path);
  }
  return parseResponse<T>(r);
};

export const apiDelete = async <T = void>(path: string): Promise<T> => {
  const r = await fetch(apiUrl(path), { method: "DELETE", headers: baseHeaders() });
  if (!r.ok) {
    guard(r.status);
    throw await parseError(r, path);
  }
  return parseResponse<T>(r);
};

export const apiPut = async <T>(path: string, body: unknown): Promise<T> => {
  const r = await fetch(apiUrl(path), { method: "PUT", headers: baseHeaders(), body: JSON.stringify(body) });
  if (!r.ok) {
    guard(r.status);
    throw await parseError(r, path);
  }
  return parseResponse<T>(r);
};

export const apiPatch = async <T>(path: string, body: unknown): Promise<T> => {
  const r = await fetch(apiUrl(path), { method: "PATCH", headers: baseHeaders(), body: JSON.stringify(body) });
  if (!r.ok) {
    guard(r.status);
    throw await parseError(r, path);
  }
  return parseResponse<T>(r);
};
