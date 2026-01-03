import { Calendar, Mail, HardDrive, CheckCircle2, XCircle, ExternalLink, MapPin, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

interface EventData {
  summary: string;
  start: string;
  end?: string;
  location?: string;
  htmlLink?: string;
}

interface EmailData {
  from: string;
  subject: string;
  date: string;
  snippet?: string;
}

interface ConnectorResultCardProps {
  type: 'calendar-created' | 'email-sent' | 'email-list' | 'calendar-list' | 'error';
  success?: boolean;
  title?: string;
  message?: string;
  event?: EventData;
  email?: { to: string; subject: string };
  emails?: EmailData[];
  events?: EventData[];
  account?: string;
}

export const ConnectorResultCard = ({
  type,
  success = true,
  title,
  message,
  event,
  email,
  emails,
  events,
  account,
}: ConnectorResultCardProps) => {
  const getIcon = () => {
    switch (type) {
      case 'calendar-created':
      case 'calendar-list':
        return <Calendar className="h-5 w-5" />;
      case 'email-sent':
      case 'email-list':
        return <Mail className="h-5 w-5" />;
      default:
        return success ? <CheckCircle2 className="h-5 w-5" /> : <XCircle className="h-5 w-5" />;
    }
  };

  const getHeaderColor = () => {
    if (!success) return 'bg-destructive/10 text-destructive border-destructive/20';
    switch (type) {
      case 'calendar-created':
      case 'calendar-list':
        return 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20';
      case 'email-sent':
      case 'email-list':
        return 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20';
      default:
        return 'bg-primary/10 text-primary border-primary/20';
    }
  };

  // Render calendar event created card
  if (type === 'calendar-created' && event) {
    const startDate = new Date(event.start);
    const isAllDay = !event.start.includes('T');
    
    return (
      <div className="my-4 rounded-xl border border-border/50 bg-card overflow-hidden shadow-sm">
        <div className={cn("flex items-center gap-2 px-4 py-3 border-b", getHeaderColor())}>
          {getIcon()}
          <span className="font-medium">Event Created</span>
          {success && <CheckCircle2 className="h-4 w-4 ml-auto text-green-500" />}
        </div>
        <div className="p-4 space-y-3">
          <div className="flex items-start gap-3">
            <div className="w-12 h-12 rounded-lg bg-blue-500/10 flex flex-col items-center justify-center text-blue-600 dark:text-blue-400">
              <span className="text-xs font-medium uppercase">
                {startDate.toLocaleDateString('en-US', { month: 'short' })}
              </span>
              <span className="text-lg font-bold leading-none">
                {startDate.getDate()}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="font-semibold text-foreground truncate">{event.summary}</h4>
              <div className="flex items-center gap-1 text-sm text-muted-foreground mt-1">
                <Clock className="h-3.5 w-3.5" />
                <span>
                  {isAllDay 
                    ? 'All day' 
                    : startDate.toLocaleString('en-US', { 
                        weekday: 'short',
                        hour: 'numeric', 
                        minute: '2-digit',
                        hour12: true 
                      })
                  }
                </span>
              </div>
              {event.location && (
                <div className="flex items-center gap-1 text-sm text-muted-foreground mt-1">
                  <MapPin className="h-3.5 w-3.5" />
                  <span className="truncate">{event.location}</span>
                </div>
              )}
            </div>
          </div>
          {event.htmlLink && (
            <a 
              href={event.htmlLink} 
              target="_blank" 
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-blue-600 dark:text-blue-400 hover:underline"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              View in Google Calendar
            </a>
          )}
          {account && (
            <p className="text-xs text-muted-foreground">Added to {account}</p>
          )}
        </div>
      </div>
    );
  }

  // Render email sent card
  if (type === 'email-sent' && email) {
    return (
      <div className="my-4 rounded-xl border border-border/50 bg-card overflow-hidden shadow-sm">
        <div className={cn("flex items-center gap-2 px-4 py-3 border-b", getHeaderColor())}>
          {getIcon()}
          <span className="font-medium">Email Sent</span>
          {success && <CheckCircle2 className="h-4 w-4 ml-auto text-green-500" />}
        </div>
        <div className="p-4 space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground w-12">To:</span>
            <span className="text-sm font-medium text-foreground">{email.to}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground w-12">Subject:</span>
            <span className="text-sm font-medium text-foreground">{email.subject}</span>
          </div>
          {account && (
            <p className="text-xs text-muted-foreground mt-2">Sent from {account}</p>
          )}
        </div>
      </div>
    );
  }

  // Render email list
  if (type === 'email-list' && emails && emails.length > 0) {
    return (
      <div className="my-4 rounded-xl border border-border/50 bg-card overflow-hidden shadow-sm">
        <div className={cn("flex items-center gap-2 px-4 py-3 border-b", getHeaderColor())}>
          {getIcon()}
          <span className="font-medium">Recent Emails</span>
          <span className="ml-auto text-xs text-muted-foreground">{emails.length} emails</span>
        </div>
        <div className="divide-y divide-border/50">
          {emails.map((emailItem, index) => (
            <div key={index} className="px-4 py-3 hover:bg-muted/30 transition-colors">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm text-foreground truncate">
                    {emailItem.from.replace(/<[^>]+>/g, '').trim()}
                  </p>
                  <p className="text-sm text-foreground/80 truncate">{emailItem.subject}</p>
                  {emailItem.snippet && (
                    <p className="text-xs text-muted-foreground truncate mt-0.5">{emailItem.snippet}</p>
                  )}
                </div>
                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  {new Date(emailItem.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </span>
              </div>
            </div>
          ))}
        </div>
        {account && (
          <div className="px-4 py-2 bg-muted/20 border-t border-border/50">
            <p className="text-xs text-muted-foreground">{account}</p>
          </div>
        )}
      </div>
    );
  }

  // Render calendar events list
  if (type === 'calendar-list' && events && events.length > 0) {
    return (
      <div className="my-4 rounded-xl border border-border/50 bg-card overflow-hidden shadow-sm">
        <div className={cn("flex items-center gap-2 px-4 py-3 border-b", getHeaderColor())}>
          {getIcon()}
          <span className="font-medium">Upcoming Events</span>
          <span className="ml-auto text-xs text-muted-foreground">{events.length} events</span>
        </div>
        <div className="divide-y divide-border/50">
          {events.map((eventItem, index) => {
            const startDate = new Date(eventItem.start);
            const isAllDay = !eventItem.start.includes('T');
            
            return (
              <div key={index} className="px-4 py-3 hover:bg-muted/30 transition-colors flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex flex-col items-center justify-center text-blue-600 dark:text-blue-400 flex-shrink-0">
                  <span className="text-[10px] font-medium uppercase leading-none">
                    {startDate.toLocaleDateString('en-US', { month: 'short' })}
                  </span>
                  <span className="text-sm font-bold leading-none">
                    {startDate.getDate()}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm text-foreground truncate">{eventItem.summary}</p>
                  <p className="text-xs text-muted-foreground">
                    {isAllDay ? 'All day' : startDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                    {eventItem.location && ` • ${eventItem.location}`}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
        {account && (
          <div className="px-4 py-2 bg-muted/20 border-t border-border/50">
            <p className="text-xs text-muted-foreground">{account}</p>
          </div>
        )}
      </div>
    );
  }

  // Render error card
  if (type === 'error' || !success) {
    return (
      <div className="my-4 rounded-xl border border-destructive/30 bg-destructive/5 overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-destructive/20 text-destructive">
          <XCircle className="h-5 w-5" />
          <span className="font-medium">{title || 'Error'}</span>
        </div>
        <div className="p-4">
          <p className="text-sm text-destructive">{message || 'Something went wrong'}</p>
        </div>
      </div>
    );
  }

  // Default success card
  return (
    <div className="my-4 rounded-xl border border-border/50 bg-card overflow-hidden shadow-sm">
      <div className={cn("flex items-center gap-2 px-4 py-3 border-b", getHeaderColor())}>
        {getIcon()}
        <span className="font-medium">{title}</span>
        {success && <CheckCircle2 className="h-4 w-4 ml-auto text-green-500" />}
      </div>
      {message && (
        <div className="p-4">
          <p className="text-sm text-foreground">{message}</p>
        </div>
      )}
    </div>
  );
};
