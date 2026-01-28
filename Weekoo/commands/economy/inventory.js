const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../../utils/db');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('inventory')
        .setDescription('View your items.'),
    async execute(interaction) {
        const res = await db.query(
            `SELECT items.name, items.emoji, items.item_type, inventories.quantity 
             FROM inventories 
             JOIN items ON inventories.item_id = items.id 
             WHERE inventories.user_id = $1 AND inventories.quantity > 0`,
            [interaction.user.id]
        );

        if (res.rows.length === 0) {
            return interaction.reply("Your pockets are empty. 💨");
        }

        const embed = new EmbedBuilder()
            .setColor('#5865F2')
            .setTitle(`${interaction.user.username}'s Stash`)
            .setThumbnail(interaction.user.displayAvatarURL());

        res.rows.forEach(row => {
            embed.addFields({
                name: `${row.emoji} ${row.name}`,
                value: `Quantity: **${row.quantity}** | Type: \`${row.item_type}\``,
                inline: true
            });
        });

        await interaction.reply({ embeds: [embed] });
    },
};