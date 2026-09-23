import bcrypt from "bcryptjs";
import type { IOwnerRepository } from "../IOwnerRepository";
import type { Session } from "../Session";

export class AuthenticateOwnerUseCase {
  constructor(private readonly ownerRepository: IOwnerRepository) {}

  async execute(email: string, password: string): Promise<Session | null> {
    const owner = await this.ownerRepository.get();
    if (!owner) return null;

    const emailMatches = email.trim().toLowerCase() === owner.email;
    const passwordMatches = await bcrypt.compare(password, owner.passwordHash);

    // One code path for both failure cases, so this can't be used to discover the email.
    if (!emailMatches || !passwordMatches) return null;
    return { role: "owner" };
  }
}
