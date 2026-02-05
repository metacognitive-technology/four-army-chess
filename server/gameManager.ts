import { randomUUID } from "crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, unlinkSync, statSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import type { GameState, Board, Square, Piece, Position, PlayerColor, Move, PieceType, GameMessage, GameMode, AttackSettings } from "@shared/schema";
import type { WebSocket } from "ws";

const BOARD_SIZE = 12;
const MAX_MOVE_DISTANCE = 8;
const AI_PLAYER_ID = 'ai-player';

// A* pathfinding for AI to navigate around walls
// Uses Chebyshev distance (8-directional with uniform cost)
interface AStarNode {
  row: number;
  col: number;
  g: number; // Cost from start
  h: number; // Heuristic (Chebyshev distance to goal)
  f: number; // Total cost (g + h)
}

// Cache for A* path distances to reduce redundant calculations per AI turn
let aStarCache: Map<string, number> = new Map();
let aStarCacheBoard: string = '';

function clearAStarCache(): void {
  aStarCache.clear();
  aStarCacheBoard = '';
}

function getBoardHash(board: Board): string {
  // Simple hash based on wall positions (pieces move, so we only cache per wall config)
  let hash = '';
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (board[r][c].isWall) hash += `${r},${c};`;
    }
  }
  return hash;
}

function aStarPathfind(board: Board, start: Position, goal: Position): number {
  // Returns the path length or Infinity if no path exists
  // Uses Chebyshev distance heuristic for 8-directional movement
  
  const cacheKey = `${start.row},${start.col}-${goal.row},${goal.col}`;
  const boardHash = getBoardHash(board);
  
  // Clear cache if board walls have changed
  if (boardHash !== aStarCacheBoard) {
    aStarCache.clear();
    aStarCacheBoard = boardHash;
  }
  
  // Check cache first
  if (aStarCache.has(cacheKey)) {
    return aStarCache.get(cacheKey)!;
  }
  
  const openSet: AStarNode[] = [];
  const closedSet = new Set<string>();
  const gScores = new Map<string, number>();
  
  // Chebyshev distance (max of absolute differences) - admissible for 8-direction
  const heuristic = (pos: Position): number => {
    return Math.max(Math.abs(pos.row - goal.row), Math.abs(pos.col - goal.col));
  };
  
  const posKey = (row: number, col: number): string => `${row},${col}`;
  
  const startNode: AStarNode = {
    row: start.row,
    col: start.col,
    g: 0,
    h: heuristic(start),
    f: heuristic(start),
  };
  
  openSet.push(startNode);
  gScores.set(posKey(start.row, start.col), 0);
  
  // 8-directional movement (king-like for general pathfinding)
  const directions = [
    [-1, -1], [-1, 0], [-1, 1],
    [0, -1],          [0, 1],
    [1, -1], [1, 0], [1, 1],
  ];
  
  let iterations = 0;
  const maxIterations = BOARD_SIZE * BOARD_SIZE * 2;
  
  while (openSet.length > 0 && iterations < maxIterations) {
    iterations++;
    
    // Find node with lowest f score (use priority extraction)
    let lowestIdx = 0;
    for (let i = 1; i < openSet.length; i++) {
      if (openSet[i].f < openSet[lowestIdx].f) {
        lowestIdx = i;
      }
    }
    const current = openSet.splice(lowestIdx, 1)[0];
    
    // Reached goal
    if (current.row === goal.row && current.col === goal.col) {
      aStarCache.set(cacheKey, current.g);
      return current.g;
    }
    
    const currentKey = posKey(current.row, current.col);
    closedSet.add(currentKey);
    
    // Explore neighbors
    for (const [dr, dc] of directions) {
      const newRow = current.row + dr;
      const newCol = current.col + dc;
      
      // Check bounds
      if (newRow < 0 || newRow >= BOARD_SIZE || newCol < 0 || newCol >= BOARD_SIZE) {
        continue;
      }
      
      const neighborKey = posKey(newRow, newCol);
      
      // Skip if already in closed set
      if (closedSet.has(neighborKey)) {
        continue;
      }
      
      // Skip walls
      const square = board[newRow][newCol];
      if (square.isWall) {
        continue;
      }
      
      // Allow goal position even if occupied (for approaching enemy)
      const isGoal = newRow === goal.row && newCol === goal.col;
      if (square.piece && !isGoal) {
        continue;
      }
      
      const tentativeG = current.g + 1;
      const existingG = gScores.get(neighborKey);
      
      if (existingG !== undefined && tentativeG >= existingG) {
        continue;
      }
      
      gScores.set(neighborKey, tentativeG);
      
      const h = heuristic({ row: newRow, col: newCol });
      const newNode: AStarNode = {
        row: newRow,
        col: newCol,
        g: tentativeG,
        h,
        f: tentativeG + h,
      };
      
      // Remove if already in open set with worse score
      const existingIdx = openSet.findIndex(n => n.row === newRow && n.col === newCol);
      if (existingIdx !== -1) {
        openSet.splice(existingIdx, 1);
      }
      
      openSet.push(newNode);
    }
  }
  
  // No path found
  aStarCache.set(cacheKey, Infinity);
  return Infinity;
}

// Find the enemy king position
function findKingPosition(board: Board, color: PlayerColor): Position | null {
  for (let row = 0; row < BOARD_SIZE; row++) {
    for (let col = 0; col < BOARD_SIZE; col++) {
      const piece = board[row][col].piece;
      if (piece && piece.type === 'king' && piece.color === color) {
        return { row, col };
      }
    }
  }
  return null;
}

// Get the directory for saving game files - handle both ESM and CJS
// Use a function to safely get __dirname in both environments
function getCurrentDir(): string {
  try {
    // In CJS environment (production bundle), __dirname is available
    if (typeof __dirname !== 'undefined') {
      return __dirname;
    }
  } catch {
    // __dirname not defined in ESM
  }
  
  // ESM environment - compute from import.meta.url
  try {
    return dirname(fileURLToPath(import.meta.url));
  } catch {
    // Fallback to process.cwd() if all else fails
    return process.cwd();
  }
}

const GAMES_DIR = join(getCurrentDir(), 'data', 'games');

// Ensure games directory exists
if (!existsSync(GAMES_DIR)) {
  mkdirSync(GAMES_DIR, { recursive: true });
}

export interface SavedGameInfo {
  id: string;
  phase: GameState['phase'];
  currentTurn: PlayerColor;
  moveCount: number;
  whitePlayer: string | null;
  blackPlayer: string | null;
  winner: PlayerColor | 'draw' | null;
  updatedAt: string;
  gameMode?: GameMode;
}

interface Player {
  ws: WebSocket;
  id: string;
  color: PlayerColor;
}

interface GameRoom {
  state: GameState;
  players: Map<string, Player>;
  readyPlayers: Set<string>;
}

class GameManager {
  private games: Map<string, GameRoom> = new Map();
  private playerToGame: Map<string, string> = new Map();

  // File persistence methods
  private getGameFilePath(gameId: string): string {
    return join(GAMES_DIR, `${gameId}.json`);
  }

  saveGame(state: GameState): void {
    try {
      const filePath = this.getGameFilePath(state.id);
      const data = JSON.stringify(state, null, 2);
      writeFileSync(filePath, data, 'utf-8');
    } catch (error) {
      console.error(`Failed to save game ${state.id}:`, error);
    }
  }

  loadGame(gameId: string): GameState | null {
    try {
      const filePath = this.getGameFilePath(gameId);
      if (!existsSync(filePath)) return null;
      const data = readFileSync(filePath, 'utf-8');
      const state = JSON.parse(data) as GameState;
      // Add default attackSettings for old games that don't have them
      if (!state.attackSettings) {
        state.attackSettings = {
          pawnSuccessRoll: 1,
          bishopMinRoll: 0,
          knightMinRoll: 4,
        };
      }
      return state;
    } catch (error) {
      console.error(`Failed to load game ${gameId}:`, error);
      return null;
    }
  }

  listSavedGames(): SavedGameInfo[] {
    try {
      const files = readdirSync(GAMES_DIR).filter(f => f.endsWith('.json'));
      const games: SavedGameInfo[] = [];

      for (const file of files) {
        try {
          const filePath = join(GAMES_DIR, file);
          const stat = statSync(filePath);
          const data = readFileSync(filePath, 'utf-8');
          const state = JSON.parse(data) as GameState;
          
          games.push({
            id: state.id,
            phase: state.phase,
            currentTurn: state.currentTurn,
            moveCount: state.moveHistory.length,
            whitePlayer: state.players.white,
            blackPlayer: state.players.black,
            winner: state.winner,
            updatedAt: stat.mtime.toISOString(),
            gameMode: state.gameMode,
          });
        } catch (e) {
          // Skip invalid files
        }
      }

      // Sort by most recently updated
      return games.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    } catch (error) {
      console.error('Failed to list saved games:', error);
      return [];
    }
  }

  deleteGame(gameId: string, requestingPlayerId?: string): boolean {
    try {
      const filePath = this.getGameFilePath(gameId);
      if (!existsSync(filePath)) {
        return false;
      }
      
      // Load game to check ownership if playerId provided
      if (requestingPlayerId) {
        const state = this.loadGame(gameId);
        if (state) {
          const isOwner = state.players.white === requestingPlayerId || 
                          state.players.black === requestingPlayerId;
          if (!isOwner) {
            return false;
          }
        }
      }
      
      // Remove from memory if present
      this.games.delete(gameId);
      
      unlinkSync(filePath);
      return true;
    } catch (error) {
      console.error(`Failed to delete game ${gameId}:`, error);
      return false;
    }
  }

  deleteAllGames(): number {
    try {
      if (!existsSync(GAMES_DIR)) {
        return 0;
      }
      
      const files = readdirSync(GAMES_DIR);
      let deleted = 0;
      
      for (const file of files) {
        if (file.endsWith('.json')) {
          const gameId = file.replace('.json', '');
          try {
            // Remove from memory if present
            this.games.delete(gameId);
            // Delete file
            unlinkSync(this.getGameFilePath(gameId));
            deleted++;
          } catch (e) {
            // Continue with other files
          }
        }
      }
      
      return deleted;
    } catch (error) {
      console.error('Failed to delete all games:', error);
      return 0;
    }
  }

  // Load a saved game into memory for play
  loadGameIntoMemory(gameId: string): GameState | null {
    // First check if already in memory
    const existingRoom = this.games.get(gameId);
    if (existingRoom) {
      return existingRoom.state;
    }

    // Load from file
    const state = this.loadGame(gameId);
    if (!state) return null;

    // Create a room for it (players will connect via WebSocket)
    const room: GameRoom = {
      state,
      players: new Map(),
      readyPlayers: new Set(),
    };

    this.games.set(gameId, room);
    return state;
  }

