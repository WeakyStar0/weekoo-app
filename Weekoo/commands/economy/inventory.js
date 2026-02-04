const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../../utils/db');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('inventory')
        .setDescription('View your items neatly organized.'),
    async execute(interaction) {
        const res = await db.query(
            `SELECT items.name, items.emoji, items.item_type, inventories.quantity 
             FROM inventories 
             JOIN items ON inventories.item_id = items.id 
             WHERE inventories.user_id = $1 AND inventories.quantity > 0
             ORDER BY items.item_type ASC`,
            [interaction.user.id]
        );

        if (res.rows.length === 0) {
            return interaction.reply("Your pockets are empty. 💨");
        }

        // Group items by type
        const groups = {};
        res.rows.forEach(row => {
            if (!groups[row.item_type]) groups[row.item_type] = [];
            groups[row.item_type].push(`${row.emoji} **${row.name}** x${row.quantity}`);
        });

        const embed = new EmbedBuilder()
            .setColor('#5865F2')
            .setTitle(`<:star_decor:1468013007748726835> ${interaction.user.username}'s Stash`)
            .setThumbnail(interaction.user.displayAvatarURL());

        // Create a field for each category
        for (const [type, items] of Object.entries(groups)) {
            embed.addFields({ 
                name: type.toUpperCase(), 
                value: items.join('\n'), 
                inline: false // Set to true if you want them side-by-side
            });
        }

        await interaction.reply({ embeds: [embed] });
    },
};