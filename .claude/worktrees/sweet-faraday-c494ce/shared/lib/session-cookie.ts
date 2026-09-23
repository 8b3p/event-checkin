import { cookies } from "next/headers";
import { makeSessionRepository } from "@/features/auth/infrastructure/factory";
import { MAX_AGE_SECONDS } from "@/features/auth/infrastructure/JwtSessionRepository";
import type { Session } from "@/features/auth/domain/Session";

const COOKIE_NAME = "wc_session";
const sessionRepository = makeSessionRepository();

export async function getSession(): Promise<Session | null> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return sessionRepository.verify(token);
}

export async function setSessionCookie(session: Session): Promise<void> {
  const store = await cookies();
  store.set(COOKIE_NAME, await sessionRepository.sign(session), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

export { COOKIE_NAME };
