import { create } from "zustand";

export type NavSection =
  | "dashboard"
  | "agents"
  | "knowledge"
  | "connections"
  | "schedules"
  | "webphone"
  | "calls"
  | "chat_history"
  | "contacts"
  | "analytics"
  | "live_monitoring"
  | "nps_qa"
  | "integrations"
  | "billing"
  | "settings";

type NavigationState = {
  activeSection: NavSection;
  setActiveSection: (section: NavSection) => void;
  agentStatus: "available" | "busy" | "paused";
  setAgentStatus: (status: "available" | "busy" | "paused") => void;
  dialPhone: string;
  setDialPhone: (phone: string) => void;
  navigateToWebphone: (phone?: string) => void;
};

export const useNavigation = create<NavigationState>((set) => ({
  activeSection: "dashboard",
  setActiveSection: (section) => set({ activeSection: section }),
  agentStatus: "available",
  setAgentStatus: (status) => set({ agentStatus: status }),
  dialPhone: "",
  setDialPhone: (phone) => set({ dialPhone: phone }),
  navigateToWebphone: (phone) =>
    set((state) => ({
      activeSection: "webphone",
      dialPhone: phone !== undefined ? phone : state.dialPhone,
    })),
}));
