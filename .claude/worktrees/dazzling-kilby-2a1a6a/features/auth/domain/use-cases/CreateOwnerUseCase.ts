import bcrypt from "bcryptjs";
import type { IOwnerRepository } from "../IOwnerRepository";

export type CreateOwnerInput = { email: string; password: string };

export class CreateOwnerUseCase {
  constructor(private readonly ownerRepository: IOwnerRepository) {}

  async execute(input: CreateOwnerInput): Promise<void> {
    const email = input.email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      throw new Error("البريد الإلكتروني غير صحيح.");
    }
    if (input.password.length < 8) {
      throw new Error("استخدم كلمة مرور من 8 أحرف على الأقل.");
    }
    if ((await this.ownerRepository.get()) !== null) {
      throw new Error("يوجد حساب مالك بالفعل.");
    }

    await this.ownerRepository.create({ email, passwordHash: await bcrypt.hash(input.password, 12) });
  }
}
