export type EventStatus = "draft" | "live" | "archived";

export type Event = {
  id: number;
  name: string;
  eventDate: string | null;
  venue: string | null;
  locationLink: string | null;
  description: string | null;
  doorCode: string;
  capacity: number | null;
  status: EventStatus;
  createdAt: Date;
};

export type EventInput = {
  name: string;
  eventDate: string | null;
  venue: string | null;
  locationLink: string | null;
  description: string | null;
  doorCode: string;
  capacity: number | null;
};
