import { apiGet, apiPost, apiPut, apiDelete } from "@/lib/api";
import type { Contact, UpsertContactPayload } from "@/types/contact";

export const getCRMContacts = (sid?: string | null, search?: string, wid?: string) => {
  const query = search ? `?q=${encodeURIComponent(search)}` : "";
  const url = wid
    ? `/api/workspaces/${wid}/contacts${query}`
    : sid
    ? `/api/sessions/${sid}/crm-contacts${query}`
    : `/api/contacts${query}`;
  return apiGet<any>(url).then((res) => {
    const list = Array.isArray(res) ? res : res && Array.isArray(res.items) ? res.items : [];
    return list.map((item: any) => ({
      ...item,
      avatarUrl: item.avatarUrl || item.avatar_url || item.pictureUrl || "",
      company: item.company || item.custom_attrs?.company || "",
      notes: item.notes || item.custom_attrs?.notes || "",
      username: item.username || item.custom_attrs?.username || "",
    }));
  });
};

export const createCRMContact = (sid: string | undefined, data: UpsertContactPayload, wid?: string) => {
  const url = wid
    ? `/api/workspaces/${wid}/contacts`
    : `/api/sessions/${sid}/crm-contacts`;
  return apiPost<Contact>(url, data);
};

export const updateCRMContact = (sid: string | undefined, id: number, data: UpsertContactPayload, wid?: string) => {
  const url = wid
    ? `/api/workspaces/${wid}/contacts/${id}`
    : `/api/sessions/${sid}/crm-contacts/${id}`;
  return apiPut<Contact>(url, data);
};

export const deleteCRMContact = (sid: string | undefined, id: number, wid?: string) => {
  const url = wid
    ? `/api/workspaces/${wid}/contacts/${id}`
    : `/api/sessions/${sid}/crm-contacts/${id}`;
  return apiDelete(url);
};
