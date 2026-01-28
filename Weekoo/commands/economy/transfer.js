const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const db = require('../../utils/db');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('transfer')
        .setDescription('Transfer Weekoins to another user.')
        .addUserOption(option => 
            option.setName('target')
                .setDescription('The user to send coins to.')
                .setRequired(true))
        .addIntegerOption(option => 
            option.setName('amount')
                .setDescription('The amount to send.')
                .setMinValue(1)
                .setRequired(true)),

    async execute(interaction) {
        const senderId = interaction.user.id;
        const target = interaction.options.getUser('target');
        const amount = interaction.options.getInteger('amount');

        if (target.id === senderId) {
            return interaction.reply({ content: "You can't send coins to yourself!", flags: [MessageFlags.Ephemeral] });
        }

        try {
            // 1. Check if the sender has enough coins (select for update makes this safe)
            const senderBalanceRes = await db.query('SELECT weekoins FROM users WHERE discord_id = $1 FOR UPDATE', [senderId]);
            const senderBalance = senderBalanceRes.rows[0]?.weekoins || 0;
            if (senderBalance < amount) {
                return interaction.reply({ content: 'You do not have enough coins.', flags: [MessageFlags.Ephemeral] });
            }

            // 2. Perform the transfer (safe because we locked the sender)
            await db.query('UPDATE users SET weekoins = weekoins - $1 WHERE discord_id = $2', [amount, senderId]);
            await db.query(
                'INSERT INTO users (discord_id, username, weekoins) VALUES ($1, $2, $3) ON CONFLICT (discord_id) DO UPDATE SET weekoins = users.weekoins + $3',
                [target.id, target.username, amount]
            );

            await interaction.reply({ content: `Transferred <:weekoin:1465807554927132883>${amount.toLocaleString()} to ${target.tag}!`, flags: [MessageFlags.Ephemeral] });

        } catch (error) {
            console.error('Transfer Error:', error);
            await interaction.reply({ content: 'Failed to transfer. (Check the console)', flags: [MessageFlags.Ephemeral] });
        }
    },
};