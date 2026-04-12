import React, { createContext, useContext, useState, ReactNode } from 'react';

type Theme = 'light' | 'dark';
type LayoutMode = '2-data' | '4-data';

interface SettingsContextType {
  theme: Theme;
  layoutMode: LayoutMode;
  isRecording: boolean;
  setTheme: (theme: Theme) => void;
  setLayoutMode: (mode: LayoutMode) => void;
  setIsRecording: (recording: boolean) => void;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export const SettingsProvider = ({ children }: { children: ReactNode }) => {
  const [theme, setTheme] = useState<Theme>('light');
  const [layoutMode, setLayoutMode] = useState<LayoutMode>('2-data');
  const [isRecording, setIsRecording] = useState<boolean>(false);

  return (
    <SettingsContext.Provider value={{ theme, setTheme, layoutMode, setLayoutMode, isRecording, setIsRecording }}>
      <div className={theme === 'dark' ? 'theme-dark' : ''}>
        {children}
      </div>
    </SettingsContext.Provider>
  );
};

export const useSettings = () => {
  const context = useContext(SettingsContext);
  if (!context) throw new Error('useSettings must be used within SettingsProvider');
  return context;
};
