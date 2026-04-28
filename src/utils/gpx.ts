import type { GpsPoint } from '../types';

export function formatGpx(points: GpsPoint[]): string {
  const header = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="winspeed-2"
  xmlns="http://www.topografix.com/GPX/1/1"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">
  <metadata>
    <name>winspeed-${points.length > 0 ? new Date(points[0].time).toISOString() : 'session'}</name>
    <time>${new Date().toISOString()}</time>
  </metadata>
  <trk>
    <name>Sailing Session</name>
    <trkseg>
`;
  const trackPoints = points.map(p => `      <trkpt lat="${p.lat.toFixed(6)}" lon="${p.lon.toFixed(6)}">
        <ele>${p.altitude?.toFixed(1) ?? '0'}</ele>
        <time>${new Date(p.time).toISOString()}</time>
        <extensions>
          <speed>${p.speed ?? 0}</speed>
          <heading>${p.heading ?? 0}</heading>
          <accuracy>${p.accuracy ?? 0}</accuracy>
        </extensions>
      </trkpt>`).join('\n');
  const footer = `    </trkseg>
  </trk>
</gpx>`;
  return header + trackPoints + '\n' + footer;
}
