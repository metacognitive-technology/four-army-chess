import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { gameManager } from "./gameManager";
import type { GameMessage } from "@shared/schema";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // REST endpoints for saved games
  app.get('/api/games', (_req, res) => {
    try {
      const games = gameManager.listSavedGames();
      res.json(games);
    } catch (error) {
      console.error('Failed to list games:', error);
      res.status(500).json({ error: 'Failed to list games' });
    }
  });

  app.get('/api/games/:gameId', (req, res) => {
    try {
      const state = gameManager.loadGameIntoMemory(req.params.gameId);
      if (state) {
        res.json(state);
      } else {
        res.status(404).json({ error: 'Game not found' });
      }
    } catch (error) {
      console.error('Failed to load game:', error);
      res.status(500).json({ error: 'Failed to load game' });
    }
  });

  // Track all connected clients for broadcasting
  const allClients = new Set<WebSocket>();
  
  const broadcastGamesUpdated = () => {
    const message = JSON.stringify({ type: 'games_updated', payload: {} });
    allClients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  };

  app.delete('/api/games/:gameId', (req, res) => {
    try {
      const playerId = req.query.playerId as string | undefined;
      if (!playerId) {
        res.status(401).json({ error: 'Player ID required for authorization' });
        return;
      }
      const success = gameManager.deleteGame(req.params.gameId, playerId);
      if (success) {
        broadcastGamesUpdated();
        res.json({ success: true });
      } else {
        res.status(404).json({ error: 'Game not found or not authorized' });
      }
    } catch (error) {
      console.error('Failed to delete game:', error);
      res.status(500).json({ error: 'Failed to delete game' });
    }
  });

  app.delete('/api/games', (_req, res) => {
    try {
      const deleted = gameManager.deleteAllGames();
      broadcastGamesUpdated();
      res.json({ success: true, deleted });
    } catch (error) {
      console.error('Failed to delete all games:', error);
      res.status(500).json({ error: 'Failed to delete all games' });
    }
  });

  // Create a computer vs computer game
  app.post('/api/games/cvc', (req, res) => {
    try {
      const maxWalls = req.body?.maxWalls ?? 8;
      const attackSettings = req.body?.attackSettings;
      const result = gameManager.createCvCGame(maxWalls, attackSettings);
      res.json({
        gameId: result.gameId,
        phase: result.state.phase,
      });
    } catch (error) {
      console.error('Failed to create CvC game:', error);
      res.status(500).json({ error: 'Failed to create CvC game' });
    }
  });

  // Create WebSocket server
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  wss.on('connection', (ws: WebSocket) => {
    allClients.add(ws);
    let currentPlayerId: string | null = null;
    let currentGameId: string | null = null;

    ws.on('message', (data: Buffer) => {
      try {
        const message: GameMessage = JSON.parse(data.toString());

        switch (message.type) {
          case 'join': {
            if (message.payload.action === 'create') {
              const result = gameManager.createGame(ws, message.payload.maxWalls ?? 8, message.payload.gameMode || 'pvp', message.payload.attackSettings, message.payload.budgetMode);
              currentPlayerId = result.playerId;
              currentGameId = result.gameId;

              const room = gameManager.getRoom(result.gameId);
              if (room) {
                ws.send(JSON.stringify({
                  type: 'state',
                  payload: {
                    state: filterStateForPlayer(room.state, result.color),
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
                  ws.send(JSON.stringify({
                    type: 'state',
                    payload: {
                      state: filterStateForPlayer(room.state, result.color),
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
                      state: filterStateForPlayer(room.state, player?.color || 'white'),
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

          case 'takeover': {
            if (message.payload.gameId && message.payload.color) {
              const result = gameManager.takeoverGame(
                ws,
                message.payload.gameId,
                message.payload.color
              );
              if (result) {
                currentPlayerId = result.playerId;
                currentGameId = message.payload.gameId;

                ws.send(JSON.stringify({
                  type: 'state',
                  payload: {
                    state: filterStateForPlayer(result.state, message.payload.color),
                    playerId: result.playerId,
                    color: message.payload.color,
                  },
                }));

                const room = gameManager.getRoom(message.payload.gameId);
                if (room) {
                  room.players.forEach((player, id) => {
                    if (id !== result.playerId) {
                      player.ws.send(JSON.stringify({
                        type: 'player_joined',
                        payload: { state: filterStateForPlayer(result.state, player.color) },
                      }));
                    }
                  });
                }
              } else {
                ws.send(JSON.stringify({
                  type: 'error',
                  payload: { message: 'Failed to take over game' },
                }));
              }
            }
            break;
          }

          case 'watch_cvc': {
            if (message.payload.gameId) {
              const result = gameManager.joinCvCAsObserver(ws, message.payload.gameId);
              if (result) {
                currentGameId = message.payload.gameId;
                ws.send(JSON.stringify({
                  type: 'state',
                  payload: {
                    state: result.state,
                    isObserver: true,
                  },
                }));
              } else {
                ws.send(JSON.stringify({
                  type: 'error',
                  payload: { message: 'Game not found' },
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
          
          case 'setup_random_walls': {
            if (message.playerId || currentPlayerId) {
              const state = gameManager.handleRandomWalls(
                message.playerId || currentPlayerId!
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
          
          case 'setup_maze_walls': {
            if (message.playerId || currentPlayerId) {
              const state = gameManager.handleMazeWalls(
                message.playerId || currentPlayerId!
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

          case 'setup_load_layout': {
            if (message.playerId || currentPlayerId) {
              const state = gameManager.handleLoadLayout(
                message.playerId || currentPlayerId!,
                message.payload.walls
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

          case 'budget_submit': {
            if (message.playerId || currentPlayerId) {
              const state = gameManager.handleBudgetSubmit(
                message.playerId || currentPlayerId!,
                message.payload
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

          case 'stop_cvc': {
            // Handle stopping a CvC game
            if (currentGameId) {
              const state = gameManager.stopCvCGame(currentGameId);
              if (state) {
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
          
          case 'pause_cvc': {
            // Handle pausing/resuming a CvC game
            if (currentGameId) {
              gameManager.pauseCvCGame(currentGameId, message.payload.paused);
            }
            break;
          }
          
          case 'offer_draw': {
            // Handle draw offer
            if (currentPlayerId && currentGameId) {
              const room = gameManager.getRoom(currentGameId);
              if (room) {
                // Send draw offer to opponent
                room.players.forEach((player, id) => {
                  if (id !== currentPlayerId) {
                    player.ws.send(JSON.stringify({
                      type: 'draw_offered',
                      payload: { offeredBy: currentPlayerId },
                    }));
                  }
                });
              }
            }
            break;
          }
          
          case 'respond_draw': {
            // Handle draw response
            if (currentPlayerId && currentGameId) {
              const room = gameManager.getRoom(currentGameId);
              if (room) {
                if (message.payload.accept) {
                  // Draw accepted - end the game
                  room.state.phase = 'finished';
                  room.state.winner = 'draw';
                  gameManager.saveGame(room.state);
                  broadcastToRoom(room, {
                    type: 'state',
                    payload: { state: room.state },
                  });
                } else {
                  // Draw declined - notify the opponent
                  room.players.forEach((player, id) => {
                    if (id !== currentPlayerId) {
                      player.ws.send(JSON.stringify({
                        type: 'draw_response',
                        payload: { accepted: false },
                      }));
                    }
                  });
                }
              }
            }
            break;
          }
          
          case 'handoff': {
            // Hand off control to AI
            if (currentPlayerId && currentGameId) {
              const state = gameManager.handoffToAI(currentPlayerId);
              if (state) {
                const room = gameManager.getRoom(currentGameId);
                if (room) {
                  broadcastToRoom(room, {
                    type: 'state',
                    payload: { state },
                  });
                  
                  // Trigger AI move if it's now AI's turn
                  if (gameManager.isAITurn(currentGameId)) {
                    setTimeout(() => {
                      const result = gameManager.makeAIMove(currentGameId);
                      if (result) {
                        const updatedRoom = gameManager.getRoom(currentGameId);
                        if (updatedRoom) {
                          broadcastToRoom(updatedRoom, {
                            type: 'state',
                            payload: { state: result.state, diceRoll: result.diceRoll },
                          });
                          
                          // Continue AI moves if needed
                          const checkAndMakeAIMove = () => {
                            if (gameManager.isAITurn(currentGameId)) {
                              setTimeout(() => {
                                const aiResult = gameManager.makeAIMove(currentGameId);
                                if (aiResult) {
                                  const rm = gameManager.getRoom(currentGameId);
                                  if (rm) {
                                    broadcastToRoom(rm, {
                                      type: 'state',
                                      payload: { state: aiResult.state, diceRoll: aiResult.diceRoll },
                                    });
                                    checkAndMakeAIMove();
                                  }
                                }
                              }, 800);
                            }
                          };
                          checkAndMakeAIMove();
                        }
                      }
                    }, 500);
                  }
                }
              }
            }
            break;
          }
          
          case 'take_control': {
            // Take back control from AI
            if (currentPlayerId && currentGameId) {
              const state = gameManager.takeControl(currentPlayerId);
              if (state) {
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

          case 'move': {
            if (message.playerId || currentPlayerId) {
              const result = gameManager.handleMove(
                message.playerId || currentPlayerId!,
                message.payload.from,
                message.payload.to,
                message.payload.resign,
                message.payload.promotionPiece
              );
              if (result && currentGameId) {
                const room = gameManager.getRoom(currentGameId);
                if (room) {
                  // Check if promotion is needed
                  if (result.needsPromotion) {
                    ws.send(JSON.stringify({
                      type: 'needsPromotion',
                      payload: { from: message.payload.from, to: message.payload.to },
                    }));
                  } else {
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
          
          case 'axe_attack': {
            if (message.playerId || currentPlayerId) {
              const result = gameManager.handleAxeAttack(
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
                  
                  // Check if AI should move after human axe attack
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
          
          case 'bomb_attack': {
            if (message.playerId || currentPlayerId) {
              const result = gameManager.handleBombAttack(
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
                  
                  // Check if AI should move after human bomb attack
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
          
          case 'wall_attack': {
            if (message.playerId || currentPlayerId) {
              const result = gameManager.handleWallAttack(
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
                  
                  // Check if AI should move after human wall attack
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
      allClients.delete(ws);
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

  function filterStateForPlayer(state: any, playerColor: 'white' | 'black'): any {
    if (state?.budgetMode !== 'individual') return state;
    const filtered = { ...state };
    if (playerColor === 'white') {
      filtered.blackAttackSettings = filtered.blackAttackSettings ? { hidden: true } : undefined;
      if (filtered.whiteAttackSettings && !filtered.whiteAttackSettings.hidden) {
        filtered.attackSettings = { ...filtered.attackSettings, ...filtered.whiteAttackSettings };
      }
    } else {
      filtered.whiteAttackSettings = filtered.whiteAttackSettings ? { hidden: true } : undefined;
      if (filtered.blackAttackSettings && !filtered.blackAttackSettings.hidden) {
        filtered.attackSettings = { ...filtered.attackSettings, ...filtered.blackAttackSettings };
      }
    }
    return filtered;
  }

  function broadcastToRoom(room: { players: Map<string, { ws: WebSocket; color: 'white' | 'black' }> }, message: GameMessage, excludePlayerId?: string) {
    room.players.forEach((player, playerId) => {
      if (playerId !== excludePlayerId && player.ws.readyState === WebSocket.OPEN) {
        const personalizedMessage = message.type === 'state' || message.type === 'player_joined' || message.type === 'player_left'
          ? {
              ...message,
              payload: {
                ...message.payload,
                state: message.payload.state ? filterStateForPlayer(message.payload.state, player.color) : message.payload.state,
                playerId,
                color: player.color,
              },
            }
          : message;
        player.ws.send(JSON.stringify(personalizedMessage));
      }
    });
  }

  // Set up CvC state update callback
  gameManager.setCvCStateUpdateCallback((gameId, state) => {
    const room = gameManager.getRoom(gameId);
    if (room) {
      broadcastToRoom(room, {
        type: 'state',
        payload: { state, isObserver: true },
      });
    }
  });

  return httpServer;
}
