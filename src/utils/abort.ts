export function createAbortError() {
  const error = new Error("Request aborted.");
  error.name = "AbortError";
  return error;
}

export function isAbortError(error: unknown) {
  if (error instanceof DOMException && error.name === "AbortError") {
    return true;
  }

  if (!(error instanceof Error)) {
    return false;
  }

  return (
    error.name === "AbortError" ||
    error.message.toLowerCase().includes("abort")
  );
}
