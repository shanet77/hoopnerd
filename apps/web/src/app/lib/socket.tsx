'use client';

import { io, Socket } from 'socket.io-client';
import { createContext, useContext, useEffect, useState } from 'react';
import { 
  WebSocketEvents, 
  JoinRoomRequest, 
  SubmitMoveRequest, 
  JoinRoomResponse,
  SubmitMoveResponse,
  JoinMatchmakingRequest,
  JoinMatchmakingResponse,
  LeaveRoomRequest
} from '@repo/types';

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
    throw new Error('useSocket must be used within a SocketProvider');
  }
  return context;
};

// Provider component to wrap the app
export const SocketProvider = ({ children }: { children: React.ReactNode }) => {
  const [socket, setSocket] = useState<Socket<WebSocketEvents, WebSocketEvents> | null>(null);
  const [isConnected, setIsConnected] = useState<boolean>(false);

  useEffect(() => {
    // Only run on the client side
    if (typeof window !== 'undefined') {
      // Connect to the socket server
      const newSocket = io(process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001', {
        transports: ['websocket'],
      });

      newSocket.on('connect', () => {
        console.log('Connected to server:', newSocket.id);
        setIsConnected(true);
      });

      newSocket.on('disconnect', () => {
        console.log('Disconnected from server');
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
export const joinRoom = (socket: Socket<WebSocketEvents, WebSocketEvents>, data: JoinRoomRequest) => {
  return new Promise<JoinRoomResponse>((resolve, reject) => {
    const onJoined = (response: JoinRoomResponse) => {
      clearTimeout(timeout);
      resolve(response);
    };

    const timeout = setTimeout(() => {
      socket.off('room_joined', onJoined);
      reject(new Error('join_room timed out'));
    }, 8000);

    socket.once('room_joined', onJoined);
    socket.emit('join_room', data);
  });
};

export const submitMove = (socket: Socket<WebSocketEvents, WebSocketEvents>, data: SubmitMoveRequest) => {
  return new Promise<SubmitMoveResponse>((resolve) => {
    socket.emit('submit_move', data);
    socket.once('move_submitted', (response: SubmitMoveResponse) => {
      resolve(response);
    });
  });
};

export const createRoom = (socket: Socket<WebSocketEvents, WebSocketEvents>, friendsOnly: boolean = false) => {
  return new Promise<{ success: boolean; message: string; roomId: string }>((resolve) => {
    socket.emit('create_room', friendsOnly);
    socket.once('room_created', (response) => {
      resolve(response);
    });
  });
};

export const joinMatchmaking = (socket: Socket<WebSocketEvents, WebSocketEvents>, data: JoinMatchmakingRequest) => {
  return new Promise<JoinMatchmakingResponse>((resolve) => {
    socket.emit('join_matchmaking', data);
    socket.once('matchmaking_result', (response: JoinMatchmakingResponse) => {
      resolve(response);
    });
  });
};

export const leaveRoom = (socket: Socket<WebSocketEvents, WebSocketEvents>, data: LeaveRoomRequest) => {
  socket.emit('leave_room', data);
};
