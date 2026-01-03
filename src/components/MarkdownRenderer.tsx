import { cn } from "@/lib/utils";
import { ConnectorResultCard } from "./ConnectorResultCard";

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

export const MarkdownRenderer = ({ content, className }: MarkdownRendererProps) => {
  const renderContent = () => {
    const parts: JSX.Element[] = [];
    let currentIndex = 0;
    let processedContent = content;

    // Check for connector action results and render them as cards
    const actionCards = parseConnectorActions(processedContent);
    if (actionCards.length > 0) {
      actionCards.forEach((card, idx) => {
        parts.push(
          <ConnectorResultCard key={`action-${idx}`} {...card} />
        );
      });
      // Remove the action text from content to avoid duplication
      processedContent = removeActionText(processedContent);
    }

    // Split by tables
    const tableRegex = /\|[^\n]+\|\n\|[-:\s|]+\|\n(\|[^\n]+\|\n?)+/g;
    let match;
    currentIndex = 0;

    while ((match = tableRegex.exec(processedContent)) !== null) {
      // Add text before table
      if (match.index > currentIndex) {
        const textBefore = processedContent.slice(currentIndex, match.index).trim();
        if (textBefore) {
          parts.push(
            <span key={`text-${currentIndex}`} className="whitespace-pre-wrap">
              {renderInlineMarkdown(textBefore)}
            </span>
          );
        }
      }

      // Parse and render table with nice styling
      parts.push(renderTable(match[0], `table-${match.index}`));
      currentIndex = match.index + match[0].length;
    }

    // Add remaining text
    if (currentIndex < processedContent.length) {
      const remainingText = processedContent.slice(currentIndex).trim();
      if (remainingText) {
        parts.push(
          <span key={`text-${currentIndex}`} className="whitespace-pre-wrap">
            {renderInlineMarkdown(remainingText)}
          </span>
        );
      }
    }

    return parts.length > 0 ? parts : null;
  };

  const parseConnectorActions = (text: string): React.ComponentProps<typeof ConnectorResultCard>[] => {
    const actions: React.ComponentProps<typeof ConnectorResultCard>[] = [];
    
    // Parse calendar created
    const calendarCreatedMatch = text.match(/✅\s*EVENT CREATED.*?📅\s*\*\*(.+?)\*\*.*?🕐\s*(.+?)\n.*?🔗\s*\[.*?\]\((.+?)\).*?(?:added to|account)[^\n]*\(([^)]+)\)/is);
    if (calendarCreatedMatch) {
      actions.push({
        type: 'calendar-created',
        success: true,
        event: {
          summary: calendarCreatedMatch[1],
          start: calendarCreatedMatch[2].split(' - ')[0],
          end: calendarCreatedMatch[2].split(' - ')[1],
          htmlLink: calendarCreatedMatch[3],
        },
        account: calendarCreatedMatch[4],
      });
    }

    // Parse email sent
    const emailSentMatch = text.match(/✅\s*EMAIL SENT.*?To:\s*([^\n]+).*?Subject:\s*([^\n]+).*?(?:from|account)[^\n]*\(([^)]+)\)/is);
    if (emailSentMatch) {
      actions.push({
        type: 'email-sent',
        success: true,
        email: {
          to: emailSentMatch[1].trim(),
          subject: emailSentMatch[2].trim(),
        },
        account: emailSentMatch[3],
      });
    }

    // Parse errors
    const errorMatch = text.match(/❌\s*(?:Failed to\s+)?(.+?):\s*(.+)/i);
    if (errorMatch) {
      actions.push({
        type: 'error',
        success: false,
        title: errorMatch[1],
        message: errorMatch[2],
      });
    }

    return actions;
  };

  const removeActionText = (text: string): string => {
    // Remove the action result blocks to prevent duplication
    let result = text;
    
    // Remove calendar created blocks
    result = result.replace(/✅\s*EVENT CREATED.*?(?:added to|account)[^\n]*\([^)]+\)[.\s]*/gis, '');
    
    // Remove email sent blocks  
    result = result.replace(/✅\s*EMAIL SENT.*?(?:from|account)[^\n]*\([^)]+\)[.\s]*/gis, '');
    
    // Remove error blocks
    result = result.replace(/❌\s*(?:Failed to\s+)?[^:\n]+:\s*[^\n]+\n*/gi, '');
    
    return result.trim();
  };

  const renderInlineMarkdown = (text: string) => {
    // Handle links first
    const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
    const withLinks = text.split(linkRegex);
    
    const elements: (string | JSX.Element)[] = [];
    for (let i = 0; i < withLinks.length; i++) {
      if (i % 3 === 0) {
        // Regular text - handle bold
        const parts = withLinks[i].split(/(\*\*[^*]+\*\*)/g);
        parts.forEach((part, j) => {
          if (part.startsWith('**') && part.endsWith('**')) {
            elements.push(<strong key={`${i}-${j}`} className="font-semibold">{part.slice(2, -2)}</strong>);
          } else if (part) {
            elements.push(part);
          }
        });
      } else if (i % 3 === 1) {
        // Link text
        const linkText = withLinks[i];
        const linkUrl = withLinks[i + 1];
        elements.push(
          <a 
            key={`link-${i}`} 
            href={linkUrl} 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            {linkText}
          </a>
        );
        i++; // Skip the URL part
      }
    }
    return elements;
  };

  const renderTable = (tableString: string, key: string) => {
    const rows = tableString.trim().split('\n');
    if (rows.length < 2) return null;

    const headerCells = rows[0].split('|').filter(cell => cell.trim());
    const dataRows = rows.slice(2); // Skip header and separator

    return (
      <div key={key} className="my-4 overflow-hidden rounded-xl border border-border/50 bg-card shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/50 bg-muted/30">
              {headerCells.map((cell, i) => (
                <th
                  key={i}
                  className={cn(
                    "px-4 py-3 text-left font-medium text-muted-foreground",
                    i === 0 && "w-12"
                  )}
                >
                  {cell.trim()}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {dataRows.map((row, rowIndex) => {
              const cells = row.split('|').filter(cell => cell !== '');
              return (
                <tr
                  key={rowIndex}
                  className="border-b border-border/30 last:border-0 hover:bg-muted/20 transition-colors"
                >
                  {cells.map((cell, cellIndex) => (
                    <td
                      key={cellIndex}
                      className={cn(
                        "px-4 py-3 text-foreground",
                        cellIndex === 0 && "text-muted-foreground font-medium w-12"
                      )}
                    >
                      {cell.trim() === '-' ? (
                        <span className="text-muted-foreground/50">—</span>
                      ) : (
                        cell.trim()
                      )}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  const renderedContent = renderContent();
  
  if (!renderedContent || (Array.isArray(renderedContent) && renderedContent.length === 0)) {
    return null;
  }

  return (
    <div className={cn("leading-relaxed", className)}>
      {renderedContent}
    </div>
  );
};