  createGame(ws: WebSocket, maxWalls: number, gameMode: GameMode = 'pvp', attackSettings?: AttackSettings): { gameId: string; playerId: string; color: PlayerColor } {
    const gameId = randomUUID().slice(0, 8);
    const playerId = randomUUID();
    
    const isVsComputer = gameMode === 'pvc';
    
    const defaultAttackSettings: AttackSettings = {
      pawnSuccessRoll: 1,
      bishopMinRoll: 0,
      knightMinRoll: 4,
      bombSuccessRoll: 1,
    };
    
    const state: GameState = {
      id: gameId,
      board: this.createInitialBoard(),
      currentTurn: 'white',
      phase: isVsComputer ? (maxWalls > 0 ? 'setup' : 'playing') : 'waiting',
      gameMode,
      aiColor: isVsComputer ? 'black' : undefined,
      setupWallsRemaining: { white: maxWalls, black: maxWalls },
      maxWallsPerPlayer: maxWalls,
      moveHistory: [],
      capturedPieces: { white: [], black: [] },
      players: { white: playerId, black: isVsComputer ? AI_PLAYER_ID : null },
      winner: null,
      attackSettings: attackSettings || defaultAttackSettings,
    };
    
    const room: GameRoom = {
      state,
      players: new Map([[playerId, { ws, id: playerId, color: 'white' }]]),
      readyPlayers: new Set(),
    };
    
    // For vs computer, auto-ready the AI and place random walls
    if (isVsComputer) {
      room.readyPlayers.add(AI_PLAYER_ID);
      this.placeAIWalls(state, maxWalls);
    }
    
    this.games.set(gameId, room);
    this.playerToGame.set(playerId, gameId);
    
    // Save game to file
    this.saveGame(state);
    
    return { gameId, playerId, color: 'white' };
  }
  
  // Active CvC game intervals
  private cvcIntervals: Map<string, NodeJS.Timeout> = new Map();
  
  // Callback for broadcasting state updates
  private onCvCStateUpdate?: (gameId: string, state: GameState) => void;
  
  setCvCStateUpdateCallback(callback: (gameId: string, state: GameState) => void) {
    this.onCvCStateUpdate = callback;
  }

  // Create a computer vs computer game that plays visibly
  createCvCGame(maxWalls: number, attackSettings?: AttackSettings): { gameId: string; state: GameState } {
    const gameId = randomUUID().slice(0, 8);
    
    const defaultAttackSettings: AttackSettings = {
      pawnSuccessRoll: 1,
      bishopMinRoll: 0,
      knightMinRoll: 4,
      bombSuccessRoll: 1,
    };
    
    const state: GameState = {
      id: gameId,
      board: this.createInitialBoard(),
      currentTurn: 'white',
      phase: 'playing',
      gameMode: 'cvc',
      aiColor: undefined, // Both are AI, no single "AI" color
      setupWallsRemaining: { white: 0, black: 0 },
      maxWallsPerPlayer: maxWalls,
      moveHistory: [],
      capturedPieces: { white: [], black: [] },
      players: { white: AI_PLAYER_ID, black: AI_PLAYER_ID },
      winner: null,
      attackSettings: attackSettings || defaultAttackSettings,
    };
    
    // Place walls for both sides
    this.placeCvCWalls(state, maxWalls, 'white');
    this.placeCvCWalls(state, maxWalls, 'black');
    
    // Create game room
    const room: GameRoom = {
      state,
      players: new Map(),
      readyPlayers: new Set(),
    };
    
    this.games.set(gameId, room);
    this.saveGame(state);
    
    // Start the game with visible moves (500ms between moves)
    this.startCvCGameLoop(gameId);
    
    return { gameId, state };
  }
  
  private startCvCGameLoop(gameId: string) {
    const MAX_MOVES = 500;
    
    const interval = setInterval(() => {
      const room = this.games.get(gameId);
      if (!room || room.state.phase !== 'playing') {
        clearInterval(interval);
        this.cvcIntervals.delete(gameId);
        return;
      }
      
      // Check if a human has taken over (game mode changed)
      if (room.state.gameMode !== 'cvc') {
        clearInterval(interval);
        this.cvcIntervals.delete(gameId);
        return;
      }
      
      const state = room.state;
      const currentColor = state.currentTurn;
      const moveResult = this.makeCvCMove(state, currentColor);
      
      if (!moveResult) {
        // No valid moves - check for checkmate or stalemate
        const inCheck = this.isInCheck(state.board, currentColor);
        if (inCheck) {
          state.winner = currentColor === 'white' ? 'black' : 'white';
        } else {
          state.winner = 'draw';
        }
        state.phase = 'finished';
        this.saveGame(state);
        this.onCvCStateUpdate?.(gameId, state);
        clearInterval(interval);
        this.cvcIntervals.delete(gameId);
        return;
      }
      
      // Save and broadcast state after each move
      this.saveGame(state);
      this.onCvCStateUpdate?.(gameId, state);
      
      // Check max moves
      if (state.moveHistory.length >= MAX_MOVES) {
        state.winner = 'draw';
        state.phase = 'finished';
        this.saveGame(state);
        this.onCvCStateUpdate?.(gameId, state);
        clearInterval(interval);
        this.cvcIntervals.delete(gameId);
      }
    }, 500); // 500ms between moves
    
    this.cvcIntervals.set(gameId, interval);
  }
  
  // Join as observer for CvC game
  // Stop a CvC game (for resign/stop functionality)
  stopCvCGame(gameId: string): GameState | null {
    const room = this.games.get(gameId);
    if (!room || room.state.gameMode !== 'cvc') return null;
    
    // Stop the game loop
    const interval = this.cvcIntervals.get(gameId);
    if (interval) {
      clearInterval(interval);
      this.cvcIntervals.delete(gameId);
    }
    
    // Mark game as finished (draw/stopped)
    room.state.phase = 'finished';
    room.state.winner = null; // Stopped, no winner
    this.saveGame(room.state);
    
    return room.state;
  }
  
  pauseCvCGame(gameId: string, paused: boolean): void {
    const room = this.games.get(gameId);
    if (!room || room.state.gameMode !== 'cvc') return;
    
    if (paused) {
      // Pause - stop the game loop
      const interval = this.cvcIntervals.get(gameId);
      if (interval) {
        clearInterval(interval);
        this.cvcIntervals.delete(gameId);
      }
    } else {
      // Resume - restart the game loop if game is still playing
      if (room.state.phase === 'playing' && !this.cvcIntervals.has(gameId)) {
        this.startCvCGameLoop(gameId);
      }
    }
  }

  joinCvCAsObserver(ws: WebSocket, gameId: string): { state: GameState } | null {
    let room = this.games.get(gameId);
    if (!room) {
      const state = this.loadGame(gameId);
      if (!state) return null;
      room = {
        state,
        players: new Map(),
        readyPlayers: new Set(),
      };
      this.games.set(gameId, room);
      
      // If game is still playing, restart the loop
      if (state.phase === 'playing' && state.gameMode === 'cvc') {
        this.startCvCGameLoop(gameId);
      }
    }
    
    // Add as observer (no player ID needed)
    const observerId = `observer-${randomUUID().slice(0, 8)}`;
    room.players.set(observerId, { ws, id: observerId, color: 'white' });
    
    return { state: room.state };
  }
  
  private placeCvCWalls(state: GameState, count: number, color: PlayerColor): void {
    const isWhite = color === 'white';
    const startRow = isWhite ? BOARD_SIZE / 2 : 0;
    const endRow = isWhite ? BOARD_SIZE : BOARD_SIZE / 2;
    
    let placed = 0;
    const attempts: Position[] = [];
    
    for (let row = startRow; row < endRow; row++) {
      for (let col = 0; col < BOARD_SIZE; col++) {
        if (!state.board[row][col].piece && !state.board[row][col].isWall) {
          attempts.push({ row, col });
        }
      }
    }
    
    // Shuffle
    for (let i = attempts.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [attempts[i], attempts[j]] = [attempts[j], attempts[i]];
    }
    
    for (const pos of attempts) {
      if (placed >= count) break;
      state.board[pos.row][pos.col].isWall = true;
      placed++;
    }
  }
  
