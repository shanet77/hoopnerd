"use client";

import React, { useEffect, useRef, useMemo, useState } from "react";
import { useTheme } from "next-themes";
import { Player, PlayerConnection } from "@repo/types";

interface PlayerGraphProps {
  startingPlayer: Player | null | undefined;
  connections: PlayerConnection[];
  width?: number;
}

interface NodePosition {
  player: Player;
  x: number;
  y: number;
}

export function PlayerGraph({
  startingPlayer,
  connections,
  width = 800,
}: PlayerGraphProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const nodeSpacing = 90;
  const [canvasSize, setCanvasSize] = useState({ width, height: 320 });
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  const orderedPlayers = useMemo(() => {
    const players: Player[] = [];
    if (startingPlayer) {
      players.push(startingPlayer);
    }
    for (const connection of connections) {
      if (!players.some((player) => player.id === connection.toPlayer.id)) {
        players.push(connection.toPlayer);
      }
    }
    return players;
  }, [startingPlayer, connections]);

  const graphDescription = useMemo(() => {
    if (!startingPlayer) {
      return "Game will start with a random player.";
    }
    const connectionSummary =
      connections.length === 0
        ? "No connections yet."
        : connections
            .map((connection) => {
              const season = connection.seasonYear ? ` in ${connection.seasonYear}` : "";
              const team = connection.teamName ? ` with ${connection.teamName}` : "";
              return `${connection.fromPlayer.name} to ${connection.toPlayer.name}${team}${season}`;
            })
            .join(". ");
    return `Starting player: ${startingPlayer.name}. ${connectionSummary}`;
  }, [startingPlayer, connections]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateSize = () => {
      setCanvasSize({
        width: container.clientWidth || width,
        height: container.clientHeight || 320,
      });
    };

    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(container);

    return () => observer.disconnect();
  }, [width]);

  const nodePositions = useMemo(() => {
    const positions = new Map<number, NodePosition>();

    if (!startingPlayer && connections.length === 0) {
      return positions;
    }

    const centerX = canvasSize.width / 2;
    const newestIndex = Math.max(0, orderedPlayers.length - 1);
    const newestY = canvasSize.height / 2;
    const firstY = newestY - newestIndex * nodeSpacing;

    orderedPlayers.forEach((player, index) => {
      positions.set(player.id, {
        player,
        x: centerX,
        y: firstY + index * nodeSpacing,
      });
    });

    return positions;
  }, [startingPlayer, connections.length, orderedPlayers, canvasSize.width, canvasSize.height, nodeSpacing]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const displayWidth = canvasSize.width;
    const displayHeight = canvasSize.height;
    
    canvas.width = displayWidth * dpr;
    canvas.height = displayHeight * dpr;
    canvas.style.width = `${displayWidth}px`;
    canvas.style.height = `${displayHeight}px`;
    
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, displayWidth, displayHeight);

    // Theme-aware canvas colors
    const isDark = document.documentElement.classList.contains("dark");
    const COLORS = {
      edgeStroke: isDark ? "#818cf8" : "#6366f1",
      labelBg: isDark ? "#1e1b4b" : "#eef2ff",
      labelBorder: isDark ? "#4338ca" : "#c7d2fe",
      labelText: isDark ? "#c7d2fe" : "#3730a3",
      startingNodeFill: isDark ? "#4ade80" : "#22c55e",
      regularNodeFill: isDark ? "#818cf8" : "#6366f1",
      nodeStroke: isDark ? "#c7d2fe" : "#1e1b4b",
      nodeText: "#ffffff",
    };

    ctx.strokeStyle = COLORS.edgeStroke;
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);

    const drawRoundedRect = (
      context: CanvasRenderingContext2D,
      x: number,
      y: number,
      rectWidth: number,
      rectHeight: number,
      radius: number
    ) => {
      const r = Math.min(radius, rectWidth / 2, rectHeight / 2);
      context.beginPath();
      context.moveTo(x + r, y);
      context.lineTo(x + rectWidth - r, y);
      context.arcTo(x + rectWidth, y, x + rectWidth, y + r, r);
      context.lineTo(x + rectWidth, y + rectHeight - r);
      context.arcTo(x + rectWidth, y + rectHeight, x + rectWidth - r, y + rectHeight, r);
      context.lineTo(x + r, y + rectHeight);
      context.arcTo(x, y + rectHeight, x, y + rectHeight - r, r);
      context.lineTo(x, y + r);
      context.arcTo(x, y, x + r, y, r);
      context.closePath();
    };

    for (const connection of connections) {
      const fromPos = nodePositions.get(connection.fromPlayer.id);
      const toPos = nodePositions.get(connection.toPlayer.id);

      if (fromPos && toPos) {
        ctx.beginPath();
        ctx.moveTo(fromPos.x, fromPos.y);
        ctx.lineTo(toPos.x, toPos.y);
        ctx.stroke();

        if (connection.seasonYear && connection.teamName) {
          const labelX = fromPos.x;
          const labelY = (fromPos.y + toPos.y) / 2;

          const labelText = `${connection.teamName} (${connection.seasonYear})`;
          ctx.save();
          ctx.setLineDash([]);
          ctx.font = "bold 11px sans-serif";
          const labelMetrics = ctx.measureText(labelText);
          const labelPaddingX = 6;
          const labelPaddingY = 3;
          const labelWidth = Math.ceil(labelMetrics.width) + labelPaddingX * 2;
          const labelHeight = 16 + labelPaddingY * 2;
          const labelLeft = labelX - labelWidth / 2;
          const labelTop = labelY - labelHeight / 2;

          drawRoundedRect(ctx, labelLeft, labelTop, labelWidth, labelHeight, 8);
          ctx.fillStyle = COLORS.labelBg;
          ctx.fill();
          ctx.strokeStyle = COLORS.labelBorder;
          ctx.lineWidth = 1;
          ctx.stroke();

          ctx.fillStyle = COLORS.labelText;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(labelText, labelX, labelY);
          ctx.restore();
        }
      }
    }

    ctx.setLineDash([]);

    Array.from(nodePositions.values()).forEach((node) => {
      const isStartingPlayer = startingPlayer?.id === node.player.id;

      ctx.font = "bold 12px sans-serif";
      const textMetrics = ctx.measureText(node.player.name);
      const textPaddingX = 10;
      const textPaddingY = 6;
      const nodeWidth = Math.ceil(textMetrics.width) + textPaddingX * 2;
      const nodeHeight = 24 + textPaddingY * 2;
      const nodeLeft = node.x - nodeWidth / 2;
      const nodeTop = node.y - nodeHeight / 2;

      drawRoundedRect(ctx, nodeLeft, nodeTop, nodeWidth, nodeHeight, 14);

      if (isStartingPlayer) {
        ctx.fillStyle = COLORS.startingNodeFill;
      } else {
        ctx.fillStyle = COLORS.regularNodeFill;
      }
      ctx.fill();
      
      ctx.strokeStyle = COLORS.nodeStroke;
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = COLORS.nodeText;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      ctx.fillText(node.player.name, node.x, node.y);
    });
  }, [nodePositions, connections, startingPlayer, canvasSize.width, canvasSize.height, isDark]);

  if (!startingPlayer && connections.length === 0) {
    return (
      <div
        ref={containerRef}
        className="player-graph-container h-64 md:h-80 lg:h-96 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700"
        aria-label="Player connection graph"
      >
        <p className="text-gray-500 dark:text-gray-400 text-center">Game will start with a random player...</p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="player-graph-container h-64 md:h-80 lg:h-96 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden"
      aria-label="Player connection graph"
    >
      <canvas
        ref={canvasRef}
        className="w-full"
        role="img"
        aria-label={graphDescription}
      />
      <p className="sr-only">{graphDescription}</p>
    </div>
  );
}

export default PlayerGraph;
