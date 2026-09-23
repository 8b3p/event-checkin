import type { IEventRepository } from "../domain/IEventRepository";
import { EventRepository } from "./EventRepository";

export function makeEventRepository(): IEventRepository {
  return new EventRepository();
}
