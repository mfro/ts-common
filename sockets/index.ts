import * as ws from 'ws';
import { emit, Event } from '../events';

export type PacketBody =
  | null
  | number
  | string
  | boolean
  | Array<PacketBody>
  | { [key in string | number]: PacketBody };

export type Identity = string;

export namespace Identity {
  export function create() {
    let id = Math.floor(Math.random() * 0x1000000).toString(16);
    return id as Identity;
  }
}

export type Packet<T extends void | PacketBody> = number & { _: (_: T) => T };

export namespace Packet {
  export type Sealed<T> = T extends void ? number : [number, T];

  export const all: Packet<any>[] = [];

  export function define<T extends void | PacketBody = void>(): Packet<T> {
    const id = all.length as Packet<T>;
    all.push(id);
    return id;
  }

  export function seal<T extends void | PacketBody>(packet: Packet<T>, value: T): Sealed<T>;
  export function seal<T extends void | PacketBody>(packet: Packet<T>, value?: T): number | [number, T] {
    if (value === undefined)
      return packet;

    else
      return [packet, value];
  }

  export function unseal(raw: Sealed<any>): [Packet<any>, any] {
    if (typeof raw == 'number')
      return [all[raw] ?? raw, undefined];
    else {
      let [id, value] = raw;
      return [all[id] ?? id, value];
    }
  }
}

export interface Dispatch<K, TBase = any> {
  on<T extends TBase>(message: K & { _: (_: T) => T }, handler: (msg: T) => void): void;
  emit<T extends TBase>(message: K & { _: (_: T) => T }, value: T): void;
}

export namespace Dispatch {
  export function create(): Dispatch<number, void | PacketBody> {
    let map = new Map<number, ((arg: any) => void)>();

    return {
      on<T extends void | PacketBody>(message: Packet<T>, handler: (arg: T) => void) {
        map.set(message, handler);
      },

      emit<T extends void | PacketBody>(message: Packet<T>, value: T) {
        map.get(message)?.(value);
      },
    };
  }
}

const socket_events = new WeakMap<ws | WebSocket, Map<Packet<any>, Event<any>>>();

function setup_events(socket: WebSocket) {
  let events = new Map<Packet<any>, Event<any>>();

  socket.addEventListener('message', e => {
    try {
      let [packet, value] = Packet.unseal(JSON.parse(e.data));
      let event = events.get(packet);
      if (event) {
        emit(event, value);
      }
    } catch { }
  });

  return events;
}

export function send(socket: ws | WebSocket, ty: Packet<void>): void;
export function send<T extends PacketBody>(socket: ws | WebSocket, ty: Packet<T>, value: T): void;
export function send<T extends void | PacketBody>(socket: ws | WebSocket, ty: Packet<T>, value?: T): void {
  let sealed = Packet.seal(ty as any, value);
  socket.send(JSON.stringify(sealed));
}

export function receive<T extends void | PacketBody>(socket: ws | WebSocket, ty: Packet<T>): Event<T> {
  let map = socket_events.get(socket);
  if (!map) socket_events.set(socket, map = setup_events(socket as WebSocket));

  let event = map.get(ty);
  if (!event) map.set(ty, event = Event());

  return event;
}

export function Server(base: ws.Server, handler: (c: ws, params: Map<string, string>) => void) {
  base.on('connection', (socket, request) => {
    let params: Map<string, string>;
    if (request.url) {
      let url = new URL(request.url, 'base:/');
      params = new Map(url.searchParams);
    } else {
      params = new Map();
    }

    handler(socket, params);
  });
}
