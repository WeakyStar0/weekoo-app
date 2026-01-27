require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once('ready', () => {
    console.log(`Weekoo is online as ${client.user.tag}`);
});

client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName } = interaction;

    if (commandName === 'ping') {
        await interaction.reply('Pong! 🏓');
    } else if (commandName === 'user') {
        await interaction.reply(`Olá **${interaction.user.username}**, entraste no discord a **${interaction.member.joinedAt}**.`);
    }
});

client.login(process.env.TOKEN);