import { Tooltip } from "antd";

import { getTerm } from "@/shared/lib/terms";

type Props = {
  termKey: string;
  fallbackLabel?: string;
  className?: string;
  showHint?: boolean;
};

export function TermLabel({
  termKey,
  fallbackLabel,
  className,
  showHint = true,
}: Props) {
  const term = getTerm(termKey, fallbackLabel);

  return (
    <span className={["term-label", className].filter(Boolean).join(" ")}>
      <span>{term.label}</span>
      {showHint && term.description ? (
        <Tooltip title={term.description}>
          <span aria-hidden="true" className="term-label__hint">
            i
          </span>
        </Tooltip>
      ) : null}
    </span>
  );
}
