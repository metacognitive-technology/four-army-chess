import { randomUUID } from "crypto";
import type { GameState, Board, Square, Piece, Position, PlayerColor, Move, PieceType, GameMessage } from "@shared/schema";
import type { WebSocket } from "ws";

const BOARD_SIZE = 12;
const MAX_MOVE_DISTANCE = 8;

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

  createGame(ws: WebSocket, maxWalls: number): { gameId: string; playerId: string; color: PlayerColor } {
    const gameId = randomUUID().slice(0, 8);
    const playerId = randomUUID();
    
    const state: GameState = {
      id: gameId,
      board: this.createInitialBoard(),
      currentTurn: 'white',
      phase: 'waiting',
      setupWallsRemaining: { white: maxWalls, black: maxWalls },
      maxWallsPerPlayer: maxWalls,
      moveHistory: [],
      capturedPieces: { white: [], black: [] },
      players: { white: playerId, black: null },
      winner: null,
    };
    
    const room: GameRoom = {
      state,
      players: new Map([[playerId, { ws, id: playerId, color: 'white' }]]),
      readyPlayers: new Set(),
    };
    
    this.games.set(gameId, room);
    this.playerToGame.set(playerId, gameId);
    
    return { gameId, playerId, color: 'white' };
  }

  joinGame(ws: WebSocket, gameId: string): { playerId: string; color: PlayerColor } | null {
    const room = this.games.get(gameId);
    if (!room) return null;
    
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
    
    return { playerId, color: 'black' };
  }

  reconnectPlayer(ws: WebSocket, playerId: string, gameId: string): boolean {
    const room = this.games.get(gameId);
    if (!room) return false;
    
    const existingPlayer = room.players.get(playerId);
    if (existingPlayer) {
      existingPlayer.ws = ws;
      return true;
    }
    
    return false;
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
    
    return room.state;
  }

  handleMove(playerId: string, from: Position, to: Position, resign?: boolean): { state: GameState; diceRoll?: { value: number; type: 'd4' | 'd6'; success: boolean } } | null {
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
    
    // Pawn attack requires dice roll
    if (piece.type === 'pawn' && targetPiece) {
      const roll = Math.floor(Math.random() * 6) + 1;
      const success = roll === 1;
      diceRoll = { value: roll, type: 'd6', success };
      room.state.lastDiceRoll = diceRoll;
      
      if (!success) {
        // Failed attack - pawn stays in place, turn passes
        // No move history entry for failed attacks, just swap turns
        room.state.currentTurn = player.color === 'white' ? 'black' : 'white';
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
    room.state.moveHistory.push(move);
    
    // Swap turns
    room.state.currentTurn = player.color === 'white' ? 'black' : 'white';
    
    // Check for checkmate
    if (this.isCheckmate(board, room.state.currentTurn)) {
      room.state.winner = player.color;
      room.state.phase = 'finished';
    }
    
    return { state: room.state, diceRoll };
  }

  handleArrowAttack(playerId: string, from: Position, to: Position): { state: GameState; diceRoll: { value: number; type: 'd4' | 'd6'; success: boolean } } | null {
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
    
    // Verify diagonal alignment
    const rowDiff = to.row - from.row;
    const colDiff = to.col - from.col;
    if (Math.abs(rowDiff) !== Math.abs(colDiff)) return null; // Must be diagonal
    
    const distance = Math.abs(rowDiff);
    if (distance === 0) return null;
    
    // Check path is clear (arrows travel through squares)
    const rowDir = rowDiff > 0 ? 1 : -1;
    const colDir = colDiff > 0 ? 1 : -1;
    
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
    
    // Roll 1d4 for arrow range
    const roll = Math.floor(Math.random() * 4) + 1;
    const success = distance <= roll;
    
    const diceRoll = { value: roll, type: 'd4' as const, success };
    room.state.lastDiceRoll = diceRoll;
    
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
        // Knight moves in L-shape but cannot leap over walls
        const knightMoves = [
          [-2, -1], [-2, 1], [-1, -2], [-1, 2],
          [1, -2], [1, 2], [2, -1], [2, 1],
        ];
        for (const [dr, dc] of knightMoves) {
          const newRow = position.row + dr;
          const newCol = position.col + dc;
          if (this.isValidPosition(newRow, newCol) && !board[newRow][newCol].isWall) {
            // Check intermediate squares for walls - knight cannot leap walls
            // Two possible L-paths exist; if BOTH are blocked by walls, move is invalid
            const rowSign = dr > 0 ? 1 : -1;
            const colSign = dc > 0 ? 1 : -1;
            
            // Path 1: move along row first, Path 2: move along col first
            // Check if both paths are blocked
            const sq1 = board[position.row + rowSign][position.col]; // row-adjacent
            const sq2 = board[position.row][position.col + colSign]; // col-adjacent
            
            // If both adjacent squares toward target have walls, knight cannot leap
            if (sq1.isWall && sq2.isWall) {
              continue; // Both paths blocked
            }
            
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
    
    const opponentColor = color === 'white' ? 'black' : 'white';
    
    for (let row = 0; row < BOARD_SIZE; row++) {
      for (let col = 0; col < BOARD_SIZE; col++) {
        const piece = board[row][col].piece;
        if (piece && piece.color === opponentColor) {
          const attacks = this.getValidMoves(board, { row, col });
          if (attacks.some(pos => pos.row === kingPos!.row && pos.col === kingPos!.col)) {
            return true;
          }
        }
      }
    }
    
    return false;
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

  private getMoveNotation(piece: Piece, from: Position, to: Position, captured?: Piece, diceRoll?: number, isArrow?: boolean): string {
    const pieceSymbol = piece.type === 'pawn' ? '' : piece.type[0].toUpperCase();
    const fromNotation = `${String.fromCharCode(97 + from.col)}${BOARD_SIZE - from.row}`;
    const toNotation = `${String.fromCharCode(97 + to.col)}${BOARD_SIZE - to.row}`;
    const captureSymbol = captured ? 'x' : '';
    const arrowSymbol = isArrow ? '→' : '';
    const dice = diceRoll ? `[${isArrow ? 'd4' : 'd6'}:${diceRoll}]` : '';
    
    return `${pieceSymbol}${fromNotation}${captureSymbol}${arrowSymbol}${toNotation}${dice}`;
  }
}

export const gameManager = new GameManager();
