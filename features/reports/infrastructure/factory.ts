import type { IReportShareRepository } from "../domain/IReportShareRepository";
import { ReportShareRepository } from "./ReportShareRepository";

export function makeReportShareRepository(): IReportShareRepository {
  return new ReportShareRepository();
}
