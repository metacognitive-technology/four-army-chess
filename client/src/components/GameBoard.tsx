import { useState, useCallback, useEffect, useRef } from "react";
import type { Board, Position, PlayerColor, PieceType } from "@shared/schema";
import { PIECE_SYMBOLS, BOARD_SIZE, getValidMoves, getArrowTargets, findHangingPieces } from "@/lib/gameUtils";
import { cn } from "@/lib/utils";
import { Target, ZoomIn, ZoomOut, RotateCcw, Axe, Bomb, Blocks } from "lucide-react";
import { Button } from "@/components/ui/button";

export type AttackAnimationType = 'arrow' | 'axe' | 'bomb' | 'pawn' | 'wallbuild';

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
  wallBuildTargets: Position[];
  hangingPieces: Position[];
  isArrowMode: boolean;
  isAxeMode: boolean;
  isBombMode: boolean;
  isWallBuildMode: boolean;
  onSquareClick: (position: Position) => void;
  onArrowModeToggle: (position: Position) => void;
  onAxeModeToggle: (position: Position) => void;
  onBombModeToggle: (position: Position) => void;
  onWallBuildModeToggle: (position: Position) => void;
  setupWallsRemaining: number;
  flashingSquare: Position | null;
  flashColor?: 'red' | 'yellow';
  attackAnimation?: AttackAnimation | null;
  moveFlashSquares?: Position[];
  gameMode?: 'pvp' | 'pvc' | 'cvc';
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
  wallBuildTargets,
  hangingPieces,
  isArrowMode,
  isAxeMode,
  isBombMode,
  isWallBuildMode,
  onSquareClick,
  onArrowModeToggle,
  onAxeModeToggle,
  onBombModeToggle,
  onWallBuildModeToggle,
  setupWallsRemaining,
  flashingSquare,
  flashColor = 'red',
  attackAnimation,
  moveFlashSquares = [],
  gameMode = 'pvc',
}: GameBoardProps) {
  const isMyTurn = playerColor === currentTurn;
  const [zoom, setZoom] = useState(1);
  const boardRef = useRef<HTMLDivElement>(null);
  
  // Flip board for black player in multiplayer mode
  const shouldFlipBoard = gameMode === 'pvp' && playerColor === 'black';
  
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
  
  const isWallBuildTarget = useCallback((row: number, col: number) => {
    return wallBuildTargets.some(t => t.row === row && t.col === col);
  }, [wallBuildTargets]);
  
  const isHanging = useCallback((row: number, col: number) => {
    return hangingPieces.some(h => h.row === row && h.col === col);
  }, [hangingPieces]);
  
  const isSelected = useCallback((row: number, col: number) => {
    return selectedPosition?.row === row && selectedPosition?.col === col;
  }, [selectedPosition]);
  
  const isFlashing = useCallback((row: number, col: number) => {
    return flashingSquare?.row === row && flashingSquare?.col === col;
  }, [flashingSquare]);
  
  const isMoveFlashing = useCallback((row: number, col: number) => {
    return moveFlashSquares.some(s => s.row === row && s.col === col);
  }, [moveFlashSquares]);
  
  // Check if square is available for wall placement in setup mode
  const isWallPlacementAvailable = useCallback((row: number, col: number) => {
    if (phase !== 'setup') return false;
    const square = board[row][col];
    // Can only place walls on empty squares in own half
    if (square.piece || square.isWall) return false;
    if (playerColor === 'white') {
      return row >= BOARD_SIZE / 2;
    } else {
      return row < BOARD_SIZE / 2;
    }
  }, [phase, board, playerColor]);

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
          ref={boardRef}
          className="grid gap-0 border-2 border-foreground/20 rounded-md overflow-hidden shadow-lg relative"
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
        {(shouldFlipBoard ? [...board].reverse() : board).map((row, displayRowIndex) => {
          const rowIndex = shouldFlipBoard ? BOARD_SIZE - 1 - displayRowIndex : displayRowIndex;
          return (shouldFlipBoard ? [...row].reverse() : row).map((square, displayColIndex) => {
            const colIndex = shouldFlipBoard ? BOARD_SIZE - 1 - displayColIndex : displayColIndex;
            const isDark = (rowIndex + colIndex) % 2 === 1;
            const piece = square.piece;
            const canClick = canInteract(rowIndex, colIndex);
            const showValidMove = isValidMove(rowIndex, colIndex);
            const showArrowTarget = isArrowTarget(rowIndex, colIndex);
            const showHanging = isHanging(rowIndex, colIndex) && piece?.color === playerColor;
            const showSelected = isSelected(rowIndex, colIndex);
            const showFlashing = isFlashing(rowIndex, colIndex);
            const showMoveFlash = isMoveFlashing(rowIndex, colIndex);
            const showWallAvailable = isWallPlacementAvailable(rowIndex, colIndex);
            const isBishop = piece?.type === 'bishop' && piece?.color === playerColor && phase === 'playing' && isMyTurn;
            const isKnight = piece?.type === 'knight' && piece?.color === playerColor && phase === 'playing' && isMyTurn;
            const isRook = piece?.type === 'rook' && piece?.color === playerColor && phase === 'playing' && isMyTurn;
            const showAxeTarget = isAxeTarget(rowIndex, colIndex);
            const showBombTarget = isBombTarget(rowIndex, colIndex);
            const showWallBuildTarget = isWallBuildTarget(rowIndex, colIndex);
            
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
                  showMoveFlash && "move-flash-animation",
                  showWallAvailable && "ring-4 ring-inset ring-gray-500",
                  showSelected && "ring-2 ring-inset ring-blue-500",
                  showValidMove && !square.piece && "after:absolute after:w-1/3 after:h-1/3 after:rounded-full after:bg-black/20",
                  showValidMove && square.piece && "ring-2 ring-inset ring-red-500",
                  showArrowTarget && "ring-2 ring-inset ring-orange-500 bg-orange-400/30",
                  showAxeTarget && "ring-2 ring-inset ring-purple-500 bg-purple-400/30",
                  showBombTarget && "ring-2 ring-inset ring-red-600 bg-red-400/30",
                  showWallBuildTarget && "ring-2 ring-inset ring-cyan-500 bg-cyan-400/30",
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
                      WebkitTextStroke: piece.color === 'white' ? '1px black' : '1px white',
                      paintOrder: 'stroke fill',
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
                
                {isRook && showSelected && !isArrowMode && !isAxeMode && !isBombMode && !isWallBuildMode && (
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20 flex items-center gap-1">
                    <div
                      className="flex items-center justify-center w-6 h-6 rounded-full bg-red-600 border-2 border-white shadow-lg cursor-pointer"
                      onClick={(e) => {
                        e.stopPropagation();
                        onBombModeToggle({ row: rowIndex, col: colIndex });
                      }}
                      data-testid={`bomb-button-${rowIndex}-${colIndex}`}
                      title="Bomb (destroy wall)"
                    >
                      <Bomb className="w-4 h-4 text-white" />
                    </div>
                    <div
                      className="flex items-center justify-center w-6 h-6 rounded-full bg-cyan-600 border-2 border-white shadow-lg cursor-pointer"
                      onClick={(e) => {
                        e.stopPropagation();
                        onWallBuildModeToggle({ row: rowIndex, col: colIndex });
                      }}
                      data-testid={`wallbuild-button-${rowIndex}-${colIndex}`}
                      title="Build wall"
                    >
                      <Blocks className="w-4 h-4 text-white" />
                    </div>
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
          });
        })}
        </div>
      </div>
      
      {phase === 'setup' && (
        <div className="mt-2 bg-card px-3 py-1 rounded-md text-sm font-medium">
          Walls remaining: {setupWallsRemaining}
        </div>
      )}
      
      {attackAnimation && boardRef.current && (
        <AttackAnimationOverlay animation={attackAnimation} boardRef={boardRef} />
      )}
    </div>
  );
}

function AttackAnimationOverlay({ 
  animation, 
  boardRef 
}: { 
  animation: AttackAnimation;
  boardRef: React.RefObject<HTMLDivElement>;
}) {
  const [visible, setVisible] = useState(true);
  const [positions, setPositions] = useState<{ fromX: number; fromY: number; toX: number; toY: number } | null>(null);
  
  useEffect(() => {
    // Calculate positions based on board element
    if (boardRef.current) {
      const rect = boardRef.current.getBoundingClientRect();
      const cellSize = rect.width / BOARD_SIZE;
      
      // Calculate center of each cell
      const fromX = rect.left + (animation.from.col + 0.5) * cellSize;
      const fromY = rect.top + (animation.from.row + 0.5) * cellSize;
      const toX = rect.left + (animation.to.col + 0.5) * cellSize;
      const toY = rect.top + (animation.to.row + 0.5) * cellSize;
      
      setPositions({ fromX, fromY, toX, toY });
    }
    
    const timer = setTimeout(() => setVisible(false), 1000);
    return () => clearTimeout(timer);
  }, [animation, boardRef]);
  
  if (!visible || !positions) return null;
  
  const getAnimationEmoji = () => {
    switch (animation.type) {
      case 'arrow': return '🏹';
      case 'axe': return '🪓';
      case 'bomb': return '💣';
      case 'pawn': return '⚔️';
      case 'wallbuild': return '🧱';
      default: return '💥';
    }
  };
  
  const getGlowColor = () => {
    switch (animation.type) {
      case 'arrow': return 'drop-shadow(0 0 8px rgb(249 115 22))';
      case 'axe': return 'drop-shadow(0 0 8px rgb(168 85 247))';
      case 'bomb': return 'drop-shadow(0 0 8px rgb(239 68 68))';
      case 'pawn': return 'drop-shadow(0 0 8px rgb(234 179 8))';
      case 'wallbuild': return 'drop-shadow(0 0 8px rgb(6 182 212))';
      default: return 'drop-shadow(0 0 8px white)';
    }
  };
  
  // Calculate angle for rotation (arrow/axe should point toward target)
  const dx = positions.toX - positions.fromX;
  const dy = positions.toY - positions.fromY;
  const angle = Math.atan2(dy, dx) * (180 / Math.PI);
  
  return (
    <div className="fixed inset-0 pointer-events-none z-50">
      <div 
        className="absolute text-4xl"
        style={{
          left: positions.fromX,
          top: positions.fromY,
          transform: 'translate(-50%, -50%)',
          filter: getGlowColor(),
          animation: 'attackSlide 1s ease-in-out forwards',
          '--from-x': `${positions.fromX}px`,
          '--from-y': `${positions.fromY}px`,
          '--to-x': `${positions.toX}px`,
          '--to-y': `${positions.toY}px`,
          '--angle': `${angle}deg`,
        } as React.CSSProperties}
      >
        {getAnimationEmoji()}
        <style>{`
          @keyframes attackSlide {
            0% { 
              left: var(--from-x);
              top: var(--from-y);
              transform: translate(-50%, -50%) scale(1.2);
              opacity: 1;
            }
            20% { 
              left: var(--from-x);
              top: var(--from-y);
              transform: translate(-50%, -50%) scale(1.5);
              opacity: 1;
            }
            80% { 
              left: var(--to-x);
              top: var(--to-y);
              transform: translate(-50%, -50%) scale(1.2);
              opacity: 1;
            }
            100% { 
              left: var(--to-x);
              top: var(--to-y);
              transform: translate(-50%, -50%) scale(1);
              opacity: 0;
            }
          }
        `}</style>
      </div>
    </div>
  );
}
