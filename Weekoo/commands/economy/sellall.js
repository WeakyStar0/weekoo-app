const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const db = require('../../utils/db');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('sellall')
        .setDescription('Sell all your blocks in one go.'),

    async execute(interaction) {
        const userId = interaction.user.id;

        try {
            const res = await db.query(`
                SELECT inv.item_id, inv.quantity, i.price, i.name, i.emoji
                FROM inventories inv
                JOIN items i ON inv.item_id = i.id
                WHERE inv.user_id = $1 AND i.item_type = 'block' AND inv.quantity > 0
            `, [userId]);

            if (res.rows.length === 0) {
                return interaction.reply({ 
                    content: "You don't have any blocks to sell! Go out there and start digging.", 
                    flags: [MessageFlags.Ephemeral] 
                });
            }

            let totalCoins = 0;
            let totalItems = 0;
            const breakdown = [];

            res.rows.forEach(row => {
                const value = row.price * row.quantity;
                totalCoins += value;
                totalItems += row.quantity;
                breakdown.push(`${row.emoji} **${row.name}** x${row.quantity} → \`${value.toLocaleString()}\``);
            });

            await db.query('BEGIN');

            await db.query(`
                DELETE FROM inventories 
                WHERE user_id = $1 
                AND item_id IN (SELECT id FROM items WHERE item_type = 'block')
            `, [userId]);

            await db.query(
                'UPDATE users SET weekoins = weekoins + $1 WHERE discord_id = $2',
                [totalCoins, userId]
            );

            await db.query('COMMIT');

            const embed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('💰 Bulk Sale Complete')
                .setDescription(`You sold **${totalItems}** blocks and earned **<:weekoin:1465807554927132883> ${totalCoins.toLocaleString()}** Weekoins!`)
                .addFields({ name: 'Inventory Breakdown', value: breakdown.join('\n').slice(0, 1024) })
                .setFooter({ text: 'Weekoo Market' })
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });

        } catch (err) {
            await db.query('ROLLBACK');
            console.error('Sellall Error:', err);
            await interaction.reply({ content: "The market is currently overwhelmed. Try again later.", flags: [MessageFlags.Ephemeral] });
        }
    },
};