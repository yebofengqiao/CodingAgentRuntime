import { useEffect, useMemo } from "react";
import { useParams } from "react-router-dom";

import {
  useExperimentDetailStore,
} from "@/features/experiment-detail/model/store";
import { ExperimentDetailView } from "@/features/experiment-detail/ui/ExperimentDetailView";
import type { VariantAggregateSummary } from "@/shared/types/evaluation";
import { AppFrame } from "@/shared/ui/AppFrame";
import { TermLabel } from "@/shared/ui/TermLabel";

export default function ExperimentDetailRoute() {
  const params = useParams<{ experimentId: string }>();
  const load = useExperimentDetailStore((state) => state.load);
  const dispose = useExperimentDetailStore((state) => state.dispose);
  const experiment = useExperimentDetailStore((state) => state.experiment);
  const loading = useExperimentDetailStore((state) => state.loading);
  const starting = useExperimentDetailStore((state) => state.starting);
  const activeRunActionId = useExperimentDetailStore((state) => state.activeRunActionId);
  const error = useExperimentDetailStore((state) => state.error);
  const selectedRunId = useExperimentDetailStore((state) => state.selectedRunId);
  const traceValue = useExperimentDetailStore((state) => state.trace);
  const traceLoading = useExperimentDetailStore((state) => state.traceLoading);
  const traceError = useExperimentDetailStore((state) => state.traceError);
  const traceMissing = useExperimentDetailStore((state) => state.traceMissing);
  const startExperiment = useExperimentDetailStore((state) => state.startExperiment);
  const startRun = useExperimentDetailStore((state) => state.startRun);
  const rerunRun = useExperimentDetailStore((state) => state.rerunRun);
  const cancelRun = useExperimentDetailStore((state) => state.cancelRun);
  const selectRun = useExperimentDetailStore((state) => state.selectRun);
  const experimentId = params.experimentId ?? null;
  const selectedRun = useMemo(() => {
    if (experiment == null || selectedRunId == null) {
      return null;
    }
    return experiment.runs.find((item) => item.id === selectedRunId) ?? null;
  }, [experiment, selectedRunId]);
  const variantRows = useMemo(() => {
    const payload = (experiment?.aggregate_payload ?? {}) as {
      variant_summaries?: VariantAggregateSummary[];
    };
    return payload.variant_summaries ?? [];
  }, [experiment]);
  const runOptions = useMemo(
    () =>
      (experiment?.runs ?? []).map((run) => ({
        label: `${run.case_id} · ${run.variant_id} · ${run.status}`,
        value: run.id,
      })),
    [experiment],
  );

  useEffect(() => {
    if (!experimentId) {
      return;
    }
    void load(experimentId);
    return () => {
      dispose();
    };
  }, [dispose, experimentId, load]);

  if (!experimentId) {
    return null;
  }

  return (
    <AppFrame
      title={<TermLabel termKey="page.experiment_detail" />}
      subtitle={
        <>
          查看 <TermLabel termKey="section.aggregate_report" />、<TermLabel termKey="section.variant_summary" /> 和
          <TermLabel termKey="section.run_matrix" />。
        </>
      }
    >
      <ExperimentDetailView
        experimentId={experimentId}
        experiment={experiment}
        loading={loading}
        starting={starting}
        activeRunActionId={activeRunActionId}
        error={error}
        selectedRunId={selectedRunId}
        selectedRun={selectedRun}
        variantRows={variantRows}
        runOptions={runOptions}
        trace={{
          trace: traceValue,
          traceLoading,
          traceError,
          traceMissing,
        }}
        onStartExperiment={startExperiment}
        onStartRun={startRun}
        onRerunRun={rerunRun}
        onCancelRun={cancelRun}
        onSelectRun={selectRun}
      />
    </AppFrame>
  );
}
