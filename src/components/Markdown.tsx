import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const EXTERNAL = /^https?:\/\//i;

/** Единый рендер Markdown (сайт, новости, превью в админке). Сырой HTML не поддерживается. */
export function Markdown({ children, className }: { children: string; className?: string }) {
  const body = (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        a({ node: _node, href, children: c, ...rest }) {
          const external = typeof href === "string" && EXTERNAL.test(href);
          return (
            <a href={href} {...rest} {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
              {c}
            </a>
          );
        },
      }}
    >
      {children}
    </ReactMarkdown>
  );
  return className ? <div className={className}>{body}</div> : body;
}
