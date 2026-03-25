import { listCases, listVariants } from "@openhands-rl/backend-core/evaluation/catalog";

export async function listCasesService() {
  return listCases();
}

export async function listVariantsService() {
  return listVariants();
}
