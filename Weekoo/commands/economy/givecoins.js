const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const db = require('../../utils/db');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('givecoins')
        .setDescription('Give Weekoins to a user (Admin only).')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator) // Only admins can use
        .addUserOption(option => 
            option.setName('target')
                .setDescription('The user to give coins to.')
                .setRequired(true))
        .addIntegerOption(option => 
            option.setName('amount')
                .setDescription('The amount of coins to give.')
                .setMinValue(1) // You can't give negative coins!
                .setRequired(true)),

    async execute(interaction) {
        const target = interaction.options.getUser('target');
        const amount = interaction.options.getInteger('amount');

        try {
            await db.query(
                'INSERT INTO users (discord_id, username, weekoins) VALUES ($1, $2, $3) ON CONFLICT (discord_id) DO UPDATE SET weekoins = users.weekoins + $3',
                [target.id, target.username, amount]
            );
            await interaction.reply({ content: `Gave **${amount.toLocaleString()}** <:weekoin:1465807554927132883> to ${target.tag}!`, flags: [MessageFlags.Ephemeral] });
        } catch (error) {
            console.error('Givecoins Error:', error);
            await interaction.reply({ content: 'Failed to give coins. (Check the console)', flags: [MessageFlags.Ephemeral] });
        }
    },
};