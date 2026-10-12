"use client";

import React from "react";

interface SeasonPreset {
  label: string;
  min: number | undefined;
  max: number | undefined;
}

const SEASON_PRESETS: SeasonPreset[] = [
  { label: "All Time", min: undefined, max: undefined },
  { label: "80s", min: 1980, max: 1989 },
  { label: "90s", min: 1990, max: 1999 },
  { label: "2000s", min: 2000, max: 2009 },
  { label: "2010s", min: 2010, max: 2019 },
  { label: "2020s", min: 2020, max: 2026 },
];

interface CpuSeasonPickerProps {
  minYear?: number;
  maxYear?: number;
  loading?: boolean;
  seasonYearMin?: number;
  seasonYearMax?: number;
  onChange: (min: number | undefined, max: number | undefined) => void;
}

export function CpuSeasonPicker({
  minYear,
  maxYear,
  loading = false,
  seasonYearMin,
  seasonYearMax,
  onChange,
}: CpuSeasonPickerProps) {
  const isPresetActive = (preset: SeasonPreset) =>
    seasonYearMin === preset.min && seasonYearMax === preset.max;

  return (
    <div className="space-y-3">
      <span className="text-sm font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
        Season
      </span>

      <div className="flex flex-wrap gap-1.5">
        {SEASON_PRESETS.map((preset) => {
          const active = isPresetActive(preset);
          return (
            <button
              key={preset.label}
              type="button"
              onClick={() => onChange(preset.min, preset.max)}
              disabled={loading}
              className={`
                px-3 py-1.5 text-xs font-bold rounded-full border-2 transition-all duration-150
                ${active
                  ? "bg-brand-100 dark:bg-brand-900/40 text-brand-700 dark:text-brand-300 border-brand-300"
                  : "bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 hover:text-gray-700 dark:hover:text-gray-200"
                }
                disabled:opacity-40 disabled:cursor-not-allowed
              `}
            >
              {preset.label}
            </button>
          );
        })}
      </div>

      <div className="flex gap-2 items-center">
        <input
          id="season-year-min"
          type="number"
          min={minYear}
          max={maxYear}
          value={seasonYearMin ?? ""}
          onChange={(e) => {
            const val = e.target.value;
            onChange(val === "" ? undefined : Number(val), seasonYearMax);
          }}
          disabled={loading}
          placeholder="From"
          className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-gray-800 dark:text-gray-100 text-sm transition-all duration-200 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:border-brand-400 dark:focus:border-brand-500 focus:bg-white dark:focus:bg-gray-900 focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-300 dark:focus-visible:ring-brand-700 focus-visible:ring-offset-1 disabled:bg-gray-100 dark:disabled:bg-gray-800 disabled:cursor-not-allowed"
        />
        <span className="text-gray-400 dark:text-gray-500 font-bold text-sm">
          –
        </span>
        <input
          id="season-year-max"
          type="number"
          min={minYear}
          max={maxYear}
          value={seasonYearMax ?? ""}
          onChange={(e) => {
            const val = e.target.value;
            onChange(seasonYearMin, val === "" ? undefined : Number(val));
          }}
          disabled={loading}
          placeholder="To"
          className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-gray-800 dark:text-gray-100 text-sm transition-all duration-200 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:border-brand-400 dark:focus:border-brand-500 focus:bg-white dark:focus:bg-gray-900 focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-300 dark:focus-visible:ring-brand-700 focus-visible:ring-offset-1 disabled:bg-gray-100 dark:disabled:bg-gray-800 disabled:cursor-not-allowed"
        />
      </div>
    </div>
  );
}
