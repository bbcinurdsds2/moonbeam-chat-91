import "https://deno.land/x/xhr@0.1.0/mod.ts";
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

async function getValidToken(sessionId: string, service: string, supabase: any): Promise<{ token: string; email: string } | null> {
  const { data } = await supabase
    .from('google_tokens')
    .select('*')
    .eq('session_id', sessionId)
    .eq('service', service)
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
      }).eq('id', data.id);
      return { token: newToken, email: data.email };
    }
    return null;
  }

  return { token: data.access_token, email: data.email };
}

// ========== GMAIL FUNCTIONS ==========
async function fetchEmails(token: string, query?: string, maxResults = 10) {
  let url = `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${maxResults}`;
  if (query) url += `&q=${encodeURIComponent(query)}`;

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) return [];

  const data = await response.json();
  const messages = data.messages || [];

  const messageDetails = await Promise.all(
    messages.slice(0, maxResults).map(async (msg: { id: string }) => {
      const msgResponse = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=full`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      return msgResponse.json();
    })
  );

  return messageDetails.map((msg: any) => {
    const headers = msg.payload?.headers || [];
    
    let body = '';
    if (msg.payload?.body?.data) {
      try {
        body = atob(msg.payload.body.data.replace(/-/g, '+').replace(/_/g, '/'));
      } catch { body = msg.snippet || ''; }
    } else if (msg.payload?.parts) {
      const textPart = msg.payload.parts.find((p: any) => p.mimeType === 'text/plain');
      if (textPart?.body?.data) {
        try {
          body = atob(textPart.body.data.replace(/-/g, '+').replace(/_/g, '/'));
        } catch { body = msg.snippet || ''; }
      }
    }
    if (!body) body = msg.snippet || '';

    return {
      id: msg.id,
      subject: headers.find((h: any) => h.name === 'Subject')?.value || '(no subject)',
      from: headers.find((h: any) => h.name === 'From')?.value || 'Unknown',
      date: headers.find((h: any) => h.name === 'Date')?.value || '',
      body: body.slice(0, 1000),
      snippet: msg.snippet,
    };
  });
}

function shouldFetchEmails(messages: any[]): boolean {
  const lastUserMessage = messages.filter(m => m.role === 'user').pop();
  if (!lastUserMessage) return false;
  
  const content = lastUserMessage.content.toLowerCase();
  const emailKeywords = [
    'email', 'emails', 'mail', 'inbox', 'gmail',
    'read my', 'check my', 'show my', 'what are my',
    'unread', 'messages', 'latest', 'recent'
  ];
  
  return emailKeywords.some(keyword => content.includes(keyword));
}

interface SendEmailParams {
  to: string;
  subject: string;
  body: string;
}

function extractSendEmailIntent(messages: any[]): SendEmailParams | null {
  const recentMessages = messages.slice(-6);
  let to = '', subject = '', body = '';
  
  for (const msg of recentMessages) {
    const content = msg.content.toLowerCase();
    
    if (content.includes('send') && (content.includes('email') || content.includes('mail'))) {
      const emailMatch = msg.content.match(/[\w.-]+@[\w.-]+\.\w+/);
      if (emailMatch) to = emailMatch[0];
      
      const subjectMatch = msg.content.match(/(?:title|subject)[:\s]+([^,.\n]+)/i);
      if (subjectMatch) subject = subjectMatch[1].trim();
      
      const bodyMatch = msg.content.match(/(?:body|content|message)[:\s]+(.+)/is);
      if (bodyMatch) body = bodyMatch[1].trim();
    }
    
    if (content.match(/^(yes|send it|go ahead|confirm|do it|ok|okay)\s*$/i)) {
      const prevAssistant = recentMessages.filter(m => m.role === 'assistant').pop();
      if (prevAssistant) {
        const draftContent = prevAssistant.content;
        const toMatch = draftContent.match(/to[:\s]+([^\n,]+@[^\n,]+)/i);
        const subjectMatch = draftContent.match(/subject[:\s]+([^\n]+)/i);
        
        if (toMatch) to = toMatch[1].trim();
        if (subjectMatch) subject = subjectMatch[1].trim();
        
        const bodyMatch = draftContent.match(/(?:body|dear|the company|hi|hello)[:\s]*\n?([\s\S]+?)(?:\n\n(?:would you|best regards|let me know|---)|$)/i);
        if (bodyMatch) body = bodyMatch[1].trim();
      }
    }
  }
  
  if (to && subject) {
    return { to, subject, body: body || `Regarding: ${subject}` };
  }
  
  return null;
}

async function sendEmail(token: string, params: SendEmailParams): Promise<{ success: boolean; message: string }> {
  const emailLines = [
    `To: ${params.to}`,
    `Subject: ${params.subject}`,
    `Content-Type: text/plain; charset="UTF-8"`,
    '',
    params.body
  ];
  const emailContent = emailLines.join('\r\n');
  
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
    return { success: false, message: `Failed to send email: ${response.status}` };
  }

  return { success: true, message: `Email sent successfully to ${params.to}` };
}

// ========== CALENDAR FUNCTIONS ==========
async function listEvents(token: string, options: {
  timeMin?: string;
  timeMax?: string;
  maxResults?: number;
} = {}) {
  const params = new URLSearchParams();
  const now = new Date().toISOString();
  params.set('timeMin', options.timeMin || now);
  
  if (options.timeMax) {
    params.set('timeMax', options.timeMax);
  }
  
  params.set('maxResults', String(options.maxResults || 15));
  params.set('singleEvents', 'true');
  params.set('orderBy', 'startTime');

  const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`;
  
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  
  if (!response.ok) {
    console.error("Failed to list events:", await response.text());
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
  }));
}

