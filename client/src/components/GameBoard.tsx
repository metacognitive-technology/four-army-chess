import { useState, useCallback, useEffect, useRef } from "react";
import type { Board, Position, PlayerColor, PieceType } from "@shared/schema";
import { PIECE_SYMBOLS, BOARD_SIZE, getValidMoves, getArrowTargets, findHangingPieces } from "@/lib/gameUtils";
import { cn } from "@/lib/utils";
import { Target, ZoomIn, ZoomOut, RotateCcw, Axe, Bomb, Blocks } from "lucide-react";
import { Button } from "@/components/ui/button";

function PawnIcon({ color, size }: { color: string; size: string }) {
  const fill = color === 'white' ? '#ffffff' : color === 'red' ? '#ef4444' : color === 'blue' ? '#3b82f6' : '#000000';
  const stroke = color === 'white' || color === 'red' || color === 'blue' ? '#000000' : '#ffffff';
  return (
    <svg 
      viewBox="0 0 45 45" 
      style={{ width: size, height: size }}
    >
      <path
        d="M22.5 9c-2.21 0-4 1.79-4 4 0 .89.29 1.71.78 2.38C17.33 16.5 16 18.59 16 21c0 2.03.94 3.84 2.41 5.03-3 1.06-7.41 5.55-7.41 13.47h23c0-7.92-4.41-12.41-7.41-13.47 1.47-1.19 2.41-3 2.41-5.03 0-2.41-1.33-4.5-3.28-5.62.49-.67.78-1.49.78-2.38 0-2.21-1.79-4-4-4z"
        fill={fill}
        stroke={stroke}
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

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
  phase: 'waiting' | 'budget_setup' | 'setup' | 'playing' | 'finished';
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
  specialAttackCounts?: { [pieceId: string]: number };
  maxBishopAttacks?: number;
  maxRookAttacks?: number;
  targetPopup?: { position: Position; message: string } | null;
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
  specialAttackCounts,
  maxBishopAttacks = 10,
  maxRookAttacks = 10,
  targetPopup,
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
          className="grid gap-0 border-2 border-foreground/20 rounded-md overflow-hidden shadow-lg relative select-none"
          style={{ 
            gridTemplateColumns: `repeat(${BOARD_SIZE}, minmax(0, 1fr))`,
            aspectRatio: '1 / 1',
            width: 'min(90vw, calc(100vh - 280px), 560px)',
            maxWidth: '100%',
            transform: `scale(${zoom})`,
            transformOrigin: 'top left',
            caretColor: 'transparent',
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
                  piece.type === 'pawn' ? (
                    <div 
                      className={cn(
                        "select-none transition-transform duration-200 flex items-center justify-center",
                        showSelected && "scale-105",
                      )}
                    >
                      <PawnIcon 
                        color={piece.color} 
                        size="min(calc(560px / 12 * 0.85), calc((min(90vw, calc(100vh - 280px)) / 12) * 0.85))" 
                      />
                    </div>
                  ) : (
                    <span 
                      className={cn(
                        "select-none transition-transform duration-200 leading-none",
                        showSelected && "scale-105",
                      )}
                      style={{
                        fontSize: 'min(calc(560px / 12 * 0.85), calc((min(90vw, calc(100vh - 280px)) / 12) * 0.85))',
                        color: piece.color === 'white' ? '#ffffff' : piece.color === 'red' ? '#ef4444' : piece.color === 'blue' ? '#3b82f6' : '#000000',
                        WebkitTextStroke: (piece.color === 'white' || piece.color === 'red' || piece.color === 'blue') ? '1px black' : '1px white',
                        paintOrder: 'stroke fill',
                      }}
                    >
                      {PIECE_SYMBOLS[piece.type][piece.color]}
                    </span>
                  )
                )}
                
                {piece && piece.color === playerColor && phase === 'playing' && (isArrowMode || isAxeMode || isBombMode || isWallBuildMode) && (
                  (piece.type === 'bishop' || piece.type === 'rook') && (() => {
                    const used = piece.id ? (specialAttackCounts?.[piece.id] ?? 0) : 0;
                    const max = piece.type === 'bishop' ? maxBishopAttacks : maxRookAttacks;
                    const remaining = max - used;
                    return (
                      <div
                        className={cn(
                          "absolute -top-0.5 -right-0.5 z-30 flex items-center justify-center rounded-full border border-white shadow-sm",
                          "min-w-[14px] h-[14px] px-0.5",
                          remaining === 0 ? "bg-red-600" : remaining <= 2 ? "bg-orange-500" : "bg-blue-600"
                        )}
                        data-testid={`attack-remaining-${rowIndex}-${colIndex}`}
                      >
                        <span className="text-white font-bold" style={{ fontSize: '9px', lineHeight: '1' }}>{remaining}</span>
                      </div>
                    );
                  })()
                )}
                
                {isBishop && showSelected && !isArrowMode && !isAxeMode && !isBombMode && (() => {
                  const bUsed = piece?.id ? (specialAttackCounts?.[piece.id] ?? 0) : 0;
                  const bRemaining = maxBishopAttacks - bUsed;
                  const bExhausted = bRemaining <= 0;
                  return (
                    <div
                      className={cn(
                        "absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20 flex items-center justify-center w-7 h-7 rounded-full border-2 border-white shadow-lg",
                        bExhausted ? "bg-gray-500 cursor-not-allowed opacity-60" : "bg-orange-500 cursor-pointer"
                      )}
                      onClick={(e) => {
                        e.stopPropagation();
                        onArrowModeToggle({ row: rowIndex, col: colIndex });
                      }}
                      data-testid={`arrow-button-${rowIndex}-${colIndex}`}
                    >
                      {bExhausted ? (
                        <span className="text-white font-bold text-xs">0</span>
                      ) : (
                        <Target className="w-5 h-5 text-white" />
                      )}
                    </div>
                  );
                })()}
                
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
                
                {isRook && showSelected && !isArrowMode && !isAxeMode && !isBombMode && !isWallBuildMode && (() => {
                  const rUsed = piece?.id ? (specialAttackCounts?.[piece.id] ?? 0) : 0;
                  const rRemaining = maxRookAttacks - rUsed;
                  const rExhausted = rRemaining <= 0;
                  return (
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20 flex items-center gap-1">
                      <div
                        className={cn(
                          "flex items-center justify-center w-6 h-6 rounded-full border-2 border-white shadow-lg",
                          rExhausted ? "bg-gray-500 cursor-not-allowed opacity-60" : "bg-red-600 cursor-pointer"
                        )}
                        onClick={(e) => {
                          e.stopPropagation();
                          onBombModeToggle({ row: rowIndex, col: colIndex });
                        }}
                        data-testid={`bomb-button-${rowIndex}-${colIndex}`}
                        title={rExhausted ? "No attacks remaining" : "Bomb (destroy wall)"}
                      >
                        {rExhausted ? (
                          <span className="text-white font-bold text-xs">0</span>
                        ) : (
                          <Bomb className="w-4 h-4 text-white" />
                        )}
                      </div>
                      <div
                        className={cn(
                          "flex items-center justify-center w-6 h-6 rounded-full border-2 border-white shadow-lg",
                          rExhausted ? "bg-gray-500 cursor-not-allowed opacity-60" : "bg-cyan-600 cursor-pointer"
                        )}
                        onClick={(e) => {
                          e.stopPropagation();
                          onWallBuildModeToggle({ row: rowIndex, col: colIndex });
                        }}
                        data-testid={`wallbuild-button-${rowIndex}-${colIndex}`}
                        title={rExhausted ? "No attacks remaining" : "Build wall"}
                      >
                        {rExhausted ? (
                          <span className="text-white font-bold text-xs">0</span>
                        ) : (
                          <Blocks className="w-4 h-4 text-white" />
                        )}
                      </div>
                    </div>
                  );
                })()}
                
                {targetPopup && targetPopup.position.row === rowIndex && targetPopup.position.col === colIndex && (
                  <div
                    className="absolute z-40 left-1/2 -translate-x-1/2 -top-1 -translate-y-full pointer-events-none"
                    data-testid={`target-popup-${rowIndex}-${colIndex}`}
                  >
                    <div className="bg-red-600 text-white text-[10px] font-bold px-2 py-1 rounded shadow-lg whitespace-nowrap animate-in fade-in zoom-in-95 duration-200">
                      {targetPopup.message}
                      <div className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-red-600" />
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
        <AttackAnimationOverlay animation={attackAnimation} boardRef={boardRef} shouldFlipBoard={shouldFlipBoard} />
      )}
    </div>
  );
}

