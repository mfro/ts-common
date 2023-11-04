export function assert(condition: boolean, message: string): asserts condition {
  if (!condition) {
    debugger;
    throw new Error(message);
  }
}

export function todo(message: string): never {
  assert(false, message);
}
