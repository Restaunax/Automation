/**
 * publishBackstop.ts — temporarily publish a fixture restaurant, leak-safe.
 *
 * A published restaurant takes real orders, so a test that publishes a
 * fixture location (25-promotion-scenarios S8 publishes the Automation
 * Chain's location A so lima's location picker lists it) must never leave it
 * published. An in-test `finally` misses a crash, a SIGINT/SIGKILL or a
 * worker killed at its timeout, so before publishing we write a marker file
 * with the location's ORIGINAL value; the `finally` restores it and drops
 * the marker, and globalTeardown (and the next globalSetup, for a run that
 * never reached teardown) restores whatever a marker still lists.
 */

import * as fs from "fs";
import * as path from "path";
import { apiRequestRaw, setRestaurantPublishedApi } from "./apiHelper";

export const PUBLISH_MARKER_FILE = path.resolve(
  __dirname,
  "../publish-restore.tmp.json"
);

interface PublishMarker {
  restaurantId: string;
  /** The value to put back. */
  published: boolean;
}

const readMarkers = (): PublishMarker[] => {
  try {
    return JSON.parse(
      fs.readFileSync(PUBLISH_MARKER_FILE, "utf-8")
    ) as PublishMarker[];
  } catch {
    // No file (the normal case) or an unreadable one: nothing to restore.
    return [];
  }
};

const writeMarkers = (markers: PublishMarker[]): void => {
  if (markers.length === 0) {
    fs.rmSync(PUBLISH_MARKER_FILE, { force: true });
  } else {
    fs.writeFileSync(PUBLISH_MARKER_FILE, JSON.stringify(markers, null, 2));
  }
};

/**
 * Publishes `restaurantId` and returns the function that puts its original
 * value back (call it in `finally`). The marker is on disk BEFORE the publish.
 */
export async function publishTemporarily(
  adminToken: string,
  restaurantId: string
): Promise<() => Promise<void>> {
  const current = await apiRequestRaw<{
    restaurant?: { published?: boolean };
  }>("GET", `/restaurant/restaurantId/${restaurantId}`, undefined, adminToken);
  if (!current.ok)
    throw new Error(
      `[publishBackstop] GET restaurant ${restaurantId} → ${current.status}`
    );
  const original = current.data.restaurant?.published === true;
  if (original) return async () => {};
  writeMarkers([
    ...readMarkers().filter((m) => m.restaurantId !== restaurantId),
    { restaurantId, published: original },
  ]);
  await setRestaurantPublishedApi(adminToken, restaurantId, true);
  return async () => {
    await setRestaurantPublishedApi(adminToken, restaurantId, original);
    writeMarkers(readMarkers().filter((m) => m.restaurantId !== restaurantId));
  };
}

/**
 * Restores every restaurant a marker still lists (a run that died between
 * publish and restore). Never throws; a failed restore keeps its marker so
 * the next setup/teardown tries again.
 */
export async function restoreLeftoverPublishes(
  adminToken: string,
  label: string
): Promise<void> {
  const left: PublishMarker[] = [];
  for (const m of readMarkers()) {
    try {
      await setRestaurantPublishedApi(adminToken, m.restaurantId, m.published);
      console.log(
        `[${label}] Restored published=${m.published} on ${m.restaurantId} (a test left it published)`
      );
    } catch (err) {
      console.warn(
        `[${label}] Could not restore published=${m.published} on ${m.restaurantId}:`,
        err
      );
      left.push(m);
    }
  }
  writeMarkers(left);
}
