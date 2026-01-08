import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { AlertTriangle, CheckCircle2, XCircle, Swords, Target } from "lucide-react";
import type { PlayerColor } from "@shared/schema";

interface GameStatusProps {
  phase: 'waiting' | 'setup' | 'playing' | 'finished';
  currentTurn: PlayerColor;
  playerColor: PlayerColor | null;
  isCheck: boolean;
  isCheckmate: boolean;
  winner: PlayerColor | 'draw' | null;
  isArrowMode: boolean;
}

export function GameStatus({
  phase,
  currentTurn,
  playerColor,
  isCheck,
  isCheckmate,
  winner,
  isArrowMode,
}: GameStatusProps) {
  const isMyTurn = playerColor === currentTurn;
  
  const getStatusMessage = () => {
    if (phase === 'waiting') {
      return {
        icon: <Swords className="w-5 h-5" />,
        message: 'Waiting for opponent...',
        variant: 'default' as const,
      };
    }
    
    if (phase === 'setup') {
      return {
        icon: <Target className="w-5 h-5" />,
        message: 'Place your walls on your half of the board',
        variant: 'default' as const,
      };
    }
    
    if (phase === 'finished') {
      if (winner === 'draw') {
        return {
          icon: <XCircle className="w-5 h-5" />,
          message: 'Game ended in a draw!',
          variant: 'warning' as const,
        };
      }
      const didWin = winner === playerColor;
      return {
        icon: didWin ? <CheckCircle2 className="w-5 h-5" /> : <XCircle className="w-5 h-5" />,
        message: didWin ? 'You won!' : 'You lost!',
        variant: didWin ? 'success' : 'error' as const,
      };
    }
    
    if (isCheckmate) {
      const didWin = currentTurn !== playerColor;
      return {
        icon: <CheckCircle2 className="w-5 h-5" />,
        message: `Checkmate! ${didWin ? 'You won!' : 'You lost!'}`,
        variant: didWin ? 'success' : 'error' as const,
      };
    }
    
    if (isCheck) {
      return {
        icon: <AlertTriangle className="w-5 h-5" />,
        message: isMyTurn ? 'You are in check!' : 'Opponent is in check!',
        variant: 'warning' as const,
      };
    }
    
    if (isArrowMode) {
      return {
        icon: <Target className="w-5 h-5" />,
        message: 'Select a target for arrow attack (1d4 range)',
        variant: 'default' as const,
      };
    }
    
    return {
      icon: isMyTurn ? <Swords className="w-5 h-5" /> : null,
      message: isMyTurn ? 'Your turn' : "Opponent's turn",
      variant: 'default' as const,
    };
  };
  
  const status = getStatusMessage();
  
  return (
    <Card className={cn(
      "transition-all duration-300",
      status.variant === 'success' && "bg-green-500/10 border-green-500/50",
      status.variant === 'error' && "bg-red-500/10 border-red-500/50",
      status.variant === 'warning' && "bg-yellow-500/10 border-yellow-500/50",
    )}>
      <CardContent className="flex items-center justify-center gap-2 sm:gap-3 py-2 sm:py-3 px-3">
        {status.icon && (
          <span className={cn(
            status.variant === 'success' && "text-green-500",
            status.variant === 'error' && "text-red-500",
            status.variant === 'warning' && "text-yellow-500",
          )}>
            {status.icon}
          </span>
        )}
        <span className={cn(
          "text-sm sm:text-base font-medium text-center",
          status.variant === 'success' && "text-green-500",
          status.variant === 'error' && "text-red-500",
          status.variant === 'warning' && "text-yellow-500",
        )} data-testid="game-status">
          {status.message}
        </span>
      </CardContent>
    </Card>
  );
}
