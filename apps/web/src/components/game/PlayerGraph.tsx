"use client";

import React, { useEffect, useRef, useMemo } from "react";
import { Player, PlayerConnection } from "@repo/types";

interface PlayerGraphProps {
  startingPlayer: Player | null | undefined;
  connections: PlayerConnection[];
  width?: number;
  height?: number;
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

  const nodePositions = useMemo(() => {
    const positions = new Map<number, NodePosition>();
    
    if (!startingPlayer && connections.length === 0) {
      return positions;
    }

    const container = containerRef.current;
    const canvasWidth = container?.clientWidth || width;
    const padding = 60;
    const centerX = canvasWidth / 2;
    
    let currentY = padding + 40;

    if (startingPlayer) {
      positions.set(startingPlayer.id, {
        player: startingPlayer,
        x: centerX,
        y: currentY,
      });
      currentY += 100;
    }

    for (const connection of connections) {
      if (!positions.has(connection.toPlayer.id)) {
        const existingCount = positions.size - 1;
        const side = existingCount % 2 === 0 ? 1 : -1;
        const level = Math.ceil((existingCount + 1) / 2);
        const offset = side * level * 60;
        
        positions.set(connection.toPlayer.id, {
          player: connection.toPlayer,
          x: centerX + offset,
          y: currentY,
        });
        currentY += 70;
      }
    }

    return positions;
  }, [startingPlayer, connections, width]);

  const canvasHeight = useMemo(() => {
    const baseHeight = startingPlayer ? 140 : 100;
    return Math.max(300, baseHeight + connections.length * 70);
  }, [startingPlayer, connections.length]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const displayWidth = containerRef.current?.clientWidth || width;
    
    canvas.width = displayWidth * dpr;
    canvas.height = canvasHeight * dpr;
    canvas.style.width = `${displayWidth}px`;
    canvas.style.height = `${canvasHeight}px`;
    
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, displayWidth, canvasHeight);

    ctx.strokeStyle = "#6366f1";
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
        
        const midY = (fromPos.y + toPos.y) / 2;
        ctx.bezierCurveTo(
          fromPos.x, midY,
          toPos.x, midY,
          toPos.x, toPos.y
        );
        ctx.stroke();

        if (connection.seasonYear && connection.teamName) {
          const labelX = (fromPos.x + toPos.x) / 2;
          const labelY = midY - 10;

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
          ctx.fillStyle = "#eef2ff";
          ctx.fill();
          ctx.strokeStyle = "#c7d2fe";
          ctx.lineWidth = 1;
          ctx.stroke();

          ctx.fillStyle = "#3730a3";
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
        ctx.fillStyle = "#22c55e";
      } else {
        ctx.fillStyle = "#6366f1";
      }
      ctx.fill();
      
      ctx.strokeStyle = "#1e1b4b";
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      ctx.fillText(node.player.name, node.x, node.y);
    });
  }, [nodePositions, connections, startingPlayer, canvasHeight, width]);

  if (!startingPlayer && connections.length === 0) {
    return (
      <div ref={containerRef} className="player-graph-container p-4 bg-gray-50 rounded-lg border border-gray-200">
        <p className="text-gray-500 text-center">Game will start with a random player...</p>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="player-graph-container bg-white rounded-lg border border-gray-200 overflow-hidden">
      <canvas
        ref={canvasRef}
        className="w-full"
      />
    </div>
  );
}

export default PlayerGraph;
