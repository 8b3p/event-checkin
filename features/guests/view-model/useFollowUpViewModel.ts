"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  countByFollowUp,
  countWithoutPhone,
  DEFAULT_TEMPLATES,
  fillTemplate,
  filterByFollowUp,
  hasPhone,
  phoneNumbersOf,
  templateKindFor,
  type FollowUpFilter,
  type FollowUpGuest,
  type TemplateKind,
} from "../domain/followUps";
import { whatsappUrl } from "@/shared/lib/phone";

const STORAGE_KEY = "door:follow-up-templates:v1";

type Templates = Record<TemplateKind, string>;

function loadTemplates(): Templates {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_TEMPLATES;
    const parsed = JSON.parse(raw) as Partial<Templates>;
    return {
      thanks: typeof parsed.thanks === "string" ? parsed.thanks : DEFAULT_TEMPLATES.thanks,
      missed: typeof parsed.missed === "string" ? parsed.missed : DEFAULT_TEMPLATES.missed,
    };
  } catch {
    return DEFAULT_TEMPLATES;
  }
}

export type FollowUpRow = {
  guest: FollowUpGuest;
  whatsapp: string | null;
};

/**
 * State for the follow-up lists: which list is showing, the two editable
 * message templates (kept in this browser's localStorage — no schema), the
 * per-row WhatsApp links, and the copy-all-numbers action.
 */
export function useFollowUpViewModel(guests: FollowUpGuest[]) {
  const [filter, setFilter] = useState<FollowUpFilter>("attended");
  const [templates, setTemplates] = useState<Templates>(DEFAULT_TEMPLATES);
  const [copied, setCopied] = useState(false);

  // Read after mount so server and first client render agree.
  useEffect(() => {
    setTemplates(loadTemplates());
  }, []);

  const kind = templateKindFor(filter);
  const template = templates[kind];

  const setTemplate = useCallback(
    (value: string) => {
      setTemplates((current) => {
        const next = { ...current, [kind]: value };
        try {
          window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        } catch {
          // Private mode / blocked storage: the edit still applies for this visit.
        }
        return next;
      });
    },
    [kind],
  );

  const resetTemplate = useCallback(() => setTemplate(DEFAULT_TEMPLATES[kind]), [kind, setTemplate]);

  const counts = useMemo(() => countByFollowUp(guests), [guests]);
  const listed = useMemo(() => filterByFollowUp(guests, filter), [guests, filter]);

  const rows: FollowUpRow[] = useMemo(
    () =>
      listed.map((guest) => ({
        guest,
        whatsapp: hasPhone(guest) ? whatsappUrl(guest.phone, fillTemplate(template, guest.name)) : null,
      })),
    [listed, template],
  );

  const numbers = useMemo(() => phoneNumbersOf(listed), [listed]);

  async function copyNumbers() {
    const text = numbers.join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("انسخ الأرقام:", text);
    }
  }

  return {
    filter,
    setFilter,
    counts,
    rows,
    kind,
    template,
    setTemplate,
    resetTemplate,
    withoutPhone: countWithoutPhone(listed),
    numberCount: numbers.length,
    copied,
    copyNumbers,
  };
}
