import {
  conversationQueueName,
  evaluationQueueName,
} from "@openhands-rl/backend-core/infrastructure/queue";
import { createWorkers } from "./bootstrap/create-workers";

createWorkers();

console.info("BullMQ workers started", {
  conversationQueueName,
  evaluationQueueName,
});
