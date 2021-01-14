export type Event<T> = {
  _event: (_: T) => T;

  callbacks: ((value: T) => void)[];
};

export function Event<T = void>() {
  return { callbacks: [] } as unknown as Event<T>
}

export function on<T>(e: Event<T>, callback: (value: T) => void) {
  e.callbacks.push(callback);
}

export function off<T>(e: Event<T>, callback: (value: T) => void) {
  let index = e.callbacks.indexOf(callback);
  e.callbacks.splice(index, 1);
}

export function emit(e: Event<void>): void;
export function emit<T>(e: Event<T>, value: T): void;
export function emit<T>(e: Event<T>, value?: T) {
  let list = e.callbacks.slice();

  for (let callback of list) {
    (callback as any)(value);
  }
}
