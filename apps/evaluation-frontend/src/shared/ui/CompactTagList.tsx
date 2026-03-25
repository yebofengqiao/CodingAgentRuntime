import { Space, Tag, Tooltip, Typography } from "antd";

const { Text } = Typography;

type Props = {
  items: string[];
  emptyText?: string;
  maxVisible?: number;
  color?: string;
};

function normalizeItems(items: string[]) {
  return Array.from(new Set(items.map((item) => item.trim()).filter(Boolean)));
}

function renderTooltipContent(items: string[]) {
  return (
    <div>
      {items.map((item) => (
        <div key={item}>{item}</div>
      ))}
    </div>
  );
}

export function CompactTagList({
  items,
  emptyText = "-",
  maxVisible = 3,
  color = "default",
}: Props) {
  const normalized = normalizeItems(items);
  if (normalized.length === 0) {
    return <Text type="secondary">{emptyText}</Text>;
  }

  const visibleItems = normalized.slice(0, maxVisible);
  const hiddenItems = normalized.slice(maxVisible);

  return (
    <Space wrap size={[4, 4]} className="compact-tag-list">
      {visibleItems.map((item) => (
        <Tooltip key={item} title={item}>
          <Tag color={color} className="compact-tag-list__tag">
            <span className="compact-tag-list__text">{item}</span>
          </Tag>
        </Tooltip>
      ))}
      {hiddenItems.length > 0 ? (
        <Tooltip title={renderTooltipContent(hiddenItems)}>
          <Tag className="compact-tag-list__tag">+{hiddenItems.length}</Tag>
        </Tooltip>
      ) : null}
    </Space>
  );
}
