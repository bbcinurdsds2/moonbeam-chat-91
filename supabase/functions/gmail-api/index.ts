import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

// Allowed origins for CORS
const ALLOWED_ORIGINS = [
  'https://prkwawpjybifpybkqavf.lovable.app',
  'https://prkwawpjybifpybkqavf.supabase.co',
  Deno.env.get('ALLOWED_ORIGIN'),
].filter(Boolean) as string[];

function getCorsHeaders(req: Request) {
  const origin = req.headers.get('origin') || '';
  const isAllowed = ALLOWED_ORIGINS.some(allowed => origin === allowed || origin.endsWith('.lovable.app'));
  
  return {
    'Access-Control-Allow-Origin': isAllowed ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Credentials': 'true',
  };
}

const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID');
const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Input validation schemas
const ListEmailsSchema = z.object({
  action: z.literal('list'),
  params: z.object({
    query: z.string().max(500).optional(),
    maxResults: z.number().int().min(1).max(50).optional(),
  }).optional(),
});

const ReadEmailSchema = z.object({
  action: z.literal('read'),
  params: z.object({
    messageId: z.string().min(1).max(100),
  }),
});

const SendEmailSchema = z.object({
  action: z.literal('send'),
  params: z.object({
    to: z.string().email().max(254),
    subject: z.string().min(1).max(200),
    body: z.string().min(1).max(50000),
  }),
});

const RequestSchema = z.discriminatedUnion('action', [
  ListEmailsSchema,
  ReadEmailSchema,
  SendEmailSchema,
]);

// Authenticate user from request
async function getAuthenticatedUser(req: Request) {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.replace('Bearer ', '');
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) {
    return null;
  }

  return user;
}

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

async function getValidToken(userId: string, supabase: any): Promise<{ token: string; email: string } | null> {
  const { data } = await supabase
    .from('google_tokens')
    .select('*')
    .eq('user_id', userId)
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
      }).eq('user_id', userId).eq('service', 'gmail');
      return { token: newToken, email: data.email };
    }
    return null;
  }

  return { token: data.access_token, email: data.email };
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Validate authentication
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    
    // Validate input
    const validation = RequestSchema.safeParse(body);
    if (!validation.success) {
      return new Response(JSON.stringify({ error: 'Invalid request parameters' }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { action, params } = validation.data;

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const tokenData = await getValidToken(user.id, supabase);
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
        return new Response(JSON.stringify({ error: "Failed to fetch emails" }), {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
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
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}?format=full`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (!response.ok) {
        return new Response(JSON.stringify({ error: "Failed to read email" }), {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
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
      const { to, subject, body: emailBody } = params;

      // Create the email in RFC 2822 format
      const emailLines = [
        `To: ${to}`,
        `Subject: ${subject}`,
        `Content-Type: text/plain; charset="UTF-8"`,
        '',
        emailBody
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
        console.error("Gmail send failed");
        return new Response(JSON.stringify({ error: "Failed to send email" }), {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const result = await response.json();
      console.log("Email sent successfully");

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
    return new Response(JSON.stringify({ error: "An error occurred" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
