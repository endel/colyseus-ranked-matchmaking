import { Room, Client, generateId } from "colyseus";

let dateNowOffset = 0;
const originalDateNow = Date.now;
Date.now = function () {
  return originalDateNow() + dateNowOffset;
}

export function setDateNowOffset(offset: number) {
  dateNowOffset = offset;
}

const clientMessages: { [sessionId: string]: any[] } = {};

export function createClient(room: Room, clientOptions: any) {
  const sessionId = generateId();
  const client = {
    sessionId,
    send: function (type: string, message: any) {
      if (!clientMessages[sessionId]) { clientMessages[sessionId] = []; }
      clientMessages[sessionId].push({ type, message });
    }
  } as Client;
  room.onJoin!(client, clientOptions);
  room.clients.push(client);
}