import React from 'react';

interface ChatMarkdownProps {
  content: string;
  isUser?: boolean;
}

function renderInlineTokens(text: string, isUser: boolean): React.ReactNode[] {
  // Match inline code, markdown links, bold (**..** / __..__), italic (*..*), or bare http(s) URLs
  const pattern =
    /(`[^`]+`|\[[^\]]+\]\(https?:\/\/[^\s)]+\)|\*\*\*[^*\n]+\*\*\*|\*\*[^*\n]+\*\*|__[^_\n]+__|\*[^*\s][^*\n]*?\*|https?:\/\/[^\s)]+)/g;

  const nodes: React.ReactNode[] = [];
  let lastIdx = 0;
  let match: RegExpExecArray | null;
  let keyIdx = 0;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIdx) {
      nodes.push(text.slice(lastIdx, match.index));
    }

    const token = match[0];

    if (token.startsWith('`') && token.endsWith('`') && token.length >= 2) {
      nodes.push(
        <code
          key={`c_${keyIdx++}`}
          className={
            isUser
              ? 'px-1.5 py-0.5 rounded bg-black/15 text-zinc-950 font-mono text-[11px] font-semibold'
              : 'px-1.5 py-0.5 rounded bg-zinc-200/80 dark:bg-zinc-800 text-amber-800 dark:text-cyan-300 font-mono text-[11px] font-semibold'
          }
        >
          {token.slice(1, -1)}
        </code>
      );
    } else if (token.startsWith('[')) {
      const linkMatch = /^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/.exec(token);
      if (linkMatch) {
        nodes.push(
          <a
            key={`l_${keyIdx++}`}
            href={linkMatch[2]}
            target="_blank"
            rel="noopener noreferrer"
            className={
              isUser
                ? 'underline font-bold text-zinc-950 hover:opacity-80'
                : 'underline decoration-cyan-500/60 text-cyan-700 dark:text-cyan-300 font-semibold hover:text-cyan-600 dark:hover:text-cyan-200'
            }
          >
            {linkMatch[1]}
          </a>
        );
      } else {
        nodes.push(token);
      }
    } else if (token.startsWith('***') && token.endsWith('***') && token.length > 6) {
      nodes.push(
        <strong
          key={`bi_${keyIdx++}`}
          className={
            isUser ? 'font-extrabold italic' : 'font-bold italic text-zinc-950 dark:text-white'
          }
        >
          {token.slice(3, -3)}
        </strong>
      );
    } else if (
      ((token.startsWith('**') && token.endsWith('**')) ||
        (token.startsWith('__') && token.endsWith('__'))) &&
      token.length > 4
    ) {
      nodes.push(
        <strong
          key={`b_${keyIdx++}`}
          className={isUser ? 'font-extrabold' : 'font-bold text-zinc-950 dark:text-white'}
        >
          {token.slice(2, -2)}
        </strong>
      );
    } else if (token.startsWith('*') && token.endsWith('*') && token.length > 2) {
      nodes.push(
        <em key={`i_${keyIdx++}`} className="italic opacity-95">
          {token.slice(1, -1)}
        </em>
      );
    } else if (token.startsWith('http://') || token.startsWith('https://')) {
      nodes.push(
        <a
          key={`u_${keyIdx++}`}
          href={token}
          target="_blank"
          rel="noopener noreferrer"
          className={
            isUser
              ? 'underline font-semibold break-all'
              : 'underline decoration-cyan-500/60 text-cyan-700 dark:text-cyan-300 break-all hover:opacity-80'
          }
        >
          {token}
        </a>
      );
    } else {
      nodes.push(token);
    }

    lastIdx = pattern.lastIndex;
  }

  if (lastIdx < text.length) {
    nodes.push(text.slice(lastIdx));
  }

  return nodes;
}

export const ChatMarkdown: React.FC<ChatMarkdownProps> = ({ content, isUser = false }) => {
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const blocks: React.ReactNode[] = [];
  let i = 0;
  let blockKey = 0;

  while (i < lines.length) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    if (!trimmed) {
      i += 1;
      continue;
    }

    // Fenced code block ```
    if (trimmed.startsWith('```')) {
      const codeLines: string[] = [];
      i += 1;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i]);
        i += 1;
      }
      i += 1;
      blocks.push(
        <pre
          key={`code_${blockKey++}`}
          className="p-2.5 rounded-xl bg-zinc-950 text-cyan-300 border border-zinc-800 font-mono text-[11px] leading-relaxed overflow-x-auto"
        >
          <code>{codeLines.join('\n')}</code>
        </pre>
      );
      continue;
    }

    // Horizontal rule
    if (/^(-{3,}|\*{3,})$/.test(trimmed)) {
      blocks.push(
        <hr
          key={`hr_${blockKey++}`}
          className="border-t border-zinc-200/80 dark:border-zinc-700/70 my-1.5"
        />
      );
      i += 1;
      continue;
    }

    // Headings # ## ### ####
    const headingMatch = /^(#{1,4})\s+(.+)$/.exec(trimmed);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const text = headingMatch[2];
      blocks.push(
        <h4
          key={`h_${blockKey++}`}
          className={`${
            level <= 2 ? 'text-[13px]' : 'text-xs'
          } font-extrabold tracking-tight text-zinc-950 dark:text-white pt-1 first:pt-0`}
        >
          {renderInlineTokens(text, isUser)}
        </h4>
      );
      i += 1;
      continue;
    }

    // Unordered bullet list (* , - , • )
    if (/^\s*([*\-•])\s+/.test(rawLine)) {
      const items: Array<{ indent: number; text: string }> = [];
      while (i < lines.length) {
        const m = /^(\s*)([*\-•])\s+(.*)$/.exec(lines[i]);
        if (!m) break;
        items.push({
          indent: m[1].length >= 2 ? 1 : 0,
          text: m[3],
        });
        i += 1;
      }
      blocks.push(
        <ul key={`ul_${blockKey++}`} className="space-y-1.5 my-0.5">
          {items.map((item, idx) => (
            <li
              key={idx}
              className={`flex items-start gap-2 ${item.indent ? 'pl-4' : ''}`}
            >
              <span
                aria-hidden="true"
                className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${
                  isUser
                    ? 'bg-zinc-900'
                    : item.indent
                    ? 'border border-cyan-500 dark:border-cyan-400'
                    : 'bg-gradient-to-br from-amber-500 to-cyan-500 dark:from-yellow-400 dark:to-cyan-400'
                }`}
              />
              <span className="flex-1 min-w-0 leading-relaxed">
                {renderInlineTokens(item.text, isUser)}
              </span>
            </li>
          ))}
        </ul>
      );
      continue;
    }

    // Ordered list (1. , 2. , etc.)
    if (/^\s*\d+\.\s+/.test(rawLine)) {
      const items: Array<{ num: string; text: string }> = [];
      while (i < lines.length) {
        const m = /^\s*(\d+)\.\s+(.*)$/.exec(lines[i]);
        if (!m) break;
        items.push({ num: m[1], text: m[2] });
        i += 1;
      }
      blocks.push(
        <ol key={`ol_${blockKey++}`} className="space-y-1.5 my-0.5">
          {items.map((item, idx) => (
            <li key={idx} className="flex items-start gap-2">
              <span
                className={`mt-0.5 min-w-[1.25rem] h-4 px-1 rounded text-[10px] font-mono font-bold inline-flex items-center justify-center shrink-0 tabular-nums ${
                  isUser
                    ? 'bg-black/15 text-zinc-950'
                    : 'bg-yellow-400/20 text-amber-700 dark:text-yellow-300 border border-yellow-400/30'
                }`}
              >
                {item.num}
              </span>
              <span className="flex-1 min-w-0 leading-relaxed">
                {renderInlineTokens(item.text, isUser)}
              </span>
            </li>
          ))}
        </ol>
      );
      continue;
    }

    // Blockquote
    if (trimmed.startsWith('>')) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        quoteLines.push(lines[i].trim().replace(/^>\s?/, ''));
        i += 1;
      }
      blocks.push(
        <div
          key={`q_${blockKey++}`}
          className="px-3 py-1.5 rounded-lg bg-zinc-200/50 dark:bg-zinc-800/50 text-zinc-700 dark:text-zinc-300 italic text-[11px] leading-relaxed"
        >
          {renderInlineTokens(quoteLines.join(' '), isUser)}
        </div>
      );
      continue;
    }

    // Regular paragraph (group contiguous non-empty, non-block lines)
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !lines[i].trim().startsWith('```') &&
      !lines[i].trim().startsWith('>') &&
      !/^(#{1,4})\s+/.test(lines[i].trim()) &&
      !/^\s*([*\-•])\s+/.test(lines[i]) &&
      !/^\s*\d+\.\s+/.test(lines[i]) &&
      !/^(-{3,}|\*{3,})$/.test(lines[i].trim())
    ) {
      paraLines.push(lines[i].trim());
      i += 1;
    }

    blocks.push(
      <p key={`p_${blockKey++}`} className="leading-relaxed">
        {renderInlineTokens(paraLines.join(' '), isUser)}
      </p>
    );
  }

  return <div className="space-y-2">{blocks}</div>;
};
