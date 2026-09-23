export type Owner = { id: number; email: string; passwordHash: string };

export interface IOwnerRepository {
  get(): Promise<Owner | null>;
  create(input: { email: string; passwordHash: string }): Promise<void>;
  updatePassword(passwordHash: string): Promise<void>;
}
