import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { gameManager } from "./gameManager";
import type { GameMessage } from "@shared/schema";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Create WebSocket server
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  wss.on('connection', (ws: WebSocket) => {
    let currentPlayerId: string | null = null;
    let currentGameId: string | null = null;

    ws.on('message', (data: Buffer) => {
      try {
        const message: GameMessage = JSON.parse(data.toString());

        switch (message.type) {
          case 'join': {
            if (message.payload.action === 'create') {
              const result = gameManager.createGame(ws, message.payload.maxWalls || 8, message.payload.gameMode || 'pvp');
              currentPlayerId = result.playerId;
              currentGameId = result.gameId;

              const room = gameManager.getRoom(result.gameId);
              if (room) {
                ws.send(JSON.stringify({
                  type: 'state',
                  payload: {
                    state: room.state,
                    playerId: result.playerId,
                    color: result.color,
                  },
                }));
              }
            } else if (message.payload.action === 'join') {
              const result = gameManager.joinGame(ws, message.payload.gameId);
              if (result) {
                currentPlayerId = result.playerId;
                currentGameId = message.payload.gameId;

                const room = gameManager.getRoom(message.payload.gameId);
                if (room) {
                  // Send state to joining player
                  ws.send(JSON.stringify({
                    type: 'state',
                    payload: {
                      state: room.state,
                      playerId: result.playerId,
                      color: result.color,
                    },
                  }));

                  // Notify all players
                  broadcastToRoom(room, {
                    type: 'player_joined',
                    payload: { state: room.state },
                  });
                }
              } else {
                ws.send(JSON.stringify({
                  type: 'error',
                  payload: { message: 'Game not found or full' },
                }));
              }
            }
            break;
          }

          case 'reconnect': {
            if (message.playerId && message.payload.gameId) {
              const success = gameManager.reconnectPlayer(ws, message.playerId, message.payload.gameId);
              if (success) {
                currentPlayerId = message.playerId;
                currentGameId = message.payload.gameId;

                const room = gameManager.getRoom(message.payload.gameId);
                if (room) {
                  const player = room.players.get(message.playerId);
                  ws.send(JSON.stringify({
                    type: 'state',
                    payload: {
                      state: room.state,
                      playerId: message.playerId,
                      color: player?.color,
                    },
                  }));
                }
              } else {
                ws.send(JSON.stringify({
                  type: 'error',
                  payload: { message: 'Failed to reconnect' },
                }));
              }
            }
            break;
          }

          case 'setup_wall': {
            if (message.playerId || currentPlayerId) {
              const state = gameManager.handleSetupWall(
                message.playerId || currentPlayerId!,
                message.payload.position
              );
              if (state && currentGameId) {
                const room = gameManager.getRoom(currentGameId);
                if (room) {
                  broadcastToRoom(room, {
                    type: 'state',
                    payload: { state },
                  });
                }
              }
            }
            break;
          }

          case 'ready': {
            if (message.playerId || currentPlayerId) {
              const state = gameManager.handleReady(message.playerId || currentPlayerId!);
              if (state && currentGameId) {
                const room = gameManager.getRoom(currentGameId);
                if (room) {
                  broadcastToRoom(room, {
                    type: 'state',
                    payload: { state },
                  });
                  
                  // Check if AI should move after game starts
                  if (gameManager.isAITurn(currentGameId)) {
                    setTimeout(() => {
                      const aiResult = gameManager.makeAIMove(currentGameId!);
                      if (aiResult) {
                        const aiRoom = gameManager.getRoom(currentGameId!);
                        if (aiRoom) {
                          broadcastToRoom(aiRoom, {
                            type: 'state',
                            payload: { state: aiResult.state },
                          });
                        }
                      }
                    }, 500);
                  }
                }
              }
            }
            break;
          }

          case 'move': {
            if (message.playerId || currentPlayerId) {
              const result = gameManager.handleMove(
                message.playerId || currentPlayerId!,
                message.payload.from,
                message.payload.to,
                message.payload.resign
              );
              if (result && currentGameId) {
                const room = gameManager.getRoom(currentGameId);
                if (room) {
                  broadcastToRoom(room, {
                    type: 'state',
                    payload: { state: result.state },
                  });
                  
                  // Check if AI should move after human move
                  if (gameManager.isAITurn(currentGameId)) {
                    setTimeout(() => {
                      const aiResult = gameManager.makeAIMove(currentGameId!);
                      if (aiResult) {
                        const aiRoom = gameManager.getRoom(currentGameId!);
                        if (aiRoom) {
                          broadcastToRoom(aiRoom, {
                            type: 'state',
                            payload: { state: aiResult.state },
                          });
                        }
                      }
                    }, 800);
                  }
                }
              }
            }
            break;
          }

          case 'arrow_attack': {
            if (message.playerId || currentPlayerId) {
              const result = gameManager.handleArrowAttack(
                message.playerId || currentPlayerId!,
                message.payload.from,
                message.payload.to
              );
              if (result && currentGameId) {
                const room = gameManager.getRoom(currentGameId);
                if (room) {
                  broadcastToRoom(room, {
                    type: 'state',
                    payload: { state: result.state },
                  });
                  
                  // Check if AI should move after human arrow attack
                  if (gameManager.isAITurn(currentGameId)) {
                    setTimeout(() => {
                      const aiResult = gameManager.makeAIMove(currentGameId!);
                      if (aiResult) {
                        const aiRoom = gameManager.getRoom(currentGameId!);
                        if (aiRoom) {
                          broadcastToRoom(aiRoom, {
                            type: 'state',
                            payload: { state: aiResult.state },
                          });
                        }
                      }
                    }, 800);
                  }
                }
              }
            }
            break;
          }
        }
      } catch (error) {
        console.error('WebSocket message error:', error);
        ws.send(JSON.stringify({
          type: 'error',
          payload: { message: 'Invalid message format' },
        }));
      }
    });

    ws.on('close', () => {
      if (currentPlayerId && currentGameId) {
        const room = gameManager.getRoom(currentGameId);
        if (room) {
          // Notify other players
          broadcastToRoom(room, {
            type: 'player_left',
            payload: { state: room.state, playerId: currentPlayerId },
          }, currentPlayerId);
        }
      }
    });

    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
    });
  });

  function broadcastToRoom(room: { players: Map<string, { ws: WebSocket; color: 'white' | 'black' }> }, message: GameMessage, excludePlayerId?: string) {
    room.players.forEach((player, playerId) => {
      if (playerId !== excludePlayerId && player.ws.readyState === WebSocket.OPEN) {
        // Always include player's color in state messages to prevent color loss
        const personalizedMessage = message.type === 'state' || message.type === 'player_joined' || message.type === 'player_left'
          ? {
              ...message,
              payload: {
                ...message.payload,
                playerId,
                color: player.color,
              },
            }
          : message;
        player.ws.send(JSON.stringify(personalizedMessage));
      }
    });
  }

  return httpServer;
}
