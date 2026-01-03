import { cn } from "@/lib/utils";

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

export const MarkdownRenderer = ({ content, className }: MarkdownRendererProps) => {
  const renderContent = () => {
    const parts: JSX.Element[] = [];
    let currentIndex = 0;

    // Split by tables first
    const tableRegex = /\|[^\n]+\|\n\|[-:\s|]+\|\n(\|[^\n]+\|\n?)+/g;
    let match;

    while ((match = tableRegex.exec(content)) !== null) {
      // Add text before table
      if (match.index > currentIndex) {
        parts.push(
          <span key={`text-${currentIndex}`} className="whitespace-pre-wrap">
            {renderInlineMarkdown(content.slice(currentIndex, match.index))}
          </span>
        );
      }

      // Parse and render table
      parts.push(renderTable(match[0], `table-${match.index}`));
      currentIndex = match.index + match[0].length;
    }

    // Add remaining text
    if (currentIndex < content.length) {
      parts.push(
        <span key={`text-${currentIndex}`} className="whitespace-pre-wrap">
          {renderInlineMarkdown(content.slice(currentIndex))}
        </span>
      );
    }

    return parts.length > 0 ? parts : <span className="whitespace-pre-wrap">{content}</span>;
  };

  const renderInlineMarkdown = (text: string) => {
    // Handle bold text
    const parts = text.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={i} className="font-semibold">{part.slice(2, -2)}</strong>;
      }
      return part;
    });
  };

  const renderTable = (tableString: string, key: string) => {
    const rows = tableString.trim().split('\n');
    if (rows.length < 2) return null;

    const headerCells = rows[0].split('|').filter(cell => cell.trim());
    const dataRows = rows.slice(2); // Skip header and separator

    return (
      <div key={key} className="my-4 overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border/50">
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
                  className="border-b border-border/30 hover:bg-muted/30 transition-colors"
                >
                  {cells.map((cell, cellIndex) => (
                    <td
                      key={cellIndex}
                      className={cn(
                        "px-4 py-3 text-foreground",
                        cellIndex === 0 && "text-muted-foreground w-12"
                      )}
                    >
                      {cell.trim()}
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

  return (
    <div className={cn("leading-relaxed", className)}>
      {renderContent()}
    </div>
  );
};
