export class ParallelToolExecutor {
  private readonly max_workers: number;

  constructor(max_workers = 1) {
    this.max_workers =
      Number.isInteger(max_workers) && max_workers > 0 ? max_workers : 1;
  }

  async execute_batch<TInput, TResult>(
    inputs: readonly TInput[],
    runner: (input: TInput) => Promise<TResult>,
  ): Promise<TResult[]> {
    if (inputs.length === 0) {
      return [];
    }

    if (inputs.length === 1 || this.max_workers === 1) {
      const results: TResult[] = [];
      for (const input of inputs) {
        results.push(await runner(input));
      }
      return results;
    }

    const results = new Array<TResult>(inputs.length);
    let cursor = 0;

    const worker = async () => {
      while (true) {
        const index = cursor;
        cursor += 1;
        if (index >= inputs.length) {
          return;
        }
        results[index] = await runner(inputs[index]!);
      }
    };

    const worker_count = Math.min(this.max_workers, inputs.length);
    await Promise.all(Array.from({ length: worker_count }, () => worker()));
    return results;
  }
}
