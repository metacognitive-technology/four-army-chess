import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Play, RotateCcw, Flag, CheckCircle, Copy, Share2, Pause, Handshake, Shuffle, Grid3X3, Bot, User } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface GameControlsProps {
  gameId: string | null;
  phase: 'waiting' | 'budget_setup' | 'setup' | 'playing' | 'finished';
  isHost: boolean;
  maxWalls: number;
  onMaxWallsChange: (value: number) => void;
  onReady: () => void;
  onNewGame: () => void;
  onResign: () => void;
  isReady: boolean;
  isCvCGame?: boolean;
  isCvCPaused?: boolean;
  onPauseCvC?: () => void;
  onOfferDraw?: () => void;
  drawOffered?: boolean;
  drawOfferPending?: boolean;
  onAcceptDraw?: () => void;
  onDeclineDraw?: () => void;
  onRandomWalls?: () => void;
  onMazeWalls?: () => void;
  wallsRemaining?: number;
  isAIControlled?: boolean;
  onHandoff?: () => void;
  onTakeControl?: () => void;
}

export function GameControls({
  gameId,
  phase,
  isHost,
  maxWalls,
  onMaxWallsChange,
  onReady,
  onNewGame,
  onResign,
  isReady,
  isCvCGame = false,
  isCvCPaused = false,
  onPauseCvC,
  onOfferDraw,
  drawOffered = false,
  drawOfferPending = false,
  onAcceptDraw,
  onDeclineDraw,
  onRandomWalls,
  onMazeWalls,
  wallsRemaining = 0,
  isAIControlled = false,
  onHandoff,
  onTakeControl,
}: GameControlsProps) {
  const { toast } = useToast();
  
  const copyGameLink = () => {
    if (gameId) {
      const url = `${window.location.origin}?game=${gameId}`;
      navigator.clipboard.writeText(url);
      toast({
        title: "Link copied!",
        description: "Share this link with your opponent.",
      });
    }
  };
  
  return (
    <Card>
      <CardHeader className="p-3 sm:p-6 pb-2">
        <CardTitle className="text-sm font-medium">Game Controls</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 sm:space-y-4 p-3 sm:p-6 pt-0">
        {isCvCGame && phase === 'playing' && onPauseCvC && (
          <Button 
            variant={isCvCPaused ? "default" : "secondary"}
            className="w-full gap-2" 
            onClick={onPauseCvC}
            data-testid="button-pause-cvc"
          >
            {isCvCPaused ? (
              <>
                <Play className="w-4 h-4" />
                Resume
              </>
            ) : (
              <>
                <Pause className="w-4 h-4" />
                Pause
              </>
            )}
          </Button>
        )}
        
        {gameId && (
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Game ID</Label>
            <div className="flex gap-2">
              <code className="flex-1 px-2 py-1 bg-muted rounded text-xs font-mono truncate">
                {gameId}
              </code>
              <Button size="icon" variant="outline" onClick={copyGameLink} data-testid="button-copy-link">
                <Copy className="w-4 h-4" />
              </Button>
            </div>
            {phase === 'waiting' && (
              <Button 
                variant="secondary" 
                size="sm" 
                className="w-full gap-2"
                onClick={copyGameLink}
                data-testid="button-share"
              >
                <Share2 className="w-4 h-4" />
                Share Game Link
              </Button>
            )}
          </div>
        )}
        
        {phase === 'waiting' && isHost && (
          <div className="space-y-2">
            <Label htmlFor="max-walls" className="text-xs">Walls per player</Label>
            <Select 
              value={maxWalls.toString()} 
              onValueChange={(v) => onMaxWallsChange(parseInt(v))}
            >
              <SelectTrigger id="max-walls" data-testid="select-max-walls">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[0, 4, 8, 12, 16, 24, 32].map(n => (
                  <SelectItem key={n} value={n.toString()}>{n} walls</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        
        {phase === 'setup' && (
          <div className="space-y-2">
            {onRandomWalls && wallsRemaining > 0 && (
              <Button 
                variant="secondary"
                className="w-full gap-2" 
                onClick={onRandomWalls}
                data-testid="button-random-walls"
              >
                <Shuffle className="w-4 h-4" />
                Place {wallsRemaining} Walls Randomly
              </Button>
            )}
            {onMazeWalls && (
              <Button 
                variant="outline"
                className="w-full gap-2" 
                onClick={onMazeWalls}
                data-testid="button-maze-walls"
              >
                <Grid3X3 className="w-4 h-4" />
                Generate Maze Pattern
              </Button>
            )}
            <Button 
              className="w-full gap-2" 
              onClick={onReady}
              disabled={isReady}
              data-testid="button-ready"
            >
              <CheckCircle className="w-4 h-4" />
              {isReady ? 'Waiting for opponent...' : 'Ready to Play'}
            </Button>
          </div>
        )}
        
        {phase === 'playing' && (
          <div className="space-y-2">
            {!isCvCGame && (onHandoff || onTakeControl) && (
              isAIControlled ? (
                <Button 
                  variant="default" 
                  className="w-full gap-2" 
                  onClick={onTakeControl}
                  data-testid="button-take-control"
                >
                  <User className="w-4 h-4" />
                  Take Control
                </Button>
              ) : (
                <Button 
                  variant="secondary" 
                  className="w-full gap-2" 
                  onClick={onHandoff}
                  data-testid="button-handoff"
                >
                  <Bot className="w-4 h-4" />
                  Hand Off to AI
                </Button>
              )
            )}
            
            {drawOfferPending && onAcceptDraw && onDeclineDraw ? (
              <div className="p-2 bg-muted rounded-md">
                <p className="text-sm text-center mb-2">Opponent offers a draw</p>
                <div className="flex gap-2">
                  <Button 
                    variant="default" 
                    className="flex-1 gap-1" 
                    size="sm"
                    onClick={onAcceptDraw}
                    data-testid="button-accept-draw"
                  >
                    Accept
                  </Button>
                  <Button 
                    variant="outline" 
                    className="flex-1 gap-1" 
                    size="sm"
                    onClick={onDeclineDraw}
                    data-testid="button-decline-draw"
                  >
                    Decline
                  </Button>
                </div>
              </div>
            ) : onOfferDraw && !isCvCGame && (
              <Button 
                variant="outline" 
                className="w-full gap-2" 
                onClick={onOfferDraw}
                disabled={drawOffered}
                data-testid="button-offer-draw"
              >
                <Handshake className="w-4 h-4" />
                {drawOffered ? 'Draw Offered' : 'Offer Draw'}
              </Button>
            )}
            
            {isCvCGame ? (
              <Button 
                variant="destructive" 
                className="w-full gap-2" 
                onClick={onResign}
                data-testid="button-end-game"
              >
                <Flag className="w-4 h-4" />
                End Game
              </Button>
            ) : (
              <Button 
                variant="destructive" 
                className="w-full gap-2" 
                onClick={onResign}
                data-testid="button-resign"
              >
                <Flag className="w-4 h-4" />
                Resign
              </Button>
            )}
          </div>
        )}
        
        {phase === 'finished' && (
          <Button 
            className="w-full gap-2" 
            onClick={onNewGame}
            data-testid="button-new-game"
          >
            <RotateCcw className="w-4 h-4" />
            New Game
          </Button>
        )}
        
        {phase === 'waiting' && (
          <div className="text-center text-sm text-muted-foreground">
            Waiting for opponent to join...
          </div>
        )}
      </CardContent>
    </Card>
  );
}
