import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getCRMContacts, createCRMContact, updateCRMContact, deleteCRMContact } from "@/services/contacts";
import type { UpsertContactPayload } from "@/types/contact";

export const useContacts = (sid: string | null | undefined, search?: string) => {
  return useQuery({
    queryKey: ["crm-contacts", sid, search || ""],
    queryFn: () => getCRMContacts(sid!, search),
    enabled: !!sid,
    staleTime: 60 * 1000,
    placeholderData: (previousData) => previousData,
  });
};

export const useSaveContact = (sid: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id?: number; data: UpsertContactPayload }) => {
      if (id) {
        return updateCRMContact(sid, id, data);
      }
      return createCRMContact(sid, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crm-contacts", sid] });
      queryClient.invalidateQueries({ queryKey: ["contact-info", sid] });
    },
  });
};

export const useDeleteContact = (sid: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteCRMContact(sid, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crm-contacts", sid] });
      queryClient.invalidateQueries({ queryKey: ["contact-info", sid] });
    },
  });
};
