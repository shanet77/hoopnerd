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
  description?: string;
  variant?: "default" | "highlight";
  connected?: boolean;
  icon?: React.ReactNode;
  size?: "default" | "compact" | "feature";
  children: React.ReactNode;
}

export function LobbyActionCard({
  title,
  description,
  variant = "default",
  connected,
  icon,
  size = "default",
  children,
}: LobbyActionCardProps) {
  const isHighlight = variant === "highlight";
  const isCompact = size === "compact";
  const isFeature = size === "feature";

  const connectionDot =
    typeof connected === "boolean" ? (
      <span
        className={`inline-block w-2.5 h-2.5 rounded-full mr-2 align-middle ${
          connected ? "bg-success" : "bg-error"
        }`}
        aria-label={connected ? "Connected" : "Disconnected"}
        title={connected ? "Connected" : "Disconnected"}
      />
    ) : null;

  const titleContent = (
    <CardTitle
      className={`${
        isHighlight
          ? "text-success-dark dark:text-success-light"
          : undefined
      } ${isFeature ? "text-2xl" : ""}`}
    >
      {isCompact && connectionDot}
      {title}
    </CardTitle>
  );

  return (
    <Card
      hover
      className={
        isHighlight
          ? "bg-success-light/30 dark:bg-success-dark/20 border-success/30 dark:border-success/20"
          : undefined
      }
    >
      <CardHeader
        className={
          isCompact
            ? "flex items-start gap-3 pb-0"
            : `text-center pb-2 ${isFeature ? "pb-3" : ""}`
        }
      >
        {!isCompact && (
          <div className="flex flex-col items-center">
            {connectionDot}
            {icon && (
              <div className="mb-2 text-basketball" aria-hidden="true">
                {icon}
              </div>
            )}
            {titleContent}
          </div>
        )}
        {isCompact && (
          <>
            {icon && (
              <div
                className="shrink-0 mt-0.5 text-basketball"
                aria-hidden="true"
              >
                {icon}
              </div>
            )}
            <div className="min-w-0">
              {titleContent}
              {description && (
                <CardDescription className="mt-0.5 text-xs">
                  {description}
                </CardDescription>
              )}
            </div>
          </>
        )}
        {!isCompact && description && (
          <CardDescription>{description}</CardDescription>
        )}
      </CardHeader>
      {!isCompact && <CardContent>{children}</CardContent>}
      {isCompact && <div className="mt-3">{children}</div>}
    </Card>
  );
}
