import type { Board, Square, Piece, Position, PlayerColor, PieceType, Move, GameState } from "@shared/schema";

export const BOARD_SIZE = 12;
export const MAX_MOVE_DISTANCE = 8;

// Standard chess Unicode symbols - outline for white, filled for black
export const PIECE_SYMBOLS: Record<PieceType, { white: string; black: string }> = {
  king: { white: '♔', black: '♚' },
  queen: { white: '♕', black: '♛' },
  rook: { white: '♖', black: '♜' },
  bishop: { white: '♗', black: '♝' },
  knight: { white: '♘', black: '♞' },
  pawn: { white: '♙', black: '♟' },
};

export function createInitialBoard(): Board {
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
  
  // Place pieces centered on the 12x12 board
  // Traditional layout offset by 2 columns to center
  const offset = 2;
  
  // Black pieces (rows 0-1, centered)
  const blackBackRow = 0;
  const blackPawnRow = 1;
  
  // White pieces (rows 10-11, centered)
  const whiteBackRow = 11;
  const whitePawnRow = 10;
  
  // Back row piece order
  const backRowPieces: PieceType[] = ['rook', 'knight', 'bishop', 'queen', 'king', 'bishop', 'knight', 'rook'];
  
  // Place back row pieces
  for (let i = 0; i < 8; i++) {
    board[blackBackRow][offset + i].piece = { type: backRowPieces[i], color: 'black' };
    board[whiteBackRow][offset + i].piece = { type: backRowPieces[i], color: 'white' };
  }
  
  // Place pawns
  for (let i = 0; i < 8; i++) {
    board[blackPawnRow][offset + i].piece = { type: 'pawn', color: 'black' };
    board[whitePawnRow][offset + i].piece = { type: 'pawn', color: 'white' };
  }
  
  return board;
}

export function getValidMoves(board: Board, position: Position, includeAttacks: boolean = true): Position[] {
  const square = board[position.row][position.col];
  if (!square.piece) return [];
  
  const piece = square.piece;
  const moves: Position[] = [];
  
  switch (piece.type) {
    case 'king':
    case 'pawn':
      // King and pawns move 1 square in any direction
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          const newRow = position.row + dr;
          const newCol = position.col + dc;
          if (isValidPosition(newRow, newCol) && !board[newRow][newCol].isWall) {
            const targetPiece = board[newRow][newCol].piece;
            if (!targetPiece || (includeAttacks && targetPiece.color !== piece.color)) {
              moves.push({ row: newRow, col: newCol });
            }
          }
        }
      }
      break;
      
    case 'queen':
      // Queen moves like rook + bishop, limited to 8 squares
      moves.push(...getSlidingMoves(board, position, piece.color, [
        [-1, 0], [1, 0], [0, -1], [0, 1], // Rook directions
        [-1, -1], [-1, 1], [1, -1], [1, 1], // Bishop directions
      ], MAX_MOVE_DISTANCE, includeAttacks));
      break;
      
    case 'rook':
      // Rook moves horizontally/vertically, limited to 8 squares
      moves.push(...getSlidingMoves(board, position, piece.color, [
        [-1, 0], [1, 0], [0, -1], [0, 1],
      ], MAX_MOVE_DISTANCE, includeAttacks));
      break;
      
    case 'bishop':
      // Bishop moves diagonally, limited to 8 squares
      moves.push(...getSlidingMoves(board, position, piece.color, [
        [-1, -1], [-1, 1], [1, -1], [1, 1],
      ], MAX_MOVE_DISTANCE, includeAttacks));
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
        if (isValidPosition(newRow, newCol) && !board[newRow][newCol].isWall) {
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
          if (!targetPiece || (includeAttacks && targetPiece.color !== piece.color)) {
            moves.push({ row: newRow, col: newCol });
          }
        }
      }
      break;
  }
  
  return moves;
}

function getSlidingMoves(
  board: Board,
  position: Position,
  color: PlayerColor,
  directions: number[][],
  maxDistance: number,
  includeAttacks: boolean
): Position[] {
  const moves: Position[] = [];
  
  for (const [dr, dc] of directions) {
    for (let dist = 1; dist <= maxDistance; dist++) {
      const newRow = position.row + dr * dist;
      const newCol = position.col + dc * dist;
      
      if (!isValidPosition(newRow, newCol) || board[newRow][newCol].isWall) break;
      
      const targetPiece = board[newRow][newCol].piece;
      if (!targetPiece) {
        moves.push({ row: newRow, col: newCol });
      } else if (includeAttacks && targetPiece.color !== color) {
        moves.push({ row: newRow, col: newCol });
        break;
      } else {
        break;
      }
    }
  }
  
  return moves;
}

