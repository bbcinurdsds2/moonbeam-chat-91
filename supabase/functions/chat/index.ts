import "https://deno.land/x/xhr@0.1.0/mod.ts";
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

async function getValidToken(userId: string, service: string, supabase: any): Promise<{ token: string; email: string } | null> {
  const { data } = await supabase
    .from('google_tokens')
    .select('*')
    .eq('user_id', userId)
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

function parseFlexibleDate(text: string): { start: string; end: string; allDay: boolean } | null {
  const now = new Date();
  const content = text.toLowerCase();
  
  // Month name mapping
  const months: Record<string, number> = {
    'january': 0, 'jan': 0, 'february': 1, 'feb': 1, 'march': 2, 'mar': 2,
    'april': 3, 'apr': 3, 'may': 4, 'june': 5, 'jun': 5, 'july': 6, 'jul': 6,
    'august': 7, 'aug': 7, 'september': 8, 'sep': 8, 'sept': 8, 'october': 9, 'oct': 9,
    'november': 10, 'nov': 10, 'december': 11, 'dec': 11
  };
  
  let targetDate: Date | null = null;
  let allDay = true;
  
  // Check for "today"
  if (content.includes('today')) {
    targetDate = new Date(now);
  }
  // Check for "tomorrow"
  else if (content.includes('tomorrow')) {
    targetDate = new Date(now);
    targetDate.setDate(targetDate.getDate() + 1);
  }
  // Check for "next week"
  else if (content.includes('next week')) {
    targetDate = new Date(now);
    targetDate.setDate(targetDate.getDate() + 7);
  }
  // Check for specific date patterns: "May 2026", "May 15 2026", "May 15, 2026", "15 May 2026"
  else {
    // Pattern: "Month Year" (e.g., "May 2026") - use first day of month
    const monthYearMatch = content.match(/\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\s+(\d{4})\b/i);
    if (monthYearMatch) {
      const month = months[monthYearMatch[1].toLowerCase()];
      const year = parseInt(monthYearMatch[2]);
      targetDate = new Date(year, month, 1);
    }
    
    // Pattern: "Month Day Year" (e.g., "May 15 2026" or "May 15, 2026")
    const monthDayYearMatch = content.match(/\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b/i);
    if (monthDayYearMatch) {
      const month = months[monthDayYearMatch[1].toLowerCase()];
      const day = parseInt(monthDayYearMatch[2]);
      const year = parseInt(monthDayYearMatch[3]);
      targetDate = new Date(year, month, day);
    }
    
    // Pattern: "Day Month Year" (e.g., "15 May 2026" or "15th May 2026")
    const dayMonthYearMatch = content.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\s+(\d{4})\b/i);
    if (dayMonthYearMatch && !targetDate) {
      const day = parseInt(dayMonthYearMatch[1]);
      const month = months[dayMonthYearMatch[2].toLowerCase()];
      const year = parseInt(dayMonthYearMatch[3]);
      targetDate = new Date(year, month, day);
    }
    
    // Pattern: YYYY-MM-DD or MM/DD/YYYY
    const isoMatch = content.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
    if (isoMatch) {
      targetDate = new Date(parseInt(isoMatch[1]), parseInt(isoMatch[2]) - 1, parseInt(isoMatch[3]));
    }
    
    const usDateMatch = content.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/);
    if (usDateMatch && !targetDate) {
      targetDate = new Date(parseInt(usDateMatch[3]), parseInt(usDateMatch[1]) - 1, parseInt(usDateMatch[2]));
    }
  }
  
  if (!targetDate || isNaN(targetDate.getTime())) {
    return null;
  }
  
  // Check for specific time
  const timeMatch = content.match(/(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  if (timeMatch) {
    let hour = parseInt(timeMatch[1]);
    const minute = timeMatch[2] ? parseInt(timeMatch[2]) : 0;
    const ampm = timeMatch[3]?.toLowerCase();
    
    if (ampm === 'pm' && hour < 12) hour += 12;
    if (ampm === 'am' && hour === 12) hour = 0;
    
    // Only use time if it looks like a valid time (not a day number)
    if (hour >= 0 && hour <= 23 && (ampm || hour > 12)) {
      targetDate.setHours(hour, minute, 0, 0);
      allDay = false;
    }
  }
  
  const start = allDay 
    ? targetDate.toISOString().split('T')[0]
    : targetDate.toISOString();
    
  const endDate = new Date(targetDate);
  if (allDay) {
    endDate.setDate(endDate.getDate() + 1);
  } else {
    endDate.setHours(endDate.getHours() + 1);
  }
  
  const end = allDay
    ? endDate.toISOString().split('T')[0]
    : endDate.toISOString();
  
  return { start, end, allDay };
}

function extractCreateEventIntent(messages: any[]): CreateEventParams | null {
  const recentMessages = messages.slice(-6);
  
  for (const msg of recentMessages) {
    if (msg.role !== 'user') continue;
    const content = msg.content.toLowerCase();
    const fullContent = msg.content;
    
    // Check for create/add/schedule event intent - broader matching
    const hasCreateIntent = 
      (content.includes('create') || content.includes('add') || content.includes('schedule') || 
       content.includes('make') || content.includes('set') || content.includes('put') || 
       content.includes('new event') || content.includes('remind me')) &&
      (content.includes('event') || content.includes('meeting') || content.includes('appointment') || 
       content.includes('reminder') || content.includes('calendar') ||
       // Also match if there's a date mentioned without explicit event keyword
       /\b(january|february|march|april|may|june|july|august|september|october|november|december|today|tomorrow)\b/i.test(content));
    
    if (hasCreateIntent) {
      // Extract title/summary - try various patterns
      let summary = '';
      
      // Try explicit title patterns
      const titleMatch = fullContent.match(/(?:called|titled|named|for|about|event)\s*[:\-]?\s*["']?([^"'\n,]+?)["']?\s*(?:on|at|in|for|$)/i);
      if (titleMatch) {
        summary = titleMatch[1].trim();
      }
      
      // If no explicit title, try to extract the action/thing
      if (!summary) {
        // Look for "create event, [action]" pattern
        const actionMatch = fullContent.match(/(?:event|reminder|meeting)[,:]?\s+(.+?)(?:on|at|in|,|\s+(?:january|february|march|april|may|june|july|august|september|october|november|december|today|tomorrow))/i);
        if (actionMatch) {
          summary = actionMatch[1].trim();
        }
      }
      
      // If still no summary, take everything before the date as the summary
      if (!summary) {
        const beforeDateMatch = fullContent.match(/(.+?)\s*(?:on|at|in|for)?\s*(?:january|february|march|april|may|june|july|august|september|october|november|december|today|tomorrow|\d{4})/i);
        if (beforeDateMatch) {
          summary = beforeDateMatch[1]
            .replace(/^(?:create|add|schedule|make|set|put|new)\s*(?:an?)?\s*(?:event|meeting|appointment|reminder)?\s*[,:]?\s*/i, '')
            .trim();
        }
      }
      
      // Clean up summary
      if (summary) {
        summary = summary.replace(/[,.]$/, '').trim();
        // Capitalize first letter
        summary = summary.charAt(0).toUpperCase() + summary.slice(1);
      }
      
      // Parse the date
      const dateInfo = parseFlexibleDate(content);
      
      // Extract location
      let location = '';
      const locationMatch = fullContent.match(/(?:at|in|location)[:\s]+["']?([^"'\n,]+?)["']?\s*(?:on|at\s+\d|$)/i);
      if (locationMatch && !locationMatch[1].match(/\d{1,2}(?::\d{2})?\s*(am|pm)?/i)) {
        location = locationMatch[1].trim();
      }
      
      if (summary && dateInfo) {
        console.log("Extracted event intent:", { summary, ...dateInfo, location });
        return { 
          summary, 
          start: dateInfo.start, 
          end: dateInfo.end, 
          allDay: dateInfo.allDay,
          location: location || undefined 
        };
      }
    }
  }
  
  // Check for confirmation to create from a draft
  const lastUserMsg = recentMessages.filter(m => m.role === 'user').pop();
  if (lastUserMsg) {
    const content = lastUserMsg.content.toLowerCase().trim();
    if (content.match(/^(yes|create it|go ahead|confirm|do it|ok|okay|sure|please|yep|yeah)\s*[.!]?$/i)) {
      // Look for draft in previous assistant message
      const prevAssistant = recentMessages.filter(m => m.role === 'assistant').pop();
      if (prevAssistant && (prevAssistant.content.includes('📅') || prevAssistant.content.toLowerCase().includes('event'))) {
        const draftContent = prevAssistant.content;
        
        // Try to extract event details from the draft
        const summaryMatch = draftContent.match(/\*\*(.+?)\*\*/) || 
                            draftContent.match(/(?:Title|Event)[:\s]+(.+?)(?:\n|$)/i);
        
        let summary = summaryMatch ? summaryMatch[1].trim() : '';
        
        // Parse date from draft content
        const dateInfo = parseFlexibleDate(draftContent.toLowerCase());
        
        if (summary && dateInfo) {
          console.log("Extracted event from draft confirmation:", { summary, ...dateInfo });
          return { summary, start: dateInfo.start, end: dateInfo.end, allDay: dateInfo.allDay };
        }
      }
    }
  }
  
  return null;
}

// Track processed actions to prevent duplicates
const processedActions = new Map<string, boolean>();

function getActionKey(type: string, identifier: string): string {
  return `${type}:${identifier}`;
}

function hasProcessedAction(messages: any[], type: string, identifier: string): boolean {
  // Check if this action was already processed in a previous assistant message
  const key = `${type}:${identifier}`.toLowerCase();
  for (const msg of messages) {
    if (msg.role === 'assistant' && msg.content) {
      const content = msg.content.toLowerCase();
      if (type === 'calendar' && content.includes('event created') && content.includes(identifier.toLowerCase())) {
        return true;
      }
      if (type === 'email' && content.includes('email sent') && content.includes(identifier.toLowerCase())) {
        return true;
      }
    }
  }
  return false;
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

    const { messages } = await req.json();
    const GROQ_API_KEY = Deno.env.get('GROQ_API_KEY');
    
    if (!GROQ_API_KEY) {
      throw new Error("GROQ_API_KEY is not configured");
    }

    console.log("Starting chat request for user:", user.id, "with", messages.length, "messages");

    let emailContext = "";
    let calendarContext = "";
    let connectedGmail = "";
    let connectedCalendar = "";
    let actionResult = "";

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Check Gmail connection and handle email operations
    const gmailToken = await getValidToken(user.id, 'gmail', supabase);
    
    if (gmailToken) {
      connectedGmail = gmailToken.email;
      
      // Check for send email intent - but only if not already processed
      const sendIntent = extractSendEmailIntent(messages);
      if (sendIntent) {
        const actionKey = `${sendIntent.to}:${sendIntent.subject}`;
        if (!hasProcessedAction(messages, 'email', actionKey)) {
          console.log("Send email intent detected:", sendIntent);
          const result = await sendEmail(gmailToken.token, sendIntent);
          if (result.success) {
            actionResult += `\n\n✅ EMAIL SENT SUCCESSFULLY!\nTo: ${sendIntent.to}\nSubject: ${sendIntent.subject}\n\nThe email has been sent from your Gmail account (${connectedGmail}).`;
          } else {
            actionResult += `\n\n❌ Failed to send email: ${result.message}`;
          }
        } else {
          console.log("Email already sent, skipping duplicate");
        }
      }
      
      // Check if we should fetch emails
      if (shouldFetchEmails(messages) && !sendIntent) {
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
        }
      }
    } else if (shouldFetchEmails(messages)) {
      emailContext = "\n\nNote: The user asked about emails but Gmail is not connected. Suggest they connect Gmail using the connectors menu.";
    }

    // Check Calendar connection and handle calendar operations
    const calendarToken = await getValidToken(user.id, 'calendar', supabase);
    
    if (calendarToken) {
      connectedCalendar = calendarToken.email;
      
      // Check for create event intent - but only if not already processed
      const createIntent = extractCreateEventIntent(messages);
      if (createIntent) {
        const actionKey = `${createIntent.summary}:${createIntent.start}`;
        if (!hasProcessedAction(messages, 'calendar', actionKey)) {
          console.log("Create event intent detected:", createIntent);
          const result = await createEvent(calendarToken.token, createIntent);
          if (result.success && result.event) {
            actionResult += `\n\n✅ EVENT CREATED SUCCESSFULLY!\n📅 **${result.event.summary}**\n🕐 ${new Date(result.event.start).toLocaleString()} - ${new Date(result.event.end).toLocaleString()}\n🔗 [View in Google Calendar](${result.event.htmlLink})\n\nThe event has been added to your Google Calendar (${connectedCalendar}).`;
          } else {
            actionResult += `\n\n❌ Failed to create event: ${result.error}`;
          }
        } else {
          console.log("Event already created, skipping duplicate");
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
