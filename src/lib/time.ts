export function normalizeDate(input: Date | string | null | undefined): Date | null {
  if (!input) return null;
  const parsed =
    typeof input === 'string'
      ? new Date(/(Z|[+-]\d{2}:?\d{2})$/.test(input) ? input : `${input}Z`)
      : input;
  return isNaN(parsed.getTime()) ? null : parsed;
}

type FormatOptions = Intl.DateTimeFormatOptions & { fallback?: string };

export function formatInTimeZone(
  input: Date | string | null | undefined,
  timezone: string,
  options: FormatOptions = {}
): string {
  const { fallback = 'N/A', ...intlOptions } = options;
  const parsed = normalizeDate(input);
  if (!parsed) return fallback;

  // Ensure timezone is valid, fallback to UTC if not provided
  const safeTimezone = timezone || 'UTC';

  try {
    // If dateStyle or timeStyle are provided, use them exclusively
    // as they cannot be combined with individual date/time components
    const hasStyleOptions = intlOptions.dateStyle || intlOptions.timeStyle;
    
    const formatOptions: Intl.DateTimeFormatOptions = hasStyleOptions
      ? {
          timeZone: safeTimezone,
          ...intlOptions,
        }
      : {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          timeZone: safeTimezone,
          ...intlOptions,
        };

    const formatter = new Intl.DateTimeFormat('en-US', formatOptions);
    return formatter.format(parsed);
  } catch {
    return fallback;
  }
}
