"use client";

import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import type { EntitySelect } from "@/components/agent/chat-entity-list";

// Turn bare invoice IDs into links. Skips IDs already inside a markdown link.
function linkifyInvoiceIds(md: string): string {
  return md.replace(/(\]\()?\b(INV-\d+)\b/g, (m, inLink, id) =>
    inLink ? m : `[${id}](/invoices/${id})`,
  );
}

const staticComponents: Components = {
  table: ({ children }) => (
    <div className="my-2 overflow-x-auto">
      <table className="w-full border-collapse text-xs">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-muted">{children}</thead>,
  th: ({ children }) => (
    <th className="border border-border px-2 py-1 text-left font-semibold">{children}</th>
  ),
  td: ({ children }) => (
    <td className="border border-border px-2 py-1 tabular-nums">{children}</td>
  ),
  ul: ({ children }) => <ul className="my-1 list-disc space-y-0.5 pl-5">{children}</ul>,
  ol: ({ children }) => <ol className="my-1 list-decimal space-y-0.5 pl-5">{children}</ol>,
  p: ({ children }) => <p className="my-1 first:mt-0 last:mb-0">{children}</p>,
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  h1: ({ children }) => <h1 className="mb-1 mt-2 text-sm font-semibold">{children}</h1>,
  h2: ({ children }) => <h2 className="mb-1 mt-2 text-sm font-semibold">{children}</h2>,
  h3: ({ children }) => <h3 className="mb-1 mt-2 text-sm font-semibold">{children}</h3>,
  code: ({ children }) => (
    <code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]">{children}</code>
  ),
  hr: () => <hr className="my-2 border-border" />,
};

const linkCls = "font-medium text-primary underline underline-offset-2";

export function Markdown({
  content,
  onSelect,
}: {
  content: string;
  onSelect?: EntitySelect;
}) {
  // An invoice link opens the side panel via onSelect (when available, i.e. in the
  // agent workspace). Elsewhere it falls back to navigating to the detail page.
  const components: Components = {
    ...staticComponents,
    a: ({ href, children }) => {
      const m = href?.match(/^\/invoices\/(INV-\d+)/);
      if (m && onSelect) {
        const id = m[1];
        return (
          <button
            type="button"
            onClick={() => onSelect({ kind: "invoice", id, tab: "overview" })}
            className={linkCls}
          >
            {children}
          </button>
        );
      }
      return (
        <a href={href} target="_blank" rel="noopener noreferrer" className={linkCls}>
          {children}
        </a>
      );
    },
  };

  return (
    <div className="text-sm leading-relaxed">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {linkifyInvoiceIds(content)}
      </ReactMarkdown>
    </div>
  );
}
