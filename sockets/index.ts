import * as WebSocket from 'ws';
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

export interface Client {
  send(message: Packet<void>): void;
  send<T extends PacketBody>(message: Packet<T>, value: T): void;

  receive<T extends void | PacketBody>(ty: Packet<T>): Event<T>;

  close(): void;
}

export function Client(url: string): Client {
  let packets = new Map<Packet<any>, Event<any>>();

  let closed = Event();

  let socket = new WebSocket(url);

  socket.addEventListener('close', e => emit(closed));

  socket.addEventListener('message', e => {
    const parsed = JSON.parse(e.data);
    let [packet, value] = Packet.unseal(parsed);

    let ev = packets.get(packet);
    if (ev) {
      emit(ev, value);
    }
  });

  return {
    send<T extends void | PacketBody>(message: Packet<T>, value?: T): void {
      let sealed = Packet.seal(message as any, value);
      socket.send(JSON.stringify(sealed));
    },

    receive(ty) {
      let e = packets.get(ty);
      if (!e) packets.set(ty, e = Event());

      return e;
    },

    close() {
      socket.close();
    },
  };
}

export function Server(base: WebSocket.Server, handler: (c: Client, params: Map<string, string>) => void) {
  base.on('connection', (socket, request) => {
    let params: Map<string, string>;
    if (request.url) {
      let url = new URL(request.url, 'base:/');
      params = new Map(url.searchParams);
    } else {
      params = new Map();
    }

    let packets = new Map<Packet<any>, Event<any>>();
    let closed = Event();

    socket.addEventListener('close', e => emit(closed));

    socket.addEventListener('message', e => {
      const parsed = JSON.parse(e.data);
      let [packet, value] = Packet.unseal(parsed);

      let ev = packets.get(packet);
      if (ev) {
        emit(ev, value);
      }
    });

    let client: Client = {
      send<T extends void | PacketBody>(message: Packet<T>, value?: T): void {
        let sealed = Packet.seal(message as any, value);
        socket.send(JSON.stringify(sealed));
      },

      receive(ty) {
        let e = packets.get(ty);
        if (!e) packets.set(ty, e = Event());

        return e;
      },

      close() {
        socket.close();
      },
    };

    handler(client, params);
  });
}
