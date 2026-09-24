import { HttpError, type Env, type FulfillResult, type PaidSession } from "@telep/platform";
import { fulfillmentClaimId, getJobById, hasDurableJobStore, recordJobEvent, releaseJobEvent, saveJob, type Job } from "./jobs";
import { assertPaperReady, paperRuntime, sendPaperLetter } from "./provider";

function paidJob(job: Job, session: PaidSession, note: string, extra: Partial<Job> = {}): Job {
  return {
    ...job,
    status: "paid",
    note,
    stripeSessionId: session.id,
    stripeEventId: session.eventId,
    ...extra,
  };
}

/**
 * Mark a PaperSend job paid and ask Lob to send.
 * Demo mode returns before any Lob call. A job that already has a submitted letter is not mailed again.
 */
export async function fulfillPaperPayment(session: PaidSession, env: Env = process.env): Promise<FulfillResult> {
  if (session.metadata.connector !== "paper-send") {
    return { fulfilled: false, lobCalled: false, reason: "ignored_connector" };
  }
  const runtime = paperRuntime(env);
  if (runtime.mode === "demo") {
    return { fulfilled: false, lobCalled: false, reason: "demo" };
  }
  if (!hasDurableJobStore(env)) {
    return { fulfilled: false, lobCalled: false, reason: "DATABASE_URL required", retry: true };
  }
  const jobId = session.metadata.jobId;
  if (!jobId) {
    return { fulfilled: false, lobCalled: false, reason: "missing_job", retry: true };
  }

  const job = await getJobById(jobId, env);
  if (!job) {
    return { fulfilled: false, lobCalled: false, reason: "job_not_found", retry: true, jobId };
  }
  if (job.status === "submitted" && job.lobId) {
    await recordJobEvent(session.eventId, job.id, env);
    return { fulfilled: true, duplicate: true, lobCalled: false, lobId: job.lobId, jobId: job.id };
  }
  if (job.fulfillmentError && job.stripeEventId === session.eventId) {
    return { fulfilled: false, duplicate: true, lobCalled: false, reason: job.fulfillmentError, jobId: job.id };
  }

  const expectLive = runtime.mode === "live";
  if (session.livemode !== expectLive) {
    const note = "Payment mode does not match PAPER_SEND_APP_MODE. Lob was not called.";
    await saveJob(paidJob(job, session, note, { fulfillmentError: note }), env);
    return { fulfilled: false, lobCalled: false, reason: "mode_mismatch", jobId: job.id };
  }
  if (session.currency && session.currency.toLowerCase() !== job.currency) {
    const note = "Payment currency does not match the job. Lob was not called.";
    await saveJob(paidJob(job, session, note, { fulfillmentError: note }), env);
    return { fulfilled: false, lobCalled: false, reason: "currency_mismatch", jobId: job.id };
  }
  if (session.amountSubtotal == null || session.amountSubtotal !== job.amountCents) {
    const note = "Payment amount does not match the job. Lob was not called.";
    await saveJob(paidJob(job, session, note, { fulfillmentError: note }), env);
    return { fulfilled: false, lobCalled: false, reason: "amount_mismatch", jobId: job.id };
  }

  if (!runtime.lobKey) {
    const note = "Paid. PAPER_SEND_LOB_API_KEY is empty, so Lob was not called.";
    await saveJob(paidJob(job, session, note), env);
    return { fulfilled: false, lobCalled: false, reason: "missing_lob_key", retry: true, jobId: job.id };
  }

  try {
    assertPaperReady(env);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Lob credentials were rejected";
    await saveJob(paidJob(job, session, `Paid. Lob was not called: ${message}`), env);
    return { fulfilled: false, lobCalled: false, reason: message, retry: true, jobId: job.id };
  }

  const claimId = fulfillmentClaimId(job.id);
  const claimed = await recordJobEvent(claimId, job.id, env);
  if (!claimed) {
    const again = await getJobById(job.id, env);
    if (again?.status === "submitted" && again.lobId) {
      return { fulfilled: true, duplicate: true, lobCalled: false, lobId: again.lobId, jobId: job.id };
    }
    if (again?.fulfillmentError) {
      return { fulfilled: false, duplicate: true, lobCalled: false, reason: again.fulfillmentError, jobId: job.id };
    }
    return { fulfilled: false, duplicate: true, lobCalled: false, reason: "in_flight", retry: true, jobId: job.id };
  }

  let lobCalled = false;
  try {
    await saveJob(paidJob(job, session, "Paid. Asking Lob to send."), env);
    lobCalled = true;
    const letter = await sendPaperLetter(job, env);
    if (letter.status === "failed") {
      const note = `Lob reported letter ${letter.id} as failed. This was not mailed.`;
      await saveJob(
        paidJob(job, session, note, { fulfillmentError: note, lobId: letter.id, lobStatus: letter.status }),
        env,
      );
      await recordJobEvent(session.eventId, job.id, env);
      return { fulfilled: false, lobCalled: true, reason: "lob_failed", lobId: letter.id, jobId: job.id };
    }
    await saveJob(
      {
        ...job,
        status: "submitted",
        fulfillment: "live",
        stripeSessionId: session.id,
        stripeEventId: session.eventId,
        lobId: letter.id,
        lobStatus: letter.status,
        expectedDelivery: letter.expected_delivery_date ?? null,
        fulfillmentError: undefined,
        note: `Lob accepted letter ${letter.id}. The gateway sent HTML built from this job (filename and page count). PDF bytes are not stored on this path.`,
      },
      env,
    );
    await recordJobEvent(session.eventId, job.id, env);
    return { fulfilled: true, duplicate: false, lobCalled: true, lobId: letter.id, jobId: job.id };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Lob request failed";
    const retry = !(error instanceof HttpError) || error.status >= 500;
    if (!retry) {
      await saveJob(paidJob(job, session, `Paid, but Lob did not accept the letter: ${message}`, { fulfillmentError: message }), env);
      await recordJobEvent(session.eventId, job.id, env);
    } else {
      await saveJob(paidJob(job, session, `Paid, but Lob did not accept the letter yet: ${message}`), env);
      await releaseJobEvent(claimId, env);
    }
    return { fulfilled: false, lobCalled, reason: message, retry, jobId: job.id };
  }
}
