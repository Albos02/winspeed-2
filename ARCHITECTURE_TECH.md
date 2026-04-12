# Technical Architecture: Speedometer UI Prototype

## 1. Stack
- **Framework**: React (Vite)
- **Language**: TypeScript
- **Styling**: Tailwind CSS (for layout and high-contrast theme classes)

## 2. Directory Structure
- `/src/components/`: Modular UI units (`DashboardGrid`, `DataCell`, `SettingsMenu`, `ExitButton`)
- `/src/context/`: `SettingsContext` (Global state for `theme`, `layoutMode`)
- `/src/styles/`: Global styles, reset (forcing no margins), `clamp` utilities

## 3. Component Model
- **`App`**: Root provider, wraps `SettingsProvider`, toggles between `Home` (Settings) and `Recording` (Dashboard).
- **`DashboardGrid`**: 
    - Conditional layout based on `layoutMode`.
    - Employs CSS `grid` for the 2-up (stacked) and 4-up (2x2) layouts.
    - Strict `gap: 5px`, `padding: 5px` on containers.
- **`DataCell`**: 
    - Receives `label` and `value` (mocked).
    - Uses `clamp(2rem, 15vw, 40vh)` for font responsiveness.
- **`ExitButton`**:
    - Small 5px/10px hit-box button.
    - Custom double-click handler (`onDoubleClick` prop) to trigger `isRecording` state change.

## 4. Theme & Layout Logic
- **Theme**: CSS classes applied to the root `<html>` or `<body>` element.
    - `.theme-dark`: `bg-black`, `text-white`
    - `.theme-light`: `bg-white`, `text-black`
- **Layout**: Dynamic Grid injection.
    - 2-Data: `grid-cols-1 grid-rows-2`
    - 4-Data: `grid-cols-2 grid-rows-2`

## 5. Interaction Loop
- `isRecording` boolean state in `SettingsContext`.
- If `!isRecording`: Show `SettingsMenu`.
- If `isRecording`: Show `DashboardGrid` with `ExitButton`.
- `ExitButton` triggers `setRecording(false)` via `onDoubleClick`.
