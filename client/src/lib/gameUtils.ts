import type { Board, Square, Piece, Position, PlayerColor, PieceType, Move, GameState } from "@shared/schema";

export const BOARD_SIZE = 12;
export const MAX_MOVE_DISTANCE = 8;

// Standard chess Unicode symbols - outline for white, filled for black
// Using variation selector-15 (U+FE0E) to force text rendering instead of emoji
export const PIECE_SYMBOLS: Record<PieceType, Record<string, string>> = {
  king: { white: '♔\uFE0E', black: '♚\uFE0E', red: '♚\uFE0E', blue: '♚\uFE0E' },
  queen: { white: '♛\uFE0E', black: '♛\uFE0E', red: '♛\uFE0E', blue: '♛\uFE0E' },
  rook: { white: '♜\uFE0E', black: '♜\uFE0E', red: '♜\uFE0E', blue: '♜\uFE0E' },
  bishop: { white: '♗\uFE0E', black: '♝\uFE0E', red: '♝\uFE0E', blue: '♝\uFE0E' },
  knight: { white: '♞\uFE0E', black: '♞\uFE0E', red: '♞\uFE0E', blue: '♞\uFE0E' },
  pawn: { white: '♟\uFE0E', black: '♟\uFE0E', red: '♟\uFE0E', blue: '♟\uFE0E' },
};

export function isPrePlacedWall(r: number, c: number): boolean {
  const N = BOARD_SIZE - 1;
  // 4 diagonal corner walls: main diagonal and anti-diagonal at the 4 corners (depth 4)
  return (r === c || r + c === N) && (r <= 3 || r >= N - 3);
}

export function isInPlayerTerritory(r: number, c: number, color: PlayerColor): boolean {
  const N = BOARD_SIZE - 1;
  switch (color) {
    case 'white': return r > c && r > (N - c);
    case 'black': return r < c && r < (N - c);
    case 'red':   return c < r && c < (N - r);
    case 'blue':  return c > r && c > (N - r);
    default: return false;
  }
}

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

  // Pre-place walls: triangular staircase corners + center 4×4 block
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (isPrePlacedWall(r, c)) board[r][c].isWall = true;
    }
  }

  // White pieces — bottom center (cols 4-7 = e-h, rows 9-11)
  // Row 11 (back): Rook, King, Queen, Rook
  const whiteBackRow: PieceType[] = ['rook', 'king', 'queen', 'rook'];
  const whiteMidRow: PieceType[] = ['knight', 'bishop', 'bishop', 'knight'];
  for (let i = 0; i < 4; i++) {
    board[11][4 + i].piece = { type: whiteBackRow[i], color: 'white', id: `w_${whiteBackRow[i]}_${i}` };
    board[10][4 + i].piece = { type: whiteMidRow[i], color: 'white', id: `w_${whiteMidRow[i]}_${i}` };
    board[9][4 + i].piece = { type: 'pawn', color: 'white', id: `w_pawn_${i}` };
  }

  // Black pieces — top center (cols 4-7 = e-h, rows 0-2)
  // Row 0 (back): Rook, Queen, King, Rook
  const blackBackRow: PieceType[] = ['rook', 'queen', 'king', 'rook'];
  const blackMidRow: PieceType[] = ['knight', 'bishop', 'bishop', 'knight'];
  for (let i = 0; i < 4; i++) {
    board[0][4 + i].piece = { type: blackBackRow[i], color: 'black', id: `b_${blackBackRow[i]}_${i}` };
    board[1][4 + i].piece = { type: blackMidRow[i], color: 'black', id: `b_${blackMidRow[i]}_${i}` };
    board[2][4 + i].piece = { type: 'pawn', color: 'black', id: `b_pawn_${i}` };
  }

  // Red pieces — left side (cols 0-2, rows 4-7)
  // Col 0 = Rook/Queen/King/Rook, Col 1 = Knight/Bishop/Bishop/Knight, Col 2 = Pawns
  const redColA: PieceType[] = ['rook', 'queen', 'king', 'rook'];   // rows 4,5,6,7
  const redColB: PieceType[] = ['knight', 'bishop', 'bishop', 'knight'];
  for (let i = 0; i < 4; i++) {
    const r = 4 + i;
    board[r][0].piece = { type: redColA[i], color: 'red', id: `r_${redColA[i]}_${i}` };
    board[r][1].piece = { type: redColB[i], color: 'red', id: `r_${redColB[i]}_${i}` };
    board[r][2].piece = { type: 'pawn', color: 'red', id: `r_pawn_${i}` };
  }

  // Blue pieces — right side (cols 9-11, rows 4-7)
  // Col 11 = Rook/King/Queen/Rook, Col 10 = Knight/Bishop/Bishop/Knight, Col 9 = Pawns
  const blueColL: PieceType[] = ['rook', 'king', 'queen', 'rook'];  // rows 4,5,6,7
  const blueColK: PieceType[] = ['knight', 'bishop', 'bishop', 'knight'];
  for (let i = 0; i < 4; i++) {
    const r = 4 + i;
    board[r][11].piece = { type: blueColL[i], color: 'blue', id: `bl_${blueColL[i]}_${i}` };
    board[r][10].piece = { type: blueColK[i], color: 'blue', id: `bl_${blueColK[i]}_${i}` };
    board[r][9].piece = { type: 'pawn', color: 'blue', id: `bl_pawn_${i}` };
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
      // King moves 1 square in any direction
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
      // Castling - king moves to end file, rook moves next to it
      if (!piece.hasMoved) {
        const row = position.row;
        // Kingside castling (to column 11)
        const kingsideRookCol = 7; // Initial rook position (offset 4 + 3)
        const kingsideRook = board[row][kingsideRookCol]?.piece;
        if (kingsideRook?.type === 'rook' && kingsideRook.color === piece.color && !kingsideRook.hasMoved) {
          // Check path is clear from king to end (columns 7 to 11)
          let pathClear = true;
          for (let c = position.col + 1; c <= 11; c++) {
            if (c === kingsideRookCol) continue; // Skip the rook's position
            if (board[row][c].piece || board[row][c].isWall) {
              pathClear = false;
              break;
            }
          }
          if (pathClear) {
            moves.push({ row, col: 11 }); // King to end file
          }
        }
        // Queenside castling (to column 0)
        const queensideRookCol = 4; // Initial rook position (offset 4 + 0)
        const queensideRook = board[row][queensideRookCol]?.piece;
        if (queensideRook?.type === 'rook' && queensideRook.color === piece.color && !queensideRook.hasMoved) {
          // Check path is clear from king to column 0 (columns 5 to 0)
          let pathClear = true;
          for (let c = position.col - 1; c >= 0; c--) {
            if (c === queensideRookCol) continue; // Skip the rook's position
            if (board[row][c].piece || board[row][c].isWall) {
              pathClear = false;
              break;
            }
          }
          if (pathClear) {
            moves.push({ row, col: 0 }); // King to end file
          }
        }
      }
      break;
      
    case 'pawn':
      // Pawns move 1 square in any direction
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
      // Knight moves in L-shape and CAN leap over walls (traditional chess behavior)
      const knightMoves = [
        [-2, -1], [-2, 1], [-1, -2], [-1, 2],
        [1, -2], [1, 2], [2, -1], [2, 1],
      ];
      for (const [dr, dc] of knightMoves) {
        const newRow = position.row + dr;
        const newCol = position.col + dc;
        if (isValidPosition(newRow, newCol) && !board[newRow][newCol].isWall) {
          // Knights can jump over walls - only destination must not be a wall
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

export function getAxeTargets(board: Board, position: Position): Position[] {
  const square = board[position.row][position.col];
  if (!square.piece || square.piece.type !== 'knight') return [];
  
  const targets: Position[] = [];
  // Knight axe attack can hit 1 square in any direction (like a king)
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const newRow = position.row + dr;
      const newCol = position.col + dc;
      if (isValidPosition(newRow, newCol) && !board[newRow][newCol].isWall) {
        const targetPiece = board[newRow][newCol].piece;
        if (targetPiece && targetPiece.color !== square.piece.color) {
          targets.push({ row: newRow, col: newCol });
        }
      }
    }
  }
  
  return targets;
}

export function getBombTargets(board: Board, position: Position): Position[] {
  const square = board[position.row][position.col];
  if (!square.piece || square.piece.type !== 'rook') return [];
  
  const targets: Position[] = [];
  // Rook bomb attack can target adjacent wall squares
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const newRow = position.row + dr;
      const newCol = position.col + dc;
      if (isValidPosition(newRow, newCol) && board[newRow][newCol].isWall) {
        targets.push({ row: newRow, col: newCol });
      }
    }
  }
  
  return targets;
}