  private makeCvCMove(state: GameState, color: PlayerColor): boolean {
    const board = state.board;
    const inCheck = this.isInCheck(board, color);
    
    interface AIMove { from: Position; to: Position; score: number; isArrow?: boolean; isAxe?: boolean; escapesCheck?: boolean }
    const possibleMoves: AIMove[] = [];
    
    for (let row = 0; row < BOARD_SIZE; row++) {
      for (let col = 0; col < BOARD_SIZE; col++) {
        const piece = board[row][col].piece;
        if (piece && piece.color === color) {
          const from = { row, col };
          const moves = this.getValidMoves(board, from);
          
          for (const to of moves) {
            const targetPiece = board[to.row][to.col].piece;
            let score = Math.random() * 0.5;
            
            const newBoard: Board = JSON.parse(JSON.stringify(board));
            newBoard[to.row][to.col].piece = piece;
            newBoard[from.row][from.col].piece = null;
            const escapesCheck = !this.isInCheck(newBoard, color);
            
            if (inCheck) {
              if (escapesCheck) {
                score += 1000;
              } else {
                score -= 2000;
              }
            }
            
            if (targetPiece) {
              const values: Record<PieceType, number> = {
                pawn: 1, knight: 3, bishop: 3, rook: 5, queen: 9, king: 100
              };
              score += values[targetPiece.type] * 10;
              // Pawns should always attack adjacent enemies - give high priority
              if (piece.type === 'pawn') {
                score += 500; // High priority for pawn attacks
              }
            }
            
            if (piece.type === 'pawn') {
              const advancement = color === 'white' ? (BOARD_SIZE - 1 - to.row) : to.row;
              score += advancement * 0.1;
            }
            
            // Early bishop development - move out to establish arrow firing lanes
            if (piece.type === 'bishop' && state.moveHistory.length < 20) {
              const startRow = color === 'white' ? BOARD_SIZE - 1 : 0;
              const isOnStartRow = from.row === startRow;
              if (isOnStartRow) {
                // Big bonus for developing bishops early
                score += 50;
                // Extra bonus for moving toward center diagonals
                const centerCol = BOARD_SIZE / 2;
                const towardCenter = Math.abs(to.col - centerCol) < Math.abs(from.col - centerCol);
                if (towardCenter) score += 20;
              }
            }
            
            const centerDist = Math.abs(to.row - BOARD_SIZE / 2) + Math.abs(to.col - BOARD_SIZE / 2);
            score += (BOARD_SIZE - centerDist) * 0.05;
            
            // A* pathfinding: bonus for moves that get closer to enemy king
            const enemyColor = color === 'white' ? 'black' : 'white';
            const enemyKingPos = findKingPosition(board, enemyColor);
            if (enemyKingPos && !targetPiece) {
              const currentPathDist = aStarPathfind(board, from, enemyKingPos);
              
              // Simulate moving the piece
              const tempBoard: Board = JSON.parse(JSON.stringify(board));
              tempBoard[to.row][to.col].piece = piece;
              tempBoard[from.row][from.col].piece = null;
              const newPathDist = aStarPathfind(tempBoard, to, enemyKingPos);
              
              if (newPathDist < currentPathDist && newPathDist !== Infinity) {
                const improvement = currentPathDist - newPathDist;
                score += improvement * 2;
                if (newPathDist <= 4) {
                  score += (5 - newPathDist) * 3;
                }
              }
              
              if (newPathDist > currentPathDist && currentPathDist !== Infinity) {
                score -= 1;
              }
            }
            
            possibleMoves.push({ from, to, score, escapesCheck });
          }
          
          // Arrow attacks for bishops - always try to shoot if target available
          if (piece.type === 'bishop' && !inCheck) {
            const arrowTargets = this.getArrowTargets(board, from, color);
            for (const to of arrowTargets) {
              const targetPiece = board[to.row][to.col].piece;
              if (targetPiece) {
                const values: Record<PieceType, number> = {
                  pawn: 1, knight: 3, bishop: 3, rook: 5, queen: 9, king: 100
                };
                // High priority for arrow attacks
                const score = values[targetPiece.type] * 10 + 400 + Math.random() * 0.5;
                possibleMoves.push({ from, to, score, isArrow: true });
              }
            }
          }
          
          // Axe attacks for knights
          if (piece.type === 'knight' && !inCheck) {
            const axeTargets = this.getAxeTargets(board, from, color);
            for (const to of axeTargets) {
              const targetPiece = board[to.row][to.col].piece;
              if (targetPiece) {
                const values: Record<PieceType, number> = {
                  pawn: 1, knight: 3, bishop: 3, rook: 5, queen: 9, king: 100
                };
                const score = values[targetPiece.type] * 10 * 0.5 + Math.random() * 0.5;
                possibleMoves.push({ from, to, score, isAxe: true });
              }
            }
          }
        }
      }
    }
    
    if (possibleMoves.length === 0) return false;
    
    possibleMoves.sort((a, b) => b.score - a.score);
    
    let validMoves = possibleMoves;
    if (inCheck) {
      const checkEscaping = possibleMoves.filter(m => m.escapesCheck);
      if (checkEscaping.length > 0) validMoves = checkEscaping;
      else return false; // No way to escape check = checkmate
    }
    
    const topMoves = validMoves.slice(0, Math.min(3, validMoves.length));
    const selected = topMoves[Math.floor(Math.random() * topMoves.length)];
    
    // Execute the move directly on state
    if (selected.isArrow) {
      this.executeCvCArrowAttack(state, selected.from, selected.to);
    } else if (selected.isAxe) {
      this.executeCvCAxeAttack(state, selected.from, selected.to);
    } else {
      this.executeCvCMove(state, selected.from, selected.to);
    }
    
    return true;
  }
  
  private executeCvCMove(state: GameState, from: Position, to: Position): void {
    const board = state.board;
    const piece = board[from.row][from.col].piece!;
    const targetPiece = board[to.row][to.col].piece;
    const color = piece.color;
    
    if (targetPiece) {
      // Combat
      if (piece.type === 'pawn') {
        const roll = Math.floor(Math.random() * 6) + 1;
        if (roll === 1) {
          // Success
          state.capturedPieces[color].push(targetPiece);
          board[to.row][to.col].piece = { ...piece, hasMoved: true };
          board[from.row][from.col].piece = null;
        }
        // Failure - turn still changes
      } else {
        // Non-pawn captures succeed
        state.capturedPieces[color].push(targetPiece);
        board[to.row][to.col].piece = { ...piece, hasMoved: true };
        board[from.row][from.col].piece = null;
      }
    } else {
      // Regular move
      board[to.row][to.col].piece = { ...piece, hasMoved: true };
      board[from.row][from.col].piece = null;
      
      // Castling
      if (piece.type === 'king' && Math.abs(to.col - from.col) > 1) {
        const isKingside = to.col === BOARD_SIZE - 1;
        const rookFromCol = isKingside ? BOARD_SIZE - 1 : 0;
        const rookToCol = isKingside ? to.col - 1 : to.col + 1;
        const rookPiece = board[from.row][rookFromCol].piece;
        if (rookPiece) {
          board[from.row][rookToCol].piece = { ...rookPiece, hasMoved: true };
          if (rookFromCol !== to.col) {
            board[from.row][rookFromCol].piece = null;
          }
        }
      }
    }
    
    // Pawn promotion
    if (piece.type === 'pawn') {
      const promotionRow = color === 'white' ? 0 : BOARD_SIZE - 1;
      if (to.row === promotionRow && board[to.row][to.col].piece) {
        const promotionTypes: PieceType[] = ['queen', 'rook', 'bishop', 'knight'];
        const randomPromotion = promotionTypes[Math.floor(Math.random() * promotionTypes.length)];
        board[to.row][to.col].piece = { type: randomPromotion, color, hasMoved: true };
      }
    }
    
    state.moveHistory.push({ from, to, piece, capturedPiece: targetPiece || undefined });
    
    // Check for king capture
    if (targetPiece && targetPiece.type === 'king') {
      state.winner = color;
      state.phase = 'finished';
    } else {
      // Switch turns - checkmate detection happens in makeCvCMove loop
      state.currentTurn = color === 'white' ? 'black' : 'white';
    }
  }
  
  private executeCvCArrowAttack(state: GameState, from: Position, to: Position): void {
    const board = state.board;
    const targetPiece = board[to.row][to.col].piece;
    const piece = board[from.row][from.col].piece!;
    const color = piece.color;
    
    if (targetPiece) {
      const distance = Math.abs(to.row - from.row);
      const roll1 = Math.floor(Math.random() * 6) + 1;
      const roll2 = Math.floor(Math.random() * 6) + 1;
      const total = roll1 + roll2;
      
      if (total >= distance) {
        state.capturedPieces[color].push(targetPiece);
        board[to.row][to.col].piece = null;
      }
    }
    
    const enemyColor = color === 'white' ? 'black' : 'white';
    state.currentTurn = enemyColor;
  }
  
  private executeCvCAxeAttack(state: GameState, from: Position, to: Position): void {
    const board = state.board;
    const targetPiece = board[to.row][to.col].piece;
    const piece = board[from.row][from.col].piece!;
    const color = piece.color;
    
    if (targetPiece) {
      const roll = Math.floor(Math.random() * 6) + 1;
      if (roll >= 4) {
        state.capturedPieces[color].push(targetPiece);
        board[to.row][to.col].piece = null;
      }
    }
    
    const enemyColor = color === 'white' ? 'black' : 'white';
    state.currentTurn = enemyColor;
  }
  
  // Allow a human to take over a color in a saved game
  takeoverGame(ws: WebSocket, gameId: string, color: PlayerColor): { playerId: string; state: GameState } | null {
    // Load game from file if not in memory
    let state = this.games.get(gameId)?.state;
    if (!state) {
      state = this.loadGame(gameId);
      if (!state) return null;
    }
    
    const playerId = randomUUID();
    
    // Update the game state
    state.players[color] = playerId;
    
    // If CvC game being taken over, change to PvC or PvP
    if (state.gameMode === 'cvc') {
      const otherColor = color === 'white' ? 'black' : 'white';
      if (state.players[otherColor] === AI_PLAYER_ID) {
        state.gameMode = 'pvc';
        state.aiColor = otherColor;
      } else {
        state.gameMode = 'pvp';
      }
    } else if (state.gameMode === 'pvc') {
      // If taking over the AI color
      if (state.aiColor === color) {
        state.gameMode = 'pvp';
        state.aiColor = undefined;
      }
    }
    
    // Create/update room
    let room = this.games.get(gameId);
    if (!room) {
      room = {
        state,
        players: new Map(),
        readyPlayers: new Set(),
      };
      this.games.set(gameId, room);
    }
    
    room.players.set(playerId, { ws, id: playerId, color });
    this.playerToGame.set(playerId, gameId);
    
    // Save updated game
    this.saveGame(state);
    
    return { playerId, state };
  }
  
  private placeAIWalls(state: GameState, count: number): void {
    const aiColor = state.aiColor;
    if (!aiColor) return;
    
    const isWhiteAI = aiColor === 'white';
    const startRow = isWhiteAI ? BOARD_SIZE / 2 : 0;
    const endRow = isWhiteAI ? BOARD_SIZE : BOARD_SIZE / 2;
    
    let placed = 0;
    const attempts: Position[] = [];
    
    // Collect valid positions
    for (let row = startRow; row < endRow; row++) {
      for (let col = 0; col < BOARD_SIZE; col++) {
        if (!state.board[row][col].piece && !state.board[row][col].isWall) {
          attempts.push({ row, col });
        }
      }
    }
    
    // Shuffle and place walls
    for (let i = attempts.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [attempts[i], attempts[j]] = [attempts[j], attempts[i]];
    }
    
    for (const pos of attempts) {
      if (placed >= count) break;
      state.board[pos.row][pos.col].isWall = true;
      placed++;
    }
    
    state.setupWallsRemaining[aiColor] = 0;
  }

  joinGame(ws: WebSocket, gameId: string): { playerId: string; color: PlayerColor } | null {
    // Try to load from file if not in memory
    let room = this.games.get(gameId);
    if (!room) {
      const state = this.loadGame(gameId);
      if (state) {
        room = {
          state,
          players: new Map(),
          readyPlayers: new Set(),
        };
        this.games.set(gameId, room);
      } else {
        return null;
      }
    }
    
    // Check if game is full
    if (room.state.players.black) {
      return null;
    }
    
    const playerId = randomUUID();
    room.state.players.black = playerId;
    room.players.set(playerId, { ws, id: playerId, color: 'black' });
    this.playerToGame.set(playerId, gameId);
    
    // Move to setup phase when both players join
    if (room.state.maxWallsPerPlayer > 0) {
      room.state.phase = 'setup';
    } else {
      room.state.phase = 'playing';
    }
    
    // Save game to file
    this.saveGame(room.state);
    
    return { playerId, color: 'black' };
  }

