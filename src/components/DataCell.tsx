import React from 'react';

interface DataCellProps {
  label: string;
  value: string;
}

export const DataCell = ({ label, value }: DataCellProps) => {
  return (
    <div className="flex flex-col items-center justify-center h-full w-full border-2 border-current p-1 overflow-hidden">
      <span className="text-[clamp(1rem,5vw,2rem)] font-bold uppercase tracking-wider">{label}</span>
      <span className="text-[clamp(2rem,25vw,50vh)] font-black leading-none">{value}</span>
    </div>
  );
};
