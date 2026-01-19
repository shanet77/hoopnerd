"use client";

import { useEffect, useState, ChangeEvent, FormEvent } from "react";
import { Button } from "@repo/ui/button";
import { SocketProvider, useSocket, joinRoom, submitMove, createRoom, leaveRoom } from './lib/socket';
import { Player, GameRoomState, JoinRoomRequest, SubmitMoveRequest } from '@repo/types';
import ClientOnly from '../components/ClientOnly';

// Wrap the main component with SocketProvider
export default function Web() {
  return (
    <ClientOnly>
      <SocketProviderWrapper />
    </ClientOnly>
  );
}

function SocketProviderWrapper() {
  return (
    <SocketProvider>
      <GamePage />
    </SocketProvider>
  );
}

function GamePage() {
  const { socket, isConnected: socketConnected } = useSocket();
  const [roomId, setRoomId] = useState<string>('');
  const [playerName, setPlayerName] = useState<string>('');
  const [currentPlayer, setCurrentPlayer] = useState<Player | null>(null);
  const [connectedPlayer, setConnectedPlayer] = useState<Player | null>(null);
  const [roomState, setRoomState] = useState<GameRoomState | null>(null);
  const [searchResults, setSearchResults] = useState<Player[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [gameMessage, setGameMessage] = useState<string>('');
  const [isConnected, setIsConnected] = useState(false);

  // Track socket connection status
  useEffect(() => {
    if (socket) {
      setIsConnected(socketConnected);

      const handleConnect = () => setIsConnected(true);
      const handleDisconnect = () => setIsConnected(false);

      socket.on('connect', handleConnect);
      socket.on('disconnect', handleDisconnect);

      // Listen for room updates
      socket.on('room_updated', (state: GameRoomState) => {
        setRoomState(state);
        setGameMessage('Room updated');
      });

      // Listen for move submissions
      socket.on('move_submitted', (data) => {
        if (data.success) {
          setGameMessage(data.message);
        } else {
          setGameMessage(`Move rejected: ${data.message}`);
        }
      });

      // Listen for player connections
      socket.on('player_connected', (player: Player) => {
        setGameMessage(`${player.name} joined the game`);
      });

      // Listen for player disconnections
      socket.on('player_disconnected', (playerName: string) => {
        setGameMessage(`${playerName} left the game`);
      });

      // Listen for game errors
      socket.on('game_error', (error: string) => {
        setGameMessage(`Error: ${error}`);
      });

      return () => {
        socket.off('connect', handleConnect);
        socket.off('disconnect', handleDisconnect);
        socket.off('room_updated');
        socket.off('move_submitted');
        socket.off('player_connected');
        socket.off('player_disconnected');
        socket.off('game_error');
      };
    }
  }, [socket, socketConnected]);

  // If socket is not initialized yet, don't render the game UI
  if (!socket) {
    return (
      <div className="container mx-auto p-4 max-w-4xl">
        <h1 className="text-3xl font-bold mb-6">HoopNerd - Basketball Trivia Game</h1>
        <div className="text-center py-10">
          <p>Connecting to the game server...</p>
        </div>
      </div>
    );
  }

  // Search for players
  const searchPlayers = async (query: string) => {
    if (query.trim() === '') {
      setSearchResults([]);
      return;
    }

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_HOST || 'http://localhost:3001'}/api/players/search?q=${encodeURIComponent(query)}`);
      const players: Player[] = await response.json();
      setSearchResults(players);
    } catch (error) {
      console.error('Error searching players:', error);
      setSearchResults([]);
    }
  };

  // Handle search input changes
  const handleSearchChange = (e: ChangeEvent<HTMLInputElement>) => {
    const query = e.target.value;
    setSearchQuery(query);

    if (query.length >= 2) {
      searchPlayers(query);
    } else {
      setSearchResults([]);
    }
  };

  // Join a room
  const handleJoinRoom = async (e: FormEvent) => {
    e.preventDefault();

    if (!roomId || !playerName || !socket) {
      setGameMessage('Please enter both room ID and player name, and wait for socket connection');
      return;
    }

    try {
      const requestData: JoinRoomRequest = { roomId, playerName };
      const response = await joinRoom(socket, requestData);

      if (response.success) {
        setRoomState(response.roomState || null);
        setGameMessage(response.message);
      } else {
        setGameMessage(`Failed to join room: ${response.message}`);
      }
    } catch (error) {
      console.error('Error joining room:', error);
      setGameMessage('Error joining room');
    }
  };

  // Submit a move
  const handleSubmitMove = async (e: FormEvent) => {
    e.preventDefault();

    if (!roomState || !currentPlayer || !connectedPlayer || !socket) {
      setGameMessage('Please select both players for the move and wait for socket connection');
      return;
    }

    const moveData: SubmitMoveRequest = {
      roomId: roomState.roomId,
      player: currentPlayer,
      connectedPlayer: connectedPlayer
    };

    try {
      const response = await submitMove(socket, moveData);

      if (response.success) {
        setGameMessage(response.message);
        // Clear the selected players after a successful move
        setCurrentPlayer(null);
        setConnectedPlayer(null);
        setSearchQuery('');
        setSearchResults([]);
      } else {
        setGameMessage(`Move rejected: ${response.message}`);
      }
    } catch (error) {
      console.error('Error submitting move:', error);
      setGameMessage('Error submitting move');
    }
  };

  // Leave room
  const handleLeaveRoom = () => {
    if (roomState && socket) {
      leaveRoom(socket, roomState.roomId);
      setRoomState(null);
      setGameMessage('Left the room');
    } else if (!socket) {
      setGameMessage('Please wait for socket connection');
    }
  };

  return (
    <div className="container mx-auto p-4 max-w-4xl">
      <h1 className="text-3xl font-bold mb-6">HoopNerd - Basketball Trivia Game</h1>

      <div className="mb-6 p-4 bg-gray-100 rounded-lg">
        <p>Status: <span className={isConnected ? 'text-green-600' : 'text-red-600'}>
          {isConnected ? 'Connected' : 'Disconnected'}
        </span></p>
        {gameMessage && <p className="mt-2 text-blue-600">{gameMessage}</p>}
      </div>

      {/* Room Actions Section */}
      <div className="mb-8 p-6 border rounded-lg">
        <h2 className="text-xl font-semibold mb-4">Game Room</h2>

        {/* Create Room */}
        <div className="mb-6">
          <h3 className="text-lg font-medium mb-3">Create New Room</h3>
          <Button
            onClick={async () => {
              if (!socket) {
                setGameMessage('Please wait for socket connection');
                return;
              }

              try {
                const response = await createRoom(socket);
                if (response.success) {
                  setRoomId(response.roomId); // Pre-fill the room ID field
                  setGameMessage(response.message);
                } else {
                  setGameMessage(`Failed to create room: ${response.message}`);
                }
              } catch (error) {
                console.error('Error creating room:', error);
                setGameMessage('Error creating room');
              }
            }}
          >
            Create New Room
          </Button>
        </div>

        {/* Join Room */}
        <div className="mt-6">
          <h3 className="text-lg font-medium mb-3">Join Existing Room</h3>
          <form onSubmit={handleJoinRoom} className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <label htmlFor="roomId" className="block mb-1">Room ID</label>
              <input
                type="text"
                id="roomId"
                value={roomId}
                onChange={(e) => setRoomId(e.target.value)}
                placeholder="Enter room ID"
                className="w-full p-2 border rounded"
              />
            </div>
            <div className="flex-1">
              <label htmlFor="playerName" className="block mb-1">Your Name</label>
              <input
                type="text"
                id="playerName"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                placeholder="Enter your name"
                className="w-full p-2 border rounded"
              />
            </div>
            <div className="self-end">
              <Button type="submit">Join Room</Button>
            </div>
          </form>
        </div>
      </div>

      {/* Game Controls - Only show if in a room */}
      {roomState && (
        <div className="mb-8 p-6 border rounded-lg">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold">Room: {roomState.roomId}</h2>
            <button
              onClick={handleLeaveRoom}
              className="bg-red-500 hover:bg-red-700 text-white py-2 px-4 rounded"
            >
              Leave Room
            </button>
          </div>

          {/* Current Players in Room */}
          <div className="mb-6">
            <h3 className="font-medium mb-2">Players in Room:</h3>
            <div className="flex flex-wrap gap-2">
              {roomState.players.map((player, index) => (
                <div key={index} className="bg-blue-100 px-3 py-1 rounded-full text-sm">
                  {player.name}
                </div>
              ))}
              {roomState.players.length === 0 && <p>No players in the room yet</p>}
            </div>
          </div>

          {/* Move Submission */}
          <div className="mb-6">
            <h3 className="font-medium mb-2">Submit a Move</h3>
            <p>Select two players who played together on the same team in the same season</p>

            <form onSubmit={handleSubmitMove} className="mt-4 space-y-4">
              {/* Current Player Selection */}
              <div>
                <label className="block mb-1">Select Current Player</label>
                <input
                  type="text"
                  value={currentPlayer?.name || ''}
                  readOnly
                  placeholder="Click on a player from search results"
                  className="w-full p-2 border rounded bg-gray-100"
                />
              </div>

              {/* Connected Player Selection */}
              <div>
                <label className="block mb-1">Select Connected Player</label>
                <input
                  type="text"
                  value={connectedPlayer?.name || ''}
                  readOnly
                  placeholder="Click on a player from search results"
                  className="w-full p-2 border rounded bg-gray-100"
                />
              </div>

              {/* Player Search */}
              <div>
                <label className="block mb-1">Search Players</label>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={handleSearchChange}
                  placeholder="Start typing a player name..."
                  className="w-full p-2 border rounded"
                />

                {searchResults.length > 0 && (
                  <div className="mt-2 border rounded max-h-60 overflow-y-auto">
                    {searchResults.map((player) => (
                      <div
                        key={player.id}
                        className="p-2 border-b cursor-pointer hover:bg-gray-100"
                        onClick={() => {
                          // If no current player selected, set as current player
                          if (!currentPlayer) {
                            setCurrentPlayer(player);
                          }
                          // If current player is selected but no connected player, set as connected player
                          else if (currentPlayer && !connectedPlayer) {
                            setConnectedPlayer(player);
                          }
                          // If both are selected, reset and set as current player
                          else {
                            setCurrentPlayer(player);
                            setConnectedPlayer(null);
                          }

                          // Clear search
                          setSearchQuery('');
                          setSearchResults([]);
                        }}
                      >
                        {player.name} ({player.position})
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <Button type="submit" disabled={!currentPlayer || !connectedPlayer}>
                Submit Move
              </Button>
            </form>
          </div>

          {/* Move History */}
          <div>
            <h3 className="font-medium mb-2">Move History</h3>
            {roomState.moves.length > 0 ? (
              <ul className="border rounded divide-y">
                {roomState.moves.map((move, index) => (
                  <li key={index} className="p-2">
                    <span className="font-medium">{move.playerName}</span> ({move.position}) connected
                  </li>
                ))}
              </ul>
            ) : (
              <p>No moves yet</p>
            )}
          </div>
        </div>
      )}

      {/* Instructions */}
      {!roomState && (
        <div className="p-6 border rounded-lg bg-yellow-50">
          <h2 className="text-xl font-semibold mb-2">How to Play</h2>
          <ol className="list-decimal pl-5 space-y-2">
            <li>Create or join a game room using a room ID</li>
            <li>Search for NBA players and connect two players who played together on the same team in the same season</li>
            <li>The server will validate your connection</li>
            <li>Try to create the longest chain of connected players!</li>
          </ol>
        </div>
      )}
    </div>
  );
}
