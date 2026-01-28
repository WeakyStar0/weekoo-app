const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../../utils/db');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('shop')
        .setDescription('Browse the Weekoo Store.'),
    async execute(interaction) {
        const res = await db.query('SELECT * FROM items WHERE is_locked = FALSE ORDER BY price DESC');
        
        const embed = new EmbedBuilder()
            .setColor('#00FF00')
            .setTitle('🛒 Weekoo General Store')
            .setDescription('Use `/buy <item_name>` to purchase something!')
            .setTimestamp();

        res.rows.forEach(item => {
            embed.addFields({ 
                name: `${item.emoji} ${item.name} (${item.rarity})`, 
                value: `**Price:** 🪙 ${item.price.toLocaleString()}\n*${item.description}*`, 
                inline: false 
            });
        });

        await interaction.reply({ embeds: [embed] });
    },
};