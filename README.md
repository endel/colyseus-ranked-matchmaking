# Colyseus: Ranked Matchmaking

[![Build Status](https://travis-ci.org/endel/colyseus-ranked-matchmaking.svg?branch=master)](https://travis-ci.org/endel/colyseus-ranked-matchmaking)

This is an example on how to achieve Ranked Matchmaking within Colyseus.

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

The `RankedLobbyRoom` has a few variables you can change to control how it works.

### `numClientsToMatch`: number

number of players on each match

### `roomToCreate`: string

Name of the room to create

### `maxWaitingTime`: number

After this time, create a match with a bot

### `maxWaitingTimeForPriority`: number

after this time, try to fit this client with a not-so-compatible group

### `allowUnmatchedGroups`: boolean

If `allowUnmatchedGroups` is true, players inside an unmatched group (that did not reached `numClientsToMatch`, and `maxWaitingTime` has been reached) will be matched together. Your room should fill the remaining spots with "bots" on this case.

### `evaluateGroupsInterval`: number

Evaluate groups for each client at interval

## Considerations / Pending stuff

- There must be a way to prevent `"game"` rooms from being created directly,
  without passing through the `"ranked"` process.
- There is a low possibility that not all matched clients are going to connect
  to the matched group due to their connectivity status, leaving some spots
  empty - you can ensure bots will take their place after some time the `"game"`
  room has been created.

## License

MIT
