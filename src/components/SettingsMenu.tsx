import { useSettings } from '../context/SettingsContext';

export const SettingsMenu = () => {
  const { theme, setTheme, layoutMode, setLayoutMode, setIsRecording } = useSettings();

  return (
    <div className="flex flex-col items-center justify-center h-screen gap-6 p-4">
      <h1 className="text-3xl font-bold">Settings</h1>
      <button 
        className="p-4 border-2 border-current rounded" 
        onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
      >
        Toggle Theme: {theme.toUpperCase()}
      </button>
      <button 
        className="p-4 border-2 border-current rounded" 
        onClick={() => setLayoutMode(layoutMode === '2-data' ? '4-data' : '2-data')}
      >
        Toggle Layout: {layoutMode}
      </button>
      <button 
        className="p-4 border-2 border-current rounded font-bold" 
        onClick={() => setIsRecording(true)}
      >
        START RECORDING
      </button>
    </div>
  );
};
