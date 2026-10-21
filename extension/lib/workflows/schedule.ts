import { Cron } from 'croner'
import type { Schedule } from './types'

const MINUTE = 60_000
const HOUR = 60 * MINUTE

export function systemTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

export function parseTime(value: string): { hour: number; minute: number } | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim())
  if (!match) return null
  const hour = Number(match[1])
  const minute = Number(match[2])
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return null
  if (!Number.isInteger(minute) || minute < 0 || minute > 59) return null
  return { hour, minute }
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

export function formatTimeOfDay(time: string): string {
  const parsed = parseTime(time)
  return parsed ? `${pad(parsed.hour)}:${pad(parsed.minute)}` : time
}

function cronFor(schedule: Schedule): string | null {
  switch (schedule.kind) {
    case 'daily': {
      const time = parseTime(schedule.time)
      return time ? `${time.minute} ${time.hour} * * *` : null
    }
    case 'weekdays': {
      const time = parseTime(schedule.time)
      if (!time || schedule.days.length === 0) return null
      return `${time.minute} ${time.hour} * * ${schedule.days.join(',')}`
    }
    case 'monthly': {
      const time = parseTime(schedule.time)
      return time ? `${time.minute} ${time.hour} ${schedule.day} * *` : null
    }
    case 'cron':
      return schedule.expression.trim()
    default:
      return null
  }
}

function cronInstance(expression: string, timezone: string): Cron | null {
  try {
    // paused: only used for date math — never register a timer
    return new Cron(expression, { timezone, paused: true })
  } catch {
    return null
  }
}

/** Next occurrence strictly after `from` (ms epoch), or null when there is none. */
export function nextRun(schedule: Schedule, timezone: string, from = Date.now()): number | null {
  switch (schedule.kind) {
    case 'minutes':
    case 'hours': {
      const every = Math.floor(schedule.every)
      if (!Number.isFinite(every) || every < 1) return null
      const period = (schedule.kind === 'minutes' ? every * MINUTE : every * HOUR)
      return Math.ceil((from + 1) / period) * period
    }
    case 'once':
      return schedule.at > from ? schedule.at : null
    default: {
      const expression = cronFor(schedule)
      if (!expression) return null
      const cron = cronInstance(expression, timezone)
      const next = cron?.nextRun(new Date(from + 1))
      return next ? next.getTime() : null
    }
  }
}

/** Upcoming occurrences for the editor preview. */
export function nextRuns(schedule: Schedule, timezone: string, count = 3, from = Date.now()): number[] {
  const runs: number[] = []
  let cursor = from
  for (let i = 0; i < Math.min(Math.max(count, 1), 10); i++) {
    const next = nextRun(schedule, timezone, cursor)
    if (next == null) break
    runs.push(next)
    cursor = next
  }
  return runs
}

/** Returns an error message, or null when the schedule is usable. */
export function validateSchedule(schedule: Schedule, timezone: string): string | null {
  try {
    if (!new Intl.DateTimeFormat(undefined, { timeZone: timezone })) return 'invalid timezone'
  } catch {
    return `invalid timezone: ${timezone}`
  }

  switch (schedule.kind) {
    case 'minutes':
      if (!Number.isInteger(schedule.every) || schedule.every < 1 || schedule.every > 1440) {
        return 'interval must be between 1 and 1440 minutes'
      }
      return null
    case 'hours':
      if (!Number.isInteger(schedule.every) || schedule.every < 1 || schedule.every > 24) {
        return 'interval must be between 1 and 24 hours'
      }
      return null
    case 'daily':
      return parseTime(schedule.time) ? null : 'time must be HH:MM'
    case 'weekdays':
      if (!parseTime(schedule.time)) return 'time must be HH:MM'
      if (!Array.isArray(schedule.days) || schedule.days.length === 0) return 'pick at least one day'
      if (schedule.days.some((day) => !Number.isInteger(day) || day < 0 || day > 6)) return 'invalid day'
      return null
    case 'monthly':
      if (!parseTime(schedule.time)) return 'time must be HH:MM'
      if (!Number.isInteger(schedule.day) || schedule.day < 1 || schedule.day > 31) return 'day must be 1–31'
      return null
    case 'cron': {
      const expression = schedule.expression.trim()
      if (!expression) return 'cron expression is required'
      if (expression.length > 120) return 'cron expression is too long'
      const cron = cronInstance(expression, timezone)
      if (!cron || !cron.nextRun(new Date())) return `invalid cron expression: ${expression}`
      return null
    }
    case 'once':
      if (!Number.isFinite(schedule.at)) return 'invalid date'
      if (schedule.at <= Date.now() + 5_000) return 'the one-time run must be in the future'
      return null
    default:
      return 'unknown schedule type'
  }
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function describeSchedule(schedule: Schedule, timezone: string): string {
  switch (schedule.kind) {
    case 'minutes':
      return `Every ${schedule.every} minute${schedule.every === 1 ? '' : 's'}`
    case 'hours':
      return `Every ${schedule.every} hour${schedule.every === 1 ? '' : 's'}`
    case 'daily':
      return `Daily at ${formatTimeOfDay(schedule.time)}`
    case 'weekdays': {
      const days = [...new Set(schedule.days)].sort((a, b) => a - b)
      const label =
        days.length === 5 && days.join(',') === '1,2,3,4,5'
          ? 'Mon–Fri'
          : days.length === 7
            ? 'Every day'
            : days.map((day) => DAY_NAMES[day] ?? day).join(', ')
      return `${label} at ${formatTimeOfDay(schedule.time)}`
    }
    case 'monthly':
      return `Monthly on day ${schedule.day} at ${formatTimeOfDay(schedule.time)}`
    case 'cron':
      return `Cron ${schedule.expression.trim()} (${timezone})`
    case 'once':
      return `Once on ${formatTimestamp(schedule.at)}`
    default:
      return 'Unknown schedule'
  }
}

export function formatTimestamp(ms: number): string {
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(ms))
  } catch {
    return new Date(ms).toISOString()
  }
}

export function formatTimestampInZone(ms: number, timezone: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: timezone,
    }).format(new Date(ms))
  } catch {
    return formatTimestamp(ms)
  }
}

export function relativeTime(ms: number, now = Date.now()): string {
  const diff = ms - now
  const abs = Math.abs(diff)
  if (abs < MINUTE) return diff >= 0 ? 'in a few seconds' : 'just now'
  if (abs < HOUR) {
    const minutes = Math.round(abs / MINUTE)
    return diff >= 0 ? `in ${minutes}m` : `${minutes}m ago`
  }
  if (abs < 24 * HOUR) {
    const hours = Math.round(abs / HOUR)
    return diff >= 0 ? `in ${hours}h` : `${hours}h ago`
  }
  const days = Math.round(abs / (24 * HOUR))
  return diff >= 0 ? `in ${days}d` : `${days}d ago`
}
