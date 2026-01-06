import { useState, useCallback } from "react";
import type { Board, Position, PlayerColor, PieceType } from "@shared/schema";
import { PIECE_SYMBOLS, BOARD_SIZE, getValidMoves, getArrowTargets, findHangingPieces } from "@/lib/gameUtils";
import { cn } from "@/lib/utils";
import { Target } from "lucide-react";
import { Button } from "@/components/ui/button";

interface GameBoardProps {
  board: Board;
  currentTurn: PlayerColor;
  playerColor: PlayerColor | null;
  phase: 'waiting' | 'setup' | 'playing' | 'finished';
  selectedPosition: Position | null;
  validMoves: Position[];
  arrowTargets: Position[];
  hangingPieces: Position[];
  isArrowMode: boolean;
  onSquareClick: (position: Position) => void;
  onArrowModeToggle: (position: Position) => void;
  setupWallsRemaining: number;
}

export function GameBoard({
  board,
  currentTurn,
  playerColor,
  phase,
  selectedPosition,
  validMoves,
  arrowTargets,
  hangingPieces,
  isArrowMode,
  onSquareClick,
  onArrowModeToggle,
  setupWallsRemaining,
}: GameBoardProps) {
  const isMyTurn = playerColor === currentTurn;
  
  const isValidMove = useCallback((row: number, col: number) => {
    return validMoves.some(m => m.row === row && m.col === col);
  }, [validMoves]);
  
  const isArrowTarget = useCallback((row: number, col: number) => {
    return arrowTargets.some(t => t.row === row && t.col === col);
  }, [arrowTargets]);
  
  const isHanging = useCallback((row: number, col: number) => {
    return hangingPieces.some(h => h.row === row && h.col === col);
  }, [hangingPieces]);
  
  const isSelected = useCallback((row: number, col: number) => {
    return selectedPosition?.row === row && selectedPosition?.col === col;
  }, [selectedPosition]);

  const canInteract = (row: number, col: number) => {
    if (phase === 'setup') {
      // In setup, can only click on own half
      if (playerColor === 'white') {
        return row >= BOARD_SIZE / 2;
      } else {
        return row < BOARD_SIZE / 2;
      }
    }
    return phase === 'playing' && isMyTurn;
  };

  return (
    <div className="relative">
      <div 
        className="grid gap-0 border-2 border-foreground/20 rounded-md overflow-hidden shadow-lg"
        style={{ 
          gridTemplateColumns: `repeat(${BOARD_SIZE}, minmax(0, 1fr))`,
          aspectRatio: '1 / 1',
          maxWidth: 'min(70vw, 70vh)',
          maxHeight: 'min(70vw, 70vh)',
        }}
        data-testid="game-board"
      >
        {board.map((row, rowIndex) =>
          row.map((square, colIndex) => {
            const isDark = (rowIndex + colIndex) % 2 === 1;
            const piece = square.piece;
            const canClick = canInteract(rowIndex, colIndex);
            const showValidMove = isValidMove(rowIndex, colIndex);
            const showArrowTarget = isArrowTarget(rowIndex, colIndex);
            const showHanging = isHanging(rowIndex, colIndex) && piece?.color === playerColor;
            const showSelected = isSelected(rowIndex, colIndex);
            const isBishop = piece?.type === 'bishop' && piece?.color === playerColor && phase === 'playing' && isMyTurn;
            
            return (
              <div
                key={`${rowIndex}-${colIndex}`}
                className={cn(
                  "relative flex items-center justify-center cursor-pointer transition-all duration-150",
                  square.isWall 
                    ? "bg-slate-500 dark:bg-slate-600" 
                    : isDark 
                      ? "bg-emerald-700 dark:bg-emerald-800" 
                      : "bg-amber-100 dark:bg-amber-200",
                  showSelected && "ring-2 ring-inset ring-blue-500 shadow-inner",
                  showValidMove && !square.piece && "after:absolute after:w-1/3 after:h-1/3 after:rounded-full after:bg-black/20",
                  showValidMove && square.piece && "ring-2 ring-inset ring-red-500",
                  showArrowTarget && "ring-2 ring-inset ring-orange-500 bg-orange-400/30",
                  showHanging && "ring-2 ring-inset ring-yellow-400",
                  canClick && "hover:brightness-110",
                  phase === 'setup' && canClick && !square.isWall && "hover:bg-slate-400",
                )}
                onClick={() => onSquareClick({ row: rowIndex, col: colIndex })}
                data-testid={`square-${rowIndex}-${colIndex}`}
              >
                {piece && (
                  <span 
                    className={cn(
                      "text-[clamp(1rem,4vw,2.5rem)] select-none transition-transform duration-200",
                      piece.color === 'white' ? "text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]" : "text-gray-900 drop-shadow-[0_1px_1px_rgba(255,255,255,0.3)]",
                      showSelected && "scale-110",
                    )}
                  >
                    {PIECE_SYMBOLS[piece.type][piece.color]}
                  </span>
                )}
                
                {isBishop && showSelected && !isArrowMode && (
                  <Button
                    size="icon"
                    variant="secondary"
                    className="absolute -top-1 -right-1 w-5 h-5 z-10 p-0"
                    onClick={(e) => {
                      e.stopPropagation();
                      onArrowModeToggle({ row: rowIndex, col: colIndex });
                    }}
                    data-testid={`arrow-button-${rowIndex}-${colIndex}`}
                  >
                    <Target className="w-3 h-3" />
                  </Button>
                )}
                
                {/* Row/Column labels */}
                {colIndex === 0 && (
                  <span className="absolute left-0.5 top-0.5 text-[clamp(0.5rem,1vw,0.75rem)] opacity-60 font-mono">
                    {BOARD_SIZE - rowIndex}
                  </span>
                )}
                {rowIndex === BOARD_SIZE - 1 && (
                  <span className="absolute right-0.5 bottom-0.5 text-[clamp(0.5rem,1vw,0.75rem)] opacity-60 font-mono">
                    {String.fromCharCode(97 + colIndex)}
                  </span>
                )}
              </div>
            );
          })
        )}
      </div>
      
      {phase === 'setup' && (
        <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-card px-3 py-1 rounded-md text-sm font-medium">
          Walls remaining: {setupWallsRemaining}
        </div>
      )}
    </div>
  );
}
