import { cn } from "@/lib/utils";
import { Message } from "@/hooks/useChat";
import { User, Bot } from "lucide-react";
import { MarkdownRenderer } from "./MarkdownRenderer";

interface ChatMessageProps {
  message: Message;
  isStreaming?: boolean;
}

export const ChatMessage = ({ message, isStreaming }: ChatMessageProps) => {
  const isUser = message.role === "user";

  return (
    <div
      className={cn(
        "flex gap-4 animate-slide-up",
        isUser ? "justify-end" : "justify-start"
      )}
    >
      {!isUser && (
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
          <Bot className="h-4 w-4 text-primary" />
        </div>
      )}
      
      <div
        className={cn(
          "rounded-2xl px-4 py-3",
          isUser
            ? "max-w-[80%] bg-chat-user rounded-br-md"
            : "max-w-[90%] bg-chat-assistant border border-border/30 rounded-bl-md"
        )}
      >
        {isUser ? (
          <p className="text-foreground whitespace-pre-wrap leading-relaxed">
            {message.content}
          </p>
        ) : (
          <div className="text-foreground">
            <MarkdownRenderer content={message.content} />
            {isStreaming && !message.content && (
              <span className="animate-pulse-subtle">●</span>
            )}
            {isStreaming && message.content && (
              <span className="animate-pulse-subtle ml-1">▋</span>
            )}
          </div>
        )}
      </div>
      
      {isUser && (
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary flex items-center justify-center">
          <User className="h-4 w-4 text-primary-foreground" />
        </div>
      )}
    </div>
  );
};
