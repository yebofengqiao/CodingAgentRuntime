import { Navigate, Route, Routes } from "react-router-dom";

import CreatePage from "@/pages/CreatePage";
import ExperimentDetailRoute from "@/pages/ExperimentDetailRoute";
import HomePage from "@/pages/HomePage";

export function AppRouter() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/create" element={<CreatePage />} />
      <Route path="/experiments/:experimentId" element={<ExperimentDetailRoute />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
