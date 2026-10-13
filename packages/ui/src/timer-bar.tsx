import React from "react";

interface TimerBarProps {
  value: number;
  max?: number;
  urgentThreshold?: number;
}

export const TimerBar = ({
  value,
  max = 25,
  urgentThreshold = 5,
}: TimerBarProps) => {
  const percent = Math.max(0, Math.min(100, (value / max) * 100));
  const isUrgent = value <= urgentThreshold;

  return (
    <div
      className="relative h-3 bg-gray-200 dark:bg-gray-700 rounded-sm overflow-hidden"
      role="progressbar"
      aria-label="Turn timer"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
    >
      <div
        className={`absolute left-0 top-0 h-full rounded-sm transition-all duration-1000 ${
          isUrgent ? "bg-error" : "bg-success"
        }`}
        style={{ width: `${percent}%` }}
      />
    </div>
  );
};
