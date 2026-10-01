export const normalizeScrollMinutes = (value) => {
  const minutes = Number(value);
  return Number.isFinite(minutes) ? Math.min(120, Math.max(1, Math.round(minutes))) : 10;
};

// All timestamps are monotonic milliseconds. Rendering never records activity.
export class MindfulScrollSession {
  constructor({ minutes = 10, idleMs = 15000, breakMs = 120000, recoveryMs = 5000, snoozeMs = 300000 } = {}) {
    this.limitMs = normalizeScrollMinutes(minutes) * 60000;
    this.idleMs = idleMs;
    this.breakMs = breakMs;
    this.recoveryMs = recoveryMs;
    this.snoozeMs = snoozeMs;
    this.elapsedMs = 0;
    this.lastAt = null;
    this.lastActivityAt = -Infinity;
    this.pausedSince = null;
    this.allowed = false;
    this.takingBreak = false;
    this.snoozedUntil = 0;
    this.recoveryUntil = 0;
    this.recoveryPending = false;
  }

  setMinutes(minutes) {
    this.limitMs = normalizeScrollMinutes(minutes) * 60000;
  }

  advance(at, allowed) {
    if (!Number.isFinite(at) || at < 0) return this.snapshot(this.lastAt || 0);
    const now = Math.max(at, this.lastAt ?? at);
    if (this.lastAt !== null && this.allowed && !this.takingBreak) {
      const end = Math.min(now, this.lastActivityAt + this.idleMs);
      if (end > this.lastAt) {
        this.elapsedMs += end - this.lastAt;
        this.pausedSince = end;
      }
    }
    this.pausedSince ??= now;
    if (this.elapsedMs > 0 && now - this.pausedSince >= this.breakMs) {
      this.reset(now, { recovery: !!allowed, takingBreak: this.takingBreak });
      this.recoveryPending = !allowed;
    }
    if (allowed && this.recoveryPending) {
      this.recoveryUntil = now + this.recoveryMs;
      this.recoveryPending = false;
    }
    this.lastAt = now;
    this.allowed = !!allowed;
    if (!this.allowed) this.lastActivityAt = -Infinity;
    return this.snapshot(now);
  }

  recordScroll(at, allowed) {
    this.advance(at, allowed);
    if (this.allowed && !this.takingBreak) {
      this.lastActivityAt = this.lastAt;
      this.pausedSince = this.lastAt;
    }
    return this.snapshot(this.lastAt || 0);
  }

  reset(at, { takingBreak = false, recovery = true } = {}) {
    this.elapsedMs = 0;
    this.lastAt = at;
    this.lastActivityAt = -Infinity;
    this.pausedSince = at;
    this.takingBreak = takingBreak;
    this.snoozedUntil = 0;
    this.recoveryUntil = recovery ? at + this.recoveryMs : 0;
    this.recoveryPending = false;
    return this.snapshot(at);
  }

  takeBreak(at) {
    return this.reset(at, { takingBreak: true });
  }

  snooze(at) {
    this.advance(at, this.allowed);
    this.snoozedUntil = at + this.snoozeMs;
    this.recoveryUntil = 0;
    return this.snapshot(at);
  }

  snapshot(at) {
    let phase = "quiet";
    if (at < this.recoveryUntil) phase = "recovery";
    else if (this.takingBreak) phase = "break";
    else if (at >= this.snoozedUntil) {
      if (this.elapsedMs >= this.limitMs) phase = "limit";
      else if (this.elapsedMs >= this.limitMs * 0.8) phase = "near";
    }
    return { phase, elapsedMs: this.elapsedMs, limitMs: this.limitMs, takingBreak: this.takingBreak };
  }
}
