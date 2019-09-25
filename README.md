# About OmegaBot

OmegaBot prints out some user information that can be saved in the `./infos/` directory in json format.
Currently the format looks like this:

```json
{
    "data": "TEXT TO REPLY"
}
```

## Install
```bash
mkdir -p /srv/apps;
cd /srv/apps;
git clone git@github.com:Devidian/flamongo_discord_bot.git --branch OmegaBot OmegaBot;
```

## Invitation Link

HellBot:
https://discordapp.com/oauth2/authorize?client_id=606078021497258004&scope=bot&permissions=335801408

OmegaBot:
https://discordapp.com/oauth2/authorize?client_id=608270517568274462&scope=bot&permissions=335801408

## Usage

|Command|Description|Permission|
|-|-|-|
|`BASICS`|||
|?help|print out help with command list|everyone|
|!set name [name]|set bot nickname to [name]|Administrators|
|!!clear|remove al messages in the current channel|Administrators|
|!add [what] [text]|Adds a new entry to [what]|Administrators|
|!remove [what]|Remove everything from [what]|Administrators|
|?[what]|print out information regarding [what], shuffle if multiple entries exist|everyone|
|`STREAMING STUFF`|||
|!setStreamChannel|Set the channel as announcement channel|Administrators|
|!addStreamer @name ...|Add one or more streamer|Administrators|
|!removeStreamer @name|remove a streamer from streaming whitelist|Administrators|
|!setAllowAll true/false|set true if you want all members streaming to be announced|Administrators|
|!set allowAll true|everybody is announced when streaming|Administrators|
|!set allowAll false|only added streamers are announced when streaming|Administrators|
|!set streamerChannel|set streamer channel to this channel|Administrators|
|!set announcementDelayHours [number]|set announcement delay to [number] hours|Administrators|
|!set announcementMsg [text]|set announcement message|Administrators|
|!set ||Administrators|
|`ROLE MANAGEMENT`|||
|!rolesAdd @role ...||Administrators|
|!rolesRemove @role ...||Administrators|
|?roles||everyone|
|!join @role||everyone|
|!leave @role||everyone|