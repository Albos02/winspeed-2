export type TiltDirection = 'left' | 'right' | 'center';

export interface PolarEntry {
  maxSpeed: number
  tiltDirection: TiltDirection
  tiltAngle: number
}

export interface GpsPoint {
  time: number
  lat: number
  lon: number
  speed: number | null
  heading: number | null
  altitude: number | null
  accuracy: number | null
}
