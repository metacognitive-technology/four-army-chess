# Battle Chess - A Novel Chess Variant

## Overview

Battle Chess is a real-time multiplayer chess variant game featuring a 12x12 board with unique mechanics including walls, dice-based pawn attacks, bishop arrow attacks, knight axe attacks, and rook special attacks (bomb to destroy walls, wall build to create walls). Players can create or join games via shareable links and compete in turn-based gameplay with WebSocket-powered real-time synchronization.

## User Preferences

Preferred communication style: Simple, everyday language.
Always update `GAME_VERSION` in `client/src/pages/Game.tsx` whenever code is modified.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter for lightweight client-side routing
- **State Management**: TanStack React Query for server state, React hooks for local state
- **UI Components**: shadcn/ui component library built on Radix UI primitives
- **Styling**: Tailwind CSS with CSS variables for theming (light/dark mode support)
- **Build Tool**: Vite with hot module replacement

### Backend Architecture
- **Runtime**: Node.js with Express
- **Language**: TypeScript with ESM modules
- **Real-time Communication**: WebSocket server (ws library) for game state synchronization
- **API Pattern**: REST endpoints for standard HTTP requests, WebSocket for game events

### Game State Management
- **GameManager**: Server-side singleton managing all active game rooms
- **State Flow**: Client sends actions via WebSocket → Server validates and updates state → Server broadcasts to all players in room
- **Reconnection**: Players can reconnect to games using their player ID and game ID

### Board Perspective System
- **Board Flip**: In PvP mode, black player's board is visually flipped (rotated 180°)
- **Position Handling**: Logical positions are always row 0-11, col 0-11 regardless of visual flip
- **Attack Animations**: AttackAnimationOverlay transforms logical to display positions when board is flipped
- **Click Handling**: GameBoard translates display positions to logical positions using rowIndex/colIndex calculations

### AI System
- **A* Pathfinding**: AI uses A* algorithm with Chebyshev distance heuristic for 8-directional movement
- **Caching**: Path distances are cached per board wall configuration to reduce compute cost
- **Move Scoring**: AI prioritizes moves that reduce path distance to enemy king
- **Bomb Strategy**: Rook bomb attacks are scored based on whether they open paths to the enemy king
- **Wall Build Strategy**: Rook wall building attacks can create new walls on adjacent empty squares
- **Applied to both PvC and CvC modes** for consistent AI behavior

### Data Layer
- **ORM**: Drizzle ORM with PostgreSQL dialect
- **Schema Location**: `shared/schema.ts` - shared between client and server
- **Validation**: Zod schemas generated from Drizzle for type-safe validation
- **Game Persistence**: JSON files in `server/data/games/` directory for game state persistence
- **Current Storage**: In-memory storage (MemStorage class), with file-based persistence for games

### Per-Player Budget Assignment System
- **Budget Modes**: `shared` (creator sets all attack percentages for both players) or `individual` (each player assigns their own)
- **Budget Setup Phase**: In individual mode, game transitions through `budget_setup` phase after both players join, where each player configures attack percentages within the total budget
- **Phase Flow**: waiting → budget_setup (individual mode) → setup (if walls > 0) → playing
- **Server State**: Per-player settings stored in `whiteAttackSettings` / `blackAttackSettings` on game state
- **Attack Resolution**: `getAttackSettingsForColor()` selects the attacking piece's player's settings
- **State Filtering**: `filterStateForPlayer()` hides opponent's settings in individual mode, merges own settings into `attackSettings`
- **AI Auto-Assignment**: `generateAIBudgetSettings()` creates weighted random distributions for AI players in PvC/CvC individual mode
- **Client UI**: Budget mode toggle in lobby, budget_setup phase with sliders and submit, attack chances panel during gameplay
- **WebSocket Messages**: `budget_submit` message type for player budget submissions

### Game Persistence System
- **File Storage**: Games are saved as JSON files in `server/data/games/{gameId}.json`
- **Auto-Save**: Game state is saved after every mutation (create, join, move, wall, ready, resign)
- **REST API Endpoints**:
  - `GET /api/games` - List all saved games with metadata
  - `GET /api/games/:id` - Load a specific game
  - `DELETE /api/games/:id?playerId=...` - Delete game (requires ownership)
  - `POST /api/games/cvc` - Create a Computer vs Computer game that runs at full speed
- **Game Modes**:
  - `pvp` - Player vs Player (multiplayer via shareable links)
  - `pvc` - Player vs Computer (AI opponent)
  - `cvc` - Computer vs Computer (watch AI play itself at full speed)
- **CvC Game Takeover**: Humans can load saved CvC games and take over as White or Black
- **Reconnection Flow**:
  - Player IDs stored in localStorage (`playerId_{gameId}`)
  - WebSocket reconnect loads game from file if not in memory
  - `reconnectGame()` function handles explicit reconnection with stored player ID

### Project Structure
```
├── client/src/          # React frontend
│   ├── components/      # UI components (game board, panels, controls)
│   ├── hooks/           # Custom hooks (useWebSocket, use-toast)
│   ├── lib/             # Utilities (gameUtils, queryClient)
│   └── pages/           # Route components
├── server/              # Express backend
│   ├── gameManager.ts   # WebSocket game logic
│   ├── routes.ts        # API and WebSocket routes
│   └── storage.ts       # Data persistence layer
└── shared/              # Shared types and schemas
    └── schema.ts        # Drizzle schema + game types
```

### Key Design Decisions

**16x16 Board with 8-Square Movement Limit**
- Provides larger playing field while maintaining strategic constraints
- Pieces centered on board with offset positioning

**Wall Placement Phase**
- Players place walls on their half before gameplay begins
- Configurable number of walls per player
- Walls block all piece movement

**Dice-Based Combat**
- Pawn attacks require successful dice rolls
- Bishops have arrow attack mode for ranged captures
- Adds probabilistic elements to traditional chess mechanics

**WebSocket Game Protocol**
- Message types: join, move, wall, ready, resign, reconnect
- Server broadcasts state updates to all players in a room
- Handles disconnection and reconnection gracefully

## External Dependencies

### Database
- **PostgreSQL**: Primary database (configured via DATABASE_URL environment variable)
- **Drizzle Kit**: Database migrations and schema management
- **connect-pg-simple**: Session storage (available but not currently used)

### Frontend Libraries
- **@tanstack/react-query**: Async state management
- **Radix UI**: Accessible component primitives (dialog, dropdown, toast, etc.)
- **Lucide React**: Icon library
- **wouter**: Lightweight routing
- **embla-carousel-react**: Carousel component
- **react-day-picker**: Date picker component
- **recharts**: Charting library

### Backend Libraries
- **ws**: WebSocket server implementation
- **express**: HTTP server framework
- **drizzle-orm**: Database ORM
- **zod**: Schema validation

### Build Tools
- **Vite**: Frontend bundler with React plugin
- **esbuild**: Server bundling for production
- **tsx**: TypeScript execution for development

### Replit-Specific
- **@replit/vite-plugin-runtime-error-modal**: Error overlay for development
- **@replit/vite-plugin-cartographer**: Development tooling
- **@replit/vite-plugin-dev-banner**: Development environment indicator