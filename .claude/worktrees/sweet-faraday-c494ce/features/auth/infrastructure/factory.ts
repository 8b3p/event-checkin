import type { IOwnerRepository } from "../domain/IOwnerRepository";
import type { ISessionRepository } from "../domain/ISessionRepository";
import { JwtSessionRepository } from "./JwtSessionRepository";
import { OwnerRepository } from "./OwnerRepository";

export function makeOwnerRepository(): IOwnerRepository {
  return new OwnerRepository();
}

export function makeSessionRepository(): ISessionRepository {
  return new JwtSessionRepository();
}
