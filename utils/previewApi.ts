/**
 * previewApi.ts — "Try it as a customer" endpoints (spec: restaunax
 * docs/superpowers/specs/2026-10-16-promotion-preview-design.md). Thin: one
 * request each; the token is the credential for read / end.
 */
import { apiRequestRaw, type RawResponse } from "./apiHelper";

export interface PreviewCreated {
  previewUrl: string;
  token: string;
  expiresAt: string;
}

export function createRestaurantPreviewRaw(
  accessToken: string,
  restaurantId: string,
  body: Record<string, unknown>
): Promise<
  RawResponse<{ success: boolean; data?: PreviewCreated; errorCode?: string }>
> {
  return apiRequestRaw(
    "POST",
    `/api/promotions/restaurant/${restaurantId}/previews`,
    body,
    accessToken
  );
}

export function getPreviewRaw(previewToken: string): Promise<
  RawResponse<{
    success: boolean;
    data?: Record<string, unknown>;
    errorCode?: string;
  }>
> {
  return apiRequestRaw("GET", `/api/promotions/preview/${previewToken}`);
}

export function endPreviewRaw(
  previewToken: string
): Promise<RawResponse<{ success: boolean }>> {
  return apiRequestRaw("DELETE", `/api/promotions/previews/${previewToken}`);
}

export const previewHeader = (
  previewToken: string
): Record<string, string> => ({
  "X-Promotion-Preview": previewToken,
});
