import type { IScanRepository } from "../IScanRepository";

export class UndoLastScanUseCase {
  constructor(private readonly scanRepository: IScanRepository) {}

  execute(guestId: number): Promise<boolean> {
    return this.scanRepository.undoLast(guestId);
  }
}
