import type { IOwnerRepository } from "../IOwnerRepository";

export class CheckSetupStatusUseCase {
  constructor(private readonly ownerRepository: IOwnerRepository) {}

  async execute(): Promise<boolean> {
    return (await this.ownerRepository.get()) !== null;
  }
}