  reconnectPlayer(ws: WebSocket, playerId: string, gameId: string): boolean {
    // Try to load from file if not in memory
    let room = this.games.get(gameId);
    if (!room) {
      const state = this.loadGame(gameId);
      if (state) {
        room = {
          state,
          players: new Map(),
          readyPlayers: new Set(),
        };
        this.games.set(gameId, room);
      } else {
        return false;
      }
    }
    
    // Check if this player belongs to this game
    const isWhitePlayer = room.state.players.white === playerId;
    const isBlackPlayer = room.state.players.black === playerId;
    
    if (!isWhitePlayer && !isBlackPlayer) {
      return false;
    }
    
    // Add or update player WebSocket
    const color: PlayerColor = isWhitePlayer ? 'white' : 'black';
    room.players.set(playerId, { ws, id: playerId, color });
    this.playerToGame.set(playerId, gameId);
    
    return true;
  }

  handleSetupWall(playerId: string, position: Position): GameState | null {
    const gameId = this.playerToGame.get(playerId);
    if (!gameId) return null;
    
    const room = this.games.get(gameId);
    if (!room || room.state.phase !== 'setup') return null;
    
    const player = room.players.get(playerId);
    if (!player) return null;
    
    const color = player.color;
    const isOwnHalf = color === 'white' 
      ? position.row >= BOARD_SIZE / 2 
      : position.row < BOARD_SIZE / 2;
    
    if (!isOwnHalf) return null;
    
    const square = room.state.board[position.row][position.col];
    if (square.piece) return null;
    
    // Toggle wall
    if (square.isWall) {
      square.isWall = false;
      room.state.setupWallsRemaining[color]++;
    } else {
      if (room.state.setupWallsRemaining[color] <= 0) return null;
      square.isWall = true;
      room.state.setupWallsRemaining[color]--;
    }
    
    // Save game to file
    this.saveGame(room.state);
    
    return room.state;
  }
  
  handleRandomWalls(playerId: string): GameState | null {
    const gameId = this.playerToGame.get(playerId);
    if (!gameId) return null;
    
    const room = this.games.get(gameId);
    if (!room || room.state.phase !== 'setup') return null;
    
    const player = room.players.get(playerId);
    if (!player) return null;
    
    const color = player.color;
    const remaining = room.state.setupWallsRemaining[color];
    if (remaining <= 0) return room.state;
    
    // Determine the player's half of the board
    const isWhite = color === 'white';
    const startRow = isWhite ? BOARD_SIZE / 2 : 0;
    const endRow = isWhite ? BOARD_SIZE : BOARD_SIZE / 2;
    
    // Collect valid positions (empty squares without walls or pieces)
    const validPositions: Position[] = [];
    for (let row = startRow; row < endRow; row++) {
      for (let col = 0; col < BOARD_SIZE; col++) {
        const square = room.state.board[row][col];
        if (!square.piece && !square.isWall) {
          validPositions.push({ row, col });
        }
      }
    }
    
    // Shuffle positions
    for (let i = validPositions.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [validPositions[i], validPositions[j]] = [validPositions[j], validPositions[i]];
    }
    
    // Place walls randomly
    let placed = 0;
    for (const pos of validPositions) {
      if (placed >= remaining) break;
      room.state.board[pos.row][pos.col].isWall = true;
      placed++;
    }
    
    room.state.setupWallsRemaining[color] = remaining - placed;
    
    // Save game to file
    this.saveGame(room.state);
    
    return room.state;
  }
  
  handleMazeWalls(playerId: string): GameState | null {
    const gameId = this.playerToGame.get(playerId);
    if (!gameId) return null;
    
    const room = this.games.get(gameId);
    if (!room || room.state.phase !== 'setup') return null;
    
    const player = room.players.get(playerId);
    if (!player) return null;
    
    const color = player.color;
    
    // First clear existing walls for this player
    const isWhite = color === 'white';
    const startRow = isWhite ? BOARD_SIZE / 2 : 0;
    const endRow = isWhite ? BOARD_SIZE : BOARD_SIZE / 2;
    
    let wallCount = 0;
    for (let row = startRow; row < endRow; row++) {
      for (let col = 0; col < BOARD_SIZE; col++) {
        if (room.state.board[row][col].isWall) {
          room.state.board[row][col].isWall = false;
          wallCount++;
        }
      }
    }
    
    // Restore wall count
    const totalWalls = room.state.setupWallsRemaining[color] + wallCount;
    const halfHeight = BOARD_SIZE / 2;
    
    // Generate maze using recursive division with corridors
    const generateMazePattern = (): Position[] => {
      const positions: Position[] = [];
      const validSquares: Position[] = [];
      
      // Collect all valid positions (no pieces)
      for (let row = startRow; row < endRow; row++) {
        for (let col = 0; col < BOARD_SIZE; col++) {
          if (!room.state.board[row][col].piece) {
            validSquares.push({ row, col });
          }
        }
      }
      
      // Create maze structure with chambers and corridors
      // Divide the half into chambers using walls with passage gaps
      
      // Vertical dividers at different columns with 2-cell gaps
      const dividerCols = [3, 7, 11];
      for (const col of dividerCols) {
        if (col >= BOARD_SIZE) continue;
        // Create gap positions (2-3 squares wide)
        const gapStart = startRow + Math.floor(Math.random() * (halfHeight - 2));
        const gapSize = 2 + Math.floor(Math.random() * 2);
        
        for (let row = startRow; row < endRow; row++) {
          // Skip the gap area
          if (row >= gapStart && row < gapStart + gapSize) continue;
          if (!room.state.board[row][col].piece) {
            positions.push({ row, col });
          }
        }
      }
      
      // Horizontal dividers with gaps
      const midRow = startRow + Math.floor(halfHeight / 2);
      const horizontalRows = [midRow];
      if (halfHeight > 4) {
        horizontalRows.push(startRow + 1);
        horizontalRows.push(endRow - 2);
      }
      
      for (const row of horizontalRows) {
        if (row < startRow || row >= endRow) continue;
        // Create multiple gaps in horizontal walls
        const numGaps = 2 + Math.floor(Math.random() * 2);
        const gaps: number[] = [];
        for (let g = 0; g < numGaps; g++) {
          gaps.push(Math.floor(Math.random() * BOARD_SIZE));
        }
        
        for (let col = 0; col < BOARD_SIZE; col++) {
          // Skip gap areas (2 squares wide)
          const nearGap = gaps.some(g => Math.abs(col - g) <= 1);
          if (nearGap) continue;
          if (!room.state.board[row][col].piece) {
            positions.push({ row, col });
          }
        }
      }
      
      // Add some L-shaped and corner pieces for visual interest
      const cornerPatterns = [
        [[0, 0], [0, 1], [1, 0]], // L top-left
        [[0, 0], [0, 1], [-1, 0]], // L bottom-left
        [[0, 0], [1, 0], [1, 1]], // corner
      ];
      
      for (let i = 0; i < Math.floor(totalWalls * 0.15); i++) {
        const pattern = cornerPatterns[Math.floor(Math.random() * cornerPatterns.length)];
        const baseRow = startRow + 1 + Math.floor(Math.random() * (halfHeight - 2));
        const baseCol = 1 + Math.floor(Math.random() * (BOARD_SIZE - 2));
        
        for (const [dr, dc] of pattern) {
          const r = baseRow + dr;
          const c = baseCol + dc;
          if (r >= startRow && r < endRow && c >= 0 && c < BOARD_SIZE) {
            if (!room.state.board[r][c].piece) {
              positions.push({ row: r, col: c });
            }
          }
        }
      }
      
      return positions;
    };
    
    const allPositions = generateMazePattern();
    
    // Remove duplicates
    const uniquePositions = allPositions.filter((pos, idx) => 
      allPositions.findIndex(p => p.row === pos.row && p.col === pos.col) === idx
    );
    
    // Shuffle positions for variety
    for (let i = uniquePositions.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [uniquePositions[i], uniquePositions[j]] = [uniquePositions[j], uniquePositions[i]];
    }
    
    // Place walls up to the limit
    let placed = 0;
    for (const pos of uniquePositions) {
      if (placed >= totalWalls) break;
      if (!room.state.board[pos.row][pos.col].piece && !room.state.board[pos.row][pos.col].isWall) {
        room.state.board[pos.row][pos.col].isWall = true;
        placed++;
      }
    }
    
    // If we haven't placed all walls, fill remaining randomly
    if (placed < totalWalls) {
      const remaining: Position[] = [];
      for (let row = startRow; row < endRow; row++) {
        for (let col = 0; col < BOARD_SIZE; col++) {
          if (!room.state.board[row][col].piece && !room.state.board[row][col].isWall) {
            remaining.push({ row, col });
          }
        }
      }
      
      // Shuffle remaining
      for (let i = remaining.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [remaining[i], remaining[j]] = [remaining[j], remaining[i]];
      }
      
      for (const pos of remaining) {
        if (placed >= totalWalls) break;
        room.state.board[pos.row][pos.col].isWall = true;
        placed++;
      }
    }
    
    room.state.setupWallsRemaining[color] = totalWalls - placed;
    
    // Save game to file
    this.saveGame(room.state);
    
    return room.state;
  }

  handleReady(playerId: string): GameState | null {
    const gameId = this.playerToGame.get(playerId);
    if (!gameId) return null;
    
    const room = this.games.get(gameId);
    if (!room || room.state.phase !== 'setup') return null;
    
    room.readyPlayers.add(playerId);
    
    // If both players ready, start the game
    if (room.readyPlayers.size >= 2) {
      room.state.phase = 'playing';
    }
    
    // Save game to file
    this.saveGame(room.state);
    
    return room.state;
  }

