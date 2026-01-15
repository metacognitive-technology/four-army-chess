import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useLocation, useSearch } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { GameBoard } from "@/components/GameBoard";
import { PlayerPanel } from "@/components/PlayerPanel";
import { MoveHistory } from "@/components/MoveHistory";
import { GameControls } from "@/components/GameControls";
import { GameStatus } from "@/components/GameStatus";
import { GameRules } from "@/components/GameRules";
import { useWebSocket } from "@/hooks/useWebSocket";
import { useToast } from "@/hooks/use-toast";
import { getValidMoves, getArrowTargets, findHangingPieces, isInCheck, isCheckmate, createInitialBoard } from "@/lib/gameUtils";
import type { Position, GameState, SavedGameInfo } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Wifi, WifiOff, Plus, Link2, Bot, Users, History, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { apiRequest, queryClient } from "@/lib/queryClient";

function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

export default function Game() {
  const searchParams = new URLSearchParams(useSearch());
  const gameIdFromUrl = searchParams.get('game');
  
  const { toast } = useToast();
  const {
    gameState,
    playerId,
    playerColor,
    connectionStatus,
    sendMessage,
    createGame,
    joinGame,
    reconnectGame,
    lastError,
  } = useWebSocket();
  
  const [selectedPosition, setSelectedPosition] = useState<Position | null>(null);
  const [isArrowMode, setIsArrowMode] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [maxWalls, setMaxWalls] = useState(8);
  const [joinGameId, setJoinGameId] = useState(gameIdFromUrl || '');
  const [flashingSquare, setFlashingSquare] = useState<Position | null>(null);
  const lastDiceRollRef = useRef<string | null>(null);
  
  // Fetch saved games
  const { data: savedGames = [], isLoading: loadingSavedGames } = useQuery<SavedGameInfo[]>({
    queryKey: ['/api/games'],
    refetchOnWindowFocus: true,
  });
  
  const handleDeleteGame = useCallback(async (gameId: string) => {
    try {
      const storedPlayerId = localStorage.getItem(`playerId_${gameId}`);
      const url = storedPlayerId 
        ? `/api/games/${gameId}?playerId=${storedPlayerId}`
        : `/api/games/${gameId}`;
      await apiRequest('DELETE', url);
      queryClient.invalidateQueries({ queryKey: ['/api/games'] });
      localStorage.removeItem(`playerId_${gameId}`);
      toast({
        title: "Game deleted",
        description: "The saved game has been removed.",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete game. You may not have permission.",
        variant: "destructive",
      });
    }
  }, [toast]);
  
  const handleReconnectToGame = useCallback((game: SavedGameInfo, storedPlayerId: string | null) => {
    reconnectGame(game.id, storedPlayerId);
  }, [reconnectGame]);
  
  // Auto-join game from URL
  useEffect(() => {
    if (gameIdFromUrl && !gameState) {
      joinGame(gameIdFromUrl);
    }
  }, [gameIdFromUrl, gameState, joinGame]);
  
  // Show errors as toasts
  useEffect(() => {
    if (lastError) {
      toast({
        title: "Error",
        description: lastError,
        variant: "destructive",
      });
    }
  }, [lastError, toast]);
  
  // Handle dice roll results with flash effect - only for actual attacks
  useEffect(() => {
    if (gameState?.lastDiceRoll && gameState.moveHistory.length > 0) {
      const lastMove = gameState.moveHistory[gameState.moveHistory.length - 1];
      
      // Only show flash/toast if the last move was actually an attack (has dice roll data)
      const isAttackMove = lastMove.isArrowAttack || (lastMove.diceRoll !== undefined && lastMove.diceRequired !== undefined);
      if (!isAttackMove) return;
      
      const rollKey = `${lastMove.from.row}-${lastMove.from.col}-${lastMove.to.row}-${lastMove.to.col}-${gameState.lastDiceRoll.value}`;
      
      if (lastDiceRollRef.current !== rollKey) {
        lastDiceRollRef.current = rollKey;
        
        // Flash the target square
        setFlashingSquare(lastMove.to);
        
        // Show toast with result
        const isArrow = lastMove.isArrowAttack;
        const diceType = gameState.lastDiceRoll.type;
        const rolled = gameState.lastDiceRoll.value;
        const success = gameState.lastDiceRoll.success;
        const distance = Math.max(
          Math.abs(lastMove.to.row - lastMove.from.row),
          Math.abs(lastMove.to.col - lastMove.from.col)
        );
        
        setTimeout(() => {
          toast({
            title: success ? "Attack Successful!" : "Attack Failed!",
            description: isArrow 
              ? `Arrow attack: rolled ${rolled} on ${diceType} (needed ${distance}+)${success ? ' - target hit!' : ' - missed!'}`
              : `Pawn attack: rolled ${rolled} on ${diceType}${success ? ' - captured!' : ' - needed 1 to succeed'}`,
            variant: success ? "default" : "destructive",
          });
        }, 300);
        
        // Clear flash after animation
        setTimeout(() => {
          setFlashingSquare(null);
        }, 600);
      }
    }
  }, [gameState?.lastDiceRoll, gameState?.moveHistory, toast]);
  
  const board = gameState?.board || createInitialBoard();
  const phase = gameState?.phase || 'waiting';
  const currentTurn = gameState?.currentTurn || 'white';
  
  const validMoves = useMemo(() => {
    if (!selectedPosition || !gameState || phase !== 'playing' || isArrowMode) return [];
    const piece = board[selectedPosition.row][selectedPosition.col].piece;
    if (!piece || piece.color !== playerColor || playerColor !== currentTurn) return [];
    return getValidMoves(board, selectedPosition);
  }, [selectedPosition, gameState, phase, isArrowMode, board, playerColor, currentTurn]);
  
  const arrowTargets = useMemo(() => {
    if (!selectedPosition || !isArrowMode || !gameState || phase !== 'playing') return [];
    return getArrowTargets(board, selectedPosition);
  }, [selectedPosition, isArrowMode, gameState, phase, board]);
  
  const hangingPieces = useMemo(() => {
    if (!gameState || phase !== 'playing' || !playerColor) return [];
    return findHangingPieces(board, playerColor);
  }, [gameState, phase, playerColor, board]);
  
  const checkStatus = useMemo(() => {
    if (!gameState || phase !== 'playing') return { isCheck: false, isCheckmate: false };
    const inCheck = isInCheck(board, currentTurn);
    const inCheckmate = inCheck && isCheckmate(board, currentTurn);
    return {
      isCheck: inCheck,
      isCheckmate: inCheckmate,
    };
  }, [gameState, phase, board, currentTurn]);
  
  const handleSquareClick = useCallback((position: Position) => {
    if (!gameState) return;
    
    // Setup phase - toggle walls
    if (phase === 'setup') {
      const isOwnHalf = playerColor === 'white' 
        ? position.row >= 6 
        : position.row < 6;
      
      if (!isOwnHalf) return;
      
      const square = board[position.row][position.col];
      if (square.piece) return; // Can't place wall on piece
      
      sendMessage({
        type: 'setup_wall',
        payload: { position },
      });
      return;
    }
    
    // Playing phase
    if (phase !== 'playing' || playerColor !== currentTurn) return;
    
    // Arrow mode - select target
    if (isArrowMode && selectedPosition) {
      const isTarget = arrowTargets.some(t => t.row === position.row && t.col === position.col);
      if (isTarget) {
        sendMessage({
          type: 'arrow_attack',
          payload: { from: selectedPosition, to: position },
        });
        setIsArrowMode(false);
        setSelectedPosition(null);
      } else {
        setIsArrowMode(false);
      }
      return;
    }
    
    const clickedPiece = board[position.row][position.col].piece;
    
    // If clicking on own piece, select it
    if (clickedPiece && clickedPiece.color === playerColor) {
      setSelectedPosition(position);
      setIsArrowMode(false);
      return;
    }
    
    // If we have a selection and clicking on valid move, make move
    if (selectedPosition) {
      const isValidMove = validMoves.some(m => m.row === position.row && m.col === position.col);
      if (isValidMove) {
        sendMessage({
          type: 'move',
          payload: { from: selectedPosition, to: position },
        });
        setSelectedPosition(null);
      } else {
        setSelectedPosition(null);
      }
    }
  }, [gameState, phase, playerColor, currentTurn, isArrowMode, selectedPosition, arrowTargets, validMoves, board, sendMessage]);
  
  const handleArrowModeToggle = useCallback((position: Position) => {
    setIsArrowMode(true);
    setSelectedPosition(position);
  }, []);
  
  const handleReady = useCallback(() => {
    setIsReady(true);
    sendMessage({ type: 'ready', payload: {} });
  }, [sendMessage]);
  
  const handleNewGame = useCallback(() => {
    window.location.href = '/';
  }, []);
  
  const handleResign = useCallback(() => {
    sendMessage({ type: 'move', payload: { resign: true } });
  }, [sendMessage]);
  
  
  // Lobby view - no game yet
  if (!gameState) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl font-bold">Battle Chess</CardTitle>
            <p className="text-muted-foreground">A novel chess variant with walls, dice, and arrows</p>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center gap-2 justify-center text-sm">
              {connectionStatus === 'connected' ? (
                <>
                  <Wifi className="w-4 h-4 text-green-500" />
                  <span className="text-green-500">Connected</span>
                </>
              ) : connectionStatus === 'connecting' ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Connecting...</span>
                </>
              ) : (
                <>
                  <WifiOff className="w-4 h-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Not connected</span>
                </>
              )}
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="walls-per-player">Walls per player</Label>
              <Select 
                value={maxWalls.toString()} 
                onValueChange={(v) => setMaxWalls(parseInt(v))}
              >
                <SelectTrigger id="walls-per-player" data-testid="select-walls">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[0, 4, 8, 12, 16, 24, 32].map(n => (
                    <SelectItem key={n} value={n.toString()}>{n} walls</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-4">
              <Button 
                className="w-full gap-2" 
                size="lg"
                onClick={() => createGame(maxWalls, 'pvc')}
                data-testid="button-play-computer"
              >
                <Bot className="w-5 h-5" />
                Play vs Computer
              </Button>
              
              <Button 
                className="w-full gap-2" 
                size="lg"
                variant="outline"
                onClick={() => createGame(maxWalls, 'pvp')}
                data-testid="button-create-game"
              >
                <Users className="w-5 h-5" />
                Create Multiplayer Game
              </Button>
              
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-card px-2 text-muted-foreground">Or join existing</span>
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="game-id">Game ID</Label>
                <Input
                  id="game-id"
                  placeholder="Enter game ID..."
                  value={joinGameId}
                  onChange={(e) => setJoinGameId(e.target.value)}
                  data-testid="input-game-id"
                />
                <Button
                  className="w-full gap-2"
                  variant="secondary"
                  onClick={() => {
                    if (joinGameId) {
                      joinGame(joinGameId.trim());
                    }
                  }}
                  disabled={!joinGameId.trim()}
                  data-testid="button-join-game"
                >
                  <Link2 className="w-4 h-4" />
                  Join Game
                </Button>
              </div>
            </div>
            
            {/* Saved Games Section */}
            {savedGames.length > 0 && (
              <div className="space-y-2">
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-card px-2 text-muted-foreground">Saved Games</span>
                  </div>
                </div>
                
                <ScrollArea className="h-48">
                  <div className="space-y-2">
                    {loadingSavedGames ? (
                      <div className="flex items-center justify-center py-4">
                        <Loader2 className="w-5 h-5 animate-spin" />
                      </div>
                    ) : (
                      savedGames.map((game) => {
                        const storedPlayerId = localStorage.getItem(`playerId_${game.id}`);
                        const isYourGame = storedPlayerId && (game.whitePlayer === storedPlayerId || game.blackPlayer === storedPlayerId);
                        const timeAgo = formatTimeAgo(game.updatedAt);
                        const statusText = game.phase === 'finished' 
                          ? (game.winner ? `${game.winner} won` : 'Draw') 
                          : `${game.currentTurn}'s turn`;
                        
                        return (
                          <div 
                            key={game.id}
                            className="flex items-center gap-2 p-2 rounded-md border bg-muted/50"
                            data-testid={`saved-game-${game.id}`}
                          >
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <History className="w-4 h-4 text-muted-foreground shrink-0" />
                                <span className="font-mono text-sm truncate">{game.id}</span>
                                {game.gameMode === 'pvc' && (
                                  <span className="text-xs bg-primary/10 text-primary px-1 rounded">vs AI</span>
                                )}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {statusText} - {game.moveCount} moves - {timeAgo}
                              </div>
                            </div>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleReconnectToGame(game, storedPlayerId)}
                              data-testid={`button-resume-${game.id}`}
                            >
                              {isYourGame ? 'Resume' : 'Join'}
                            </Button>
                            {isYourGame && (
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => handleDeleteGame(game.id)}
                                data-testid={`button-delete-${game.id}`}
                              >
                                <Trash2 className="w-4 h-4 text-muted-foreground" />
                              </Button>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </ScrollArea>
              </div>
            )}
            
            <GameRules />
          </CardContent>
        </Card>
      </div>
    );
  }
  
  const isVsComputer = gameState.gameMode === 'pvc';
  const whitePlayer = gameState.players.white;
  const blackPlayer = isVsComputer && gameState.aiColor === 'black' ? 'Computer' : gameState.players.black;
  
  return (
    <div className="min-h-screen bg-background p-2 sm:p-4">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col lg:flex-row gap-3 sm:gap-6">
          {/* Left panel - Black player */}
          <div className="lg:w-64 space-y-3 sm:space-y-4 order-2 lg:order-1">
            <PlayerPanel
              color="black"
              playerName={blackPlayer}
              isCurrentTurn={currentTurn === 'black'}
              capturedPieces={gameState.capturedPieces.white}
              isYou={playerColor === 'black'}
              isConnected={!!blackPlayer}
            />
            <div className="hidden lg:block">
              <GameRules />
            </div>
          </div>
          
          {/* Center - Game board */}
          <div className="flex-1 flex flex-col items-center gap-2 sm:gap-4 order-1 lg:order-2">
            <GameStatus
              phase={phase}
              currentTurn={currentTurn}
              playerColor={playerColor}
              isCheck={checkStatus.isCheck}
              isCheckmate={checkStatus.isCheckmate}
              winner={gameState.winner}
              isArrowMode={isArrowMode}
            />
            
            <GameBoard
              board={board}
              currentTurn={currentTurn}
              playerColor={playerColor}
              phase={phase}
              selectedPosition={selectedPosition}
              validMoves={validMoves}
              arrowTargets={arrowTargets}
              hangingPieces={hangingPieces}
              isArrowMode={isArrowMode}
              onSquareClick={handleSquareClick}
              onArrowModeToggle={handleArrowModeToggle}
              setupWallsRemaining={playerColor ? gameState.setupWallsRemaining[playerColor] : 0}
              flashingSquare={flashingSquare}
            />
            
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              {connectionStatus === 'connected' ? (
                <>
                  <Wifi className="w-4 h-4 text-green-500" />
                  <span>Connected</span>
                </>
              ) : (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Reconnecting...</span>
                </>
              )}
            </div>
          </div>
          
          {/* Right panel - White player & controls */}
          <div className="lg:w-64 space-y-3 sm:space-y-4 order-3">
            <PlayerPanel
              color="white"
              playerName={whitePlayer}
              isCurrentTurn={currentTurn === 'white'}
              capturedPieces={gameState.capturedPieces.black}
              isYou={playerColor === 'white'}
              isConnected={!!whitePlayer}
            />
            
            <GameControls
              gameId={gameState.id}
              phase={phase}
              isHost={playerColor === 'white'}
              maxWalls={gameState.maxWallsPerPlayer}
              onMaxWallsChange={setMaxWalls}
              onReady={handleReady}
              onNewGame={handleNewGame}
              onResign={handleResign}
              isReady={isReady}
            />
            
            <MoveHistory moves={gameState.moveHistory} />
          </div>
        </div>
      </div>
      
    </div>
  );
}
