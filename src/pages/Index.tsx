import { useState } from "react";
import { Sidebar } from "@/components/Sidebar";
import { ChatArea } from "@/components/ChatArea";
import { ChatInput } from "@/components/ChatInput";
import { SettingsDialog } from "@/components/SettingsDialog";
import { useChat } from "@/hooks/useChat";
import { useGoogleServices, GoogleService } from "@/hooks/useGoogleServices";
import { toast } from "@/hooks/use-toast";

const Index = () => {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { 
    isGmailConnected, 
    isCalendarConnected, 
    isDriveConnected,
    gmailEmail,
    calendarEmail,
    driveEmail,
    connect, 
    sessionId 
  } = useGoogleServices();
  const { messages, isLoading, sendMessage, clearMessages } = useChat(sessionId);

  const handleConnectService = async (service: GoogleService) => {
    const isConnected = service === 'gmail' ? isGmailConnected 
      : service === 'calendar' ? isCalendarConnected 
      : isDriveConnected;
    
    const email = service === 'gmail' ? gmailEmail
      : service === 'calendar' ? calendarEmail
      : driveEmail;

    const serviceNames: Record<GoogleService, string> = {
      gmail: 'Gmail',
      calendar: 'Google Calendar',
      drive: 'Google Drive',
    };

    if (isConnected) {
      toast({
        title: `${serviceNames[service]} Connected`,
        description: `Connected to ${email}. You can now use ${serviceNames[service]} features.`,
      });
    } else {
      try {
        await connect(service);
      } catch (error) {
        toast({
          title: `${serviceNames[service]} Connection Failed`,
          description: error instanceof Error ? error.message : `Could not connect to ${serviceNames[service]}`,
          variant: "destructive",
        });
      }
    }
  };

  return (
    <div className="flex h-screen bg-background">
      <Sidebar
        isOpen={sidebarOpen}
        onToggle={() => setSidebarOpen(!sidebarOpen)}
        onNewChat={clearMessages}
        onOpenSettings={() => setSettingsOpen(true)}
      />
      
      <main className="flex-1 flex flex-col min-w-0">
        <ChatArea messages={messages} isLoading={isLoading} />
        <ChatInput
          onSend={sendMessage}
          isLoading={isLoading}
          hasMessages={messages.length > 0}
          isGmailConnected={isGmailConnected}
          isCalendarConnected={isCalendarConnected}
          isDriveConnected={isDriveConnected}
          onConnectService={handleConnectService}
        />
      </main>

      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        isGmailConnected={isGmailConnected}
        isCalendarConnected={isCalendarConnected}
        isDriveConnected={isDriveConnected}
        onConnectService={handleConnectService}
      />
    </div>
  );
};

export default Index;
