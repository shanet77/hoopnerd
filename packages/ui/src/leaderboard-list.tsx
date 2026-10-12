import React from "react";

interface LeaderboardItem {
  label: string;
  value: string | number;
}

interface LeaderboardListProps {
  items: LeaderboardItem[];
  emptyText?: string;
}

export const LeaderboardList = ({
  items,
  emptyText = "No data yet",
}: LeaderboardListProps) => {
  return (
    <div className="rounded-2xl border-2 border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 px-4 py-3">
      {items.length ? (
        <ol className="space-y-2">
          {items.map((item, index) => (
            <li
              key={`${item.label}-${index}`}
              className="flex items-center justify-between rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2"
            >
              <div className="flex items-center gap-3">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-100 dark:bg-brand-900/40 text-xs font-bold text-brand-700 dark:text-brand-300">
                  {index + 1}
                </span>
                <span className="font-semibold text-gray-700 dark:text-gray-300">
                  {item.label}
                </span>
              </div>
              <span className="rounded-full bg-warning-light px-3 py-1 text-xs font-bold text-warning-dark">
                {item.value}
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-sm text-gray-400 dark:text-gray-500">{emptyText}</p>
      )}
    </div>
  );
};
