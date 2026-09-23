import type { ArrivalBucket } from "../ScanEvent";
import type { IScanRepository } from "../IScanRepository";

export class GetArrivalBucketsUseCase {
  constructor(private readonly scanRepository: IScanRepository) {}

  execute(eventId: number): Promise<ArrivalBucket[]> {
    return this.scanRepository.arrivalBuckets(eventId);
  }
}