  handleMove(playerId: string, from: Position, to: Position, resign?: boolean, promotionPiece?: 'queen' | 'rook' | 'bishop' | 'knight'): { state: GameState; diceRoll?: { value: number; type: 'd4' | 'd6'; success: boolean }; needsPromotion?: boolean } | null {
    const gameId = this.playerToGame.get(playerId);
    if (!gameId) return null;
    
    const room = this.games.get(gameId);
    if (!room || room.state.phase !== 'playing') return null;
    
    const player = room.players.get(playerId);
    if (!player) return null;
    
    // Handle resignation
    if (resign) {
      room.state.winner = player.color === 'white' ? 'black' : 'white';
      room.state.phase = 'finished';
      this.saveGame(room.state);
      return { state: room.state };
    }
    
    // Validate it's the player's turn
    if (room.state.currentTurn !== player.color) return null;
    
    const board = room.state.board;
    const piece = board[from.row][from.col].piece;
    if (!piece || piece.color !== player.color) return null;
    
    // Validate move
    const validMoves = this.getValidMoves(board, from);
    if (!validMoves.some(m => m.row === to.row && m.col === to.col)) return null;
    
    const targetPiece = board[to.row][to.col].piece;
    let diceRoll: { value: number; type: 'd4' | 'd6'; success: boolean } | undefined;
    
    // Clear previous dice roll for non-attack moves
    room.state.lastDiceRoll = undefined;
    
    // Pawn attack requires dice roll
    if (piece.type === 'pawn' && targetPiece) {
      const roll = Math.floor(Math.random() * 6) + 1;
      const pawnThreshold = room.state.attackSettings?.pawnSuccessRoll ?? 1;
      const success = roll <= pawnThreshold;
      diceRoll = { value: roll, type: 'd6', success };
      room.state.lastDiceRoll = diceRoll;
      
      if (!success) {
        // Failed attack - pawn stays in place, turn passes
        // No move history entry for failed attacks, just swap turns
        room.state.currentTurn = player.color === 'white' ? 'black' : 'white';
        this.saveGame(room.state);
        return { state: room.state, diceRoll };
      }
    }
    
    // Execute move
    board[from.row][from.col].piece = null;
    
    if (targetPiece) {
      room.state.capturedPieces[player.color].push(targetPiece);
      
      // Check for king capture (win condition)
      if (targetPiece.type === 'king') {
        room.state.winner = player.color;
        room.state.phase = 'finished';
      }
    }
    
    // Check for pawn promotion
    const isPromotion = piece.type === 'pawn' && 
      ((player.color === 'white' && to.row === 0) || (player.color === 'black' && to.row === 11));
    
    if (isPromotion && !promotionPiece) {
      // Need to ask client for promotion choice - don't execute move yet
      // Restore piece to original position
      board[from.row][from.col].piece = piece;
      return { state: room.state, needsPromotion: true };
    }
    
    // Check for castling
    let isCastling = false;
    let castlingNotation = '';
    if (piece.type === 'king' && !piece.hasMoved && Math.abs(to.col - from.col) > 1) {
      isCastling = true;
      if (to.col === 11) {
        // Kingside castling - move rook from col 9 to col 10
        const rook = board[from.row][9].piece;
        board[from.row][9].piece = null;
        board[from.row][10].piece = { ...rook!, hasMoved: true };
        castlingNotation = 'O-O';
      } else if (to.col === 0) {
        // Queenside castling - move rook from col 2 to col 1
        const rook = board[from.row][2].piece;
        board[from.row][2].piece = null;
        board[from.row][1].piece = { ...rook!, hasMoved: true };
        castlingNotation = 'O-O-O';
      }
    }
    
    // Place piece (possibly promoted)
    const finalPiece = isPromotion && promotionPiece 
      ? { type: promotionPiece, color: piece.color, hasMoved: true }
      : { ...piece, hasMoved: true };
    board[to.row][to.col].piece = finalPiece;
    
    const move: Move = {
      from,
      to,
      piece,
      captured: targetPiece || undefined,
      diceRoll: diceRoll?.value,
      diceRequired: piece.type === 'pawn' && targetPiece ? 6 : undefined,
      success: diceRoll ? diceRoll.success : undefined,
      notation: isCastling ? castlingNotation : this.getMoveNotation(piece, from, to, targetPiece || undefined, diceRoll?.value, promotionPiece),
      promotionPiece: promotionPiece,
    };
    room.state.moveHistory.push(move);
    
    // Swap turns
    room.state.currentTurn = player.color === 'white' ? 'black' : 'white';
    
    // Check for checkmate
    if (this.isCheckmate(board, room.state.currentTurn)) {
      room.state.winner = player.color;
      room.state.phase = 'finished';
    }
    
    // Save game to file
    this.saveGame(room.state);
    
    return { state: room.state, diceRoll };
  }

  handleArrowAttack(playerId: string, from: Position, to: Position): { state: GameState; diceRoll: { value: number; type: '2d6'; success: boolean } } | null {
    const gameId = this.playerToGame.get(playerId);
    if (!gameId) return null;
    
    const room = this.games.get(gameId);
    if (!room || room.state.phase !== 'playing') return null;
    
    const player = room.players.get(playerId);
    if (!player) return null;
    
    if (room.state.currentTurn !== player.color) return null;
    
    const board = room.state.board;
    const piece = board[from.row][from.col].piece;
    if (!piece || piece.type !== 'bishop' || piece.color !== player.color) return null;
    
    // Verify straight line (any direction: horizontal, vertical, or diagonal)
    const rowDiff = to.row - from.row;
    const colDiff = to.col - from.col;
    
    // Must be horizontal, vertical, or diagonal
    const isHorizontal = rowDiff === 0 && colDiff !== 0;
    const isVertical = colDiff === 0 && rowDiff !== 0;
    const isDiagonal = Math.abs(rowDiff) === Math.abs(colDiff) && rowDiff !== 0;
    
    if (!isHorizontal && !isVertical && !isDiagonal) return null;
    
    const distance = Math.max(Math.abs(rowDiff), Math.abs(colDiff));
    
    // Check path is clear (arrows travel through squares)
    const rowDir = rowDiff === 0 ? 0 : (rowDiff > 0 ? 1 : -1);
    const colDir = colDiff === 0 ? 0 : (colDiff > 0 ? 1 : -1);
    
    for (let i = 1; i < distance; i++) {
      const checkRow = from.row + i * rowDir;
      const checkCol = from.col + i * colDir;
      if (board[checkRow][checkCol].isWall || board[checkRow][checkCol].piece) {
        return null; // Path is blocked
      }
    }
    
    const targetPiece = board[to.row][to.col].piece;
    if (!targetPiece || targetPiece.color === player.color) return null;
    if (targetPiece.type === 'knight' || targetPiece.type === 'rook') return null;
    
    // Roll 2d6 for arrow - need to roll >= threshold to hit
    const die1 = Math.floor(Math.random() * 6) + 1;
    const die2 = Math.floor(Math.random() * 6) + 1;
    const roll = die1 + die2;
    const bishopThreshold = room.state.attackSettings?.bishopMinRoll || distance; // 0 means use distance
    const success = roll >= bishopThreshold;
    
    const diceRoll = { value: roll, type: '2d6' as const, success };
    room.state.lastDiceRoll = diceRoll;
    
    const move: Move = {
      from,
      to,
      piece,
      captured: success ? targetPiece : undefined,
      isArrowAttack: true,
      diceRoll: roll,
      diceRequired: 12,
      success,
      notation: this.getMoveNotation(piece, from, to, success ? targetPiece : undefined, roll, true),
    };
    room.state.moveHistory.push(move);
    
    if (success) {
      room.state.capturedPieces[player.color].push(targetPiece);
      board[to.row][to.col].piece = null;
      
      if (targetPiece.type === 'king') {
        room.state.winner = player.color;
        room.state.phase = 'finished';
      }
    }
    
    // Swap turns
    room.state.currentTurn = player.color === 'white' ? 'black' : 'white';
    
    // Save game to file
    this.saveGame(room.state);
    
    return { state: room.state, diceRoll };
  }

  handleAxeAttack(playerId: string, from: Position, to: Position): { state: GameState; diceRoll: { value: number; type: 'd6'; success: boolean } } | null {
    const gameId = this.playerToGame.get(playerId);
    if (!gameId) return null;
    
    const room = this.games.get(gameId);
    if (!room || room.state.phase !== 'playing') return null;
    
    const player = room.players.get(playerId);
    if (!player) return null;
    
    if (room.state.currentTurn !== player.color) return null;
    
    const board = room.state.board;
    const piece = board[from.row][from.col].piece;
    if (!piece || piece.type !== 'knight' || piece.color !== player.color) return null;
    
    // Validate target is 1 square away (adjacent)
    const rowDiff = Math.abs(to.row - from.row);
    const colDiff = Math.abs(to.col - from.col);
    if (rowDiff > 1 || colDiff > 1 || (rowDiff === 0 && colDiff === 0)) return null;
    
    const targetPiece = board[to.row][to.col].piece;
    if (!targetPiece || targetPiece.color === player.color) return null;
    
    // Roll 1d6 for axe - need to roll >= threshold to hit
    const roll = Math.floor(Math.random() * 6) + 1;
    const knightThreshold = room.state.attackSettings?.knightMinRoll ?? 4;
    const success = roll >= knightThreshold;
    
    const diceRoll = { value: roll, type: 'd6' as const, success };
    room.state.lastDiceRoll = diceRoll;
    
    const move: Move = {
      from,
      to,
      piece,
      captured: success ? targetPiece : undefined,
      isArrowAttack: false,
      diceRoll: roll,
      diceRequired: 4,
      success,
      notation: `N${String.fromCharCode(97 + from.col)}${12 - from.row}⚔${String.fromCharCode(97 + to.col)}${12 - to.row}[d6:${roll}]`,
    };
    room.state.moveHistory.push(move);
    
    if (success) {
      room.state.capturedPieces[player.color].push(targetPiece);
      board[to.row][to.col].piece = null;
      
      if (targetPiece.type === 'king') {
        room.state.winner = player.color;
        room.state.phase = 'finished';
      }
    }
    
    // Swap turns
    room.state.currentTurn = player.color === 'white' ? 'black' : 'white';
    
    // Save game to file
    this.saveGame(room.state);
    
    return { state: room.state, diceRoll };
  }

  handleBombAttack(playerId: string, from: Position, to: Position): { state: GameState; diceRoll: { value: number; type: 'd10'; success: boolean } } | null {
    const gameId = this.playerToGame.get(playerId);
    if (!gameId) return null;
    
    const room = this.games.get(gameId);
    if (!room || room.state.phase !== 'playing') return null;
    
    const player = room.players.get(playerId);
    if (!player) return null;
    
    if (room.state.currentTurn !== player.color) return null;
    
    const board = room.state.board;
    const piece = board[from.row][from.col].piece;
    if (!piece || piece.type !== 'rook' || piece.color !== player.color) return null;
    
    // Validate target is adjacent (1 square away)
    const rowDiff = Math.abs(to.row - from.row);
    const colDiff = Math.abs(to.col - from.col);
    if (rowDiff > 1 || colDiff > 1 || (rowDiff === 0 && colDiff === 0)) return null;
    
    // Validate target is a wall
    if (!board[to.row][to.col].isWall) return null;
    
    // Roll 1d10 for bomb attack - configurable success rate
    const bombSuccessRoll = room.state.attackSettings.bombSuccessRoll;
    const roll = Math.floor(Math.random() * 10) + 1;
    const success = roll <= bombSuccessRoll;
    
    const diceRoll = { value: roll, type: 'd10' as const, success };
    room.state.lastDiceRoll = diceRoll;
    
    const move: Move = {
      from,
      to,
      piece,
      captured: undefined,
      isArrowAttack: false,
      diceRoll: roll,
      diceRequired: 10,
      success,
      notation: `R${String.fromCharCode(97 + from.col)}${12 - from.row}💣${String.fromCharCode(97 + to.col)}${12 - to.row}[d10:${roll}≤${bombSuccessRoll}]`,
    };
    room.state.moveHistory.push(move);
    
    if (success) {
      // Destroy the wall - revert to normal square
      board[to.row][to.col].isWall = false;
    }
    
    // Swap turns
    room.state.currentTurn = player.color === 'white' ? 'black' : 'white';
    
    // Save game to file
    this.saveGame(room.state);
    
    return { state: room.state, diceRoll };
  }

