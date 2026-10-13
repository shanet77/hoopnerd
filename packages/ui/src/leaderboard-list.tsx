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
  if (!items.length) {
    return <p className="text-sm text-gray-400 dark:text-gray-500">{emptyText}</p>;
  }

  return (
    <ol className="divide-y divide-gray-200 dark:divide-gray-700">
      {items.map((item, index) => (
        <li
          key={`${item.label}-${index}`}
          className="flex items-center gap-3 py-2.5"
        >
          <span className="w-5 text-right text-sm font-bold tabular-nums text-gray-400 dark:text-gray-500">
            {index + 1}
          </span>
          <span className="flex-1 font-semibold text-gray-700 dark:text-gray-300 truncate">
            {item.label}
          </span>
          <span className="text-sm font-bold tabular-nums text-basketball">
            {item.value}
          </span>
        </li>
      ))}
    </ol>
  );
};