async function createEvent(token: string, eventData: {
  summary: string;
  description?: string;
  location?: string;
  start: string;
  end: string;
  allDay?: boolean;
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

  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events`,
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
    const errorText = await response.text();
    console.error("Failed to create event:", errorText);
    return { success: false, error: errorText };
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

function shouldFetchCalendar(messages: any[]): boolean {
  const lastUserMessage = messages.filter(m => m.role === 'user').pop();
  if (!lastUserMessage) return false;
  
  const content = lastUserMessage.content.toLowerCase();
  const calendarKeywords = [
    'calendar', 'events', 'event', 'schedule', 'scheduled',
    'meeting', 'meetings', 'appointment', 'appointments',
    'what do i have', 'what\'s on my', 'what is on my',
    'upcoming', 'today', 'tomorrow', 'this week', 'next week',
    'agenda', 'plans', 'busy'
  ];
  
  return calendarKeywords.some(keyword => content.includes(keyword));
}

interface CreateEventParams {
  summary: string;
  start: string;
  end: string;
  description?: string;
  location?: string;
  allDay?: boolean;
}

function extractCreateEventIntent(messages: any[]): CreateEventParams | null {
  const recentMessages = messages.slice(-6);
  
  for (const msg of recentMessages) {
    if (msg.role !== 'user') continue;
    const content = msg.content.toLowerCase();
    
    // Check for create/add/schedule event intent
    if (
      (content.includes('create') || content.includes('add') || content.includes('schedule') || content.includes('make')) &&
      (content.includes('event') || content.includes('meeting') || content.includes('appointment') || content.includes('reminder'))
    ) {
      // Try to extract event details
      const fullContent = msg.content;
      
      // Extract title/summary
      let summary = '';
      const titleMatch = fullContent.match(/(?:called|titled|named|for|about)[:\s]+["']?([^"'\n,]+)["']?/i) ||
                        fullContent.match(/(?:event|meeting|appointment|reminder)[:\s]+["']?([^"'\n,]+)["']?/i);
      if (titleMatch) {
        summary = titleMatch[1].trim();
      }
      
      // Extract date/time - look for various patterns
      let start = '';
      let end = '';
      let allDay = false;
      
      // Check for "today", "tomorrow", specific dates
      const now = new Date();
      
      if (content.includes('today')) {
        const todayDate = now.toISOString().split('T')[0];
        start = `${todayDate}T09:00:00Z`;
        end = `${todayDate}T10:00:00Z`;
      } else if (content.includes('tomorrow')) {
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowDate = tomorrow.toISOString().split('T')[0];
        start = `${tomorrowDate}T09:00:00Z`;
        end = `${tomorrowDate}T10:00:00Z`;
      }
      
      // Look for specific time patterns
      const timeMatch = content.match(/at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
      if (timeMatch && start) {
        let hour = parseInt(timeMatch[1]);
        const minute = timeMatch[2] ? parseInt(timeMatch[2]) : 0;
        const ampm = timeMatch[3]?.toLowerCase();
        
        if (ampm === 'pm' && hour < 12) hour += 12;
        if (ampm === 'am' && hour === 12) hour = 0;
        
        const datePrefix = start.split('T')[0];
        start = `${datePrefix}T${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}:00Z`;
        // Default duration 1 hour
        const endHour = hour + 1;
        end = `${datePrefix}T${endHour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}:00Z`;
      }
      
      // Extract location
      let location = '';
      const locationMatch = fullContent.match(/(?:at|in|location)[:\s]+["']?([^"'\n,]+)["']?(?:at|on|from)?/i);
      if (locationMatch && !locationMatch[1].match(/\d{1,2}(?::\d{2})?\s*(am|pm)?/i)) {
        location = locationMatch[1].trim();
      }
      
      if (summary && start && end) {
        return { summary, start, end, location: location || undefined, allDay };
      }
    }
  }
  
  // Check for confirmation to create from a draft
  const lastUserMsg = recentMessages.filter(m => m.role === 'user').pop();
  if (lastUserMsg) {
    const content = lastUserMsg.content.toLowerCase().trim();
    if (content.match(/^(yes|create it|go ahead|confirm|do it|ok|okay|sure|please)\s*$/i)) {
      // Look for draft in previous assistant message
      const prevAssistant = recentMessages.filter(m => m.role === 'assistant').pop();
      if (prevAssistant && prevAssistant.content.includes('📅')) {
        const draftContent = prevAssistant.content;
        
        const summaryMatch = draftContent.match(/\*\*(.+?)\*\*/);
        const dateMatch = draftContent.match(/(\d{4}-\d{2}-\d{2})/);
        const timeMatch = draftContent.match(/(\d{1,2}:\d{2})/);
        
        if (summaryMatch && dateMatch) {
          const summary = summaryMatch[1];
          const date = dateMatch[1];
          const time = timeMatch ? timeMatch[1] : '09:00';
          const start = `${date}T${time}:00Z`;
          const endTime = timeMatch ? `${parseInt(time.split(':')[0]) + 1}:${time.split(':')[1]}` : '10:00';
          const end = `${date}T${endTime}:00Z`;
          
          return { summary, start, end };
        }
      }
    }
  }
  
  return null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages, sessionId } = await req.json();
    const GROQ_API_KEY = Deno.env.get('GROQ_API_KEY');
    
    if (!GROQ_API_KEY) {
      throw new Error("GROQ_API_KEY is not configured");
    }

    console.log("Starting chat request with", messages.length, "messages");

    let emailContext = "";
    let calendarContext = "";
    let connectedGmail = "";
    let connectedCalendar = "";
    let actionResult = "";

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Check Gmail connection and handle email operations
    if (sessionId) {
      const gmailToken = await getValidToken(sessionId, 'gmail', supabase);
      
      if (gmailToken) {
        connectedGmail = gmailToken.email;
        
        // Check for send email intent
        const sendIntent = extractSendEmailIntent(messages);
        if (sendIntent) {
          console.log("Send email intent detected:", sendIntent);
          const result = await sendEmail(gmailToken.token, sendIntent);
          if (result.success) {
            actionResult += `\n\n✅ EMAIL SENT SUCCESSFULLY!\nTo: ${sendIntent.to}\nSubject: ${sendIntent.subject}\n\nThe email has been sent from your Gmail account (${connectedGmail}).`;
          } else {
            actionResult += `\n\n❌ Failed to send email: ${result.message}`;
          }
        }
        
        // Check if we should fetch emails
        if (shouldFetchEmails(messages)) {
          console.log("Email-related query detected, fetching emails...");
          const emails = await fetchEmails(gmailToken.token, undefined, 10);
          
          if (emails.length > 0) {
            emailContext = `\n\nThe user has connected their Gmail account (${connectedGmail}). Here are their recent emails:\n\n`;
            emailContext += `| # | From | Subject | Date |\n`;
            emailContext += `|---|------|---------|------|\n`;
            emails.forEach((email: any, index: number) => {
              const fromName = email.from.replace(/<[^>]+>/g, '').trim().substring(0, 25);
              const subjectShort = email.subject.substring(0, 50);
              const dateShort = new Date(email.date).toLocaleString('en-US', { 
                month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' 
              });
              emailContext += `| ${index + 1} | ${fromName} | ${subjectShort} | ${dateShort} |\n`;
            });
            emailContext += `\n**Summary of Key Emails:**\n`;
            emails.slice(0, 5).forEach((email: any, index: number) => {
              emailContext += `${index + 1}. **${email.from.replace(/<[^>]+>/g, '').trim()}** - ${email.snippet}\n`;
            });
          }
        }
      } else if (shouldFetchEmails(messages)) {
        emailContext = "\n\nNote: The user asked about emails but Gmail is not connected. Suggest they connect Gmail using the connectors menu.";
      }

      // Check Calendar connection and handle calendar operations
      const calendarToken = await getValidToken(sessionId, 'calendar', supabase);
      
      if (calendarToken) {
        connectedCalendar = calendarToken.email;
        
        // Check for create event intent
        const createIntent = extractCreateEventIntent(messages);
        if (createIntent) {
          console.log("Create event intent detected:", createIntent);
          const result = await createEvent(calendarToken.token, createIntent);
          if (result.success && result.event) {
            actionResult += `\n\n✅ EVENT CREATED SUCCESSFULLY!\n📅 **${result.event.summary}**\n🕐 ${new Date(result.event.start).toLocaleString()} - ${new Date(result.event.end).toLocaleString()}\n🔗 [View in Google Calendar](${result.event.htmlLink})\n\nThe event has been added to your Google Calendar (${connectedCalendar}).`;
          } else {
            actionResult += `\n\n❌ Failed to create event: ${result.error}`;
          }
        }
        
        // Check if we should fetch calendar events
        if (shouldFetchCalendar(messages) && !createIntent) {
          console.log("Calendar-related query detected, fetching events...");
          
          // Determine time range based on query
          const lastMsg = messages.filter((m: any) => m.role === 'user').pop()?.content.toLowerCase() || '';
          let timeMax: string | undefined;
          const now = new Date();
          
          if (lastMsg.includes('today')) {
            const endOfDay = new Date(now);
            endOfDay.setHours(23, 59, 59, 999);
            timeMax = endOfDay.toISOString();
          } else if (lastMsg.includes('tomorrow')) {
            const tomorrow = new Date(now);
            tomorrow.setDate(tomorrow.getDate() + 1);
            tomorrow.setHours(23, 59, 59, 999);
            timeMax = tomorrow.toISOString();
          } else if (lastMsg.includes('this week')) {
            const endOfWeek = new Date(now);
            endOfWeek.setDate(endOfWeek.getDate() + (7 - endOfWeek.getDay()));
            timeMax = endOfWeek.toISOString();
          } else if (lastMsg.includes('next week')) {
            const nextWeekEnd = new Date(now);
            nextWeekEnd.setDate(nextWeekEnd.getDate() + 14);
            timeMax = nextWeekEnd.toISOString();
          }
          
          const events = await listEvents(calendarToken.token, { timeMax, maxResults: 15 });
          
          if (events.length > 0) {
            calendarContext = `\n\nThe user has connected their Google Calendar (${connectedCalendar}). Here are their upcoming events:\n\n`;
            calendarContext += `| # | Event | Date & Time | Location |\n`;
            calendarContext += `|---|-------|-------------|----------|\n`;
            events.forEach((event: any, index: number) => {
              const startDate = new Date(event.start);
              const dateStr = event.allDay 
                ? startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) + ' (All day)'
                : startDate.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
              const location = event.location ? event.location.substring(0, 20) : '-';
              calendarContext += `| ${index + 1} | ${event.summary.substring(0, 35)} | ${dateStr} | ${location} |\n`;
            });
          } else {
            calendarContext = `\n\nThe user has connected their Google Calendar (${connectedCalendar}), but they have no upcoming events in the requested time period.`;
          }
        }
      } else if (shouldFetchCalendar(messages)) {
        calendarContext = "\n\nNote: The user asked about calendar/events but Google Calendar is not connected. Suggest they connect Google Calendar using the connectors menu.";
      }
    }

    const systemPrompt = `You are Akronom, an advanced AI assistant. Your name is Akronom. You help users with tasks, answer questions, and provide thoughtful, comprehensive responses. Be helpful, concise when appropriate, and thorough when needed.

You have access to the user's Google services when they connect them:

## Gmail (${connectedGmail ? `Connected: ${connectedGmail}` : 'Not connected'})
1. READ emails - When the user asks about their emails, display them in a clean table format
2. SEND emails - When the user asks to send an email, help draft it and send when they confirm

## Google Calendar (${connectedCalendar ? `Connected: ${connectedCalendar}` : 'Not connected'})
1. VIEW events - When the user asks about their schedule/calendar, display events in a clean table
2. CREATE events - When the user asks to create an event/meeting/appointment, extract the details:
   - Ask for: title, date, time, and optionally location
   - Then create the event when they confirm
   - Format: "Create an event called [title] tomorrow at 3pm" or similar

When displaying events, use a clean markdown table with columns: #, Event, Date & Time, Location
When creating events, confirm the details with the user before creating.

If a service is not connected, politely suggest they connect it using the connectors menu.
${emailContext}${calendarContext}${actionResult}`;

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        messages: [
          { role: "system", content: systemPrompt },
          ...messages,
        ],
        stream: true,
        max_tokens: 4096,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Groq API error:", response.status, errorText);
      
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      
      return new Response(JSON.stringify({ error: "AI service error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("Streaming response started");

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (error) {
    console.error("Chat function error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
