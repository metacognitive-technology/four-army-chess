import { useEffect, useRef } from "react";
import type { Move } from "@shared/schema";
import { getMoveNotation } from "@/lib/gameUtils";

interface MoveHistoryProps {
  moves: Move[];
}

export function MoveHistory({ moves }: MoveHistoryProps) {
  const scrollEndRef = useRef<HTMLDivElement>(null);
  
  // Group moves into pairs (white, black)
  const movePairs: { white: Move | null; black: Move | null; moveNumber: number }[] = [];
  
  for (let i = 0; i < moves.length; i += 2) {
    movePairs.push({
      moveNumber: Math.floor(i / 2) + 1,
      white: moves[i] || null,
      black: moves[i + 1] || null,
    });
  }
  
  // Only show last 2 pairs (4 moves)
  const recentPairs = movePairs.slice(-2);
  
  return (
    <div className="text-xs space-y-0.5">
      <span className="text-sm font-medium" data-testid="text-move-history-label">Game History</span>
      {recentPairs.length === 0 ? (
        <p className="text-muted-foreground italic">No moves yet</p>
      ) : (
        recentPairs.map((pair, idx) => (
          <div 
            key={idx}
            className="grid grid-cols-[2rem_1fr_1fr] gap-1 font-mono"
            data-testid={`move-${pair.moveNumber}`}
          >
            <span className="text-muted-foreground">{pair.moveNumber}.</span>
            <span className={pair.white?.captured ? "text-red-500" : ""}>
              {pair.white ? getMoveNotation(pair.white) : ''}
              {pair.white?.diceRoll && (
                <span className={pair.white.success ? "text-green-500" : "text-red-500"}>
                  {pair.white.success ? '✓' : '✗'}
                </span>
              )}
            </span>
            <span className={pair.black?.captured ? "text-red-500" : ""}>
              {pair.black ? getMoveNotation(pair.black) : ''}
              {pair.black?.diceRoll && (
                <span className={pair.black.success ? "text-green-500" : "text-red-500"}>
                  {pair.black.success ? '✓' : '✗'}
                </span>
              )}
            </span>
          </div>
        ))
      )}
    </div>
  );
}
