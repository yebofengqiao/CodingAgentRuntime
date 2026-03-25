import { getHealthStatus } from "./service";
import { presentHealthStatus } from "./presenter";

export async function getHealthController() {
  return presentHealthStatus(getHealthStatus());
}
