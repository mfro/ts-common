import * as WebSocket from 'ws';
import { Packet, PacketBody } from './client';

import { emit, Event } from '../events';

export { Packet, PacketBody, Dispatch, Identity } from './client';

const socket_events = new WeakMap<WebSocket, Map<Packet<any>, Event<any>>>();

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

export function send(socket: WebSocket, ty: Packet<void>): void;
export function send<T extends PacketBody>(socket: WebSocket, ty: Packet<T>, value: T): void;
export function send<T extends void | PacketBody>(socket: WebSocket, ty: Packet<T>, value?: T): void {
  let sealed = Packet.seal(ty as any, value);
  socket.send(JSON.stringify(sealed));
}

export function receive<T extends void | PacketBody>(socket: WebSocket, ty: Packet<T>): Event<T> {
  let map = socket_events.get(socket);
  if (!map) socket_events.set(socket, map = setup_events(socket as WebSocket));

  let event = map.get(ty);
  if (!event) map.set(ty, event = Event());

  return event;
}

export function Server(base: WebSocket.Server, handler: (c: WebSocket, params: Map<string, string>) => void) {
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