function AttackAnimationOverlay({ 
  animation, 
  boardRef,
  shouldFlipBoard = false
}: { 
  animation: AttackAnimation;
  boardRef: React.RefObject<HTMLDivElement>;
  shouldFlipBoard?: boolean;
}) {
  const [visible, setVisible] = useState(true);
  const [positions, setPositions] = useState<{ fromX: number; fromY: number; toX: number; toY: number } | null>(null);
  
  useEffect(() => {
    // Calculate positions based on board element
    if (boardRef.current) {
      const rect = boardRef.current.getBoundingClientRect();
      const cellSize = rect.width / BOARD_SIZE;
      
      // Account for board flip when calculating visual positions
      const fromCol = shouldFlipBoard ? BOARD_SIZE - 1 - animation.from.col : animation.from.col;
      const fromRow = shouldFlipBoard ? BOARD_SIZE - 1 - animation.from.row : animation.from.row;
      const toCol = shouldFlipBoard ? BOARD_SIZE - 1 - animation.to.col : animation.to.col;
      const toRow = shouldFlipBoard ? BOARD_SIZE - 1 - animation.to.row : animation.to.row;
      
      // Calculate center of each cell
      const fromX = rect.left + (fromCol + 0.5) * cellSize;
      const fromY = rect.top + (fromRow + 0.5) * cellSize;
      const toX = rect.left + (toCol + 0.5) * cellSize;
      const toY = rect.top + (toRow + 0.5) * cellSize;
      
      setPositions({ fromX, fromY, toX, toY });
    }
    
    const timer = setTimeout(() => setVisible(false), 1000);
    return () => clearTimeout(timer);
  }, [animation, boardRef, shouldFlipBoard]);
  
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
