import { useState } from "react";
import { Plug2, Globe, Plus, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import gmailIcon from "@/assets/gmail.png";
import calendarIcon from "@/assets/google-calendar.png";
import driveIcon from "@/assets/google-drive.png";
import { GoogleService } from "@/hooks/useGoogleServices";

interface Connector {
  id: string;
  name: string;
  icon: React.ReactNode;
  connected: boolean;
  onToggle?: () => void;
  service?: GoogleService;
}

interface ConnectorsPillProps {
  isGmailConnected: boolean;
  isCalendarConnected: boolean;
  isDriveConnected: boolean;
  onConnectService: (service: GoogleService) => void;
}

export const ConnectorsPill = ({ 
  isGmailConnected, 
  isCalendarConnected,
  isDriveConnected,
  onConnectService 
}: ConnectorsPillProps) => {
  const [open, setOpen] = useState(false);
  const [webSearchEnabled, setWebSearchEnabled] = useState(true);

  const connectors: Connector[] = [
    {
      id: "web-search",
      name: "Web Search",
      icon: <Globe className="h-5 w-5" />,
      connected: webSearchEnabled,
      onToggle: () => setWebSearchEnabled(!webSearchEnabled),
    },
    {
      id: "gmail",
      name: "Gmail",
      icon: <img src={gmailIcon} alt="Gmail" className="h-5 w-5 object-contain" />,
      connected: isGmailConnected,
      onToggle: () => onConnectService('gmail'),
      service: 'gmail',
    },
    {
      id: "google-calendar",
      name: "Google Calendar",
      icon: <img src={calendarIcon} alt="Google Calendar" className="h-5 w-5 object-contain" />,
      connected: isCalendarConnected,
      onToggle: () => onConnectService('calendar'),
      service: 'calendar',
    },
    {
      id: "google-drive",
      name: "Google Drive",
      icon: <img src={driveIcon} alt="Google Drive" className="h-5 w-5 object-contain" />,
      connected: isDriveConnected,
      onToggle: () => onConnectService('drive'),
      service: 'drive',
    },
  ];

  const connectedCount = connectors.filter(c => c.connected).length;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          className={cn(
            "h-8 px-3 rounded-full gap-2 hover:bg-accent border border-border/50",
            open && "bg-accent"
          )}
        >
          <Plug2 className="h-4 w-4" />
          <span className="text-sm font-medium">Connectors</span>
          {connectedCount > 0 && (
            <span className="bg-primary text-primary-foreground text-xs px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
              {connectedCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent 
        className="w-72 p-0 bg-popover border border-border shadow-xl rounded-xl"
        align="start"
        sideOffset={8}
      >
        <div className="p-3 space-y-1">
          {connectors.map((connector) => (
            <div
              key={connector.id}
              className="flex items-center justify-between p-2 rounded-lg hover:bg-accent/50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-muted/50">
                  {connector.icon}
                </div>
                <span className="text-sm font-medium">{connector.name}</span>
              </div>
              {connector.onToggle ? (
                <Switch
                  checked={connector.connected}
                  onCheckedChange={connector.onToggle}
                  className="data-[state=checked]:bg-primary"
                />
              ) : (
                <span className="text-xs text-muted-foreground px-2 py-1 rounded bg-muted/50">
                  Connect
                </span>
              )}
            </div>
          ))}
        </div>

        <div className="border-t border-border p-3 space-y-1">
          <button className="flex items-center gap-3 w-full p-2 rounded-lg hover:bg-accent/50 transition-colors text-left">
            <Plus className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Add connectors</span>
          </button>
          <button className="flex items-center gap-3 w-full p-2 rounded-lg hover:bg-accent/50 transition-colors text-left">
            <Settings className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Manage connectors</span>
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
};
