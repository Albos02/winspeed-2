import type { PolarEntry } from '../types';

export function normalizeHeading(h: number): number {
  h = h % 360;
  if (h < 0) h += 360;
  return Math.round(h);
}

export function calculateWindDirection(polar: Map<number, PolarEntry>): number | null {
  if (polar.size < 10) return null;

  const headings = Array.from(polar.keys());
  const bestAxis: { wind: number; score: number } = { wind: 0, score: 0 };

  for (const h1 of headings) {
    const entry1 = polar.get(h1);
    if (!entry1 || entry1.tiltDirection === 'center') continue;

    const opposite1 = (h1 + 180) % 360;
    const entry2 = polar.get(opposite1);
    if (!entry2 || entry2.tiltDirection === 'center') continue;

    const speedDiff = Math.abs(entry1.maxSpeed - entry2.maxSpeed);
    const tiltOpposite = (entry1.tiltDirection === 'left' && entry2.tiltDirection === 'right') ||
                        (entry1.tiltDirection === 'right' && entry2.tiltDirection === 'left');

    if (!tiltOpposite) continue;

    let score = 0;
    score += Math.max(0, 50 - speedDiff * 5);
    score += Math.min(20, (entry1.maxSpeed + entry2.maxSpeed) * 2);

    if (score > bestAxis.score) {
      bestAxis.wind = normalizeHeading(entry1.tiltDirection === 'right' ? h1 - 90 : h1 + 90);
      bestAxis.score = score;
    }
  }

  return bestAxis.score > 30 ? bestAxis.wind : null;
}

export function calculateVmg(speed: number, heading: number, windDirection: number): number {
  const angle = Math.abs(heading - windDirection);
  const twa = Math.min(angle, 360 - angle);
  return speed * Math.cos(twa * Math.PI / 180);
}

export function calculateTiltFromGps(headingHistory: { heading: number; time: number }[]): number | null {
  if (headingHistory.length < 3) return null;
  const recent = headingHistory.slice(-5);
  if (recent.length < 2) return null;
  
  const timeDiff = (recent[recent.length - 1].time - recent[0].time) / 1000;
  if (timeDiff < 0.5) return null;

  let totalRotation = 0;
  for (let i = 1; i < recent.length; i++) {
    let diff = recent[i].heading - recent[i - 1].heading;
    if (diff > 180) diff -= 360;
    else if (diff < -180) diff += 360;
    totalRotation += diff;
  }

  const rate = totalRotation / timeDiff;
  return Math.max(-45, Math.min(45, rate * 30));
}
