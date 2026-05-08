"use client";

import React from "react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@repo/ui/card";

interface LobbyActionCardProps {
  title: string;
  description: string;
  variant?: "default" | "highlight";
  children: React.ReactNode;
}

export function LobbyActionCard({
  title,
  description,
  variant = "default",
  children,
}: LobbyActionCardProps) {
  const isHighlight = variant === "highlight";

  return (
    <Card
      hover
      className={
        isHighlight ? "bg-success-light/30 border-success/30" : undefined
      }
    >
      <CardHeader className="text-center pb-2">
        <CardTitle
          className={isHighlight ? "text-success-dark" : undefined}
        >
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
