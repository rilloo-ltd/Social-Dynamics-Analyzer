export interface PrivacyRedactionResult {
  text: string;
  redactionCount: number;
  shouldDrop: boolean;
}

type RedactionKind =
  | 'password'
  | 'code'
  | 'username'
  | 'email'
  | 'phone'
  | 'card'
  | 'card_expiry'
  | 'cvv'
  | 'token'
  | 'bank_account';

interface RedactionSpan {
  start: number;
  end: number;
  replacement: string;
  priority: number;
  kind: RedactionKind;
}

const PLACEHOLDERS: Record<RedactionKind, string> = {
  password: '[REDACTED_PASSWORD]',
  code: '[REDACTED_CODE]',
  username: '[REDACTED_USERNAME]',
  email: '[REDACTED_EMAIL]',
  phone: '[REDACTED_PHONE]',
  card: '[REDACTED_CARD]',
  card_expiry: '[REDACTED_CARD_EXPIRY]',
  cvv: '[REDACTED_CVV]',
  token: '[REDACTED_TOKEN]',
  bank_account: '[REDACTED_BANK_ACCOUNT]',
};

const PASSWORD_LABELS = [
  'password',
  'pass',
  'pwd',
  'passcode',
  'wifi password',
  'סיסמה',
  'סיסמא',
];

const CODE_LABELS = [
  'pin',
  'pin code',
  'otp',
  'verification code',
  'one time code',
  'one-time code',
  'login code',
  'security code',
  'קוד',
  'קוד אימות',
  'קוד כניסה',
  'קוד חד פעמי',
];

const USERNAME_LABELS = [
  'username',
  'user name',
  'user id',
  'login',
  'login id',
  'handle',
  'screen name',
  'שם משתמש',
  'יוזר',
  'משתמש',
  'לוגין',
];

const EMAIL_LABELS = [
  'email',
  'e-mail',
  'mail',
  'אימייל',
  'דוא"ל',
  'מייל',
];

const PHONE_LABELS = [
  'phone',
  'phone number',
  'mobile',
  'cell',
  'tel',
  'טלפון',
  'מספר טלפון',
  'נייד',
];

const TOKEN_LABELS = [
  'api key',
  'apikey',
  'access token',
  'refresh token',
  'auth token',
  'bearer token',
  'token',
  'secret',
  'client secret',
  'session id',
  'session token',
  'cookie',
  'api secret',
  'מפתח api',
  'טוקן',
  'סוד',
  'אסימון',
];

const CARD_LABELS = [
  'card',
  'card number',
  'credit card',
  'debit card',
  'visa',
  'mastercard',
  'amex',
  'מספר כרטיס',
  'כרטיס אשראי',
];

const EXPIRY_LABELS = [
  'exp',
  'expiry',
  'expiration',
  'expires',
  'valid thru',
  'valid through',
  'תוקף',
];

const CVV_LABELS = [
  'cvv',
  'cvc',
  'cid',
  'security code',
  'מספר אבטחה',
  'קוד אבטחה',
];

const ACCOUNT_LABELS = [
  'iban',
  'account',
  'account number',
  'bank account',
  'routing number',
  'מספר חשבון',
  'חשבון',
  'איבן',
];

const PLATFORM_KEYWORDS = [
  'instagram',
  'insta',
  'telegram',
  'discord',
  'snapchat',
  'snap',
  'tiktok',
  'twitter',
  'facebook',
  'linkedin',
  'github',
  'gitlab',
  'slack',
  'skype',
  'signal',
  'whatsapp',
  'אינסטגרם',
  'טלגרם',
  'דיסקורד',
  'טיקטוק',
  'טוויטר',
  'פייסבוק',
  'גיטהאב',
];

const SECRET_ONLY_TERMS = [
  ...PASSWORD_LABELS,
  ...CODE_LABELS,
  ...USERNAME_LABELS,
  ...EMAIL_LABELS,
  ...PHONE_LABELS,
  ...TOKEN_LABELS,
  ...CARD_LABELS,
  ...EXPIRY_LABELS,
  ...CVV_LABELS,
  ...ACCOUNT_LABELS,
];

const ASSIGNMENT_WORDS = ['is', 'are', 'was', 'were', 'הוא', 'היא', 'זה', 'הם', 'הן'];
const VALUE_PATTERN = String.raw`(?:"[^"\n]{1,120}"|'[^'\n]{1,120}'|[^\s,;]{2,120})`;
const USERNAME_VALUE_PATTERN = String.raw`@?[A-Za-z0-9._-]{2,64}`;
const CODE_VALUE_PATTERN = String.raw`\d{4,8}`;
const CVV_VALUE_PATTERN = String.raw`\d{3,4}`;
const PHONE_VALUE_PATTERN = String.raw`\+?\d[\d().\-\s]{6,}\d`;
const TOKEN_VALUE_PATTERN = String.raw`(?:Bearer\s+)?[A-Za-z0-9._~+\/=-]{8,256}`;

