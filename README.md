# WinSpeed 2 - Sailing Performance App

A real-time sailing performance dashboard that runs in mobile browsers. Captures GPS position, device motion/orientation, and all available sensor data for post-session analysis.

## Features

- **Real-time Dashboard**: Speed, Heading, VMG, Wind Direction, Polar performance
- **Dual Recording**: Records full session data for analysis
- **Dual Export Formats**:
  - **GPX**: Standard GPX 1.1 format for sailing apps (GPXLogger, SailLab, etc.)
  - **JSON**: Complete session data with all sensors for detailed analysis

## Export Files

### GPX File
Standard GPX format with extensions for speed, heading, accuracy. Compatible with:
- GPXLogger
- SailLab
- Google Earth
- Any GPX-compatible software

### JSON File
Complete session data including:

```json
{
  "meta": {
    "startTime": "2025-04-25T10:00:00Z",
    "endTime": "2025-04-25T11:30:00Z",
    "duration": 5400,
    "device": "iPhone 14 Pro",
    "platform": "iOS",
    "screen": { "width": 844, "height": 390, "pixelRatio": 3 },
    "app": "winspeed-2"
  },
  "gps": [
    {"t": 1234567890000, "lat": 51.5074, "lon": -0.1278, "speed": 5.2, "heading": 180, "alt": 12, "acc": 5}
  ],
  "orientation": [
    {"t": 1234567890000, "alpha": 180, "beta": 5, "gamma": -10}
  ],
  "motion": [
    {"t": 1234567890000, "ax": 0.1, "ay": 0.2, "az": 9.8, "agx": 0.1, "agy": 0.2, "agz": 9.8, "rx": 0, "ry": 0, "rz": 0.5, "tilt": -3}
  ],
  "sensors": {
    "accelerometer": [{"t": 123, "x": 0.1, "y": 0.2, "z": 9.8}],
    "gyroscope": [{"t": 123, "x": 0.01, "y": -0.02, "z": 0.005}],
    "linearAcceleration": [{"t": 123, "x": 0, "y": 0, "z": 0}],
    "gravity": [{"t": 123, "x": 0.1, "y": 0.2, "z": 9.8}],
    "magnetometer": [{"t": 123, "x": 25.1, "y": -2.3, "z": 45.2}],
    "barometer": [{"t": 123, "pressure": 1013.25}],
    "ambientLight": [{"t": 123, "illuminance": 250}]
  },
  "polar": {"180": {"maxSpeed": 6.2, "tiltDir": "right", "tiltAngle": 15}},
  "windDir": 270,
  "stats": {
    "gpsPoints": 5400,
    "maxSpeed": 6.5,
    "avgSpeed": 4.2
  }
}
```

### JSON Field Descriptions

| Field | Description |
|-------|-------------|
| **meta** | Session metadata |
| `meta.startTime` | Session start (ISO 8601) |
| `meta.endTime` | Session end (ISO 8601) |
| `meta.duration` | Duration in seconds |
| `meta.device` | User agent string |
| `meta.platform` | Device platform |
| `meta.screen` | Screen dimensions |
| **gps** | GPS measurements (~1/sec) |
| `gps[].t` | Timestamp (Unix ms) |
| `gps[].lat` | Latitude |
| `gps[].lon` | Longitude |
| `gps[].speed` | Speed over ground (m/s) |
| `gps[].heading` | Course over ground (°) |
| `gps[].alt` | Altitude (m) |
| `gps[].acc` | GPS accuracy (m) |
| **orientation** | Device orientation (~60/sec) |
| `orientation[].alpha` | Compass heading (0-360°) |
| `orientation[].beta` | Pitch (-180 to 180°) |
| `orientation[].gamma` | Roll (-90 to 90°) |
| **motion** | Device motion (~60/sec) |
| `motion[].ax/ay/az` | Acceleration without gravity (m/s²) |
| `motion[].agx/agy/agz` | Acceleration with gravity (m/s²) |
| `motion[].rx/ry/rz` | Rotation rate (deg/s) |
| `motion[].tilt` | GPS-derived tilt fallback (°) |
| **sensors** | Generic Sensor API data |
| `sensors.accelerometer` | Raw accelerometer (m/s²) |
| `sensors.gyroscope` | Gyroscope (rad/s) |
| `sensors.linearAcceleration` | Linear acceleration (m/s²) |
| `sensors.gravity` | Gravity vector (m/s²) |
| `sensors.magnetometer` | Magnetic field (µT) |
| `sensors.barometer` | Atmospheric pressure (hPa) |
| `sensors.ambientLight` | Illuminance (lux) |
| **polar** | Best speeds per heading |
| **windDir** | Calculated wind direction (°) |
| **stats** | Session statistics |

## Data Rates

| Sensor | Rate | Points/Hour |
|--------|------|-------------|
| GPS | ~1/sec | ~3,600 |
| DeviceOrientation | ~60/sec | ~216,000 |
| DeviceMotion | ~60/sec | ~216,000 |
| Generic Sensors | ~60/sec | ~216,000 |
| Barometer | ~10/sec | ~36,000 |

## Usage

1. Open app in mobile browser
2. Grant location and motion permissions when prompted
3. Configure settings (theme, layout, units)
4. Tap START to begin recording
5. Sail normally - app records in background
6. Double-tap EXIT to stop and download files

## Browser Support

- **iOS Safari**: Full support
- **Android Chrome**: Full support with Generic Sensors
- **Other browsers**: Core features work, some sensors may be unavailable

## Requirements

- HTTPS (required for sensors)
- Geolocation permission
- DeviceMotion permission (on iOS)

## Tech Stack

- React
- TypeScript
- Vite
- Tailwind CSS