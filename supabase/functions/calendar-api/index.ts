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
const ListCalendarsSchema = z.object({
  calendarId: z.string().max(200).optional(),
});

const ListEventsSchema = z.object({
  calendarId: z.string().max(200).optional(),
  timeMin: z.string().datetime().optional(),
  timeMax: z.string().datetime().optional(),
  maxResults: z.number().int().min(1).max(100).optional(),
  query: z.string().max(500).optional(),
});

const CreateEventSchema = z.object({
  calendarId: z.string().max(200).optional(),
  summary: z.string().min(1).max(200),
  description: z.string().max(5000).optional(),
  location: z.string().max(200).optional(),
  start: z.string().min(1).max(50),
  end: z.string().min(1).max(50),
  allDay: z.boolean().optional(),
  attendees: z.array(z.string().email()).max(50).optional(),
});

const UpdateEventSchema = z.object({
  calendarId: z.string().max(200).optional(),
  eventId: z.string().min(1).max(200),
  summary: z.string().min(1).max(200).optional(),
  description: z.string().max(5000).optional(),
  location: z.string().max(200).optional(),
  start: z.string().max(50).optional(),
  end: z.string().max(50).optional(),
  allDay: z.boolean().optional(),
});

const DeleteEventSchema = z.object({
  calendarId: z.string().max(200).optional(),
  eventId: z.string().min(1).max(200),
});

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
    .eq('service', 'calendar')
    .single();

  if (!data) {
    return null;
  }

  const isExpired = new Date(data.expires_at) < new Date();
  
  if (isExpired && data.refresh_token) {
    const newToken = await refreshAccessToken(data.refresh_token);
    if (newToken) {
      const expiresAt = new Date(Date.now() + 3600 * 1000);
      await supabase.from('google_tokens').update({
        access_token: newToken,
        expires_at: expiresAt.toISOString(),
      }).eq('id', data.id);
      return { token: newToken, email: data.email };
    }
    return null;
  }

  return { token: data.access_token, email: data.email };
}

// List calendars
async function listCalendars(token: string) {
  const response = await fetch(
    'https://www.googleapis.com/calendar/v3/users/me/calendarList',
    { headers: { Authorization: `Bearer ${token}` } }
  );
  
  if (!response.ok) {
    return [];
  }
  
  const data = await response.json();
  return data.items || [];
}

