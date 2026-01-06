import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Play, RotateCcw, Flag, CheckCircle, Copy, Share2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface GameControlsProps {
  gameId: string | null;
  phase: 'waiting' | 'setup' | 'playing' | 'finished';
  isHost: boolean;
  maxWalls: number;
  onMaxWallsChange: (value: number) => void;
  onReady: () => void;
  onNewGame: () => void;
  onResign: () => void;
  isReady: boolean;
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
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Game Controls</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {gameId && phase === 'waiting' && (
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
          <Button 
            className="w-full gap-2" 
            onClick={onReady}
            disabled={isReady}
            data-testid="button-ready"
          >
            <CheckCircle className="w-4 h-4" />
            {isReady ? 'Waiting for opponent...' : 'Ready to Play'}
          </Button>
        )}
        
        {phase === 'playing' && (
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
