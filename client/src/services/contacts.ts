import { apiGet, apiPost, apiPut, apiDelete } from "@/lib/api";
import type { Contact, UpsertContactPayload } from "@/types/contact";

export const getCRMContacts = (sid: string, search?: string) => {
  const query = search ? `?q=${encodeURIComponent(search)}` : "";
  return apiGet<Contact[] | null>(`/api/sessions/${sid}/crm-contacts${query}`).then(
    (res) => (Array.isArray(res) ? res : [])
  );
};

export const createCRMContact = (sid: string, data: UpsertContactPayload) =>
  apiPost<Contact>(`/api/sessions/${sid}/crm-contacts`, data);

export const updateCRMContact = (sid: string, id: number, data: UpsertContactPayload) =>
  apiPut<Contact>(`/api/sessions/${sid}/crm-contacts/${id}`, data);

export const deleteCRMContact = (sid: string, id: number) =>
  apiDelete(`/api/sessions/${sid}/crm-contacts/${id}`);
