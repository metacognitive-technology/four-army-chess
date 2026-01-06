import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Dice1, Dice2, Dice3, Dice4, Dice5, Dice6 } from "lucide-react";

interface DiceRollProps {
  value: number;
  type: 'd4' | 'd6';
  success: boolean;
  isVisible: boolean;
  onAnimationEnd?: () => void;
}

const D6Icons = [Dice1, Dice2, Dice3, Dice4, Dice5, Dice6];

export function DiceRoll({ value, type, success, isVisible, onAnimationEnd }: DiceRollProps) {
  const [isAnimating, setIsAnimating] = useState(true);
  const [displayValue, setDisplayValue] = useState(1);
  
  useEffect(() => {
    if (!isVisible) return;
    
    setIsAnimating(true);
    let count = 0;
    const maxCount = 10;
    
    const interval = setInterval(() => {
      count++;
      const maxVal = type === 'd4' ? 4 : 6;
      setDisplayValue(Math.floor(Math.random() * maxVal) + 1);
      
      if (count >= maxCount) {
        clearInterval(interval);
        setDisplayValue(value);
        setIsAnimating(false);
        setTimeout(() => {
          onAnimationEnd?.();
        }, 1500);
      }
    }, 100);
    
    return () => clearInterval(interval);
  }, [isVisible, value, type, onAnimationEnd]);
  
  if (!isVisible) return null;
  
  const DiceIcon = type === 'd6' ? D6Icons[displayValue - 1] || Dice1 : null;
  
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <Card className={cn(
        "p-8 transition-all duration-300",
        isAnimating && "animate-pulse",
        !isAnimating && success && "ring-4 ring-green-500",
        !isAnimating && !success && "ring-4 ring-red-500",
      )}>
        <CardContent className="flex flex-col items-center gap-4 p-0">
          <div className="text-lg font-medium text-muted-foreground">
            Rolling {type.toUpperCase()}...
          </div>
          
          <div className={cn(
            "w-24 h-24 flex items-center justify-center rounded-lg border-4",
            type === 'd4' ? "rotate-180 border-primary" : "border-primary",
            isAnimating && "animate-bounce"
          )}>
            {type === 'd6' && DiceIcon ? (
              <DiceIcon className="w-16 h-16" />
            ) : (
              <span className="text-5xl font-bold tabular-nums">{displayValue}</span>
            )}
          </div>
          
          {!isAnimating && (
            <div className={cn(
              "text-xl font-bold",
              success ? "text-green-500" : "text-red-500"
            )}>
              {success ? 'Success!' : 'Failed!'}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
