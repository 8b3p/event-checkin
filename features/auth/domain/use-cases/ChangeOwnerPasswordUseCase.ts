import bcrypt from "bcryptjs";
import type { IOwnerRepository } from "../IOwnerRepository";

export class ChangeOwnerPasswordUseCase {
  constructor(private readonly ownerRepository: IOwnerRepository) {}

  async execute(currentPassword: string, newPassword: string): Promise<void> {
    const owner = await this.ownerRepository.get();
    if (!owner) throw new Error("لا يوجد حساب مالك بعد.");
    if (!(await bcrypt.compare(currentPassword, owner.passwordHash))) {
      throw new Error("كلمة المرور الحالية غير صحيحة.");
    }
    if (newPassword.length < 8) {
      throw new Error("استخدم كلمة مرور جديدة من 8 أحرف على الأقل.");
    }

    await this.ownerRepository.updatePassword(await bcrypt.hash(newPassword, 12));
  }
}
