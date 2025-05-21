import { Room, Client, generateId } from "colyseus";

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