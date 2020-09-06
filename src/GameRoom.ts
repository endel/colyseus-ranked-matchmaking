import { Room, Client } from "colyseus";

export class GameRoom extends Room {
  color: string = '#';

  onCreate(options: any) {
    console.log("GAME ROOM CREATED WITH OPTIONS", options);

    // can only join this room via ranked matchmaking
    this.setPrivate();

    const letters = '0123456789ABCDEF';
    for (var i = 0; i < 6; i++) { this.color += letters[Math.floor(Math.random() * 16)]; }
  }

  onJoin(client: Client, options: any) {
    console.log("JOINED GAME ROOM:", client.sessionId, options)
    client.send("color", this.color);
  }

  onLeave(client: Client, consented: boolean) {
  }

  onDispose() {
  }

}
