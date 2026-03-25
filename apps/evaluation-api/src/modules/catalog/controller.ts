import { presentCatalogList } from "./presenter";
import { listCasesService, listVariantsService } from "./service";

export async function listCasesController() {
  return presentCatalogList(await listCasesService());
}

export async function listVariantsController() {
  return presentCatalogList(await listVariantsService());
}