  getRoom(gameId: string): GameRoom | undefined {
    return this.games.get(gameId);
  }

  getGameIdForPlayer(playerId: string): string | undefined {
    return this.playerToGame.get(playerId);
  }

  removePlayer(playerId: string): void {
    const gameId = this.playerToGame.get(playerId);
    if (gameId) {
      const room = this.games.get(gameId);
      if (room) {
        room.players.delete(playerId);
        if (room.players.size === 0) {
          this.games.delete(gameId);
        }
      }
      this.playerToGame.delete(playerId);
    }
  }

  isAITurn(gameId: string): boolean {
    const room = this.games.get(gameId);
    if (!room) return false;
    return room.state.gameMode === 'pvc' && 
           room.state.currentTurn === room.state.aiColor &&
           room.state.phase === 'playing';
  }

  makeAIMove(gameId: string): { state: GameState; diceRoll?: { value: number; type: 'd4' | 'd6' | 'd10'; success: boolean } } | null {
    const room = this.games.get(gameId);
    if (!room || !this.isAITurn(gameId)) return null;

    const state = room.state;
    const aiColor = state.aiColor!;
    const board = state.board;

    // Check if AI is currently in check
    const inCheck = this.isInCheck(board, aiColor);

    // Collect all possible moves for AI
    interface AIMove { from: Position; to: Position; score: number; isArrow?: boolean; isAxe?: boolean; isBomb?: boolean; escapesCheck?: boolean }
    const possibleMoves: AIMove[] = [];

    for (let row = 0; row < BOARD_SIZE; row++) {
      for (let col = 0; col < BOARD_SIZE; col++) {
        const piece = board[row][col].piece;
        if (piece && piece.color === aiColor) {
          const from = { row, col };
          const moves = this.getValidMoves(board, from);
          
          for (const to of moves) {
            const targetPiece = board[to.row][to.col].piece;
            let score = Math.random() * 0.5; // Small random factor
            
            // Simulate the move to check if it escapes check
            const newBoard: Board = JSON.parse(JSON.stringify(board));
            newBoard[to.row][to.col].piece = piece;
            newBoard[from.row][from.col].piece = null;
            const escapesCheck = !this.isInCheck(newBoard, aiColor);
            
            // If in check, heavily prioritize moves that escape check
            if (inCheck) {
              if (escapesCheck) {
                score += 1000; // Massive bonus for escaping check
              } else {
                score -= 2000; // Heavily penalize moves that don't escape check
              }
            }
            
            // Prioritize captures (higher value pieces = higher score)
            if (targetPiece) {
              const values: Record<PieceType, number> = {
                pawn: 1, knight: 3, bishop: 3, rook: 5, queen: 9, king: 100
              };
              score += values[targetPiece.type] * 10;
              
              // Pawns should always attack adjacent enemies - give high priority
              if (piece.type === 'pawn') {
                score += 500; // High priority for pawn attacks
              }
            }
            
            // Bonus for advancing pawns
            if (piece.type === 'pawn') {
              const advancement = aiColor === 'white' ? (BOARD_SIZE - 1 - to.row) : to.row;
              score += advancement * 0.1;
            }
            
            // Early bishop development - move out to establish arrow firing lanes
            if (piece.type === 'bishop' && state.moveHistory.length < 20) {
              const startRow = aiColor === 'white' ? BOARD_SIZE - 1 : 0;
              const isOnStartRow = from.row === startRow;
              if (isOnStartRow) {
                // Big bonus for developing bishops early
                score += 50;
                // Extra bonus for moving toward center diagonals
                const centerCol = BOARD_SIZE / 2;
                const towardCenter = Math.abs(to.col - centerCol) < Math.abs(from.col - centerCol);
                if (towardCenter) score += 20;
              }
            }
            
            // Bonus for central control
            const centerDist = Math.abs(to.row - BOARD_SIZE / 2) + Math.abs(to.col - BOARD_SIZE / 2);
            score += (BOARD_SIZE - centerDist) * 0.05;
            
            // A* pathfinding: bonus for moves that get closer to enemy king
            const enemyColor = aiColor === 'white' ? 'black' : 'white';
            const enemyKingPos = findKingPosition(board, enemyColor);
            if (enemyKingPos && !targetPiece) {
              // For non-capture moves, prefer moves that reduce path distance to enemy king
              const currentPathDist = aStarPathfind(board, from, enemyKingPos);
              
              // Simulate moving the piece and check new path distance
              const tempBoard: Board = JSON.parse(JSON.stringify(board));
              tempBoard[to.row][to.col].piece = piece;
              tempBoard[from.row][from.col].piece = null;
              const newPathDist = aStarPathfind(tempBoard, to, enemyKingPos);
              
              if (newPathDist < currentPathDist && newPathDist !== Infinity) {
                // Bonus for getting closer to enemy king
                const improvement = currentPathDist - newPathDist;
                score += improvement * 2;
                
                // Extra bonus for pieces that are approaching attack range
                if (newPathDist <= 4) {
                  score += (5 - newPathDist) * 3;
                }
              }
              
              // Penalty for moves that make path worse or impossible
              if (newPathDist > currentPathDist && currentPathDist !== Infinity) {
                score -= 1;
              }
            }
            
            possibleMoves.push({ from, to, score, escapesCheck });
          }
          
          // Add arrow attacks for bishops - always try to shoot if target available
          if (piece.type === 'bishop' && !inCheck) {
            const arrowTargets = this.getArrowTargets(board, from, aiColor);
            for (const to of arrowTargets) {
              const targetPiece = board[to.row][to.col].piece;
              if (targetPiece) {
                const values: Record<PieceType, number> = {
                  pawn: 1, knight: 3, bishop: 3, rook: 5, queen: 9, king: 100
                };
                // Very high priority for arrow attacks (prioritize special attacks)
                const score = values[targetPiece.type] * 15 + 600 + Math.random() * 0.5;
                possibleMoves.push({ from, to, score, isArrow: true });
              }
            }
          }
          
          // Add axe attacks for knights - high priority ranged attack
          if (piece.type === 'knight' && !inCheck) {
            const axeTargets = this.getAxeTargets(board, from, aiColor);
            for (const to of axeTargets) {
              const targetPiece = board[to.row][to.col].piece;
              if (targetPiece) {
                const values: Record<PieceType, number> = {
                  pawn: 1, knight: 3, bishop: 3, rook: 5, queen: 9, king: 100
                };
                // Very high priority for axe attacks
                const score = values[targetPiece.type] * 12 + 550 + Math.random() * 0.5;
                possibleMoves.push({ from, to, score, isAxe: true });
              }
            }
          }
          
          // Add bomb attacks for rooks - destroy adjacent walls
          if (piece.type === 'rook' && !inCheck) {
            const bombTargets = this.getBombTargets(board, from);
            const enemyColor = aiColor === 'white' ? 'black' : 'white';
            const enemyKingPos = findKingPosition(board, enemyColor);
            
            for (const to of bombTargets) {
              let score = 350 + Math.random() * 0.5;
              
              // Use A* to determine if bombing this wall opens up a path
              if (enemyKingPos) {
                // Check current path distance (may be blocked)
                const currentPathDist = aStarPathfind(board, from, enemyKingPos);
                
                // Simulate removing the wall
                const tempBoard: Board = JSON.parse(JSON.stringify(board));
                tempBoard[to.row][to.col].isWall = false;
                const newPathDist = aStarPathfind(tempBoard, from, enemyKingPos);
                
                // Big bonus if bombing opens a path or significantly shortens it
                if (currentPathDist === Infinity && newPathDist !== Infinity) {
                  score += 200; // Opens a previously blocked path
                } else if (newPathDist < currentPathDist) {
                  score += (currentPathDist - newPathDist) * 15; // Shortens existing path
                }
                
                // Also check if any friendly piece benefits from this wall removal
                for (let r = 0; r < BOARD_SIZE; r++) {
                  for (let c = 0; c < BOARD_SIZE; c++) {
                    const otherPiece = board[r][c].piece;
                    if (otherPiece && otherPiece.color === aiColor && (r !== from.row || c !== from.col)) {
                      const otherFrom = { row: r, col: c };
                      const otherCurrentDist = aStarPathfind(board, otherFrom, enemyKingPos);
                      const otherNewDist = aStarPathfind(tempBoard, otherFrom, enemyKingPos);
                      
                      if (otherCurrentDist === Infinity && otherNewDist !== Infinity) {
                        score += 100; // Opens path for another piece
                      } else if (otherNewDist < otherCurrentDist - 2) {
                        score += 30; // Significantly helps another piece
                      }
                    }
                  }
                }
              }
              
              possibleMoves.push({ from, to, score, isBomb: true });
            }
          }
        }
      }
    }

    if (possibleMoves.length === 0) {
      // No moves available - stalemate or checkmate
      return null;
    }

    // Sort by score and pick the best move (with some randomness in top choices)
    possibleMoves.sort((a, b) => b.score - a.score);
    
    // If in check, only consider moves that escape check
    let validMoves = possibleMoves;
    if (inCheck) {
      const checkEscapingMoves = possibleMoves.filter(m => m.escapesCheck);
      if (checkEscapingMoves.length > 0) {
        validMoves = checkEscapingMoves;
      }
    }
    
    // Pick from top 3 moves with weighted probability
    const topMoves = validMoves.slice(0, Math.min(3, validMoves.length));
    const selectedMove = topMoves[Math.floor(Math.random() * topMoves.length)];

    // Execute the move
    if (selectedMove.isArrow) {
      return this.executeAIArrowAttack(gameId, selectedMove.from, selectedMove.to);
    } else if (selectedMove.isAxe) {
      return this.executeAIAxeAttack(gameId, selectedMove.from, selectedMove.to);
    } else if (selectedMove.isBomb) {
      return this.executeAIBombAttack(gameId, selectedMove.from, selectedMove.to);
    } else {
      return this.executeAIMove(gameId, selectedMove.from, selectedMove.to);
    }
  }

