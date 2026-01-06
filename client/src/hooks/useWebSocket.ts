import { useState, useEffect, useCallback, useRef } from "react";
import type { GameMessage, GameState, GameMode } from "@shared/schema";

type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

interface UseWebSocketReturn {
  gameState: GameState | null;
  playerId: string | null;
  playerColor: 'white' | 'black' | null;
  connectionStatus: ConnectionStatus;
  sendMessage: (message: GameMessage) => void;
  createGame: (maxWalls: number, gameMode?: GameMode) => void;
  joinGame: (gameId: string) => void;
  lastError: string | null;
}

export function useWebSocket(): UseWebSocketReturn {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [playerColor, setPlayerColor] = useState<'white' | 'black' | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const [lastError, setLastError] = useState<string | null>(null);
  
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const gameIdRef = useRef<string | null>(null);
  
  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;
    
    setConnectionStatus('connecting');
    
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
    
    ws.onopen = () => {
      setConnectionStatus('connected');
      setLastError(null);
      
      // Reconnect to game if we have a game ID
      if (gameIdRef.current && playerId) {
        ws.send(JSON.stringify({
          type: 'reconnect',
          payload: { gameId: gameIdRef.current },
          playerId,
        }));
      }
    };
    
    ws.onmessage = (event) => {
      try {
        const message: GameMessage = JSON.parse(event.data);
        
        switch (message.type) {
          case 'state':
            setGameState(message.payload.state);
            if (message.payload.playerId && !playerId) {
              setPlayerId(message.payload.playerId);
            }
            if (message.payload.color) {
              setPlayerColor(message.payload.color);
            }
            if (message.payload.state?.id) {
              gameIdRef.current = message.payload.state.id;
            }
            break;
            
          case 'error':
            setLastError(message.payload.message);
            break;
            
          case 'player_joined':
          case 'player_left':
            setGameState(message.payload.state);
            break;
        }
      } catch (e) {
        console.error('Failed to parse WebSocket message:', e);
      }
    };
    
    ws.onclose = () => {
      setConnectionStatus('disconnected');
      wsRef.current = null;
      
      // Attempt to reconnect after 2 seconds
      if (gameIdRef.current) {
        reconnectTimeoutRef.current = setTimeout(() => {
          connect();
        }, 2000);
      }
    };
    
    ws.onerror = () => {
      setConnectionStatus('error');
      setLastError('Connection error');
    };
    
    wsRef.current = ws;
  }, [playerId]);
  
  useEffect(() => {
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);
  
  const sendMessage = useCallback((message: GameMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ ...message, playerId }));
    }
  }, [playerId]);
  
  const createGame = useCallback((maxWalls: number, gameMode: GameMode = 'pvp') => {
    connect();
    
    // Wait for connection then send create message
    const checkAndSend = () => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: 'join',
          payload: { action: 'create', maxWalls, gameMode },
        }));
      } else {
        setTimeout(checkAndSend, 100);
      }
    };
    checkAndSend();
  }, [connect]);
  
  const joinGame = useCallback((gameId: string) => {
    gameIdRef.current = gameId;
    connect();
    
    const checkAndSend = () => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: 'join',
          payload: { action: 'join', gameId },
        }));
      } else {
        setTimeout(checkAndSend, 100);
      }
    };
    checkAndSend();
  }, [connect]);
  
  return {
    gameState,
    playerId,
    playerColor,
    connectionStatus,
    sendMessage,
    createGame,
    joinGame,
    lastError,
  };
}
