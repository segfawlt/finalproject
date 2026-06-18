import { Client, GatewayIntentBits } from "discord.js";

export const botClient = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
});
