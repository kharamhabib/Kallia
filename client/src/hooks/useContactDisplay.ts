import { useContactInfo } from "./useContactInfo";
import { formatPhoneNumber, getInitials } from "@/utils/format";

export function useContactDisplay(
  sid: string | null | undefined,
  phoneOrJid: string | null | undefined,
  initialName?: string
) {
  const { data: contact, isLoading } = useContactInfo(sid, phoneOrJid);

  const rawPhone = contact?.phone || phoneOrJid || "";
  const formattedPhone = formatPhoneNumber(rawPhone);

  const rawName = initialName || contact?.name || "";
  const isJustPhone =
    !rawName ||
    rawName.replace(/\D/g, "") === rawPhone.replace(/\D/g, "");

  const contactName = isJustPhone ? "" : rawName;
  const displayName = contactName || "Contato WhatsApp";
  const pictureUrl = contact?.pictureUrl || "";
  const initials = getInitials(contactName || "W");

  return {
    contactName,       // "Valteir Queiroz" or ""
    displayName,       // "Valteir Queiroz" or "Contato WhatsApp"
    formattedPhone,    // "+55 (27) 99530-7734"
    pictureUrl,        // "https://..." or ""
    initials,          // "VQ" or "W"
    hasRealName: !isJustPhone,
    isLoading,
  };
}
