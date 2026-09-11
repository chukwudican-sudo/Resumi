/**
 * One message, carried across one navigation.
 *
 * The form now tailors before it navigates, so a tailor that fails does so on a
 * screen the person is about to leave. The application exists by then, so
 * staying put would be wrong — but arriving at it with no explanation is worse,
 * and "Ready when you are." on a resume you just paid for and did not get reads
 * as though nothing happened.
 *
 * sessionStorage rather than a query parameter: the messages differ in ways
 * that matter (out of credits is not a timeout is not an empty profile), and
 * putting server-written text into a URL means rendering whatever is in the URL
 * back to whoever opens it. Per-tab, and cleared by the first read.
 */
const key = (applicationId: string) => `resumi:tailor-failed:${applicationId}`;

export function stashTailorFailure(applicationId: string, message: string): void {
  try {
    sessionStorage.setItem(key(applicationId), message);
  } catch {
    // Site data blocked. The person still lands on a page with a button that
    // says what to do; they simply are not told why the first attempt did not.
  }
}

/** Reads the message and removes it, so a refresh does not replay it. */
export function takeTailorFailure(applicationId: string): string | null {
  try {
    const found = sessionStorage.getItem(key(applicationId));
    if (found) sessionStorage.removeItem(key(applicationId));
    return found;
  } catch {
    return null;
  }
}
