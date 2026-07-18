// The ONE decode-once sample loader/cache (D-15). Every `.ogg` the game plays —
// creature one-shots (createAmbience, 10-03) and the region/combat music loops
// (createMusic, 10-06) — is fetched and decoded through here exactly once, then
// the decoded AudioBuffer is reused for every play. No per-play decode (D-15).
//
// The gesture unlock is ASYNC (RESEARCH Pitfall 1): the AudioContext only exists
// after the first user gesture, and `decodeAudioData` needs a live context. So
// this splits the two halves of loading:
//   1. fetch the ArrayBuffer EAGERLY  — the network is context-free, do it now.
//   2. decode to an AudioBuffer LAZILY — only once a running context exists,
//      caching the result keyed by url AND context (rebuild the decode if the
//      context object changes, mirroring the createCombatAudio.bus() idiom).
//
// `get(url)` NEVER throws and NEVER blocks: it returns the decoded buffer or
// null (not yet decoded / fetch failed / decode failed). Callers on the audio
// frame path skip silently on null — a missing or still-decoding sample is a
// no-op, never an exception mid-frame (threat T-10-03-A: decode failure no-ops).

export interface SampleCache {
  /** Begin fetching (and, once a context is live, decoding) a url. Idempotent — safe to call repeatedly. */
  preload(url: string): void;
  /** The decoded buffer for a url, or null (not fetched yet / still decoding / fetch or decode failed). Never throws. */
  get(url: string): AudioBuffer | null;
  /** True when a live, running AudioContext is available to decode against. */
  ready(): boolean;
  dispose(): void;
}

/** Per-url loading state. `failed` latches so a broken url is not retried forever. */
interface Entry {
  /** Raw encoded bytes — fetched once, kept so a context swap can re-decode (decodeAudioData detaches its input). */
  bytes: ArrayBuffer | null;
  /** Decoded buffer for `decodeContext`; null until decoded. */
  buffer: AudioBuffer | null;
  /** Guards against overlapping fetch requests for the same url. */
  fetching: boolean;
  /** Guards against overlapping decode requests for the same url+context. */
  decoding: boolean;
  /** Latched fetch/decode failure — the layer simply stays silent (D-04 no-op). */
  failed: boolean;
}

export function createSampleCache(getContext: () => AudioContext | null): SampleCache {
  const entries = new Map<string, Entry>();
  // The context every currently-decoded buffer belongs to. When getContext()
  // returns a different object (async unlock / rebuild), all decoded buffers are
  // stale and must be re-decoded from the retained bytes.
  let decodeContext: AudioContext | null = null;
  let disposed = false;

  function ready(): AudioContext | null {
    const context = getContext();
    return context && context.state === 'running' ? context : null;
  }

  function entryFor(url: string): Entry {
    let entry = entries.get(url);
    if (!entry) {
      entry = { bytes: null, buffer: null, fetching: false, decoding: false, failed: false };
      entries.set(url, entry);
    }
    return entry;
  }

  /** Eagerly pull the encoded bytes (context-free). Failure latches to a silent no-op. */
  function fetchBytes(url: string, entry: Entry): void {
    if (entry.bytes || entry.fetching || entry.failed) return;
    entry.fetching = true;
    fetch(url)
      .then((response) => {
        if (!response.ok) throw new Error(`sample fetch ${response.status} for ${url}`);
        return response.arrayBuffer();
      })
      .then((bytes) => {
        if (disposed) return;
        entry.bytes = bytes;
        entry.fetching = false;
        // Try to decode immediately if a context is already live.
        decodeIfReady(url, entry);
      })
      .catch(() => {
        // Missing asset (not yet dropped) or network error: stay silent (D-04).
        entry.fetching = false;
        entry.failed = true;
      });
  }

  /** Decode the retained bytes to an AudioBuffer for the current context, once. */
  function decodeIfReady(url: string, entry: Entry): void {
    const context = ready();
    if (!context || !entry.bytes || entry.decoding) return;
    // A live buffer already decoded against THIS context needs nothing.
    if (entry.buffer && decodeContext === context) return;

    // The context changed (or first decode): every prior buffer is stale.
    if (decodeContext !== context) {
      decodeContext = context;
      for (const other of entries.values()) other.buffer = null;
    }

    entry.decoding = true;
    // decodeAudioData DETACHES its input ArrayBuffer, so decode a COPY and keep
    // the original bytes for a possible re-decode after a context swap.
    const copy = entry.bytes.slice(0);
    context
      .decodeAudioData(copy)
      .then((buffer) => {
        entry.decoding = false;
        if (disposed) return;
        // Discard if the context has already moved on since we started.
        if (decodeContext !== context) return;
        entry.buffer = buffer;
      })
      .catch(() => {
        // Corrupt/undecodable asset: no-op layer, never throw mid-frame.
        entry.decoding = false;
        entry.failed = true;
      });
  }

  return {
    preload(url) {
      if (disposed) return;
      const entry = entryFor(url);
      fetchBytes(url, entry);
      decodeIfReady(url, entry);
    },

    get(url) {
      if (disposed) return null;
      const entry = entries.get(url);
      if (!entry) {
        // First ask also starts the load, so a lazily-referenced sample warms up.
        this.preload(url);
        return null;
      }
      // Kick the pipeline forward: fetch if not started, decode once a context lives.
      if (!entry.bytes) fetchBytes(url, entry);
      else decodeIfReady(url, entry);
      // Return the buffer only if it is decoded against the CURRENT context.
      return decodeContext === ready() ? entry.buffer : null;
    },

    ready() {
      return ready() != null;
    },

    dispose() {
      disposed = true;
      entries.clear();
      decodeContext = null;
    },
  };
}
