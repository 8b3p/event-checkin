import type { IEventRepository } from "@/features/events/domain/IEventRepository";
import type { IScanRepository } from "@/features/check-in/domain/IScanRepository";
import { generateShareToken, isWellFormedShareToken, shareTokensMatch } from "@/shared/lib/share-token";
import { buildReportView } from "../buildReportView";
import type { ReportView } from "../EventReport";
import type { IReportShareRepository } from "../IReportShareRepository";
import type { ReportShare } from "../ReportShare";
import { GetEventReportUseCase } from "./GetEventReportUseCase";

export class GetReportShareUseCase {
  constructor(private readonly shares: Pick<IReportShareRepository, "getByEventId">) {}

  execute(eventId: number): Promise<ReportShare | null> {
    return this.shares.getByEventId(eventId);
  }
}

/** Starts sharing — or returns the link already in force, so a second click never rotates it. */
export class CreateReportShareUseCase {
  constructor(private readonly shares: Pick<IReportShareRepository, "create">) {}

  async execute(eventId: number): Promise<ReportShare> {
    const share = await this.shares.create(eventId, generateShareToken());
    if (!share) throw new Error("لم يتم العثور على الفعالية.");
    return share;
  }
}

export class RevokeReportShareUseCase {
  constructor(private readonly shares: Pick<IReportShareRepository, "revoke">) {}

  execute(eventId: number): Promise<void> {
    return this.shares.revoke(eventId);
  }
}

export class SetReportShareNamesUseCase {
  constructor(private readonly shares: Pick<IReportShareRepository, "setShowNames">) {}

  execute(eventId: number, showNames: boolean): Promise<void> {
    return this.shares.setShowNames(eventId, showNames);
  }
}

/**
 * The logged-out read of a report. Everything about "who may see this" is
 * here: the token must be well-formed (the unique-index lookup does the
 * matching; the constant-time compare is a belt on top of it), and what comes
 * back is a ReportView, never the owner's full report.
 */
export class GetSharedReportUseCase {
  constructor(
    private readonly shares: Pick<IReportShareRepository, "getByToken">,
    private readonly eventRepository: Pick<IEventRepository, "getById">,
    private readonly scanRepository: Pick<IScanRepository, "listGuestAttendance" | "listScansForEvent" | "arrivalBuckets">,
  ) {}

  async execute(token: string): Promise<ReportView | null> {
    if (!isWellFormedShareToken(token)) return null;

    const found = await this.shares.getByToken(token);
    if (!found || !shareTokensMatch(found.share.token, token)) return null;

    const report = await new GetEventReportUseCase(this.eventRepository, this.scanRepository).execute(found.eventId);
    return report ? buildReportView(report, found.share.showNames) : null;
  }
}
