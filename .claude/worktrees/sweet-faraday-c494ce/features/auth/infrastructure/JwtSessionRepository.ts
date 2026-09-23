import { SignJWT, jwtVerify } from "jose";
import type { ISessionRepository } from "../domain/ISessionRepository";
import type { Session } from "../domain/Session";

export const MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

function secret(): Uint8Array {
  const value = process.env.SESSION_SECRET;
  if (!value || value.length < 16) {
    throw new Error(
      "SESSION_SECRET is missing or too short. Copy .env.example to .env and set it — " +
        'generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"',
    );
  }
  return new TextEncoder().encode(value);
}

export class JwtSessionRepository implements ISessionRepository {
  async sign(session: Session): Promise<string> {
    const claims: Record<string, unknown> = { role: session.role };
    if (session.role === "door") claims.eventId = session.eventId;

    return new SignJWT(claims)
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime(`${MAX_AGE_SECONDS}s`)
      .sign(secret());
  }

  async verify(token: string): Promise<Session | null> {
    try {
      const { payload } = await jwtVerify(token, secret());
      if (payload.role === "owner") return { role: "owner" };
      if (payload.role === "door" && typeof payload.eventId === "number") {
        return { role: "door", eventId: payload.eventId };
      }
      return null;
    } catch {
      return null;
    }
  }
}
