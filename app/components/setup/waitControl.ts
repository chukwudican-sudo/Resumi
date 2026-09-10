import type { Step } from '../Stages';

/** What a wait looks like, and how much of the screen it is entitled to. */
export interface WaitRequest {
  /** What is happening, as a sentence. Only shown by the window-sized one. */
  title: string;
  steps: Step[];
  estimate?: string;
  /**
   * How much it takes.
   *
   * The rule: **the wait fills the thing that is about to change.** An import
   * replaces the entire profile, so it takes the window. A polish changes the
   * resume, so it takes the pane the resume lives in and leaves the rail and the
   * editor alone — hiding those would claim it was touching them.
   */
  scope: 'window' | 'pane';
}

/**
 * The handle a control uses to raise a wait.
 *
 * Polish, Download and the uploader all start something long, and none of them
 * is anywhere near the place the result appears. Rather than each growing its
 * own overlay — three copies of one thing, drifting — they raise it.
 */
export interface WaitControl {
  start: (request: WaitRequest) => void;
  /** Only the upload has a real number to report. */
  progress: (percent: number) => void;
  /** The work resolved. The last step is now allowed to tick. */
  finish: () => void;
  /** It failed, or never began. Take it away without ticking anything. */
  cancel: () => void;
}