export function getWallBuildTargets(board: Board, position: Position): Position[] {
  const square = board[position.row][position.col];
  if (!square.piece || square.piece.type !== 'rook') return [];
  
  const targets: Position[] = [];
  // Rook wall build can target adjacent empty squares (no piece, no wall)
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const newRow = position.row + dr;
      const newCol = position.col + dc;
      if (isValidPosition(newRow, newCol) && !board[newRow][newCol].isWall && !board[newRow][newCol].piece) {
        targets.push({ row: newRow, col: newCol });
      }
    }
  }
  
  return targets;
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
        // Check regular attacks
        const attacks = getValidMoves(board, { row, col }, true);
        if (attacks.some(pos => pos.row === kingPos!.row && pos.col === kingPos!.col)) {
          return true;
        }
        
        // Check bishop arrow attacks (potential future attacks)
        if (piece.type === 'bishop') {
          const arrowTargets = getArrowTargets(board, { row, col });
          if (arrowTargets.some(pos => pos.row === kingPos!.row && pos.col === kingPos!.col)) {
            return true;
          }
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

// Get valid moves that escape or block check
// When in check, only returns moves that result in no longer being in check
export function getCheckSafeMoves(board: Board, position: Position): Position[] {
  const piece = board[position.row][position.col].piece;
  if (!piece) return [];
  
  const allMoves = getValidMoves(board, position, true);
  const inCheck = isInCheck(board, piece.color);
  
  // If not in check, return all moves (but still filter moves that would put king in check)
  // For now, just filter moves that would leave/put king in check
  return allMoves.filter(move => {
    const newBoard: Board = JSON.parse(JSON.stringify(board));
    newBoard[move.row][move.col].piece = piece;
    newBoard[position.row][position.col].piece = null;
    return !isInCheck(newBoard, piece.color);
  });
}
