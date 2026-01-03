import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export const useGmail = () => {
  const [isConnected, setIsConnected] = useState(false);
  const [connectedEmail, setConnectedEmail] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { session } = useAuth();

  const checkConnection = useCallback(async () => {
    if (!session?.access_token) {
      setIsConnected(false);
      setIsLoading(false);
      return;
    }

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/gmail-auth?action=check-status`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({}),
        }
      );

      const result = await response.json();
      setIsConnected(result.connected || false);
      setConnectedEmail(result.email || null);
    } catch (error) {
      console.error('Error checking Gmail connection:', error);
      setIsConnected(false);
    } finally {
      setIsLoading(false);
    }
  }, [session?.access_token]);

  useEffect(() => {
    checkConnection();

    // Check if returning from OAuth
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    const state = urlParams.get('state');

    if (code && state && session?.access_token) {
      handleOAuthCallback(code, state);
    }
  }, [checkConnection, session?.access_token]);

  const handleOAuthCallback = async (code: string, state: string) => {
    if (!session?.access_token) return;

    try {
      const redirectUri = `${window.location.origin}/`;
      
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/gmail-auth?action=exchange-code`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ code, redirectUri, state }),
        }
      );

      const result = await response.json();
      
      if (result.success) {
        setIsConnected(true);
        setConnectedEmail(result.email);
        // Clean up URL
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    } catch (error) {
      console.error('Error exchanging code:', error);
    }
  };

  const connect = async () => {
    if (!session?.access_token) {
      throw new Error('Must be logged in to connect Gmail');
    }

    try {
      const redirectUri = `${window.location.origin}/`;
      
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/gmail-auth?action=get-auth-url`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ redirectUri }),
        }
      );

      const result = await response.json();
      
      if (result.authUrl) {
        window.location.href = result.authUrl;
      } else if (result.error) {
        throw new Error(result.error);
      }
    } catch (error) {
      console.error('Error initiating Gmail auth:', error);
      throw error;
    }
  };

  const getEmails = async (query?: string, maxResults = 10) => {
    if (!session?.access_token) {
      throw new Error('Must be logged in to access emails');
    }

    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/gmail-api`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ 
          action: 'list',
          params: { query, maxResults }
        }),
      }
    );

    return response.json();
  };

  const readEmail = async (messageId: string) => {
    if (!session?.access_token) {
      throw new Error('Must be logged in to read emails');
    }

    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/gmail-api`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ 
          action: 'read',
          params: { messageId }
        }),
      }
    );

    return response.json();
  };

  return {
    isConnected,
    connectedEmail,
    isLoading,
    connect,
    getEmails,
    readEmail,
  };
};
