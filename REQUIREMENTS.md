# Project Requirements Summary

## Application Overview
A high-visibility, portrait-oriented mobile dashboard application. The UI design prioritizes maximum screen real estate utilization, using a minimalist, high-contrast aesthetic.

## Layout & Design
*   **Orientation**: Strictly Portrait.
*   **Spacing**: "Stuck together" design with a maximum of 5px margin/gap between elements and edges.
*   **Typography**: Clean, bold Sans-Serif font chosen for maximum readability and legibility.
*   **Themes**: High-contrast toggles:
    *   Dark: Black background, white font.
    *   Light: White background, black font.

## Modes
*   **2-Data Mode**: Speed, Heading (Stacked vertically).
*   **4-Data Mode**: 2x2 grid.
    *   Top-Left: Speed
    *   Top-Right: VMG
    *   Bottom-Left: Heading
    *   Bottom-Right: Angle to Wind

## Interaction & Navigation
*   **Settings/Home**: A dedicated screen to toggle between light/dark themes and 2-data/4-data modes.
*   **Navigation**: A small, persistent exit button is displayed on the recording/dashboard screen. Double-clicking this specific button exits the recording mode and returns to the Settings/Home page.

## Development Approach
*   **Phase 1**: "Pure View" – UI/UX prototype only.
*   **Data**: No actual GPS, sensor, or logging functionality in this initial stage.
*   **Future-Proofing**: The codebase will be structured to accept real-time data inputs in subsequent development phases.
