const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const db = require('../../utils/db');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('shop')
        .setDescription('Browse the Weekoo Store.')
        .addStringOption(option =>
            option.setName('type')
                .setDescription('Filter by item type')
                .setRequired(false)
                .addChoices(
                    { name: '⚔️ Weapons', value: 'weapon' },
                    { name: '⛏️ Pickaxes', value: 'pickaxe' },
                    { name: '🛡️ Armor', value: 'armor' },
                    { name: '🍎 Consumables', value: 'consumable' },
                    { name: '📦 Materials', value: 'material' },
                    { name: '💍 Trinkets', value: 'trinket' }
                )),

    async execute(interaction) {
        const ITEMS_PER_PAGE = 5;
        let currentPage = 0;
        let currentSort = 'price'; // price, rarity, power, name
        const filterType = interaction.options.getString('type');

        const getItems = async (sortType) => {
            let query = 'SELECT * FROM items WHERE is_locked = FALSE';
            let params = [];

            if (filterType) {
                query += ' AND item_type = $1';
                params.push(filterType);
            }

            if (sortType === 'price') query += ' ORDER BY price DESC';
            else if (sortType === 'name') query += ' ORDER BY name ASC';
            else if (sortType === 'power') query += ' ORDER BY main_stat_value DESC';
            else if (sortType === 'rarity') {
                query += ` ORDER BY CASE rarity 
                    WHEN 'Legendary' THEN 1 WHEN 'Epic' THEN 2 
                    WHEN 'Rare' THEN 3 WHEN 'Uncommon' THEN 4 
                    ELSE 5 END ASC`;
            }
            
            const res = await db.query(query, params);
            return res.rows;
        };

        let items = await getItems(currentSort);

        const generateEmbed = (page) => {
            const totalPages = Math.ceil(items.length / ITEMS_PER_PAGE) || 1;
            const start = page * ITEMS_PER_PAGE;
            const currentItems = items.slice(start, start + ITEMS_PER_PAGE);

            const embed = new EmbedBuilder()
                .setColor('#2b2d31')
                .setTitle(filterType ? `🛒 ${filterType.toUpperCase()} STORE` : '🛒 WEEKOO GENERAL STORE')
                .setDescription(`Sorted by: \`${currentSort.toUpperCase()}\` \nUse \`/buy item:<name>\` to purchase.`)
                .setFooter({ text: `Page ${page + 1} / ${totalPages} • ${items.length} Items in stock` });

            if (currentItems.length === 0) {
                embed.setDescription('No items found in this category.');
            } else {
                currentItems.forEach(item => {
                    let statLabel = '';
                    if (item.item_type === 'weapon') statLabel = `⚔️ DMG: +${item.main_stat_value}`;
                    else if (item.item_type === 'armor') statLabel = `🛡️ DEF: +${item.main_stat_value}`;
                    else if (item.item_type === 'pickaxe') statLabel = `🍀 LCK: +${item.main_stat_value}`;
                    else if (item.item_type === 'trinket') statLabel = `🔮 ${item.stat_modifier_type.toUpperCase()}: +${item.main_stat_value}%`;
                    else statLabel = `📦 Type: ${item.item_type}`;

                    const rarityEmoji = {
                        'Legendary': '🟠', 'Epic': '🟣', 'Rare': '🔵', 'Uncommon': '🟢', 'Common': '⚪'
                    }[item.rarity] || '⚪';

                    embed.addFields({
                        name: `${rarityEmoji} ${item.name}`,
                        value: `> \`${statLabel}\` — **Price:** 🪙 \`${item.price.toLocaleString()}\`\n> *${item.description}*`,
                        inline: false
                    });
                });
            }
            return embed;
        };

        const generateRows = (page) => {
            const totalPages = Math.ceil(items.length / ITEMS_PER_PAGE) || 1;
            
            const navRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('prev').setLabel('⬅️').setStyle(ButtonStyle.Secondary).setDisabled(page === 0),
                new ButtonBuilder().setCustomId('next').setLabel('➡️').setStyle(ButtonStyle.Secondary).setDisabled(page >= totalPages - 1)
            );

            const sortRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('sort_price').setLabel('🪙 Price').setStyle(currentSort === 'price' ? ButtonStyle.Primary : ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('sort_power').setLabel('⚡ Power').setStyle(currentSort === 'power' ? ButtonStyle.Primary : ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('sort_rarity').setLabel('💎 Rarity').setStyle(currentSort === 'rarity' ? ButtonStyle.Primary : ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('sort_name').setLabel('📝 A-Z').setStyle(currentSort === 'name' ? ButtonStyle.Primary : ButtonStyle.Secondary)
            );

            return [navRow, sortRow];
        };

        const response = await interaction.reply({
            embeds: [generateEmbed(currentPage)],
            components: generateRows(currentPage)
        });

        const collector = response.createMessageComponentCollector({ time: 300000 }); // 5 minute

        collector.on('collect', async i => {
            if (i.user.id !== interaction.user.id) {
                return i.reply({ content: "Run /shop to browse yourself!", flags: [MessageFlags.Ephemeral] });
            }

            if (i.customId === 'next') currentPage++;
            else if (i.customId === 'prev') currentPage--;
            else if (i.customId.startsWith('sort_')) {
                currentSort = i.customId.split('_')[1];
                items = await getItems(currentSort);
                currentPage = 0; 
            }

            await i.update({
                embeds: [generateEmbed(currentPage)],
                components: generateRows(currentPage)
            });
        });

        collector.on('end', () => {
            interaction.editReply({ components: [] }).catch(() => null);
        });
    },
};