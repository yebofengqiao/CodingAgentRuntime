import { Space, Tooltip, Typography } from "antd";

import type { ArtifactLinkItem } from "@/shared/lib/artifacts";

const { Text } = Typography;

type Props = {
  items: ArtifactLinkItem[];
  emptyText?: string;
  className?: string;
};

export function ArtifactLinkList({ items, emptyText = "-", className }: Props) {
  if (items.length === 0) {
    return <Text type="secondary">{emptyText}</Text>;
  }

  return (
    <Space wrap size={[6, 6]} className={["artifact-link-list", className].filter(Boolean).join(" ")}>
      {items.map((item) => (
        <Tooltip key={item.key} title={item.description ?? item.label}>
          <a
            href={item.href}
            target="_blank"
            rel="noreferrer"
            className="artifact-link-list__item"
          >
            <span className="artifact-link-list__label">{item.label}</span>
          </a>
        </Tooltip>
      ))}
    </Space>
  );
}
