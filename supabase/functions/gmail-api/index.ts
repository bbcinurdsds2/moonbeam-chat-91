import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID');
const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET');

async function refreshAccessToken(refreshToken: string): Promise<string | null> {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID!,
      client_secret: GOOGLE_CLIENT_SECRET!,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  if (!response.ok) return null;
  const data = await response.json();
  return data.access_token;
}

async function getValidToken(sessionId: string, supabase: any): Promise<{ token: string; email: string } | null> {
  const { data } = await supabase
    .from('google_tokens')
    .select('*')
    .eq('session_id', sessionId)
    .eq('service', 'gmail')
    .single();

  if (!data) return null;

  const isExpired = new Date(data.expires_at) < new Date();
  
  if (isExpired && data.refresh_token) {
    const newToken = await refreshAccessToken(data.refresh_token);
    if (newToken) {
      const expiresAt = new Date(Date.now() + 3600 * 1000);
      await supabase.from('google_tokens').update({
        access_token: newToken,
        expires_at: expiresAt.toISOString(),
      }).eq('session_id', sessionId).eq('service', 'gmail');
      return { token: newToken, email: data.email };
    }
    return null;
  }

  return { token: data.access_token, email: data.email };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { sessionId, action, params } = await req.json();

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const tokenData = await getValidToken(sessionId, supabase);
    if (!tokenData) {
      return new Response(JSON.stringify({ 
        error: "Gmail not connected or token expired",
        needsReauth: true 
      }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { token, email } = tokenData;

    // List messages
    if (action === 'list') {
      const maxResults = params?.maxResults || 10;
      const query = params?.query || '';
      
      let url = `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${maxResults}`;
      if (query) url += `&q=${encodeURIComponent(query)}`;

      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        throw new Error(`Gmail API error: ${response.status}`);
      }

      const data = await response.json();
      const messages = data.messages || [];

      // Fetch message details
      const messageDetails = await Promise.all(
        messages.slice(0, 10).map(async (msg: { id: string }) => {
          const msgResponse = await fetch(
            `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`,
            { headers: { Authorization: `Bearer ${token}` } }
          );
          return msgResponse.json();
        })
      );

      const formattedMessages = messageDetails.map((msg: any) => {
        const headers = msg.payload?.headers || [];
        return {
          id: msg.id,
          snippet: msg.snippet,
          subject: headers.find((h: any) => h.name === 'Subject')?.value || '(no subject)',
          from: headers.find((h: any) => h.name === 'From')?.value || 'Unknown',
          date: headers.find((h: any) => h.name === 'Date')?.value || '',
        };
      });

      return new Response(JSON.stringify({ 
        emails: formattedMessages,
        connectedEmail: email 
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Read specific message
    if (action === 'read') {
      const { messageId } = params;
      
      const response = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (!response.ok) {
        throw new Error(`Gmail API error: ${response.status}`);
      }

      const msg = await response.json();
      const headers = msg.payload?.headers || [];
      
      // Extract body
      let body = '';
      if (msg.payload?.body?.data) {
        body = atob(msg.payload.body.data.replace(/-/g, '+').replace(/_/g, '/'));
      } else if (msg.payload?.parts) {
        const textPart = msg.payload.parts.find((p: any) => p.mimeType === 'text/plain');
        if (textPart?.body?.data) {
          body = atob(textPart.body.data.replace(/-/g, '+').replace(/_/g, '/'));
        }
      }

      return new Response(JSON.stringify({
        id: msg.id,
        subject: headers.find((h: any) => h.name === 'Subject')?.value || '(no subject)',
        from: headers.find((h: any) => h.name === 'From')?.value || 'Unknown',
        to: headers.find((h: any) => h.name === 'To')?.value || '',
        date: headers.find((h: any) => h.name === 'Date')?.value || '',
        body,
        snippet: msg.snippet,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Send email
    if (action === 'send') {
      const { to, subject, body } = params;
      
      if (!to || !subject || !body) {
        return new Response(JSON.stringify({ error: "Missing required fields: to, subject, body" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Create the email in RFC 2822 format
      const emailLines = [
        `To: ${to}`,
        `Subject: ${subject}`,
        `Content-Type: text/plain; charset="UTF-8"`,
        '',
        body
      ];
      const emailContent = emailLines.join('\r\n');
      
      // Base64url encode the email
      const encodedEmail = btoa(unescape(encodeURIComponent(emailContent)))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');

      const response = await fetch(
        'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ raw: encodedEmail }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Gmail send error:", errorText);
        throw new Error(`Failed to send email: ${response.status}`);
      }

      const result = await response.json();
      console.log("Email sent successfully:", result.id);

      return new Response(JSON.stringify({
        success: true,
        messageId: result.id,
        message: `Email sent successfully to ${to}`,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Gmail API error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});