const EMAIL_REGEX = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const JWT_REGEX = /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9._-]{10,}\.[A-Za-z0-9._-]{10,}\b/g;
const GITHUB_TOKEN_REGEX = /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g;
const IBAN_REGEX = /\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/g;
const CARD_CANDIDATE_REGEX = /(?:\d[ -]?){13,19}\d/g;
const PHONE_CANDIDATE_REGEX = /(?:\+?\d[\d().\-\s]{6,}\d)/g;
const EXPIRY_REGEX = /\b(?:0[1-9]|1[0-2])\s*[/-]\s*(?:\d{2}|\d{4})\b/g;

const escapeRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const createAlternation = (values: string[]): string => values.map(escapeRegex).join('|');

const matchesDateLikeNumber = (value: string): boolean => /\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/.test(value);

const digitsOnly = (value: string): string => value.replace(/\D/g, '');

const passesLuhn = (digits: string): boolean => {
  let sum = 0;
  let shouldDouble = false;

  for (let i = digits.length - 1; i >= 0; i--) {
    let digit = Number(digits[i]);
    if (Number.isNaN(digit)) return false;

    if (shouldDouble) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }

    sum += digit;
    shouldDouble = !shouldDouble;
  }

  return sum % 10 === 0;
};

const rangesOverlap = (first: RedactionSpan, second: RedactionSpan): boolean => {
  return first.start < second.end && second.start < first.end;
};

const addSpan = (
  spans: RedactionSpan[],
  start: number,
  end: number,
  kind: RedactionKind,
  priority: number
): void => {
  if (start < 0 || end <= start) return;

  spans.push({
    start,
    end,
    replacement: PLACEHOLDERS[kind],
    priority,
    kind,
  });
};

const collectAssignedValueSpans = (
  text: string,
  labels: string[],
  kind: RedactionKind,
  priority: number,
  spans: RedactionSpan[],
  valuePattern: string = VALUE_PATTERN
): void => {
  if (labels.length === 0) return;

  const labelPattern = createAlternation(labels);
  const assignmentPattern = ASSIGNMENT_WORDS.map(escapeRegex).join('|');
  const regex = new RegExp(
    String.raw`(^|[^\p{L}\p{N}_])((?:${labelPattern})\b\s*(?:(?:${assignmentPattern})\s+|[=:~-]\s*))(${valuePattern})`,
    'gimu'
  );

  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    const prefix = match[1] ?? '';
    const labelAndAssignment = match[2] ?? '';
    const value = match[3] ?? '';
    const start = match.index + prefix.length + labelAndAssignment.length;
    const end = start + value.length;
    addSpan(spans, start, end, kind, priority);
  }
};

const collectPlatformHandleSpans = (text: string, spans: RedactionSpan[]): void => {
  const platformPattern = createAlternation([...PLATFORM_KEYWORDS, ...USERNAME_LABELS]);
  const regex = new RegExp(
    String.raw`(^|[^\p{L}\p{N}_])((?:${platformPattern})\b\s*(?:[:=~-]\s*|\s+))(@?[A-Za-z0-9._-]{2,64})`,
    'gimu'
  );

  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    const prefix = match[1] ?? '';
    const context = match[2] ?? '';
    const handle = match[3] ?? '';
    const start = match.index + prefix.length + context.length;
    const end = start + handle.length;
    addSpan(spans, start, end, 'username', 55);
  }
};

const collectRegexSpans = (
  text: string,
  regex: RegExp,
  kind: RedactionKind,
  priority: number,
  spans: RedactionSpan[]
): void => {
  regex.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    const value = match[0];
    addSpan(spans, match.index, match.index + value.length, kind, priority);
  }
};

const collectCardSpans = (text: string, spans: RedactionSpan[]): void => {
  CARD_CANDIDATE_REGEX.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = CARD_CANDIDATE_REGEX.exec(text)) !== null) {
    const raw = match[0];
    const digits = digitsOnly(raw);
    if (digits.length < 13 || digits.length > 19) continue;
    if (!passesLuhn(digits)) continue;

    addSpan(spans, match.index, match.index + raw.length, 'card', 90);

    const nearbyWindowStart = Math.max(0, match.index - 20);
    const nearbyWindowEnd = Math.min(text.length, match.index + raw.length + 20);
    const nearbyText = text.slice(nearbyWindowStart, nearbyWindowEnd);

    EXPIRY_REGEX.lastIndex = 0;
    let expiryMatch: RegExpExecArray | null;
    while ((expiryMatch = EXPIRY_REGEX.exec(nearbyText)) !== null) {
      const expiryStart = nearbyWindowStart + expiryMatch.index;
      const expiryEnd = expiryStart + expiryMatch[0].length;
      addSpan(spans, expiryStart, expiryEnd, 'card_expiry', 70);
    }
  }
};

