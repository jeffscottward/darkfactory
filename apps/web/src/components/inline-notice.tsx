import type { ReactNode } from "react";
import { useId } from "react";

export interface InlineNoticeProps {
  readonly action?: ReactNode;
  readonly message?: ReactNode;
  readonly title: ReactNode;
}

/**
 * One compact row for an error or a no-result state: a level-2 title, an
 * optional error message and an optional action. It never adds prose.
 */
export const InlineNotice = ({ action, message, title }: InlineNoticeProps) => {
  const titleId = `${useId()}-title`;
  return (
    <section
      aria-labelledby={titleId}
      className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-border border-y py-2"
    >
      <div className="min-w-0">
        <h2 className="font-medium text-foreground text-sm" id={titleId}>
          {title}
        </h2>
        {message === undefined ? null : (
          <p className="text-muted-foreground text-sm">{message}</p>
        )}
      </div>
      {action === undefined ? null : (
        <div className="flex shrink-0 flex-wrap gap-2">{action}</div>
      )}
    </section>
  );
};
