import { useState, useCallback, useEffect } from "react";
import type { Board, Position, PlayerColor, PieceType } from "@shared/schema";
import { PIECE_SYMBOLS, BOARD_SIZE, getValidMoves, getArrowTargets, findHangingPieces } from "@/lib/gameUtils";
import { cn } from "@/lib/utils";
import { Target, ZoomIn, ZoomOut, RotateCcw, Axe, Bomb } from "lucide-react";
import { Button } from "@/components/ui/button";

export type AttackAnimationType = 'arrow' | 'axe' | 'bomb' | 'pawn';

export interface AttackAnimation {
  type: AttackAnimationType;
  from: Position;
  to: Position;
  success: boolean;
}

interface GameBoardProps {
  board: Board;
  currentTurn: PlayerColor;
  playerColor: PlayerColor | null;
  phase: 'waiting' | 'setup' | 'playing' | 'finished';
  selectedPosition: Position | null;
  validMoves: Position[];
  arrowTargets: Position[];
  axeTargets: Position[];
  bombTargets: Position[];
  hangingPieces: Position[];
  isArrowMode: boolean;
  isAxeMode: boolean;
  isBombMode: boolean;
  onSquareClick: (position: Position) => void;
  onArrowModeToggle: (position: Position) => void;
  onAxeModeToggle: (position: Position) => void;
  onBombModeToggle: (position: Position) => void;
  setupWallsRemaining: number;
  flashingSquare: Position | null;
  flashColor?: 'red' | 'yellow';
  attackAnimation?: AttackAnimation | null;
}