// List events from a calendar
async function listEvents(token: string, calendarId = 'primary', options: {
  timeMin?: string;
  timeMax?: string;
  maxResults?: number;
  query?: string;
} = {}) {
  const params = new URLSearchParams();
  
  const now = new Date().toISOString();
  params.set('timeMin', options.timeMin || now);
  
  if (options.timeMax) {
    params.set('timeMax', options.timeMax);
  }
  
  params.set('maxResults', String(options.maxResults || 20));
  params.set('singleEvents', 'true');
  params.set('orderBy', 'startTime');
  
  if (options.query) {
    params.set('q', options.query);
  }

  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params}`;
  
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  
  if (!response.ok) {
    return [];
  }
  
  const data = await response.json();
  return (data.items || []).map((event: any) => ({
    id: event.id,
    summary: event.summary || '(No title)',
    description: event.description || '',
    location: event.location || '',
    start: event.start?.dateTime || event.start?.date,
    end: event.end?.dateTime || event.end?.date,
    allDay: !event.start?.dateTime,
    htmlLink: event.htmlLink,
    status: event.status,
    attendees: (event.attendees || []).map((a: any) => ({
      email: a.email,
      displayName: a.displayName,
      responseStatus: a.responseStatus,
    })),
  }));
}

// Create a new event
async function createEvent(token: string, calendarId = 'primary', eventData: {
  summary: string;
  description?: string;
  location?: string;
  start: string;
  end: string;
  allDay?: boolean;
  attendees?: string[];
}) {
  const event: any = {
    summary: eventData.summary,
    description: eventData.description,
    location: eventData.location,
  };

  if (eventData.allDay) {
    event.start = { date: eventData.start.split('T')[0] };
    event.end = { date: eventData.end.split('T')[0] };
  } else {
    event.start = { dateTime: eventData.start, timeZone: 'UTC' };
    event.end = { dateTime: eventData.end, timeZone: 'UTC' };
  }

  if (eventData.attendees && eventData.attendees.length > 0) {
    event.attendees = eventData.attendees.map(email => ({ email }));
  }

  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(event),
    }
  );

  if (!response.ok) {
    return { success: false, error: 'Failed to create event' };
  }

  const createdEvent = await response.json();
  
  return {
    success: true,
    event: {
      id: createdEvent.id,
      summary: createdEvent.summary,
      start: createdEvent.start?.dateTime || createdEvent.start?.date,
      end: createdEvent.end?.dateTime || createdEvent.end?.date,
      htmlLink: createdEvent.htmlLink,
    },
  };
}

// Update an existing event
async function updateEvent(token: string, calendarId = 'primary', eventId: string, updates: {
  summary?: string;
  description?: string;
  location?: string;
  start?: string;
  end?: string;
  allDay?: boolean;
}) {
  // First, get the existing event
  const getResponse = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  if (!getResponse.ok) {
    return { success: false, error: 'Event not found' };
  }

  const existingEvent = await getResponse.json();
  
  // Merge updates
  const updatedEvent: any = {
    ...existingEvent,
    summary: updates.summary || existingEvent.summary,
    description: updates.description ?? existingEvent.description,
    location: updates.location ?? existingEvent.location,
  };

  if (updates.start || updates.end) {
    if (updates.allDay) {
      updatedEvent.start = { date: (updates.start || existingEvent.start?.dateTime || existingEvent.start?.date).split('T')[0] };
      updatedEvent.end = { date: (updates.end || existingEvent.end?.dateTime || existingEvent.end?.date).split('T')[0] };
    } else {
      if (updates.start) updatedEvent.start = { dateTime: updates.start, timeZone: 'UTC' };
      if (updates.end) updatedEvent.end = { dateTime: updates.end, timeZone: 'UTC' };
    }
  }

  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(updatedEvent),
    }
  );

  if (!response.ok) {
    return { success: false, error: 'Failed to update event' };
  }

  const result = await response.json();
  return { success: true, event: result };
}

// Delete an event
async function deleteEvent(token: string, calendarId = 'primary', eventId: string) {
  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    }
  );

  if (!response.ok && response.status !== 204) {
    return { success: false, error: 'Failed to delete event' };
  }

  return { success: true };
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
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const url = new URL(req.url);
    const action = url.searchParams.get('action');
    const body = await req.json();

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const tokenData = await getValidToken(user.id, supabase);
    
    if (!tokenData) {
      return new Response(JSON.stringify({ 
        error: 'Google Calendar not connected or token expired',
        needsAuth: true 
      }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let result: any;

    switch (action) {
      case 'list-calendars': {
        const validation = ListCalendarsSchema.safeParse(body);
        if (!validation.success) {
          return new Response(JSON.stringify({ error: 'Invalid request parameters' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        result = await listCalendars(tokenData.token);
        break;
      }

      case 'list-events': {
        const validation = ListEventsSchema.safeParse(body);
        if (!validation.success) {
          return new Response(JSON.stringify({ error: 'Invalid request parameters' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        const params = validation.data;
        result = await listEvents(tokenData.token, params.calendarId, {
          timeMin: params.timeMin,
          timeMax: params.timeMax,
          maxResults: params.maxResults,
          query: params.query,
        });
        break;
      }

      case 'create-event': {
        const validation = CreateEventSchema.safeParse(body);
        if (!validation.success) {
          return new Response(JSON.stringify({ error: 'Invalid request parameters' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        const params = validation.data;
        result = await createEvent(tokenData.token, params.calendarId, {
          summary: params.summary,
          description: params.description,
          location: params.location,
          start: params.start,
          end: params.end,
          allDay: params.allDay,
          attendees: params.attendees,
        });
        break;
      }

      case 'update-event': {
        const validation = UpdateEventSchema.safeParse(body);
        if (!validation.success) {
          return new Response(JSON.stringify({ error: 'Invalid request parameters' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        const params = validation.data;
        result = await updateEvent(tokenData.token, params.calendarId, params.eventId, {
          summary: params.summary,
          description: params.description,
          location: params.location,
          start: params.start,
          end: params.end,
          allDay: params.allDay,
        });
        break;
      }

      case 'delete-event': {
        const validation = DeleteEventSchema.safeParse(body);
        if (!validation.success) {
          return new Response(JSON.stringify({ error: 'Invalid request parameters' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        const params = validation.data;
        result = await deleteEvent(tokenData.token, params.calendarId, params.eventId);
        break;
      }

      default:
        return new Response(JSON.stringify({ error: 'Invalid action' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }

    return new Response(JSON.stringify({ 
      success: true, 
      email: tokenData.email,
      data: result 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error("Calendar API error:", error);
    return new Response(JSON.stringify({ error: 'An error occurred' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