const collectPhoneSpans = (text: string, spans: RedactionSpan[]): void => {
  PHONE_CANDIDATE_REGEX.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = PHONE_CANDIDATE_REGEX.exec(text)) !== null) {
    const raw = match[0];
    const digits = digitsOnly(raw);
    if (digits.length < 8 || digits.length > 15) continue;
    if (matchesDateLikeNumber(raw)) continue;
    if (digits.length >= 13 && digits.length <= 19 && passesLuhn(digits)) continue;

    addSpan(spans, match.index, match.index + raw.length, 'phone', 40);
  }
};

const acceptNonOverlappingSpans = (spans: RedactionSpan[]): RedactionSpan[] => {
  const candidates = [...spans].sort((left, right) => {
    if (right.priority !== left.priority) return right.priority - left.priority;

    const leftLength = left.end - left.start;
    const rightLength = right.end - right.start;
    if (rightLength !== leftLength) return rightLength - leftLength;

    return left.start - right.start;
  });

  const accepted: RedactionSpan[] = [];
  for (const candidate of candidates) {
    if (accepted.some((existing) => rangesOverlap(existing, candidate))) {
      continue;
    }

    accepted.push(candidate);
  }

  return accepted.sort((left, right) => right.start - left.start);
};

const applyRedactions = (text: string, spans: RedactionSpan[]): string => {
  let redacted = text;

  for (const span of spans) {
    redacted = redacted.slice(0, span.start) + span.replacement + redacted.slice(span.end);
  }

  return redacted;
};

const shouldDropRedactedMessage = (originalText: string, redactedText: string, spans: RedactionSpan[]): boolean => {
  if (spans.length === 0) return false;

  const placeholderRegex = /\[REDACTED_[A-Z_]+\]/g;
  const labelRegex = new RegExp(`\\b(?:${createAlternation(SECRET_ONLY_TERMS)})\\b`, 'giu');

  const normalizedResidual = redactedText
    .replace(placeholderRegex, ' ')
    .replace(labelRegex, ' ')
    .replace(/[=:~-]/g, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

  if (!normalizedResidual) {
    return true;
  }

  const trimmedOriginal = originalText.trim();
  const credentialLike = /[:=~-]/.test(trimmedOriginal) || spans.length >= 2;
  return credentialLike && normalizedResidual.length <= 3;
};

export const redactSensitiveContent = (text: string): PrivacyRedactionResult => {
  if (!text.trim()) {
    return { text, redactionCount: 0, shouldDrop: false };
  }

  const spans: RedactionSpan[] = [];

  collectAssignedValueSpans(text, PASSWORD_LABELS, 'password', 95, spans);
  collectAssignedValueSpans(text, CODE_LABELS, 'code', 85, spans, CODE_VALUE_PATTERN);
  collectAssignedValueSpans(text, USERNAME_LABELS, 'username', 65, spans, USERNAME_VALUE_PATTERN);
  collectAssignedValueSpans(text, EMAIL_LABELS, 'email', 80, spans);
  collectAssignedValueSpans(text, PHONE_LABELS, 'phone', 50, spans, PHONE_VALUE_PATTERN);
  collectAssignedValueSpans(text, TOKEN_LABELS, 'token', 90, spans, TOKEN_VALUE_PATTERN);
  collectAssignedValueSpans(text, EXPIRY_LABELS, 'card_expiry', 75, spans);
  collectAssignedValueSpans(text, CVV_LABELS, 'cvv', 80, spans, CVV_VALUE_PATTERN);
  collectAssignedValueSpans(text, ACCOUNT_LABELS, 'bank_account', 70, spans);

  collectPlatformHandleSpans(text, spans);
  collectRegexSpans(text, EMAIL_REGEX, 'email', 85, spans);
  collectRegexSpans(text, JWT_REGEX, 'token', 92, spans);
  collectRegexSpans(text, GITHUB_TOKEN_REGEX, 'token', 92, spans);
  collectRegexSpans(text, IBAN_REGEX, 'bank_account', 88, spans);
  collectCardSpans(text, spans);
  collectPhoneSpans(text, spans);

  const acceptedSpans = acceptNonOverlappingSpans(spans);
  if (acceptedSpans.length === 0) {
    return { text, redactionCount: 0, shouldDrop: false };
  }

  const redactedText = applyRedactions(text, acceptedSpans);

  return {
    text: redactedText,
    redactionCount: acceptedSpans.length,
    shouldDrop: shouldDropRedactedMessage(text, redactedText, acceptedSpans),
  };
};
