const { SlashCommandBuilder, MessageFlags } = require('discord.js'); // Added MessageFlags
const fs = require('node:fs');
const path = require('node:path');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('say')
        .setDescription('Make me say something!')
        .addStringOption(option => 
            option.setName('message')
                .setDescription('The text to say')
                .setRequired(true)),
    async execute(interaction) {
        let text = interaction.options.getString('message');
        const filePath = path.join(__dirname, '../../blacklist.txt');

        try {
            const rawData = fs.readFileSync(filePath, 'utf8');
            const blacklist = rawData.split(',').map(word => word.trim());

            let censored = false;

                /* 
                   Create a Regular Expression:
                   'g' = global (find all instances)
                   'i' = case insensitive (find Piss and piss)
                   '\\b' = word boundary (prevents "ass" being censored inside "assignment")
                */

            for (const badWord of blacklist) {
                if (badWord.length === 0) continue;
                const regex = new RegExp(`\\b${badWord}\\b`, 'gi');
                if (regex.test(text)) {
                    censored = true;
                    text = text.replace(regex, (match) => '♥︎'.repeat(match.length));
                }
            }

            await interaction.channel.send(text);

            // Updated with flags: [MessageFlags.Ephemeral]
            if (censored) {
                await interaction.reply({ 
                    content: 'Message sent (some words were filtered ♥︎).', 
                    flags: [MessageFlags.Ephemeral] 
                });
            } else {
                await interaction.reply({ 
                    content: 'Message sent!', 
                    flags: [MessageFlags.Ephemeral] 
                });
            }

        } catch (error) {
            console.error(error);
            await interaction.reply({ 
                content: 'Error accessing filter list.', 
                flags: [MessageFlags.Ephemeral] 
            });
        }
    },
};