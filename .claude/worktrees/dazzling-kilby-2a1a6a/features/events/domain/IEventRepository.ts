import type { Event, EventInput } from "./Event";

export interface IEventRepository {
  list(): Promise<Event[]>;
  getById(id: number): Promise<Event | null>;
  getByDoorCode(doorCode: string): Promise<Event | null>;
  create(input: EventInput): Promise<Event>;
  update(id: number, input: EventInput): Promise<void>;
  archive(id: number): Promise<void>;
}
