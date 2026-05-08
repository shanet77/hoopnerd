"use client";

import React from "react";
import { PlayerMove } from "@repo/types";
import { Card, CardHeader, CardTitle, CardContent } from "@repo/ui/card";

interface MoveHistoryProps {
  moves: PlayerMove[];
}

export function MoveHistory({ moves }: MoveHistoryProps) {
  if (moves.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle>Move History</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {moves.map((move, index) => (
            <div
              key={index}
              className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl"
            >
              <div className="w-8 h-8 bg-brand-100 rounded-full flex items-center justify-center font-bold text-brand-700">
                {index + 1}
              </div>
              <div className="flex-1">
                <span className="font-bold text-gray-800">
                  {move.playerName}
                </span>
                <span className="text-sm text-gray-500 ml-1">
                  ({move.position})
                </span>
              </div>
              <span className="text-sm text-gray-400">
                Move #{index + 1}
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
