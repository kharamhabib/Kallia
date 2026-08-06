import { GeneralSettingsPane } from "./GeneralSettingsPane";

export const SettingsTab = ({ sid: _sid }: { sid: string }) => {
  return (
    <div className="space-y-6 max-w-4xl mx-auto animate-fade-in">
      <GeneralSettingsPane />
    </div>
  );
};

