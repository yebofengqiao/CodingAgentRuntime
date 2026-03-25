import { Layout, Menu, Tooltip, Typography } from "antd";
import { Link } from "react-router-dom";

const { Header, Content } = Layout;
const { Title, Text } = Typography;

export function AppFrame({
  children,
  title,
  subtitle,
}: {
  children: React.ReactNode;
  title: React.ReactNode;
  subtitle: React.ReactNode;
}) {
  return (
    <Layout style={{ minHeight: "100vh", background: "transparent" }}>
      <Header
        style={{
          background: "rgba(255,255,255,0.75)",
          borderBottom: "1px solid rgba(15, 118, 110, 0.16)",
          backdropFilter: "blur(12px)",
          position: "sticky",
          top: 0,
          zIndex: 20,
          height: "auto",
          lineHeight: 1.4,
          padding: "14px 24px 12px",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 16,
            flexWrap: "wrap",
          }}
        >
          <div style={{ minWidth: 0, flex: "1 1 420px" }}>
            <Title level={4} style={{ margin: 0, color: "#0f172a" }}>
              {title}
            </Title>
            <Text type="secondary" style={{ display: "block", marginTop: 4, maxWidth: 760 }}>
              {subtitle}
            </Text>
          </div>
          <Menu
            mode="horizontal"
            selectable={false}
            items={[
              {
                key: "history",
                label: (
                  <Tooltip title="查看实验列表、运行进度与结果概览。">
                    <Link to="/">Experiments</Link>
                  </Tooltip>
                ),
              },
              {
                key: "create",
                label: (
                  <Tooltip title="创建新的实验配置。">
                    <Link to="/create">Create</Link>
                  </Tooltip>
                ),
              },
            ]}
            style={{
              flex: "0 0 auto",
              background: "transparent",
              borderBottom: "none",
            }}
          />
        </div>
      </Header>
      <Content style={{ padding: "32px 24px 56px" }}>
        <div style={{ maxWidth: 1360, margin: "0 auto" }}>{children}</div>
      </Content>
    </Layout>
  );
}
