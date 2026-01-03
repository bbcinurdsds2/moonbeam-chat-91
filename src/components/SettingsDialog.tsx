import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { User, Settings, Plug, Database } from "lucide-react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";
import gmailIcon from "@/assets/gmail.png";
import calendarIcon from "@/assets/google-calendar.png";
import driveIcon from "@/assets/google-drive.png";

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isGmailConnected?: boolean;
  isCalendarConnected?: boolean;
  isDriveConnected?: boolean;
  onConnectService?: (service: 'gmail' | 'calendar' | 'drive') => void;
}

type TabValue = 'account' | 'settings' | 'connectors' | 'data';

export const SettingsDialog = ({
  open,
  onOpenChange,
  isGmailConnected = false,
  isCalendarConnected = false,
  isDriveConnected = false,
  onConnectService,
}: SettingsDialogProps) => {
  const { theme, setTheme } = useTheme();
  const [activeTab, setActiveTab] = useState<TabValue>("settings");
  const [language, setLanguage] = useState("en");
  const [exclusiveContent, setExclusiveContent] = useState(true);
  const [emailNotifications, setEmailNotifications] = useState(true);

  const tabs = [
    { value: 'account' as TabValue, label: 'Account', icon: User },
    { value: 'settings' as TabValue, label: 'Settings & Privacy', icon: Settings },
    { value: 'connectors' as TabValue, label: 'Connectors', icon: Plug },
    { value: 'data' as TabValue, label: 'Data', icon: Database },
  ];

  const connectors = [
    { id: 'gmail', name: 'Gmail', connected: isGmailConnected, icon: gmailIcon },
    { id: 'calendar', name: 'Google Calendar', connected: isCalendarConnected, icon: calendarIcon },
    { id: 'drive', name: 'Google Drive', connected: isDriveConnected, icon: driveIcon },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl h-[600px] p-0 gap-0 overflow-hidden">
        <div className="flex h-full">
          {/* Sidebar */}
          <div className="w-48 border-r bg-sidebar p-2 flex flex-col shrink-0">
            <div className="flex flex-col gap-1">
              {tabs.map((tab) => (
                <button
                  key={tab.value}
                  onClick={() => setActiveTab(tab.value)}
                  className={cn(
                    "flex items-center gap-2 px-3 py-2.5 rounded-md text-sm transition-colors text-left",
                    activeTab === tab.value
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-sidebar-foreground hover:bg-sidebar-accent/50"
                  )}
                >
                  <tab.icon className="h-4 w-4" />
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Main content area */}
          <div className="flex-1 p-6 overflow-y-auto bg-background">
            <DialogHeader className="mb-6">
              <DialogTitle className="text-xl">Settings</DialogTitle>
            </DialogHeader>

            {activeTab === 'account' && (
              <div className="space-y-6">
                <div className="space-y-4">
                  <h3 className="text-sm font-medium text-muted-foreground">Profile</h3>
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                      <User className="h-8 w-8 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium">Guest User</p>
                      <p className="text-sm text-muted-foreground">No account connected</p>
                    </div>
                  </div>
                  <Button variant="outline" className="mt-4">Sign in</Button>
                </div>
              </div>
            )}

            {activeTab === 'settings' && (
              <div className="space-y-6">
                {/* General */}
                <div className="space-y-4">
                  <h3 className="text-sm font-medium text-muted-foreground">General</h3>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Language</label>
                    <Select value={language} onValueChange={setLanguage}>
                      <SelectTrigger className="w-48">
                        <SelectValue placeholder="Select language" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="en">English</SelectItem>
                        <SelectItem value="es">Spanish</SelectItem>
                        <SelectItem value="fr">French</SelectItem>
                        <SelectItem value="de">German</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Appearance */}
                <div className="space-y-4">
                  <h3 className="text-sm font-medium text-muted-foreground">Appearance</h3>
                  <div className="flex gap-3">
                    {/* Light Theme */}
                    <button
                      onClick={() => setTheme("light")}
                      className={cn(
                        "flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-all",
                        theme === "light"
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-primary/50"
                      )}
                    >
                      <div className="w-20 h-14 rounded-md flex items-center justify-center bg-white border border-gray-200">
                        <div className="w-8 h-6 rounded-sm bg-gray-100" />
                      </div>
                      <span className="text-sm">Light</span>
                    </button>

                    {/* Dark Theme */}
                    <button
                      onClick={() => setTheme("dark")}
                      className={cn(
                        "flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-all",
                        theme === "dark"
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-primary/50"
                      )}
                    >
                      <div className="w-20 h-14 rounded-md flex items-center justify-center bg-zinc-900 border border-zinc-700">
                        <div className="w-8 h-6 rounded-sm bg-zinc-700" />
                      </div>
                      <span className="text-sm">Dark</span>
                    </button>

                    {/* System Theme */}
                    <button
                      onClick={() => setTheme("system")}
                      className={cn(
                        "flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-all",
                        theme === "system"
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-primary/50"
                      )}
                    >
                      <div className="w-20 h-14 rounded-md flex items-center justify-center overflow-hidden border">
                        <div className="w-1/2 h-full bg-white flex items-center justify-center">
                          <div className="w-4 h-3 rounded-sm bg-gray-100" />
                        </div>
                        <div className="w-1/2 h-full bg-zinc-900 flex items-center justify-center">
                          <div className="w-4 h-3 rounded-sm bg-zinc-700" />
                        </div>
                      </div>
                      <span className="text-sm">Follow System</span>
                    </button>
                  </div>
                </div>

                {/* Personalization */}
                <div className="space-y-4">
                  <h3 className="text-sm font-medium text-muted-foreground">Personalization</h3>
                  
                  <div className="flex items-center justify-between py-2">
                    <div>
                      <p className="font-medium">Receive exclusive content</p>
                      <p className="text-sm text-muted-foreground">
                        Get exclusive offers, event updates, excellent case examples and new feature guides.
                      </p>
                    </div>
                    <Switch 
                      checked={exclusiveContent} 
                      onCheckedChange={setExclusiveContent}
                    />
                  </div>

                  <div className="flex items-center justify-between py-2">
                    <div>
                      <p className="font-medium">Email me when my queued task starts</p>
                      <p className="text-sm text-muted-foreground">
                        When enabled, we'll send you a timely email once your task finishes queuing and begins processing.
                      </p>
                    </div>
                    <Switch 
                      checked={emailNotifications} 
                      onCheckedChange={setEmailNotifications}
                    />
                  </div>
                </div>

                {/* Manage Cookies */}
                <div className="pt-4 border-t">
                  <div className="flex items-center justify-between">
                    <p className="font-medium">Manage Cookies</p>
                    <Button variant="outline" size="sm">Manage</Button>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'connectors' && (
              <div className="space-y-6">
                <div className="space-y-4">
                  <h3 className="text-sm font-medium text-muted-foreground">Connected Services</h3>
                  <p className="text-sm text-muted-foreground">
                    Connect your services to enable Akronom to help you with emails, calendar, and files.
                  </p>
                  
                  <div className="space-y-3">
                    {connectors.map((connector) => (
                      <div 
                        key={connector.id}
                        className="flex items-center justify-between p-4 rounded-lg border bg-card"
                      >
                        <div className="flex items-center gap-3">
                          <img 
                            src={connector.icon} 
                            alt={connector.name} 
                            className="w-8 h-8 object-contain"
                          />
                          <div>
                            <p className="font-medium">{connector.name}</p>
                            <p className="text-sm text-muted-foreground">
                              {connector.connected ? "Connected" : "Not connected"}
                            </p>
                          </div>
                        </div>
                        <Button 
                          variant={connector.connected ? "outline" : "default"}
                          size="sm"
                          onClick={() => onConnectService?.(connector.id as 'gmail' | 'calendar' | 'drive')}
                        >
                          {connector.connected ? "Disconnect" : "Connect"}
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'data' && (
              <div className="space-y-6">
                <div className="space-y-4">
                  <h3 className="text-sm font-medium text-muted-foreground">Data Management</h3>
                  
                  <div className="space-y-4">
                    <div className="p-4 rounded-lg border bg-card">
                      <h4 className="font-medium mb-2">Export Your Data</h4>
                      <p className="text-sm text-muted-foreground mb-4">
                        Download a copy of your data including chat history and settings.
                      </p>
                      <Button variant="outline" size="sm">Export Data</Button>
                    </div>

                    <div className="p-4 rounded-lg border bg-card">
                      <h4 className="font-medium mb-2">Clear Chat History</h4>
                      <p className="text-sm text-muted-foreground mb-4">
                        Delete all your conversation history. This action cannot be undone.
                      </p>
                      <Button variant="destructive" size="sm">Clear History</Button>
                    </div>

                    <div className="p-4 rounded-lg border border-destructive/50 bg-destructive/5">
                      <h4 className="font-medium mb-2 text-destructive">Delete Account</h4>
                      <p className="text-sm text-muted-foreground mb-4">
                        Permanently delete your account and all associated data.
                      </p>
                      <Button variant="destructive" size="sm">Delete Account</Button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};