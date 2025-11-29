/**
 * @file workstation-metadata-repository.ts
 * @copyright 2025 Roman Barinov <rbarinov@gmail.com>
 * @license MIT
 */

import { eq } from 'drizzle-orm';
import { getDatabase } from '../database/client.js';
import {
  workstationMetadata,
  type WorkstationMetadataRow,
  type NewWorkstationMetadataRow,
} from '../database/schema.js';

const WORKSTATION_ID = 'workstation';

/**
 * Repository for workstation metadata persistence operations.
 */
export class WorkstationMetadataRepository {
  /**
   * Gets the stored tunnel ID (workstation ID).
   */
  getTunnelId(): string | null {
    const db = getDatabase();
    const metadata = db
      .select()
      .from(workstationMetadata)
      .where(eq(workstationMetadata.id, WORKSTATION_ID))
      .get();

    return metadata?.tunnelId ?? null;
  }

  /**
   * Gets the stored public URL.
   */
  getPublicUrl(): string | null {
    const db = getDatabase();
    const metadata = db
      .select()
      .from(workstationMetadata)
      .where(eq(workstationMetadata.id, WORKSTATION_ID))
      .get();

    return metadata?.publicUrl ?? null;
  }

  /**
   * Gets all workstation metadata.
   */
  getMetadata(): WorkstationMetadataRow | null {
    const db = getDatabase();
    return db
      .select()
      .from(workstationMetadata)
      .where(eq(workstationMetadata.id, WORKSTATION_ID))
      .get() ?? null;
  }

  /**
   * Updates tunnel ID and public URL.
   * Uses INSERT OR REPLACE for atomic upsert.
   */
  updateTunnelInfo(tunnelId: string, publicUrl: string): void {
    const db = getDatabase();
    const now = new Date();

    const existing = db
      .select()
      .from(workstationMetadata)
      .where(eq(workstationMetadata.id, WORKSTATION_ID))
      .get();

    if (existing) {
      // Update existing row
      db.update(workstationMetadata)
        .set({
          tunnelId,
          publicUrl,
          updatedAt: now,
        })
        .where(eq(workstationMetadata.id, WORKSTATION_ID))
        .run();
    } else {
      // Insert new row
      const newMetadata: NewWorkstationMetadataRow = {
        id: WORKSTATION_ID,
        tunnelId,
        publicUrl,
        updatedAt: now,
      };
      db.insert(workstationMetadata).values(newMetadata).run();
    }
  }

  /**
   * Clears tunnel ID (e.g., when workstation is deregistered).
   */
  clearTunnelInfo(): void {
    const db = getDatabase();
    db.update(workstationMetadata)
      .set({
        tunnelId: null,
        publicUrl: null,
        updatedAt: new Date(),
      })
      .where(eq(workstationMetadata.id, WORKSTATION_ID))
      .run();
  }
}