export function getArrowTargets(board: Board, position: Position): Position[] {
  const square = board[position.row][position.col];
  if (!square.piece || square.piece.type !== 'bishop') return [];
  
  const targets: Position[] = [];
  // Arrows can be shot in any direction (8 directions like a queen)
  const directions = [
    [-1, 0], [1, 0], [0, -1], [0, 1],  // Cardinal
    [-1, -1], [-1, 1], [1, -1], [1, 1]  // Diagonal
  ];
  
  // Arrow can hit up to 12 squares away (2d6 roll: need to roll >= distance to hit)
  for (const [dr, dc] of directions) {
    for (let dist = 1; dist <= 12; dist++) {
      const newRow = position.row + dr * dist;
      const newCol = position.col + dc * dist;
      
      if (!isValidPosition(newRow, newCol) || board[newRow][newCol].isWall) break;
      
      const targetPiece = board[newRow][newCol].piece;
      if (targetPiece && targetPiece.color !== square.piece.color) {
        // Knights and rooks are immune to arrows
        if (targetPiece.type !== 'knight' && targetPiece.type !== 'rook') {
          targets.push({ row: newRow, col: newCol });
        }
        break; // Arrow is blocked by any piece
      } else if (targetPiece) {
        break; // Blocked by friendly piece
      }
    }
  }
  
  return targets;
}

export function isValidPosition(row: number, col: number): boolean {
  return row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE;
}

export function positionToNotation(pos: Position): string {
  const file = String.fromCharCode(97 + pos.col); // a-p
  const rank = BOARD_SIZE - pos.row;
  return `${file}${rank}`;
}

export function getMoveNotation(move: Move): string {
  const pieceSymbol = move.piece.type === 'pawn' ? '' : move.piece.type[0].toUpperCase();
  const from = positionToNotation(move.from);
  const to = positionToNotation(move.to);
  const capture = move.captured ? 'x' : '';
  const arrow = move.isArrowAttack ? '→' : '';
  const dice = move.diceRoll ? `[${move.diceRequired === 6 ? 'd6' : 'd4'}:${move.diceRoll}]` : '';
  
  return `${pieceSymbol}${from}${capture}${arrow}${to}${dice}`;
}

export function findHangingPieces(board: Board, color: PlayerColor): Position[] {
  const hanging: Position[] = [];
  const opponentColor = color === 'white' ? 'black' : 'white';
  
  // Get all squares that opponent can attack
  const attackedSquares = new Set<string>();
  
  for (let row = 0; row < BOARD_SIZE; row++) {
    for (let col = 0; col < BOARD_SIZE; col++) {
      const piece = board[row][col].piece;
      if (piece && piece.color === opponentColor) {
        const attacks = getValidMoves(board, { row, col }, true);
        attacks.forEach(pos => {
          const target = board[pos.row][pos.col].piece;
          if (target && target.color === color) {
            attackedSquares.add(`${pos.row},${pos.col}`);
          }
        });
      }
    }
  }
  
  // Check if attacked pieces are defended
  Array.from(attackedSquares).forEach(key => {
    const [row, col] = key.split(',').map(Number);
    const pos = { row, col };
    
    let isDefended = false;
    for (let r = 0; r < BOARD_SIZE && !isDefended; r++) {
      for (let c = 0; c < BOARD_SIZE && !isDefended; c++) {
        const piece = board[r][c].piece;
        if (piece && piece.color === color && (r !== row || c !== col)) {
          const defenses = getValidMoves(board, { row: r, col: c }, true);
          if (defenses.some(d => d.row === row && d.col === col)) {
            isDefended = true;
          }
        }
      }
    }
    
    if (!isDefended) {
      hanging.push(pos);
    }
  });
  
  return hanging;
}

export function rollDice(sides: 4 | 6): number {
  return Math.floor(Math.random() * sides) + 1;
}

export function calculateScore(capturedPieces: Piece[]): number {
  const values: Record<PieceType, number> = {
    pawn: 1,
    knight: 3,
    bishop: 3,
    rook: 5,
    queen: 9,
    king: 0,
  };
  
  return capturedPieces.reduce((sum, piece) => sum + values[piece.type], 0);
}

export function isInCheck(board: Board, color: PlayerColor): boolean {
  // Find king position
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
        const attacks = getValidMoves(board, { row, col }, true);
        if (attacks.some(pos => pos.row === kingPos!.row && pos.col === kingPos!.col)) {
          return true;
        }
      }
    }
  }
  
  return false;
}

export function isCheckmate(board: Board, color: PlayerColor): boolean {
  if (!isInCheck(board, color)) return false;
  
  // Check if any move can get out of check
  for (let row = 0; row < BOARD_SIZE; row++) {
    for (let col = 0; col < BOARD_SIZE; col++) {
      const piece = board[row][col].piece;
      if (piece && piece.color === color) {
        const moves = getValidMoves(board, { row, col }, true);
        for (const move of moves) {
          // Simulate move
          const newBoard = JSON.parse(JSON.stringify(board));
          newBoard[move.row][move.col].piece = piece;
          newBoard[row][col].piece = null;
          
          if (!isInCheck(newBoard, color)) {
            return false;
          }
        }
      }
    }
  }
  
  return true;
}
