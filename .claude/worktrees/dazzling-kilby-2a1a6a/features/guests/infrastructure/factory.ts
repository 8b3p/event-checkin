import type { IGuestRepository } from "../domain/IGuestRepository";
import { GuestRepository } from "./GuestRepository";

export function makeGuestRepository(): IGuestRepository {
  return new GuestRepository();
}
