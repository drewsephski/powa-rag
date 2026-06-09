/**
 * Shared source processing pipeline: extract → index → KB.
 *
 * Powabase canonical RAG flow:
 *   upload → poll "extracted" → add to KB (triggers indexing)
 *
 * Extraction is a HARD barrier: addSourceToKnowledgeBase 400s unless
 * extraction_status === "extracted". "attention_required" is rejected —
 * the pipeline auto-retries with OCR (mistral) in that case.
 */

import { query } from "@/lib/db/client"
import {
  addSourceToKnowledgeBase,
  waitForExtraction,
  reextractSource,
} from "@/lib/powabase/client"

export async function processSourcePipeline(
  kbId: string,
  powaSourceId: string,
  sourceRecordId: string | undefined
): Promise<void> {
  try {
    // ── Step 1: Wait for extraction ──
    // Polls every 2s for up to 3 minutes (90 tries) for PDF extraction
    let extractionStatus = await waitForExtraction(powaSourceId, 90)

    // ── Step 1b: If attention_required, re-extract with OCR ──
    // Scanned PDFs or low-quality extracts reach this state. Re-extracting
    // with "mistral" (OCR model) usually fixes it.
    if (extractionStatus === "attention_required") {
      console.warn(
        `Source ${powaSourceId} needs OCR re-extraction. Triggering re-extract with mistral...`
      )
      await updateStatus(sourceRecordId, "extracting")
      await reextractSource(powaSourceId, "mistral")
      extractionStatus = await waitForExtraction(powaSourceId, 90)
    }

    // Update DB with the final status
    await updateStatus(sourceRecordId, extractionStatus)

    // ── Step 2: If extracted, add to KB (triggers indexing) ──
    if (extractionStatus === "extracted") {
      await addSourceToKnowledgeBase(kbId, powaSourceId)

      // Indexing completes in the background — mark as extracted
      await updateStatus(sourceRecordId, "extracted")
    } else {
      console.error(
        `Source ${powaSourceId} extraction ended with: ${extractionStatus}`
      )
    }
  } catch (err) {
    console.error("Async source processing error:", err)
  }
}

async function updateStatus(
  sourceRecordId: string | undefined,
  status: string
) {
  if (!sourceRecordId) return
  try {
    await query(
      `UPDATE bot_knowledge_sources SET extraction_status = $1 WHERE id = $2`,
      [status, sourceRecordId]
    )
  } catch {
    // Non-critical — DB constraint might reject some statuses
  }
}
