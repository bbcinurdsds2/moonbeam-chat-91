import { useState, useRef, useEffect } from "react";
import { ArrowUp, Plus, Mic } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ConnectorsPill } from "./ConnectorsPill";
import { GoogleService } from "@/hooks/useGoogleServices";

interface ChatInputProps {
  onSend: (message: string) => void;
  isLoading: boolean;
  hasMessages: boolean;
  isGmailConnected: boolean;
  isCalendarConnected: boolean;
  isDriveConnected: boolean;
  onConnectService: (service: GoogleService) => void;
}

export const ChatInput = ({ 
  onSend, 
  isLoading, 
  hasMessages, 
  isGmailConnected,
  isCalendarConnected,
  isDriveConnected,
  onConnectService 
}: ChatInputProps) => {
  const [input, setInput] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [input]);

  const handleSubmit = () => {
    if (input.trim() && !isLoading) {
      onSend(input);
      setInput("");
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className={cn(
      "w-full max-w-3xl mx-auto px-4",
      hasMessages ? "pb-6" : "pb-8"
    )}>
      <div className="bg-card rounded-2xl shadow-lg border border-border/50 overflow-hidden">
        <div className="p-4 pb-2">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Assign a task or ask anything"
            className="w-full bg-transparent resize-none focus:outline-none text-foreground placeholder:text-muted-foreground min-h-[24px] max-h-[200px]"
            rows={1}
            disabled={isLoading}
          />
        </div>
        
        <div className="flex items-center justify-between px-4 pb-4">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-full hover:bg-accent"
            >
              <Plus className="h-4 w-4" />
            </Button>
            <ConnectorsPill 
              isGmailConnected={isGmailConnected}
              isCalendarConnected={isCalendarConnected}
              isDriveConnected={isDriveConnected}
              onConnectService={onConnectService}
            />
          </div>
          
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-full hover:bg-accent"
            >
              <Mic className="h-4 w-4" />
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!input.trim() || isLoading}
              size="icon"
              className={cn(
                "h-8 w-8 rounded-full transition-all",
                input.trim() 
                  ? "bg-primary text-primary-foreground hover:bg-primary/90" 
                  : "bg-muted text-muted-foreground"
              )}
            >
              <ArrowUp className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

    </div>
  );
};
