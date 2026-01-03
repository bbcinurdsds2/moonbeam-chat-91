import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID');
const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Service-specific scopes
const SERVICE_SCOPES: Record<string, string[]> = {
  gmail: [
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/gmail.send',
    'https://www.googleapis.com/auth/gmail.compose',
    'https://www.googleapis.com/auth/userinfo.email',
  ],
  calendar: [
    'https://www.googleapis.com/auth/calendar.readonly',
    'https://www.googleapis.com/auth/calendar.events',
    'https://www.googleapis.com/auth/userinfo.email',
  ],
  drive: [
    'https://www.googleapis.com/auth/drive.readonly',
    'https://www.googleapis.com/auth/drive.file',
    'https://www.googleapis.com/auth/userinfo.email',
  ],
};

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
    console.log("Auth validation failed:", error?.message);
    return null;
  }

  return user;
}

serve(async (req) => {
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

    const url = new URL(req.url);
    const action = url.searchParams.get('action');

    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
      return new Response(JSON.stringify({ 
        error: "Google OAuth not configured. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET." 
      }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Generate OAuth URL for specific service
    if (action === 'authorize') {
      const service = url.searchParams.get('service') || 'gmail';
      const scopes = SERVICE_SCOPES[service];
      
      if (!scopes) {
        return new Response(JSON.stringify({ error: `Unknown service: ${service}` }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const redirectUri = `${url.origin.replace('/functions/v1/google-auth', '')}/`;
      
      // Include service and user ID in state for security
      const state = btoa(JSON.stringify({ 
        service, 
        userId: user.id,
        timestamp: Date.now() 
      }));

      const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      authUrl.searchParams.set('client_id', GOOGLE_CLIENT_ID);
      authUrl.searchParams.set('redirect_uri', redirectUri);
      authUrl.searchParams.set('response_type', 'code');
      authUrl.searchParams.set('scope', scopes.join(' '));
      authUrl.searchParams.set('access_type', 'offline');
      authUrl.searchParams.set('prompt', 'consent');
      authUrl.searchParams.set('state', state);

      console.log(`Generated auth URL for service: ${service}, user: ${user.id}`);

      return new Response(JSON.stringify({ authUrl: authUrl.toString() }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check all services status
    if (action === 'status') {
      const { data } = await supabase
        .from('google_tokens')
        .select('service, email, expires_at')
        .eq('user_id', user.id);

      const services: Record<string, { connected: boolean; email: string | null }> = {
        gmail: { connected: false, email: null },
        calendar: { connected: false, email: null },
        drive: { connected: false, email: null },
      };

      if (data) {
        for (const token of data) {
          const isExpired = new Date(token.expires_at) < new Date();
          services[token.service] = {
            connected: !isExpired,
            email: token.email,
          };
        }
      }

      return new Response(JSON.stringify(services), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Exchange code for tokens (POST)
    if (req.method === 'POST') {
      const { code, state, redirectUri } = await req.json();

      if (!code || !state) {
        return new Response(JSON.stringify({ error: 'Missing code or state' }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Decode and validate state
      let stateData: { service: string; userId: string };
      try {
        stateData = JSON.parse(atob(state));
      } catch {
        return new Response(JSON.stringify({ error: 'Invalid state' }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Verify user matches state
      if (stateData.userId !== user.id) {
        console.error("User mismatch: state userId", stateData.userId, "vs auth user", user.id);
        return new Response(JSON.stringify({ error: 'User mismatch' }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const service = stateData.service;
      console.log(`Exchanging code for service: ${service}, user: ${user.id}`);

      const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: GOOGLE_CLIENT_ID,
          client_secret: GOOGLE_CLIENT_SECRET,
          code,
          grant_type: 'authorization_code',
          redirect_uri: redirectUri,
        }),
      });

      if (!tokenResponse.ok) {
        const error = await tokenResponse.text();
        console.error("Token exchange error:", error);
        return new Response(JSON.stringify({ error: "Failed to exchange code" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const tokens = await tokenResponse.json();
      
      // Get user email from Google
      const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      const userInfo = await userInfoResponse.json();

      const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);
      const scopes = SERVICE_SCOPES[service] || [];

      // Check if entry exists for this user + service
      const { data: existing } = await supabase
        .from('google_tokens')
        .select('id')
        .eq('user_id', user.id)
        .eq('service', service)
        .single();

      if (existing) {
        // Update existing
        await supabase.from('google_tokens').update({
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token || undefined,
          expires_at: expiresAt.toISOString(),
          email: userInfo.email,
          scopes,
        }).eq('id', existing.id);
      } else {
        // Insert new
        await supabase.from('google_tokens').insert({
          user_id: user.id,
          service,
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          expires_at: expiresAt.toISOString(),
          email: userInfo.email,
          scopes,
        });
      }

      console.log(`Successfully stored tokens for ${service}, email: ${userInfo.email}`);

      return new Response(JSON.stringify({ 
        success: true, 
        email: userInfo.email,
        service,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Google auth error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
