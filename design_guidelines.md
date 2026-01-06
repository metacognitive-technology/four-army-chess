# Chess-Style Game Design Guidelines

## Design Approach
**System-Based with Game UI Specialization**
Primary inspiration: Chess.com and Lichess.org interface patterns
Focus on clarity, quick decision-making, and immersive gameplay experience

## Layout Architecture

**Primary Layout Structure:**
- Game board occupies 60-70% of viewport width on desktop, centered
- Side panels (30-40%) for game info, moves, captured pieces, and controls
- Mobile: Full-width board with collapsible side panels

**Spacing System:**
Tailwind units: 1, 2, 4, 6, 8 for consistent rhythm
- Board padding: p-4
- Panel spacing: space-y-4
- Button gaps: gap-2
- Card padding: p-6

## Typography

**Font Stack:**
- Primary: Inter or Roboto (via Google Fonts CDN)
- Monospace: JetBrains Mono for move notation

**Hierarchy:**
- Game title/header: text-2xl font-bold
- Player names: text-lg font-semibold
- Move notation: text-sm font-mono
- Timer: text-3xl font-bold tabular-nums
- Status messages: text-base font-medium

## Component Library

**Game Board:**
- 8x8 grid with alternating square patterns
- Square size: Responsive (calc(min(70vw, 70vh) / 8))
- Piece placement: Centered within squares with padding
- Valid move indicators: Subtle overlays on target squares
- Selected piece: Elevated appearance with shadow

**Side Panels:**
- Player info cards: Display avatar placeholder, name, rating, captured pieces
- Move history: Scrollable list with alternating row treatment
- Game timer: Prominent display above each player section
- Action buttons: New game, resign, draw offer, settings

**Game Controls:**
- Icon library: Heroicons via CDN
- Button sizes: Standard (h-10), Large (h-12) for primary actions
- Icon buttons: w-10 h-10 for secondary controls

**Status Indicators:**
- Turn indicator: Subtle glow or border on active player section
- Check/checkmate alerts: Prominent modal overlay
- Move validation: Inline feedback for invalid moves

## Interaction Patterns

**Piece Movement:**
- Click-to-select, click-to-move interaction model
- Drag-and-drop support for advanced users
- Show valid moves on piece selection
- Animate piece movement (duration-200)

**Game States:**
- Loading: Skeleton loaders for board and panels
- Active game: Full interactive board
- Game over: Modal with results and rematch option
- Paused: Overlay with resume controls

**Responsive Breakpoints:**
- Mobile (< 768px): Stacked layout, collapsible panels
- Tablet (768px - 1024px): Compact side-by-side
- Desktop (> 1024px): Full layout with generous spacing

## Visual Specifications

**Animations:**
Use sparingly, only for:
- Piece movement: translate with ease-in-out (duration-200)
- Turn transitions: Subtle fade on active player indicator
- Check notification: Single pulse animation

**Elevation:**
- Game board: shadow-lg (primary focus)
- Side panels: shadow-md
- Modals/overlays: shadow-xl
- Buttons: shadow-sm with hover lift

**Icons:**
Heroicons CDN for:
- Settings, menu, fullscreen toggle
- Resign, draw, rematch actions
- Timer, history, analysis icons

## Images
**No hero images.** This is a functional game interface.
- Player avatars: Circular placeholders (w-12 h-12) in player info cards
- Piece graphics: Use Unicode chess symbols or SVG sprite sheet via CDN

## Accessibility
- Keyboard navigation: Arrow keys for board navigation, Enter to select/move
- Screen reader: Announce moves, game state, turn changes
- Focus indicators: Clear visual ring on focused squares
- Move history: Semantic list structure with proper ARIA labels

## Key Principles
1. **Board-first design:** Everything supports quick piece recognition and move selection
2. **Information density:** Critical game data always visible, secondary info collapsible
3. **Zero visual clutter:** Every element serves gameplay
4. **Instant feedback:** Move validation and state changes feel immediate
5. **Competitive clarity:** Timer, captured pieces, move count prominently displayed