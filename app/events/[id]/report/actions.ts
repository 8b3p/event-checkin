"use server";

import { revalidatePath } from "next/cache";
import {
  CreateReportShareUseCase,
  RevokeReportShareUseCase,
  SetReportShareNamesUseCase,
} from "@/features/reports/domain/use-cases/ReportShareUseCases";
import { makeReportShareRepository } from "@/features/reports/infrastructure/factory";
import { requireOwner } from "@/shared/lib/guard";

export type ReportShareState = { error?: string };

/** Each action re-checks the owner: a Server Action is a public POST endpoint whatever page renders it. */
async function run(eventId: number, work: () => Promise<void>): Promise<ReportShareState> {
  await requireOwner();
  if (!Number.isInteger(eventId)) return { error: "لم يتم العثور على الفعالية." };

  try {
    await work();
  } catch (error) {
    return { error: error instanceof Error ? error.message : "حدث خطأ غير متوقع." };
  }

  revalidatePath(`/events/${eventId}/report`);
  return {};
}

export async function createReportShareAction(eventId: number): Promise<ReportShareState> {
  return run(eventId, async () => {
    await new CreateReportShareUseCase(makeReportShareRepository()).execute(eventId);
  });
}

export async function revokeReportShareAction(eventId: number): Promise<ReportShareState> {
  return run(eventId, () => new RevokeReportShareUseCase(makeReportShareRepository()).execute(eventId));
}

export async function setReportShareNamesAction(eventId: number, showNames: boolean): Promise<ReportShareState> {
  return run(eventId, () => new SetReportShareNamesUseCase(makeReportShareRepository()).execute(eventId, showNames));
}
