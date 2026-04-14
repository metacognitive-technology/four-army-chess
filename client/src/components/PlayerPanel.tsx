import type { Piece, PlayerColor } from "@shared/schema";
import { PIECE_SYMBOLS, calculateScore } from "@/lib/gameUtils";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { User } from "lucide-react";

interface PlayerPanelProps {
  color: PlayerColor;
  playerName: string | null;
  isCurrentTurn: boolean;
  capturedPieces: Piece[];
  isYou: boolean;
  isConnected: boolean;
  compact?: boolean;
  eliminated?: boolean;
}

const COLOR_CLASSES: Record<PlayerColor, { avatar: string; text: string; label: string }> = {
  white: { avatar: 'bg-white border-gray-300', text: 'text-gray-800', label: 'White' },
  black: { avatar: 'bg-gray-800 border-gray-600', text: 'text-white', label: 'Black' },
  red:   { avatar: 'bg-red-600 border-red-400',   text: 'text-white', label: 'Red' },
  blue:  { avatar: 'bg-blue-600 border-blue-400',  text: 'text-white', label: 'Blue' },
};

export function PlayerPanel({
  color,
  playerName,
  isCurrentTurn,
  capturedPieces,
  isYou,
  isConnected,
  compact = false,
  eliminated = false,
}: PlayerPanelProps) {
  const score = calculateScore(capturedPieces);
  const displayName = playerName || (isYou ? 'You' : 'Waiting...');
  const colorInfo = COLOR_CLASSES[color];

  if (compact) {
    return (
      <Card
        className={cn(
          "transition-all duration-300",
          isCurrentTurn && !eliminated && "ring-2 ring-primary shadow-md",
          eliminated && "opacity-50",
        )}
        data-testid={`player-panel-${color}`}
      >
        <CardContent className="p-2 flex items-center gap-2">
          <Avatar className={cn("w-6 h-6 border-2 shrink-0", colorInfo.avatar)}>
            <AvatarFallback className={colorInfo.text}>
              <User className="w-3 h-3" />
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold truncate flex items-center gap-1">
              <span className="text-muted-foreground">{colorInfo.label}</span>
              {eliminated && <span className="text-destructive text-xs">✗</span>}
            </div>
            <div className="text-xs text-muted-foreground truncate">{displayName}</div>
          </div>
          <span className="text-sm font-bold tabular-nums" data-testid={`score-${color}`}>{score}</span>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card 
      className={cn(
        "transition-all duration-300",
        isCurrentTurn && !eliminated && "ring-2 ring-primary shadow-md",
        eliminated && "opacity-50",
      )}
      data-testid={`player-panel-${color}`}
    >
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 p-3 sm:p-6 pb-2 sm:pb-2">
        <div className="flex items-center gap-2 sm:gap-3">
          <Avatar className={cn("w-8 h-8 sm:w-10 sm:h-10 border-2", colorInfo.avatar)}>
            <AvatarFallback className={colorInfo.text}>
              <User className="w-4 h-4 sm:w-5 sm:h-5" />
            </AvatarFallback>
          </Avatar>
          <div>
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              {displayName}
              {isYou && (
                <span className="text-xs text-muted-foreground font-normal">(You)</span>
              )}
              {eliminated && (
                <span className="text-xs text-destructive font-normal">Eliminated</span>
              )}
            </CardTitle>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className={cn(
                "w-2 h-2 rounded-full",
                isConnected ? "bg-green-500" : "bg-gray-400"
              )} />
              <span>{isConnected ? 'Online' : 'Offline'}</span>
            </div>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-2 sm:space-y-3 p-3 sm:p-6 pt-0">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Score</span>
          <span className="text-lg font-bold tabular-nums" data-testid={`score-${color}`}>
            {score}
          </span>
        </div>
        
        <div>
          <span className="text-sm text-muted-foreground block mb-1">Captured</span>
          <div 
            className={cn(
              "flex flex-wrap gap-0.5 min-h-[2rem] p-1 rounded",
              capturedPieces.some(p => p.color === 'white') && "bg-slate-600 dark:bg-slate-700"
            )} 
            data-testid={`captured-${color}`}
          >
            {capturedPieces.length === 0 ? (
              <span className="text-xs text-muted-foreground italic">None yet</span>
            ) : (
              capturedPieces.map((piece, idx) => (
                <span 
                  key={idx}
                  className={cn(
                    "text-lg",
                    piece.color === 'white' 
                      ? "text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)] [text-shadow:_0_0_3px_rgba(0,0,0,0.8)]"
                      : piece.color === 'red'
                      ? "text-red-500 drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]"
                      : piece.color === 'blue'
                      ? "text-blue-500 drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]"
                      : "text-gray-800 dark:text-gray-300"
                  )}
                >
                  {PIECE_SYMBOLS[piece.type][piece.color]}
                </span>
              ))
            )}
          </div>
        </div>
        
      </CardContent>
    </Card>
  );
}
