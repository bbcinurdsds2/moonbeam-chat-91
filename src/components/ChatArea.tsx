import { useRef, useEffect } from "react";
import { Message } from "@/hooks/useChat";
import { ChatMessage } from "./ChatMessage";
import { ScrollArea } from "@/components/ui/scroll-area";

interface ChatAreaProps {
  messages: Message[];
  isLoading: boolean;
}

export const ChatArea = ({ messages, isLoading }: ChatAreaProps) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <h1 className="text-4xl md:text-5xl font-medium text-foreground tracking-tight text-center animate-fade-in">
          What can I do for you?
        </h1>
      </div>
    );
  }

  return (
    <ScrollArea className="flex-1 px-4" ref={scrollRef}>
      <div className="max-w-3xl mx-auto py-6 space-y-6">
        {messages.map((message, index) => (
          <ChatMessage
            key={message.id}
            message={message}
            isStreaming={
              isLoading &&
              index === messages.length - 1 &&
              message.role === "assistant"
            }
          />
        ))}
      </div>
    </ScrollArea>
  );
};