export function GameBoard({
  board,
  currentTurn,
  playerColor,
  phase,
  selectedPosition,
  validMoves,
  arrowTargets,
  axeTargets,
  bombTargets,
  hangingPieces,
  isArrowMode,
  isAxeMode,
  isBombMode,
  onSquareClick,
  onArrowModeToggle,
  onAxeModeToggle,
  onBombModeToggle,
  setupWallsRemaining,
  flashingSquare,
  flashColor = 'red',
  attackAnimation,
}: GameBoardProps) {
  const isMyTurn = playerColor === currentTurn;
  const [zoom, setZoom] = useState(1);
  
  const handleZoomIn = () => setZoom(prev => Math.min(prev + 0.2, 2));
  const handleZoomOut = () => setZoom(prev => Math.max(prev - 0.2, 0.6));
  const handleZoomReset = () => setZoom(1);
  
  const isValidMove = useCallback((row: number, col: number) => {
    return validMoves.some(m => m.row === row && m.col === col);
  }, [validMoves]);
  
  const isArrowTarget = useCallback((row: number, col: number) => {
    return arrowTargets.some(t => t.row === row && t.col === col);
  }, [arrowTargets]);
  
  const isAxeTarget = useCallback((row: number, col: number) => {
    return axeTargets.some(t => t.row === row && t.col === col);
  }, [axeTargets]);
  
  const isBombTarget = useCallback((row: number, col: number) => {
    return bombTargets.some(t => t.row === row && t.col === col);
  }, [bombTargets]);
  
  const isHanging = useCallback((row: number, col: number) => {
    return hangingPieces.some(h => h.row === row && h.col === col);
  }, [hangingPieces]);
  
  const isSelected = useCallback((row: number, col: number) => {
    return selectedPosition?.row === row && selectedPosition?.col === col;
  }, [selectedPosition]);
  
  const isFlashing = useCallback((row: number, col: number) => {
    return flashingSquare?.row === row && flashingSquare?.col === col;
  }, [flashingSquare]);

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
    <div className="relative flex flex-col items-center gap-2">
      {/* Zoom controls */}
      <div className="flex items-center gap-1">
        <Button
          size="icon"
          variant="outline"
          onClick={handleZoomOut}
          disabled={zoom <= 0.6}
          data-testid="button-zoom-out"
          className="h-8 w-8"
        >
          <ZoomOut className="w-4 h-4" />
        </Button>
        <span className="text-xs text-muted-foreground w-12 text-center">
          {Math.round(zoom * 100)}%
        </span>
        <Button
          size="icon"
          variant="outline"
          onClick={handleZoomIn}
          disabled={zoom >= 2}
          data-testid="button-zoom-in"
          className="h-8 w-8"
        >
          <ZoomIn className="w-4 h-4" />
        </Button>
        {zoom !== 1 && (
          <Button
            size="icon"
            variant="ghost"
            onClick={handleZoomReset}
            data-testid="button-zoom-reset"
            className="h-8 w-8"
          >
            <RotateCcw className="w-4 h-4" />
          </Button>
        )}
      </div>
      
      {/* Board container with scroll when zoomed */}
      <div 
        className="overflow-scroll max-h-[calc(100vh-300px)]"
        style={{ 
          maxWidth: 'min(90vw, 560px)',
        }}
      >
        <div 
          className="grid gap-0 border-2 border-foreground/20 rounded-md overflow-hidden shadow-lg"
          style={{ 
            gridTemplateColumns: `repeat(${BOARD_SIZE}, minmax(0, 1fr))`,
            aspectRatio: '1 / 1',
            width: 'min(90vw, calc(100vh - 280px), 560px)',
            maxWidth: '100%',
            transform: `scale(${zoom})`,
            transformOrigin: 'top left',
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
            const showFlashing = isFlashing(rowIndex, colIndex);
            const isBishop = piece?.type === 'bishop' && piece?.color === playerColor && phase === 'playing' && isMyTurn;
            const isKnight = piece?.type === 'knight' && piece?.color === playerColor && phase === 'playing' && isMyTurn;
            const isRook = piece?.type === 'rook' && piece?.color === playerColor && phase === 'playing' && isMyTurn;
            const showAxeTarget = isAxeTarget(rowIndex, colIndex);
            const showBombTarget = isBombTarget(rowIndex, colIndex);
            
            // During setup, only show walls on player's own half
            const isOwnHalf = playerColor === 'white' 
              ? rowIndex >= BOARD_SIZE / 2 
              : rowIndex < BOARD_SIZE / 2;
            const showWall = square.isWall && (phase !== 'setup' || isOwnHalf);
            
            return (
              <div
                key={`${rowIndex}-${colIndex}`}
                className={cn(
                  "relative flex items-center justify-center cursor-pointer aspect-square",
                  !showWall && (isDark 
                      ? "bg-green-500 dark:bg-green-600" 
                      : "bg-green-400 dark:bg-green-500"),
                  showFlashing && flashColor === 'red' && "animate-pulse bg-red-500",
                  showFlashing && flashColor === 'yellow' && "animate-pulse bg-yellow-400",
                  showSelected && "ring-2 ring-inset ring-blue-500",
                  showValidMove && !square.piece && "after:absolute after:w-1/3 after:h-1/3 after:rounded-full after:bg-black/20",
                  showValidMove && square.piece && "ring-2 ring-inset ring-red-500",
                  showArrowTarget && "ring-2 ring-inset ring-orange-500 bg-orange-400/30",
                  showAxeTarget && "ring-2 ring-inset ring-purple-500 bg-purple-400/30",
                  showBombTarget && "ring-2 ring-inset ring-red-600 bg-red-400/30",
                  showHanging && "ring-2 ring-inset ring-yellow-400",
                )}
                style={showWall ? {
                  backgroundColor: '#6b7280',
                  backgroundImage: `
                    linear-gradient(to right, #4b5563 1px, transparent 1px),
                    linear-gradient(to bottom, #4b5563 1px, transparent 1px),
                    linear-gradient(to right, #4b5563 1px, transparent 1px)
                  `,
                  backgroundSize: '50% 33%, 50% 33%, 50% 33%',
                  backgroundPosition: '0 0, 0 33%, 25% 66%',
                } : undefined}
                onClick={() => onSquareClick({ row: rowIndex, col: colIndex })}
                data-testid={`square-${rowIndex}-${colIndex}`}
              >
                {piece && (
                  <span 
                    className={cn(
                      "select-none transition-transform duration-200 leading-none",
                      piece.color === 'white' ? "text-white" : "text-black",
                      showSelected && "scale-105",
                    )}
                    style={{
                      fontSize: 'min(calc(560px / 12 * 0.85), calc((min(90vw, calc(100vh - 280px)) / 12) * 0.85))',
                    }}
                  >
                    {PIECE_SYMBOLS[piece.type][piece.color]}
                  </span>
                )}
                
                {isBishop && showSelected && !isArrowMode && !isAxeMode && !isBombMode && (
                  <div
                    className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20 flex items-center justify-center w-7 h-7 rounded-full bg-orange-500 border-2 border-white shadow-lg cursor-pointer"
                    onClick={(e) => {
                      e.stopPropagation();
                      onArrowModeToggle({ row: rowIndex, col: colIndex });
                    }}
                    data-testid={`arrow-button-${rowIndex}-${colIndex}`}
                  >
                    <Target className="w-5 h-5 text-white" />
                  </div>
                )}
                
                {isKnight && showSelected && !isArrowMode && !isAxeMode && !isBombMode && (
                  <div
                    className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20 flex items-center justify-center w-7 h-7 rounded-full bg-purple-500 border-2 border-white shadow-lg cursor-pointer"
                    onClick={(e) => {
                      e.stopPropagation();
                      onAxeModeToggle({ row: rowIndex, col: colIndex });
                    }}
                    data-testid={`axe-button-${rowIndex}-${colIndex}`}
                  >
                    <Axe className="w-5 h-5 text-white" />
                  </div>
                )}
                
                {isRook && showSelected && !isArrowMode && !isAxeMode && !isBombMode && (
                  <div
                    className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20 flex items-center justify-center w-7 h-7 rounded-full bg-red-600 border-2 border-white shadow-lg cursor-pointer"
                    onClick={(e) => {
                      e.stopPropagation();
                      onBombModeToggle({ row: rowIndex, col: colIndex });
                    }}
                    data-testid={`bomb-button-${rowIndex}-${colIndex}`}
                  >
                    <Bomb className="w-5 h-5 text-white" />
                  </div>
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
      </div>
      
      {phase === 'setup' && (
        <div className="mt-2 bg-card px-3 py-1 rounded-md text-sm font-medium">
          Walls remaining: {setupWallsRemaining}
        </div>
      )}
      
      {attackAnimation && (
        <AttackAnimationOverlay animation={attackAnimation} />
      )}
    </div>
  );
}

function AttackAnimationOverlay({ animation }: { animation: AttackAnimation }) {
  const [visible, setVisible] = useState(true);
  
  useEffect(() => {
    const timer = setTimeout(() => setVisible(false), 800);
    return () => clearTimeout(timer);
  }, [animation]);
  
  if (!visible) return null;
  
  const getAnimationEmoji = () => {
    switch (animation.type) {
      case 'arrow': return '🏹';
      case 'axe': return '🪓';
      case 'bomb': return '💣';
      case 'pawn': return '⚔️';
      default: return '💥';
    }
  };
  
  const getAnimationColor = () => {
    switch (animation.type) {
      case 'arrow': return 'text-orange-500';
      case 'axe': return 'text-purple-500';
      case 'bomb': return 'text-red-500';
      case 'pawn': return 'text-yellow-500';
      default: return 'text-white';
    }
  };
  
  return (
    <div className="fixed inset-0 pointer-events-none z-50 flex items-center justify-center">
      <div 
        className={cn(
          "text-6xl animate-bounce",
          getAnimationColor(),
        )}
        style={{
          animation: 'attackPulse 0.8s ease-out forwards',
        }}
      >
        {getAnimationEmoji()}
        <style>{`
          @keyframes attackPulse {
            0% { transform: scale(0.5); opacity: 0; }
            30% { transform: scale(1.5); opacity: 1; }
            60% { transform: scale(1.2); opacity: 1; }
            100% { transform: scale(1); opacity: 0; }
          }
        `}</style>
      </div>
    </div>
  );
}
