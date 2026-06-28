"use client";

import React from "react";
import { Input } from "@repo/ui/input";

interface InlineNamePromptProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

export function InlineNamePrompt({
  value,
  onChange,
  disabled = false,
}: InlineNamePromptProps) {
  return (
    <div className="space-y-2">
      <Input
        id="playerName"
        label="Your name"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="King James, Black Mamba, Chef Curry..."
        className="text-sm text-gray-600 dark:text-gray-300"
        disabled={disabled}
        autoFocus
      />
      {!value && (
        <p className="text-xs text-gray-400 dark:text-gray-500 font-medium text-center">
          Enter your name to unlock game actions
        </p>
      )}
    </div>
  );
}
