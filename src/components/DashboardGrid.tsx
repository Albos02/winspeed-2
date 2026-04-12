import React from 'react';
import { useSettings } from '../context/SettingsContext';
import { DataCell } from './DataCell';

export const DashboardGrid = () => {
  const { layoutMode } = useSettings();

  const gridClass = layoutMode === '2-data' 
    ? 'grid-rows-2' 
    : 'grid-cols-2 grid-rows-2';

  return (
    <div className={`grid h-[calc(100vh-10px)] w-[calc(100vw-10px)] p-1 gap-1 ${gridClass}`}>
      {layoutMode === '2-data' ? (
        <>
          <DataCell label="Speed" value="12.5" />
          <DataCell label="Heading" value="180°" />
        </>
      ) : (
        <>
          <DataCell label="Speed" value="12.5" />
          <DataCell label="VMG" value="9.2" />
          <DataCell label="Heading" value="180°" />
          <DataCell label="Angle to Wind" value="45°" />
        </>
      )}
    </div>
  );
};
