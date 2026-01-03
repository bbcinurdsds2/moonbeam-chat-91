import { useState, useEffect, useCallback } from "react";
import { useAuth } from "./useAuth";

export type GoogleService = 'gmail' | 'calendar' | 'drive';

interface ServiceStatus {
  connected: boolean;
  email: string | null;
}

export const useGoogleServices = () => {
  const { user, session, isAuthenticated } = useAuth();
  const [services, setServices] = useState<Record<GoogleService, ServiceStatus>>({
    gmail: { connected: false, email: null },
    calendar: { connected: false, email: null },
    drive: { connected: false, email: null },
  });
  const [isLoading, setIsLoading] = useState(true);

  const checkAllConnections = useCallback(async () => {
    if (!session) {
      setIsLoading(false);
      return;
    }

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/google-auth?action=status`,
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
        }
      );

      if (response.ok) {
        const result = await response.json();
        setServices({
          gmail: result.gmail || { connected: false, email: null },
          calendar: result.calendar || { connected: false, email: null },
          drive: result.drive || { connected: false, email: null },
        });
      }
    } catch (error) {
      console.error('Error checking Google services:', error);
    } finally {
      setIsLoading(false);
    }
  }, [session]);

  useEffect(() => {
    if (!isAuthenticated || !session) {
      setIsLoading(false);
      return;
    }

    // Check if returning from OAuth
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    const state = urlParams.get('state');

    if (code && state) {
      handleOAuthCallback(code, state);
    } else {
      checkAllConnections();
    }
  }, [isAuthenticated, session, checkAllConnections]);

  const handleOAuthCallback = async (code: string, state: string) => {
    if (!session) return;

    try {
      // Decode state to get service
      const stateData = JSON.parse(atob(state));
      const { service } = stateData;
      
      const redirectUri = `${window.location.origin}/`;
      
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/google-auth`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ code, state, redirectUri }),
        }
      );

      const result = await response.json();
      
      if (result.success) {
        setServices(prev => ({
          ...prev,
          [service]: { connected: true, email: result.email },
        }));
      }
      
      // Clean up URL
      window.history.replaceState({}, document.title, window.location.pathname);
      await checkAllConnections();
    } catch (error) {
      console.error('Error exchanging code:', error);
    }
  };

  const connect = async (service: GoogleService) => {
    if (!session) {
      throw new Error("You must be logged in to connect services");
    }

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/google-auth?action=authorize&service=${service}`,
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
        }
      );

      const result = await response.json();
      
      if (result.authUrl) {
        window.location.href = result.authUrl;
      } else if (result.error) {
        throw new Error(result.error);
      }
    } catch (error) {
      console.error(`Error initiating ${service} auth:`, error);
      throw error;
    }
  };

  return {
    services,
    isLoading,
    userId: user?.id,
    connect,
    isGmailConnected: services.gmail.connected,
    isCalendarConnected: services.calendar.connected,
    isDriveConnected: services.drive.connected,
    gmailEmail: services.gmail.email,
    calendarEmail: services.calendar.email,
    driveEmail: services.drive.email,
  };
};
