import { useState, useEffect, useCallback } from "react";

const SESSION_KEY = 'google_session_id';

export type GoogleService = 'gmail' | 'calendar' | 'drive';

interface ServiceStatus {
  connected: boolean;
  email: string | null;
}

function getOrCreateSessionId(): string {
  let sessionId = localStorage.getItem(SESSION_KEY);
  if (!sessionId) {
    // Also check old key for migration
    sessionId = localStorage.getItem('gmail_session_id');
    if (sessionId) {
      localStorage.setItem(SESSION_KEY, sessionId);
    } else {
      sessionId = crypto.randomUUID();
      localStorage.setItem(SESSION_KEY, sessionId);
    }
  }
  return sessionId;
}

export const useGoogleServices = () => {
  const [services, setServices] = useState<Record<GoogleService, ServiceStatus>>({
    gmail: { connected: false, email: null },
    calendar: { connected: false, email: null },
    drive: { connected: false, email: null },
  });
  const [isLoading, setIsLoading] = useState(true);
  const sessionId = getOrCreateSessionId();

  const checkAllConnections = useCallback(async () => {
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/google-auth?action=check-all-status`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({ sessionId }),
        }
      );

      const result = await response.json();
      if (result.services) {
        setServices(result.services);
      }
    } catch (error) {
      console.error('Error checking Google services:', error);
    } finally {
      setIsLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    checkAllConnections();

    // Check if returning from OAuth
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    const state = urlParams.get('state');

    if (code && state) {
      handleOAuthCallback(code, state);
    }
  }, [checkAllConnections]);

  const handleOAuthCallback = async (code: string, state: string) => {
    try {
      // Decode state to get service and sessionId
      const stateData = JSON.parse(atob(state));
      const { service } = stateData;
      
      const redirectUri = `${window.location.origin}/`;
      
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/google-auth?action=exchange-code`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({ code, redirectUri, sessionId, service }),
        }
      );

      const result = await response.json();
      
      if (result.success) {
        setServices(prev => ({
          ...prev,
          [service]: { connected: true, email: result.email },
        }));
        // Clean up URL
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    } catch (error) {
      console.error('Error exchanging code:', error);
    }
  };

  const connect = async (service: GoogleService) => {
    try {
      const redirectUri = `${window.location.origin}/`;
      
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/google-auth?action=get-auth-url`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({ sessionId, redirectUri, service }),
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
    sessionId,
    connect,
    isGmailConnected: services.gmail.connected,
    isCalendarConnected: services.calendar.connected,
    isDriveConnected: services.drive.connected,
    gmailEmail: services.gmail.email,
    calendarEmail: services.calendar.email,
    driveEmail: services.drive.email,
  };
};
