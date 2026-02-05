import { useEffect, useRef } from "react";
import type { Move } from "@shared/schema";
import { getMoveNotation } from "@/lib/gameUtils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { History } from "lucide-react";

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
  
  // Auto-scroll to latest move when moves change
  useEffect(() => {
    if (scrollEndRef.current) {
      scrollEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [moves.length]);
  
  return (
    <Card className="h-full">
      <CardHeader className="flex flex-row items-center gap-2 space-y-0 pb-2">
        <History className="w-4 h-4 text-muted-foreground" />
        <CardTitle className="text-sm font-medium">Move History</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="h-[120px] sm:h-[200px] px-4 pb-4">
          {movePairs.length === 0 ? (
            <p className="text-sm text-muted-foreground italic py-2">No moves yet</p>
          ) : (
            <div className="space-y-0.5">
              {movePairs.map((pair, idx) => (
                <div 
                  key={idx}
                  className="grid grid-cols-[2rem_1fr_1fr] gap-2 text-sm font-mono py-1 px-2 rounded-sm hover-elevate"
                  data-testid={`move-${pair.moveNumber}`}
                >
                  <span className="text-muted-foreground">{pair.moveNumber}.</span>
                  <span className={pair.white?.captured ? "text-red-500" : ""}>
                    {pair.white ? getMoveNotation(pair.white) : ''}
                    {pair.white?.diceRoll && (
                      <span className={pair.white.success ? "text-green-500" : "text-red-500"}>
                        {pair.white.success ? ' ✓' : ' ✗'}
                      </span>
                    )}
                  </span>
                  <span className={pair.black?.captured ? "text-red-500" : ""}>
                    {pair.black ? getMoveNotation(pair.black) : ''}
                    {pair.black?.diceRoll && (
                      <span className={pair.black.success ? "text-green-500" : "text-red-500"}>
                        {pair.black.success ? ' ✓' : ' ✗'}
                      </span>
                    )}
                  </span>
                </div>
              ))}
              <div ref={scrollEndRef} />
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
