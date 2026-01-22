import { sql } from "drizzle-orm";
import { pgTable, text, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// Game Types
export type PieceType = 'king' | 'queen' | 'rook' | 'bishop' | 'knight' | 'pawn';
export type PlayerColor = 'white' | 'black';

export interface Piece {
  type: PieceType;
  color: PlayerColor;
  hasMoved?: boolean;
}

export interface Square {
  row: number;
  col: number;
  piece: Piece | null;
  isWall: boolean;
}

export type Board = Square[][];

export interface Position {
  row: number;
  col: number;
}

export interface Move {
  from: Position;
  to: Position;
  piece: Piece;
  captured?: Piece;
  isArrowAttack?: boolean;
  diceRoll?: number;
  diceRequired?: number;
  success?: boolean;
  notation: string;
  promotionPiece?: PieceType;
}

export type PromotionPieceType = 'queen' | 'rook' | 'bishop' | 'knight';

export type GamePhase = 'waiting' | 'setup' | 'playing' | 'finished';
export type GameMode = 'pvp' | 'pvc' | 'cvc';

export interface GameState {
  id: string;
  board: Board;
  currentTurn: PlayerColor;
  phase: GamePhase;
  gameMode: GameMode;
  aiColor?: PlayerColor;
  setupWallsRemaining: { white: number; black: number };
  maxWallsPerPlayer: number;
  moveHistory: Move[];
  capturedPieces: { white: Piece[]; black: Piece[] };
  players: { white: string | null; black: string | null };
  winner: PlayerColor | 'draw' | null;
  lastDiceRoll?: { value: number; type: 'd4' | 'd6' | '2d6'; success: boolean };
  pendingArrowTarget?: Position;
  selectedPiece?: Position;
}

export interface GameMessage {
  type: 'join' | 'setup_wall' | 'ready' | 'move' | 'arrow_attack' | 'axe_attack' | 'state' | 'error' | 'player_joined' | 'player_left' | 'reconnect' | 'needsPromotion' | 'takeover' | 'games_updated' | 'watch_cvc';
  payload: any;
  playerId?: string;
}

export const gameConfigSchema = z.object({
  maxWallsPerPlayer: z.number().min(0).max(32).default(8),
});

export type GameConfig = z.infer<typeof gameConfigSchema>;

export interface SavedGameInfo {
  id: string;
  phase: GamePhase;
  currentTurn: PlayerColor;
  moveCount: number;
  whitePlayer: string | null;
  blackPlayer: string | null;
  winner: PlayerColor | 'draw' | null;
  updatedAt: string;
  gameMode?: GameMode;
}
