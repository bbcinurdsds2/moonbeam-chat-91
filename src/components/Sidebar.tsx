import { 
  PenSquare, 
  Search, 
  BookOpen, 
  Bot,
  PanelLeftClose,
  PanelLeft,
  Settings,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface SidebarProps {
  isOpen: boolean;
  onToggle: () => void;
  onNewChat: () => void;
  onOpenSettings: () => void;
}

const menuItems = [
  { icon: PenSquare, label: "New task", active: true },
  { icon: Search, label: "Search" },
  { icon: BookOpen, label: "Library" },
];

export const Sidebar = ({ isOpen, onToggle, onNewChat, onOpenSettings }: SidebarProps) => {
  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-foreground/20 z-40 lg:hidden"
          onClick={onToggle}
        />
      )}
      
      {/* Sidebar */}
      <aside
        className={cn(
          "fixed lg:relative z-50 h-full bg-sidebar border-r border-sidebar-border transition-all duration-300 flex flex-col",
          isOpen ? "w-64 translate-x-0" : "w-0 lg:w-16 -translate-x-full lg:translate-x-0"
        )}
      >
        {/* Header */}
        <div className={cn(
          "flex items-center h-14 px-4 border-b border-sidebar-border",
          !isOpen && "lg:justify-center lg:px-2"
        )}>
          {isOpen ? (
            <>
              <div className="flex items-center gap-2">
                <Bot className="h-6 w-6 text-sidebar-primary" />
                <span className="font-semibold text-sidebar-foreground">akronom</span>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="ml-auto h-8 w-8"
                onClick={onToggle}
              >
                <PanelLeftClose className="h-4 w-4" />
              </Button>
            </>
          ) : (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 hidden lg:flex"
              onClick={onToggle}
            >
              <PanelLeft className="h-4 w-4" />
            </Button>
          )}
        </div>

        {/* Navigation - only show one version based on isOpen state */}
        <nav className={cn(
          "flex-1 py-2 overflow-hidden",
          isOpen ? "block" : "hidden lg:flex lg:flex-col lg:items-center lg:gap-1"
        )}>
          {menuItems.map((item) => (
            isOpen ? (
              <button
                key={item.label}
                onClick={item.label === "New task" ? onNewChat : undefined}
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors",
                  item.active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground hover:bg-sidebar-accent/50"
                )}
              >
                <item.icon className="h-4 w-4 flex-shrink-0" />
                <span>{item.label}</span>
              </button>
            ) : (
              <Button
                key={item.label}
                variant={item.active ? "secondary" : "ghost"}
                size="icon"
                className="h-10 w-10"
                onClick={item.label === "New task" ? onNewChat : undefined}
              >
                <item.icon className="h-4 w-4" />
              </Button>
            )
          ))}
        </nav>

        {/* Settings button at bottom */}
        <div className={cn(
          "py-2 border-t border-sidebar-border",
          isOpen ? "block" : "hidden lg:flex lg:flex-col lg:items-center"
        )}>
          {isOpen ? (
            <button
              onClick={onOpenSettings}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors text-sidebar-foreground hover:bg-sidebar-accent/50"
            >
              <Settings className="h-4 w-4 flex-shrink-0" />
              <span>Settings</span>
            </button>
          ) : (
            <Button
              variant="ghost"
              size="icon"
              className="h-10 w-10"
              onClick={onOpenSettings}
            >
              <Settings className="h-4 w-4" />
            </Button>
          )}
        </div>
      </aside>
    </>
  );
};