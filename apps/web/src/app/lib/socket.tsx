"use client";

import { io, Socket } from "socket.io-client";
import { createContext, useContext, useEffect, useState } from "react";
import {
  WebSocketEvents,
  JoinRoomRequest,
  SubmitMoveRequest,
  JoinRoomResponse,
  SubmitMoveResponse,
  JoinMatchmakingRequest,
  JoinMatchmakingResponse,
  LeaveRoomRequest,
  CreateCpuGameRequest,
  CreateCpuGameResponse,
  CreateSoloRunRequest,
  CreateSoloRunResponse,
  ResumeSoloRunRequest,
  ResumeSoloRunResponse,
  SubmitSoloMoveRequest,
  SubmitSoloMoveResponse,
  EndSoloRunRequest,
  EndSoloRunResponse,
} from "@repo/types";

// Define a type for our socket context value
type SocketContextType = {
  socket: Socket<WebSocketEvents, WebSocketEvents> | null;
  isConnected: boolean;
};

// Create WebSocket context
const SocketContext = createContext<SocketContextType | undefined>(undefined);

// Custom hook to use the socket context
export const useSocket = () => {
  const context = useContext(SocketContext);
  if (context === undefined) {
    throw new Error("useSocket must be used within a SocketProvider");
  }
  return context;
};

// Provider component to wrap the app
export const SocketProvider = ({ children }: { children: React.ReactNode }) => {
  const [socket, setSocket] = useState<Socket<
    WebSocketEvents,
    WebSocketEvents
  > | null>(null);
  const [isConnected, setIsConnected] = useState<boolean>(false);

  useEffect(() => {
    // Only run on the client side
    if (typeof window !== "undefined") {
      // Connect to the socket server
      const newSocket = io(
        process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001",
        {
          transports: ["websocket"],
        },
      );

      newSocket.on("connect", () => {
        console.log("Connected to server:", newSocket.id);
        setIsConnected(true);
      });

      newSocket.on("disconnect", () => {
        console.log("Disconnected from server");
        setIsConnected(false);
      });

      setSocket(newSocket);

      // Cleanup on unmount
      return () => {
        newSocket.disconnect();
      };
    }
  }, []);

  return (
    <SocketContext.Provider value={{ socket, isConnected }}>
      {children}
    </SocketContext.Provider>
  );
};

// Helper functions for socket operations
export const joinRoom = (
  socket: Socket<WebSocketEvents, WebSocketEvents>,
  data: JoinRoomRequest,
) => {
  return new Promise<JoinRoomResponse>((resolve, reject) => {
    const onJoined = (response: JoinRoomResponse) => {
      clearTimeout(timeout);
      resolve(response);
    };

    const timeout = setTimeout(() => {
      socket.off("room_joined", onJoined);
      reject(new Error("join_room timed out"));
    }, 8000);

    socket.once("room_joined", onJoined);
    socket.emit("join_room", data);
  });
};

export const submitMove = (
  socket: Socket<WebSocketEvents, WebSocketEvents>,
  data: SubmitMoveRequest,
) => {
  return new Promise<SubmitMoveResponse>((resolve) => {
    socket.emit("submit_move", data);
    socket.once("move_submitted", (response: SubmitMoveResponse) => {
      resolve(response);
    });
  });
};

export const createRoom = (
  socket: Socket<WebSocketEvents, WebSocketEvents>,
  friendsOnly: boolean = false,
) => {
  return new Promise<{ success: boolean; message: string; roomId: string }>(
    (resolve) => {
      socket.emit("create_room", friendsOnly);
      socket.once("room_created", (response) => {
        resolve(response);
      });
    },
  );
};

export const joinMatchmaking = (
  socket: Socket<WebSocketEvents, WebSocketEvents>,
  data: JoinMatchmakingRequest,
) => {
  return new Promise<JoinMatchmakingResponse>((resolve) => {
    socket.emit("join_matchmaking", data);
    socket.once("matchmaking_result", (response: JoinMatchmakingResponse) => {
      resolve(response);
    });
  });
};

export const leaveRoom = (
  socket: Socket<WebSocketEvents, WebSocketEvents>,
  data: LeaveRoomRequest,
) => {
  socket.emit("leave_room", data);
};

export const createCpuGame = (
  socket: Socket<WebSocketEvents, WebSocketEvents>,
  data: CreateCpuGameRequest,
) => {
  return new Promise<CreateCpuGameResponse>((resolve, reject) => {
    const onCreated = (response: CreateCpuGameResponse) => {
      clearTimeout(timeout);
      resolve(response);
    };

    const timeout = setTimeout(() => {
      socket.off("cpu_game_created", onCreated);
      reject(new Error("create_cpu_game timed out"));
    }, 15000);

    socket.once("cpu_game_created", onCreated);
    socket.emit("create_cpu_game", data);
  });
};

export const createSoloRun = (
  socket: Socket<WebSocketEvents, WebSocketEvents>,
  data: CreateSoloRunRequest,
) => {
  return new Promise<CreateSoloRunResponse>((resolve, reject) => {
    const onCreated = (response: CreateSoloRunResponse) => {
      clearTimeout(timeout);
      resolve(response);
    };

    const timeout = setTimeout(() => {
      socket.off("solo_run_created", onCreated);
      reject(new Error("create_solo_run timed out"));
    }, 15000);

    socket.once("solo_run_created", onCreated);
    socket.emit("create_solo_run", data);
  });
};

export const resumeSoloRun = (
  socket: Socket<WebSocketEvents, WebSocketEvents>,
  data: ResumeSoloRunRequest,
) => {
  return new Promise<ResumeSoloRunResponse>((resolve, reject) => {
    const onResumed = (response: ResumeSoloRunResponse) => {
      clearTimeout(timeout);
      resolve(response);
    };

    const timeout = setTimeout(() => {
      socket.off("solo_run_resumed", onResumed);
      reject(new Error("resume_solo_run timed out"));
    }, 10000);

    socket.once("solo_run_resumed", onResumed);
    socket.emit("resume_solo_run", data);
  });
};

export const submitSoloMove = (
  socket: Socket<WebSocketEvents, WebSocketEvents>,
  data: SubmitSoloMoveRequest,
) => {
  return new Promise<SubmitSoloMoveResponse>((resolve) => {
    socket.emit("submit_solo_move", data);
    socket.once("solo_move_result", (response: SubmitSoloMoveResponse) => {
      resolve(response);
    });
  });
};

export const endSoloRun = (
  socket: Socket<WebSocketEvents, WebSocketEvents>,
  data: EndSoloRunRequest,
) => {
  return new Promise<EndSoloRunResponse>((resolve, reject) => {
    const onEnded = (response: EndSoloRunResponse) => {
      clearTimeout(timeout);
      resolve(response);
    };

    const timeout = setTimeout(() => {
      socket.off("solo_run_ended", onEnded);
      reject(new Error("end_solo_run timed out"));
    }, 10000);

    socket.once("solo_run_ended", onEnded);
    socket.emit("end_solo_run", data);
  });
};
