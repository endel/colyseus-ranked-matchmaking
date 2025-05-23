# Ranked Queue with Colyseus

This is an example on how to achieve Ranked Matchmaking Queues in Colyseus.

This may be included as part of the core in the future. Feedback and more
use-cases are welcome to ensure the most common ones are covered by this
implementation.

<img src="images/screenshot.png?raw=1" />

## How it works

- User joins `RankedQueueRoom` with his `rank` number (trophies, mmr, etc.)
- A compatible group is evaluated for each client at every `cycleTickInterval` (default:
 1s)
- Once a compatible group is found, a room is created with seats reserved for each
	client
- The clients then connect to the actual game room via `.consumeSeatReservation()`, and disconnect from the queue.

The `gameServer` must define both the intermediary room and the actual game room:

```typescript
// register your room handlers
gameServer.define('queue', RankedQueueRoom, { /* configuration options */ });
gameServer.define('my_room', MyRoom);
```

### Available configuration options

The `RankedQueueRoom` has a few variables you can change to control how it works.

#### `maxPlayers`
Type: `number`

Target number of players on new game matches

#### `roomNameToCreate`
Type: `string`

Name of the room to create

#### `maxWaitingCycles`
Type: `number`

After this time, create a match with a bot

#### `maxWaitingCyclesForPriority`
Type: `number`

after this time, try to fit this client with a not-so-compatible group

#### `allowIncompleteGroups`
Type: `boolean`

If `allowIncompleteGroups` is true, players inside an unmatched group (that did not reached `maxPlayers`, and `maxWaitingCycles` has been reached) will be matched together. Your room should fill the remaining spots with "bots" on this case.

#### `cycleTickInterval`
Type: `number`

Evaluate groups for each client at interval

#### `compare`
Type: `(client: ClientQueueData, matchGroup: MatchGroup) => boolean`

A function that is used to compare the rank of the client against the average rank of the group. The function should return true if the client is compatible with the group, and false otherwise.

**Default `compare` implementation:**

```typescript
(client: ClientQueueData, matchGroup: MatchGroup) => {
  const diff = Math.abs(client.rank - matchGroup.averageRank);
  const diffRatio = (diff / matchGroup.averageRank);

  // If diff ratio is too high, create a new match group
  return (diff < 10 || diffRatio <= 2);
}
```

#### `onGroupReady`
Type: `(group: MatchGroup) => Promise<IRoomCache>`

Optional. This function is called when a match group is ready to be created. You can use it to customize the room creation process, like adding custom data to the room or modifying the room options.

```typescript
import { matchMaker } from "colyseus";
// ...
gameServer.define('queue', RankedQueueRoom, {
	onGroupReady: async function (group: MatchGroup) {
		// custom options
		const roomOptions = {
			numBots: this.maxPlayers - group.clients.length,
		};
		return matchMaker.createRoom('my_room', roomOptions);
	},
});
```

## Extending the `RankedQueueRoom`

You can extend the `RankedQueueRoom` class to add your own authentication logic and rank fetching and/or comparison.

```typescript
import { Room } from 'colyseus';
import { auth, JWT } from "@colyseus/auth";
import { RankedQueueRoom, RankedQueueOptions } from './RankedQueueRoom';

export class MyRankedRoom extends RankedQueueRoom {
	static onAuth(token: string) {
		const tokenData = await JWT.verify(token);
		const rank = await fetchRankFromDatabase(tokenData.userId);
		return { rank };
	}

	onJoin(client: Client, options: any, auth: any) {
		this.addToQueue(client, {
			rank: auth.rank,
		});
	}
}
```

If you extend the `onCreate()` method, make sure to call `super.onCreate()` to ensure the
`RankedQueueRoom` is properly initialized.


## Client SDK Implementation

```typescript
import { Client } from 'colyseus.js';

// Create client SDK instance
const client = new Client("ws://localhost:2567");

// Join the queue
const queue = await client.joinOrCreate("queue", {
	rank,
	maxPlayers,
	maxTeamSize: teamSize,
	teamId,
});

// Listen to queue status update
queue.onMessage("clients", (numClients) => {
	console.log("Number of clients in MatchGroup changed to:", numClients);
});

// Listen to match found event
queue.onMessage("seat", (message) => {
	client.consumeSeatReservation(message).then((room) => {
		// Successfully connected to the game room,
		// Send "confirm" message to notify the queue
		queue.send("confirm");

		// Now you can use the room instance to send messages to the game room
		// ...
	});
});

queue.onLeave((code, message) => {
	console.log("LEFT QUEUE", { code });
	if (code === 4000) {
		// Cancelled!

	} else if (code > 1010) {
		// Error!
		console.error("QUEUE ERROR", code, message);
	}
});

// ... to manually leave the queue
queue.leave();
```

## Considerations

There is a low possibility that not all matched clients are going to connect to
the matched group due to their connectivity status, leaving some spots empty -
you can ensure bots will take their place after some time the `roomNameToCreate`
room has been created.

## License

MIT
