import { ApiNetworkError } from "../api/client";

export function shouldSuppressChatLoadError(error: unknown): boolean {
  return error instanceof ApiNetworkError;
}
