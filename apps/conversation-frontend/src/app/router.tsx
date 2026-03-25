import { useEffect } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

import ConversationPage from "@/pages/ConversationPage";

function getEvaluationFrontendUrl() {
  return import.meta.env.VITE_EVALUATION_FRONTEND_URL ?? "http://127.0.0.1:3001";
}

function EvalRedirect() {
  useEffect(() => {
    window.location.replace(getEvaluationFrontendUrl());
  }, []);

  return <div className="redirecting-shell">正在跳转到评测控制台...</div>;
}

export function AppRouter() {
  return (
    <Routes>
      <Route path="/" element={<ConversationPage />} />
      <Route path="/eval" element={<EvalRedirect />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
