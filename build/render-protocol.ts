// Messages between the main thread and the renderer worker (render-worker.ts).
// Kept apart from the worker, which runs its code as soon as it is imported.
import type { MessagePort } from 'node:worker_threads';
import type { RenderInfo } from '../types/client';

/** A renderer module for the worker to import */
export interface RendererModule {
  script: string;
  /** The module's path */
  filePath: string;
  /** The module's path for error messages, such as `src/a.render.ts` */
  file: string;
}

export interface RenderWorkerData {
  modules: RendererModule[];
  /** Carries render requests and replies */
  port: MessagePort;
  /**
   * Set to SIGNAL_REPLIED once a reply is posted, or SIGNAL_EXITED when the
   * worker exits, so the main thread can wait for either
   */
  signal: Int32Array;
}

export const SIGNAL_REPLIED = 1;
export const SIGNAL_EXITED = 2;

/** The worker's first message: each script's element names, or an error */
export type RenderWorkerReady =
  | { ok: true; elements: Record<string, string[]> }
  | { ok: false; message: string };

export interface RenderRequest {
  script: string;
  name: string;
  info: RenderInfo;
}

/**
 * A render call's result. `fatal` means the worker can't be trusted for any
 * later call either.
 */
export type RenderReply =
  | { ok: true; html: string }
  | { ok: false; message: string; fatal?: boolean };
