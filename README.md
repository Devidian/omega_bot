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
https://discordapp.com/oauth2/authorize?client_id=606078021497258004&scope=bot&permissions=67365952

OmegaBot:
https://discordapp.com/oauth2/authorize?client_id=608270517568274462&scope=bot&permissions=67365952

## Usage

|Command|Description|Permission|
|-|-|-|
|?help|print out help with command list|everyone|
|!!clear|remove up to 100 messages|Administrators|
|!add [what] [text]|Adds a new entry to [what]|Administrators|
|!remove [what]|Remove everything from [what]|Administrators|
|?[what]|print out information regarding [what], shuffle if multiple entries exist|everyone|
|!addStreamer @name ...|Add one or more streamer|Administrators|
|!setStreamChannel|Set the channel as announcement channel|Administrators|
|!setAllowAll true/false|set true if you want all members streaming to be announced|Administrators|
|!removeStreamer @name|remove a streamer from streaming whitelist|Administrators|
|!set allowAll true|everybody is announced when streaming|Administrators|
|!set allowAll false|only added streamers are announced when streaming|Administrators|
|!set name [name]|set bot nickname to [name]|Administrators|
|!set streamerChannel|set streamer channel to this channel|Administrators|
|!set announcementDelayHours [number]|set announcement delay to [number] hours|Administrators|
|!set announcementMsg [text]|set announcement message|Administrators|
|!set ||Administrators|