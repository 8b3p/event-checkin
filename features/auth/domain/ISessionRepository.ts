import type { Session } from "./Session";

export interface ISessionRepository {
  sign(session: Session): Promise<string>;
  verify(token: string): Promise<Session | null>;
}
