require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const { Client, Collection, GatewayIntentBits, Events, MessageFlags, ActivityType } = require('discord.js');

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// collection store commands
client.commands = new Collection();

// load commands
const foldersPath = path.join(__dirname, 'commands');
const commandFolders = fs.readdirSync(foldersPath);

for (const folder of commandFolders) {
    const commandsPath = path.join(foldersPath, folder);
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
    for (const file of commandFiles) {
        const filePath = path.join(commandsPath, file);
        const command = require(filePath);
        if ('data' in command && 'execute' in command) {
            client.commands.set(command.data.name, command);
        }
    }
}

client.once(Events.ClientReady, (readyClient) => {
    console.log(`Logged in as ${readyClient.user.tag}. Handler is ready!`);

    client.user.setPresence({
        activities: [{ 
            name: 'i like gambling', 
            type: ActivityType.Streaming,
            url: 'https://www.twitch.tv/weekoo_bot' 
        }],
        status: 'online', 
    });
});

// interaction handler
client.on(Events.InteractionCreate, async interaction => {
    
    // 1. Handle Slash Commands
    if (interaction.isChatInputCommand()) {
        const command = client.commands.get(interaction.commandName);

        if (!command) return;

        try {
            await command.execute(interaction);
        } catch (error) {
            console.error(error);
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({ content: 'There was an error executing this command, sorry... <:9734konatacry:1465824995128246633>', flags: [MessageFlags.Ephemeral] });
            } else {
                await interaction.reply({ content: 'There was an error executing this command, sorry... <:9734konatacry:1465824995128246633>', flags: [MessageFlags.Ephemeral] });
            }
        }
    } 
    
    // 2. Handle Autocomplete (For the Shop/Buy system)
    else if (interaction.isAutocomplete()) {
        const command = client.commands.get(interaction.commandName);

        if (!command) return;

        try {
            await command.autocomplete(interaction);
        } catch (error) {
            console.error('Autocomplete Error:', error);
        }
    }
});

client.login(process.env.TOKEN);