export interface EvidenceRefResolveResult {
  normalizedRefs: string[];
  repairedCount: number;
  unresolvedRefs: string[];
}

function normalizeRef(ref: string): string {
  return ref.trim();
}

function extractBaseRef(ref: string): string | null {
  const match = ref.match(/^([a-z-]+:[a-z-]+-\d+)(?:-.+)?$/i);
  if (!match) {
    return null;
  }
  return match[1];
}

function looksLikeStructuredPrefix(ref: string): boolean {
  return /^[a-z-]+:[a-z-]+-\d+/i.test(ref);
}

function findUniquePrefixMatch(ref: string, allowedRefs: string[]): string | null {
  if (!looksLikeStructuredPrefix(ref)) {
    return null;
  }

  const matches = allowedRefs.filter(
    (allowedRef) => allowedRef.startsWith(ref) || ref.startsWith(allowedRef),
  );

  return matches.length === 1 ? matches[0] : null;
}

export function resolveEvidenceRefs(
  inputRefs: string[] | undefined,
  allowedRefsInput: string[],
): EvidenceRefResolveResult {
  const allowedRefs = Array.from(
    new Set(
      allowedRefsInput
        .map(normalizeRef)
        .filter((value) => value.length > 0),
    ),
  );
  const allowedRefSet = new Set(allowedRefs);
  const normalizedRefs: string[] = [];
  const unresolvedRefs: string[] = [];
  let repairedCount = 0;

  for (const rawRef of inputRefs ?? []) {
    const ref = normalizeRef(rawRef);
    if (!ref) {
      continue;
    }

    if (allowedRefSet.has(ref)) {
      normalizedRefs.push(ref);
      continue;
    }

    const baseRef = extractBaseRef(ref);
    if (baseRef && allowedRefSet.has(baseRef)) {
      normalizedRefs.push(baseRef);
      repairedCount += 1;
      continue;
    }

    const uniquePrefixMatch = findUniquePrefixMatch(ref, allowedRefs);
    if (uniquePrefixMatch) {
      normalizedRefs.push(uniquePrefixMatch);
      repairedCount += 1;
      continue;
    }

    unresolvedRefs.push(ref);
  }

  return {
    normalizedRefs,
    repairedCount,
    unresolvedRefs: Array.from(new Set(unresolvedRefs)),
  };
}
