import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

const SESSION_KEY = 'gmail_session_id';

function getOrCreateSessionId(): string {
  let sessionId = localStorage.getItem(SESSION_KEY);
  if (!sessionId) {
    sessionId = crypto.randomUUID();
    localStorage.setItem(SESSION_KEY, sessionId);
  }
  return sessionId;
}

export const useGmail = () => {
  const [isConnected, setIsConnected] = useState(false);
  const [connectedEmail, setConnectedEmail] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const sessionId = getOrCreateSessionId();

  const checkConnection = useCallback(async () => {
    try {
      const { data, error } = await supabase.functions.invoke('gmail-auth', {
        body: { sessionId },
        headers: { 'Content-Type': 'application/json' },
      });

      // Add action as query param workaround
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/gmail-auth?action=check-status`,
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
      setIsConnected(result.connected || false);
      setConnectedEmail(result.email || null);
    } catch (error) {
      console.error('Error checking Gmail connection:', error);
      setIsConnected(false);
    } finally {
      setIsLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    checkConnection();

    // Check if returning from OAuth
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    const state = urlParams.get('state');

    if (code && state === sessionId) {
      handleOAuthCallback(code);
    }
  }, [checkConnection, sessionId]);

  const handleOAuthCallback = async (code: string) => {
    try {
      const redirectUri = `${window.location.origin}/`;
      
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/gmail-auth?action=exchange-code`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({ code, redirectUri, sessionId }),
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
    try {
      const redirectUri = `${window.location.origin}/`;
      
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/gmail-auth?action=get-auth-url`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({ sessionId, redirectUri }),
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
    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/gmail-api`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ 
          sessionId, 
          action: 'list',
          params: { query, maxResults }
        }),
      }
    );

    return response.json();
  };

  const readEmail = async (messageId: string) => {
    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/gmail-api`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ 
          sessionId, 
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
    sessionId,
  };
};