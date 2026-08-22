import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getCRMContacts, createCRMContact, updateCRMContact, deleteCRMContact } from "@/services/contacts";
import type { UpsertContactPayload } from "@/types/contact";

export const useContacts = (sid?: string | null, search?: string, wid?: string) => {
  return useQuery({
    queryKey: ["crm-contacts", wid || sid, search || ""],
    queryFn: () => getCRMContacts(sid, search, wid),
    enabled: !!sid || !!wid,
    staleTime: 60 * 1000,
    placeholderData: (previousData) => previousData,
  });
};

export const useSaveContact = (sid: string, wid?: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id?: number; data: UpsertContactPayload }) => {
      if (id) {
        return updateCRMContact(sid, id, data, wid);
      }
      return createCRMContact(sid, data, wid);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crm-contacts"] });
      queryClient.invalidateQueries({ queryKey: ["contact-info"] });
    },
  });
};

export const useDeleteContact = (sid: string, wid?: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteCRMContact(sid, id, wid),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crm-contacts"] });
      queryClient.invalidateQueries({ queryKey: ["contact-info"] });
    },
  });
};
