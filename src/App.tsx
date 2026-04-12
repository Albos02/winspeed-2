import { SettingsProvider, useSettings } from './context/SettingsContext';
import { DashboardGrid } from './components/DashboardGrid';
import { SettingsMenu } from './components/SettingsMenu';
import { ExitButton } from './components/ExitButton';

const Main = () => {
  const { isRecording } = useSettings();
  
  if (!isRecording) return <SettingsMenu />;
  
  return (
    <>
      <DashboardGrid />
      <ExitButton />
    </>
  );
};

function App() {
  return (
    <SettingsProvider>
      <Main />
    </SettingsProvider>
  );
}

export default App;
