import type { Piece, PlayerColor } from "@shared/schema";
import { PIECE_SYMBOLS, calculateScore } from "@/lib/gameUtils";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Crown, User } from "lucide-react";

interface PlayerPanelProps {
  color: PlayerColor;
  playerName: string | null;
  isCurrentTurn: boolean;
  capturedPieces: Piece[];
  isYou: boolean;
  isConnected: boolean;
}

export function PlayerPanel({
  color,
  playerName,
  isCurrentTurn,
  capturedPieces,
  isYou,
  isConnected,
}: PlayerPanelProps) {
  const score = calculateScore(capturedPieces);
  const displayName = playerName || (isYou ? 'You' : 'Waiting...');
  
  return (
    <Card 
      className={cn(
        "transition-all duration-300",
        isCurrentTurn && "ring-2 ring-primary shadow-md",
      )}
      data-testid={`player-panel-${color}`}
    >
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 p-3 sm:p-6 pb-2 sm:pb-2">
        <div className="flex items-center gap-2 sm:gap-3">
          <Avatar className={cn(
            "w-8 h-8 sm:w-10 sm:h-10 border-2",
            color === 'white' ? "bg-white border-gray-300" : "bg-gray-800 border-gray-600"
          )}>
            <AvatarFallback className={color === 'white' ? "text-gray-800" : "text-white"}>
              <User className="w-4 h-4 sm:w-5 sm:h-5" />
            </AvatarFallback>
          </Avatar>
          <div>
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              {displayName}
              {isYou && (
                <span className="text-xs text-muted-foreground font-normal">(You)</span>
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
        
        {isCurrentTurn && (
          <div className="flex items-center gap-1 text-primary">
            <Crown className="w-4 h-4" />
            <span className="text-xs font-medium">Turn</span>
          </div>
        )}
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
          <div className="flex flex-wrap gap-0.5 min-h-[2rem]" data-testid={`captured-${color}`}>
            {capturedPieces.length === 0 ? (
              <span className="text-xs text-muted-foreground italic">None yet</span>
            ) : (
              capturedPieces.map((piece, idx) => (
                <span 
                  key={idx}
                  className={cn(
                    "text-lg",
                    piece.color === 'white' 
                      ? "text-gray-300 drop-shadow-[0_0_1px_rgba(0,0,0,0.5)]" 
                      : "text-gray-700"
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
