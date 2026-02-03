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
                    { name: 'Materials', value: 'material' },
                    { name: 'Consumables', value: 'consumable' },
                    { name: 'Valuables', value: 'valuable' },
                    { name: 'Equipment/Rings', value: 'ring' }
                )),

    async execute(interaction) {
        const ITEMS_PER_PAGE = 5;
        let currentPage = 0;
        let currentSort = 'price';
        const filterType = interaction.options.getString('type');

        // fetch items from DB with optional filtering and sorting
        const getItems = async (sortType) => {
            let query = 'SELECT * FROM items WHERE is_locked = FALSE';
            let params = [];

            // filter
            if (filterType) {
                query += ' AND item_type = $1';
                params.push(filterType);
            }

            // sort
            if (sortType === 'price') query += ' ORDER BY price DESC';
            else if (sortType === 'type') query += ' ORDER BY item_type ASC';
            else if (sortType === 'rarity') {
                query += ` ORDER BY CASE rarity 
                    WHEN 'Legendary' THEN 1 
                    WHEN 'Epic' THEN 2 
                    WHEN 'Rare' THEN 3 
                    WHEN 'Uncommon' THEN 4 
                    ELSE 5 END ASC`;
            }

            const res = await db.query(query, params);
            return res.rows;
        };

        let items = await getItems(currentSort);

        const generateEmbed = (page) => {
            const totalPages = Math.ceil(items.length / ITEMS_PER_PAGE) || 1;
            const start = page * ITEMS_PER_PAGE;
            const end = start + ITEMS_PER_PAGE;
            const currentItems = items.slice(start, end);

            const embed = new EmbedBuilder()
                .setColor(filterType ? '#3498DB' : '#00FF00')
                .setTitle(filterType ? `🛒 Shop: ${filterType.toUpperCase()}S` : '🛒 Weekoo General Store')
                .setDescription(`Sorting by: **${currentSort.toUpperCase()}**\nUse \`/buy <item>\` to purchase.`)
                .setFooter({ text: `Page ${page + 1} of ${totalPages} • Total Items: ${items.length}` });

            if (currentItems.length === 0) {
                embed.setDescription(`No items found for the category: **${filterType}**.`);
            } else {
                currentItems.forEach(item => {
                    let statInfo = '';
                    if (item.item_type === 'weapon') statInfo = `**Stat:** +${item.main_stat_value} DMG`;
                    else if (item.item_type === 'armor') statInfo = `**Stat:** +${item.main_stat_value} DEF`;
                    else if (item.item_type === 'pickaxe') statInfo = `**Stat:** +${item.main_stat_value} Luck`;
                    else if (item.item_type === 'trinket') statInfo = `**Stat:** +${item.main_stat_value}% ${item.stat_modifier_type}`;

                    embed.addFields({
                        name: `${item.emoji} ${item.name} [${item.rarity}]`,
                        value: `**Price:** <:weekoin:1465807554927132883> ${item.price.toLocaleString()}\n${statInfo}\n*${item.description}*`,
                        inline: false
                    });
                });
            }
            return embed;
        };

        const generateRows = (page) => {
            const totalPages = Math.ceil(items.length / ITEMS_PER_PAGE) || 1;
            const rows = [];

            const navRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('prev')
                    .setLabel('⬅️')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(page === 0),
                new ButtonBuilder()
                    .setCustomId('next')
                    .setLabel('➡️')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(page >= totalPages - 1)
            );
            rows.push(navRow);

            if (items.length > 1) {
                const sortRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('sort_price').setLabel('Price').setStyle(currentSort === 'price' ? ButtonStyle.Primary : ButtonStyle.Secondary),
                    new ButtonBuilder().setCustomId('sort_rarity').setLabel('Rarity').setStyle(currentSort === 'rarity' ? ButtonStyle.Primary : ButtonStyle.Secondary)
                );
                rows.push(sortRow);
            }

            return rows;
        };

        const response = await interaction.reply({
            embeds: [generateEmbed(currentPage)],
            components: generateRows(currentPage)
        });

        const collector = response.createMessageComponentCollector({ time: 120000 });

        collector.on('collect', async i => {
            if (i.user.id !== interaction.user.id) {
                return i.reply({ content: "Run /shop to browse the store!", flags: [MessageFlags.Ephemeral] });
            }

            if (i.customId === 'next') currentPage++;
            if (i.customId === 'prev') currentPage--;

            if (i.customId.startsWith('sort_')) {
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