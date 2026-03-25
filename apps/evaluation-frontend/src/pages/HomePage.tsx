import { useEffect } from "react";

import { ExperimentHistoryTable } from "@/features/experiment-history/ui/ExperimentHistoryTable";
import { useExperimentHistoryStore } from "@/features/experiment-history/model/store";
import { AppFrame } from "@/shared/ui/AppFrame";
import { TermLabel } from "@/shared/ui/TermLabel";

export default function HomePage() {
  const experiments = useExperimentHistoryStore((state) => state.experiments);
  const loading = useExperimentHistoryStore((state) => state.loading);
  const error = useExperimentHistoryStore((state) => state.error);
  const startingExperimentId = useExperimentHistoryStore((state) => state.startingExperimentId);
  const load = useExperimentHistoryStore((state) => state.load);
  const start = useExperimentHistoryStore((state) => state.start);
  const dispose = useExperimentHistoryStore((state) => state.dispose);

  useEffect(() => {
    void load();
    return () => {
      dispose();
    };
  }, [dispose, load]);

  return (
    <AppFrame
      title={<TermLabel termKey="page.evaluation_console" />}
      subtitle={
        <>
          查看 <TermLabel termKey="nav.experiments" />、<TermLabel termKey="section.run_matrix" /> 进度与
          <TermLabel termKey="section.aggregate_report" />。
        </>
      }
    >
      <ExperimentHistoryTable
        experiments={experiments}
        loading={loading}
        error={error}
        startingExperimentId={startingExperimentId}
        onStart={start}
      />
    </AppFrame>
  );
}
