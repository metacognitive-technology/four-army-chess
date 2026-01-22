import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { BookOpen, Castle, Target, Dice1, Crown } from "lucide-react";

export function GameRules() {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-2 space-y-0 pb-2">
        <BookOpen className="w-4 h-4 text-muted-foreground" />
        <CardTitle className="text-sm font-medium">Game Rules</CardTitle>
      </CardHeader>
      <CardContent className="p-0 px-4 pb-4">
        <Accordion type="single" collapsible className="w-full">
          <AccordionItem value="setup">
            <AccordionTrigger className="text-sm py-2">
              <span className="flex items-center gap-2">
                <Castle className="w-4 h-4" />
                Setup Phase
              </span>
            </AccordionTrigger>
            <AccordionContent className="text-xs text-muted-foreground space-y-1">
              <p>Each player can place walls on their half of the board.</p>
              <p>Walls block all piece movement.</p>
              <p>Click squares to toggle walls on/off.</p>
              <p>Click "Ready" when done placing walls.</p>
            </AccordionContent>
          </AccordionItem>
          
          <AccordionItem value="movement">
            <AccordionTrigger className="text-sm py-2">
              <span className="flex items-center gap-2">
                <Crown className="w-4 h-4" />
                Piece Movement
              </span>
            </AccordionTrigger>
            <AccordionContent className="text-xs text-muted-foreground space-y-1">
              <p><strong>King:</strong> Moves 1 square in any direction.</p>
              <p><strong>Queen:</strong> Moves up to 8 squares in any direction.</p>
              <p><strong>Rook:</strong> Moves up to 8 squares horizontally/vertically.</p>
              <p><strong>Bishop:</strong> Moves up to 8 squares diagonally.</p>
              <p><strong>Knight:</strong> Moves in L-shape (2+1 squares).</p>
              <p><strong>Pawn:</strong> Moves 1 square in any direction (like a King).</p>
            </AccordionContent>
          </AccordionItem>
          
          <AccordionItem value="attacks">
            <AccordionTrigger className="text-sm py-2">
              <span className="flex items-center gap-2">
                <Dice1 className="w-4 h-4" />
                Special Attacks
              </span>
            </AccordionTrigger>
            <AccordionContent className="text-xs text-muted-foreground space-y-1">
              <p><strong>Pawn Attack:</strong> Roll 1d6. Need 1 to succeed.</p>
              <p><strong>Bishop Arrow:</strong> Click the orange target icon on a selected bishop. Roll 2d6 and need to roll equal to or higher than the distance to hit.</p>
              <p>Knights and Rooks are immune to arrows.</p>
              <p><strong>Knight Axe:</strong> Click the purple axe icon on a selected knight. Roll 1d6 and need 4 or higher to hit an adjacent enemy.</p>
            </AccordionContent>
          </AccordionItem>
          
          <AccordionItem value="winning">
            <AccordionTrigger className="text-sm py-2">
              <span className="flex items-center gap-2">
                <Target className="w-4 h-4" />
                Winning
              </span>
            </AccordionTrigger>
            <AccordionContent className="text-xs text-muted-foreground space-y-1">
              <p>Capture the opponent's King to win.</p>
              <p>Or put them in checkmate (no legal moves).</p>
              <p>Resign to forfeit the game.</p>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </CardContent>
    </Card>
  );
}
