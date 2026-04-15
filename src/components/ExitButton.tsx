import { useSettings } from '../context/SettingsContext';

export const ExitButton = () => {
  const { setIsRecording } = useSettings();

  return (
    <button 
      className="absolute top-0 right-0 w-12 h-12 border-2 border-current rounded-bl-lg cursor-pointer flex items-center justify-center font-bold text-xs bg-transparent"
      onClick={() => setIsRecording(false)}
    >
      EXIT
    </button>
  );
};