  private getArrowTargets(board: Board, from: Position, color: PlayerColor): Position[] {
    const targets: Position[] = [];
    const directions = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
    
    for (const [dr, dc] of directions) {
      for (let dist = 1; dist <= 4; dist++) {
        const newRow = from.row + dr * dist;
        const newCol = from.col + dc * dist;
        
        if (!this.isValidPosition(newRow, newCol)) break;
        if (board[newRow][newCol].isWall) break;
        
        const targetPiece = board[newRow][newCol].piece;
        if (targetPiece) {
          if (targetPiece.color !== color && 
              targetPiece.type !== 'knight' && 
              targetPiece.type !== 'rook') {
            targets.push({ row: newRow, col: newCol });
          }
          break;
        }
      }
    }
    
    return targets;
  }

  private getAxeTargets(board: Board, from: Position, color: PlayerColor): Position[] {
    const targets: Position[] = [];
    
    // Check all 8 adjacent squares
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        
        const newRow = from.row + dr;
        const newCol = from.col + dc;
        
        if (!this.isValidPosition(newRow, newCol)) continue;
        if (board[newRow][newCol].isWall) continue;
        
        const targetPiece = board[newRow][newCol].piece;
        if (targetPiece && targetPiece.color !== color) {
          targets.push({ row: newRow, col: newCol });
        }
      }
    }
    
    return targets;
  }

  private getBombTargets(board: Board, from: Position): Position[] {
    const targets: Position[] = [];
    
    // Check all 8 adjacent squares for walls
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        
        const newRow = from.row + dr;
        const newCol = from.col + dc;
        
        if (!this.isValidPosition(newRow, newCol)) continue;
        
        // Bomb targets walls, not pieces
        if (board[newRow][newCol].isWall) {
          targets.push({ row: newRow, col: newCol });
        }
      }
    }
    
    return targets;
  }

  private executeAIMove(gameId: string, from: Position, to: Position): { state: GameState; diceRoll?: { value: number; type: 'd4' | 'd6'; success: boolean } } | null {
    const room = this.games.get(gameId);
    if (!room) return null;

    const state = room.state;
    const aiColor = state.aiColor!;
    const board = state.board;
    const piece = board[from.row][from.col].piece;
    if (!piece) return null;

    const targetPiece = board[to.row][to.col].piece;
    let diceRoll: { value: number; type: 'd4' | 'd6'; success: boolean } | undefined;

    // Pawn attack requires dice roll
    if (piece.type === 'pawn' && targetPiece) {
      const roll = Math.floor(Math.random() * 6) + 1;
      const pawnThreshold = state.attackSettings?.pawnSuccessRoll ?? 1;
      const success = roll <= pawnThreshold;
      diceRoll = { value: roll, type: 'd6', success };
      state.lastDiceRoll = diceRoll;

      if (!success) {
        state.currentTurn = aiColor === 'white' ? 'black' : 'white';
        this.saveGame(state);
        return { state, diceRoll };
      }
    }

    // Execute move
    board[from.row][from.col].piece = null;

    if (targetPiece) {
      state.capturedPieces[aiColor].push(targetPiece);
      if (targetPiece.type === 'king') {
        state.winner = aiColor;
        state.phase = 'finished';
      }
    }

    board[to.row][to.col].piece = { ...piece, hasMoved: true };

    const move: Move = {
      from,
      to,
      piece,
      captured: targetPiece || undefined,
      diceRoll: diceRoll?.value,
      diceRequired: piece.type === 'pawn' && targetPiece ? 6 : undefined,
      success: diceRoll ? diceRoll.success : undefined,
      notation: this.getMoveNotation(piece, from, to, targetPiece || undefined, diceRoll?.value),
    };
    state.moveHistory.push(move);

    state.currentTurn = aiColor === 'white' ? 'black' : 'white';

    if (this.isCheckmate(board, state.currentTurn)) {
      state.winner = aiColor;
      state.phase = 'finished';
    }

    this.saveGame(state);
    return { state, diceRoll };
  }

  private executeAIArrowAttack(gameId: string, from: Position, to: Position): { state: GameState; diceRoll: { value: number; type: 'd4' | 'd6'; success: boolean } } | null {
    const room = this.games.get(gameId);
    if (!room) return null;

    const state = room.state;
    const aiColor = state.aiColor!;
    const board = state.board;
    const piece = board[from.row][from.col].piece;
    if (!piece) return null;

    const targetPiece = board[to.row][to.col].piece;
    if (!targetPiece) return null;

    const distance = Math.abs(to.row - from.row);
    const roll = Math.floor(Math.random() * 4) + 1;
    const success = distance <= roll;

    const diceRoll = { value: roll, type: 'd4' as const, success };
    state.lastDiceRoll = diceRoll;

    const move: Move = {
      from,
      to,
      piece,
      captured: success ? targetPiece : undefined,
      isArrowAttack: true,
      diceRoll: roll,
      diceRequired: 4,
      success,
      notation: this.getMoveNotation(piece, from, to, success ? targetPiece : undefined, roll, true),
    };
    state.moveHistory.push(move);

    if (success) {
      state.capturedPieces[aiColor].push(targetPiece);
      board[to.row][to.col].piece = null;

      if (targetPiece.type === 'king') {
        state.winner = aiColor;
        state.phase = 'finished';
      }
    }

    state.currentTurn = aiColor === 'white' ? 'black' : 'white';

    this.saveGame(state);
    return { state, diceRoll };
  }

  private executeAIAxeAttack(gameId: string, from: Position, to: Position): { state: GameState; diceRoll: { value: number; type: 'd6'; success: boolean } } | null {
    const room = this.games.get(gameId);
    if (!room) return null;

    const state = room.state;
    const aiColor = state.aiColor!;
    const board = state.board;
    const piece = board[from.row][from.col].piece;
    if (!piece) return null;

    const targetPiece = board[to.row][to.col].piece;
    if (!targetPiece) return null;

    // Knight axe attack: roll d6, need >= knightMinRoll (default 4)
    const roll = Math.floor(Math.random() * 6) + 1;
    const threshold = state.attackSettings?.knightMinRoll ?? 4;
    const success = roll >= threshold;

    const diceRoll = { value: roll, type: 'd6' as const, success };
    state.lastDiceRoll = diceRoll;

    const move: Move = {
      from,
      to,
      piece,
      captured: success ? targetPiece : undefined,
      isAxeAttack: true,
      diceRoll: roll,
      diceRequired: threshold,
      success,
      notation: `${piece.type === 'knight' ? 'N' : ''}🪓${String.fromCharCode(97 + to.col)}${BOARD_SIZE - to.row}(${roll}${success ? '✓' : '✗'})`,
    };
    state.moveHistory.push(move);

    if (success) {
      state.capturedPieces[aiColor].push(targetPiece);
      board[to.row][to.col].piece = null;

      if (targetPiece.type === 'king') {
        state.winner = aiColor;
        state.phase = 'finished';
      }
    }

    state.currentTurn = aiColor === 'white' ? 'black' : 'white';

    this.saveGame(state);
    return { state, diceRoll };
  }

  private executeAIBombAttack(gameId: string, from: Position, to: Position): { state: GameState; diceRoll: { value: number; type: 'd10'; success: boolean } } | null {
    const room = this.games.get(gameId);
    if (!room) return null;

    const state = room.state;
    const aiColor = state.aiColor!;
    const board = state.board;
    const piece = board[from.row][from.col].piece;
    if (!piece) return null;

    // Rook bomb attack: roll d10, need <= bombSuccessRoll (default 1)
    const roll = Math.floor(Math.random() * 10) + 1;
    const threshold = state.attackSettings?.bombSuccessRoll ?? 1;
    const success = roll <= threshold;

    const diceRoll = { value: roll, type: 'd10' as const, success };
    state.lastDiceRoll = diceRoll;

    const move: Move = {
      from,
      to,
      piece,
      isBombAttack: true,
      diceRoll: roll,
      diceRequired: threshold,
      success,
      notation: `R💣${String.fromCharCode(97 + to.col)}${BOARD_SIZE - to.row}(${roll}${success ? '✓' : '✗'})`,
    };
    state.moveHistory.push(move);

    if (success) {
      board[to.row][to.col].isWall = false;
    }

    state.currentTurn = aiColor === 'white' ? 'black' : 'white';

    this.saveGame(state);
    return { state, diceRoll };
  }

  private createInitialBoard(): Board {
    const board: Board = [];
    
    for (let row = 0; row < BOARD_SIZE; row++) {
      const boardRow: Square[] = [];
      for (let col = 0; col < BOARD_SIZE; col++) {
        boardRow.push({
          row,
          col,
          piece: null,
          isWall: false,
        });
      }
      board.push(boardRow);
    }
    
    const offset = 2;
    const blackBackRow = 0;
    const blackPawnRow = 1;
    const whiteBackRow = 11;
    const whitePawnRow = 10;
    
    const backRowPieces: PieceType[] = ['rook', 'knight', 'bishop', 'queen', 'king', 'bishop', 'knight', 'rook'];
    
    for (let i = 0; i < 8; i++) {
      board[blackBackRow][offset + i].piece = { type: backRowPieces[i], color: 'black' };
      board[whiteBackRow][offset + i].piece = { type: backRowPieces[i], color: 'white' };
    }
    
    for (let i = 0; i < 8; i++) {
      board[blackPawnRow][offset + i].piece = { type: 'pawn', color: 'black' };
      board[whitePawnRow][offset + i].piece = { type: 'pawn', color: 'white' };
    }
    
    return board;
  }

  private getValidMoves(board: Board, position: Position): Position[] {
    const square = board[position.row][position.col];
    if (!square.piece) return [];
    
    const piece = square.piece;
    const moves: Position[] = [];
    
    switch (piece.type) {
      case 'king':
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            if (dr === 0 && dc === 0) continue;
            const newRow = position.row + dr;
            const newCol = position.col + dc;
            if (this.isValidPosition(newRow, newCol) && !board[newRow][newCol].isWall) {
              const targetPiece = board[newRow][newCol].piece;
              if (!targetPiece || targetPiece.color !== piece.color) {
                // Check if this move would put the king in check
                const testBoard: Board = JSON.parse(JSON.stringify(board));
                testBoard[newRow][newCol].piece = piece;
                testBoard[position.row][position.col].piece = null;
                if (!this.wouldBeInCheck(testBoard, piece.color, { row: newRow, col: newCol })) {
                  moves.push({ row: newRow, col: newCol });
                }
              }
            }
          }
        }
        // Castling - king moves to end file, rook moves next to it
        if (!piece.hasMoved && !this.isInCheck(board, piece.color)) {
          const row = position.row;
          // Kingside castling (to column 11)
          const kingsideRookCol = 9; // Initial rook position (offset 2 + 7)
          const kingsideRook = board[row][kingsideRookCol]?.piece;
          if (kingsideRook?.type === 'rook' && kingsideRook.color === piece.color && !kingsideRook.hasMoved) {
            let pathClear = true;
            for (let c = position.col + 1; c <= 11; c++) {
              if (c === kingsideRookCol) continue;
              if (board[row][c].piece || board[row][c].isWall) {
                pathClear = false;
                break;
              }
            }
            // Also check that king doesn't pass through check
            if (pathClear) {
              let passesThroughCheck = false;
              for (let c = position.col + 1; c <= 11; c++) {
                const testBoard: Board = JSON.parse(JSON.stringify(board));
                testBoard[row][c].piece = piece;
                testBoard[position.row][position.col].piece = null;
                if (this.wouldBeInCheck(testBoard, piece.color, { row, col: c })) {
                  passesThroughCheck = true;
                  break;
                }
              }
              if (!passesThroughCheck) {
                moves.push({ row, col: 11 });
              }
            }
          }
          // Queenside castling (to column 0)
          const queensideRookCol = 2; // Initial rook position (offset 2 + 0)
          const queensideRook = board[row][queensideRookCol]?.piece;
          if (queensideRook?.type === 'rook' && queensideRook.color === piece.color && !queensideRook.hasMoved) {
            let pathClear = true;
            for (let c = position.col - 1; c >= 0; c--) {
              if (c === queensideRookCol) continue;
              if (board[row][c].piece || board[row][c].isWall) {
                pathClear = false;
                break;
              }
            }
            if (pathClear) {
              let passesThroughCheck = false;
              for (let c = position.col - 1; c >= 0; c--) {
                const testBoard: Board = JSON.parse(JSON.stringify(board));
                testBoard[row][c].piece = piece;
                testBoard[position.row][position.col].piece = null;
                if (this.wouldBeInCheck(testBoard, piece.color, { row, col: c })) {
                  passesThroughCheck = true;
                  break;
                }
              }
              if (!passesThroughCheck) {
                moves.push({ row, col: 0 });
              }
            }
          }
        }
        break;
        
      case 'pawn':
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            if (dr === 0 && dc === 0) continue;
            const newRow = position.row + dr;
            const newCol = position.col + dc;
            if (this.isValidPosition(newRow, newCol) && !board[newRow][newCol].isWall) {
              const targetPiece = board[newRow][newCol].piece;
              if (!targetPiece || targetPiece.color !== piece.color) {
                moves.push({ row: newRow, col: newCol });
              }
            }
          }
        }
        break;
        
      case 'queen':
        moves.push(...this.getSlidingMoves(board, position, piece.color, [
          [-1, 0], [1, 0], [0, -1], [0, 1],
          [-1, -1], [-1, 1], [1, -1], [1, 1],
        ], MAX_MOVE_DISTANCE));
        break;
        
      case 'rook':
        moves.push(...this.getSlidingMoves(board, position, piece.color, [
          [-1, 0], [1, 0], [0, -1], [0, 1],
        ], MAX_MOVE_DISTANCE));
        break;
        
      case 'bishop':
        moves.push(...this.getSlidingMoves(board, position, piece.color, [
          [-1, -1], [-1, 1], [1, -1], [1, 1],
        ], MAX_MOVE_DISTANCE));
        break;
        
      case 'knight':
        // Knight moves in L-shape and CAN leap over walls (traditional chess behavior)
        const knightMoves = [
          [-2, -1], [-2, 1], [-1, -2], [-1, 2],
          [1, -2], [1, 2], [2, -1], [2, 1],
        ];
        for (const [dr, dc] of knightMoves) {
          const newRow = position.row + dr;
          const newCol = position.col + dc;
          if (this.isValidPosition(newRow, newCol) && !board[newRow][newCol].isWall) {
            // Knights can jump over walls - only destination must not be a wall
            const targetPiece = board[newRow][newCol].piece;
            if (!targetPiece || targetPiece.color !== piece.color) {
              moves.push({ row: newRow, col: newCol });
            }
          }
        }
        break;
    }
    
    return moves;
  }

  private getSlidingMoves(
    board: Board,
    position: Position,
    color: PlayerColor,
    directions: number[][],
    maxDistance: number
  ): Position[] {
    const moves: Position[] = [];
    
    for (const [dr, dc] of directions) {
      for (let dist = 1; dist <= maxDistance; dist++) {
        const newRow = position.row + dr * dist;
        const newCol = position.col + dc * dist;
        
        if (!this.isValidPosition(newRow, newCol) || board[newRow][newCol].isWall) break;
        
        const targetPiece = board[newRow][newCol].piece;
        if (!targetPiece) {
          moves.push({ row: newRow, col: newCol });
        } else if (targetPiece.color !== color) {
          moves.push({ row: newRow, col: newCol });
          break;
        } else {
          break;
        }
      }
    }
    
    return moves;
  }

  private isValidPosition(row: number, col: number): boolean {
    return row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE;
  }

  private isInCheck(board: Board, color: PlayerColor): boolean {
    let kingPos: Position | null = null;
    
    for (let row = 0; row < BOARD_SIZE && !kingPos; row++) {
      for (let col = 0; col < BOARD_SIZE && !kingPos; col++) {
        const piece = board[row][col].piece;
        if (piece && piece.type === 'king' && piece.color === color) {
          kingPos = { row, col };
        }
      }
    }
    
    if (!kingPos) return false;
    
    return this.wouldBeInCheck(board, color, kingPos);
  }

  // Check if a king at the given position would be in check
  // This is used to prevent kings from moving into check
  private wouldBeInCheck(board: Board, color: PlayerColor, kingPos: Position): boolean {
    const opponentColor = color === 'white' ? 'black' : 'white';
    
    for (let row = 0; row < BOARD_SIZE; row++) {
      for (let col = 0; col < BOARD_SIZE; col++) {
        const piece = board[row][col].piece;
        if (piece && piece.color === opponentColor) {
          // Get raw attack squares (without recursively checking for check)
          const attacks = this.getRawAttacks(board, { row, col }, piece);
          if (attacks.some(pos => pos.row === kingPos.row && pos.col === kingPos.col)) {
            return true;
          }
          
          // Check bishop arrow attacks (potential future attacks)
          if (piece.type === 'bishop') {
            const arrowTargets = this.getArrowTargets(board, { row, col }, opponentColor);
            if (arrowTargets.some(pos => pos.row === kingPos.row && pos.col === kingPos.col)) {
              return true;
            }
          }
        }
      }
    }
    
    return false;
  }

  // Get attack squares for a piece without check validation (to avoid infinite recursion)
  private getRawAttacks(board: Board, position: Position, piece: Piece): Position[] {
    const attacks: Position[] = [];
    
    switch (piece.type) {
      case 'king':
      case 'pawn':
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            if (dr === 0 && dc === 0) continue;
            const newRow = position.row + dr;
            const newCol = position.col + dc;
            if (this.isValidPosition(newRow, newCol) && !board[newRow][newCol].isWall) {
              const targetPiece = board[newRow][newCol].piece;
              if (!targetPiece || targetPiece.color !== piece.color) {
                attacks.push({ row: newRow, col: newCol });
              }
            }
          }
        }
        break;
        
      case 'queen':
        attacks.push(...this.getSlidingMoves(board, position, piece.color, [
          [-1, 0], [1, 0], [0, -1], [0, 1],
          [-1, -1], [-1, 1], [1, -1], [1, 1],
        ], MAX_MOVE_DISTANCE));
        break;
        
      case 'rook':
        attacks.push(...this.getSlidingMoves(board, position, piece.color, [
          [-1, 0], [1, 0], [0, -1], [0, 1],
        ], MAX_MOVE_DISTANCE));
        break;
        
      case 'bishop':
        attacks.push(...this.getSlidingMoves(board, position, piece.color, [
          [-1, -1], [-1, 1], [1, -1], [1, 1],
        ], MAX_MOVE_DISTANCE));
        break;
        
      case 'knight':
        // Knight moves in L-shape and CAN leap over walls (traditional chess behavior)
        const knightMovesAttack = [
          [-2, -1], [-2, 1], [-1, -2], [-1, 2],
          [1, -2], [1, 2], [2, -1], [2, 1],
        ];
        for (const [dr, dc] of knightMovesAttack) {
          const newRow = position.row + dr;
          const newCol = position.col + dc;
          if (this.isValidPosition(newRow, newCol) && !board[newRow][newCol].isWall) {
            // Knights can jump over walls - only destination must not be a wall
            const targetPiece = board[newRow][newCol].piece;
            if (!targetPiece || targetPiece.color !== piece.color) {
              attacks.push({ row: newRow, col: newCol });
            }
          }
        }
        break;
    }
    
    return attacks;
  }

  private isCheckmate(board: Board, color: PlayerColor): boolean {
    if (!this.isInCheck(board, color)) return false;
    
    for (let row = 0; row < BOARD_SIZE; row++) {
      for (let col = 0; col < BOARD_SIZE; col++) {
        const piece = board[row][col].piece;
        if (piece && piece.color === color) {
          const moves = this.getValidMoves(board, { row, col });
          for (const move of moves) {
            const newBoard = JSON.parse(JSON.stringify(board));
            newBoard[move.row][move.col].piece = piece;
            newBoard[row][col].piece = null;
            
            if (!this.isInCheck(newBoard, color)) {
              return false;
            }
          }
        }
      }
    }
    
    return true;
  }

  private getMoveNotation(piece: Piece, from: Position, to: Position, captured?: Piece, diceRoll?: number, isArrowOrPromotion?: boolean | string): string {
    const pieceSymbol = piece.type === 'pawn' ? '' : piece.type[0].toUpperCase();
    const fromNotation = `${String.fromCharCode(97 + from.col)}${BOARD_SIZE - from.row}`;
    const toNotation = `${String.fromCharCode(97 + to.col)}${BOARD_SIZE - to.row}`;
    const captureSymbol = captured ? 'x' : '';
    const isArrow = isArrowOrPromotion === true;
    const promotionPiece = typeof isArrowOrPromotion === 'string' ? isArrowOrPromotion : undefined;
    const arrowSymbol = isArrow ? '→' : '';
    const dice = diceRoll ? `[${isArrow ? 'd4' : 'd6'}:${diceRoll}]` : '';
    const promotion = promotionPiece ? `=${promotionPiece[0].toUpperCase()}` : '';
    
    return `${pieceSymbol}${fromNotation}${captureSymbol}${arrowSymbol}${toNotation}${dice}${promotion}`;
  }
}

export const gameManager = new GameManager();
