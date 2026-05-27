export function truncateEnd(value: string, maxLength: number) {
  if (value.length <= maxLength) {
    return value;
  }

  if (maxLength <= 3) {
    return value.slice(0, Math.max(0, maxLength));
  }

  return `${value.slice(0, maxLength - 3)}...`;
}

export function truncateMiddle(value: string, maxLength: number) {
  if (value.length <= maxLength) {
    return value;
  }

  if (maxLength <= 3) {
    return value.slice(0, Math.max(0, maxLength));
  }

  const leftLength = Math.ceil((maxLength - 3) / 2);
  const rightLength = Math.floor((maxLength - 3) / 2);

  return `${value.slice(0, leftLength)}...${value.slice(value.length - rightLength)}`;
}

export function formatError(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
