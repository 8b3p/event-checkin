import type { IScanRepository } from "../domain/IScanRepository";
import { ScanRepository } from "./ScanRepository";

export function makeScanRepository(): IScanRepository {
  return new ScanRepository();
}
