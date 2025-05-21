# Ranked Queue with Colyseus

This is an example on how to achieve Ranked Matchmaking Queues in Colyseus.

This may be included as part of the core in the future. Feedback and more
use-cases are welcome to ensure the most common ones are covered by this
implementation.

<img src="screenshot.png?raw=1" />

## How it works

- User joins `RankedQueueRoom` with his `rank` number (trophies, mmr, etc.)
- A compatible group is evaluated for each client at every 2 seconds.
- Once a compatible group is found, a room is created for them, with their seats reserved
- The clients then connect to the actual room, and disconnect from the lobby.

The `gameServer` must define both the intermediary room and the actual game
room:

```typescript
// register your room handlers
gameServer.define('queue', RankedQueueRoom);
gameServer.define('my_room', MyRoom);
```

The `RankedQueueRoom` has a few variables you can change to control how it works.

### `maxPlayers`: number

Target number of players on new game matches

### `roomNameToCreate`: string

Name of the room to create

### `maxWaitingCycles`: number

After this time, create a match with a bot

### `maxWaitingCyclesForPriority`: number

after this time, try to fit this client with a not-so-compatible group

### `allowIncompleteGroups`: boolean

If `allowIncompleteGroups` is true, players inside an unmatched group (that did not reached `maxPlayers`, and `maxWaitingCycles` has been reached) will be matched together. Your room should fill the remaining spots with "bots" on this case.

### `cycleTickInterval`: number

Evaluate groups for each client at interval

## Considerations

There is a low possibility that not all matched clients are going to connect to
the matched group due to their connectivity status, leaving some spots empty -
you can ensure bots will take their place after some time the `roomNameToCreate`
room has been created.

## License

MIT
