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
  isAxeAttack?: boolean;
  isBombAttack?: boolean;
  isWallBuild?: boolean;
  diceRoll?: number;
  diceRequired?: number;
  success?: boolean;
  notation: string;
  promotionPiece?: PieceType;
}

export type PromotionPieceType = 'queen' | 'rook' | 'bishop' | 'knight';

export type GamePhase = 'waiting' | 'setup' | 'playing' | 'finished';
export type GameMode = 'pvp' | 'pvc' | 'cvc';

export interface AttackSettings {
  pawnSuccessRoll: number;   // Roll this or lower on d6 to succeed (default 1)
  bishopMinRoll: number;     // Roll this or higher on 2d6 for arrow (default: distance)
  knightMinRoll: number;     // Roll this or higher on d6 for axe (default 4)
  bombSuccessRoll: number;   // Roll this or lower on d10 to succeed (default 1 = 10%)
  wallBuildRoll: number;     // Roll this or lower on d10 to build wall (default 5 = 50%)
}

export interface GameState {
  id: string;
  board: Board;
  currentTurn: PlayerColor;
  phase: GamePhase;
  gameMode: GameMode;
  aiColor?: PlayerColor;
  aiControlled?: { white: boolean; black: boolean };
  setupWallsRemaining: { white: number; black: number };
  maxWallsPerPlayer: number;
  moveHistory: Move[];
  capturedPieces: { white: Piece[]; black: Piece[] };
  players: { white: string | null; black: string | null };
  winner: PlayerColor | 'draw' | null;
  lastDiceRoll?: { value: number; type: 'd4' | 'd6' | '2d6' | 'd10'; success: boolean };
  pendingArrowTarget?: Position;
  selectedPiece?: Position;
  attackSettings: AttackSettings;
}

export interface GameMessage {
  type: 'join' | 'setup_wall' | 'setup_random_walls' | 'ready' | 'move' | 'arrow_attack' | 'axe_attack' | 'bomb_attack' | 'wall_attack' | 'state' | 'error' | 'player_joined' | 'player_left' | 'reconnect' | 'needsPromotion' | 'takeover' | 'games_updated' | 'watch_cvc' | 'stop_cvc' | 'pause_cvc' | 'offer_draw' | 'respond_draw' | 'draw_offered' | 'draw_response' | 'handoff' | 'take_control';
  payload: any;
  playerId?: string;
}

export const gameConfigSchema = z.object({
  maxWallsPerPlayer: z.number().min(0).max(32).default(8),
  attackSettings: z.object({
    pawnSuccessRoll: z.number().min(1).max(6).default(1),
    bishopMinRoll: z.number().min(2).max(12).default(0), // 0 means use distance
    knightMinRoll: z.number().min(1).max(6).default(4),
    bombSuccessRoll: z.number().min(1).max(10).default(1), // Roll this or lower on d10
    wallBuildRoll: z.number().min(1).max(10).default(5), // Roll this or lower on d10 (default 50%)
  }).optional(),
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
