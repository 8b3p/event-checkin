import type { GuestAttendanceRow } from "../ScanEvent";
import type { IScanRepository } from "../IScanRepository";

export class ListGuestAttendanceUseCase {
  constructor(private readonly scanRepository: IScanRepository) {}

  execute(eventId: number): Promise<GuestAttendanceRow[]> {
    return this.scanRepository.listGuestAttendance(eventId);
  }
}
