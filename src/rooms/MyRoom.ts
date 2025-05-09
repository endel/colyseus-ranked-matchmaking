import { Room, Client } from "colyseus";

const colorNames = [
  'red',
  'orange',
  'amber',
  'yellow',
  'lime',
  'green',
  'emerald',
  'teal',
  'cyan',
  'sky',
  'blue',
  'indigo',
  'violet',
  'purple',
  'fuchsia',
  'pink',
  'rose',
  'slate',
  'gray',
  'zinc',
  'neutral',
  'stone',
];
const colorIntensities = [400, 500, 600, 700, 800, 900];

// use global color index to cycle through colors
// this is not thread safe, but it is ok for this example
let currentColorIndex = 0;

export class MyRoom extends Room {
  color: string = '#';

  onCreate(options: any) {
    console.log("GAME ROOM CREATED WITH OPTIONS", options);

    // can only join this room via ranked matchmaking
    this.setPrivate();

    this.color = `${colorNames[currentColorIndex++]}-${colorIntensities[Math.floor(Math.random() * colorIntensities.length)]}`;

    if (currentColorIndex >= colorNames.length) {
      currentColorIndex = 0;
    }
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
