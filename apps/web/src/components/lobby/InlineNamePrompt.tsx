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
  );
}
