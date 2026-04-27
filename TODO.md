# Project To-Do List

- [x] Initialize React + Vite + TypeScript project
- [x] Install Tailwind CSS and configure for high-contrast themes
- [x] Create SettingsContext for theme and layout mode management
- [x] Implement DashboardGrid and DataCell components with clamp typography
- [x] Build SettingsMenu and ExitButton (with double-click functionality)
8: - [x] Configure PWA metadata and manifest for installability
9: 
10: ## Refactoring & Technical Debt
11: 
12: - [ ] Extract analytical functions (VMG, wind direction, polar) to a utility file (src/utils/sailing.ts)
13: - [ ] Extract sensor initialization and event management into a custom hook (src/hooks/useSensors.ts)
14: - [ ] Extract Geolocation tracking and state management into a custom hook (src/hooks/useGeolocation.ts)
15: - [ ] Separate SessionsView and main recording UI components into distinct files within src/components/
16: - [ ] Implement unit tests for critical mathematical functions (calculateWindDirection, calculateVmg, calculateTiltFromGps)
17: - [ ] Establish a formal data structure/type definition file for sensor and session models (src/types/index.ts)
18: - [ ] Add comprehensive error boundary to prevent full-app crashes on sensor/API failures
19: - [ ] Refactor state management to use context or a lightweight store (Zustand) to remove prop-drilling and massive refs in App component
20: - [ ] Implement input validation/sanitization for imported sessions and saved data to prevent localStorage injection bugs
21: - [ ] Migrate Tailwind configuration to a more modular structure and address current hardcoded style constants
22: - [ ] Replace manual Blob/URL creation in UI with a dedicated file service/downloader utility class
23: - [ ] Add E2E tests for the recording flow to ensure sensors are correctly started and stopped
24: - [ ] Improve type safety: eliminate all usages of 'any' (e.g., DeviceOrientationEvent) by creating proper declaration files or type interfaces
25: - [ ] Implement logging/analytics for production tracking of sensor failure rates (Web Sensor support varies wildly by device)
26: - [ ] Improve mobile responsiveness by defining a formal design system instead of inline CSS grid/clamp calculations
